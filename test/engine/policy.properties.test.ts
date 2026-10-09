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
  { thread: "thr_leo_tourney", type: "TRANSPORT", recipient: "sam", kind: "person" as const, extra: [] as SharedFact[] },
  { thread: "thr_rosa_refill", type: "PICKUP", recipient: "sam", kind: "person" as const, extra: [] as SharedFact[] },
  { thread: "thr_rosa_refill", type: "PICKUP", recipient: "svc_pharmacy_delivery", kind: "service" as const, extra: service_extra },
];

const secret = fc.string({ unit: fc.constantFrom(..."abcdefghijkl0123456789"), minLength: 6 }).map((s) => `SECRET-${s}`);

describe("property 1: withheld values never leak", () => {
  test("the receipt JSON never contains the value of a PRIVATE fact not owned by or shared with the recipient", () => {
    fc.assert(
      fc.property(fc.constantFrom(...combos), secret, (combo, value) => {
        const s: HouseholdState = seedState(now);
        const t = s.threads.find((x) => x.id === combo.thread)!;
        // A PRIVATE fact on the thread, owned by maya, never shared with the recipient (recipient is sam or a service).
        const planted: Fact = {
          id: "fact_planted", thread_id: combo.thread, key: "secret_note", label: "A private note",
          value, owner: "maya", sensitivity: "PRIVATE", shared_with: [],
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
