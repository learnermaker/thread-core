# Requirements Document: core-app-api

## Introduction
thread-core's application layer: the **8 principal-aware operations** that every surface (Alexa+/MCP, web, Slack, agents) calls, plus system operations for watchers and connectors, the append-only event log, idempotency, and the exported JSON Schemas. The golden ripple story must pass end to end. (Master Spec §D2, §D4–§D8, §D13, §D14, §D15 rules 6–8.)

## Glossary
- **App**: `createThreadApp({ store, clock, types?, providers?, calendar? })` in `src/app/app.ts`.
- **Principal**: `{ kind: "person", household_id, person_id }` or `{ kind: "system", household_id }`; the identity a call runs as.
- **Operations**: createThread, listThreads, getThread, reportChange, requestHandoff, respondToHandoff, recordEvidence, confirmAction. **System operations**: initHousehold, ingestSignal, tick, inbox, events.
- **Golden_Story**: `fixtures/golden/ripple-story.json` (18 steps) on `fixtures/golden/rivera-seed.json`.
- **Schemas**: `src/schemas/index.ts` (`operations`, `systemOperations`, `jsonSchemas`, `errorSchema`, `errorCodes`).

## Requirements

### Requirement 1: Always a result, never a throw
**User Story:** As an adapter author, I want every operation to resolve to `{ok:true,data}` or `{ok:false,error}`, so that voice assistants always have something to say.
#### Acceptance Criteria
1. WHEN input fails its schema THE App SHALL return `VALIDATION_FAILED` naming the field paths.
2. WHEN an OpError is raised inside an operation THE App SHALL return its body (`code`, `message`, `unresolved`, `next_steps`) and SHALL NOT commit any change.
3. WHEN a connector throws THE App SHALL return `CONNECTOR_FAILED` and SHALL leave the stored state byte-identical.

### Requirement 2: Identity and authorization
**User Story:** As Maya, I want only the right person to accept or approve, so that nobody can act on my behalf.
#### Acceptance Criteria
1. THE App SHALL scope every call to `principal.household_id`, and SHALL return `NOT_FOUND` for Threads that don't exist there or aren't visible to the person (participant, creator or owner).
2. IF anyone but the handoff recipient answers a handoff THEN THE App SHALL return `WRONG_PRINCIPAL`.
3. IF anyone but the named principal answers a confirmation THEN THE App SHALL return `WRONG_PRINCIPAL`, and no connector `act()` SHALL run.
4. IF a person reports another person's availability THEN THE App SHALL return `FORBIDDEN`.
5. THE ingestSignal and tick operations SHALL accept only the system principal.

### Requirement 3: The ripple (report_change / ingest_signal)
**User Story:** As Maya, I want to say "I can't drive Saturday morning" and hear exactly what breaks and who can help.
#### Acceptance Criteria
1. WHEN a change is reported THE App SHALL record it (a busy interval with only a withheld label, a travel signal, or a moved event), recompute windows, traverse, assess, mark HIGH/CRITICAL responsibilities AT_RISK with their risk, and return every reached Thread with severity, status and `why`.
2. WHEN the autonomy matrix says PROPOSE_HANDOFF THE App SHALL add a proposal with ranked candidates, and SHALL append `Best option: <describe(top)>.` to that Thread's `why`.
3. WHEN it says ADJUST_PLAN and the owner has a consented calendar block THE App SHALL move the block, verify it, record SYSTEM_VERIFIED evidence, restore the responsibility status, add an `automatic: true` history entry and notify the owner.
4. WHEN it says SEND_HANDOFF THE App SHALL start a handoff only to a top **person** candidate; a service is only ever proposed.
5. WHEN a signal's `source_id` was already ingested THE App SHALL return `duplicate: true` and change nothing.

### Requirement 4: Handoffs and confirmations
**User Story:** As Sam, I want a clear request with only what I need, and as Maya I want purchases to wait for my "yes".
#### Acceptance Criteria
1. WHEN requestHandoff picks a person THE App SHALL create a PENDING handoff with a Context Receipt and message the recipient.
2. WHEN requestHandoff picks a service THE App SHALL create a PENDING_CONFIRMATION handoff and a TRANSACT confirmation for the Thread creator with summary, amount and currency, and SHALL NOT call `act()`.
3. WHEN the recipient accepts THE App SHALL transfer ownership, reset `valid_from` on that responsibility's conditions, record ATTESTED owner evidence and `confirm_items` evidence, and (if `add_to_calendar` ≠ false) create and verify the calendar block as SYSTEM_VERIFIED evidence.
4. WHEN the recipient accepts with `add_to_calendar: false` THE App SHALL return a MODIFY confirmation for the recipient.
5. WHEN the recipient declines THE App SHALL keep the old owner, set the responsibility AT_RISK (or OWNED) and return the next candidate who hasn't declined.
6. WHEN the creator approves a TRANSACT THE App SHALL call `act()` then `verify()`, make the service the owner, raise the owner-condition `min_strength` to SYSTEM_VERIFIED and record SYSTEM_VERIFIED evidence.
7. IF a requested candidate fails a hard filter THEN THE App SHALL return `NOT_ELIGIBLE` with the failing reasons and next steps; IF nobody qualifies THEN `NO_ELIGIBLE_CANDIDATE`.

### Requirement 5: Evidence and resolution
**User Story:** As a judge, I want resolution to follow from evidence only.
#### Acceptance Criteria
1. WHEN recordEvidence is called THE App SHALL store ATTESTED evidence (authorized only if the caller owns the condition's responsibility) and report `satisfied`, `reason` and `remaining`.
2. WHEN tick runs THE App SHALL verify open OUTCOME conditions of service-owned responsibilities, record SYSTEM_VERIFIED evidence at the provider's `delivered_at`, and report status changes.
3. THE App SHALL re-derive every Thread status after each mutating operation and emit STATUS_CHANGED events.

### Requirement 6: Idempotency, determinism, events
**User Story:** As an Alexa+ certification tester, I want repeat calls to be safe.
#### Acceptance Criteria
1. WHEN a mutating call repeats the same `idempotency_key` with the same input THE App SHALL return the stored result and change nothing; with different input it SHALL return `IDEMPOTENCY_CONFLICT`.
2. WHEN respondToHandoff or confirmAction is repeated with the same answer THE App SHALL return the current result without changes.
3. WHEN the Golden_Story is replayed twice THE App SHALL produce byte-identical event logs and state.
4. THE event log, inbox messages and errors SHALL never contain PRIVATE fact values.

### Requirement 7: Golden story
**User Story:** As the product owner, I want the demo to be a test, so that the video can only show what really works.
#### Acceptance Criteria
1. WHEN the Golden_Story runs THE App SHALL satisfy every step's `expect` via `toMatchObject`.

### Requirement 8: Schemas as the contract
**User Story:** As an adapter author, I want JSON Schemas for every operation, so that MCP tools and other adapters never drift.
#### Acceptance Criteria
1. THE Schemas SHALL expose zod and JSON Schema (draft 2020-12) input/output for all 8 operations and 3 system operations, with `additionalProperties: false` on every input.
2. WHEN the Golden_Story runs THE output of every successful step SHALL validate against that operation's output schema, and every step input against its input schema.
3. THE package entry `src/index.ts` SHALL export the App, the Schemas, the model schemas and types, the engine functions and `memoryStore`; `thread-core/testkit` SHALL export the testkit.
