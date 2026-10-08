import { describe, expect, test } from "vitest";
import { createThreadApp } from "../../src/app/app.ts";
import { memoryStore } from "../../src/store/memory.ts";
import { fakeCalendar, fixedClock } from "../../src/testkit/index.ts";
import { loadSeed, loadStory, pharmacy } from "../helpers.ts";

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

async function playTo(app: Record<string, (p: unknown, i: unknown) => Promise<unknown>>, clock: { set: (iso: string) => void }, untilId: string) {
  for (const step of loadStory().steps) {
    clock.set(step.at);
    const p = step.as === "system" ? sys : { kind: "person" as const, household_id: HH, person_id: step.as };
    const op = app[step.op];
    if (!op) throw new Error(`unknown op ${step.op}`);
    await op(p, step.input);
    if (step.id === untilId) break;
  }
}

const resp = (r: unknown) => r as { ok: boolean; data: { handoff: { id: string; status: string }; thread: { status: string; responsibilities: Array<{ id: string; owner: string; status: string }> }; confirmation?: { confirmation_id: string; kind: string }; next_candidate?: unknown } };

describe("handoffs (core-app-api task 2.3)", () => {
  test("N3: sam declines -> handoff DECLINED, thread AT_RISK, owner still maya, no next candidate", async () => {
    const { app, clock } = await world();
    await app.reportChange(maya, { change: RIPPLE });
    clock.set("2026-10-08T19:32:00-07:00");
    const ho = resp(await app.requestHandoff(maya, { thread_id: "thr_leo_tourney", responsibility_id: "r_transport" }));
    clock.set("2026-10-08T19:33:00-07:00");
    const r = resp(await app.respondToHandoff(sam, { handoff_id: ho.data.handoff.id, accept: false }));
    expect(r.data.handoff.status).toBe("DECLINED");
    expect(r.data.thread.status).toBe("AT_RISK");
    expect(r.data.thread.responsibilities.find((x) => x.id === "r_transport")).toMatchObject({ owner: "maya", status: "AT_RISK" });
    expect(r.data.next_candidate).toBeUndefined();
  });

  test("N4: sam accepts add_to_calendar:false -> ACTIVE + MODIFY cf_1; approve then record jersey -> PLAN_SECURED", async () => {
    const { app, clock, cal } = await world();
    await app.reportChange(maya, { change: RIPPLE });
    clock.set("2026-10-08T19:32:00-07:00");
    const ho = resp(await app.requestHandoff(maya, { thread_id: "thr_leo_tourney", responsibility_id: "r_transport" }));
    clock.set("2026-10-08T19:33:00-07:00");
    const accepted = resp(await app.respondToHandoff(sam, { handoff_id: ho.data.handoff.id, accept: true, add_to_calendar: false }));
    expect(accepted.data.thread.status).toBe("ACTIVE");
    expect(accepted.data.thread.responsibilities.find((x) => x.id === "r_transport")?.status).toBe("ACCEPTED");
    expect(accepted.data.confirmation).toMatchObject({ confirmation_id: "cf_1", kind: "MODIFY" });
    expect(cal.blocks.size).toBe(0);

    clock.set("2026-10-08T19:33:30-07:00");
    const approved = await app.confirmAction(sam, { confirmation_id: "cf_1", approve: true });
    const ad = approved as { ok: boolean; data: { thread: { status: string; conditions: Array<{ id: string; satisfied: boolean }> } } };
    expect(ad.data.thread.conditions.find((c) => c.id === "c_departure_plan")?.satisfied).toBe(true);
    expect(ad.data.thread.status).toBe("ACTIVE");

    clock.set("2026-10-08T19:34:00-07:00");
    const jersey = await app.recordEvidence(sam, { thread_id: "thr_leo_tourney", condition_id: "c_jersey" });
    expect(jersey).toMatchObject({ ok: true, data: { remaining: ["c_arrival"], thread: { status: "PLAN_SECURED" } } });
  });

  test("TRANSACT reject: maya rejects cf_1 -> handoff CANCELLED, r_pickup AT_RISK", async () => {
    const { app, store, clock } = await world();
    await playTo(app as never, clock, "s08_refill_rerank_to_service");
    clock.set("2026-10-08T19:35:00-07:00");
    const rejected = await app.confirmAction(maya, { confirmation_id: "cf_1", approve: false });
    const rd = rejected as { ok: boolean; data: { confirmation: { status: string }; thread: { responsibilities: Array<{ id: string; status: string }> } } };
    expect(rd.ok).toBe(true);
    expect(rd.data.confirmation.status).toBe("REJECTED");
    expect(rd.data.thread.responsibilities.find((x) => x.id === "r_pickup")?.status).toBe("AT_RISK");
    const loaded = await store.load(HH) as { state: { handoffs: Array<{ id: string; status: string }> } };
    expect(loaded.state.handoffs.find((h) => h.id === "ho_2")?.status).toBe("CANCELLED");
  });

  test("repeated requestHandoff while pending -> same handoff id", async () => {
    const { app, clock } = await world();
    await app.reportChange(maya, { change: RIPPLE });
    clock.set("2026-10-08T19:32:00-07:00");
    const first = resp(await app.requestHandoff(maya, { thread_id: "thr_leo_tourney", responsibility_id: "r_transport" }));
    clock.set("2026-10-08T19:32:30-07:00");
    const second = resp(await app.requestHandoff(maya, { thread_id: "thr_leo_tourney", responsibility_id: "r_transport" }));
    expect(second.data.handoff.id).toBe(first.data.handoff.id);
  });
});
