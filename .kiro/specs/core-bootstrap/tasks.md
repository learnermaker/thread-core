# Implementation Plan: core-bootstrap

## Overview
Install the architect's files, pin dependencies, prove the gate and the hooks, then push with CI. Expected time: about 20 minutes.

## Tasks

- [ ] 1. Install the architect's files
  - From the repo root (`thread-core`), run `node ../thread-prep/kiro/install.mjs core`
  - If the command can't reach `../thread-prep`, ask the user to run it, then continue
  - **Done when:** the output says `install core: N files copied`, and `Test-Path .kiro/steering/product.md, src/model/schemas.ts, fixtures/golden/ripple-story.json, contract.sha256.json` prints `True` four times
  - _Requirements: 1.1, 1.2_

- [ ] 2. Install pinned dependencies
  - Run `npm install` (not `npm update`, not `npm audit fix`)
  - **Done when:** `npm ls zod` shows `zod@4.6.5`, and `package-lock.json` exists
  - _Requirements: 2.1_

- [ ] 3. Prove the Verify_Gate
  - Run `npm run verify`
  - **Done when:** the last line is `VERIFY PASSED`. If not, do not change any file: write BLOCKED.md with the output
  - _Requirements: 2.2, 3.1, 3.2_

- [ ] 4. Smoke-test the hooks
  - Run the two guard commands from design.md ("Hook smoke-test commands")
  - Run `node scripts/hooks/stop-verify.mjs` (with verify green it prints nothing and exits 0)
  - **Done when:** the guard exits print `2` then `0`, and the stop script exits `0` with no output
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 5. Checkpoint: first commit and push
  - Check `git status`, then `git add -A`
  - `git commit -m "chore: bootstrap thread-core with architect specs, guards and CI (spec core-bootstrap)"`
  - `git push origin main` (if rejected: `git pull --rebase origin main`, then push again)
  - **Done when:** `git status` shows a clean tree, and `git log origin/main -1 --oneline` shows the bootstrap commit
  - _Requirements: 5.1_

- [ ] 6. GitHub metadata
  - `gh repo edit learnermaker/thread-core --description "A responsibility ledger for people and agents: detect what a change breaks, hand off with the least context, resolve on evidence." --add-topic mcp --add-topic agents --add-topic coordination --add-topic typescript --add-topic hacktoberfest`
  - **Done when:** `gh repo view learnermaker/thread-core --json description,repositoryTopics` shows the description and 5 topics
  - _Requirements: 5.2_

- [ ] 7. Confirm CI is green
  - `gh run list --repo learnermaker/thread-core --limit 1`, then `gh run watch <id> --repo learnermaker/thread-core --exit-status`
  - **Done when:** the run concludes `success` for both `ubuntu-latest` and `windows-latest`. If it fails, read `gh run view <id> --log-failed`; fix only files you own, or write BLOCKED.md
  - _Requirements: 5.1_
