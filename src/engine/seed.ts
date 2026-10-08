import { z } from "zod";
import { Fact, Household, Id, Instant, type HouseholdState } from "../model/schemas.ts";
import { toUtc } from "../model/time.ts";
import type { TypeRegistry } from "../registry/types.ts";
import { buildThread, ThreadInput } from "./derive.ts";

/** A household plus pre-existing threads (demo seed, tests, imports). `providers` is testkit config and is ignored here. */
export const Seed = z.strictObject({
  household: Household,
  facts: z.array(Fact),
  threads: z.array(z.strictObject({ created_by: Id, created_at: Instant, input: ThreadInput })),
  providers: z.record(z.string(), z.unknown()).optional(),
});
export type Seed = z.infer<typeof Seed>;

export function emptyState(household: Household): HouseholdState {
  return {
    household, threads: [], facts: [], busy: [], handoffs: [], confirmations: [], evidence: [], inbox: [],
    travel: [], counters: {}, seen_sources: [], idempotency: [],
  };
}

/** Builds the initial HouseholdState. Thread statuses are left for the caller to derive with its clock. */
export function seedHousehold(seed: Seed, reg: TypeRegistry): HouseholdState {
  const state = emptyState(seed.household);
  state.facts = seed.facts;
  for (const t of seed.threads) {
    const { thread, evidence } = buildThread(state, reg, t.input, t.created_by, toUtc(t.created_at));
    state.threads.push(thread);
    state.evidence.push(...evidence);
  }
  return state;
}
