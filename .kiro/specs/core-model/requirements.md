# Requirements Document: core-model

## Introduction
Prove and complete thread-core's foundation: the architect's contract (schemas, time, ids, store, responsibility types), Thread derivation, availability, seeding, and a pure testkit (clock, fake calendar, fake service). Later specs build only on what this spec tests. (Master Spec §D2, §D3, §D9, §D15, §D18.)

## Glossary
- **Contract**: architect-owned files `src/model/*`, `src/ports.ts`, `src/registry/types.ts`, `src/store/memory.ts` (read-only).
- **Seed**: `fixtures/golden/rivera-seed.json`, the canonical household and three Threads.
- **Thread_Builder**: `buildThread()` in `src/engine/derive.ts`.
- **Availability**: `conflicts()` in `src/engine/availability.ts`.
- **Testkit**: `src/testkit/` (fixedClock, fakeCalendar, fakeServiceProvider).

## Requirements

### Requirement 1: Contract schemas accept canonical data and reject bad data
**User Story:** As an adapter author, I want strict schemas, so that invalid input never reaches the engine.
#### Acceptance Criteria
1. WHEN the Seed is parsed with `Seed` THE Contract SHALL accept it.
2. IF an object has an unknown field, an invalid id, or a non-ISO instant THEN THE Contract SHALL reject it with a zod issue naming the path.
3. THE Contract SHALL export JSON Schema for `Thread` via `z.toJSONSchema` with `additionalProperties: false`.

### Requirement 2: Deterministic time, ids and ordering
**User Story:** As a judge replaying the demo, I want identical results on any machine, so that the story is trustworthy.
#### Acceptance Criteria
1. THE `fmtTime` helper SHALL return `7:55 AM` for `2026-10-10T14:55:00Z` in `America/Los_Angeles`, with an ASCII space.
2. THE `fmtRange` helper SHALL join times with an en dash (`7:55 AM–12:30 PM`), and `fmtMoney(499)` SHALL return `$4.99`.
3. WHEN `nextId(state, "ho")` is called twice on a fresh state THE Contract SHALL return `ho_1` then `ho_2`.
4. THE `stableStringify` helper SHALL produce equal strings for objects with equal content in any key order.

### Requirement 3: In-memory store with optimistic concurrency
**User Story:** As an adapter author, I want a reference Store, so that I can implement FileStore and DynamoStore the same way.
#### Acceptance Criteria
1. WHEN `commit` is called with the current version THE Store SHALL save the state, append the events and return version + 1.
2. IF `commit` is called with a stale version THEN THE Store SHALL throw `StoreConflictError` and change nothing.
3. WHEN a caller mutates an object returned by `load` THE Store SHALL keep its stored copy unchanged.

### Requirement 4: Thread derivation
**User Story:** As the product owner, I want conditions and windows derived by the server, so that a model can't invent or omit them.
#### Acceptance Criteria
1. WHEN the Seed tournament is built THE Thread_Builder SHALL produce `r_transport` with window 07:55–12:30 local, and conditions in the order `c_transport_owner, c_departure_plan, c_jersey, c_arrival`, with `c_arrival` window 07:30–08:30.
2. WHEN the owner of an owner-condition is the creator THE Thread_Builder SHALL emit ATTESTED evidence with source `CREATION`.
3. IF a responsibility type is unknown, an owner is a minor or has no account, an item is missing for BRING_ITEM or PICKUP, or the deadline is after the event end THEN THE Thread_Builder SHALL throw `OpError` with code `VALIDATION_FAILED`.
4. WHEN a travel signal changes the travel time to a place THE `recomputeWindows` function SHALL move each TRANSPORT window start to `deadline − travel − 10 min`, and SHALL leave calendar blocks unchanged.

### Requirement 5: Availability
**User Story:** As a household member, I want THREAD to know when people are busy, including with commitments THREAD itself created, so that it never suggests someone who is already driving.
#### Acceptance Criteria
1. WHEN a person has a busy interval overlapping a window THE Availability SHALL return a `BUSY` conflict.
2. WHEN a person owns an exclusive responsibility in another live Thread whose THREAD-created calendar block overlaps the window THE Availability SHALL return a `COMMITMENT` conflict whose text is like `driving Leo until 12:30 PM (accepted earlier)` when the status is ACCEPTED.
3. THE Availability SHALL ignore responsibilities in the same Thread and non-exclusive types (BRING_ITEM).
4. THE Availability SHALL NOT treat planned ownership without a calendar block as busy (availability reflects what is actually on the calendar).

### Requirement 6: Seeding and testkit
**User Story:** As a test author, I want a canonical seeded state and deterministic fakes, so that every test starts from the same world.
#### Acceptance Criteria
1. WHEN `seedHousehold(Seed)` runs THE result SHALL contain 3 Threads and creation evidence `evd_1..evd_3` for maya's owned conditions.
2. THE `fixedClock` SHALL return the set instant until `set()` or `advance(minutes)` is called.
3. THE `fakeCalendar` SHALL return the same `block_id` for a repeated `createBlock` with the same `ref`, and `verifyBlock` SHALL be true only when the block exists with exactly that start and end.
4. THE `fakeServiceProvider` SHALL quote only while `now` is before the slot start, SHALL return the same `order_id` for a repeated `order_ref`, and SHALL report `DELIVERED` with `delivered_at` once `now ≥ delivered_at`.
5. THE Testkit SHALL record every connector call in a `calls` array, so tests can assert that no order was placed.
