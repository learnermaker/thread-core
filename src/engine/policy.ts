import type { Fact, HouseholdState, Receipt, SharedFact, Thread } from "../model/schemas.ts";
import { OpError } from "../model/errors.ts";
import { fmtDayTime } from "../model/time.ts";
import type { TypeRegistry } from "../registry/types.ts";
import { makeEnv } from "./derive.ts";

export const GENERIC_WITHHELD = ["Other calendar events", "Private notes"];

/**
 * Facts about a thread: computed from the contract (sensitivity THREAD) plus stored facts for that thread.
 * `extra` adds order facts (order_ref, slot) for a service handoff.
 */
export function threadFacts(state: HouseholdState, t: Thread, extra: SharedFact[] = []): Fact[] {
  const env = makeEnv(state);
  const computed: Array<[string, string, string]> = [
    ["event_time", "Event time", fmtDayTime(t.event.start, env.tz)],
    ["deadline", "Be there by", fmtDayTime(t.deadline, env.tz)],
    ["place", "Place", env.placeName(t.event.place)],
  ];
  if (t.beneficiary) computed.push(["beneficiary", "Who", env.personName(t.beneficiary)]);
  const items = t.responsibilities.filter((r) => r.type === "BRING_ITEM" && r.item);
  if (items.length > 0) computed.push(["items_status", "Items", items.map((r) => `${r.item}: with ${env.personName(r.owner)}`).join("; ")]);
  for (const r of items) computed.push(["item", "Item", r.item as string]);
  const transport = t.responsibilities.find((r) => r.type === "TRANSPORT");
  if (transport) computed.push(["depart_by", "Leave by", fmtDayTime(transport.window.start, env.tz)]);
  for (const x of extra) computed.push([x.key, x.label, x.value]);
  return [
    ...computed.map(([key, label, value], i): Fact => ({
      id: `cf_${i + 1}`, thread_id: t.id, key, label, value, owner: t.created_by, sensitivity: "THREAD", shared_with: [],
    })),
    ...state.facts.filter((f) => f.thread_id === t.id),
  ];
}

/** May recipient see fact? People: by sensitivity & scope. Services: only PUBLIC or THREAD facts of this thread. */
export function allows(state: HouseholdState, recipient: string, kind: "person" | "service", f: Fact, t: Thread): boolean {
  if (f.sensitivity === "PUBLIC") return true;
  if (kind === "service") return f.sensitivity === "THREAD" && f.thread_id === t.id;
  const p = state.household.persons.find((x) => x.id === recipient);
  if (!p) return false;
  switch (f.sensitivity) {
    case "HOUSEHOLD":
      return p.adult && p.has_account;
    case "THREAD": // a handoff recipient is joining the thread, so THREAD facts of that thread are allowed
      return f.thread_id === t.id;
    case "PRIVATE":
      return f.owner === recipient || f.shared_with.includes(recipient);
  }
}

/**
 * Minimum-necessary context (Master Spec §D7):
 *   shared   = needed facts the policy allows (values)
 *   missing  = required needs not shared  -> CONTEXT_BLOCKED (nothing is sent)
 *   withheld = thread facts the recipient may not see + the cause of the change + generic labels (labels only, never values)
 */
export function buildReceipt(
  state: HouseholdState, reg: TypeRegistry, t: Thread, responsibilityType: string, recipient: string, kind: "person" | "service",
  handoffId: string, causeBusyIds: string[], now: string, extra: SharedFact[] = [],
): Receipt {
  const facts = threadFacts(state, t, extra);
  const needs = reg.get(responsibilityType)?.context_needs[kind] ?? [];
  const shared: SharedFact[] = [];
  const missing: string[] = [];
  for (const n of needs) {
    const f = facts.find((x) => x.key === n.key);
    if (f && allows(state, recipient, kind, f, t)) shared.push({ key: f.key, label: f.label, value: f.value });
    else if (n.required) missing.push(n.key);
  }
  if (missing.length > 0) {
    throw new OpError("CONTEXT_BLOCKED", `Can't hand off without sharing: ${missing.join(", ")}.`, [],
      ["Share or declassify those facts, or pick another recipient."]);
  }
  const withheld = [
    ...facts.filter((f) => !allows(state, recipient, kind, f, t)).map((f) => f.label),
    ...state.busy.filter((b) => causeBusyIds.includes(b.id)).map((b) => b.withheld_label),
    ...GENERIC_WITHHELD,
  ];
  return {
    handoff_id: handoffId, recipient, recipient_kind: kind, shared,
    withheld: [...new Set(withheld)].map((label) => ({ label })), policy_version: "1", at: now,
  };
}
