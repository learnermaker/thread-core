import { describe, test, expect } from "vitest";
import { clone } from "../../src/model/util.ts";
import { recomputeWindows } from "../../src/engine/derive.ts";
import { assess, buildGraph, startNodes, traverse, type Change } from "../../src/engine/impact.ts";
import { rankCandidates } from "../../src/engine/candidates.ts";
import type { HouseholdState, Thread } from "../../src/model/schemas.ts";
import { pharmacy, registry as reg, seedState } from "../helpers.ts";

const iso = (s: string) => new Date(s).toISOString();

/** Runs the full assess pipeline for a PERSON_UNAVAILABLE change, with the pharmacy quote wired in like the app layer. */
async function assessUnavailable(s: HouseholdState, person: string, start: string, end: string, now: string) {
  const change: Change = { type: "PERSON_UNAVAILABLE", person, start: iso(start), end: iso(end) };
  const before = clone(s);
  s.busy.push({ id: "busy_1", person, start: change.start, end: change.end, withheld_label: "Maya's reason for being unavailable" });
  recomputeWindows(s, reg);
  const reached = traverse(buildGraph(s, reg), startNodes(change, s));
  const refill = s.threads.find((t) => t.id === "thr_rosa_refill")!;
  const quote = await pharmacy().query({ thread: refill, responsibility: refill.responsibilities[0]!, now });
  const quotesFor = (type: string) => (type === "PICKUP" && quote ? [quote] : []);
  const noCandidate = (t: Thread, r: typeof refill.responsibilities[number]) =>
    rankCandidates(s, reg, t, r, quotesFor(r.type), now).candidates.length === 0;
  return assess(before, s, reg, change, reached, now, noCandidate);
}

describe("the Ripple assessment (task 2.2)", () => {
  test("returns [tourney HIGH, refill HIGH, dinner NONE] with the exact why strings", async () => {
    const now = iso("2026-10-08T19:31:00-07:00");
    const impacts = await assessUnavailable(seedState(), "maya", "2026-10-10T07:00:00-07:00", "2026-10-10T13:00:00-07:00", now);
    expect(impacts.map((i) => [i.thread_id, i.severity])).toEqual([
      ["thr_leo_tourney", "HIGH"],
      ["thr_rosa_refill", "HIGH"],
      ["thr_family_dinner", "NONE"],
    ]);
    const tourney = impacts.find((i) => i.thread_id === "thr_leo_tourney")!;
    expect(tourney.why).toEqual([
      "Maya is unavailable Saturday 7:00 AM–1:00 PM.",
      "Maya owned Transport, which Leo's Saturday Tournament needs.",
    ]);
    const dinner = impacts.find((i) => i.thread_id === "thr_family_dinner")!;
    expect(dinner.why).toEqual(["Maya is free again by 1:00 PM; Family dinner is at 7:00 PM, so no action needed."]);
  });

  test("an unrelated change (maya busy Sunday) reports all three Threads NONE", async () => {
    const now = iso("2026-10-08T19:31:00-07:00");
    const impacts = await assessUnavailable(seedState(), "maya", "2026-10-11T10:00:00-07:00", "2026-10-11T12:00:00-07:00", now);
    expect(impacts.every((i) => i.severity === "NONE")).toBe(true);
    expect(impacts.map((i) => i.thread_id).sort()).toEqual(["thr_family_dinner", "thr_leo_tourney", "thr_rosa_refill"]);
  });

  test("maya busy Sat 06:00–08:10 with 2 h to the deadline makes the tourney CRITICAL", async () => {
    const now = iso("2026-10-10T06:30:00-07:00");
    const impacts = await assessUnavailable(seedState(now), "maya", "2026-10-10T06:00:00-07:00", "2026-10-10T08:10:00-07:00", now);
    expect(impacts.find((i) => i.thread_id === "thr_leo_tourney")!.severity).toBe("CRITICAL");
  });
});

describe("the rain plan-drift assessment (task 2.3)", () => {
  test("after Sam accepted transport, 40 min of rain gives the tourney MEDIUM with the 2 why strings", () => {
    const now = iso("2026-10-10T07:05:00-07:00");
    const s = seedState(now);
    const tourney = s.threads.find((t) => t.id === "thr_leo_tourney")!;
    const rT = tourney.responsibilities.find((r) => r.id === "r_transport")!;
    // Simulate "Sam accepted transport" (design.md): owner sam, ACCEPTED, block at the current window, no risk.
    rT.owner = "sam";
    rT.status = "ACCEPTED";
    rT.block = { block_id: "blk_1", start: rT.window.start, end: rT.window.end };
    delete rT.risk;

    const change: Change = { type: "TRAVEL_TIME_CHANGED", place: "place_riverside", minutes: 40, cause: "heavy rain", source_id: "wx" };
    const before = clone(s);
    s.travel.push({ place: "place_riverside", minutes: 40, cause: "heavy rain", source_id: "wx", at: now });
    recomputeWindows(s, reg);
    const reached = traverse(buildGraph(s, reg), startNodes(change, s));
    const impacts = assess(before, s, reg, change, reached, now, () => false);

    const ti = impacts.find((i) => i.thread_id === "thr_leo_tourney")!;
    expect(ti.severity).toBe("MEDIUM");
    expect(ti.responsibilities.find((r) => r.responsibility_id === "r_transport")!.after.plan_drift).toBe(true);
    expect(ti.why).toEqual([
      "Heavy rain: travel to Riverside Fields is now 40 min.",
      "Leave by 7:40 AM instead of 7:55 AM.",
    ]);
  });
});

describe("privacy (task 2.4)", () => {
  test("no why string of any assessment contains a PRIVATE fact value", async () => {
    const now = iso("2026-10-08T19:31:00-07:00");
    const s = seedState(now);
    s.facts.push({
      id: "fact_private", thread_id: "thr_leo_tourney", key: "reason", label: "Maya's reason",
      value: "Dentist 7:30", owner: "maya", sensitivity: "PRIVATE", shared_with: [],
    });
    const impacts = await assessUnavailable(s, "maya", "2026-10-10T07:00:00-07:00", "2026-10-10T13:00:00-07:00", now);
    for (const i of impacts) for (const w of i.why) expect(w).not.toContain("Dentist");
  });
});
