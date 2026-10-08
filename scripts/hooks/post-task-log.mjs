// Kiro PostTaskExec hook: runs verify and appends one line per task to docs/kiro-log.md (AWS Builder evidence).
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let task = "task";
  try {
    const d = JSON.parse(raw || "{}");
    task = String(d.task_name ?? d.taskName ?? d.task?.name ?? d.task_id ?? d.taskId ?? d.task?.id ?? "task").replace(/\s+/g, " ").slice(0, 120);
  } catch {}
  const r = spawnSync("npm run verify --silent", { shell: true, encoding: "utf8" });
  const out = `${r.stdout}${r.stderr}`;
  const tests = (out.match(/Tests\s+(\d+ passed[^\n]*)/) ?? [])[1] ?? "";
  mkdirSync("docs", { recursive: true });
  if (!existsSync("docs/kiro-log.md")) {
    writeFileSync("docs/kiro-log.md", "# Kiro build log\n\nOne line per Kiro task, appended automatically by `.kiro/hooks/post-task-log.json`.\n\n| When (UTC) | Task | verify | Tests |\n|---|---|---|---|\n");
  }
  appendFileSync("docs/kiro-log.md", `| ${new Date().toISOString()} | ${task.replace(/\|/g, "/")} | ${r.status === 0 ? "PASS" : "FAIL"} | ${tests} |\n`);
  process.exit(0);
});
