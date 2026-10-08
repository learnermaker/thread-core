# Crew task: build thread-core overnight (specs core-model → core-impact-engine → core-policy-evidence → core-app-api)

You are working **unattended overnight** in the `thread-core` repository. Nobody will answer questions until morning. Work through every step below in order, keep `npm run verify` green, commit after every step, and push regularly.

## Ground rules (read first, follow always)
1. Read and obey every file in `.kiro/steering/` (product, tech, structure, testing, windows, git). They override anything you assume.
2. The work is fully specified in `.kiro/specs/<spec>/requirements.md`, `design.md` and `tasks.md`. Follow design.md **exactly**. Don't redesign, rename, or add dependencies, operations, fields or files that the spec doesn't list.
3. **Never edit architect-owned files:** `src/model/**`, `src/ports.ts`, `src/registry/types.ts`, `src/store/memory.ts`, `fixtures/golden/**`, `contract.sha256.json`, `.kiro/steering/**`, `.kiro/hooks/**`, `.kiro/specs/**/requirements.md`, `.kiro/specs/**/design.md`, `scripts/**`. You MAY tick checkboxes in `.kiro/specs/**/tasks.md`.
4. **Never weaken a test, skip a test, lower a coverage threshold or edit a golden fixture** to get green. If the spec, a fixture or a contract file seems wrong, use the BLOCKED protocol below.
5. The terminal is Windows PowerShell. Use `npm run …` and `node …`; no bash syntax.
6. **Green gate:** a step is done only when its "Done when" commands pass **and** `npm run verify` prints `VERIFY PASSED`.

## Git and push policy
- Work on the branch Crew gives you (e.g. `kirocrew/task/<id>`). Never commit to or force-push `main` directly; never rewrite history.
- **After every completed step:** `git add -A` (check `git status` first; never commit `BLOCKED.md` contents of other runs, `.env*`, `node_modules`, `dist`, `coverage`), then commit with the message given in the step, then `git push -u origin HEAD`.
- **After the first push only:** open a draft pull request so GitHub CI runs on every later push:
  `gh pr create --draft --base main --title "Overnight: thread-core specs core-model to core-app-api" --body "Automated Kiro Crew run from crew/overnight-thread-core.md. Specs authored by the architect (Claude); implementation and tests by Kiro."`
  If a PR for this branch already exists, skip this.

## BLOCKED protocol (overnight version)
If a task can't be completed without breaking a ground rule, or the same task fails 3 times:
1. Append a section to `crew/BLOCKED.md`: spec + task id, what you tried, the exact error (last 40 lines), and your proposed fix.
2. Restore the files of that task to the last commit (`git checkout -- <files>`), so verify is green again.
3. Continue with the **next step whose dependencies are still satisfied** (see the dependency column). Don't start a step whose dependency is blocked.
4. Commit `crew/BLOCKED.md` with `chore(crew): record blocked task <id>` and push.

## Steps
| Step | What | Depends on | Commit message |
|---|---|---|---|
| 0 | Run `npm ci`, then `npm run verify` → must print `VERIFY PASSED` before anything else. If it doesn't, BLOCKED and stop the whole run | — | (no commit) |
| 1 | Implement **all tasks** in `.kiro/specs/core-model/tasks.md` in order | 0 | as written in each checkpoint task |
| 2 | Implement **all tasks** in `.kiro/specs/core-impact-engine/tasks.md` in order | 1 | as written in each checkpoint task |
| 3 | Implement **all tasks** in `.kiro/specs/core-policy-evidence/tasks.md` in order | 1 | as written in each checkpoint task |
| 4 | Implement **all tasks** in `.kiro/specs/core-app-api/tasks.md` in order. (Task 6's `gh run watch` → instead check the latest PR checks with `gh pr checks`) | 1 | as written in each checkpoint task |
| 5 | Final gate: `npm run verify`, `npm run coverage` and `npm run build` all pass. Then write the report below | 1–4 | `docs(crew): overnight report` |

Within each spec, the **checkpoint tasks are the commit points**. Use their exact commit messages and push after each one.

## Final report (`crew/OVERNIGHT_REPORT.md`, required)
- For each spec: the tasks completed / blocked, and the test count (from `npx vitest run`).
- `npm run coverage` summary line (lines / branches / functions / statements).
- Any behavior change you made to the reference code in `src/engine`, `src/app` or `src/schemas`, and why (one line each).
- Anything in `crew/BLOCKED.md`.
- The PR URL and the last CI status (`gh pr checks`).
Then commit and push it.
