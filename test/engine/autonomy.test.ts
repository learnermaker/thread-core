import { describe, test, expect } from "vitest";
import { decide } from "../../src/engine/autonomy.ts";
import type { Autonomy, Severity } from "../../src/model/schemas.ts";

// The design.md table, written literally. All 20 severity × autonomy cells.
const EXPECTED: Record<Severity, Record<Autonomy, string[]>> = {
  NONE: { OBSERVE: ["LOG"], RECOMMEND: ["LOG"], COORDINATE: ["UPDATE_SILENTLY"], ACT: ["UPDATE_SILENTLY"] },
  LOW: { OBSERVE: ["LOG"], RECOMMEND: ["LOG"], COORDINATE: ["UPDATE_SILENTLY"], ACT: ["UPDATE_SILENTLY"] },
  MEDIUM: { OBSERVE: ["LOG"], RECOMMEND: ["SURFACE"], COORDINATE: ["ADJUST_PLAN"], ACT: ["ADJUST_PLAN"] },
  HIGH: { OBSERVE: ["SURFACE"], RECOMMEND: ["PROPOSE_HANDOFF"], COORDINATE: ["PROPOSE_HANDOFF"], ACT: ["SEND_HANDOFF"] },
  CRITICAL: {
    OBSERVE: ["SURFACE"], RECOMMEND: ["PROPOSE_HANDOFF"],
    COORDINATE: ["SEND_HANDOFF", "NOTIFY_CREATOR"], ACT: ["SEND_HANDOFF", "NOTIFY_CREATOR"],
  },
};

const severities: Severity[] = ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
const autonomies: Autonomy[] = ["OBSERVE", "RECOMMEND", "COORDINATE", "ACT"];

describe("autonomy matrix (task 5.1)", () => {
  for (const sev of severities) {
    for (const au of autonomies) {
      test(`${sev} × ${au}`, () => {
        expect(decide(sev, au)).toEqual(EXPECTED[sev][au]);
      });
    }
  }
});
