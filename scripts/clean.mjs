// Usage: node scripts/clean.mjs <dir>...  (Windows-safe replacement for rm -rf)
import { rmSync } from "node:fs";
for (const dir of process.argv.slice(2)) rmSync(dir, { recursive: true, force: true });
