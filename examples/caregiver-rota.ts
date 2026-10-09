// Example: a caregiving rota with a custom responsibility type (COVER_VISIT).
// thread-core knows nothing about households or tournaments: types are registered at runtime.
import { createThreadApp, memoryStore, householdTypes, type ResponsibilityType } from "../src/index.ts";
import { fixedClock } from "../src/testkit/index.ts";

const COVER_VISIT: ResponsibilityType = {
  type: "COVER_VISIT",
  label: () => "Visit",
  defaultId: () => "r_visit",
  requiresItem: false,
  exclusive: true,
  window: (t) => ({ start: t.event.start, end: t.event.end }),
  conditions: (t) => [
    { id: "c_visit_owner", phase: "PRE", min_strength: "ATTESTED", label: "Visitor confirmed", owner: true },
    { id: "c_visited", phase: "OUTCOME", min_strength: "ATTESTED", label: "Visit happened", owner: false, window: { start: t.event.start, end: t.event.end } },
  ],
  context_needs: { person: ["event_time", "place", "beneficiary"].map((key) => ({ key, required: true })), service: [] },
  busyText: (t, _r, env) => `visiting ${t.beneficiary ? env.personName(t.beneficiary) : "someone"}`,
};

export async function main(log: (line: string) => void = console.log) {
  const clock = fixedClock("2026-10-12T09:00:00-07:00");
  const app = createThreadApp({ store: memoryStore(), clock, types: [...householdTypes, COVER_VISIT] });
  const hh = "hh_care";
  await app.initHousehold({
    household: {
      id: hh, name: "Care circle for Ada", timezone: "America/Los_Angeles", home_place: "place_ada",
      persons: [
        { id: "ada", name: "Ada", adult: true, has_account: false, can_drive: false, guardian_of: [] },
        { id: "ben", name: "Ben", adult: true, has_account: true, can_drive: true, guardian_of: [] },
        { id: "cleo", name: "Cleo", adult: true, has_account: true, can_drive: true, guardian_of: [] },
      ],
      places: [{ id: "place_ada", name: "Ada's flat", travel_minutes: 20 }],
    },
    facts: [],
    threads: [{
      created_by: "ben", created_at: "2026-10-11T18:00:00-07:00",
      input: {
        id: "thr_tue_visit", title: "Tuesday visit to Ada", objective: "Someone checks in on Ada on Tuesday afternoon",
        beneficiary: "ada", event: { start: "2026-10-13T14:00:00-07:00", end: "2026-10-13T15:00:00-07:00", place: "place_ada" },
        deadline: "2026-10-13T15:00:00-07:00", participants: ["ben", "cleo"],
        responsibilities: [{ id: "r_visit", type: "COVER_VISIT", owner: "ben" }],
      },
    }],
  });
  const ben = { kind: "person", household_id: hh, person_id: "ben" } as const;
  const cleo = { kind: "person", household_id: hh, person_id: "cleo" } as const;
  const ripple = await app.reportChange(ben, { change: { type: "PERSON_UNAVAILABLE", person: "ben", start: "2026-10-13T13:00:00-07:00", end: "2026-10-13T17:00:00-07:00" } });
  if (!ripple.ok) throw new Error(ripple.error.message);
  for (const t of ripple.data.threads) log(`${t.title}: ${t.severity} — ${t.why.join(" ")}`);
  const ho = await app.requestHandoff(ben, { thread_id: "thr_tue_visit", responsibility_id: "r_visit" });
  if (!ho.ok) throw new Error(ho.error.message);
  log(`Asked ${ho.data.handoff.to}; shared: ${ho.data.receipt.shared.map((s) => s.label).join(", ")}; withheld: ${ho.data.receipt.withheld.map((w) => w.label).join(", ")}`);
  const acc = await app.respondToHandoff(cleo, { handoff_id: ho.data.handoff.id, accept: true });
  if (!acc.ok) throw new Error(acc.error.message);
  log(`After Cleo accepts: ${acc.data.thread.status}`);
  clock.set("2026-10-13T14:40:00-07:00");
  const done = await app.recordEvidence(cleo, { thread_id: "thr_tue_visit", condition_id: "c_visited", note: "Ada is well" });
  if (!done.ok) throw new Error(done.error.message);
  log(`After the visit: ${done.data.thread.status}`);
}

if (import.meta.main) await main();
