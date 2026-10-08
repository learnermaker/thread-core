// thread-core rules: deterministic and I/O-free. Only "zod" and relative imports in src/.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const rules = [
  [/Date\.now\s*\(/, "Date.now() (use the injected Clock)"],
  [/new Date\(\s*\)/, "new Date() without argument (use the injected Clock)"],
  [/Math\.random\s*\(/, "Math.random() (use nextId / counters)"],
  [/\bconsole\./, "console.* (core never logs)"],
  [/\bprocess\./, "process.* (core never reads the environment)"],
  [/\brequire\s*\(/, "require() (ESM only)"],
  [/localeCompare\s*\(/, "localeCompare (use cmp from model/util.ts)"],
  [/from\s+["'](?!zod["']|\.{1,2}\/)[^"']+["']/, "import other than zod or a relative path"],
  [/from\s+["']\.{1,2}\/[^"']*(?<!\.ts)["']/, "relative import without .ts extension"],
];
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".ts")) files.push(p);
  }
})("src");
const hits = [];
for (const f of files) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;
    for (const [re, why] of rules) if (re.test(line)) hits.push(`${f}:${i + 1}  ${why}`);
  });
}
if (hits.length) {
  console.error(`Core purity violations:\n  ${hits.join("\n  ")}`);
  process.exit(1);
}
console.log(`purity ok (${files.length} files)`);
