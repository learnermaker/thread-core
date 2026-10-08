import { describe, test, expect } from "vitest";
import { clone } from "../../src/model/util.ts";
import { deriveStatus, evidenceProblem, isSatisfied, STRENGTH_RANK } from "../../src/engine/status.ts";
import type { Condition, Evidence, Strength, Thread } from "../../src/model/schemas.ts";
import { seedState } from "../helpers.ts";

const SEED = "2026-10-08T19:30:00-07:00";
const iso = (s: string) => new Date(s).toISOString();

/** Build evidence for a tourney condition (design.md helper). */
const ev = (condition_id: string, strength: Strength, observed_at: string, authorized = true): Evidence => ({
  id: `e_${condition_id}_${observed_at}`, thread_id: "thr_leo_tourney", condition_id, strength,
  actor: "sam", source: "TOOL", at: observed_at, observed_at, authorized,
});

const tourney = (now = SEED): Thread => clone(seedState(now).threads.find((t) => t.id === "thr_leo_tourney")!);
const cond = (t: Thread, id: string): Condition => t.conditions.find((c) => c.id === id)!;
/** c_arrival window = [deadline-60, deadline] = 14:30Z–15:30Z on Oct 10. */
const arrival = (observed_at: string, authorized = true) => ev("c_arrival", "ATTESTED", iso(observed_at), authorized);

describe("STRENGTH_RANK and evidenceProblem (tasks 2.1, Requirement 3)", () => {
  test("STRENGTH_RANK orders ATTESTED < SYSTEM_VERIFIED < OUTCOME", () => {
    expect(STRENGTH_RANK.ATTESTED).toBeLessThan(STRENGTH_RANK.SYSTEM_VERIFIED);
    expect(STRENGTH_RANK.SYSTEM_VERIFIED).toBeLessThan(STRENGTH_RANK.OUTCOME);
  });

  test("good evidence returns null", () => {
    const c = cond(tourney(), "c_arrival");
    expect(evidenceProblem(c, arrival("2026-10-10T15:00:00Z"))).toBeNull();
  });

  test("evidence for a different condition: 'different condition'", () => {
    const c = cond(tourney(), "c_arrival");
    expect(evidenceProblem(c, ev("c_transport_owner", "ATTESTED", iso("2026-10-10T15:00:00Z")))).toBe("different condition");
  });

  test("unauthorized evidence: 'not from the responsible person'", () => {
    const c = cond(tourney(), "c_arrival");
    expect(evidenceProblem(c, arrival("2026-10-10T15:00:00Z", false))).toBe("not from the responsible person");
  });

  test("too-weak evidence: 'needs <STRENGTH> evidence'", () => {
    const c = cond(tourney(), "c_departure_plan"); // min_strength SYSTEM_VERIFIED
    const weak: Evidence = { ...ev("c_departure_plan", "ATTESTED", iso("2026-10-10T15:00:00Z")) };
    expect(evidenceProblem(c, weak)).toBe("needs SYSTEM_VERIFIED evidence");
  });

  test("evidence outside the window: 'outside the time window'", () => {
    const c = cond(tourney(), "c_arrival");
    expect(evidenceProblem(c, arrival("2026-10-10T15:45:00Z"))).toBe("outside the time window"); // 08:45 local
  });

  test("evidence before valid_from: 'superseded by a later change'", () => {
    const t = tourney();
    const c = cond(t, "c_transport_owner");
    c.valid_from = iso("2026-10-09T00:00:00Z");
    const stale: Evidence = ev("c_transport_owner", "ATTESTED", iso("2026-10-08T00:00:00Z"));
    expect(evidenceProblem(c, stale)).toBe("superseded by a later change");
  });

  test("isSatisfied is true only when some evidence has no problem", () => {
    const c = cond(tourney(), "c_arrival");
    expect(isSatisfied(c, [arrival("2026-10-10T15:45:00Z")])).toBe(false); // outside window only
    expect(isSatisfied(c, [arrival("2026-10-10T15:45:00Z"), arrival("2026-10-10T15:00:00Z")])).toBe(true);
  });
});

