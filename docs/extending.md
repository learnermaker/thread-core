# Extending thread-core

## Registering a custom responsibility type

Responsibility types are registered at runtime. The core knows nothing about "transport" or "caregiving" until you tell it. The example below is the `COVER_VISIT` type from `examples/caregiver-rota.ts`:

```ts
import { createThreadApp, memoryStore, householdTypes, type ResponsibilityType } from "thread-core";
import { fixedClock } from "thread-core/testkit";

const COVER_VISIT: ResponsibilityType = {
  type: "COVER_VISIT",              // UPPER_SNAKE, unique
  label: () => "Visit",
  defaultId: () => "r_visit",
  requiresItem: false,
  exclusive: true,                  // occupies the owner's time window

  // Window: when this responsibility must be performed
  window: (t) => ({ start: t.event.start, end: t.event.end }),

  // Conditions: PRE (gates PLAN_SECURED), OUTCOME (gates RESOLVED)
  conditions: (t) => [
    { id: "c_visit_owner",  phase: "PRE",     min_strength: "ATTESTED",        label: "Visitor confirmed",   owner: true },
    { id: "c_visited",      phase: "OUTCOME", min_strength: "ATTESTED",        label: "Visit happened",      owner: false,
      window: { start: t.event.start, end: t.event.end } },
  ],

  // context_needs: which thread facts to share in the handoff receipt
  context_needs: {
    person:  ["event_time", "place", "beneficiary"].map((key) => ({ key, required: true })),
    service: [],
  },

  busyText: (t, _r, env) =>
    `visiting ${t.beneficiary ? env.personName(t.beneficiary) : "someone"}`,
};

const app = createThreadApp({
  store: memoryStore(),
  clock: fixedClock(new Date().toISOString()),
  types: [...householdTypes, COVER_VISIT],   // add alongside the built-in types
});
```

**ConditionTemplate fields:**

| Field | Type | Meaning |
|---|---|---|
| `id` | `string` | Unique within the thread |
| `phase` | `"PRE" \| "OUTCOME"` | PRE gates PLAN_SECURED; OUTCOME gates RESOLVED |
| `min_strength` | `"ATTESTED" \| "SYSTEM_VERIFIED"` | Minimum acceptable evidence strength |
| `label` | `string` | Human-readable name (shown in receipts and `why` messages) |
| `owner` | `boolean` | If true: auto-satisfied when the owner accepts a handoff |
| `window` | `Window?` | Evidence must be observed within this window |

**Built-in computed facts** (always available for `context_needs`):

| Key | Value |
|---|---|
| `event_time` | Formatted start of the event |
| `deadline` | Formatted deadline |
| `place` | Place name |
| `beneficiary` | Beneficiary name (if set) |
| `items_status` | Item locations (if BRING_ITEM responsibilities exist) |
| `depart_by` | Departure time (if a TRANSPORT responsibility exists) |

---

## Implementing a `Store`

The `Store` port persists household state and emits events. Use the `memoryStore` from the testkit for tests; for production write an adapter:

```ts
import type { Store, HouseholdState, ThreadEvent } from "thread-core";
import { StoreConflictError } from "thread-core";

// Minimal interface
interface VersionedState { state: HouseholdState; version: number }

function myStore(): Store {
  return {
    async load(householdId: string): Promise<VersionedState | null> {
      // return null if the household doesn't exist yet
    },
    async commit(
      householdId: string,
      state: HouseholdState,
      expectedVersion: number,
      events: ThreadEvent[],
    ): Promise<void> {
      // throw StoreConflictError if the stored version !== expectedVersion
      // (the app layer retries automatically, up to 2 times)
      throw new StoreConflictError();
    },
    async events(householdId: string, since?: number): Promise<ThreadEvent[]> {
      // return events in seq order
      return [];
    },
  };
}
```

The testkit's `memoryStore` is the canonical reference implementation (`src/store/memory.ts`).

---

## Implementing a `CalendarConnector`

The `CalendarConnector` port creates, moves, and verifies calendar blocks for TRANSPORT responsibilities. It is optional — if omitted, automatic calendar management is disabled.

```ts
import type { CalendarConnector } from "thread-core";

function myCalendar(): CalendarConnector {
  return {
    async createBlock({ person_id, title, start, end, ref }) {
      // ref is idempotency key — return same block_id for the same ref
      return { block_id: "..." };
    },
    async moveBlock({ person_id, block_id, start, end }) {
      // update the block's time window
    },
    async verifyBlock({ person_id, block_id, start, end }) {
      // return true if the block exists with the given times
      return true;
    },
  };
}
```

The testkit's `fakeCalendar()` is the canonical reference (`src/testkit/calendar.ts`).

---

## Implementing a `ServiceProvider`

A `ServiceProvider` can take PICKUP (or other) responsibilities on behalf of a service like a pharmacy delivery. The app queries it for a quote, asks for a human confirmation, then places the order and polls for delivery.

```ts
import type { ServiceProvider } from "thread-core";

function myServiceProvider(): ServiceProvider {
  return {
    id: "svc_my_service",
    name: "My service",
    handles: ["PICKUP"],          // responsibility types this service can take

    async query({ thread, responsibility, now }) {
      // return null if the service can't fulfil the responsibility at this time
      return {
        provider_id: "svc_my_service",
        slot: { start: "...", end: "..." },
        amount_cents: 499,
        currency: "USD",
        summary: "My service, Saturday 10:00 AM–11:00 AM, $4.99",
      };
    },

    async act({ order_ref, quote, shared }) {
      // place the order; order_ref is the idempotency key
      return { order_id: "ord_1" };
    },

    async verify({ order_id, now }) {
      // return DELIVERED once done, PLACED while in flight
      return { state: "PLACED" };
    },
  };
}

const app = createThreadApp({
  store: memoryStore(),
  clock: fixedClock(new Date().toISOString()),
  providers: [myServiceProvider()],
});
```

The testkit's `fakeServiceProvider(cfg)` is the canonical reference (`src/testkit/service.ts`). See `fixtures/golden/rivera-seed.json` for the pharmacy service configuration used in the household story.

---

## Using JSON Schemas with MCP

Every operation's input and output is available as JSON Schema (draft 2020-12), ready to feed into an MCP tool definition:

```ts
import { jsonSchemas } from "thread-core";

// jsonSchemas.reportChange.input  — the input schema
// jsonSchemas.reportChange.output — the output schema

const tools = Object.entries(jsonSchemas).map(([name, s]) => ({
  name,
  description: `thread-core: ${name}`,
  inputSchema: s.input,
}));
```

See the good-first-issue [MCP server adapter package](https://github.com/learnermaker/thread-core/issues) for the planned official adapter.
