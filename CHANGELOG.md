# Changelog

All notable changes to thread-core are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Versioning: [Semantic Versioning](https://semver.org/).

---

## 0.1.0 – 2026-10-10

### Added

- **Core engine**: impact graph traversal, candidate ranking, context receipt (minimum-necessary facts), evidence authorization, derived thread status, autonomy matrix.
- **Application API**: `createThread`, `listThreads`, `getThread`, `reportChange`, `requestHandoff`, `respondToHandoff`, `recordEvidence`, `confirmAction` (user operations); `ingestSignal`, `tick`, `inbox` (system operations).
- **Built-in responsibility types**: `TRANSPORT`, `BRING_ITEM`, `PICKUP`, `ATTEND` (household domain, registered at runtime — the core is domain-agnostic).
- **Custom types**: register any `ResponsibilityType` at runtime via `createThreadApp({ types: [...] })`.
- **Ports**: `Store` (optimistic-concurrency versioned state), `CalendarConnector`, `ServiceProvider` (quote → confirm → act → verify flow).
- **Testkit**: `memoryStore`, `fixedClock`, `fakeCalendar`, `fakeServiceProvider` — exported as `thread-core/testkit`.
- **JSON Schemas**: all 11 operations' inputs and outputs as JSON Schema draft 2020-12 via `jsonSchemas`.
- **Examples**: `household-weekend.ts` (golden story replay), `caregiver-rota.ts` (custom type), `agent-handoff.ts` (agents as principals).
- **Community files**: CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, ROADMAP.md, issue templates, pull request template.
- **CI**: `npm run verify` (contract, deps, purity, secrets, typecheck, build typecheck, tests) passing on `ubuntu-latest` and `windows-latest`.
