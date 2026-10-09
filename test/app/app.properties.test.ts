import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { createThreadApp } from "../../src/app/app.ts";
import { memoryStore } from "../../src/store/memory.ts";
import { deriveStatus } from "../../src/engine/status.ts";
import { fakeCalendar, fixedClock } from "../../src/testkit/index.ts";
import { loadSeed, loadStory, pharmacy } from "../helpers.ts";
import type { Evidence, HouseholdState, Thread } from "../../src/model/schemas.ts";

const HH = "hh_rivera";
const sys = { kind: "system" as const, household_id: HH };
const principal = (as: string) => (as === "system" ? sys : { kind: "person" as const, household_id: HH, person_id: as });
const iso = (at: string) => new Date(at).toISOString();

const MUTATING = new Set(["createThread", "reportChange", "ingestSignal", "requestHandoff", "respondToHandoff", "recordEvidence", "confirmAction", "tick"]);

async function freshApp() {
  const store = memoryStore();
  const clock = fixedClock("2026-10-08T19:00:00-07:00");
  const app = createThreadApp({ store, clock, providers: [pharmacy()], calendar: fakeCalendar() });
  const init = await app.initHousehold(loadSeed());
  if (!init.ok) throw new Error(JSON.stringify(init.error));
  return { app: app as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>, store, clock };
}

/** Replays golden steps whose id is in `ids` (in story order), setting the clock each time. */
async function replay(app: Record<string, (...args: unknown[]) => Promise<unknown>>, clock: { set: (iso: string) => void }, ids: Set<string>) {
  const played: Array<{ step: { id: string; at: string; op: string; as: string; input: unknown }; result: unknown }> = [];
  for (const step of loadStory().steps) {
    if (!ids.has(step.id)) continue;
    clock.set(step.at);
    const op = app[step.op];
    if (!op) throw new Error(`unknown op ${step.op}`);
    played.push({ step, result: await op(principal(step.as), step.input) });
  }
  return played;
}

describe("app properties (core-app-api task 4.2)", () => {
  test("Property 1: authorization cannot be bypassed by input (respondToHandoff ho_1 as maya/rosa)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("maya", "rosa"),
        fc.boolean(),
        fc.subarray(["jersey"]),
        fc.option(fc.boolean(), { nil: undefined }),
        async (who, accept, confirm_items, add_to_calendar) => {
          const { app, store, clock } = await freshApp();
          await replay(app, clock, new Set(["s01_weekend_overview", "s02_ripple", "s03_handoff_to_sam"]));
          const before = JSON.stringify(await store.load(HH));
          clock.set("2026-10-08T19:33:00-07:00");
          const input: Record<string, unknown> = { handoff_id: "ho_1", accept, confirm_items };
          if (add_to_calendar !== undefined) input.add_to_calendar = add_to_calendar;
          const res = await app.respondToHandoff!(principal(who), input);
          expect(res).toMatchObject({ ok: false, error: { code: "WRONG_PRINCIPAL" } });
          expect(JSON.stringify(await store.load(HH))).toBe(before);
        },
      ),
      { numRuns: 30 },
    );
  });

  test("Property 2: repeating the last mutating step with an idempotency_key is idempotent", async () => {
    const steps = loadStory().steps;
    const keyedMutating = steps.filter((s) => MUTATING.has(s.op) && (s.input as { idempotency_key?: string }).idempotency_key);
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: keyedMutating.length - 1 }), async (idx) => {
        const last = keyedMutating[idx]!;
        const prefixIds = new Set<string>();
        for (const s of steps) { prefixIds.add(s.id); if (s.id === last.id) break; }
        const { app, store, clock } = await freshApp();
        const played = await replay(app, clock, prefixIds);
        const first = played.find((p) => p.step.id === last.id)!.result;
        const beforeEvents = (await app.events!(sys) as { data: { events: unknown[] } }).data.events.length;
        clock.set(last.at);
        const repeat = await app[last.op]!(principal(last.as), last.input);
        expect(repeat).toEqual(first);
        const afterEvents = (await app.events!(sys) as { data: { events: unknown[] } }).data.events.length;
        expect(afterEvents).toBe(beforeEvents);
        void store;
      }),
      { numRuns: 30 },
    );
  });

  test("Property 3: thread status always equals deriveStatus after an ok mutating step", async () => {
    const ids = loadStory().steps.map((s) => s.id);
    await fc.assert(
      fc.asyncProperty(fc.subarray(ids, { minLength: 1 }), async (subset) => {
        const subsetSet = new Set(subset);
        const { app, store, clock } = await freshApp();
        for (const step of loadStory().steps) {
          if (!subsetSet.has(step.id)) continue;
          clock.set(step.at);
          const op = app[step.op]!;
          const res = await op(principal(step.as), step.input) as { ok: boolean };
          if (!res.ok || !MUTATING.has(step.op)) continue;
          const loaded = await store.load(HH) as { state: HouseholdState };
          for (const t of loaded.state.threads as Thread[]) {
            const ev = (loaded.state.evidence as Evidence[]).filter((e) => e.thread_id === t.id);
            expect(t.status, `${t.id} after ${step.id}`).toBe(deriveStatus(t, ev, iso(step.at)));
          }
        }
      }),
      { numRuns: 30 },
    );
  });
});