describe("deriveStatus precedence (task 2.2, Requirement 4)", () => {
  // Evidence that satisfies every tourney condition, with arrival at 08:21 local (15:21Z, inside the window).
  const fullySatisfying = (): Evidence[] => [
    ev("c_transport_owner", "ATTESTED", iso("2026-10-09T12:00:00Z")),
    ev("c_departure_plan", "SYSTEM_VERIFIED", iso("2026-10-09T12:00:00Z")),
    ev("c_jersey", "ATTESTED", iso("2026-10-09T12:00:00Z")),
    arrival("2026-10-10T15:21:00Z"),
  ];

  test("CANCELLED wins over everything", () => {
    const t = tourney();
    t.cancelled = true;
    expect(deriveStatus(t, fullySatisfying(), iso("2026-10-10T15:21:00Z"))).toBe("CANCELLED");
  });

  test("RESOLVED when every condition is satisfied, even past the deadline (08:21 arrival stays RESOLVED at 09:00)", () => {
    const t = tourney();
    expect(deriveStatus(t, fullySatisfying(), iso("2026-10-10T15:21:00Z"))).toBe("RESOLVED"); // 08:21 local
    expect(deriveStatus(t, fullySatisfying(), iso("2026-10-10T16:00:00Z"))).toBe("RESOLVED"); // 09:00 local
  });

  test("EXPIRED when the deadline has passed and arrival (08:31) is outside the window", () => {
    const t = tourney();
    const ev2 = [
      ev("c_transport_owner", "ATTESTED", iso("2026-10-09T12:00:00Z")),
      ev("c_departure_plan", "SYSTEM_VERIFIED", iso("2026-10-09T12:00:00Z")),
      arrival("2026-10-10T15:31:00Z"), // 08:31 local, outside [14:30Z,15:30Z]
    ];
    expect(deriveStatus(t, ev2, iso("2026-10-10T15:35:00Z"))).toBe("EXPIRED");
  });

  test("NEEDS_ATTENTION when a responsibility risk has no_candidate", () => {
    const t = tourney();
    t.responsibilities[0]!.risk = {
      severity: "HIGH", code: "NO_CANDIDATE", text: "nobody can drive", prev_status: "OWNED", no_candidate: true,
    };
    expect(deriveStatus(t, [], SEED)).toBe("NEEDS_ATTENTION");
  });

  test("HANDOFF_PENDING when a responsibility is HANDOFF_PENDING", () => {
    const t = tourney();
    t.responsibilities[0]!.status = "HANDOFF_PENDING";
    expect(deriveStatus(t, [], SEED)).toBe("HANDOFF_PENDING");
  });

  test("AT_RISK when a responsibility is AT_RISK", () => {
    const t = tourney();
    t.responsibilities[0]!.status = "AT_RISK";
    expect(deriveStatus(t, [], SEED)).toBe("AT_RISK");
  });

  test("PLAN_SECURED when every PRE condition is satisfied but an OUTCOME is not", () => {
    const t = tourney();
    const preOnly = [
      ev("c_transport_owner", "ATTESTED", iso("2026-10-09T12:00:00Z")),
      ev("c_departure_plan", "SYSTEM_VERIFIED", iso("2026-10-09T12:00:00Z")),
      ev("c_jersey", "ATTESTED", iso("2026-10-09T12:00:00Z")),
    ];
    expect(deriveStatus(t, preOnly, SEED)).toBe("PLAN_SECURED");
  });

  test("ACTIVE for the seeded tourney at Thu 19:30 (c_departure_plan not yet satisfied)", () => {
    const s = seedState(SEED);
    const t = s.threads.find((x) => x.id === "thr_leo_tourney")!;
    expect(deriveStatus(t, s.evidence, iso(SEED))).toBe("ACTIVE");
  });

  test("seeded refill and dinner are PLAN_SECURED at Thu 19:30", () => {
    const s = seedState(SEED);
    for (const id of ["thr_rosa_refill", "thr_family_dinner"]) {
      const t = s.threads.find((x) => x.id === id)!;
      expect(deriveStatus(t, s.evidence, iso(SEED))).toBe("PLAN_SECURED");
    }
  });
});
