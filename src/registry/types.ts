// Responsibility types are registered at runtime (domain-agnostic core). THREAD's household types live here
// as `householdTypes`; another app (e.g. a shift rota) registers its own, such as COVER_SHIFT.
import type { Person, Responsibility, Strength, Thread, Window } from "../model/schemas.ts";
import { addMinutes } from "../model/time.ts";

export interface TypeEnv {
  tz: string;
  bufferMinutes: number; // spare time before a deadline (default 10)
  travelMinutes(placeId: string): number; // current travel time from home, incl. weather signals
  personName(id: string): string;
  placeName(id: string): string;
}
export interface ConditionTemplate {
  id: string;
  phase: "PRE" | "OUTCOME";
  min_strength: Strength;
  label: string;
  window?: Window;
  /** true: satisfied by the owner's own commitment (thread creation by the owner, or accepting a handoff). */
  owner: boolean;
}
export interface Need {
  key: string;
  required: boolean;
}
export interface ResponsibilityType {
  type: string; // UPPER_SNAKE, e.g. "TRANSPORT"
  label(r: Pick<Responsibility, "item">): string;
  defaultId(r: Pick<Responsibility, "item">): string;
  requiresItem: boolean;
  /** Exclusive responsibilities occupy the owner's time window (they block other exclusive ones). */
  exclusive: boolean;
  capability?: { code: string; ok: string; fail: string; check(p: Person): boolean };
  window(thread: Thread, r: Pick<Responsibility, "item" | "place">, env: TypeEnv): Window;
  conditions(thread: Thread, r: Pick<Responsibility, "item">): ConditionTemplate[];
  context_needs: { person: Need[]; service: Need[] };
  /** Short phrase for availability reasons, e.g. "driving Leo". */
  busyText(thread: Thread, r: Pick<Responsibility, "item">, env: TypeEnv): string;
  /** If set, accepting this responsibility creates a calendar block on the owner's calendar; its verify() satisfies condition_id. */
  block?: { condition_id: string; title(thread: Thread, env: TypeEnv): string };
  /** Objects this responsibility needs (used for the HOLDS_ITEM ranking bonus). */
  needsObjects?(thread: Thread): string[];
}

const canDrive = { code: "CAN_DRIVE", ok: "can drive", fail: "doesn't drive", check: (p: Person) => p.can_drive };
const who = (t: Thread, env: TypeEnv) => (t.beneficiary ? env.personName(t.beneficiary) : t.title);

export const TRANSPORT: ResponsibilityType = {
  type: "TRANSPORT",
  label: () => "Transport",
  defaultId: () => "r_transport",
  requiresItem: false,
  exclusive: true,
  capability: canDrive,
  // leave by = deadline - travel - buffer; back = event end + 30 min return allowance
  window: (t, _r, env) => ({
    start: addMinutes(t.deadline, -(env.travelMinutes(t.event.place) + env.bufferMinutes)),
    end: addMinutes(t.event.end, 30),
  }),
  conditions: (t) => [
    { id: "c_transport_owner", phase: "PRE", min_strength: "ATTESTED", label: "Driver confirmed", owner: true },
    { id: "c_departure_plan", phase: "PRE", min_strength: "SYSTEM_VERIFIED", label: "Departure plan on the driver's calendar", owner: false },
    {
      id: "c_arrival", phase: "OUTCOME", min_strength: "ATTESTED", label: "Arrived before check-in", owner: false,
      window: { start: addMinutes(t.deadline, -60), end: t.deadline },
    },
  ],
  context_needs: {
    person: ["event_time", "deadline", "place", "beneficiary", "items_status", "depart_by"].map((key) => ({ key, required: true })),
    service: [],
  },
  busyText: (t, _r, env) => `driving ${who(t, env)}`,
  block: { condition_id: "c_departure_plan", title: (t, env) => `Driving ${who(t, env)}` },
  needsObjects: (t) => t.responsibilities.filter((r) => r.type === "BRING_ITEM" && r.item).map((r) => r.item as string),
};

export const BRING_ITEM: ResponsibilityType = {
  type: "BRING_ITEM",
  label: (r) => `Bring the ${r.item ?? "item"}`,
  defaultId: (r) => `r_${r.item ?? "item"}`,
  requiresItem: true,
  exclusive: false,
  window: (t) => ({ start: addMinutes(t.deadline, -60), end: t.deadline }),
  conditions: (_t, r) => [
    { id: `c_${r.item ?? "item"}`, phase: "PRE", min_strength: "ATTESTED", label: `${cap(r.item ?? "item")} packed`, owner: true },
  ],
  context_needs: { person: ["item", "event_time", "place"].map((key) => ({ key, required: true })), service: [] },
  busyText: (_t, r) => `bringing the ${r.item ?? "item"}`,
};

export const PICKUP: ResponsibilityType = {
  type: "PICKUP",
  label: () => "Pickup",
  defaultId: () => "r_pickup",
  requiresItem: true,
  exclusive: true,
  capability: canDrive,
  window: (t) => ({ start: t.event.start, end: t.event.end }),
  conditions: (t) => [
    { id: "c_pickup_owner", phase: "PRE", min_strength: "ATTESTED", label: "Pickup owner confirmed", owner: true },
    {
      id: "c_received", phase: "OUTCOME", min_strength: "ATTESTED", label: "Received before the deadline", owner: false,
      window: { start: t.event.start, end: t.deadline },
    },
  ],
  context_needs: {
    person: [
      { key: "item_label", required: true },
      { key: "place", required: true },
      { key: "deadline", required: true },
      { key: "item_detail", required: false },
    ],
    // A service gets only what the order needs: never the medication name or the reason.
    service: ["order_ref", "delivery_address", "slot"].map((key) => ({ key, required: true })),
  },
  busyText: (t) => `on ${t.title}`,
};

export const ATTEND: ResponsibilityType = {
  type: "ATTEND",
  label: () => "Attend",
  defaultId: () => "r_attend",
  requiresItem: false,
  exclusive: true,
  window: (t) => ({ start: t.event.start, end: t.event.end }),
  conditions: (t) => [
    { id: "c_attend_owner", phase: "PRE", min_strength: "ATTESTED", label: "Host confirmed", owner: true },
    {
      id: "c_attended", phase: "OUTCOME", min_strength: "ATTESTED", label: "Attended", owner: false,
      window: { start: t.event.start, end: addMinutes(t.event.start, 60) },
    },
  ],
  context_needs: { person: ["event_time", "place"].map((key) => ({ key, required: true })), service: [] },
  busyText: (t) => `at ${t.title}`,
};

export const householdTypes: ResponsibilityType[] = [TRANSPORT, BRING_ITEM, PICKUP, ATTEND];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Lookup table built once per app. Unknown type -> undefined (callers turn it into VALIDATION_FAILED). */
export type TypeRegistry = ReadonlyMap<string, ResponsibilityType>;
export function createRegistry(types: ResponsibilityType[]): TypeRegistry {
  const m = new Map<string, ResponsibilityType>();
  for (const t of types) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(t.type)) throw new Error(`invalid responsibility type name: ${t.type}`);
    if (m.has(t.type)) throw new Error(`duplicate responsibility type: ${t.type}`);
    m.set(t.type, t);
  }
  return m;
}
