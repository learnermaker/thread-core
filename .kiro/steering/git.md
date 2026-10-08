---
inclusion: always
---
# Git rules

- Work on `main` (solo project). **Commit only when `npm run verify` passes**: at every checkpoint task and at the end of each top-level task.
- Use conventional commits, naming the spec and task: `feat(engine): impact traversal (spec core-impact-engine, task 2)`, `test(app): golden story`, `chore: bootstrap`.
- `git push` after each checkpoint commit. **Never** `--force`, never rewrite history, and never change remotes or repo settings unless a task says so.
- Never commit `.env*` (except `.env.example`), `node_modules/`, `dist/`, `coverage/` or `.kiro/.state/`.
- Check `git status` before `git add -A`. Never commit `BLOCKED.md`: it is a message to the user.
