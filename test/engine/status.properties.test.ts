import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { clone } from "../../src/model/util.ts";
import { deriveStatus, isSatisfied } from "../../src/engine/status.ts";
import type { Condition, Evidence, Strength, Thread } from "../../src/model/schemas.ts";
import { seedState } from "../helpers.ts";

const SEED = "2026-10-08T19:30:00-07:00";
const iso = (s: string) => new Date(s).toISOString();
const ev = (condition_id: string, strength: Strength, observed_at: string, authorized = true): Evidence => ({
  id: `e_${condition_id}_${observed_at}`, thread_id: "thr_leo_tourney", condition_id, strength,
  actor: "sam", source: "TOOL", at: observed_at, observed_at, authorized,
});
const tourney = (): Thread => clone(seedState(SEED).threads.find((t) => t.id === "thr_leo_tourney")!);

// One satisfying evidence item per tourney condition (arrival inside the 14:30Z–15:30Z window).
const satisfyingByCondition: Record<string, Evidence> = {
  c_transport_owner: ev("c_transport_owner", "ATTESTED", iso("2026-10-09T12:00:00Z")),
  c_departure_plan: ev("c_departure_plan", "SYSTEM_VERIFIED", iso("2026-10-09T12:00:00Z")),
  c_jersey: ev("c_jersey", "ATTESTED", iso("2026-10-09T12:00:00Z")),
  c_arrival: ev("c_arrival", "ATTESTED", iso("2026-10-10T15:00:00Z")),
};

describe("property 2: resolution needs evidence", () => {
  test("deriveStatus is RESOLVED iff every condition still has a satisfying evidence item in the subset", () => {
    const t = tourney();
    const ids = t.conditions.map((c) => c.id);
    fc.assert(
      fc.property(fc.subarray(ids), (keep) => {
        const subset = keep.map((id) => satisfyingByCondition[id]!);
        const allKept = ids.every((id) => keep.includes(id));
        const status = deriveStatus(t, subset, iso("2026-10-10T15:00:00Z"));
        expect(status === "RESOLVED").toBe(allKept);
      }),
      { numRuns: 100 },
    );
  });
});

describe("property 3: insufficient strength never satisfies", () => {
  test("a SYSTEM_VERIFIED condition is never satisfied by ATTESTED evidence, at any time, authorized or not", () => {
    const c: Condition = tourney().conditions.find((x) => x.id === "c_departure_plan")!; // min_strength SYSTEM_VERIFIED
    fc.assert(
      fc.property(fc.date({ min: new Date("2026-10-01T00:00:00Z"), max: new Date("2026-10-20T00:00:00Z"), noInvalidDate: true }), fc.boolean(), (d, authorized) => {
        const e = ev("c_departure_plan", "ATTESTED", d.toISOString(), authorized);
        expect(isSatisfied(c, [e])).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

describe("property 4: cancelled wins", () => {
  test("a cancelled thread derives CANCELLED for any evidence and any now", () => {
    const base = tourney();
    fc.assert(
      fc.property(
        fc.subarray(Object.values(satisfyingByCondition)),
        fc.date({ min: new Date("2026-10-01T00:00:00Z"), max: new Date("2026-10-20T00:00:00Z"), noInvalidDate: true }),
        (evidence, d) => {
          const t = clone(base);
          t.cancelled = true;
          expect(deriveStatus(t, evidence, d.toISOString())).toBe("CANCELLED");
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("property 5: window is inclusive and strict outside", () => {
  test("evidence at t satisfies c_arrival iff 14:30Z <= t <= 15:30Z on Oct 10", () => {
    const c: Condition = tourney().conditions.find((x) => x.id === "c_arrival")!;
    const lo = Date.parse("2026-10-10T14:30:00Z");
    const hi = Date.parse("2026-10-10T15:30:00Z");
    fc.assert(
      fc.property(fc.date({ min: new Date("2026-10-10T13:00:00Z"), max: new Date("2026-10-10T17:00:00Z"), noInvalidDate: true }), (d) => {
        const t = d.getTime();
        const e = ev("c_arrival", "ATTESTED", d.toISOString());
        expect(isSatisfied(c, [e])).toBe(t >= lo && t <= hi);
      }),
      { numRuns: 200 },
    );
  });
});
