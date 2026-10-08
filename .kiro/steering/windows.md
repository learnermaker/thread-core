---
inclusion: always
---
# Windows rules (the dev machine is Windows 11; CI is Windows + Ubuntu)

- The terminal is **PowerShell**. Don't use bash syntax: no `rm -rf`, no `export X=`, no `cp -r`, no `&&` chains with env vars, no heredocs.
- Prefer `npm run <script>` and `node scripts/<x>.mjs`. Delete folders with `node scripts/clean.mjs <dir>`.
- In code, build paths with `node:path` or `new URL(..., import.meta.url)`, never with a hard-coded `\`.
- Line endings are LF (`.gitattributes`).
- If `npm` is blocked by the execution policy, use `npm.cmd`.
- Never start watch mode or a server in the foreground of a task. Use `vitest run`, never plain `vitest`.
