# thread-core v0.1.0

First public release of thread-core — a responsibility ledger for people and agents.

## What's new

### Core engine
- Impact graph traversal: detect what breaks when availability changes, with severity (NONE → LOW → MEDIUM → HIGH → CRITICAL) and human-readable `why` sentences.
- Candidate ranking: deterministic, score-based ranking (free window, capability, holds item, already involved, lightest load).
- Context Receipt: minimum-necessary facts shared on handoff — `context_needs` per responsibility type, filtered by sensitivity policy. Withheld facts appear as labels only.
- Evidence authorization: only the current owner of a responsibility satisfies owner-gated conditions; non-owner evidence is recorded but marked `authorized: false`.
- Derived status: RESOLVED is computed, never set. Precedence: CANCELLED → RESOLVED → EXPIRED → NEEDS_ATTENTION → HANDOFF_PENDING → AT_RISK → PLAN_SECURED → ACTIVE.
- Autonomy matrix: OBSERVE / RECOMMEND / COORDINATE / ACT — controls how much thread-core acts without confirmation.

### Application API (8 user + 3 system operations)
- All operations return `{ ok: true; data } | { ok: false; error }` — never throw.
- TRANSACT actions (service handoffs) always require explicit `confirmAction`, at every autonomy level.
- Idempotency keys on mutating operations prevent duplicates.

### Domain-agnostic core
- Responsibility types (TRANSPORT, BRING_ITEM, PICKUP, ATTEND) are registered at runtime — the engine knows no domain.
- `examples/caregiver-rota.ts` and `examples/agent-handoff.ts` demonstrate custom types.

### Install

```sh
npm install https://github.com/learnermaker/thread-core/releases/download/v0.1.0/thread-core-0.1.0.tgz
```

Verify:

```sh
node -e "import('thread-core').then(m => console.log(typeof m.createThreadApp, Object.keys(m.jsonSchemas).length))"
# function 11
```

## What's not in this release

- npm registry publish (coming in v0.2.0)
- Persistence adapters (SQLite, Postgres) — use `memoryStore` or implement the `Store` port
- MCP server adapter package — tracked as a good-first-issue
- TypeDoc API site

## Contributors

Built spec-first with [Kiro](https://kiro.dev). Architect: Claude. Builder: Kiro.
