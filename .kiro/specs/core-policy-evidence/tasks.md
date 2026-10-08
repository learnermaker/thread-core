# Implementation Plan: core-policy-evidence

## Overview
Tests and property tests for `src/engine/policy.ts` and `src/engine/status.ts` (reference code). This spec can run in parallel with core-impact-engine.

## Tasks

- [ ] 1. Policy tests
  - [ ] 1.1 `test/engine/policy.test.ts`: `threadFacts` for the tourney returns the computed keys from Requirement 1.1 with the values in design.md; `allows` matrix: PUBLIC, HOUSEHOLD (adult yes, leo no), THREAD (same thread yes, other no), PRIVATE (owner yes, shared_with yes, others no); a service gets THREAD of the same thread only
    - **Done when:** `npx vitest run test/engine/policy.test.ts` passes
    - _Requirements: 1.1, 1.2, 1.3_
  - [ ] 1.2 Same file: the three verified receipts in design.md (transport → sam with cause `busy_1` after adding the busy interval; service with extra order facts and cause `busy_1`; refill → sam without cause): assert `shared` (keys, labels, values, order), `withheld` (labels, order) and `policy_version: "1"`
    - **Done when:** `npx vitest run test/engine/policy.test.ts` passes
    - _Requirements: 2.1, 2.2, 2.5_
  - [ ] 1.3 Same file: CONTEXT_BLOCKED. In a cloned state, change `fact_address.sensitivity` to `HOUSEHOLD`; the service receipt throws `OpError` with `body.code === "CONTEXT_BLOCKED"`, and the message contains `delivery_address` but not `12 Alder Lane`
    - **Done when:** `npx vitest run test/engine/policy.test.ts` passes
    - _Requirements: 2.4_

- [ ] 2. Evidence and status tests
  - [ ] 2.1 `test/engine/status.test.ts`: `evidenceProblem` returns each of the 4 problem strings and `null` for good evidence (use the `ev()` helper from design.md); `STRENGTH_RANK` ordering
    - **Done when:** `npx vitest run test/engine/status.test.ts` passes
    - _Requirements: 3.1, 3.2, 3.3_
  - [ ] 2.2 Same file: precedence. One test per status in the precedence list, each built by mutating a seeded tourney clone. Seeded statuses at Thu 19:30. Arrival at 08:45 (outside the window) → not RESOLVED, and at 08:31 → EXPIRED. Arrival at 08:21 with every PRE satisfied → RESOLVED, still RESOLVED at 09:00
    - **Done when:** `npx vitest run test/engine/status.test.ts` passes
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 3. Checkpoint: commit
  - `npm run verify`, then commit `test(engine): context policy, receipts, evidence, derived status (spec core-policy-evidence, tasks 1-2)`, then push
  - _Requirements: 2.1, 4.1_

- [ ] 4. Property tests
  - [ ] 4.1 `test/engine/policy.properties.test.ts`: Property 1
    - **Done when:** `npx vitest run test/engine/policy.properties.test.ts` passes
    - _Requirements: 1.2, 2.3_
  - [ ] 4.2 `test/engine/status.properties.test.ts`: Properties 2, 3, 4 and 5
    - **Done when:** `npx vitest run test/engine/status.properties.test.ts` passes
    - _Requirements: 3.2, 4.1, 4.2_

- [ ] 5. Checkpoint: commit
  - `npm run verify`, then commit `test(engine): privacy and resolution properties (spec core-policy-evidence, task 4)`, then push
  - _Requirements: 2.3, 4.2_
