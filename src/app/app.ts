// thread-core application layer: the 8 user operations + system operations.
// Every surface (MCP tools, REST, Slack, agents) is a thin adapter over these functions.
// I/O happens only through ports (Store, Clock, CalendarConnector, ServiceProvider).
import type { z } from "zod";
import type {
  Condition, Confirmation, Evidence, Handoff, HouseholdState, Message, Quote, Responsibility, Strength, Thread, ThreadEvent,
} from "../model/schemas.ts";
import { OpError, type ErrorCode, type OpResult } from "../model/errors.ts";
import { fmtDay, fmtMoney, fmtRange, fmtTime, minutesBetween, ms, toUtc, addMinutes } from "../model/time.ts";
import { clone, nextId, stableStringify } from "../model/util.ts";
import { StoreConflictError, type CalendarConnector, type Clock, type ServiceProvider, type Store } from "../ports.ts";
import { createRegistry, householdTypes, type ResponsibilityType } from "../registry/types.ts";
import { buildThread, makeEnv, recomputeWindows } from "../engine/derive.ts";
import { Seed, seedHousehold } from "../engine/seed.ts";
import { assess, buildGraph, reachedResponsibilities, startNodes, traverse, type Change } from "../engine/impact.ts";
import { describe, rankCandidates, type Candidate, type Ranking } from "../engine/candidates.ts";
import { buildReceipt } from "../engine/policy.ts";
import { deriveStatus, evidenceProblem, isSatisfied } from "../engine/status.ts";
import { decide } from "../engine/autonomy.ts";
import * as io from "./io.ts";

export interface ThreadAppConfig {
  store: Store;
  clock: Clock;
  types?: ResponsibilityType[]; // default: householdTypes
  providers?: ServiceProvider[];
  calendar?: CalendarConnector;
}

interface Ctx {
  state: HouseholdState;
  now: string;
  actor: string; // person id or "system"
  principal: io.Principal;
  events: ThreadEvent[];
}

const ACTIVE_RESP = new Set(["OWNED", "ACCEPTED"]);

