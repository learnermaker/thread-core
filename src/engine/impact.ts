import { z } from "zod";
import { Id, Instant, Severity, type HouseholdState, type Responsibility, type Thread } from "../model/schemas.ts";
import { fmtDay, fmtDayTime, fmtRange, fmtTime, minutesBetween, ms } from "../model/time.ts";
import { cmp } from "../model/util.ts";
import type { TypeRegistry } from "../registry/types.ts";
import { conflicts } from "./availability.ts";
import { makeEnv } from "./derive.ts";

/** Changes a user can report (report_change) */
export const UserChange = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("PERSON_UNAVAILABLE"), person: Id, start: Instant, end: Instant }),
  z.strictObject({ type: z.literal("EVENT_MOVED"), thread_id: Id, new_start: Instant }),
]);
/** Signals connectors/watchers ingest (system only), deduped by source_id */
export const Signal = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("PERSON_BUSY"), person: Id, start: Instant, end: Instant, source_id: z.string().min(1) }),
  z.strictObject({ type: z.literal("TRAVEL_TIME_CHANGED"), place: Id, minutes: z.number().int().min(0).max(600), cause: z.string().min(1).max(80), source_id: z.string().min(1) }),
]);
export type UserChange = z.infer<typeof UserChange>;
export type Signal = z.infer<typeof Signal>;
export type Change = UserChange | Signal;

export const SEVERITY_RANK = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 } as const;
export const HOURS_12 = 12 * 60;
export const SLACK_THRESHOLD = 30;

// ---------- Impact Graph (built in memory from state; tiny, depth <= 4) ----------
export type Rel = "AVAILABILITY_OF" | "OWNS" | "REQUIRES" | "REQUIRED_BY" | "AFFECTS" | "HOLDS" | "NEEDS_OBJECT";
export interface Edge { from: string; rel: Rel; to: string }
export const node = {
  avail: (p: string) => `avail:${p}`,
  person: (p: string) => `person:${p}`,
  thread: (t: string) => `thread:${t}`,
  resp: (t: string, r: string) => `resp:${t}/${r}`,
  cond: (t: string, c: string) => `cond:${t}/${c}`,
  travel: (place: string) => `travel:${place}`,
  object: (item: string) => `object:${item}`,
};

export function buildGraph(state: HouseholdState, reg: TypeRegistry): Edge[] {
  const edges: Edge[] = [];
  for (const p of state.household.persons) edges.push({ from: node.avail(p.id), rel: "AVAILABILITY_OF", to: node.person(p.id) });
  for (const t of state.threads) {
    if (t.cancelled) continue;
    for (const r of t.responsibilities) {
      const rn = node.resp(t.id, r.id);
      edges.push({ from: node.thread(t.id), rel: "REQUIRES", to: rn });
      edges.push({ from: rn, rel: "REQUIRED_BY", to: node.thread(t.id) });
      if (r.owner_kind === "person") edges.push({ from: node.person(r.owner), rel: "OWNS", to: rn });
      if (r.type === "BRING_ITEM" && r.item) edges.push({ from: node.person(r.owner), rel: "HOLDS", to: node.object(r.item) });
      for (const item of reg.get(r.type)?.needsObjects?.(t) ?? []) edges.push({ from: rn, rel: "NEEDS_OBJECT", to: node.object(item) });
      for (const c of t.conditions.filter((c) => c.responsibility_id === r.id)) {
        edges.push({ from: rn, rel: "REQUIRES", to: node.cond(t.id, c.id) });
        edges.push({ from: node.cond(t.id, c.id), rel: "REQUIRED_BY", to: rn });
        // weather/travel to the event place affects the timing conditions of a TRANSPORT
        if (r.type === "TRANSPORT" && (c.id === "c_departure_plan" || c.id === "c_arrival")) {
          edges.push({ from: node.travel(t.event.place), rel: "AFFECTS", to: node.cond(t.id, c.id) });
        }
      }
    }
  }
  return edges;
}

/** Edges followed when propagating a change. Never thread -> responsibility (that would mark every sibling duty affected). */
const PROPAGATES: ReadonlySet<Rel> = new Set(["AVAILABILITY_OF", "OWNS", "REQUIRED_BY", "AFFECTS"]);

