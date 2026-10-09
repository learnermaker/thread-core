# Requirements Document: core-package-oss

## Introduction
Turn thread-core into a community-grade open-source project and release **v0.1.0**: a README that sells and teaches in 2 minutes, concept and extension docs, three runnable examples (one with a custom responsibility type, to prove the core is domain-agnostic), community scaffolding with real good-first-issues, a changelog, and a GitHub release whose tarball `thread-alexa` installs. (Master Spec §D15, §B4 Open Source criteria, §F5.)

## Glossary
- **Repo**: `learnermaker/thread-core`.
- **Release_Tarball**: the `npm pack` output `thread-core-0.1.0.tgz`, attached to the GitHub release `v0.1.0`; consumers install it via `https://github.com/learnermaker/thread-core/releases/download/v0.1.0/thread-core-0.1.0.tgz`.
- **Examples**: `examples/household-weekend.ts`, `examples/caregiver-rota.ts`, `examples/agent-handoff.ts`, each exporting `main(log)` and runnable with `node examples/<name>.ts`.

## Requirements

### Requirement 1: README
**User Story:** As a developer landing on the repo, I want to understand what thread-core is and run it in under 2 minutes.
#### Acceptance Criteria
1. THE README SHALL contain, in this order: the tagline, badges (CI, license, "MCP-ready"), "Why" (what breaks today), a 4-concept glossary (Thread, Responsibility, Condition + Evidence strength, Context Receipt), Quickstart (install + the caregiver example run), "What it does" (impact → handoff → receipt → evidence → derived status, with the household ripple output), the API overview table (8 operations + system operations), "Extending" (link to docs/extending.md), Examples, Design principles (deterministic, I/O through ports, zod-only, explainable), "Built with Kiro" (link to `.kiro/specs` and `docs/kiro-log.md`), Roadmap, Contributing, License.
2. THE README SHALL contain only statements that are true for v0.1.0 (no npm publish claim, no unbuilt adapters).

### Requirement 2: Docs
#### Acceptance Criteria
1. `docs/concepts.md` SHALL explain the domain model, derived status (with the precedence list), evidence strengths, the context policy, severity and the autonomy matrix, using the household story as the running example.
2. `docs/extending.md` SHALL show how to register a custom responsibility type (using COVER_VISIT from the caregiver example), implement a `Store`, a `CalendarConnector` and a `ServiceProvider` (with the testkit fakes as reference).

### Requirement 3: Examples
**User Story:** As an evaluator, I want proof that the core is reusable beyond THREAD.
#### Acceptance Criteria
1. WHEN `node examples/household-weekend.ts` runs THE example SHALL replay the ripple on the golden seed and print each Thread's severity line and the final statuses (tourney RESOLVED, refill RESOLVED, dinner PLAN_SECURED).
2. WHEN `node examples/caregiver-rota.ts` runs THE example SHALL print `Tuesday visit to Ada: HIGH — …`, the receipt line, `After Cleo accepts: PLAN_SECURED` and `After the visit: RESOLVED`.
3. WHEN `node examples/agent-handoff.ts` runs THE example SHALL show two AI agents and a human sharing one responsibility ledger (a custom `DELIVER_REPORT` type): the first agent is rate-limited (PERSON_UNAVAILABLE), the second agent takes over via handoff, and the human's attestation resolves it.
4. THE test suite SHALL run every example's `main()` and assert its key lines.

### Requirement 4: Community scaffolding
#### Acceptance Criteria
1. THE Repo SHALL contain CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, ROADMAP.md, CHANGELOG.md, `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/feature_request.yml` and `.github/PULL_REQUEST_TEMPLATE.md`.
2. THE Repo SHALL have the 6 good-first-issues listed in design.md opened as GitHub issues with the labels `good first issue` and `help wanted`.

### Requirement 5: Release v0.1.0
#### Acceptance Criteria
1. WHEN released THE package version SHALL be `0.1.0`, the tag `v0.1.0` SHALL exist on GitHub, and the GitHub release SHALL have the Release_Tarball attached.
2. WHEN the Release_Tarball is installed into an empty folder THE import `import { createThreadApp, jsonSchemas } from "thread-core"` SHALL work.

### Requirement 6: Public visibility (operator-gated)
#### Acceptance Criteria
1. IF the operator has confirmed in chat THEN the Repo SHALL be made public only after a full-history secret check passes.