export function createThreadApp(cfg: ThreadAppConfig) {
  const reg = createRegistry(cfg.types ?? householdTypes);
  const providers = cfg.providers ?? [];

  // ---------- small helpers ----------
  const fail = (code: ErrorCode, message: string, unresolved: string[] = [], next_steps: string[] = []) =>
    new OpError(code, message, unresolved, next_steps);
  const name = (s: HouseholdState, id: string) =>
    providers.find((p) => p.id === id)?.name ?? s.household.persons.find((p) => p.id === id)?.name ?? (id === "system" ? "THREAD" : id);

  function emit(ctx: Ctx, type: ThreadEvent["type"], data: Record<string, unknown>, thread_id?: string): void {
    const seq = (ctx.state.counters["ev"] ?? 0) + 1;
    ctx.state.counters["ev"] = seq;
    ctx.events.push({ seq, at: ctx.now, type, actor: ctx.actor, ...(thread_id ? { thread_id } : {}), data });
  }
  function message(ctx: Ctx, to: string, kind: Message["kind"], text: string, refs: Partial<Pick<Message, "thread_id" | "handoff_id" | "confirmation_id">> = {}): void {
    ctx.state.inbox.push({ id: nextId(ctx.state, "msg"), to, at: ctx.now, kind, text, ...refs });
    emit(ctx, "NOTIFICATION_SENT", { to, kind }, refs.thread_id);
  }
  function addEvidence(ctx: Ctx, t: Thread, condition_id: string, strength: Strength, actor: string, source: Evidence["source"],
    observed_at = ctx.now, authorized = true, note?: string): Evidence {
    const e: Evidence = {
      id: nextId(ctx.state, "evd"), thread_id: t.id, condition_id, strength, actor, source, at: ctx.now, observed_at, authorized,
      ...(note !== undefined ? { note } : {}),
    };
    ctx.state.evidence.push(e);
    emit(ctx, "EVIDENCE_RECORDED", { condition_id, strength, source, authorized }, t.id);
    return e;
  }
  const evidenceOf = (s: HouseholdState, t: Thread) => s.evidence.filter((e) => e.thread_id === t.id);
  const condsOf = (t: Thread, r: Responsibility) => t.conditions.filter((c) => c.responsibility_id === r.id);
  const typeOf = (r: Responsibility) => {
    const ty = reg.get(r.type);
    if (!ty) throw fail("INVALID_STATE", `Responsibility type ${r.type} is not registered.`);
    return ty;
  };
  const visible = (ctx: Ctx, t: Thread) =>
    ctx.principal.kind === "system" ||
    t.participants.includes(ctx.actor) || t.created_by === ctx.actor || t.responsibilities.some((r) => r.owner === ctx.actor);
  function threadFor(ctx: Ctx, id: string): Thread {
    const t = ctx.state.threads.find((x) => x.id === id);
    if (!t || !visible(ctx, t)) throw fail("NOT_FOUND", `No thread ${id} that you can see.`, [], ["Ask what's on this weekend to see your threads."]);
    return t;
  }
  function respFor(t: Thread, id: string): Responsibility {
    const r = t.responsibilities.find((x) => x.id === id);
    if (!r) throw fail("NOT_FOUND", `No responsibility ${id} in ${t.title}.`);
    return r;
  }
  const person = (ctx: Ctx) => {
    if (ctx.principal.kind !== "person") throw fail("FORBIDDEN", "This operation needs a signed-in person.");
    return ctx.actor;
  };
  const system = (ctx: Ctx) => {
    if (ctx.principal.kind !== "system") throw fail("FORBIDDEN", "Only the system (watcher/connectors) can do this.");
  };
  async function quotesFor(ctx: Ctx, t: Thread, r: Responsibility): Promise<Quote[]> {
    const out: Quote[] = [];
    for (const p of providers) {
      if (!p.handles.includes(r.type)) continue;
      const q = await p.query({ thread: t, responsibility: r, now: ctx.now });
      if (q) out.push(q);
    }
    return out;
  }
  const rank = (ctx: Ctx, t: Thread, r: Responsibility, quotes: Quote[]): Ranking => rankCandidates(ctx.state, reg, t, r, quotes, ctx.now);

  /** Re-derives every thread status; emits STATUS_CHANGED; updates why on PLAN_SECURED/RESOLVED transitions. */
  function refresh(ctx: Ctx): void {
    for (const t of ctx.state.threads) {
      const s = deriveStatus(t, evidenceOf(ctx.state, t), ctx.now);
      if (s === t.status) continue;
      emit(ctx, "STATUS_CHANGED", { from: t.status, to: s }, t.id);
      if (s === "PLAN_SECURED") {
        const open = t.conditions.filter((c) => c.phase === "OUTCOME").map((c) => c.label);
        t.why = [open.length ? `Plan secured. Still to come: ${open.join(", ")}.` : "Plan secured."];
      }
      if (s === "RESOLVED") {
        t.why = [`Done: ${t.conditions.map((c) => c.label).join(", ")}.`];
        message(ctx, t.created_by, "NOTICE", `${t.title} is done.`, { thread_id: t.id });
      }
      t.status = s;
    }
  }

  // ---------- views ----------
  function threadView(s: HouseholdState, t: Thread): io.ThreadView {
    const env = makeEnv(s);
    const ev = evidenceOf(s, t);
    return {
      thread_id: t.id, title: t.title, objective: t.objective, status: t.status, autonomy: t.autonomy, deadline: t.deadline,
      event: { ...t.event, place_name: env.placeName(t.event.place) },
      ...(t.beneficiary ? { beneficiary: { id: t.beneficiary, name: env.personName(t.beneficiary) } } : {}),
      participants: t.participants.map((id) => ({ id, name: env.personName(id) })),
      responsibilities: t.responsibilities.map((r) => ({
        id: r.id, type: r.type, label: reg.get(r.type)?.label(r) ?? r.type, owner: r.owner, owner_name: name(s, r.owner),
        owner_kind: r.owner_kind, status: r.status, window: r.window,
        ...(r.risk ? { risk: { severity: r.risk.severity, text: r.risk.text } } : {}),
      })),
      conditions: t.conditions.map((c) => {
        const good = ev.filter((e) => e.condition_id === c.id && evidenceProblem(c, e) === null);
        const last = good[good.length - 1];
        return {
          id: c.id, label: c.label, phase: c.phase, min_strength: c.min_strength, satisfied: !!last,
          ...(last ? { evidence: { strength: last.strength, actor: last.actor, at: last.observed_at } } : {}),
        };
      }),
      why: t.why, history: t.history,
    };
  }
  const handoffView = (h: Handoff) => ({
    id: h.id, thread_id: h.thread_id, responsibility_id: h.responsibility_id, from: h.from, to: h.to, to_kind: h.to_kind, status: h.status,
  });
  const requiresConfirmation = (c: Confirmation) => ({
    confirmation_id: c.id, kind: c.kind, summary: c.summary,
    ...(c.amount_cents !== undefined ? { amount_cents: c.amount_cents } : {}), ...(c.currency ? { currency: c.currency } : {}),
  });

  // ---------- the operation runner ----------
  async function run<S extends z.ZodType, O>(op: string, principalRaw: unknown, schema: S, raw: unknown, mutating: boolean,
    body: (ctx: Ctx, input: z.infer<S>) => Promise<O>): Promise<OpResult<O>> {
    const pp = io.Principal.safeParse(principalRaw);
    if (!pp.success) return { ok: false, error: fail("FORBIDDEN", "Unknown principal.").body };
    const parsed = schema.safeParse(raw ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(input)"}: ${i.message}`).join("; ");
      return { ok: false, error: fail("VALIDATION_FAILED", `Invalid input. ${issues}`.slice(0, 400), [], ["Fix the input and try again."]).body };
    }
    const input = parsed.data as z.infer<S> & { idempotency_key?: string };
    const principal = pp.data;
    for (let attempt = 0; attempt < 2; attempt++) {
      const loaded = await cfg.store.load(principal.household_id);
      if (!loaded) return { ok: false, error: fail("NOT_FOUND", "Unknown household.").body };
      const ctx: Ctx = {
        state: loaded.state, now: toUtc(cfg.clock.now()), principal, events: [],
        actor: principal.kind === "person" ? principal.person_id : "system",
      };
      try {
        if (principal.kind === "person" && !ctx.state.household.persons.some((p) => p.id === ctx.actor && p.has_account)) {
          throw fail("FORBIDDEN", "Unknown person.");
        }
        const key = mutating && input.idempotency_key ? `${op}:${ctx.actor}:${input.idempotency_key}` : undefined;
        if (key) {
          const hit = ctx.state.idempotency.find((k) => k.key === key);
          if (hit) {
            if (hit.input === stableStringify(input)) return hit.result as OpResult<O>;
            throw fail("IDEMPOTENCY_CONFLICT", "This idempotency_key was already used with different input.");
          }
        }
        const data = await body(ctx, input);
        if (!mutating) return { ok: true, data };
        refresh(ctx);
        const result: OpResult<O> = { ok: true, data };
        if (key) {
          ctx.state.idempotency = ctx.state.idempotency.filter((k) => minutesBetween(k.at, ctx.now) < 24 * 60);
          ctx.state.idempotency.push({ key, at: ctx.now, input: stableStringify(input), result: clone(result) });
        }
        await cfg.store.commit(principal.household_id, ctx.state, loaded.version, ctx.events);
        return result;
      } catch (e) {
        if (e instanceof StoreConflictError) continue;
        if (e instanceof OpError) return { ok: false, error: e.body };
        return { ok: false, error: fail("CONNECTOR_FAILED", "A connected service failed, so nothing was changed.", [], ["Try again in a moment."]).body };
      }
    }
    return { ok: false, error: fail("STORE_CONFLICT", "Too many concurrent changes; please retry.").body };
  }

  // ---------- shared flows ----------
  /** Applies a change, assesses impact, executes the autonomy matrix. Used by reportChange and ingestSignal. */
  async function applyAndAssess(ctx: Ctx, change: Change): Promise<io.ReportChangeOut> {
    const s = ctx.state;
    const env = makeEnv(s);
    const before = clone(s);
    let c: Change = change;
    switch (change.type) {
      case "PERSON_UNAVAILABLE":
      case "PERSON_BUSY": {
        const p = s.household.persons.find((x) => x.id === change.person);
        if (!p) throw fail("VALIDATION_FAILED", `Unknown person ${change.person}.`);
        c = { ...change, start: toUtc(change.start), end: toUtc(change.end) };
        if (ms(c.start) >= ms(c.end)) throw fail("VALIDATION_FAILED", "The change must end after it starts.");
        s.busy.push({
          id: nextId(s, "busy"), person: p.id, start: c.start, end: c.end,
          ...(change.type === "PERSON_BUSY" ? { source_id: change.source_id } : {}),
          withheld_label: `${p.name}'s reason for being unavailable`,
        });
        break;
      }
      case "TRAVEL_TIME_CHANGED":
        if (!s.household.places.some((p) => p.id === change.place)) throw fail("VALIDATION_FAILED", `Unknown place ${change.place}.`);
        s.travel.push({ place: change.place, minutes: change.minutes, cause: change.cause, source_id: change.source_id, at: ctx.now });
        break;
      case "EVENT_MOVED": {
        const t = threadFor(ctx, change.thread_id);
        const delta = minutesBetween(t.event.start, toUtc(change.new_start));
        t.event = { ...t.event, start: addMinutes(t.event.start, delta), end: addMinutes(t.event.end, delta) };
        t.deadline = addMinutes(t.deadline, delta);
        for (const cond of t.conditions) if (cond.window) cond.window = { start: addMinutes(cond.window.start, delta), end: addMinutes(cond.window.end, delta) };
        c = { ...change, new_start: toUtc(change.new_start) };
        break;
      }
    }
    recomputeWindows(s, reg);
    const reached = traverse(buildGraph(s, reg), startNodes(c, s));
    const quotes = new Map<string, Quote[]>();
    for (const [t, r] of reachedResponsibilities(s, reached)) quotes.set(`${t.id}/${r.id}`, await quotesFor(ctx, t, r));
    const q = (t: Thread, r: Responsibility) => quotes.get(`${t.id}/${r.id}`) ?? [];
    const impacts = assess(before, s, reg, c, reached, ctx.now, (t, r) => rank(ctx, t, r, q(t, r)).candidates.length === 0);
    const { type, ...rest } = c;
    emit(ctx, ctx.principal.kind === "system" ? "SIGNAL_INGESTED" : "CHANGE_REPORTED", { type, ...rest });

    const proposals: io.ReportChangeOut["proposals"] = [];
    const automatic: io.ReportChangeOut["automatic_actions"] = [];
    for (const ti of impacts) {
      const t = s.threads.find((x) => x.id === ti.thread_id)!;
      for (const ri of ti.responsibilities) {
        const r = respFor(t, ri.responsibility_id);
        const label = typeOf(r).label(r);
        emit(ctx, "IMPACT_COMPUTED", { responsibility_id: r.id, severity: ri.severity }, t.id);
        if (ri.severity === "HIGH" || ri.severity === "CRITICAL") {
          r.risk = {
            severity: ri.severity, code: ri.after.code ?? "OWNER_UNAVAILABLE", text: ri.after.text ?? "",
            ...(ri.after.cause_busy_id ? { cause_busy_id: ri.after.cause_busy_id } : {}),
            prev_status: r.risk?.prev_status ?? r.status,
            no_candidate: rank(ctx, t, r, q(t, r)).candidates.length === 0,
          };
          if (ACTIVE_RESP.has(r.status)) r.status = "AT_RISK";
        } else if (ri.severity === "MEDIUM" && ri.after.plan_drift) {
          const cid = typeOf(r).block?.condition_id;
          const cond = t.conditions.find((x) => x.id === cid);
          if (cond) cond.valid_from = ctx.now;
          r.risk = { severity: "MEDIUM", code: "PLAN_DRIFT", text: ti.why.join(" "), prev_status: r.risk?.prev_status ?? r.status, no_candidate: false };
          if (ACTIVE_RESP.has(r.status)) r.status = "AT_RISK";
        }
        for (const action of decide(ri.severity, t.autonomy)) {
          if (action === "PROPOSE_HANDOFF" || action === "SEND_HANDOFF") {
            const ranking = rank(ctx, t, r, q(t, r));
            const top = ranking.candidates[0];
            if (action === "SEND_HANDOFF" && top?.kind === "person" && r.status !== "HANDOFF_PENDING") {
              await startHandoff(ctx, t, r, top, "system");
              const text = `Asked ${top.name} to take ${label}.`;
              automatic.push({ thread_id: t.id, responsibility_id: r.id, action: "SEND_HANDOFF", text });
              emit(ctx, "AUTONOMOUS_ACTION", { action: "SEND_HANDOFF", responsibility_id: r.id }, t.id);
            } else {
              proposals.push({ thread_id: t.id, responsibility_id: r.id, recommended: top ?? null, candidates: ranking.candidates, excluded: ranking.excluded });
            }
            ti.why.push(top ? `Best option: ${describe(top)}.` : "Nobody can take it yet; change the plan or ask someone outside the household.");
          } else if (action === "ADJUST_PLAN") {
            await adjustPlan(ctx, t, r, change, ti.why, automatic);
          } else if (action === "SURFACE" || action === "NOTIFY_CREATOR") {
            message(ctx, t.created_by, "NOTICE", `${t.title}: ${ti.why.join(" ")}`, { thread_id: t.id });
            automatic.push({ thread_id: t.id, responsibility_id: r.id, action, text: `Told ${name(s, t.created_by)}.` });
          }
        }
      }
      t.why = [...ti.why];
    }
    refresh(ctx);
    return {
      threads: impacts.map((ti) => ({
        thread_id: ti.thread_id, title: ti.title, severity: ti.severity,
        status: s.threads.find((x) => x.id === ti.thread_id)!.status, why: ti.why,
        affected: ti.responsibilities.map((x) => ({ responsibility_id: x.responsibility_id, severity: x.severity })),
      })),
      proposals,
      automatic_actions: automatic,
    };
  }

  /** COORDINATE/ACT + MEDIUM plan drift: move the owner-consented block, verify, re-evidence, notify. */
  async function adjustPlan(ctx: Ctx, t: Thread, r: Responsibility, change: Change, why: string[], automatic: io.ReportChangeOut["automatic_actions"]) {
    const blockType = typeOf(r).block;
    if (!r.block || !blockType || !cfg.calendar || r.owner_kind !== "person") return;
    const env = makeEnv(ctx.state);
    let ok = false;
    try {
      await cfg.calendar.moveBlock({ person_id: r.owner, block_id: r.block.block_id, start: r.window.start, end: r.window.end });
      ok = await cfg.calendar.verifyBlock({ person_id: r.owner, block_id: r.block.block_id, start: r.window.start, end: r.window.end });
    } catch {
      ok = false;
    }
    if (!ok) {
      message(ctx, t.created_by, "NOTICE", `Couldn't update ${env.personName(r.owner)}'s calendar automatically. ${why.join(" ")}`, { thread_id: t.id });
      return;
    }
    r.block = { block_id: r.block.block_id, start: r.window.start, end: r.window.end };
    addEvidence(ctx, t, blockType.condition_id, "SYSTEM_VERIFIED", "system", "CONNECTOR");
    r.status = r.risk?.prev_status ?? r.status;
    delete r.risk;
    const leave = fmtTime(r.window.start, env.tz);
    const text = `Moved ${env.personName(r.owner)}'s "${blockType.title(t, env)}" to ${leave} automatically (within your ${t.autonomy} setting).`;
    t.history.push({ at: ctx.now, text, automatic: true });
    const cause = change.type === "TRAVEL_TIME_CHANGED" ? change.cause : "Plan change";
    message(ctx, r.owner, "NOTICE", `${cause.charAt(0).toUpperCase()}${cause.slice(1)}: leave at ${leave} instead.`, { thread_id: t.id });
    automatic.push({ thread_id: t.id, responsibility_id: r.id, action: "ADJUST_PLAN", text });
    emit(ctx, "AUTONOMOUS_ACTION", { action: "ADJUST_PLAN", responsibility_id: r.id }, t.id);
  }

  /** Creates a handoff to a person (PENDING) or a service (PENDING_CONFIRMATION + TRANSACT confirmation). */
  async function startHandoff(ctx: Ctx, t: Thread, r: Responsibility, cand: Candidate, requestedBy: string) {
    const s = ctx.state;
    const env = makeEnv(s);
    const hid = nextId(s, "ho");
    const causes = r.risk?.cause_busy_id ? [r.risk.cause_busy_id] : [];
    const label = typeOf(r).label(r);
    const base = { id: hid, thread_id: t.id, responsibility_id: r.id, from: r.owner, to: cand.id, requested_by: requestedBy, requested_at: ctx.now };
    if (cand.kind === "person") {
      const receipt = buildReceipt(s, reg, t, r.type, cand.id, "person", hid, causes, ctx.now);
      const h: Handoff = { ...base, to_kind: "person", status: "PENDING", receipt };
      s.handoffs.push(h);
      r.status = "HANDOFF_PENDING";
      const facts = receipt.shared.map((x) => `${x.label}: ${x.value}`).join("; ");
      message(ctx, cand.id, "HANDOFF_REQUEST", `${name(s, requestedBy)} asks you to take ${label} for ${t.title}. ${facts}.`, { thread_id: t.id, handoff_id: hid });
      emit(ctx, "HANDOFF_REQUESTED", { handoff_id: hid, to: cand.id, to_kind: "person" }, t.id);
      return { h, receipt, cf: undefined };
    }
    const quote = cand.quote;
    if (!quote) throw fail("INVALID_STATE", "Service candidate has no quote.");
    const slot = `${fmtDay(quote.slot.start, env.tz)} ${fmtRange(quote.slot, env.tz)}`;
    const extra = [
      { key: "order_ref", label: "Order reference", value: `ref_${hid}` },
      { key: "slot", label: "Delivery slot", value: slot },
    ];
    const receipt = buildReceipt(s, reg, t, r.type, cand.id, "service", hid, causes, ctx.now, extra);
    const h: Handoff = { ...base, to_kind: "service", status: "PENDING_CONFIRMATION", receipt };
    const cf: Confirmation = {
      id: nextId(s, "cf"), kind: "TRANSACT", principal: t.created_by, thread_id: t.id, responsibility_id: r.id, handoff_id: hid,
      summary: `${cand.name}, ${slot}, ${fmtMoney(quote.amount_cents)}`, amount_cents: quote.amount_cents, currency: "USD", quote,
      status: "PENDING", created_at: ctx.now,
    };
    s.handoffs.push(h);
    s.confirmations.push(cf);
    r.status = "HANDOFF_PENDING";
    if (requestedBy !== t.created_by) {
      message(ctx, t.created_by, "CONFIRMATION_REQUEST", `Approve ${cf.summary}?`, { thread_id: t.id, confirmation_id: cf.id });
    }
    emit(ctx, "CONFIRMATION_REQUESTED", { confirmation_id: cf.id, handoff_id: hid, amount_cents: quote.amount_cents }, t.id);
    return { h, receipt, cf };
  }

  async function createBlockFor(ctx: Ctx, t: Thread, r: Responsibility, personId: string, ref: string) {
    const bt = typeOf(r).block;
    if (!bt || !cfg.calendar) return undefined;
    const env = makeEnv(ctx.state);
    const { block_id } = await cfg.calendar.createBlock({ person_id: personId, title: bt.title(t, env), start: r.window.start, end: r.window.end, ref });
    const ok = await cfg.calendar.verifyBlock({ person_id: personId, block_id, start: r.window.start, end: r.window.end });
    return { block_id, ok, condition_id: bt.condition_id };
  }

  // ---------- public API ----------
  return {
    registry: reg,

    /** Seeds a new household (system setup; demo reset uses it on an empty store). */
    async initHousehold(raw: unknown): Promise<OpResult<z.infer<typeof io.InitHouseholdOut>>> {
      const parsed = Seed.safeParse(raw);
      if (!parsed.success) return { ok: false, error: fail("VALIDATION_FAILED", `Invalid seed: ${parsed.error.issues[0]?.path.join(".")}`).body };
      const seed = parsed.data;
      if (await cfg.store.load(seed.household.id)) return { ok: false, error: fail("INVALID_STATE", "Household already exists.").body };
      try {
        const state = seedHousehold(seed, reg);
        const ctx: Ctx = { state, now: toUtc(cfg.clock.now()), actor: "system", principal: { kind: "system", household_id: seed.household.id }, events: [] };
        emit(ctx, "HOUSEHOLD_INITIALIZED", { persons: seed.household.persons.length });
        for (const t of state.threads) emit(ctx, "THREAD_CREATED", { title: t.title }, t.id);
        refresh(ctx);
        await cfg.store.commit(seed.household.id, state, 0, ctx.events);
        return { ok: true, data: { household_id: seed.household.id, threads: state.threads.length } };
      } catch (e) {
        if (e instanceof OpError) return { ok: false, error: e.body };
        return { ok: false, error: fail("STORE_CONFLICT", "Could not create the household.").body };
      }
    },

    createThread: (p: unknown, raw: unknown) => run("createThread", p, io.CreateThreadIn, raw, true, async (ctx, input) => {
      const me = person(ctx);
      const who = ctx.state.household.persons.find((x) => x.id === me);
      if (!who?.adult) throw fail("FORBIDDEN", "Only adults can create threads.");
      const { idempotency_key: _k, ...ti } = input;
      const { thread, evidence } = buildThread(ctx.state, reg, ti, me, ctx.now);
      ctx.state.threads.push(thread);
      ctx.state.evidence.push(...evidence);
      emit(ctx, "THREAD_CREATED", { title: thread.title }, thread.id);
      refresh(ctx);
      return { thread: threadView(ctx.state, thread) };
    }),

    listThreads: (p: unknown, raw: unknown) => run("listThreads", p, io.ListThreadsIn, raw, false, async (ctx, input) => {
      refresh(ctx);
      const env = makeEnv(ctx.state);
      const horizon = input.within_days ? addMinutes(ctx.now, input.within_days * 24 * 60) : undefined;
      const threads = ctx.state.threads
        .filter((t) => visible(ctx, t) && !t.cancelled)
        .filter((t) => !input.status || t.status === input.status)
        .filter((t) => !horizon || (ms(t.event.end) >= ms(ctx.now) && ms(t.event.start) <= ms(horizon)))
        .sort((a, b) => ms(a.event.start) - ms(b.event.start) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map((t) => ({ thread_id: t.id, title: t.title, status: t.status, when: `${fmtDay(t.event.start, env.tz)} ${fmtTime(t.event.start, env.tz)}`, deadline: t.deadline }));
      return { threads, members: ctx.state.household.persons.map((x) => ({ id: x.id, name: x.name })) };
    }),

    getThread: (p: unknown, raw: unknown) => run("getThread", p, io.GetThreadIn, raw, false, async (ctx, input) => {
      refresh(ctx);
      return { thread: threadView(ctx.state, threadFor(ctx, input.thread_id)) };
    }),

    reportChange: (p: unknown, raw: unknown) => run("reportChange", p, io.ReportChangeIn, raw, true, async (ctx, input) => {
      const me = person(ctx);
      if (input.change.type === "PERSON_UNAVAILABLE" && input.change.person !== me) {
        throw fail("FORBIDDEN", "You can only report your own availability.", [], ["Ask that person to report it."]);
      }
      if (input.change.type === "EVENT_MOVED") threadFor(ctx, input.change.thread_id);
      return applyAndAssess(ctx, input.change);
    }),

    requestHandoff: (p: unknown, raw: unknown) => run("requestHandoff", p, io.RequestHandoffIn, raw, true, async (ctx, input) => {
      const me = person(ctx);
      const s = ctx.state;
      const t = threadFor(ctx, input.thread_id);
      const r = respFor(t, input.responsibility_id);
      if (me !== t.created_by && !(r.owner_kind === "person" && r.owner === me)) {
        throw fail("FORBIDDEN", "Only the thread's creator or the current owner can hand this off.");
      }
      if (r.status === "COMPLETED" || r.status === "VERIFIED") throw fail("INVALID_STATE", "This responsibility is already done.");
      const ranking = rank(ctx, t, r, await quotesFor(ctx, t, r));
      const open = condsOf(t, r).filter((c) => !isSatisfied(c, evidenceOf(s, t))).map((c) => c.id);
      if (r.status === "HANDOFF_PENDING") {
        const h = [...s.handoffs].reverse().find((x) => x.responsibility_id === r.id && x.thread_id === t.id && (x.status === "PENDING" || x.status === "PENDING_CONFIRMATION"));
        if (h && (!input.candidate || input.candidate === h.to)) {
          const cf = s.confirmations.find((c) => c.handoff_id === h.id);
          refresh(ctx);
          return {
            handoff: handoffView(h), receipt: h.receipt, candidates: ranking.candidates, excluded: ranking.excluded,
            ...(cf ? { requires_confirmation: requiresConfirmation(cf) } : {}), thread: threadView(s, t),
          };
        }
        throw fail("INVALID_STATE", `A handoff to ${name(s, h?.to ?? "")} is already pending.`, open, ["Wait for the answer, or cancel it first."]);
      }
      let cand: Candidate | undefined;
      if (input.candidate) {
        cand = ranking.candidates.find((c) => c.id === input.candidate);
        if (!cand) {
          const ex = ranking.excluded.find((c) => c.id === input.candidate);
          if (!ex) throw fail("NOT_FOUND", `${input.candidate} can't be asked to take this.`, open);
          const top = ranking.candidates[0];
          throw fail("NOT_ELIGIBLE", `${ex.name} can't take ${typeOf(r).label(r)}: ${ex.reasons.filter((x) => !x.ok).map((x) => x.text).join(", ")}.`,
            open, top ? [`Ask ${top.name}`, "Change the plan"] : ["Change the plan"]);
        }
      } else {
        cand = ranking.candidates[0];
        if (!cand) throw fail("NO_ELIGIBLE_CANDIDATE", "Nobody can take this right now.", open, ["Change the plan", "Ask someone outside the household"]);
      }
      const { h, receipt, cf } = await startHandoff(ctx, t, r, cand, me);
      refresh(ctx);
      return {
        handoff: handoffView(h), receipt, candidates: ranking.candidates, excluded: ranking.excluded,
        ...(cf ? { requires_confirmation: requiresConfirmation(cf) } : {}), thread: threadView(s, t),
      };
    }),

    respondToHandoff: (p: unknown, raw: unknown) => run("respondToHandoff", p, io.RespondToHandoffIn, raw, true, async (ctx, input) => {
      const me = person(ctx);
      const s = ctx.state;
      const h = s.handoffs.find((x) => x.id === input.handoff_id);
      if (!h) throw fail("NOT_FOUND", `No handoff ${input.handoff_id}.`);
      if (h.to_kind !== "person" || h.to !== me) throw fail("WRONG_PRINCIPAL", `Only ${name(s, h.to)} can answer this handoff.`);
      const t = s.threads.find((x) => x.id === h.thread_id)!;
      const r = respFor(t, h.responsibility_id);
      const type = typeOf(r);
      const out = (extra: Partial<z.infer<typeof io.RespondToHandoffOut>> = {}) => {
        refresh(ctx);
        return { handoff: handoffView(h), thread: threadView(s, t), ...extra };
      };
      if (h.status === "ACCEPTED" && input.accept) return out();
      if (h.status === "DECLINED" && !input.accept) return out();
      if (h.status !== "PENDING") throw fail("INVALID_STATE", `This handoff is already ${h.status.toLowerCase()}.`);
      const requester = h.requested_by === "system" ? t.created_by : h.requested_by;
      const label = type.label(r);
      if (!input.accept) {
        h.status = "DECLINED";
        h.answered_at = ctx.now;
        r.status = r.risk ? "AT_RISK" : "OWNED";
        const decliners = s.handoffs.filter((x) => x.responsibility_id === r.id && x.thread_id === t.id && x.status === "DECLINED").map((x) => x.to);
        const next = rank(ctx, t, r, await quotesFor(ctx, t, r)).candidates.find((c) => !decliners.includes(c.id));
        message(ctx, requester, "NOTICE", `${name(s, me)} can't take ${label}. ${next ? `Next option: ${describe(next)}.` : "Nobody else is available."}`, { thread_id: t.id, handoff_id: h.id });
        emit(ctx, "HANDOFF_DECLINED", { handoff_id: h.id }, t.id);
        return out(next ? { next_candidate: next } : {});
      }
      const items = (input.confirm_items ?? []).map((item) => {
        const br = t.responsibilities.find((x) => x.type === "BRING_ITEM" && x.item === item && x.owner === me && x.owner_kind === "person");
        if (!br) throw fail("VALIDATION_FAILED", `You don't have a "${item}" to confirm in this thread.`);
        return br;
      });
      const addCal = input.add_to_calendar ?? true;
      const block = addCal ? await createBlockFor(ctx, t, r, me, `${t.id}/${r.id}/${h.id}`) : undefined; // connector first: on failure nothing changes
      r.owner = me;
      r.owner_kind = "person";
      r.status = "ACCEPTED";
      delete r.risk;
      h.status = "ACCEPTED";
      h.answered_at = ctx.now;
      if (!t.participants.includes(me)) t.participants.push(me);
      for (const c of condsOf(t, r)) c.valid_from = ctx.now;
      for (const tmpl of type.conditions(t, r).filter((x) => x.owner)) addEvidence(ctx, t, tmpl.id, "ATTESTED", me, "HANDOFF");
      for (const br of items) for (const tmpl of typeOf(br).conditions(t, br).filter((x) => x.owner)) addEvidence(ctx, t, tmpl.id, "ATTESTED", me, "HANDOFF");
      if (block) {
        r.block = { block_id: block.block_id, start: r.window.start, end: r.window.end };
        if (block.ok) addEvidence(ctx, t, block.condition_id, "SYSTEM_VERIFIED", "system", "CONNECTOR");
      }
      let confirmation: z.infer<typeof io.RequiresConfirmation> | undefined;
      if (type.block && !addCal) {
        const env = makeEnv(s);
        const cf: Confirmation = {
          id: nextId(s, "cf"), kind: "MODIFY", principal: me, thread_id: t.id, responsibility_id: r.id, handoff_id: h.id,
          summary: `Add "${type.block.title(t, env)}" ${fmtDay(r.window.start, env.tz)} ${fmtRange(r.window, env.tz)} to your calendar?`,
          status: "PENDING", created_at: ctx.now,
        };
        s.confirmations.push(cf);
        confirmation = requiresConfirmation(cf);
        emit(ctx, "CONFIRMATION_REQUESTED", { confirmation_id: cf.id, kind: "MODIFY" }, t.id);
      }
      t.history.push({ at: ctx.now, text: `${name(s, me)} accepted ${label}.`, automatic: false });
      message(ctx, requester, "NOTICE", `${name(s, me)} accepted ${label} for ${t.title}.`, { thread_id: t.id, handoff_id: h.id });
      emit(ctx, "HANDOFF_ACCEPTED", { handoff_id: h.id }, t.id);
      return out(confirmation ? { confirmation } : {});
    }),

    recordEvidence: (p: unknown, raw: unknown) => run("recordEvidence", p, io.RecordEvidenceIn, raw, true, async (ctx, input) => {
      const me = person(ctx);
      const s = ctx.state;
      const t = threadFor(ctx, input.thread_id);
      const c: Condition | undefined = t.conditions.find((x) => x.id === input.condition_id);
      if (!c) throw fail("NOT_FOUND", `No condition ${input.condition_id} in ${t.title}.`);
      const r = respFor(t, c.responsibility_id);
      const authorized = r.owner_kind === "person" && r.owner === me;
      const e = addEvidence(ctx, t, c.id, "ATTESTED", me, "TOOL", ctx.now, authorized, input.note);
      const problem = evidenceProblem(c, e);
      if (c.phase === "OUTCOME" && authorized) {
        if (problem === null && condsOf(t, r).filter((x) => x.phase === "OUTCOME").every((x) => isSatisfied(x, evidenceOf(s, t)))) r.status = "VERIFIED";
        else if (problem?.startsWith("needs")) r.status = "COMPLETED";
      }
      refresh(ctx);
      return {
        evidence: { id: e.id, condition_id: c.id, strength: e.strength, satisfied: problem === null, ...(problem ? { reason: problem } : {}) },
        remaining: t.conditions.filter((x) => !isSatisfied(x, evidenceOf(s, t))).map((x) => x.id),
        thread: threadView(s, t),
      };
    }),

    confirmAction: (p: unknown, raw: unknown) => run("confirmAction", p, io.ConfirmActionIn, raw, true, async (ctx, input) => {
      const me = person(ctx);
      const s = ctx.state;
      const cf = s.confirmations.find((x) => x.id === input.confirmation_id);
      if (!cf) throw fail("NOT_FOUND", `No confirmation ${input.confirmation_id}.`);
      if (cf.principal !== me) throw fail("WRONG_PRINCIPAL", `Only ${name(s, cf.principal)} can approve this.`);
      const t = s.threads.find((x) => x.id === cf.thread_id)!;
      const r = respFor(t, cf.responsibility_id);
      const out = () => {
        refresh(ctx);
        return { confirmation: { id: cf.id, kind: cf.kind, status: cf.status, summary: cf.summary }, thread: threadView(s, t) };
      };
      if (cf.status !== "PENDING") {
        if ((cf.status === "APPROVED") === input.approve) return out();
        throw fail("INVALID_STATE", `This was already ${cf.status.toLowerCase()}.`);
      }
      const h = s.handoffs.find((x) => x.id === cf.handoff_id);
      if (cf.kind === "TRANSACT") {
        if (!h || !cf.quote) throw fail("INVALID_STATE", "Confirmation has no order to place.");
        if (!input.approve) {
          cf.status = "REJECTED";
          cf.answered_at = ctx.now;
          h.status = "CANCELLED";
          r.status = r.risk ? "AT_RISK" : "OWNED";
          emit(ctx, "CONFIRMATION_REJECTED", { confirmation_id: cf.id }, t.id);
          return out();
        }
        const provider = providers.find((x) => x.id === cf.quote!.provider_id);
        if (!provider) throw fail("CONNECTOR_FAILED", "That service is not available now; nothing was ordered.");
        const { order_id } = await provider.act({ order_ref: `ref_${h.id}`, quote: cf.quote, shared: h.receipt.shared });
        const st = await provider.verify({ order_id, now: ctx.now });
        r.owner = provider.id;
        r.owner_kind = "service";
        r.status = "ACCEPTED";
        delete r.risk;
        r.order = { order_id, provider_id: provider.id, slot: cf.quote.slot, amount_cents: cf.quote.amount_cents };
        h.status = "ACCEPTED";
        h.answered_at = ctx.now;
        cf.status = "APPROVED";
        cf.answered_at = ctx.now;
        emit(ctx, "CONFIRMATION_APPROVED", { confirmation_id: cf.id }, t.id);
        emit(ctx, "CONNECTOR_ACTION", { provider_id: provider.id, order_id }, t.id);
        const ownerIds = new Set(typeOf(r).conditions(t, r).filter((x) => x.owner).map((x) => x.id));
        for (const c of condsOf(t, r)) {
          c.valid_from = ctx.now;
          if (ownerIds.has(c.id)) {
            c.min_strength = "SYSTEM_VERIFIED"; // a service owner must be verified by the system of record
            addEvidence(ctx, t, c.id, "SYSTEM_VERIFIED", "system", "CONNECTOR");
          } else if (c.phase === "OUTCOME" && st.state === "DELIVERED") {
            addEvidence(ctx, t, c.id, "SYSTEM_VERIFIED", "system", "CONNECTOR", toUtc(st.delivered_at ?? ctx.now));
          }
        }
        t.history.push({ at: ctx.now, text: `Ordered ${cf.summary}.`, automatic: false });
        return out();
      }
      // MODIFY: add the commitment block to the approver's own calendar
      if (!input.approve) {
        cf.status = "REJECTED";
        cf.answered_at = ctx.now;
        emit(ctx, "CONFIRMATION_REJECTED", { confirmation_id: cf.id }, t.id);
        return out();
      }
      const block = await createBlockFor(ctx, t, r, me, `${t.id}/${r.id}/${cf.id}`);
      if (block) {
        r.block = { block_id: block.block_id, start: r.window.start, end: r.window.end };
        if (block.ok) addEvidence(ctx, t, block.condition_id, "SYSTEM_VERIFIED", "system", "CONNECTOR");
      }
      cf.status = "APPROVED";
      cf.answered_at = ctx.now;
      emit(ctx, "CONFIRMATION_APPROVED", { confirmation_id: cf.id }, t.id);
      return out();
    }),

    ingestSignal: (p: unknown, raw: unknown) => run("ingestSignal", p, io.IngestSignalIn, raw, true, async (ctx, input) => {
      system(ctx);
      if (ctx.state.seen_sources.includes(input.signal.source_id)) {
        return { duplicate: true, threads: [], proposals: [], automatic_actions: [] };
      }
      ctx.state.seen_sources.push(input.signal.source_id);
      return { duplicate: false, ...(await applyAndAssess(ctx, input.signal)) };
    }),

    tick: (p: unknown, raw: unknown) => run("tick", p, io.TickIn, raw, true, async (ctx) => {
      system(ctx);
      const s = ctx.state;
      for (const t of s.threads) {
        if (t.cancelled) continue;
        for (const r of t.responsibilities) {
          if (r.owner_kind !== "service" || !r.order) continue;
          const open = condsOf(t, r).filter((c) => c.phase === "OUTCOME" && !isSatisfied(c, evidenceOf(s, t)));
          if (open.length === 0) continue;
          const provider = providers.find((x) => x.id === r.order!.provider_id);
          if (!provider) continue;
          const st = await provider.verify({ order_id: r.order.order_id, now: ctx.now });
          if (st.state !== "DELIVERED") continue;
          for (const c of open) addEvidence(ctx, t, c.id, "SYSTEM_VERIFIED", "system", "CONNECTOR", toUtc(st.delivered_at ?? ctx.now));
          r.status = "VERIFIED";
        }
      }
      refresh(ctx);
      return {
        changed: ctx.events.filter((e) => e.type === "STATUS_CHANGED").map((e) => ({
          thread_id: e.thread_id!, from: e.data["from"] as Thread["status"], to: e.data["to"] as Thread["status"],
        })),
      };
    }),

    inbox: (p: unknown, raw: unknown) => run("inbox", p, io.InboxIn, raw, false, async (ctx, input) => {
      const me = person(ctx);
      return { messages: ctx.state.inbox.filter((m) => m.to === me && (!input.since || ms(m.at) > ms(input.since))) };
    }),

    /** Append-only event log (audit, replay). System only. */
    async events(p: unknown): Promise<OpResult<{ events: ThreadEvent[] }>> {
      const pp = io.Principal.safeParse(p);
      if (!pp.success || pp.data.kind !== "system") return { ok: false, error: fail("FORBIDDEN", "Only the system can read the event log.").body };
      return { ok: true, data: { events: await cfg.store.events(pp.data.household_id) } };
    },
  };
}

export type ThreadApp = ReturnType<typeof createThreadApp>;
