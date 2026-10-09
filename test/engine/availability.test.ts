import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { conflicts } from "../../src/engine/availability.ts";
import type { HouseholdState, Thread, Window } from "../../src/model/schemas.ts";
import { seedState, registry } from "../helpers.ts";

const thread = (s: HouseholdState, id: string): Thread => s.threads.find((t) => t.id === id)!;
const windowOf = (s: HouseholdState, threadId: string, rid: string): Window =>
  thread(s, threadId).responsibilities.find((r) => r.id === rid)!.window;

describe("availability (task 5.1)", () => {
  test("(a) a busy interval returns a BUSY conflict against maya's transport window", () => {
    const s = seedState();
    // maya busy Sat 07:00–13:00 local = 14:00Z–20:00Z, overlaps 07:55–12:30 transport window
    s.busy.push({ id: "busy_1", person: "maya", start: "2026-10-10T07:00:00-07:00", end: "2026-10-10T13:00:00-07:00", withheld_label: "Busy" });
    const w = windowOf(s, "thr_leo_tourney", "r_transport");
    const out = conflicts(s, registry, "maya", w, "thr_rosa_refill");
    expect(out.map((c) => c.code)).toContain("BUSY");
  });

  test("(b) a THREAD block for an ACCEPTED transport in another thread -> COMMITMENT with 'until 12:30 PM (accepted earlier)'", () => {
    const s = seedState();
    const tourney = thread(s, "thr_leo_tourney");
    const rT = tourney.responsibilities.find((r) => r.id === "r_transport")!;
    rT.owner = "sam";
    rT.status = "ACCEPTED";
    rT.block = { block_id: "blk_1", start: rT.window.start, end: rT.window.end };
    const refillWindow = windowOf(s, "thr_rosa_refill", "r_pickup");
    const out = conflicts(s, registry, "sam", refillWindow, "thr_rosa_refill");
    expect(out).toEqual([{ code: "COMMITMENT", text: "driving Leo until 12:30 PM (accepted earlier)" }]);
  });

  test("(c) the same call with exceptThreadId thr_leo_tourney returns []", () => {
    const s = seedState();
    const tourney = thread(s, "thr_leo_tourney");
    const rT = tourney.responsibilities.find((r) => r.id === "r_transport")!;
    rT.owner = "sam";
    rT.status = "ACCEPTED";
    rT.block = { block_id: "blk_1", start: rT.window.start, end: rT.window.end };
    const refillWindow = windowOf(s, "thr_rosa_refill", "r_pickup");
    expect(conflicts(s, registry, "sam", refillWindow, "thr_leo_tourney")).toEqual([]);
  });

  test("(d) r_jersey (BRING_ITEM) never conflicts", () => {
    const s = seedState();
    const tourney = thread(s, "thr_leo_tourney");
    const rJ = tourney.responsibilities.find((r) => r.id === "r_jersey")!;
    // even with a block, a non-exclusive BRING_ITEM must not block anyone
    (rJ as { block?: unknown }).block = { block_id: "blk_j", start: rJ.window.start, end: rJ.window.end };
    rJ.owner = "sam";
    rJ.status = "ACCEPTED";
    expect(conflicts(s, registry, "sam", rJ.window, "thr_rosa_refill")).toEqual([]);
  });

  test("(e) overlapping planned ownership with no blocks does not make maya busy", () => {
    const s = seedState();
    const pickupWindow = windowOf(s, "thr_rosa_refill", "r_pickup");
    // maya owns r_transport (tourney) and r_pickup (refill), both without blocks
    expect(conflicts(s, registry, "maya", pickupWindow, "thr_rosa_refill")).toEqual([]);
  });

  test("property 4: same-thread and non-exclusive duties never conflict for a busy-free person", () => {
    fc.assert(
      fc.property(fc.constantFrom("thr_leo_tourney", "thr_rosa_refill", "thr_family_dinner"), (threadId) => {
        const s = seedState();
        s.busy = []; // busy-free person
        const w = windowOf(s, "thr_leo_tourney", "r_transport");
        // Only same-thread and BRING_ITEM remain; no exclusive out-of-thread block exists in the seed.
        return conflicts(s, registry, "maya", w, threadId).length === 0;
      }),
    );
  });
});
