# AGENTS.md: instructions for coding agents (Kiro, Claude Code, Copilot, Cursor…)

Read `.kiro/steering/*.md` first: product rules, pinned tech, structure, testing, Windows and git rules all apply to every agent.

- The green check is `npm run verify`. Never finish while it is red.
- Architect-owned files (contract + golden fixtures + `.kiro/`) are read-only; see `.kiro/steering/product.md` → "BLOCKED protocol".
- Work tasks from `.kiro/specs/<spec>/tasks.md` in order. Each task lists its "Done when" command.
- No new dependencies. No `Date.now()`, `Math.random()`, `console` or Node APIs in `src/`.
