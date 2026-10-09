// Fails if any architect-owned contract file differs from contract.sha256.json (CRLF normalised to LF).
// Contract files may only be changed by the architect via thread-prep; see .kiro/steering/product.md.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("contract.sha256.json", "utf8"));
const bad = [];
for (const [path, expected] of Object.entries(manifest)) {
  if (!existsSync(path)) { bad.push(`${path}: missing`); continue; }
  const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const actual = createHash("sha256").update(text).digest("hex");
  if (actual !== expected) bad.push(`${path}: modified`);
}
if (bad.length) {
  console.error(`Contract files changed (do NOT edit them; write BLOCKED.md and stop):\n  ${bad.join("\n  ")}`);
  process.exit(1);
}
console.log(`contract ok (${Object.keys(manifest).length} files)`);
