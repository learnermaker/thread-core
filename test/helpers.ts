import { readFileSync } from "node:fs";
import { Seed, seedHousehold } from "../src/engine/seed.ts";
import { createRegistry, householdTypes } from "../src/registry/types.ts";
import { deriveStatus } from "../src/engine/status.ts";
import { fakeServiceProvider, type FakeServiceConfig } from "../src/testkit/index.ts";
import type { HouseholdState } from "../src/model/schemas.ts";

export const registry = createRegistry(householdTypes);
const read = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/golden/${name}`, import.meta.url), "utf8"));
export function loadSeed(): Seed { return Seed.parse(read("rivera-seed.json")); }
export function loadStory(): { steps: Array<{ id: string; at: string; op: string; as: string; input: unknown; expect: unknown }> } {
  return read("ripple-story.json");
}
/** Seeded state with statuses derived at `now`. */
export function seedState(now = "2026-10-08T19:30:00-07:00"): HouseholdState {
  const s = seedHousehold(loadSeed(), registry);
  for (const t of s.threads) t.status = deriveStatus(t, s.evidence, new Date(now).toISOString());
  return s;
}
export function pharmacy() {
  const p = (loadSeed().providers as Record<string, Omit<FakeServiceConfig, "id">>)["svc_pharmacy_delivery"]!;
  return fakeServiceProvider({ id: "svc_pharmacy_delivery", ...p });
}
