import { describe, expect, test } from "vitest";
import { createThreadApp } from "../../src/app/app.ts";
import { memoryStore } from "../../src/store/memory.ts";
import { fakeCalendar, fixedClock } from "../../src/testkit/index.ts";
import { loadSeed, loadStory, pharmacy } from "../helpers.ts";

const HH = "hh_rivera";
const person = (id: string) => ({ kind: "person" as const, household_id: HH, person_id: id });
const sys = { kind: "system" as const, household_id: HH };

/** Fresh app on the golden seed, clock at the negatives' baseline, with the pharmacy fake and a fake calendar. */
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

/** Replays the golden story steps up to and including step with id `untilId`. */
async function playTo(app: Record<string, (p: unknown, i: unknown) => Promise<unknown>>, clock: { set: (iso: string) => void }, untilId: string) {
  for (const step of loadStory().steps) {
    clock.set(step.at);
    const p = step.as === "system" ? sys : person(step.as);
    const op = app[step.op];
    if (!op) throw new Error(`unknown op ${step.op}`);
    await op(p, step.input);
    if (step.id === untilId) break;
  }
}

describe("authorization (core-app-api task 2.1)", () => {
  test("N2: sam reports maya's availability -> FORBIDDEN", async () => {
    const { app } = await world();
    const res = await app.reportChange(person("sam"), { change: RIPPLE });
    expect(res).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  test("N10: request transport with candidate rosa -> NOT_ELIGIBLE", async () => {
    const { app } = await world();
    await app.reportChange(person("maya"), { change: RIPPLE });
    const res = await app.requestHandoff(person("maya"), { thread_id: "thr_leo_tourney", responsibility_id: "r_transport", candidate: "rosa" });
    expect(res).toMatchObject({
      ok: false,
      error: { code: "NOT_ELIGIBLE", message: "Rosa can't take Transport: doesn't drive.", next_steps: ["Ask Sam", "Change the plan"] },
    });
  });

  test("N11: cross-visibility getThread -> NOT_FOUND", async () => {
    const { app } = await world();
    const samSeesRefill = await app.getThread(person("sam"), { thread_id: "thr_rosa_refill" });
    expect(samSeesRefill).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const otherHousehold = await app.getThread({ kind: "person", household_id: "hh_other", person_id: "maya" }, { thread_id: "thr_leo_tourney" });
    expect(otherHousehold).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  test("ingestSignal and tick as a person -> FORBIDDEN", async () => {
    const { app } = await world();
    const ingest = await app.ingestSignal(person("maya"), { signal: { type: "PERSON_BUSY", person: "sam", start: "2026-10-10T06:00:00-07:00", end: "2026-10-10T14:00:00-07:00", source_id: "x1" } });
    expect(ingest).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    const tick = await app.tick(person("maya"), {});
    expect(tick).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  test("s09: sam cannot approve maya's TRANSACT -> WRONG_PRINCIPAL, no act() call", async () => {
    const { app, clock, ph } = await world();
    await playTo(app as never, clock, "s08_refill_rerank_to_service");
    clock.set("2026-10-08T19:34:30-07:00");
    const res = await app.confirmAction(person("sam"), { confirmation_id: "cf_1", approve: true });
    expect(res).toMatchObject({ ok: false, error: { code: "WRONG_PRINCIPAL" } });
    expect(ph.calls.filter((c) => c.startsWith("act:"))).toEqual([]);
  });
});
