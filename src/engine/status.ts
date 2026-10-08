import type { Condition, Evidence, Strength, Thread, ThreadStatus } from "../model/schemas.ts";
import { ms, within } from "../model/time.ts";

export const STRENGTH_RANK: Record<Strength, number> = { ATTESTED: 1, SYSTEM_VERIFIED: 2, OUTCOME: 3 };

/** Why a piece of evidence does or doesn't satisfy a condition (null = it does). */
export function evidenceProblem(c: Condition, e: Evidence): string | null {
  if (e.condition_id !== c.id) return "different condition";
  if (!e.authorized) return "not from the responsible person";
  if (STRENGTH_RANK[e.strength] < STRENGTH_RANK[c.min_strength]) return `needs ${c.min_strength} evidence`;
  if (c.window && !within(e.observed_at, c.window)) return "outside the time window";
  if (c.valid_from && ms(e.observed_at) < ms(c.valid_from)) return "superseded by a later change";
  return null;
}

/** A condition is satisfied only by evidence >= min_strength, from an authorized actor, inside its window, not superseded. */
export function isSatisfied(c: Condition, threadEvidence: Evidence[]): boolean {
  return threadEvidence.some((e) => e.condition_id === c.id && evidenceProblem(c, e) === null);
}

/**
 * Derived Thread status (never set by callers). Precedence:
 * CANCELLED > RESOLVED > EXPIRED > NEEDS_ATTENTION > HANDOFF_PENDING > AT_RISK > PLAN_SECURED > ACTIVE
 */
export function deriveStatus(t: Thread, evidence: Evidence[], now: string): ThreadStatus {
  const ev = evidence.filter((e) => e.thread_id === t.id);
  const sat = (c: Condition) => isSatisfied(c, ev);
  if (t.cancelled) return "CANCELLED";
  if (t.conditions.length > 0 && t.conditions.every(sat)) return "RESOLVED";
  if (ms(now) > ms(t.deadline)) return "EXPIRED";
  if (t.responsibilities.some((r) => r.risk?.no_candidate)) return "NEEDS_ATTENTION";
  if (t.responsibilities.some((r) => r.status === "HANDOFF_PENDING")) return "HANDOFF_PENDING";
  if (t.responsibilities.some((r) => r.status === "AT_RISK")) return "AT_RISK";
  if (t.conditions.filter((c) => c.phase === "PRE").every(sat)) return "PLAN_SECURED";
  return "ACTIVE";
}
