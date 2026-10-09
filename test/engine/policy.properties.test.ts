import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { clone } from "../../src/model/util.ts";
import { OpError } from "../../src/model/errors.ts";
import { buildReceipt } from "../../src/engine/policy.ts";
import type { Fact, HouseholdState, SharedFact } from "../../src/model/schemas.ts";
import { registry as reg, seedState } from "../helpers.ts";

const now = "2026-10-08T19:31:00-07:00";

// Handoff-able (thread, type, recipient, kind, extra) combinations from the seed.
const service_extra: SharedFact[] = [
  { key: "order_ref", label: "Order reference", value: "ref_ho_2" },
  { key: "slot", label: "Delivery slot", value: "Saturday 10:00 AM–11:00 AM" },
];
const combos = [
  { thread: "thr_leo_tourney", responsibility: "r_transport", type: "TRANSPORT", recipient: "sam", kind: "person" as const, extra: [] as SharedFact[] },
  { thread: "thr_leo_tourney", responsibility: "r_jersey", type: "BRING_ITEM", recipient: "maya", kind: "person" as const, extra: [] as SharedFact[] },
  { thread: "thr_rosa_refill", responsibility: "r_pickup", type: "PICKUP", recipient: "sam", kind: "person" as const, extra: [] as SharedFact[] },
  { thread: "thr_rosa_refill", responsibility: "r_pickup", type: "PICKUP", recipient: "svc_pharmacy_delivery", kind: "service" as const, extra: service_extra },
  { thread: "thr_family_dinner", responsibility: "r_reservation", type: "ATTEND", recipient: "sam", kind: "person" as const, extra: [] as SharedFact[] },
];

const secret = fc.string({ unit: fc.constantFrom(..."abcdefghijkl0123456789"), minLength: 6 }).map((s) => `SECRET-${s}`);

describe("property 1: withheld values never leak", () => {
  test("the receipt JSON never contains the value of a PRIVATE fact not owned by or shared with the recipient", () => {
    fc.assert(
      fc.property(fc.constantFrom(...combos), secret, (combo, value) => {
        const s: HouseholdState = seedState(now);
        const t = s.threads.find((x) => x.id === combo.thread)!;
        // A PRIVATE fact on the thread, owned by someone other than the recipient and never shared with them.
        const planted: Fact = {
          id: "fact_planted", thread_id: combo.thread, key: "secret_note", label: "A private note",
          value, owner: combo.recipient === "maya" ? "sam" : "maya", sensitivity: "PRIVATE", shared_with: [],
        };
        s.facts.push(planted);
        try {
          const receipt = buildReceipt(s, reg, t, combo.type, combo.recipient, combo.kind, "ho_1", [], now, clone(combo.extra));
          expect(JSON.stringify(receipt)).not.toContain(value);
        } catch (e) {
          // CONTEXT_BLOCKED shares nothing; its message names keys only, never the planted value.
          expect(e).toBeInstanceOf(OpError);
          expect((e as OpError).message).not.toContain(value);
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe("receipt properties", () => {
  test("property: receipt minimality", () => {
    expect([...new Set(combos.map((combo) => combo.type))].sort()).toEqual([...reg.keys()].sort());
    const seededResponsibilities = seedState(now).threads.flatMap((t) => t.responsibilities.map((r) => `${t.id}:${r.id}`));
    expect([...new Set(combos.map((combo) => `${combo.thread}:${combo.responsibility}`))].sort()).toEqual(seededResponsibilities.sort());
    const extraFact = fc.record({ key: fc.string({ minLength: 1, maxLength: 16 }), label: fc.string({ minLength: 1, maxLength: 16 }), value: fc.string({ maxLength: 32 }) });

    fc.assert(
      fc.property(fc.array(extraFact, { maxLength: 8 }), (generatedExtra) => {
        for (const combo of combos) {
          const s = seedState(now);
          const t = s.threads.find((x) => x.id === combo.thread)!;
          expect(t.responsibilities.find((r) => r.id === combo.responsibility)?.type).toBe(combo.type);
          const needs = new Set(reg.get(combo.type)!.context_needs[combo.kind].map((need) => need.key));
          const receipt = buildReceipt(s, reg, t, combo.type, combo.recipient, combo.kind, "ho_1", [], now, [...clone(combo.extra), ...generatedExtra]);
          expect(receipt.shared.every((fact) => needs.has(fact.key))).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
