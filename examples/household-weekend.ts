// Example: the Rivera household weekend, replayed from the golden story.
// Shows how a schedule change ripples through threads, triggers handoffs, and reaches resolution.
import { readFileSync } from "node:fs";
import { createThreadApp, memoryStore } from "../src/index.ts";
import { fixedClock, fakeCalendar, fakeServiceProvider, type FakeServiceConfig } from "../src/testkit/index.ts";

type Step = { id: string; at: string; op: string; as: string; input: unknown };

export async function main(log: (line: string) => void = console.log) {
  const base = new URL("../", import.meta.url);
  const seed = JSON.parse(readFileSync(new URL("fixtures/golden/rivera-seed.json", base), "utf8")) as {
    household: { id: string };
    threads: Array<{ input: { id: string; title: string } }>;
    providers: Record<string, Omit<FakeServiceConfig, "id">>;
    facts: unknown[];
  };
  const story = JSON.parse(readFileSync(new URL("fixtures/golden/ripple-story.json", base), "utf8")) as { steps: Step[] };

  const HH = seed.household.id;
  const titles: Record<string, string> = Object.fromEntries(seed.threads.map((t) => [t.input.id, t.input.title]));
  const providers = Object.entries(seed.providers).map(([id, cfg]) => fakeServiceProvider({ id, ...cfg }));

  const clock = fixedClock("2026-10-08T19:00:00-07:00");
  const app = createThreadApp({ store: memoryStore(), clock, providers, calendar: fakeCalendar() });

  const init = await app.initHousehold(seed);
  if (!init.ok) throw new Error(init.error.message);

  type OpFn = (p: unknown, i: unknown) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: { message: string; code?: string } }>;
  const ops = app as unknown as Record<string, OpFn>;
  const steps = story.steps;

  for (const step of steps) {
    clock.set(step.at);
    const r = await ops[step.op]!(
      step.as === "system"
        ? { kind: "system", household_id: HH }
        : { kind: "person", household_id: HH, person_id: step.as },
      step.input,
    );
    if (!r.ok) {
      log(`${step.id}: ${r.error?.code ?? "error"}`);
      continue;
    }
    const d = r.data!;

    if (step.op === "reportChange") {
      const threads = d.threads as Array<{ thread_id: string; severity: string }>;
      const parts = threads.map((t) => {
        const suffix = t.severity === "NONE" ? " (not affected)" : "";
        return `${titles[t.thread_id] ?? t.thread_id} ${t.severity}${suffix}`;
      });
      log(`${step.id}: ${parts.join(" · ")}`);
    } else if (step.op === "requestHandoff") {
      const req = d.requires_confirmation as { summary?: string } | undefined;
      if (req?.summary) {
        log(`${step.id}: needs confirmation: ${req.summary}`);
      } else {
        const ho = d.handoff as { to: string; status: string };
        log(`${step.id}: handoff → ${ho.to} (${ho.status})`);
      }
    } else if (step.op === "respondToHandoff") {
      const thread = d.thread as { status: string };
      log(`${step.id}: ${thread.status}`);
    } else if (step.op === "confirmAction") {
      const thread = d.thread as { status: string };
      log(`${step.id}: ${thread.status}`);
    } else if (step.op === "listThreads") {
      const threads = d.threads as Array<{ thread_id: string; status: string }>;
      const parts = threads.map((t) => `${titles[t.thread_id] ?? t.thread_id} ${t.status}`);
      if (step.id === steps.at(-1)?.id) {
        log(`Weekend: ${parts.join(" · ")}`);
      } else {
        log(`${step.id}: ${parts.join(" · ")}`);
      }
    } else if (step.op === "ingestSignal") {
      const dup = d.duplicate as boolean;
      if (dup) {
        log(`${step.id}: duplicate (ignored)`);
      } else {
        const threads = d.threads as Array<{ thread_id: string; severity: string; why?: string[] }>;
        if (threads.length > 0) {
          const t = threads[0];
          if (t) log(`${step.id}: ${titles[t.thread_id] ?? t.thread_id} ${t.severity} — ${(t.why ?? []).join(" ")}`);
        } else {
          log(`${step.id}: no threads affected`);
        }
      }
    } else if (step.op === "tick") {
      const changed = d.changed as Array<{ thread_id: string; from: string; to: string }>;
      if (changed.length > 0) {
        log(`${step.id}: ${changed.map((c) => `${titles[c.thread_id] ?? c.thread_id} ${c.from} → ${c.to}`).join(", ")}`);
      } else {
        log(`${step.id}: no change`);
      }
    } else if (step.op === "recordEvidence") {
      const thread = d.thread as { thread_id: string; status: string };
      log(`${step.id}: ${titles[thread.thread_id] ?? thread.thread_id} ${thread.status}`);
    } else if (step.op === "getThread") {
      const thread = d.thread as { thread_id: string; status: string };
      log(`${step.id}: ${titles[thread.thread_id] ?? thread.thread_id} ${thread.status}`);
    } else if (step.op === "inbox") {
      const messages = d.messages as Array<{ kind: string }>;
      log(`${step.id}: ${messages.length} message(s)`);
    } else {
      log(`${step.id}: ok`);
    }
  }
}

if (import.meta.main) await main();
