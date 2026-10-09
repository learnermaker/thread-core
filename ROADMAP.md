# Roadmap

## Good first issues (open, help wanted)

These are self-contained extensions that don't require changing the core engine:

1. **SQLite `Store` adapter** — implement `Store` (load/commit/events) on `node:sqlite`, with the same optimistic version check as `memoryStore`; reuse the store tests.
2. **iCal calendar connector** — a read-only connector that turns an `.ics` feed into `PERSON_BUSY` signals (`source_id` = the UID).
3. **MCP server adapter package** — generate MCP tools from `jsonSchemas` (each operation → one tool), so any MCP host can use thread-core directly.
4. **Explanation templates i18n** — move the `why` sentence templates into an overridable table and add a Spanish table.
5. **Example: volunteer shift coverage** — a `COVER_SHIFT` type example (like caregiver-rota) with a decline and the next candidate.
6. **Property test: receipt minimality** — prove that `receipt.shared` keys ⊆ the type's `context_needs` for every registered type.

## Upcoming milestones

| Item | Target |
|---|---|
| MCP 2026-07-28 spec compliance (Streamable HTTP, stateless mode) | Q4 2026 |
| npm publish (`thread-core` on npmjs.com) | v0.2.0 |
| TypeDoc API site | v0.2.0 |

## Out of scope for v0.1.0

- npm publish (install from the GitHub release tarball for now)
- TypeDoc site (the README API table covers v0.1.0)
- Persistence adapters (use `memoryStore` or bring your own `Store`)
