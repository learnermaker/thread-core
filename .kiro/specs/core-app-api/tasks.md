# Implementation Plan: core-app-api

## Overview
Make the verified application layer permanent: golden story gate, negative scenarios, schema agreement, properties, coverage in CI, build check. Prerequisites: specs core-model (testkit + helpers) and ideally core-impact-engine and core-policy-evidence are done.

## Tasks

- [ ] 1. Golden story gate
  - [x] 1.1 Create `test/golden/story.test.ts` exactly as in design.md
    - **Done when:** `npx vitest run test/golden` → 19 tests pass (18 steps + determinism). If any step fails, debug the code, never the fixture; if you believe the fixture is wrong, BLOCKED.md
    - _Requirements: 7.1, 6.3_
  - [x] 1.2 Checkpoint: `npm run verify`, then commit `test(app): golden ripple story gate (spec core-app-api, task 1)`, then push
    - _Requirements: 7.1_

- [ ] 2. Negative and edge scenarios
  - [ ] 2.1 `test/app/authz.test.ts`: N2, N10, N11, plus `ingestSignal` and `tick` called as a person → `FORBIDDEN`, and Golden step s09 behavior (sam approving cf_1 → `WRONG_PRINCIPAL`, the pharmacy fake has no `act:` call)
    - **Done when:** `npx vitest run test/app/authz.test.ts` passes
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.7_
  - [ ] 2.2 `test/app/ripple.test.ts`: N1, N7, N8, N9, and a duplicate `ingestSignal` (same `source_id`) → `duplicate: true` with no new events
    - **Done when:** `npx vitest run test/app/ripple.test.ts` passes
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 4.7_
  - [ ] 2.3 `test/app/handoff.test.ts`: N3, N4, plus a TRANSACT reject (maya rejects cf_1 → handoff `CANCELLED`, `r_pickup` `AT_RISK`), plus a repeated `requestHandoff` while pending → same handoff id
    - **Done when:** `npx vitest run test/app/handoff.test.ts` passes
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 6.2_
  - [ ] 2.4 `test/app/evidence.test.ts`: N5, N6, and tick before 10:42 (no change) vs at 10:42 (refill RESOLVED, evidence `observed_at` `2026-10-10T17:42:00.000Z`)
    - **Done when:** `npx vitest run test/app/evidence.test.ts` passes
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ] 2.5 `test/app/robustness.test.ts`: N12, N13, N14, N15, N16
    - **Done when:** `npx vitest run test/app/robustness.test.ts` passes
    - _Requirements: 1.1, 1.2, 1.3, 6.1, 6.4_

- [ ] 3. Checkpoint: commit
  - `npm run verify`, then commit `test(app): authorization, ripple, handoff, evidence, robustness (spec core-app-api, task 2)`, then push
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1_

- [ ] 4. Schemas and properties
  - [ ] 4.1 `test/schemas/schemas.test.ts`: everything under "Schema agreement" in design.md
    - **Done when:** `npx vitest run test/schemas` passes
    - _Requirements: 8.1, 8.2_
  - [ ] 4.2 `test/app/app.properties.test.ts`: Properties 1–3 from design.md (use `fc.asyncProperty`; `numRuns: 30` is enough for the replay-based properties)
    - **Done when:** `npx vitest run test/app/app.properties.test.ts` passes
    - _Requirements: 2.2, 5.3, 6.1_

- [ ] 5. Coverage, build and package surface
  - [ ] 5.1 Add `- run: npm run coverage` to `.github/workflows/ci.yml` after `npm run verify`
    - **Done when:** `npm run coverage` passes locally (all thresholds met). If below a threshold, add focused tests for the uncovered lines; never lower the thresholds
    - _Requirements: 8.3_
  - [ ] 5.2 `npm run build`, then `npm pack --dry-run`
    - **Done when:** the build succeeds and the pack listing includes `dist/index.js`, `dist/index.d.ts`, `dist/testkit/index.js`, `LICENSE`, `NOTICE` and `README.md`, and no `test/`, `fixtures/` or `src/` files
    - _Requirements: 8.3_
  - [ ] 5.3 `test/package.test.ts`: dynamic-import `../src/index.ts` and assert the exports `createThreadApp`, `memoryStore`, `operations`, `jsonSchemas`, `errorCodes`, `householdTypes`, `Thread`, `rankCandidates`, `buildReceipt`, `deriveStatus` exist
    - **Done when:** `npx vitest run test/package.test.ts` passes
    - _Requirements: 8.3_

- [ ] 6. Checkpoint: commit and confirm CI
  - `npm run verify`, then commit `test(app): schemas, properties, coverage gate (spec core-app-api, tasks 4-5)`, then push
  - `gh run watch <latest id> --repo learnermaker/thread-core --exit-status` → success on both OSes
  - _Requirements: 7.1, 8.1_
