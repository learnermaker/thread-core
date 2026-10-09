# Implementation Plan: core-package-oss

## Overview
Examples first (they feed the README), then docs, community files, issues, and the release. Prerequisite: all earlier thread-core specs merged to `main`, and `npm run verify` green.

## Tasks

- [ ] 1. Examples
  - [ ] 1.1 Run `node examples/caregiver-rota.ts` and confirm it prints the 4 verified lines from design.md
    - **Done when:** the output matches
    - _Requirements: 3.2_
  - [ ] 1.2 Create `examples/household-weekend.ts` per design.md
    - **Done when:** `node examples/household-weekend.ts` ends with `Weekend: Leo's Saturday Tournament RESOLVED · Rosa's prescription refill RESOLVED · Family dinner PLAN_SECURED`
    - _Requirements: 3.1_
  - [ ] 1.3 Create `examples/agent-handoff.ts` per design.md
    - **Done when:** `node examples/agent-handoff.ts` shows HIGH, the receipt, PLAN_SECURED, maria's evidence not satisfied ("not from the responsible person"), then RESOLVED
    - _Requirements: 3.3_
  - [ ] 1.4 `test/examples.test.ts`: import each example's `main`, collect its log lines, and assert the key lines from 1.1–1.3
    - **Done when:** `npx vitest run test/examples.test.ts` passes, and `npm run verify` passes
    - _Requirements: 3.4_

- [ ] 2. Checkpoint: commit `docs(examples): household, caregiver rota, agent handoff (spec core-package-oss, task 1)`, then push
  - _Requirements: 3.1_

- [ ] 3. Documentation
  - [ ] 3.1 Write `README.md` following the README skeleton in design.md. Paste real output from the examples (run them, don't invent output)
    - **Done when:** every section of the skeleton is present, and each command in the README has been run once and works
    - _Requirements: 1.1, 1.2_
  - [ ] 3.2 Write `docs/concepts.md` and `docs/extending.md`
    - **Done when:** both exist and cover every point in Requirement 2; the code snippets compile (copy them from the examples or testkit)
    - _Requirements: 2.1, 2.2_

- [ ] 4. Community scaffolding
  - [ ] 4.1 Create CONTRIBUTING.md (setup, `npm run verify`, the spec-driven workflow with `.kiro/specs`, the commit style), CODE_OF_CONDUCT.md (adopt Contributor Covenant 2.1 by name and link, with a contact line: open a private security advisory), SECURITY.md (report via GitHub private vulnerability reporting), ROADMAP.md (the 6 good-first-issues + MCP 2026-07-28 + npm publish + TypeDoc site), CHANGELOG.md (`## 0.1.0 – 2026-10-xx` with Added bullets), `docs/release-notes-0.1.0.md`
    - **Done when:** the files exist and `npm run verify` passes
    - _Requirements: 4.1_
  - [ ] 4.2 Create `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/feature_request.yml` (GitHub issue-forms YAML) and `.github/PULL_REQUEST_TEMPLATE.md` (a checklist: verify green, tests added, spec or issue linked)
    - **Done when:** the files exist
    - _Requirements: 4.1_
  - [ ] 4.3 Commit `docs: README, concepts, extending, community files (spec core-package-oss, tasks 3-4)`, then push. Then create the label if missing (`gh label create "help wanted" --repo learnermaker/thread-core --force`) and open the 6 issues from design.md: `gh issue create --repo learnermaker/thread-core --title "<title>" --body "<body>" --label "good first issue" --label "help wanted"`
    - **Done when:** `gh issue list --repo learnermaker/thread-core --label "good first issue"` lists 6 issues
    - _Requirements: 4.2_

- [ ] 5. Release v0.1.0
  - [ ] 5.1 Follow "Release procedure" in design.md exactly
    - **Done when:** `gh release view v0.1.0 --repo learnermaker/thread-core` shows the asset `thread-core-0.1.0.tgz`
    - _Requirements: 5.1_
  - [ ] 5.2 Run the smoke test from design.md with the local `.tgz`
    - **Done when:** it prints `function 11`
    - _Requirements: 5.2_

- [ ] 6. Make the repo public (STOP and ask the operator first)
  - Ask in chat: "Ready to make learnermaker/thread-core public. Proceed?" Continue only on an explicit yes. Then run the history secret check and the visibility command from design.md, then repeat the smoke test with the release URL
  - **Done when:** `gh repo view learnermaker/thread-core --json visibility` shows `PUBLIC`, and the URL smoke test prints `function 11`
  - _Requirements: 6.1, 5.2_
