import { z } from "zod";
import { Autonomy, EligibilityRule, Id, Instant, Text, type Evidence, type HouseholdState, type Thread } from "../model/schemas.ts";
import { OpError } from "../model/errors.ts";
import { ms, toUtc } from "../model/time.ts";
import { nextId } from "../model/util.ts";
import type { TypeEnv, TypeRegistry } from "../registry/types.ts";

/** create_thread input (also used by seeding, which may pass explicit ids). */
export const ThreadInput = z.strictObject({
  id: Id.optional(), // seeding only; never exposed by adapters
  title: Text,
  objective: z.string().min(1).max(400),
  beneficiary: Id.optional(),
  event: z.strictObject({ start: Instant, end: Instant, place: Id }),
  deadline: Instant,
  participants: z.array(Id).min(1).max(20),
  autonomy: Autonomy.optional(),
  handoff_policy: z.strictObject({ eligible: z.array(EligibilityRule).min(1) }).optional(),
  responsibilities: z
    .array(z.strictObject({ id: Id.optional(), type: z.string().min(1), owner: Id, item: Id.optional(), place: Id.optional() }))
    .min(1)
    .max(10),
});
export type ThreadInput = z.infer<typeof ThreadInput>;

export function makeEnv(state: HouseholdState): TypeEnv {
  const hh = state.household;
  return {
    tz: hh.timezone,
    bufferMinutes: 10,
    travelMinutes: (placeId) =>
      state.travel.findLast((s) => s.place === placeId)?.minutes ?? hh.places.find((p) => p.id === placeId)?.travel_minutes ?? 0,
    personName: (id) => hh.persons.find((p) => p.id === id)?.name ?? id,
    placeName: (id) => hh.places.find((p) => p.id === id)?.name ?? id,
  };
}

/** Builds a Thread (responsibilities, windows, conditions) from input. Conditions are derived, never supplied by callers. */
export function buildThread(state: HouseholdState, reg: TypeRegistry, input: ThreadInput, createdBy: string, now: string):
  { thread: Thread; evidence: Evidence[] } {
  const hh = state.household;
  const person = (id: string) => hh.persons.find((p) => p.id === id);
  const bad = (msg: string) => new OpError("VALIDATION_FAILED", msg, [], ["Check the ids with list_threads, then try again."]);

  const id = input.id ?? nextId(state, "thr");
  if (state.threads.some((t) => t.id === id)) throw bad(`Thread ${id} already exists.`);
  const event = { start: toUtc(input.event.start), end: toUtc(input.event.end), place: input.event.place };
  const deadline = toUtc(input.deadline);
  if (ms(event.start) >= ms(event.end)) throw bad("The event must end after it starts.");
  if (ms(deadline) > ms(event.end)) throw bad("The deadline must be no later than the event end.");
  if (!hh.places.some((p) => p.id === event.place)) throw bad(`Unknown place ${event.place}.`);
  for (const p of input.participants) if (!person(p)) throw bad(`Unknown person ${p}.`);
  if (input.beneficiary && !person(input.beneficiary)) throw bad(`Unknown person ${input.beneficiary}.`);
  const participants = input.participants.includes(createdBy) ? input.participants : [...input.participants, createdBy];

  const thread: Thread = {
    id, household_id: hh.id, title: input.title, objective: input.objective, created_by: createdBy, created_at: now,
    ...(input.beneficiary ? { beneficiary: input.beneficiary } : {}),
    event, deadline, participants,
    autonomy: input.autonomy ?? "COORDINATE",
    handoff_policy: { eligible: input.handoff_policy?.eligible ?? ["household_adult"], requires_acceptance: true },
    responsibilities: [], conditions: [], cancelled: false, status: "ACTIVE", why: [],
    history: [{ at: now, text: `Created by ${person(createdBy)?.name ?? createdBy}`, automatic: false }],
  };
  const env = makeEnv(state);
  const evidence: Evidence[] = [];
  for (const r of input.responsibilities) {
    const type = reg.get(r.type);
    if (!type) throw bad(`Unknown responsibility type ${r.type}. Known: ${[...reg.keys()].join(", ")}.`);
    const owner = person(r.owner);
    if (!owner || !owner.adult || !owner.has_account) throw bad(`${r.owner} can't own a responsibility (must be an adult household member).`);
    if (type.requiresItem && !r.item) throw bad(`${r.type} needs an item.`);
    const rid = r.id ?? type.defaultId(r);
    if (thread.responsibilities.some((x) => x.id === rid)) throw bad(`Duplicate responsibility ${rid}.`);
    thread.responsibilities.push({
      id: rid, type: r.type, owner: r.owner, owner_kind: "person", status: "OWNED",
      ...(r.item ? { item: r.item } : {}), ...(r.place ? { place: r.place } : {}),
      window: type.window(thread, r, env),
    });
    if (!participants.includes(r.owner)) participants.push(r.owner);
    for (const c of type.conditions(thread, r)) {
      if (thread.conditions.some((x) => x.id === c.id)) throw bad(`Two responsibilities derive condition ${c.id}; give them distinct items.`);
      thread.conditions.push({
        id: c.id, responsibility_id: rid, phase: c.phase, min_strength: c.min_strength, label: c.label,
        ...(c.window ? { window: c.window } : {}),
      });
      if (c.owner && r.owner === createdBy) {
        evidence.push({
          id: nextId(state, "evd"), thread_id: id, condition_id: c.id, strength: "ATTESTED", actor: createdBy,
          source: "CREATION", at: now, observed_at: now, authorized: true,
        });
      }
    }
  }
  // PRE conditions first, then OUTCOME (stable): the order the Lens checklist shows
  thread.conditions.sort((a, b) => (a.phase === b.phase ? 0 : a.phase === "PRE" ? -1 : 1));
  return { thread, evidence };
}

/** Re-applies type windows after a travel or event change. Blocks are NOT moved here (that is a policy decision). */
export function recomputeWindows(state: HouseholdState, reg: TypeRegistry): void {
  const env = makeEnv(state);
  for (const t of state.threads) {
    for (const r of t.responsibilities) {
      const type = reg.get(r.type);
      if (type) r.window = type.window(t, r, env);
    }
  }
}
