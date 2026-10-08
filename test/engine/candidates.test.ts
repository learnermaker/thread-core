import { describe, test, expect } from "vitest";
import { clone } from "../../src/model/util.ts";
import { recomputeWindows } from "../../src/engine/derive.ts";
import { describe as describeCandidate, rankCandidates } from "../../src/engine/candidates.ts";
import type { HouseholdState, Quote } from "../../src/model/schemas.ts";
import { pharmacy, registry as reg, seedState } from "../helpers.ts";

const iso = (s: string) => new Date(s).toISOString();
const now = iso("2026-10-08T19:31:00-07:00");

/** Seed with maya unavailable Sat 07:00–13:00 (the Ripple). */
function rippleState(): HouseholdState {
  const s = seedState(now);
  s.busy.push({
    id: "busy_1", person: "maya",
    start: iso("2026-10-10T07:00:00-07:00"), end: iso("2026-10-10T13:00:00-07:00"),
    withheld_label: "Maya's reason for being unavailable",
  });
  recomputeWindows(s, reg);
  return s;
}

async function pharmacyQuote(s: HouseholdState): Promise<Quote> {
  const refill = s.threads.find((t) => t.id === "thr_rosa_refill")!;
  const q = await pharmacy().query({ thread: refill, responsibility: refill.responsibilities[0]!, now });
  return q!;
}

describe("tourney transport ranking after the Ripple (task 4.1)", () => {
  test("Sam is the only candidate with score 5, four ordered reasons; Rosa excluded; leo/maya absent", () => {
    const s = rippleState();
    const t = s.threads.find((x) => x.id === "thr_leo_tourney")!;
    const r = t.responsibilities.find((x) => x.id === "r_transport")!;
    const { candidates, excluded } = rankCandidates(s, reg, t, r, [], now);

    expect(candidates.map((c) => c.id)).toEqual(["sam"]);
    const sam = candidates[0]!;
    expect(sam.score).toBe(5);
    expect(sam.reasons.map((x) => x.code)).toEqual(["FREE", "CAN_DRIVE", "HOLDS_ITEM", "PARTICIPANT"]);
    expect(describeCandidate(sam)).toBe("Sam (free 7:55 AM–12:30 PM, can drive, has the jersey, already involved)");

    expect(excluded.map((c) => c.id)).toEqual(["rosa"]);
    expect(excluded[0]!.reasons.find((x) => x.code === "CAN_DRIVE")!.text).toBe("doesn't drive");

    const all = [...candidates, ...excluded].map((c) => c.id);
    expect(all).not.toContain("leo");
    expect(all).not.toContain("maya");
  });
});

describe("refill ranking (task 4.2)", () => {
  test("after Sam accepts transport: only the pharmacy; Rosa and Sam excluded with exact texts", async () => {
    const s = rippleState();
    // Sam accepted the tourney transport (now holds a block over 07:55–12:30).
    const tourney = s.threads.find((x) => x.id === "thr_leo_tourney")!;
    const rT = tourney.responsibilities.find((x) => x.id === "r_transport")!;
    rT.owner = "sam";
    rT.status = "ACCEPTED";
    rT.block = { block_id: "blk_1", start: rT.window.start, end: rT.window.end };

    const refill = s.threads.find((x) => x.id === "thr_rosa_refill")!;
    const rP = refill.responsibilities.find((x) => x.id === "r_pickup")!;
    const quote = await pharmacyQuote(s);
    const { candidates, excluded } = rankCandidates(s, reg, refill, rP, [quote], now);

    expect(candidates.map((c) => c.id)).toEqual(["svc_pharmacy_delivery"]);
    expect(candidates[0]!.reasons.map((x) => x.text)).toEqual(["slot 10:00 AM–11:00 AM", "$4.99", "needs your confirmation"]);

    expect(excluded.map((c) => c.id)).toEqual(["rosa", "sam"]);
    expect(excluded.find((c) => c.id === "rosa")!.reasons.find((x) => x.code === "CAN_DRIVE")!.text).toBe("doesn't drive");
    expect(excluded.find((c) => c.id === "sam")!.reasons.find((x) => x.code === "FREE")!.text)
      .toBe("driving Leo until 12:30 PM (accepted earlier)");
  });

  test("before acceptance: people before services → [sam, svc_pharmacy_delivery]", async () => {
    const s = rippleState();
    const refill = s.threads.find((x) => x.id === "thr_rosa_refill")!;
    const rP = refill.responsibilities.find((x) => x.id === "r_pickup")!;
    const quote = await pharmacyQuote(s);
    const { candidates } = rankCandidates(s, reg, refill, rP, [quote], now);
    expect(candidates.map((c) => c.id)).toEqual(["sam", "svc_pharmacy_delivery"]);
  });
});

describe("service slot and lowest-load (task 4.3)", () => {
  test("a quote ending after the deadline is excluded with 'no slot before the deadline'", () => {
    const s = rippleState();
    const refill = s.threads.find((x) => x.id === "thr_rosa_refill")!;
    const rP = refill.responsibilities.find((x) => x.id === "r_pickup")!;
    const lateQuote: Quote = {
      provider_id: "svc_pharmacy_delivery", summary: "Pharmacy delivery", amount_cents: 499, currency: "USD",
      slot: { start: iso("2026-10-10T11:30:00-07:00"), end: iso("2026-10-10T12:30:00-07:00") }, // deadline is noon
    };
    const { candidates, excluded } = rankCandidates(s, reg, refill, rP, [lateQuote], now);
    expect(candidates.map((c) => c.id)).not.toContain("svc_pharmacy_delivery");
    const svc = excluded.find((c) => c.id === "svc_pharmacy_delivery")!;
    expect(svc.reasons.find((x) => x.code === "SLOT")!.text).toBe("no slot before the deadline");
  });

  test("with two eligible people the lightest-load one gets LOWEST_LOAD (+1)", () => {
    const s = rippleState();
    s.household.persons.find((p) => p.id === "rosa")!.can_drive = true; // now Rosa qualifies for TRANSPORT
    const t = s.threads.find((x) => x.id === "thr_leo_tourney")!;
    const r = t.responsibilities.find((x) => x.id === "r_transport")!;
    const { candidates } = rankCandidates(s, reg, t, r, [], now);
    expect(candidates.length).toBe(2);
    // Rosa owns nothing else → lightest load → gets the +1 bonus.
    const rosa = candidates.find((c) => c.id === "rosa")!;
    expect(rosa.reasons.some((x) => x.code === "LOWEST_LOAD")).toBe(true);
  });
});
