// Kiro Stop hook: the agent may not finish while `npm run verify` is red.
// Prints {"decision":"block","reason":...} to keep it working. Max 3 consecutive blocks, then lets it stop (no infinite loops).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const stateFile = ".kiro/.state/stop-blocks.json";
mkdirSync(".kiro/.state", { recursive: true });
const count = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")).count : 0;
const r = spawnSync("npm run verify --silent", { shell: true, encoding: "utf8" });
if (r.status === 0) {
  writeFileSync(stateFile, JSON.stringify({ count: 0 }));
  process.exit(0);
}
if (count >= 3) {
  writeFileSync(stateFile, JSON.stringify({ count: 0 }));
  console.error("verify is still red after 3 attempts: stopping. Report the failure to the user (do not claim the task is done).");
  process.exit(0);
}
writeFileSync(stateFile, JSON.stringify({ count: count + 1 }));
const tail = `${r.stdout}${r.stderr}`.trim().split("\n").slice(-40).join("\n");
console.log(JSON.stringify({
  decision: "block",
  reason: `npm run verify is failing (attempt ${count + 1}/3). Fix the cause in source or tests you own; never edit protected files.\n${tail}`,
}));
