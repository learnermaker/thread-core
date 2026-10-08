import type { HouseholdState } from "./schemas.ts";

/** Deep copy of JSON data. (structuredClone is not available in core's ES-only build.) */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** JSON.stringify with object keys sorted recursively: equal data always gives equal strings. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => cmp(a, b)))
      : v,
  );
}

/** Deterministic string compare (never localeCompare: ICU differs across machines). */
export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Deterministic, counter-based ids stored in the state: nextId(state, "ho") -> "ho_1", "ho_2", ... */
export function nextId(state: HouseholdState, prefix: string): string {
  const n = (state.counters[prefix] ?? 0) + 1;
  state.counters[prefix] = n;
  return `${prefix}_${n}`;
}
