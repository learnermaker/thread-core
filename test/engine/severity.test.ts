import { describe, test, expect } from "vitest";
import { severityOf, type RespEval } from "../../src/engine/impact.ts";

const feasible = (slack: number, plan_drift = false): RespEval => ({ feasible: true, slack, plan_drift });
const infeasible = (slack: number): RespEval => ({ feasible: false, slack, plan_drift: false });

describe("severityOf table (task 2.1)", () => {
  test("infeasible and <= 12 h to deadline is CRITICAL (720 min boundary)", () => {
    expect(severityOf(feasible(100), infeasible(100), 720, false)).toBe("CRITICAL");
  });

  test("infeasible with no candidate is CRITICAL even far from the deadline", () => {
    expect(severityOf(feasible(100), infeasible(100), 5000, true)).toBe("CRITICAL");
  });

  test("infeasible, > 12 h to deadline, a candidate exists is HIGH (721 min boundary)", () => {
    expect(severityOf(feasible(100), infeasible(100), 721, false)).toBe("HIGH");
  });

  test("feasible with plan drift is MEDIUM", () => {
    expect(severityOf(feasible(500), feasible(500, true), 5000, false)).toBe("MEDIUM");
  });

  test("slack shrank and is now below 30 min is MEDIUM (29)", () => {
    expect(severityOf(feasible(100), feasible(29), 5000, false)).toBe("MEDIUM");
  });

  test("slack shrank but is still >= 30 min is LOW (30)", () => {
    expect(severityOf(feasible(100), feasible(30), 5000, false)).toBe("LOW");
  });

  test("feasible with no change is NONE", () => {
    expect(severityOf(feasible(100), feasible(100), 5000, false)).toBe("NONE");
  });
});
