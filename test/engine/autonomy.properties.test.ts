import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { decide } from "../../src/engine/autonomy.ts";
import type { Severity } from "../../src/model/schemas.ts";

const severityArb = fc.constantFrom<Severity>("NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL");

describe("autonomy property (task 6.2)", () => {
  test("property 5: OBSERVE and RECOMMEND never ADJUST_PLAN or SEND_HANDOFF", () => {
    fc.assert(
      fc.property(severityArb, (sev) => {
        for (const au of ["OBSERVE", "RECOMMEND"] as const) {
          const actions = decide(sev, au);
          expect(actions).not.toContain("ADJUST_PLAN");
          expect(actions).not.toContain("SEND_HANDOFF");
        }
      }),
    );
  });
});
