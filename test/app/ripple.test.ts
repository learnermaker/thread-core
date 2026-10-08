import { describe, expect, test } from "vitest";
import { createThreadApp } from "../../src/app/app.ts";
import { memoryStore } from "../../src/store/memory.ts";
import { fakeCalendar, fixedClock } from "../../src/testkit/index.ts";
import { loadSeed, pharmacy } from "../helpers.ts";

const HH = "hh_rivera";
const maya = { kind: "person" as const, household_id: HH, person_id: "maya" };
const sam = { kind: "person" as const, household_id: HH, person_id: "sam" };
const sys = { kind: "system" as const, household_id: HH };

async function world(mutateSeed?: (s: ReturnType<typeof loadSeed>) => void) {
  const store = memoryStore();
  const clock = fixedClock("2026-10-08T19:30:00-07:00");
  const ph = pharmacy();
  const cal = fakeCalendar();
  const app = createThreadApp({ store, clock, providers: [ph], calendar: cal });
  const seed = loadSeed();
  mutateSeed?.(seed);
  const init = await app.initHousehold(seed);
  if (!init.ok) throw new Error(JSON.stringify(init.error));
  return { app, store, clock, cal, ph };
}

const RIPPLE = { type: "PERSON_UNAVAILABLE", person: "maya", start: "2026-10-10T07:00:00-07:00", end: "2026-10-10T13:00:00-07:00" } as const;

describe("the ripple (core-app-api task 2.2)", () => {
  test("N1: maya unavailable Sun outside every window -> all NONE, id-ordered, no proposals", async () => {
    const { app } = await world();
    const res = await app.reportChange(maya, { change: { type: "PERSON_UNAVAILABLE", person: "maya", start: "2026-10-11T10:00:00-07:00", end: "2026-10-11T12:00:00-07:00" } });
    expect(res).toMatchObject({
      ok: true,
      data: {
        threads: [
          { thread_id: "thr_family_dinner", severity: "NONE", status: "PLAN_SECURED" },
          { thread_id: "thr_leo_tourney", severity: "NONE", status: "ACTIVE" },
          { thread_id: "thr_rosa_refill", severity: "NONE", status: "PLAN_SECURED" },
        ],
        proposals: [],
      },
    });
  });

  test("N7: after RIPPLE, maya moves dinner into her gap -> only dinner reported HIGH/AT_RISK", async () => {
    const { app, clock } = await world();
    await app.reportChange(maya, { change: RIPPLE });
    clock.set("2026-10-08T19:32:00-07:00");
    const res = await app.reportChange(maya, { change: { type: "EVENT_MOVED", thread_id: "thr_family_dinner", new_start: "2026-10-10T12:00:00-07:00" } });
    expect(res).toMatchObject({ ok: true, data: { threads: [{ thread_id: "thr_family_dinner", severity: "HIGH", status: "AT_RISK" }] } });
    expect((res as { data: { threads: unknown[] } }).data.threads).toHaveLength(1);
  });

  test("N8: sam also unavailable -> tourney CRITICAL/NEEDS_ATTENTION, handoff NO_ELIGIBLE_CANDIDATE", async () => {
    const { app, clock } = await world();
    await app.reportChange(sam, { change: { type: "PERSON_UNAVAILABLE", person: "sam", start: "2026-10-10T06:00:00-07:00", end: "2026-10-10T14:00:00-07:00" } });
    clock.set("2026-10-08T19:31:00-07:00");
    const ripple = await app.reportChange(maya, { change: RIPPLE });
    const tourney = (ripple as { data: { threads: Array<{ thread_id: string; severity: string; status: string }> } }).data.threads.find((t) => t.thread_id === "thr_leo_tourney");
    expect(tourney).toMatchObject({ severity: "CRITICAL", status: "NEEDS_ATTENTION" });
    clock.set("2026-10-08T19:32:00-07:00");
    const handoff = await app.requestHandoff(maya, { thread_id: "thr_leo_tourney", responsibility_id: "r_transport" });
    expect(handoff).toMatchObject({ ok: false, error: { code: "NO_ELIGIBLE_CANDIDATE" } });
  });

  test("N9: refill autonomy ACT + sam can't drive -> no act(), refill HIGH, service recommended", async () => {
    const { app, ph } = await world((s) => {
      const refill = s.threads.find((t) => t.input.id === "thr_rosa_refill")!;
      refill.input.autonomy = "ACT";
      s.household.persons.find((p) => p.id === "sam")!.can_drive = false;
    });
    const res = await app.reportChange(maya, { change: RIPPLE });
    expect(ph.calls.filter((c) => c.startsWith("act:"))).toEqual([]);
    const data = (res as { data: { threads: Array<{ thread_id: string; severity: string }>; proposals: Array<{ thread_id: string; recommended: { kind: string } | null }> } }).data;
    expect(data.threads.find((t) => t.thread_id === "thr_rosa_refill")?.severity).toBe("HIGH");
    expect(data.proposals.find((p) => p.thread_id === "thr_rosa_refill")?.recommended?.kind).toBe("service");
  });

  test("duplicate ingestSignal (same source_id) -> duplicate:true, no new events", async () => {
    const { app, clock } = await world();
    clock.set("2026-10-10T07:05:00-07:00");
    await app.ingestSignal(sys, { signal: { type: "TRAVEL_TIME_CHANGED", place: "place_riverside", minutes: 40, cause: "heavy rain", source_id: "wx_dup" } });
    const before = await app.events(sys);
    const beforeCount = (before as { data: { events: unknown[] } }).data.events.length;
    clock.set("2026-10-10T07:05:30-07:00");
    const again = await app.ingestSignal(sys, { signal: { type: "TRAVEL_TIME_CHANGED", place: "place_riverside", minutes: 40, cause: "heavy rain", source_id: "wx_dup" } });
    expect(again).toMatchObject({ ok: true, data: { duplicate: true, threads: [], proposals: [], automatic_actions: [] } });
    const after = await app.events(sys);
    expect((after as { data: { events: unknown[] } }).data.events.length).toBe(beforeCount);
  });
});
