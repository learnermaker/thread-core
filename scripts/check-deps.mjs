// Fails if package.json dependencies differ from the approved, pinned list (no additions, no version drift).
import { readFileSync } from "node:fs";

const approved = {
  dependencies: { zod: "4.6.5" },
  devDependencies: {
    "@types/node": "24.19.1",
    "@vitest/coverage-v8": "5.0.3",
    "fast-check": "4.10.2",
    typescript: "5.9.3",
    vitest: "5.0.3",
  },
};
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const problems = [];
for (const field of ["dependencies", "devDependencies"]) {
  const want = approved[field];
  const have = pkg[field] ?? {};
  for (const [name, v] of Object.entries(have)) if (want[name] !== v) problems.push(`${field}.${name}@${v} is not approved`);
  for (const [name, v] of Object.entries(want)) if (have[name] !== v) problems.push(`${field}.${name} must be exactly ${v}`);
}
for (const field of ["peerDependencies", "optionalDependencies"]) if (pkg[field]) problems.push(`${field} not allowed`);
if (problems.length) {
  console.error(`Dependency allowlist violated (new deps need an architect decision):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log("deps ok");