export function startNodes(change: Change, state: HouseholdState): string[] {
  switch (change.type) {
    case "PERSON_UNAVAILABLE":
    case "PERSON_BUSY":
      return [node.avail(change.person)];
    case "TRAVEL_TIME_CHANGED":
      return [node.travel(change.place)];
    case "EVENT_MOVED": {
      const t = state.threads.find((x) => x.id === change.thread_id);
      return t ? t.responsibilities.map((r) => node.resp(t.id, r.id)) : [];
    }
  }
}

/** BFS (depth <= 4). Returns every reached node with the path that reached it (for explanations). */
export function traverse(edges: Edge[], starts: string[], maxDepth = 4): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let frontier = starts.map((s) => [s]);
  for (const s of starts) out.set(s, [s]);
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: string[][] = [];
    for (const path of frontier) {
      const at = path[path.length - 1]!;
      for (const e of edges) {
        if (e.from !== at || !PROPAGATES.has(e.rel) || out.has(e.to)) continue;
        const p = [...path, e.to];
        out.set(e.to, p);
        next.push(p);
      }
    }
    frontier = next;
  }
  return out;
}

/** Reached responsibilities as [thread, responsibility] pairs, in state order (deterministic). */
export function reachedResponsibilities(state: HouseholdState, reached: Map<string, string[]>): Array<[Thread, Responsibility]> {
  const out: Array<[Thread, Responsibility]> = [];
  for (const t of state.threads) for (const r of t.responsibilities) if (reached.has(node.resp(t.id, r.id))) out.push([t, r]);
  return out;
}

// ---------- Feasibility, slack, severity ----------
export interface RespEval {
  feasible: boolean;
  code?: "OWNER_UNAVAILABLE" | "CAPABILITY" | "PLAN_DRIFT";
  text?: string;
  cause_busy_id?: string;
  slack: number; // minutes from now until the owner must act (window start)
  plan_drift: boolean; // a THREAD-created calendar block no longer matches the window
}

const TERMINAL = new Set(["COMPLETED", "VERIFIED"]);

export function evalResponsibility(state: HouseholdState, reg: TypeRegistry, t: Thread, r: Responsibility, now: string): RespEval {
  const slack = minutesBetween(now, r.window.start);
  const plan_drift = !!r.block && (r.block.start !== r.window.start || r.block.end !== r.window.end);
  if (r.owner_kind === "service" || TERMINAL.has(r.status)) return { feasible: true, slack, plan_drift: false };
  const env = makeEnv(state);
  const p = state.household.persons.find((x) => x.id === r.owner);
  const type = reg.get(r.type);
  if (p && type?.capability && !type.capability.check(p)) {
    return { feasible: false, code: "CAPABILITY", text: `${p.name} ${type.capability.fail}`, slack, plan_drift };
  }
  const busy = state.busy.find((b) => b.person === r.owner && ms(b.start) < ms(r.window.end) && ms(r.window.start) < ms(b.end));
  if (busy) {
    return {
      feasible: false, code: "OWNER_UNAVAILABLE", cause_busy_id: busy.id, slack, plan_drift,
      text: `${env.personName(r.owner)} is unavailable ${fmtDay(busy.start, env.tz)} ${fmtRange(busy, env.tz)}.`,
    };
  }
  const other = conflicts(state, reg, r.owner, r.window, t.id).find((c) => c.code === "COMMITMENT");
  if (other) return { feasible: false, code: "OWNER_UNAVAILABLE", text: `${env.personName(r.owner)} is ${other.text}.`, slack, plan_drift };
  return { feasible: true, slack, plan_drift, ...(plan_drift ? { code: "PLAN_DRIFT" as const } : {}) };
}

/**
 * Severity of one responsibility, before vs after a change (Master Spec §D5, refined Oct 8):
 * NONE no change · LOW slack shrank but >= 30 min · MEDIUM slack < 30 min, or an accepted plan must be adjusted (plan drift)
 * HIGH infeasible and > 12 h to deadline · CRITICAL infeasible and (<= 12 h to deadline or no eligible candidate)
 */
export function severityOf(before: RespEval, after: RespEval, minutesToDeadline: number, noCandidate: boolean): z.infer<typeof Severity> {
  if (!after.feasible) return minutesToDeadline <= HOURS_12 || noCandidate ? "CRITICAL" : "HIGH";
  if (after.plan_drift) return "MEDIUM";
  if (after.slack < before.slack) return after.slack < SLACK_THRESHOLD ? "MEDIUM" : "LOW";
  return "NONE";
}

