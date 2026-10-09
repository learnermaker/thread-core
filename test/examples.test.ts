import { describe, test, expect } from "vitest";
import { main as caregiverMain } from "../examples/caregiver-rota.ts";
import { main as weekendMain } from "../examples/household-weekend.ts";
import { main as handoffMain } from "../examples/agent-handoff.ts";

async function collect(fn: (log: (l: string) => void) => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  await fn((l) => lines.push(l));
  return lines;
}

describe("examples/caregiver-rota", async () => {
  const lines = await collect(caregiverMain);
  test("HIGH impact on the visit", () => {
    expect(lines.some((l) => l.includes("Tuesday visit to Ada") && l.includes("HIGH"))).toBe(true);
  });
  test("receipt shared and withheld", () => {
    expect(lines.some((l) => l.startsWith("Asked cleo;") && l.includes("shared:") && l.includes("withheld:"))).toBe(true);
  });
  test("PLAN_SECURED after Cleo accepts", () => {
    expect(lines).toContain("After Cleo accepts: PLAN_SECURED");
  });
  test("RESOLVED after the visit", () => {
    expect(lines).toContain("After the visit: RESOLVED");
  });
});

describe("examples/household-weekend", async () => {
  const lines = await collect(weekendMain);
  test("s02_ripple line with HIGH for tourney and refill, NONE for dinner", () => {
    expect(lines).toContain(
      "s02_ripple: Leo's Saturday Tournament HIGH · Rosa's prescription refill HIGH · Family dinner NONE (not affected)",
    );
  });
  test("s08 line with requires confirmation summary", () => {
    expect(lines).toContain(
      "s08_refill_rerank_to_service: needs confirmation: Pharmacy delivery, Saturday 10:00 AM–11:00 AM, $4.99",
    );
  });
  test("last line is the weekend summary", () => {
    expect(lines[lines.length - 1]).toBe(
      "Weekend: Leo's Saturday Tournament RESOLVED · Rosa's prescription refill RESOLVED · Family dinner PLAN_SECURED",
    );
  });
});

describe("examples/agent-handoff", async () => {
  const lines = await collect(handoffMain);
  test("HIGH severity when research agent is unavailable", () => {
    expect(lines.some((l) => l.includes("HIGH"))).toBe(true);
  });
  test("receipt shows shared and withheld", () => {
    expect(lines.some((l) => l.startsWith("Asked agent_backup;") && l.includes("shared:") && l.includes("withheld:"))).toBe(true);
  });
  test("PLAN_SECURED after backup accepts", () => {
    expect(lines).toContain("After backup accepts: PLAN_SECURED");
  });
  test("maria's evidence is not from the responsible person", () => {
    expect(lines).toContain("Maria's evidence: not from the responsible person");
  });
  test("RESOLVED after backup attests", () => {
    expect(lines).toContain("After backup attests: RESOLVED");
  });
});
