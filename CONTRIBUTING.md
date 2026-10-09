# Contributing to thread-core

## Setup

```sh
git clone https://github.com/learnermaker/thread-core.git
cd thread-core
npm install
npm run verify   # must print VERIFY PASSED
```

Node 24 LTS is required (see `.nvmrc`). The only runtime dependency is `zod@4.6.5` — do not add others.

## Making changes

All source is TypeScript ESM. Import paths end in `.ts`; tsc rewrites them to `.js` on build.

- `src/model/**`, `src/ports.ts`, `src/registry/types.ts`, `src/store/memory.ts`, `fixtures/golden/**`, `contract.sha256.json` and all files under `.kiro/` are architect-owned and **read-only**. `npm run verify` enforces their checksums.
- `src/engine/**` and `src/app/**` are builder-owned — write here.
- Every public function in `src/` must compile without Node globals; `check-purity.mjs` enforces this.

## The green check

```sh
npm run verify   # contract · deps · purity · secrets · typecheck · build typecheck · tests
npm run coverage # lines ≥ 90% (enforced in CI)
```

Never finish a change while `npm run verify` is red.

## Spec-driven workflow

Features and changes are spec-driven. Specs live in `.kiro/specs/<name>/`:
- `requirements.md` — what to build and why (architect-owned)
- `design.md` — how to build it (architect-owned)
- `tasks.md` — ordered implementation steps (builder ticks checkboxes)

If you are working from an issue, reference the spec in your commit and PR.

## Commit style (conventional commits)

```
feat(engine): impact traversal (spec core-impact-engine, task 2)
test(app): golden story replay
fix(candidates): ranking tiebreaker when load is equal
chore: bootstrap thread-core with architect specs
docs(examples): household, caregiver rota, agent handoff
```

Format: `<type>(<scope>): <short description> [(spec <name>, task <n>)]`

Types: `feat`, `fix`, `test`, `docs`, `chore`, `refactor`, `perf`.

## Pull requests

- One PR per spec task or bug fix.
- All CI checks must pass.
- Tests must cover the new behavior (lines ≥ 90%).
- Reference the issue or spec task in the PR description.

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community norms and [SECURITY.md](SECURITY.md) for vulnerability reporting.
