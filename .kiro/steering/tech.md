---
inclusion: always
---
# Tech stack (pinned; do not change)

| What | Exact |
|---|---|
| Node | 24 LTS (`.nvmrc`, `engines >=24`) |
| Module system | ESM only (`"type": "module"`), TypeScript `module: nodenext` |
| TypeScript | 5.9.3 (NOT 7.x) |
| Runtime dependency | **zod 4.6.5 only** |
| Dev dependencies | vitest 5.0.3, @vitest/coverage-v8 5.0.3, fast-check 4.10.2, @types/node 24.19.1, typescript 5.9.3 |

**Never add, remove or upgrade a dependency.** `npm run verify` enforces the list (`scripts/check-deps.mjs`). If you think you need a package, use the BLOCKED protocol.

## Commands
- `npm run verify`: THE green check (contract, deps, purity, secrets, typecheck, build typecheck, tests). Run it before saying a task is done.
- `npx vitest run test/engine/impact.test.ts` runs one test file; `npx vitest run -t "ripple"` runs tests by name.
- `npm run coverage`: coverage with thresholds (lines ≥ 90%).
- `npm run build`: emits `dist/`.

## Code rules
- **Relative imports end in `.ts`**: `import { cmp } from "../model/util.ts";`. tsc rewrites them to `.js` on build. Type-only imports use `import type`.
- `src/` must not use Node APIs or globals (`node:*`, `process`, `console`, `structuredClone`, `Buffer`). The build tsconfig has `types: []`, so they don't even compile. Use `clone()` from `src/model/util.ts`.
- `erasableSyntaxOnly`: no `enum`, no `namespace`, no constructor parameter properties. Use zod enums / union types.
- Types come from zod: `type X = z.infer<typeof X>`. Never hand-write a duplicate interface for a schema.
- **zod 4 idioms:** `z.strictObject({...})`, `z.iso.datetime({ offset: true })`, `z.discriminatedUnion("type", [...])`, `z.toJSONSchema(schema)`, and `schema.safeParse(x)` → `.error.issues`.
- Data fields are **snake_case** (`thread_id`, `confirm_items`). Functions and variables are camelCase.
- Times: store as UTC ISO strings (`toUtc`), compare with `ms()`, format only with the helpers in `src/model/time.ts` (explicit time zone).
- Sorting: `cmp()` from `src/model/util.ts`, never `localeCompare`.
- Ids: `nextId(state, prefix)` (a counter in state). Never random ids.
