---
inclusion: always
---
# Testing rules

- **Vitest 5** (`import { describe, test, expect } from "vitest"`) and **fast-check 4** (`import fc from "fast-check"`, then `fc.assert(fc.property(...))`) for properties.
- Tests live in `test/`, mirroring `src/` paths. One behavior per `test(...)`.
- **Golden fixtures are read-only.** `fixtures/golden/rivera-seed.json` is the canonical household and `fixtures/golden/ripple-story.json` is the canonical story with expected results. Load them with `loadSeed()` / `loadStory()` from `test/helpers.ts` (tests may use Node APIs; `src/` may not). If a golden expectation fails, fix the code. If you believe the expectation is wrong, use the BLOCKED protocol. **Never edit fixtures, never weaken assertions, never `test.skip` a failing test.**
- Build test states through public functions (`buildThread`, the app operations, `loadSeed`), not by hand-writing large state objects.
- Use a fixed clock. Never depend on the machine's time zone or the current date.
- Every Correctness Property in a spec's design.md gets a fast-check test named `property N: <title>`, using the default 100 runs or more.
- A task is done only when its "Done when" command passes **and** `npm run verify` passes.
- Coverage target: lines ≥ 90% (`npm run coverage`), enforced in CI.
