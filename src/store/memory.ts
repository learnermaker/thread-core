import type { HouseholdState, ThreadEvent } from "../model/schemas.ts";
import { clone } from "../model/util.ts";
import { StoreConflictError, type Store } from "../ports.ts";

/** In-memory Store. Copies on the way in and out so callers can never mutate stored state by reference. */
export function memoryStore(): Store {
  const data = new Map<string, { state: HouseholdState; version: number; events: ThreadEvent[] }>();
  return {
    async load(householdId) {
      const row = data.get(householdId);
      return row ? { state: clone(row.state), version: row.version } : undefined;
    },
    async commit(householdId, state, expectedVersion, events) {
      const row = data.get(householdId);
      const current = row?.version ?? 0;
      if (current !== expectedVersion) throw new StoreConflictError();
      const version = current + 1;
      data.set(householdId, {
        state: clone(state),
        version,
        events: [...(row?.events ?? []), ...clone(events)],
      });
      return version;
    },
    async events(householdId) {
      return clone(data.get(householdId)?.events ?? []);
    },
  };
}
