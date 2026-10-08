import { describe, expect, test } from "vitest";
import { createThreadApp } from "../../src/app/app.ts";
import { memoryStore } from "../../src/store/memory.ts";
import { fakeCalendar, fixedClock } from "../../src/testkit/index.ts";
import { loadSeed, loadStory, pharmacy } from "../helpers.ts";

const HH = "hh_rivera";
const principal = (as: string) => (as === "system" ? { kind: "system", household_id: HH } : { kind: "person", household_id: HH, person_id: as });

/** Builds a fresh app on the golden seed and replays every story step. Returns results and the event log. */
export async function playStory() {
  const store = memoryStore();
  const clock = fixedClock("2026-10-08T19:00:00-07:00");
  const app = createThreadApp({ store, clock, providers: [pharmacy()], calendar: fakeCalendar() });
  const init = await app.initHousehold(loadSeed());
  if (!init.ok) throw new Error(JSON.stringify(init.error));
  const results: Array<{ id: string; op: string; input: unknown; result: unknown; expect: unknown }> = [];
  for (const step of loadStory().steps) {
    clock.set(step.at);
    const op = (app as unknown as Record<string, (p: unknown, i: unknown) => Promise<unknown>>)[step.op];
    if (!op) throw new Error(`unknown op ${step.op}`);
    results.push({ id: step.id, op: step.op, input: step.input, result: await op(principal(step.as), step.input), expect: step.expect });
  }
  const log = await app.events({ kind: "system", household_id: HH });
  return { results, events: log.ok ? log.data.events : [], state: await store.load(HH) };
}

describe("golden ripple story (fixtures/golden/ripple-story.json)", async () => {
  const { results } = await playStory();
  for (const r of results) {
    test(r.id, () => {
      expect(r.result).toMatchObject(r.expect as object);
    });
  }
});

test("replay is deterministic: identical event log and state", async () => {
  const a = await playStory();
  const b = await playStory();
  expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
  expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
});
