// Operation inputs and outputs: the wire contract every adapter (MCP, REST, agent tools) is generated from.
import { z } from "zod";
import {
  Autonomy, Id, Instant, Message, OwnerKind, Phase, Receipt, ResponsibilityStatus, Severity, Strength, ThreadStatus, Window,
} from "../model/schemas.ts";
import { ThreadInput } from "../engine/derive.ts";
import { Signal, UserChange } from "../engine/impact.ts";
import { Candidate } from "../engine/candidates.ts";

// ---------- principal ----------
export const Principal = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("person"), household_id: Id, person_id: Id }),
  z.strictObject({ kind: z.literal("system"), household_id: Id }),
]);
export type Principal = z.infer<typeof Principal>;

const IdemKey = z.string().min(1).max(100);

// ---------- inputs ----------
export const CreateThreadIn = ThreadInput.omit({ id: true }).extend({ idempotency_key: IdemKey.optional() });
export const ListThreadsIn = z.strictObject({ status: ThreadStatus.optional(), within_days: z.number().int().min(1).max(30).optional() });
export const GetThreadIn = z.strictObject({ thread_id: Id });
export const ReportChangeIn = z.strictObject({ change: UserChange, idempotency_key: IdemKey.optional() });
export const RequestHandoffIn = z.strictObject({ thread_id: Id, responsibility_id: Id, candidate: Id.optional(), idempotency_key: IdemKey.optional() });
export const RespondToHandoffIn = z.strictObject({
  handoff_id: Id, accept: z.boolean(), confirm_items: z.array(Id).max(10).optional(), add_to_calendar: z.boolean().optional(),
  idempotency_key: IdemKey.optional(),
});
export const RecordEvidenceIn = z.strictObject({ thread_id: Id, condition_id: Id, note: z.string().max(200).optional(), idempotency_key: IdemKey.optional() });
export const ConfirmActionIn = z.strictObject({ confirmation_id: Id, approve: z.boolean(), idempotency_key: IdemKey.optional() });
export const IngestSignalIn = z.strictObject({ signal: Signal });
export const TickIn = z.strictObject({});
export const InboxIn = z.strictObject({ since: Instant.optional() });

// ---------- views ----------
export const Member = z.strictObject({ id: Id, name: z.string() });
export const ConditionView = z.strictObject({
  id: Id, label: z.string(), phase: Phase, min_strength: Strength, satisfied: z.boolean(),
  evidence: z.strictObject({ strength: Strength, actor: Id, at: Instant }).optional(),
});
export const ResponsibilityView = z.strictObject({
  id: Id, type: z.string(), label: z.string(), owner: Id, owner_name: z.string(), owner_kind: OwnerKind,
  status: ResponsibilityStatus, window: Window, risk: z.strictObject({ severity: Severity, text: z.string() }).optional(),
});
export const ThreadView = z.strictObject({
  thread_id: Id, title: z.string(), objective: z.string(), status: ThreadStatus, autonomy: Autonomy, deadline: Instant,
  event: z.strictObject({ start: Instant, end: Instant, place: Id, place_name: z.string() }),
  beneficiary: Member.optional(),
  participants: z.array(Member),
  responsibilities: z.array(ResponsibilityView),
  conditions: z.array(ConditionView),
  why: z.array(z.string()),
  history: z.array(z.strictObject({ at: Instant, text: z.string(), automatic: z.boolean() })),
});
export const ThreadSummary = z.strictObject({ thread_id: Id, title: z.string(), status: ThreadStatus, when: z.string(), deadline: Instant });
export const RippleThread = z.strictObject({
  thread_id: Id, title: z.string(), severity: Severity, status: ThreadStatus, why: z.array(z.string()),
  affected: z.array(z.strictObject({ responsibility_id: Id, severity: Severity })),
});
export const Proposal = z.strictObject({
  thread_id: Id, responsibility_id: Id, recommended: Candidate.nullable(), candidates: z.array(Candidate), excluded: z.array(Candidate),
});
export const AutoActionView = z.strictObject({
  thread_id: Id, responsibility_id: Id, action: z.enum(["ADJUST_PLAN", "SEND_HANDOFF", "NOTIFY_CREATOR", "SURFACE"]), text: z.string(),
});
export const HandoffView = z.strictObject({
  id: Id, thread_id: Id, responsibility_id: Id, from: Id, to: Id, to_kind: OwnerKind,
  status: z.enum(["PENDING", "PENDING_CONFIRMATION", "ACCEPTED", "DECLINED", "CANCELLED"]),
});
export const RequiresConfirmation = z.strictObject({
  confirmation_id: Id, kind: z.enum(["TRANSACT", "MODIFY"]), summary: z.string(),
  amount_cents: z.number().int().optional(), currency: z.literal("USD").optional(),
});

// ---------- outputs ----------
export const InitHouseholdOut = z.strictObject({ household_id: Id, threads: z.number().int() });
export const CreateThreadOut = z.strictObject({ thread: ThreadView });
export const ListThreadsOut = z.strictObject({ threads: z.array(ThreadSummary), members: z.array(Member) });
export const GetThreadOut = z.strictObject({ thread: ThreadView });
export const ReportChangeOut = z.strictObject({ threads: z.array(RippleThread), proposals: z.array(Proposal), automatic_actions: z.array(AutoActionView) });
export const IngestSignalOut = ReportChangeOut.extend({ duplicate: z.boolean() });
export const RequestHandoffOut = z.strictObject({
  handoff: HandoffView, receipt: Receipt, candidates: z.array(Candidate), excluded: z.array(Candidate),
  requires_confirmation: RequiresConfirmation.optional(), thread: ThreadView,
});
export const RespondToHandoffOut = z.strictObject({
  handoff: HandoffView, thread: ThreadView, confirmation: RequiresConfirmation.optional(), next_candidate: Candidate.optional(),
});
export const RecordEvidenceOut = z.strictObject({
  evidence: z.strictObject({ id: Id, condition_id: Id, strength: Strength, satisfied: z.boolean(), reason: z.string().optional() }),
  remaining: z.array(Id), thread: ThreadView,
});
export const ConfirmActionOut = z.strictObject({
  confirmation: z.strictObject({ id: Id, kind: z.enum(["TRANSACT", "MODIFY"]), status: z.enum(["PENDING", "APPROVED", "REJECTED"]), summary: z.string() }),
  thread: ThreadView,
});
export const TickOut = z.strictObject({ changed: z.array(z.strictObject({ thread_id: Id, from: ThreadStatus, to: ThreadStatus })) });
export const InboxOut = z.strictObject({ messages: z.array(Message) });

export type ThreadView = z.infer<typeof ThreadView>;
export type ReportChangeOut = z.infer<typeof ReportChangeOut>;
