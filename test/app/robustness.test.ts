import { describe, expect, test } from "vitest";
import { createThreadApp } from "../../src/app/app.ts";
import { memoryStore } from "../../src/store/memory.ts";
import { operations } from "../../src/schemas/index.ts";
import { fakeCalendar, fixedClock } from "../../src/testkit/index.ts";
import { loadSeed, loadStory, pharmacy } from "../helpers.ts";

const HH = "hh_rivera";
const maya = { kind: "person" as const, household_id: HH, person_id: "maya" };
const sam = { kind: "person" as const, household_id: HH, person_id: "sam" };
const sys = { kind: "system" as const, household_id: HH };
const principal = (as: string) => (as === "system" ? sys : { kind: "person" as const, household_id: HH, person_id: as });

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

describe("robustness (core-app-api task 2.5)", () => {
  test("N12: unknown field and oversized title -> VALIDATION_FAILED", async () => {
    const { app } = await world();
    const extraField = await app.getThread(maya, { thread_id: "thr_leo_tourney", bogus: 1 });
    expect(extraField).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    const bigTitle = await app.createThread(maya, {
      title: "x".repeat(5000), objective: "o", event: { start: "2026-10-12T16:00:00-07:00", end: "2026-10-12T17:00:00-07:00", place: "place_home" },
      deadline: "2026-10-12T16:00:00-07:00", participants: ["leo"], responsibilities: [{ type: "TRANSPORT", owner: "maya" }],
    });
    expect(bigTitle).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
  });

  test("N13: same idempotency key with different input -> IDEMPOTENCY_CONFLICT", async () => {
    const { app, clock } = await world();
    await app.reportChange(maya, { change: RIPPLE, idempotency_key: "k1" });
    clock.set("2026-10-08T19:31:00-07:00");
    const conflict = await app.reportChange(maya, { change: { type: "EVENT_MOVED", thread_id: "thr_family_dinner", new_start: "2026-10-10T12:00:00-07:00" }, idempotency_key: "k1" });
    expect(conflict).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_CONFLICT" } });
  });

  test("N14: connector failure on accept -> CONNECTOR_FAILED, stored state byte-identical", async () => {
    const { app, store, clock, cal } = await world();
    await app.reportChange(maya, { change: RIPPLE });
    clock.set("2026-10-08T19:32:00-07:00");
    const ho = await app.requestHandoff(maya, { thread_id: "thr_leo_tourney", responsibility_id: "r_transport" });
    const before = JSON.stringify(await store.load(HH));
    clock.set("2026-10-08T19:33:00-07:00");
    cal.failNext = true;
    const res = await app.respondToHandoff(sam, { handoff_id: (ho as { data: { handoff: { id: string } } }).data.handoff.id, accept: true, confirm_items: ["jersey"], add_to_calendar: true });
    expect(res).toMatchObject({ ok: false, error: { code: "CONNECTOR_FAILED" } });
    expect(JSON.stringify(await store.load(HH))).toBe(before);
  });

  test("N15: sam creates a new transport thread -> thr_1, derived conditions, output valid", async () => {
    const { app, clock } = await world();
    clock.set("2026-10-08T19:30:00-07:00");
    const res = await app.createThread(sam, {
      title: "Piano lesson", objective: "Leo gets to his piano lesson", event: { start: "2026-10-12T16:00:00-07:00", end: "2026-10-12T17:00:00-07:00", place: "place_home" },
      deadline: "2026-10-12T16:00:00-07:00", participants: ["leo"], responsibilities: [{ type: "TRANSPORT", owner: "sam" }],
    });
    expect(res).toMatchObject({ ok: true, data: { thread: { thread_id: "thr_1" } } });
    const data = (res as { data: { thread: { conditions: Array<{ id: string }> } } }).data;
    expect(data.thread.conditions.map((c) => c.id)).toEqual(["c_transport_owner", "c_departure_plan", "c_arrival"]);
    expect(operations.createThread.output.safeParse(data).success).toBe(true);
  });

  test("N16: after the full Golden_Story, nothing shown to sam or the service leaks Atorvastatin", async () => {
    const { app, clock } = await world();
    const samOrServiceOutputs: unknown[] = [];
    const ops = app as unknown as Record<string, (p: unknown, i: unknown) => Promise<unknown>>;
    for (const step of loadStory().steps) {
      clock.set(step.at);
      const op = ops[step.op];
      if (!op) throw new Error(`unknown op ${step.op}`);
      const r = await op(principal(step.as), step.input);
      if (step.as === "sam" || step.as === "svc_pharmacy_delivery") samOrServiceOutputs.push(r);
    }
    const events = await app.events(sys);
    const samInbox = await app.inbox(sam, {});
    const haystack = JSON.stringify(events) + JSON.stringify(samInbox) + JSON.stringify(samOrServiceOutputs);
    expect(haystack).not.toContain("Atorvastatin");
  });
});
