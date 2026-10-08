# Implementation Plan: core-impact-engine

## Overview
The reference code is in place. Write tests that pin its behavior to the requirements, plus 5 property tests. Fix only genuine bugs. Use the helper pattern from design.md.

## Tasks

- [x] 1. Graph and traversal tests
  - [x] 1.1 `test/engine/graph.test.ts`: the seeded graph has `avail:maya → person:maya` (AVAILABILITY_OF), `person:maya → resp:thr_leo_tourney/r_transport` (OWNS), `travel:place_riverside → cond:thr_leo_tourney/c_departure_plan` (AFFECTS), and `person:sam → object:jersey` (HOLDS). A cancelled thread contributes no edges
    - **Done when:** `npx vitest run test/engine/graph.test.ts` passes
    - _Requirements: 1.1_
  - [x] 1.2 Same file: the Ripple reaches `resp:thr_leo_tourney/r_transport`, `resp:thr_rosa_refill/r_pickup` and `resp:thr_family_dinner/r_reservation`, but not `resp:thr_leo_tourney/r_jersey`; the path to `thread:thr_leo_tourney` starts at `avail:maya`; the travel signal reaches only `r_transport` of the tourney; `traverse(edges, ["avail:maya"], 1)` returns exactly the keys `avail:maya` and `person:maya`
    - **Done when:** `npx vitest run test/engine/graph.test.ts` passes
    - _Requirements: 1.2, 1.3, 1.4_

- [x] 2. Severity and assessment tests
  - [x] 2.1 `test/engine/severity.test.ts`: a table test of `severityOf` covering all 6 rows of the severity table in design.md, including the boundaries (720 min = CRITICAL, 721 = HIGH; slack 29 = MEDIUM, 30 = LOW)
    - **Done when:** `npx vitest run test/engine/severity.test.ts` passes
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 2.2 `test/engine/impact.test.ts`: the Ripple returns `[tourney HIGH, refill HIGH, dinner NONE]` with the exact `why` strings from the trace. An unrelated change (maya busy Sun 2026-10-11 10:00–12:00 local) returns all three Threads NONE. Maya busy Sat 06:00–08:10 local with only 2 h to the deadline (now = Sat 06:30) gives the tourney CRITICAL
    - **Done when:** `npx vitest run test/engine/impact.test.ts` passes
    - _Requirements: 2.1, 2.4, 2.5, 3.1, 3.2_
  - [x] 2.3 Same file, the rain: after simulating Sam's accepted transport with its block at the 07:55 window, push the travel signal (40 min, `heavy rain`), `recomputeWindows`, then assess at Sat 07:05 → tourney MEDIUM with the 2 exact `why` strings, `after.plan_drift === true`
    - **Done when:** `npx vitest run test/engine/impact.test.ts` passes
    - _Requirements: 2.2, 2.6, 3.3_
  - [x] 2.4 Same file, privacy: add a PRIVATE fact (`value: "Dentist 7:30"`) for maya to state; assert no `why` string of any assessment contains `Dentist`
    - **Done when:** `npx vitest run test/engine/impact.test.ts` passes
    - _Requirements: 3.4_

- [x] 3. Checkpoint: commit
  - `npm run verify`, then commit `test(engine): impact graph, traversal, severity (spec core-impact-engine, tasks 1-2)`, then push
  - _Requirements: 1.1, 2.1_

- [x] 4. Ranking tests
  - [x] 4.1 `test/engine/candidates.test.ts`: tourney transport after the Ripple → candidates `[sam]` with score 5 and the 4 reasons in order (FREE, CAN_DRIVE, HOLDS_ITEM, PARTICIPANT); excluded `[rosa]` with CAN_DRIVE `doesn't drive`; leo and maya never appear; `describe(sam)` equals the trace string
    - **Done when:** `npx vitest run test/engine/candidates.test.ts` passes
    - _Requirements: 4.1, 4.3_
  - [x] 4.2 Same file: the refill after simulated acceptance → candidates `[svc_pharmacy_delivery]` with the 3 reasons, and excluded `[rosa, sam]` with the exact texts. The refill before acceptance → candidates `[sam, svc_pharmacy_delivery]` (people before services)
    - **Done when:** `npx vitest run test/engine/candidates.test.ts` passes
    - _Requirements: 4.2, 4.4_
  - [x] 4.3 Same file: a quote whose slot ends after the deadline is excluded (`no slot before the deadline`); with two eligible people, the lower-load one gets LOWEST_LOAD (+1). Build this by setting `rosa.can_drive = true` in a cloned state
    - **Done when:** `npx vitest run test/engine/candidates.test.ts` passes
    - _Requirements: 4.1, 4.5_

- [x] 5. Autonomy tests
  - [x] 5.1 `test/engine/autonomy.test.ts`: assert all 20 cells against the design table (write the table literally in the test)
    - **Done when:** `npx vitest run test/engine/autonomy.test.ts` passes
    - _Requirements: 5.1_

- [x] 6. Property tests
  - [x] 6.1 `test/engine/impact.properties.test.ts`: Properties 1–4 from design.md (use the generator hint)
    - **Done when:** `npx vitest run test/engine/impact.properties.test.ts` passes
    - _Requirements: 1.2, 2.1, 2.5, 4.1, 4.2_
  - [x] 6.2 `test/engine/autonomy.properties.test.ts`: Property 5
    - **Done when:** `npx vitest run test/engine/autonomy.properties.test.ts` passes
    - _Requirements: 5.2_

- [x] 7. Checkpoint: commit
  - `npm run verify`, then commit `test(engine): ranking, autonomy, properties (spec core-impact-engine, tasks 4-6)`, then push
  - _Requirements: 4.1, 5.1_
