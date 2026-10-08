// The contract for adapters: every operation's input and output, as zod and as JSON Schema (draft 2020-12).
// MCP tools, REST routes and agent tool definitions are generated from this; never hand-copy a schema.
import { z } from "zod";
import { ErrorBody, ErrorCode } from "../model/errors.ts";
import * as io from "../app/io.ts";

export const operations = {
  createThread: { input: io.CreateThreadIn, output: io.CreateThreadOut },
  listThreads: { input: io.ListThreadsIn, output: io.ListThreadsOut },
  getThread: { input: io.GetThreadIn, output: io.GetThreadOut },
  reportChange: { input: io.ReportChangeIn, output: io.ReportChangeOut },
  requestHandoff: { input: io.RequestHandoffIn, output: io.RequestHandoffOut },
  respondToHandoff: { input: io.RespondToHandoffIn, output: io.RespondToHandoffOut },
  recordEvidence: { input: io.RecordEvidenceIn, output: io.RecordEvidenceOut },
  confirmAction: { input: io.ConfirmActionIn, output: io.ConfirmActionOut },
} as const;
export const systemOperations = {
  ingestSignal: { input: io.IngestSignalIn, output: io.IngestSignalOut },
  tick: { input: io.TickIn, output: io.TickOut },
  inbox: { input: io.InboxIn, output: io.InboxOut },
} as const;
export type OperationName = keyof typeof operations;

export const jsonSchemas = Object.fromEntries(
  Object.entries({ ...operations, ...systemOperations }).map(([name, s]) => [
    name,
    { input: z.toJSONSchema(s.input, { io: "input" }), output: z.toJSONSchema(s.output) },
  ]),
) as unknown as Record<OperationName | keyof typeof systemOperations, { input: Record<string, unknown>; output: Record<string, unknown> }>;

export const errorSchema = z.toJSONSchema(ErrorBody);
export const errorCodes = ErrorCode.options;
