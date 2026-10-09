# Design Document: core-package-oss

## Overview
Docs, examples, community files and the v0.1.0 release. No engine changes. `examples/caregiver-rota.ts` is already in the repo as **architect reference** (verified output below). Write the other two examples in the same style.

## Examples
Common shape (copy from `examples/caregiver-rota.ts`):
- import from `../src/index.ts` and `../src/testkit/index.ts`
- `export async function main(log: (line: string) => void = console.log)`
- end the file with `if (import.meta.main) await main();`
- every `OpResult` is checked: `if (!r.ok) throw new Error(r.error.message)`

Verified caregiver output (architect run, Oct 8):
```text
Tuesday visit to Ada: HIGH — Ben is unavailable Tuesday 1:00 PM–5:00 PM. Ben owned Visit, which Tuesday visit to Ada needs. Best option: Cleo (free 2:00 PM–3:00 PM, already involved).
Asked cleo; shared: Event time, Place, Who; withheld: Ben's reason for being unavailable, Other calendar events, Private notes
After Cleo accepts: PLAN_SECURED
After the visit: RESOLVED
```

### `examples/household-weekend.ts`
Reads `fixtures/golden/rivera-seed.json` and `ripple-story.json` with `node:fs` (examples may use Node APIs), builds the app exactly like `test/golden/story.test.ts` (memoryStore, fixedClock, fakeCalendar, fakeServiceProvider from the seed's `providers`), replays the steps, and logs one human line per step, e.g.:
- `s02_ripple: Leo's Saturday Tournament HIGH · Rosa's prescription refill HIGH · Family dinner NONE (not affected)`
- `s08_refill_rerank_to_service: needs confirmation: Pharmacy delivery, Saturday 10:00 AM–11:00 AM, $4.99`
- the last line: `Weekend: Leo's Saturday Tournament RESOLVED · Rosa's prescription refill RESOLVED · Family dinner PLAN_SECURED`

### `examples/agent-handoff.ts`
A custom type `DELIVER_REPORT` (exclusive, no capability; conditions `c_report_owner` PRE ATTESTED owner, `c_report_accepted` OUTCOME ATTESTED, window = event window; needs `event_time`, `beneficiary`). Household `hh_lab` (timezone `UTC`), persons: `agent_research` (adult: true, has_account: true; name "Research agent"), `agent_backup` ("Backup agent"), `maria` ("Maria", the human reviewer). Thread `thr_weekly_report`: beneficiary maria, the event Fri 2026-10-16 09:00–12:00 UTC, deadline 12:00, owner `agent_research`, participants `[agent_research, agent_backup, maria]`.
Story:
1. `agent_research` reports itself unavailable 08:00–13:00 ("rate-limited"): log the severity line (HIGH).
2. `agent_research` requests a handoff → `agent_backup` (log the receipt: shared vs withheld).
3. `agent_backup` accepts → log the status (PLAN_SECURED).
4. at 11:30 `maria` attests `c_report_accepted`. Maria is not the owner → **not satisfied**; log the reason ("not from the responsible person"). This shows evidence must come from the responsible party.
5. `agent_backup` attests `c_report_accepted` at 11:31 → RESOLVED. Log: `Ledger: responsibility moved research → backup with a receipt; resolved on the owner's evidence.`
In a comment at the top, say that agents are modeled as principals with accounts (the same identity rules as people).

## README skeleton (fill in; keep each section short)
```markdown
# thread-core
> A responsibility ledger for people and agents. Detect what a change breaks, hand off with the least context, resolve on evidence, not on "okay".

[CI badge] [license Apache-2.0] [MCP-ready]

## Why
<3 sentences: commitments break when one link changes; the person carrying the plan re-explains it, over-shares, and checks it happened. Tools track tasks, not responsibility + evidence.>

## Concepts in 60 seconds
| Thread | Responsibility | Condition & evidence strength | Context Receipt |

## Quickstart
git clone … && npm install && node examples/caregiver-rota.ts   (+ the 4 output lines)

## What it does (the household ripple)
<the household-weekend output, trimmed to ~10 lines>

## API
<table: createThread, listThreads, getThread, reportChange, requestHandoff, respondToHandoff, recordEvidence, confirmAction | ingestSignal, tick, inbox, events>
Every operation: (principal, input) → Promise<{ok:true,data} | {ok:false,error}>. JSON Schemas: `import { jsonSchemas } from "thread-core"`.

## Install in your project
npm install https://github.com/learnermaker/thread-core/releases/download/v0.1.0/thread-core-0.1.0.tgz

## Extending  → docs/extending.md
## Design principles  (deterministic · I/O only through ports · zod is the only dependency · every decision explains itself · resolution is derived, never requested)
## Built with Kiro  (specs in .kiro/specs, steering, hooks; docs/kiro-log.md)
## Used by  THREAD for Alexa+ (link: github.com/learnermaker/thread-alexa)
## Roadmap · Contributing · License
```

## Good-first-issues (create exactly these; labels `good first issue`, `help wanted`)
1. **SQLite `Store` adapter**: implement `Store` (load/commit/events) on `node:sqlite`, with the same optimistic version check as `memoryStore`; reuse the store tests.
2. **iCal calendar connector**: a read-only connector that turns an `.ics` feed into `PERSON_BUSY` signals (`source_id` = the UID).
3. **MCP server adapter package**: generate MCP tools from `jsonSchemas` (each operation → one tool), so any MCP host can use thread-core directly.
4. **Explanation templates i18n**: move the `why` sentence templates into an overridable table and add a Spanish table.
5. **Example: volunteer shift coverage**: a `COVER_SHIFT` type example (like caregiver-rota) with a decline and the next candidate.
6. **Property test: receipt minimality**: prove that `receipt.shared` keys ⊆ the type's `context_needs` for every registered type.

## Release procedure (Windows PowerShell)
```powershell
npm version 0.1.0 --no-git-tag-version
npm run verify; npm run coverage; npm run build
git add -A; git commit -m "chore(release): v0.1.0"; git push
git tag v0.1.0; git push origin v0.1.0
npm pack                                  # -> thread-core-0.1.0.tgz
gh release create v0.1.0 thread-core-0.1.0.tgz --repo learnermaker/thread-core --title "thread-core v0.1.0" --notes-file docs/release-notes-0.1.0.md
```
Smoke test (in an empty temp folder outside the repo, e.g. `$env:TEMP\tc-smoke`):
```powershell
npm init -y; npm pkg set type=module
npm install <path-to>\thread-core-0.1.0.tgz
node -e "import('thread-core').then(m => console.log(typeof m.createThreadApp, Object.keys(m.jsonSchemas).length))"
```
Expected: `function 11`. After the release is public, repeat it with the release URL instead of the local path.

## Making the repo public (only after the operator confirms in chat)
```powershell
git log -p --all | Select-String -Pattern 'AKIA[0-9A-Z]{16}','BEGIN [A-Z ]*PRIVATE KEY','gh[pousr]_[A-Za-z0-9]{30,}','ABSK[A-Za-z0-9+/=]{40,}'   # must print nothing
gh repo edit learnermaker/thread-core --visibility public --accept-visibility-change-consequences
```

## Don'ts
- Don't publish to npm. Don't claim adapters that don't exist. Don't change `src/` behavior in this spec.
- Don't add dependencies (TypeDoc is deferred; the README API table is enough for v0.1.0).
