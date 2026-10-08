---
inclusion: always
---
# Repository structure

```text
src/
  model/        schemas.ts (all data shapes, zod) · errors.ts · time.ts · util.ts      [ARCHITECT-OWNED]
  registry/     types.ts (ResponsibilityType + householdTypes)                       [ARCHITECT-OWNED]
  ports.ts      Clock · Store · CalendarConnector · ServiceProvider                   [ARCHITECT-OWNED]
  store/        memory.ts (in-memory Store)                                          [ARCHITECT-OWNED]
  engine/       pure functions over HouseholdState: derive, availability, impact, candidates, policy, status, autonomy
  app/          createThreadApp(): the 8 operations + system operations (I/O via ports only)
  schemas/      JSON Schema export for every operation (z.toJSONSchema)
  testkit/      fixedClock, fakeCalendar, fakeServiceProvider (pure; exported as "thread-core/testkit")
  index.ts      public API (exports only what the specs list)
test/           mirrors src/ (test/engine/impact.test.ts …) · test/helpers.ts (loadSeed, loadStory, seedState) · test/golden/story.test.ts
fixtures/golden/ rivera-seed.json, ripple-story.json                                  [ARCHITECT-OWNED]
scripts/        verify + checks + hooks (Node only, Windows-safe)
docs/           kiro-log.md (auto), concepts, guides
examples/       runnable examples (spec core-package-oss)
```

## Import direction (never reversed)
`model` ← `registry` ← `engine` ← `app` ← `index`. `ports.ts` depends only on `model`. `testkit` may import anything in `src`. **`src` never imports from `test/` or `fixtures/`.** The engine never imports `app`.

## Naming
File names are lower case (`impact.ts`). Exported functions are camelCase; schemas are PascalCase (`Thread`, `ThreadInput`). Test names describe behavior: `"ripple: dinner is reported NONE (not affected)"`.
