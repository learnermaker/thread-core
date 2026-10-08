# Design Document: core-bootstrap

## Overview
No product code is written in this spec. It installs the files the architect prepared, installs pinned dependencies, proves the guards work, and pushes a green first commit.

## Architecture
```text
../thread-prep/kiro/install.mjs core ──copies──▶ ../thread-core/
   always overwritten : .kiro/**, scripts/**, src/model/**, src/ports.ts, src/registry/**, src/store/**,
                        fixtures/golden/**, contract.sha256.json, LICENSE, NOTICE, AGENTS.md, .gitattributes,
                        .nvmrc
   copied only if absent: src/engine/** (reference code), package.json, tsconfig*.json, vitest.config.ts,
                        README.md, .gitignore, .github/workflows/ci.yml (coverage is added by spec core-app-api)
```

## Components
| File | Purpose |
|---|---|
| `scripts/verify.mjs` | The Verify_Gate. Runs every check in order and stops at the first failure |
| `scripts/check-contract.mjs` | sha256 of each architect-owned file (CRLF normalised) vs `contract.sha256.json` |
| `scripts/check-deps.mjs` | exact dependency allowlist |
| `scripts/check-purity.mjs` | forbids `Date.now()`, `Math.random()`, `console`, `process`, non-zod imports and extension-less relative imports in `src/` |
| `scripts/check-secrets.mjs` | regex scan for credentials |
| `scripts/hooks/guard-protected.mjs` | PreToolUse: exit 2 on writes to protected paths (fail-open on unknown input) |
| `scripts/hooks/stop-verify.mjs` | Stop: block finishing while verify is red (max 3 in a row) |
| `scripts/hooks/post-task-log.mjs` | PostTaskExec: runs verify and appends a row to `docs/kiro-log.md` |

## Hook smoke-test commands (PowerShell)
```powershell
node -e "process.stdout.write(JSON.stringify({tool_name:'fs_write',tool_input:{path:'fixtures/golden/ripple-story.json'}}))" | node scripts/hooks/guard-protected.mjs; $LASTEXITCODE
node -e "process.stdout.write(JSON.stringify({tool_name:'fs_write',tool_input:{path:'src/engine/impact.ts'}}))" | node scripts/hooks/guard-protected.mjs; $LASTEXITCODE
```
Expected: `2`, then `0`.

## Error handling
- If `install.mjs` says "Run this from inside the thread-core folder", `cd` into the Repo first.
- If the agent can't run a command outside the workspace, ask the user to run `node ..\thread-prep\kiro\install.mjs core` in a terminal at the Repo root, then continue.
- If `git push` is rejected because the remote has commits: `git pull --rebase origin main`, then push. Never force-push.

## Don'ts
- Don't edit any installed architect file to make verify pass. A red verify right after install means a BLOCKED.md.
- Don't run `npm audit fix` or `npm update`: they change pinned versions.
