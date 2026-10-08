// thread-core public API (semver from v0.1.0). Keep this list deliberate: everything exported is supported.
export { createThreadApp, type ThreadApp, type ThreadAppConfig } from "./app/app.ts";
export * as io from "./app/io.ts";
export { operations, systemOperations, jsonSchemas, errorSchema, errorCodes, type OperationName } from "./schemas/index.ts";
export * from "./model/schemas.ts";
export { ErrorCode, ErrorBody, OpError, type OpResult } from "./model/errors.ts";
export { toUtc, fmtTime, fmtDay, fmtDayTime, fmtRange, fmtMoney } from "./model/time.ts";
export type { Clock, Store, CalendarConnector, ServiceProvider } from "./ports.ts";
export { StoreConflictError } from "./ports.ts";
export { memoryStore } from "./store/memory.ts";
export { createRegistry, householdTypes, TRANSPORT, BRING_ITEM, PICKUP, ATTEND, type ResponsibilityType, type TypeEnv, type TypeRegistry } from "./registry/types.ts";
export { ThreadInput, buildThread, recomputeWindows } from "./engine/derive.ts";
export { Seed, seedHousehold } from "./engine/seed.ts";
export { UserChange, Signal, assess, buildGraph, traverse, startNodes, severityOf } from "./engine/impact.ts";
export { Candidate, rankCandidates, describe } from "./engine/candidates.ts";
export { buildReceipt, allows, threadFacts } from "./engine/policy.ts";
export { deriveStatus, isSatisfied, evidenceProblem } from "./engine/status.ts";
export { AUTONOMY_MATRIX, decide, type AutoAction } from "./engine/autonomy.ts";
