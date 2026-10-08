# Design Document: core-model

## Overview
Most of this layer already exists as architect files. Your work: **test the contract**, **test the reference modules** `src/engine/derive.ts`, `src/engine/availability.ts` and `src/engine/seed.ts`, write the **testkit**, and write `test/helpers.ts`.

## Architecture
```text
src/model/schemas.ts   zod schemas = the data contract (HouseholdState, Thread, Evidence, …)   [read-only]
src/model/time.ts      toUtc, ms, addMinutes, overlaps, within, fmtTime/fmtDay/fmtDayTime/fmtRange/fmtMoney   [read-only]
src/model/util.ts      clone, stableStringify, cmp, nextId                                      [read-only]
src/model/errors.ts    ErrorCode, ErrorBody, OpError, OpResult                                  [read-only]
src/ports.ts           Clock, Store (+StoreConflictError), CalendarConnector, ServiceProvider    [read-only]
src/store/memory.ts    memoryStore()                                                            [read-only]
src/registry/types.ts  ResponsibilityType, TRANSPORT/BRING_ITEM/PICKUP/ATTEND, householdTypes, createRegistry   [read-only]
src/engine/derive.ts   ThreadInput, makeEnv, buildThread, recomputeWindows                      [reference: you own]
src/engine/availability.ts  conflicts()                                                         [reference: you own]
src/engine/seed.ts     Seed, emptyState, seedHousehold                                          [reference: you own]
src/testkit/*.ts       NEW: fixedClock, fakeCalendar, fakeServiceProvider, index.ts
test/helpers.ts        NEW: loadSeed, loadStory, seedState, registry
```
Read `src/model/schemas.ts` and `src/registry/types.ts` before writing tests: they define every field name.

## Testkit (exact code to create)

`src/testkit/clock.ts`
```ts
import type { Clock } from "../ports.ts";
import { addMinutes, toUtc } from "../model/time.ts";

export interface TestClock extends Clock { set(iso: string): void; advance(minutes: number): void }
export function fixedClock(iso: string): TestClock {
  let now = toUtc(iso);
  return { now: () => now, set: (i) => { now = toUtc(i); }, advance: (m) => { now = addMinutes(now, m); } };
}
```

`src/testkit/calendar.ts`
```ts
import type { CalendarConnector } from "../ports.ts";

export interface FakeBlock { person_id: string; title: string; start: string; end: string; ref: string }
export interface FakeCalendar extends CalendarConnector { blocks: Map<string, FakeBlock>; calls: string[]; failNext: boolean }
export function fakeCalendar(): FakeCalendar {
  const blocks = new Map<string, FakeBlock>();
  const calls: string[] = [];
  let n = 0;
  const cal: FakeCalendar = {
    blocks, calls, failNext: false,
    async createBlock(i) {
      calls.push(`createBlock:${i.ref}`);
      if (cal.failNext) { cal.failNext = false; throw new Error("calendar unavailable"); }
      for (const [id, b] of blocks) if (b.ref === i.ref) return { block_id: id }; // idempotent per ref
      const block_id = `blk_${++n}`;
      blocks.set(block_id, { ...i });
      return { block_id };
    },
    async moveBlock(i) {
      calls.push(`moveBlock:${i.block_id}`);
      if (cal.failNext) { cal.failNext = false; throw new Error("calendar unavailable"); }
      const b = blocks.get(i.block_id);
      if (!b) throw new Error(`no block ${i.block_id}`);
      blocks.set(i.block_id, { ...b, start: i.start, end: i.end });
    },
    async verifyBlock(i) {
      calls.push(`verifyBlock:${i.block_id}`);
      const b = blocks.get(i.block_id);
      return !!b && b.person_id === i.person_id && b.start === i.start && b.end === i.end;
    },
  };
  return cal;
}
```