export interface RespImpact {
  thread_id: string;
  responsibility_id: string;
  severity: z.infer<typeof Severity>;
  after: RespEval;
}
export interface ThreadImpact {
  thread_id: string;
  title: string;
  severity: z.infer<typeof Severity>;
  responsibilities: RespImpact[];
  path: string[];
  why: string[];
}

/** Assesses every reached responsibility. `noCandidate(t, r)` comes from rankCandidates (app layer). Sorted by severity desc, then thread id. */
export function assess(
  before: HouseholdState, after: HouseholdState, reg: TypeRegistry, change: Change, reached: Map<string, string[]>, now: string,
  noCandidate: (t: Thread, r: Responsibility) => boolean,
): ThreadImpact[] {
  const env = makeEnv(after);
  const byThread = new Map<string, ThreadImpact>();
  for (const [t, r] of reachedResponsibilities(after, reached)) {
    const tb = before.threads.find((x) => x.id === t.id);
    const rb = tb?.responsibilities.find((x) => x.id === r.id);
    const a = evalResponsibility(after, reg, t, r, now);
    const b = tb && rb ? evalResponsibility(before, reg, tb, rb, now) : a;
    const sev = TERMINAL.has(r.status) ? "NONE" : severityOf(b, a, minutesBetween(now, t.deadline), !a.feasible && noCandidate(t, r));
    const ti = byThread.get(t.id) ?? { thread_id: t.id, title: t.title, severity: "NONE" as const, responsibilities: [], path: reached.get(node.resp(t.id, r.id)) ?? [], why: [] };
    ti.responsibilities.push({ thread_id: t.id, responsibility_id: r.id, severity: sev, after: a });
    if (SEVERITY_RANK[sev] > SEVERITY_RANK[ti.severity]) ti.severity = sev;
    byThread.set(t.id, ti);
  }
  const list = [...byThread.values()];
  for (const ti of list) ti.why = explainImpact(after, reg, change, ti, env.tz);
  return list.sort((x, y) => SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity] || cmp(x.thread_id, y.thread_id));
}

/** Template sentences (no LLM). Candidate sentences are appended by the app layer. */
export function explainImpact(state: HouseholdState, reg: TypeRegistry, change: Change, ti: ThreadImpact, tz: string): string[] {
  const env = makeEnv(state);
  const t = state.threads.find((x) => x.id === ti.thread_id)!;
  const out: string[] = [];
  for (const ri of ti.responsibilities) {
    const r = t.responsibilities.find((x) => x.id === ri.responsibility_id)!;
    const label = reg.get(r.type)?.label(r) ?? r.type;
    if (ri.severity === "HIGH" || ri.severity === "CRITICAL") {
      if (ri.after.text) out.push(ri.after.text);
      out.push(`${env.personName(r.owner)} owned ${label}, which ${t.title} needs.`);
    } else if (ri.severity === "MEDIUM" && ri.after.plan_drift && r.block) {
      if (change.type === "TRAVEL_TIME_CHANGED") out.push(`${capFirst(change.cause)}: travel to ${env.placeName(t.event.place)} is now ${change.minutes} min.`);
      out.push(`Leave by ${fmtTime(r.window.start, tz)} instead of ${fmtTime(r.block.start, tz)}.`);
    } else if (ri.severity === "NONE" && (change.type === "PERSON_UNAVAILABLE" || change.type === "PERSON_BUSY")) {
      const who = env.personName(change.person);
      out.push(ms(change.end) <= ms(r.window.start)
        ? `${who} is free again by ${fmtTime(change.end, tz)}; ${t.title} is at ${fmtTime(r.window.start, tz)}, so no action needed.`
        : `${who}'s change doesn't overlap ${t.title} (${fmtDayTime(r.window.start, tz)}), so no action needed.`);
    } else if (ri.severity === "NONE") {
      out.push(`${t.title} is not affected.`);
    } else {
      out.push(`${label} has less spare time now (${ri.after.slack} min before it starts).`);
    }
  }
  return [...new Set(out)];
}

function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
