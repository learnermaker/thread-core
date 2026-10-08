import { describe, test, expect } from "vitest";
import { buildThread, recomputeWindows, type ThreadInput } from "../../src/engine/derive.ts";
import { seedHousehold } from "../../src/engine/seed.ts";
import { OpError } from "../../src/model/errors.ts";
import type { HouseholdState, Thread } from "../../src/model/schemas.ts";
import { loadSeed, registry } from "../helpers.ts";

const now = "2026-10-08T19:30:00-07:00";
const state = () => seedHousehold(loadSeed(), registry);
const thread = (s: HouseholdState, id: string): Thread => s.threads.find((t) => t.id === id)!;

describe("thread derivation (task 4.1)", () => {
  test("tourney windows and condition order", () => {
    const t = thread(state(), "thr_leo_tourney");
    const rT = t.responsibilities.find((r) => r.id === "r_transport")!;
    expect(rT.window).toEqual({ start: "2026-10-10T14:55:00.000Z", end: "2026-10-10T19:30:00.000Z" });
    const rJ = t.responsibilities.find((r) => r.id === "r_jersey")!;
    expect(rJ.window).toEqual({ start: "2026-10-10T14:30:00.000Z", end: "2026-10-10T15:30:00.000Z" });
    expect(t.conditions.map((c) => c.id)).toEqual(["c_transport_owner", "c_departure_plan", "c_jersey", "c_arrival"]);
    const cArrival = t.conditions.find((c) => c.id === "c_arrival")!;
    expect(cArrival.window).toEqual({ start: "2026-10-10T14:30:00.000Z", end: "2026-10-10T15:30:00.000Z" });
  });

  test("other thread windows", () => {
    const s = state();
    expect(thread(s, "thr_rosa_refill").responsibilities.find((r) => r.id === "r_pickup")!.window)
      .toEqual({ start: "2026-10-10T16:00:00.000Z", end: "2026-10-10T19:00:00.000Z" });
    expect(thread(s, "thr_family_dinner").responsibilities.find((r) => r.id === "r_reservation")!.window)
      .toEqual({ start: "2026-10-11T02:00:00.000Z", end: "2026-10-11T04:00:00.000Z" });
  });

  test("creation evidence evd_1..evd_3 by maya for owner conditions", () => {
    const s = state();
    const owned = s.evidence.filter((e) => e.source === "CREATION");
    expect(owned.map((e) => [e.id, e.condition_id, e.actor])).toEqual([
      ["evd_1", "c_transport_owner", "maya"],
      ["evd_2", "c_pickup_owner", "maya"],
      ["evd_3", "c_attend_owner", "maya"],
    ]);
    for (const e of owned) expect(e.strength).toBe("ATTESTED");
  });

  test("the creator is auto-added to participants and default autonomy is COORDINATE", () => {
    const s = state();
    const input: ThreadInput = {
      title: "Solo errand", objective: "test defaults",
      event: { start: "2026-10-10T09:00:00-07:00", end: "2026-10-10T12:00:00-07:00", place: "place_home" },
      deadline: "2026-10-10T12:00:00-07:00",
      participants: ["sam"],
      responsibilities: [{ type: "ATTEND", owner: "maya" }],
    };
    const { thread: t } = buildThread(s, registry, input, "maya", new Date(now).toISOString());
    expect(t.participants).toContain("maya");
    expect(t.autonomy).toBe("COORDINATE");
  });
});

describe("validation errors (task 4.2)", () => {
  const base = {
    title: "x", objective: "y",
    event: { start: "2026-10-10T09:00:00-07:00", end: "2026-10-10T12:00:00-07:00", place: "place_home" },
    deadline: "2026-10-10T12:00:00-07:00",
    participants: ["maya"] as string[],
  };
  const build = (input: ThreadInput) => buildThread(state(), registry, input, "maya", new Date(now).toISOString());
  const expectValidationFailed = (input: ThreadInput) => {
    try {
      build(input);
    } catch (e) {
      expect(e).toBeInstanceOf(OpError);
      expect((e as OpError).body.code).toBe("VALIDATION_FAILED");
      return;
    }
    throw new Error("expected OpError");
  };

  test("unknown type", () => expectValidationFailed({ ...base, responsibilities: [{ type: "FLY", owner: "maya" }] }));
  test("owner leo (minor)", () => expectValidationFailed({ ...base, responsibilities: [{ type: "ATTEND", owner: "leo" }] }));
  test("BRING_ITEM without item", () => expectValidationFailed({ ...base, responsibilities: [{ type: "BRING_ITEM", owner: "maya" }] }));
  test("deadline after event end", () =>
    expectValidationFailed({ ...base, deadline: "2026-10-10T13:00:00-07:00", responsibilities: [{ type: "ATTEND", owner: "maya" }] }));
  test("unknown place", () =>
    expectValidationFailed({ ...base, event: { ...base.event, place: "place_mars" }, responsibilities: [{ type: "ATTEND", owner: "maya" }] }));
  test("duplicate thread id", () =>
    expectValidationFailed({ ...base, id: "thr_leo_tourney", responsibilities: [{ type: "ATTEND", owner: "maya" }] }));
});

describe("recomputeWindows (task 4.3)", () => {
  test("a travel signal moves the transport window start; a block is unchanged", () => {
    const s = state();
    const t = thread(s, "thr_leo_tourney");
    const rT = t.responsibilities.find((r) => r.id === "r_transport")!;
    rT.block = { block_id: "blk_1", start: rT.window.start, end: rT.window.end };
    const beforeBlock = { ...rT.block };
    s.travel.push({ place: "place_riverside", minutes: 40, cause: "heavy rain", source_id: "wx", at: new Date(now).toISOString() });
    recomputeWindows(s, registry);
    // deadline 2026-10-10T15:30:00Z - 40 travel - 10 buffer = 14:40Z
    expect(t.responsibilities.find((r) => r.id === "r_transport")!.window.start).toBe("2026-10-10T14:40:00.000Z");
    expect(t.responsibilities.find((r) => r.id === "r_transport")!.block).toEqual(beforeBlock);
  });
});
