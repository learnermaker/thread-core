// Example: agents are modeled as principals with accounts — the same identity rules as people.
// An agent reports a rate-limit two days early, hands off to a backup, and the ledger requires
// evidence from the responsible party to resolve (not from an observer like the human reviewer).
import { createThreadApp, memoryStore, householdTypes, type ResponsibilityType } from "../src/index.ts";
import { fixedClock } from "../src/testkit/index.ts";

const DELIVER_REPORT: ResponsibilityType = {
  type: "DELIVER_REPORT",
  label: () => "Deliver report",
  defaultId: () => "r_report",
  requiresItem: false,
  exclusive: true,
  window: (t) => ({ start: t.event.start, end: t.event.end }),
  conditions: (t) => [
    { id: "c_report_owner",    phase: "PRE",     min_strength: "ATTESTED", label: "Owner confirmed",           owner: true },
    // owner: false — this is an outcome condition that must be explicitly attested by whoever is responsible
    { id: "c_report_accepted", phase: "OUTCOME", min_strength: "ATTESTED", label: "Report accepted by reviewer",
      owner: false, window: { start: t.event.start, end: t.event.end } },
  ],
  context_needs: { person: ["event_time", "beneficiary"].map((key) => ({ key, required: true })), service: [] },
  busyText: () => "delivering the weekly report",
};

export async function main(log: (line: string) => void = console.log) {
  // Clock starts two days before the Friday report, so impact is HIGH (not CRITICAL).
  const clock = fixedClock("2026-10-14T08:00:00Z");
  const app = createThreadApp({ store: memoryStore(), clock, types: [...householdTypes, DELIVER_REPORT] });
  const hh = "hh_lab";

  await app.initHousehold({
    household: {
      id: hh, name: "Research lab", timezone: "UTC", home_place: "place_lab",
      persons: [
        { id: "agent_research", name: "Research agent", adult: true, has_account: true, can_drive: false, guardian_of: [] },
        { id: "agent_backup",   name: "Backup agent",   adult: true, has_account: true, can_drive: false, guardian_of: [] },
        { id: "maria",          name: "Maria",          adult: true, has_account: true, can_drive: false, guardian_of: [] },
      ],
      places: [{ id: "place_lab", name: "Lab", travel_minutes: 0 }],
    },
    facts: [],
    threads: [{
      created_by: "agent_research", created_at: "2026-10-12T10:00:00Z",
      input: {
        id: "thr_weekly_report",
        title: "Weekly report",
        objective: "Agent delivers the weekly research summary by noon Friday",
        beneficiary: "maria",
        event: { start: "2026-10-16T09:00:00Z", end: "2026-10-16T12:00:00Z", place: "place_lab" },
        deadline: "2026-10-16T12:00:00Z",
        participants: ["agent_research", "agent_backup", "maria"],
        autonomy: "COORDINATE",
        responsibilities: [{ id: "r_report", type: "DELIVER_REPORT", owner: "agent_research" }],
      },
    }],
  });

  const research = { kind: "person", household_id: hh, person_id: "agent_research" } as const;
  const backup   = { kind: "person", household_id: hh, person_id: "agent_backup"   } as const;
  const maria    = { kind: "person", household_id: hh, person_id: "maria"           } as const;

  // 1. agent_research reports it will be rate-limited during the report window (two days early → HIGH not CRITICAL)
  clock.set("2026-10-14T08:35:00Z");
  const ripple = await app.reportChange(research, {
    change: { type: "PERSON_UNAVAILABLE", person: "agent_research", start: "2026-10-16T08:00:00Z", end: "2026-10-16T13:00:00Z" },
  });
  if (!ripple.ok) throw new Error(ripple.error.message);
  for (const t of ripple.data.threads) log(`${t.title}: ${t.severity} — ${t.why.join(" ")}`);

  // 2. agent_research hands off to agent_backup; log the minimum-context receipt
  clock.set("2026-10-14T08:36:00Z");
  const ho = await app.requestHandoff(research, { thread_id: "thr_weekly_report", responsibility_id: "r_report" });
  if (!ho.ok) throw new Error(ho.error.message);
  log(`Asked ${ho.data.handoff.to}; shared: ${ho.data.receipt.shared.map((s) => s.label).join(", ")}; withheld: ${ho.data.receipt.withheld.map((w) => w.label).join(", ")}`);

  // 3. agent_backup accepts; PRE condition auto-satisfied → PLAN_SECURED
  clock.set("2026-10-14T08:37:00Z");
  const acc = await app.respondToHandoff(backup, { handoff_id: ho.data.handoff.id, accept: true });
  if (!acc.ok) throw new Error(acc.error.message);
  log(`After backup accepts: ${acc.data.thread.status}`);

  // 4. maria (the human reviewer) tries to attest the outcome — she is not the responsible person
  clock.set("2026-10-16T11:30:00Z");
  const mariaEv = await app.recordEvidence(maria, { thread_id: "thr_weekly_report", condition_id: "c_report_accepted" });
  if (!mariaEv.ok) throw new Error(mariaEv.error.message);
  log(`Maria's evidence: ${mariaEv.data.evidence.satisfied ? "satisfied" : mariaEv.data.evidence.reason ?? "not satisfied"}`);

  // 5. agent_backup (the current owner) attests → RESOLVED
  clock.set("2026-10-16T11:31:00Z");
  const done = await app.recordEvidence(backup, { thread_id: "thr_weekly_report", condition_id: "c_report_accepted", note: "Report delivered to Maria" });
  if (!done.ok) throw new Error(done.error.message);
  log(`After backup attests: ${done.data.thread.status}`);
  log("Ledger: responsibility moved research → backup with a receipt; resolved on the owner's evidence.");
}

if (import.meta.main) await main();
