import { z } from "zod";
import { Id, OwnerKind, Quote, type HouseholdState, type Person, type Responsibility, type Thread } from "../model/schemas.ts";
import { fmtMoney, fmtRange, ms } from "../model/time.ts";
import { cmp } from "../model/util.ts";
import type { TypeRegistry } from "../registry/types.ts";
import { conflicts } from "./availability.ts";
import { makeEnv } from "./derive.ts";

export const Reason = z.strictObject({ code: z.string(), ok: z.boolean(), text: z.string() });
export const Candidate = z.strictObject({
  id: Id,
  kind: OwnerKind,
  name: z.string(),
  eligible: z.boolean(),
  score: z.number().int(),
  reasons: z.array(Reason),
  quote: Quote.optional(),
});
export type Reason = z.infer<typeof Reason>;
export type Candidate = z.infer<typeof Candidate>;
export interface Ranking {
  candidates: Candidate[]; // eligible: people (score desc, id asc), then services (id asc)
  excluded: Candidate[]; // ineligible, with the failing reasons; people (id asc) then services
}

export function eligibleByPolicy(p: Person, thread: Thread): boolean {
  return thread.handoff_policy.eligible.some((rule) =>
    rule === "household_adult" ? p.adult && p.has_account : p.guardian_of.includes(rule.slice("guardian_of:".length)),
  );
}

/**
 * Deterministic ranking. Hard filters first (each failure recorded as a reason), then a soft score.
 * People failing the handoff policy (e.g. a minor) and the current owner are not candidates at all.
 * `quotes` are pre-fetched from ServiceProviders by the app layer (keeps this function pure).
 */
export function rankCandidates(state: HouseholdState, reg: TypeRegistry, thread: Thread, r: Responsibility, quotes: Quote[], now: string): Ranking {
  const env = makeEnv(state);
  const type = reg.get(r.type);
  const people: Candidate[] = [];
  for (const p of state.household.persons) {
    if (p.id === r.owner || !eligibleByPolicy(p, thread)) continue;
    const reasons: Reason[] = [];
    const busy = conflicts(state, reg, p.id, r.window, thread.id);
    reasons.push(busy.length === 0
      ? { code: "FREE", ok: true, text: `free ${fmtRange(r.window, env.tz)}` }
      : { code: "FREE", ok: false, text: busy[0]!.text });
    if (type?.capability) {
      const ok = type.capability.check(p);
      reasons.push({ code: type.capability.code, ok, text: ok ? type.capability.ok : type.capability.fail });
    }
    people.push({ id: p.id, kind: "person", name: p.name, eligible: reasons.every((x) => x.ok), score: 0, reasons });
  }
  const eligible = people.filter((c) => c.eligible);
  const needed = type?.needsObjects?.(thread) ?? [];
  const load = (pid: string) =>
    state.threads.filter((t) => !t.cancelled && t.status !== "RESOLVED" && t.status !== "EXPIRED")
      .flatMap((t) => t.responsibilities).filter((x) => x.owner === pid && x.owner_kind === "person").length;
  const minLoad = Math.min(...eligible.map((c) => load(c.id)));
  for (const c of eligible) {
    const held = thread.responsibilities.filter((x) => x.type === "BRING_ITEM" && x.owner === c.id && x.item && needed.includes(x.item));
    if (held.length > 0) { c.score += 2; c.reasons.push({ code: "HOLDS_ITEM", ok: true, text: `has the ${held[0]!.item}` }); }
    if (thread.participants.includes(c.id)) { c.score += 3; c.reasons.push({ code: "PARTICIPANT", ok: true, text: "already involved" }); }
    if (eligible.length >= 2 && load(c.id) === minLoad) { c.score += 1; c.reasons.push({ code: "LOWEST_LOAD", ok: true, text: "lightest load" }); }
  }
  const services: Candidate[] = quotes.map((q) => {
    const fits = ms(q.slot.start) >= ms(now) && ms(q.slot.end) <= ms(thread.deadline);
    return {
      id: q.provider_id, kind: "service" as const, name: q.summary, eligible: fits, score: 0, quote: q,
      reasons: [
        { code: "SLOT", ok: fits, text: fits ? `slot ${fmtRange(q.slot, env.tz)}` : "no slot before the deadline" },
        { code: "COST", ok: true, text: fmtMoney(q.amount_cents) },
        { code: "NEEDS_CONFIRMATION", ok: true, text: "needs your confirmation" },
      ],
    };
  });
  const byScore = (a: Candidate, b: Candidate) => b.score - a.score || cmp(a.id, b.id);
  const byId = (a: Candidate, b: Candidate) => cmp(a.id, b.id);
  return {
    candidates: [...eligible.sort(byScore), ...services.filter((s) => s.eligible).sort(byId)],
    excluded: [...people.filter((c) => !c.eligible).sort(byId), ...services.filter((s) => !s.eligible).sort(byId)],
  };
}

/** "Sam (free 7:55 AM–12:30 PM, can drive, has the jersey, already involved)" */
export function describe(c: Candidate): string {
  const ok = c.reasons.filter((x) => x.ok).map((x) => x.text);
  const bad = c.reasons.filter((x) => !x.ok).map((x) => x.text);
  return `${c.name} (${(c.eligible ? ok : bad).join(", ")})`;
}
