# Requirements Document: core-bootstrap

## Introduction
Set up the `thread-core` repository so every later spec builds on a green, guarded baseline: the architect's files installed, dependencies pinned, the `npm run verify` gate passing, Kiro hooks active, CI on Windows and Ubuntu, and the first commit pushed. (Master Spec §D15, §D16, §D18.)

## Glossary
- **Repo**: the local clone at `../thread-core` (remote `learnermaker/thread-core`).
- **Architect_Files**: everything under `thread-prep/kiro/thread-core/`, installed by `node ../thread-prep/kiro/install.mjs core`.
- **Verify_Gate**: `npm run verify` (contract checksums, dependency allowlist, purity, secrets, typecheck, build typecheck, tests).
- **Hooks**: `.kiro/hooks/*.json` running `scripts/hooks/*.mjs`.

## Requirements

### Requirement 1: Install the architect's files
**User Story:** As the builder, I want the specs, steering, hooks, contract and fixtures in the Repo, so that every task has its rules and inputs.
#### Acceptance Criteria
1. WHEN the install command runs from the Repo root THE Repo SHALL contain `.kiro/steering/product.md`, `.kiro/specs/core-app-api/tasks.md`, `src/model/schemas.ts`, `fixtures/golden/ripple-story.json` and `contract.sha256.json`.
2. THE Repo SHALL keep the `.gitattributes` rule `* text=auto eol=lf`.

### Requirement 2: Pinned toolchain
**User Story:** As the architect, I want exact dependency versions, so that the build is reproducible on any machine.
#### Acceptance Criteria
1. WHEN `npm install` completes THE Repo SHALL have a `package-lock.json` and `zod@4.6.5` as its only runtime dependency.
2. THE Verify_Gate SHALL fail if any dependency is added, removed or changed.

### Requirement 3: Green baseline
**User Story:** As the operator, I want one command that says "green", so that I can trust Kiro's "done".
#### Acceptance Criteria
1. WHEN `npm run verify` runs on the bootstrapped Repo THE Verify_Gate SHALL print `VERIFY PASSED`.
2. IF a contract file is modified THEN THE Verify_Gate SHALL fail and name the file.

### Requirement 4: Guard hooks
**User Story:** As the architect, I want hooks that stop protected-file edits and stop "done while red", so that a weaker model can't game the tests.
#### Acceptance Criteria
1. WHEN the guard script receives a write to `fixtures/golden/**` or `src/model/**` THE Hooks SHALL exit with code 2.
2. WHEN the guard script receives a write to `src/engine/**` THE Hooks SHALL exit with code 0.
3. WHEN the Stop hook runs while the Verify_Gate fails THE Hooks SHALL print a JSON `{"decision":"block"}` at most 3 consecutive times.

### Requirement 5: Repository on GitHub with CI
**User Story:** As the user, I want the repo pushed with CI and discoverable metadata, so that judges and contributors see a healthy project.
#### Acceptance Criteria
1. WHEN the bootstrap commit is pushed THE CI workflow SHALL run `npm run verify` and `npm run build` on `ubuntu-latest` and `windows-latest`.
2. THE GitHub repository SHALL have a description and the topics `mcp`, `agents`, `coordination`, `typescript`, `hacktoberfest`.
