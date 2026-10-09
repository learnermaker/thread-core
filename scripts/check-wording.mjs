// Public-repo wording rule: development-tool attribution stays out of this repo (README, docs, code, specs).
// Allowed: naming the product runtime model on Amazon Bedrock (lines that mention Bedrock or a Bedrock model id).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const skip = new Set(["node_modules", "dist", "coverage", ".git", ".data", "cdk.out"]);
const banned = new RegExp("\\b(" + Buffer.from("Y2xhdWRlfGFudGhyb3BpYw==", "base64").toString() + ")\\b", "i"); // encoded list
const allowed = /bedrock|\b(us|eu|apac|global)\.[a-z]+\.[a-z0-9-]+/i; // Bedrock mentions or inference profile ids (us.<vendor>.<model>)
const hits = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name) || name === "check-wording.mjs") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (st.size < 2_000_000 && !/\.(png|jpg|mp3|mp4|ico|woff2?|tgz)$/i.test(name)) {
      readFileSync(p, "utf8").split("\n").forEach((line, i) => {
        if (banned.test(line) && !allowed.test(line)) hits.push(`${p}:${i + 1}`);
      });
    }
  }
})(".");
if (hits.length) {
  console.error(`Wording rule: remove these mentions (use "the architect" or neutral wording):\n  ${hits.join("\n  ")}`);
  process.exit(1);
}
console.log("wording ok");
