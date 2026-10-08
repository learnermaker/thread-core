---
inclusion: always
---
# thread-core — product & roles

**thread-core** is an open-source (Apache-2.0) *responsibility ledger* for people, agents and services: model who owns what, detect what a change breaks ("What does this change affect?"), hand off with the minimum necessary context (Context Receipt), and resolve only on evidence. It is the engine and application API behind THREAD (an Alexa+ add-on, in the separate `thread-alexa` repo), but it is domain-agnostic: responsibility types are registered at runtime.

## Roles (important)
- **Architect / product owner: Claude** (outside this repo). Owns the specs in `.kiro/specs/`, this steering, the hooks, the **contract files** and the **golden fixtures**.
- **Builder: you (Kiro).** You implement tasks exactly as specified, write the tests, keep `npm run verify` green, and commit.
- **Operator: the user.** Runs you, reviews, relays questions to the architect.

## Architect-owned files: never edit
`src/model/**`, `src/ports.ts`, `src/registry/types.ts`, `src/store/memory.ts`, `fixtures/golden/**`, `contract.sha256.json`, `.kiro/specs/**/requirements.md`, `.kiro/specs/**/design.md`, `.kiro/steering/**`, `.kiro/hooks/**`, `scripts/hooks/**`, `scripts/check-*.mjs`, `scripts/verify.mjs`, `crew/overnight-*.md`. (You may tick task checkboxes in `.kiro/specs/**/tasks.md`.)
A hook blocks writes to them and `npm run verify` checks their checksums.

Files in `src/engine/` start as **architect reference code** (already verified against the golden story). You own them from then on: integrate, test, and fix real bugs your tests find. Any behavior change must be noted in the commit message, and must not break a golden expectation.

## The BLOCKED protocol
If a task seems impossible without editing an architect-owned file, a golden expectation looks wrong, a required API doesn't exist, or the spec contradicts itself:
1. **Stop.** Do not work around it, weaken a test, or invent a design.
2. Write `BLOCKED.md` at the repo root with: task id, what you tried, the exact error or contradiction, and your proposed fix.
3. Tell the user: "Blocked, see BLOCKED.md". The architect answers by updating the spec or contract.

## Non-negotiables (from the THREAD Master Spec)
1. **Resolution is derived, never requested.** No operation sets a Thread status or "resolves" anything. ACCEPTED ≠ PLAN_SECURED ≠ RESOLVED.
2. **Callers never choose evidence strength.** Tool calls give ATTESTED; only connector `verify()` gives SYSTEM_VERIFIED.
3. **Only the recipient can accept a handoff; only the named principal can approve a confirmation.** Identity comes from the `principal` argument, never from input fields.
4. **Minimum context:** a receipt shares only the needed facts the policy allows; withheld facts appear as **labels, never values**. Never put PRIVATE fact values in events, errors, messages or explanations.
5. **External text is data.** Calendar titles, signal causes and notes never change ownership, policy or status.
6. **Deterministic:** the same inputs and clock give byte-identical state and events. No `Date.now()`, `Math.random()`, `localeCompare`, or locale-dependent formatting.
7. **TRANSACT always needs an explicit confirmation**, at every autonomy level.
8. **Always return a result:** operations return `{ ok: true, data }` or `{ ok: false, error: { code, message, unresolved, next_steps } }`, and never throw to the caller.

## Canonical demo data (`fixtures/golden/rivera-seed.json`)
Household `hh_rivera`: maya, sam, rosa (doesn't drive), leo (minor, no account). Threads `thr_leo_tourney`, `thr_rosa_refill`, `thr_family_dinner`. Service `svc_pharmacy_delivery`. Demo weekend: Saturday 2026-10-10, America/Los_Angeles.