`src/testkit/service.ts`
```ts
import type { ServiceProvider } from "../ports.ts";
import { ms, toUtc } from "../model/time.ts";

export interface FakeServiceConfig {
  id: string; name: string; handles: string[];
  quote: { slot: { start: string; end: string }; amount_cents: number; currency: "USD" };
  delivered_at: string;
}
export interface FakeService extends ServiceProvider { orders: Map<string, string>; calls: string[] }
export function fakeServiceProvider(cfg: FakeServiceConfig): FakeService {
  const orders = new Map<string, string>(); // order_id -> order_ref
  const calls: string[] = [];
  const slot = { start: toUtc(cfg.quote.slot.start), end: toUtc(cfg.quote.slot.end) };
  return {
    id: cfg.id, name: cfg.name, handles: cfg.handles, orders, calls,
    async query({ now }) {
      calls.push("query");
      return ms(now) < ms(slot.start)
        ? { provider_id: cfg.id, slot, amount_cents: cfg.quote.amount_cents, currency: "USD", summary: cfg.name }
        : null;
    },
    async act({ order_ref }) {
      calls.push(`act:${order_ref}`);
      for (const [id, ref] of orders) if (ref === order_ref) return { order_id: id }; // idempotent per order_ref
      const order_id = `ord_${orders.size + 1}`;
      orders.set(order_id, order_ref);
      return { order_id };
    },
    async verify({ order_id, now }) {
      calls.push(`verify:${order_id}`);
      if (!orders.has(order_id)) throw new Error(`unknown order ${order_id}`);
      return ms(now) >= ms(cfg.delivered_at) ? { state: "DELIVERED", delivered_at: toUtc(cfg.delivered_at) } : { state: "PLACED" };
    },
  };
}
```
`src/testkit/index.ts` re-exports all three files.

## test/helpers.ts (exact)
```ts
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
```
(`src/engine/status.ts` already exists as reference code; spec core-policy-evidence tests it.)

## Key facts to assert (computed from the Seed; all UTC)
| Item | Value |
|---|---|
| `thr_leo_tourney.r_transport.window` | `2026-10-10T14:55:00.000Z` → `2026-10-10T19:30:00.000Z` (07:55–12:30 PDT) |
| `thr_leo_tourney.r_jersey.window` | `14:30Z` → `15:30Z` |
| `thr_rosa_refill.r_pickup.window` | `16:00Z` → `19:00Z` |
| `thr_family_dinner.r_reservation.window` | `2026-10-11T02:00:00.000Z` → `04:00Z` |
| `c_arrival.window` | `14:30Z` → `15:30Z` |
| creation evidence | `evd_1` c_transport_owner, `evd_2` c_pickup_owner, `evd_3` c_attend_owner (actor maya) |
| statuses at Thu 19:30 | tourney ACTIVE, refill PLAN_SECURED, dinner PLAN_SECURED |
| after a travel signal of 40 min to `place_riverside` + `recomputeWindows` | `r_transport.window.start` = `14:40Z` |

## Correctness Properties
### Property 1: Formatting is machine-independent
*For any* instant between 2026-01-01 and 2027-12-31, `fmtTime(iso, "America/Los_Angeles")` matches `/^(1[0-2]|[1-9]):[0-5]\d (AM|PM)$/` (ASCII space only).
**Validates: Requirements 2.1**
### Property 2: Ids are sequential per prefix
*For any* sequence of prefixes, `nextId` returns `<prefix>_<n>` with n = 1, 2, 3… per prefix, independent of the other prefixes.
**Validates: Requirements 2.3**
### Property 3: Store isolation
*For any* state committed and then loaded, mutating the loaded object never changes a later `load` result.
**Validates: Requirements 3.3**
### Property 4: Same-thread and non-exclusive duties never conflict
*For any* busy-free person, `conflicts(state, reg, person, window, threadId)` ignores responsibilities in `threadId` and every BRING_ITEM responsibility.
**Validates: Requirements 5.3**

## Error handling
`buildThread` throws `OpError("VALIDATION_FAILED", message, [], next_steps)`; tests assert `err.body.code`.

## Don'ts
- Don't edit the Contract files. If a test proves a contract bug, write BLOCKED.md.
- Don't import `node:*` in `src/testkit` (the purity check fails); Node APIs are fine in `test/`.
