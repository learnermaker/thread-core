// Single source of truth for every data shape in thread-core.
// TypeScript types are inferred from these zod schemas (z.infer); never hand-write a duplicate interface.
// Wire format is snake_case everywhere (inputs, outputs, stored state).
import { z } from "zod";

export const Id = z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/, "lowercase id: a-z, 0-9, _");
export const Instant = z.iso.datetime({ offset: true });
export const Text = z.string().min(1).max(200);
export const Window = z.strictObject({ start: Instant, end: Instant });

export const Strength = z.enum(["ATTESTED", "SYSTEM_VERIFIED", "OUTCOME"]);
export const Phase = z.enum(["PRE", "OUTCOME"]);
export const Severity = z.enum(["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const Autonomy = z.enum(["OBSERVE", "RECOMMEND", "COORDINATE", "ACT"]);
export const Sensitivity = z.enum(["PUBLIC", "HOUSEHOLD", "THREAD", "PRIVATE"]);
export const ResponsibilityStatus = z.enum([
  "UNASSIGNED", "OWNED", "AT_RISK", "HANDOFF_PENDING", "ACCEPTED", "COMPLETED", "VERIFIED",
]);
export const ThreadStatus = z.enum([
  "ACTIVE", "AT_RISK", "HANDOFF_PENDING", "PLAN_SECURED", "RESOLVED", "NEEDS_ATTENTION", "EXPIRED", "CANCELLED",
]);
export const OwnerKind = z.enum(["person", "service"]);
export const EligibilityRule = z.union([z.literal("household_adult"), z.string().regex(/^guardian_of:[a-z][a-z0-9_]*$/)]);

// ---------- Household ----------
export const Person = z.strictObject({
  id: Id,
  name: Text,
  adult: z.boolean(),
  has_account: z.boolean(),
  can_drive: z.boolean(),
  guardian_of: z.array(Id),
});
export const Place = z.strictObject({ id: Id, name: Text, travel_minutes: z.number().int().min(0).max(600) });
export const Household = z.strictObject({
  id: Id,
  name: Text,
  timezone: z.string().min(1),
  home_place: Id,
  persons: z.array(Person).min(1),
  places: z.array(Place).min(1),
});

// ---------- Thread ----------
export const Risk = z.strictObject({
  severity: Severity,
  code: z.enum(["OWNER_UNAVAILABLE", "CAPABILITY", "PLAN_DRIFT", "NO_CANDIDATE"]),
  text: z.string(),
  cause_busy_id: Id.optional(),
  prev_status: ResponsibilityStatus,
  no_candidate: z.boolean(),
});
export const Responsibility = z.strictObject({
  id: Id,
  type: z.string().min(1),
  owner: Id,
  owner_kind: OwnerKind,
  status: ResponsibilityStatus,
  item: Id.optional(),
  place: Id.optional(),
  window: Window,
  block: z.strictObject({ block_id: z.string(), start: Instant, end: Instant }).optional(),
  order: z.strictObject({ order_id: z.string(), provider_id: Id, slot: Window, amount_cents: z.number().int() }).optional(),
  risk: Risk.optional(),
});
export const Condition = z.strictObject({
  id: Id,
  responsibility_id: Id,
  phase: Phase,
  min_strength: Strength,
  label: z.string(),
  window: Window.optional(),
  valid_from: Instant.optional(), // evidence observed before this instant no longer counts (owner or plan changed)
});
export const HistoryEntry = z.strictObject({ at: Instant, text: z.string(), automatic: z.boolean() });
export const Thread = z.strictObject({
  id: Id,
  household_id: Id,
  title: Text,
  objective: z.string().min(1).max(400),
  created_by: Id,
  created_at: Instant,
  beneficiary: Id.optional(),
  event: z.strictObject({ start: Instant, end: Instant, place: Id }),
  deadline: Instant,
  participants: z.array(Id),
  autonomy: Autonomy,
  handoff_policy: z.strictObject({ eligible: z.array(EligibilityRule).min(1), requires_acceptance: z.literal(true) }),
  responsibilities: z.array(Responsibility).min(1),
  conditions: z.array(Condition),
  cancelled: z.boolean(),
  status: ThreadStatus, // cached; always re-derived (deriveStatus) before it is read or stored
  why: z.array(z.string()),
  history: z.array(HistoryEntry),
});

// ---------- Facts, availability, handoffs, evidence ----------
export const Fact = z.strictObject({
  id: Id,
  thread_id: Id.optional(),
  key: z.string().min(1),
  label: z.string().min(1),
  value: z.string(),
  owner: Id,
  sensitivity: Sensitivity,
  shared_with: z.array(Id),
});
export const Busy = z.strictObject({
  id: Id,
  person: Id,
  start: Instant,
  end: Instant,
  source_id: z.string().optional(),
  withheld_label: z.string(), // the reason itself is never stored; only this label is ever shown
});
export const SharedFact = z.strictObject({ key: z.string(), label: z.string(), value: z.string() });
export const Receipt = z.strictObject({
  handoff_id: Id,
  recipient: Id,
  recipient_kind: OwnerKind,
  shared: z.array(SharedFact),
  withheld: z.array(z.strictObject({ label: z.string() })),
  policy_version: z.literal("1"),
  at: Instant,
});
export const Handoff = z.strictObject({
  id: Id,
  thread_id: Id,
  responsibility_id: Id,
  from: Id,
  to: Id,
  to_kind: OwnerKind,
  status: z.enum(["PENDING", "PENDING_CONFIRMATION", "ACCEPTED", "DECLINED", "CANCELLED"]),
  requested_by: Id,
  requested_at: Instant,
  answered_at: Instant.optional(),
  receipt: Receipt,
});
export const Quote = z.strictObject({
  provider_id: Id,
  slot: Window,
  amount_cents: z.number().int().min(0),
  currency: z.literal("USD"),
  summary: z.string(),
});
export const Confirmation = z.strictObject({
  id: Id,
  kind: z.enum(["TRANSACT", "MODIFY"]),
  principal: Id, // the only person allowed to approve or reject
  thread_id: Id,
  responsibility_id: Id,
  handoff_id: Id.optional(),
  summary: z.string(),
  amount_cents: z.number().int().optional(),
  currency: z.literal("USD").optional(),
  quote: Quote.optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
  created_at: Instant,
  answered_at: Instant.optional(),
});
export const Evidence = z.strictObject({
  id: Id,
  thread_id: Id,
  condition_id: Id,
  strength: Strength,
  actor: Id, // person id, or "system" for connector verification
  source: z.enum(["CREATION", "HANDOFF", "TOOL", "CONNECTOR"]),
  at: Instant,
  observed_at: Instant, // when the fact happened (e.g. delivered 10:42); window checks use this
  authorized: z.boolean(),
  note: z.string().max(200).optional(),
});
export const Message = z.strictObject({
  id: Id,
  to: Id,
  at: Instant,
  kind: z.enum(["HANDOFF_REQUEST", "CONFIRMATION_REQUEST", "NOTICE"]),
  text: z.string(),
  thread_id: Id.optional(),
  handoff_id: Id.optional(),
  confirmation_id: Id.optional(),
});
export const TravelSignal = z.strictObject({ place: Id, minutes: z.number().int().min(0).max(600), cause: z.string(), source_id: z.string(), at: Instant });

export const HouseholdState = z.strictObject({
  household: Household,
  threads: z.array(Thread),
  facts: z.array(Fact),
  busy: z.array(Busy),
  handoffs: z.array(Handoff),
  confirmations: z.array(Confirmation),
  evidence: z.array(Evidence),
  inbox: z.array(Message),
  travel: z.array(TravelSignal),
  counters: z.record(z.string(), z.number().int()),
  seen_sources: z.array(z.string()),
  idempotency: z.array(z.strictObject({ key: z.string(), at: Instant, input: z.string(), result: z.unknown() })),
});

export const ThreadEvent = z.strictObject({
  seq: z.number().int().min(1),
  at: Instant,
  type: z.enum([
    "HOUSEHOLD_INITIALIZED", "THREAD_CREATED", "CHANGE_REPORTED", "SIGNAL_INGESTED", "IMPACT_COMPUTED",
    "HANDOFF_REQUESTED", "HANDOFF_ACCEPTED", "HANDOFF_DECLINED", "CONFIRMATION_REQUESTED",
    "CONFIRMATION_APPROVED", "CONFIRMATION_REJECTED", "CONNECTOR_ACTION", "EVIDENCE_RECORDED",
    "AUTONOMOUS_ACTION", "NOTIFICATION_SENT", "STATUS_CHANGED",
  ]),
  actor: Id,
  thread_id: Id.optional(),
  data: z.record(z.string(), z.unknown()),
});

export type Person = z.infer<typeof Person>;
export type Place = z.infer<typeof Place>;
export type Household = z.infer<typeof Household>;
export type Responsibility = z.infer<typeof Responsibility>;
export type Condition = z.infer<typeof Condition>;
export type Thread = z.infer<typeof Thread>;
export type Fact = z.infer<typeof Fact>;
export type Busy = z.infer<typeof Busy>;
export type Receipt = z.infer<typeof Receipt>;
export type SharedFact = z.infer<typeof SharedFact>;
export type Handoff = z.infer<typeof Handoff>;
export type Quote = z.infer<typeof Quote>;
export type Confirmation = z.infer<typeof Confirmation>;
export type Evidence = z.infer<typeof Evidence>;
export type Message = z.infer<typeof Message>;
export type TravelSignal = z.infer<typeof TravelSignal>;
export type HouseholdState = z.infer<typeof HouseholdState>;
export type ThreadEvent = z.infer<typeof ThreadEvent>;
export type Severity = z.infer<typeof Severity>;
export type Autonomy = z.infer<typeof Autonomy>;
export type Strength = z.infer<typeof Strength>;
export type ThreadStatus = z.infer<typeof ThreadStatus>;
export type ResponsibilityStatus = z.infer<typeof ResponsibilityStatus>;
export type Window = z.infer<typeof Window>;
export type Risk = z.infer<typeof Risk>;
