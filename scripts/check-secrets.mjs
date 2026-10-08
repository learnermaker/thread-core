// Cheap secret scan over the working tree (not node_modules/dist/.git). Blocks obvious credentials.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const skip = new Set(["node_modules", "dist", "coverage", ".git"]);
const patterns = [
  [/AKIA[0-9A-Z]{16}/, "AWS access key id"],
  [/aws_secret_access_key\s*[=:]\s*\S{20,}/i, "AWS secret key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\bsk-[A-Za-z0-9_-]{20,}/, "API secret key"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, "GitHub token"],
  [/ABSK[A-Za-z0-9+/=]{40,}/, "Bedrock API key"],
];
const hits = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (st.size < 2_000_000 && !/\.(png|jpg|mp3|mp4|ico|woff2?)$/i.test(name)) {
      const text = readFileSync(p, "utf8");
      for (const [re, what] of patterns) if (re.test(text)) hits.push(`${p}: looks like a ${what}`);
    }
  }
})(".");
if (hits.length) {
  console.error(`Possible secrets found:\n  ${hits.join("\n  ")}`);
  process.exit(1);
}
console.log("secrets ok");
