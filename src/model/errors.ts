import { z } from "zod";

export const ErrorCode = z.enum([
  "VALIDATION_FAILED", // input does not match the operation's schema
  "NOT_FOUND", // unknown id, or not visible to this principal (never reveals which)
  "FORBIDDEN", // principal may not perform this operation
  "WRONG_PRINCIPAL", // only a specific person may do this (handoff recipient, confirmation principal)
  "NOT_ELIGIBLE", // requested candidate fails a hard filter
  "NO_ELIGIBLE_CANDIDATE", // nobody (person or service) can take the responsibility
  "INVALID_STATE", // e.g. handoff already answered differently
  "CONTEXT_BLOCKED", // a required context fact may not be shared with the recipient
  "IDEMPOTENCY_CONFLICT", // same idempotency_key reused with a different input
  "CONNECTOR_FAILED", // calendar / service connector failed; nothing was changed
  "STORE_CONFLICT", // concurrent write; retry
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorBody = z.strictObject({
  code: ErrorCode,
  message: z.string(), // what happened, in one human sentence
  unresolved: z.array(z.string()), // condition ids still open
  next_steps: z.array(z.string()), // what the caller can do next
});
export type ErrorBody = z.infer<typeof ErrorBody>;

/** Thrown inside operations; converted to { ok:false, error } at the application boundary. */
export class OpError extends Error {
  readonly body: ErrorBody;
  constructor(code: ErrorCode, message: string, unresolved: string[] = [], next_steps: string[] = []) {
    super(message);
    this.body = { code, message, unresolved, next_steps };
  }
}

export type OpResult<T> = { ok: true; data: T } | { ok: false; error: ErrorBody };
