# Overnight Report — thread-core

**Branch:** `crew/overnight-core`
**PR:** [learnermaker/thread-core #1](https://github.com/learnermaker/thread-core/pull/1) — "Overnight: thread-core specs core-model to core-app-api" (OPEN)
**Generated:** 2026-10-08 (final gate step 6/6)

## Green gate — all pass

| Command | Result |
| --- | --- |
| `npm run verify` | **VERIFY PASSED** (contract checksums, dependency allowlist, core purity, secret scan, typecheck, build typecheck, tests — all `ok`) |
| `npm run coverage` | 27 files, **198 tests passed, 0 failed** |
| `npm run build` | clean (`scripts/clean.mjs dist && tsc -p tsconfig.build.json`, exit 0) |

Total test count from `npx vitest run`: **198 passed / 0 failed** across 27 files.

## Per-spec summary

All checkboxes in every `tasks.md` are ticked `[x]`. No tasks blocked.

### core-model — complete, 0 blocked
Tasks 1–6 done (testkit + helpers, contract tests, checkpoint, derivation & seeding, availability, checkpoint).
Test files & counts: `testkit.test.ts` (9), `model/schemas.test.ts` (5), `model/time.test.ts` (8), `model/util.test.ts` (5), `store/memory.test.ts` (3), `engine/derive.test.ts` (11), `engine/availability.test.ts` (6). **≈47 tests.**

### core-impact-engine — complete, 0 blocked
Tasks 1–7 done (graph/traversal, severity/assessment, checkpoint, ranking, autonomy, properties, checkpoint).
Test files & counts: `engine/graph.test.ts` (6), `engine/severity.test.ts` (7), `engine/impact.test.ts` (5), `engine/candidates.test.ts` (5), `engine/autonomy.test.ts` (20), `engine/impact.properties.test.ts` (4 properties), `engine/autonomy.properties.test.ts` (Property 5). **≈47 tests.**
Note: these seven test files were still uncommitted at the start of this final step (Task 3's checkpoint commit had not landed); they are committed as part of this step's `docs(crew): overnight report` work along with the final `tasks.md` tick.

### core-policy-evidence — complete, 0 blocked
Tasks 1–5 done (policy tests, evidence & status, checkpoint, properties, checkpoint).
Test files & counts: `engine/policy.test.ts` (12), `engine/status.test.ts` (17), `engine/policy.properties.test.ts` (Property 1), `engine/status.properties.test.ts` (4 — Properties 2–5). **≈33 tests.**

### core-app-api — complete, 0 blocked
Tasks 1–6 done (golden story gate, negative/edge scenarios, checkpoint, schemas & properties, coverage/build/package surface, checkpoint & CI).
Test files & counts: `golden/story.test.ts` (19), `app/authz.test.ts` (5), `app/ripple.test.ts` (5), `app/handoff.test.ts` (4), `app/evidence.test.ts` (3), `app/robustness.test.ts` (5), `schemas/schemas.test.ts` (24), `app/app.properties.test.ts` (3), `test/package.test.ts` (package surface). **≈68 tests.**

## Coverage summary (`npm run coverage`, v8)

| Metric | All files |
| --- | --- |
| Statements | **93.98%** |
| Branches | **82.53%** |
| Functions | **97.06%** |
| Lines | **97.28%** |

Per-area highlights: `src/model` 100% stmts; `src/engine` 96.63% stmts / 90.06% branch; `src/app` 92.23% stmts / 77.51% branch; `src/schemas` 100%; `src/store` 100% stmts.

## Behavior changes to reference code (src/engine, src/app, src/schemas)

**None.** No reference implementation code was modified. `git diff origin/main...HEAD -- src` shows changes only in `src/testkit/**` (test-only infrastructure):

- `src/testkit/clock.ts` — new — fake clock (set/advance) for deterministic time in tests.
- `src/testkit/calendar.ts` — new — in-memory calendar fake (ref/move/verify/failNext) for availability tests.
- `src/testkit/service.ts` — new — service fake (quote/order, idempotent order_ref, PLACED/DELIVERED, call log) for handoff/evidence tests.
- `src/testkit/index.ts` — new — barrel re-export of the three testkit fakes.

`src/engine/**`, `src/app/**`, `src/schemas/**` and all other architect-owned files are untouched, as required by the steering rules.

## BLOCKED.md

No `crew/BLOCKED.md` exists — nothing was blocked during the overnight run.

## CI status (`gh pr checks`, PR #1)

| Check | Status | Duration |
| --- | --- | --- |
| verify (ubuntu-latest) | **pass** | 33s |
| verify (windows-latest) | **pass** | 1m1s |

PR: [https://github.com/learnermaker/thread-core/pull/1](https://github.com/learnermaker/thread-core/pull/1)
