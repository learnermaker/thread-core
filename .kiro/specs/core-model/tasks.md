# Implementation Plan: core-model

## Overview
Testkit and helpers first, then tests for the contract and the reference modules. Run each task's "Done when" command, then `npm run verify`.

## Tasks

- [ ] 1. Testkit and test helpers
  - [ ] 1.1 Create `src/testkit/clock.ts`, `src/testkit/calendar.ts`, `src/testkit/service.ts` and `src/testkit/index.ts` exactly as in design.md
    - **Done when:** `npx tsc -p tsconfig.build.json --noEmit` passes and `node scripts/check-purity.mjs` prints `purity ok`
    - _Requirements: 6.2, 6.3, 6.4, 6.5_
  - [ ] 1.2 Create `test/helpers.ts` exactly as in design.md
    - **Done when:** `npx tsc --noEmit` passes
    - _Requirements: 6.1_
  - [ ] 1.3 Create `test/testkit/testkit.test.ts`: the clock set/advance; the calendar idempotent `ref`, move, verify true/false and `failNext`; the service quote before/after slot start, idempotent `order_ref`, PLACED vs DELIVERED at `2026-10-10T10:42:00-07:00`, and the `calls` log
    - **Done when:** `npx vitest run test/testkit` passes
    - _Requirements: 6.2, 6.3, 6.4, 6.5_

- [ ] 2. Contract tests
  - [ ] 2.1 `test/model/schemas.test.ts`: the Seed parses; an unknown field, a bad id (`"Maya"`) and a bad instant (`"tomorrow"`) are rejected with the issue path; `z.toJSONSchema(Thread)` has `additionalProperties: false`
    - **Done when:** `npx vitest run test/model/schemas.test.ts` passes
    - _Requirements: 1.1, 1.2, 1.3_
  - [ ] 2.2 `test/model/time.test.ts`: `fmtTime` (`7:55 AM`), `fmtDay` (`Saturday`), `fmtRange` (en dash), `fmtMoney(499)` (`$4.99`), `fmtMoney(1200)` (`$12.00`), `toUtc` of `2026-10-10T08:30:00-07:00` (`2026-10-10T15:30:00.000Z`), `overlaps` (touching windows don't overlap), `within` (inclusive); plus **Property 1**
    - **Done when:** `npx vitest run test/model/time.test.ts` passes
    - _Requirements: 2.1, 2.2_
  - [ ] 2.3 `test/model/util.test.ts`: `nextId` sequences, `stableStringify` key-order independence, `cmp`, `clone` deep copy; plus **Property 2**
    - **Done when:** `npx vitest run test/model/util.test.ts` passes
    - _Requirements: 2.3, 2.4_
  - [ ] 2.4 `test/store/memory.test.ts`: commit/load/version, stale version → `StoreConflictError` with nothing changed, events appended in order; plus **Property 3**
    - **Done when:** `npx vitest run test/store` passes
    - _Requirements: 3.1, 3.2, 3.3_

- [ ] 3. Checkpoint: commit
  - `npm run verify`, then `git add -A`, `git commit -m "test(model): contract, store and testkit (spec core-model, tasks 1-2)"`, `git push`
  - _Requirements: 1.1, 2.1, 3.1, 6.1_

- [ ] 4. Thread derivation and seeding
  - [ ] 4.1 `test/engine/derive.test.ts`: assert every row of "Key facts to assert" in design.md for the tourney, refill and dinner windows and conditions (order and windows), and the creation evidence. Also: the creator is auto-added to participants, and the default autonomy is `COORDINATE`
    - **Done when:** `npx vitest run test/engine/derive.test.ts` passes
    - _Requirements: 4.1, 4.2, 6.1_
  - [ ] 4.2 In the same file, the validation errors: unknown type, owner `leo` (minor), BRING_ITEM without item, deadline after event end, unknown place, duplicate thread id → each `OpError` with `body.code === "VALIDATION_FAILED"`
    - **Done when:** `npx vitest run test/engine/derive.test.ts` passes
    - _Requirements: 4.3_
  - [ ] 4.3 `recomputeWindows` test: push travel signal `{ place: "place_riverside", minutes: 40, cause: "heavy rain", source_id: "wx", at: <any> }` → the `r_transport` window start is `2026-10-10T14:40:00.000Z`, and an existing `block` is unchanged
    - **Done when:** `npx vitest run test/engine/derive.test.ts` passes
    - _Requirements: 4.4_

- [ ] 5. Availability
  - [ ] 5.1 `test/engine/availability.test.ts`: (a) a busy interval for maya Sat 07:00–13:00 → a `BUSY` conflict against her transport window; (b) after setting `r_transport.owner = "sam"`, `status = "ACCEPTED"` and `block = { block_id: "blk_1", start: <window.start>, end: <window.end> }` in the tourney, `conflicts(state, reg, "sam", refillWindow, "thr_rosa_refill")` → `[{ code: "COMMITMENT", text: "driving Leo until 12:30 PM (accepted earlier)" }]`; (c) the same call with exceptThreadId `thr_leo_tourney` → `[]`; (d) r_jersey (BRING_ITEM) never conflicts; (e) maya owns r_transport and r_pickup with overlapping windows but no blocks → `conflicts(state, reg, "maya", pickupWindow, "thr_rosa_refill")` is `[]`; plus **Property 4**
    - **Done when:** `npx vitest run test/engine/availability.test.ts` passes
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 6. Checkpoint: commit
  - `npm run verify`, then `git add -A`, `git commit -m "test(engine): derivation, availability, seeding (spec core-model, tasks 4-5)"`, `git push`
  - _Requirements: 4.1, 5.1_
