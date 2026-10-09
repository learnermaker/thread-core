# thread-core

> A responsibility ledger for people and agents. Detect what a change breaks, hand off with the least context, resolve on evidence, not on "okay".

[![CI](https://github.com/learnermaker/thread-core/actions/workflows/ci.yml/badge.svg)](https://github.com/learnermaker/thread-core/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![MCP-ready](https://img.shields.io/badge/MCP--ready-yes-green.svg)](docs/extending.md)

## Why

When one link in a plan changes, the person carrying it re-explains everything, over-shares context, and manually checks whether the handoff actually happened. Task tools track what needs to be done; they don't model who is responsible, what evidence resolves it, or what breaks when availability changes.

## Concepts in 60 seconds

| Concept | What it is |
|---|---|
| **Thread** | A commitment with an event, a deadline, and a set of responsibilities |
| **Responsibility** | One deliverable within a thread (transport, pickup, …), owned by one person or service |
| **Condition & evidence strength** | A condition that must be satisfied (PRE or OUTCOME). Evidence is ATTESTED (self-reported) or SYSTEM_VERIFIED (from a connector) |
| **Context Receipt** | The minimum-necessary facts a new owner needs — shared keys, withheld labels. No over-sharing. |

## Quickstart

```sh
git clone https://github.com/learnermaker/thread-core.git
cd thread-core && npm install
node examples/caregiver-rota.ts
```

```
Tuesday visit to Ada: HIGH — Ben is unavailable Tuesday 1:00 PM–5:00 PM. Ben owned Visit, which Tuesday visit to Ada needs. Best option: Cleo (free 2:00 PM–3:00 PM, already involved).
Asked cleo; shared: Event time, Place, Who; withheld: Ben's reason for being unavailable, Other calendar events, Private notes
After Cleo accepts: PLAN_SECURED
After the visit: RESOLVED
```

## What it does (the household ripple)

Maya reports she's unavailable Saturday morning. thread-core traverses the responsibility graph, surfaces the impact, proposes Sam for two threads, routes the pharmacy refill through a service with a confirmation step, adjusts Sam's calendar when rain adds travel time, and derives RESOLVED from Sam's arrival evidence — no status was ever set by hand.

```
node examples/household-weekend.ts
```

```
s01_weekend_overview: Leo's Saturday Tournament ACTIVE · Rosa's prescription refill PLAN_SECURED · Family dinner PLAN_SECURED
s02_ripple: Leo's Saturday Tournament HIGH · Rosa's prescription refill HIGH · Family dinner NONE (not affected)
s03_handoff_to_sam: handoff → sam (PENDING)
s06_sam_accepts: PLAN_SECURED
s08_refill_rerank_to_service: needs confirmation: Pharmacy delivery, Saturday 10:00 AM–11:00 AM, $4.99
s10_maya_approves_order: PLAN_SECURED
s12_saturday_rain_autonomous_step: Leo's Saturday Tournament MEDIUM — Heavy rain: travel to Riverside Fields is now 40 min. Leave by 7:40 AM instead of 7:55 AM.
s15_sam_arrives: Leo's Saturday Tournament RESOLVED
s16_pharmacy_delivered: Rosa's prescription refill PLAN_SECURED → RESOLVED
Weekend: Leo's Saturday Tournament RESOLVED · Rosa's prescription refill RESOLVED · Family dinner PLAN_SECURED
```

## API

Every operation returns `Promise<{ ok: true; data } | { ok: false; error }>`. JSON Schemas: `import { jsonSchemas } from "thread-core"`.

| Operation | Who calls it | What it does |
|---|---|---|
| `createThread` | person | Creates a thread (title, event, responsibilities, conditions) |
| `listThreads` | person | Lists visible threads and their statuses |
| `getThread` | person | Full detail for one thread |
| `reportChange` | person | Reports availability change; ripples through affected threads |
| `requestHandoff` | person | Hands off a responsibility to the best candidate with a minimal receipt |
| `respondToHandoff` | person | Accepts or declines a handoff |
| `recordEvidence` | person | Attests a condition (only the responsible person satisfies owner-gated conditions) |
| `confirmAction` | person | Approves a TRANSACT or MODIFY action |
| `ingestSignal` | system | Ingests a deduped connector signal (weather, travel time) |
| `tick` | system | Polls service providers and derives status transitions |
| `inbox` | person / system | Returns pending messages for a principal |

## Install in your project

```sh
npm install https://github.com/learnermaker/thread-core/releases/download/v0.1.0/thread-core-0.1.0.tgz
```

```ts
import { createThreadApp, memoryStore, householdTypes } from "thread-core";
import { fixedClock } from "thread-core/testkit";

const app = createThreadApp({ store: memoryStore(), clock: fixedClock(new Date().toISOString()), types: householdTypes });
```

## Extending

See [docs/extending.md](docs/extending.md) — register custom responsibility types, implement `Store` / `CalendarConnector` / `ServiceProvider` ports, or wrap operations as MCP tools using `jsonSchemas`.

## Design principles

- **Deterministic** — same inputs and clock give byte-identical state and events. No `Date.now()`, no random ids.
- **I/O only through ports** — `Store`, `Clock`, `CalendarConnector`, `ServiceProvider` are all injected; `src/` never touches Node APIs.
- **zod is the only runtime dependency** — schemas, validation, and JSON Schema export in one.
- **Every decision explains itself** — `why[]` on every impact; `reason` on every unsatisfied evidence.
- **Resolution is derived, never requested** — callers never set status. `RESOLVED` is computed when all conditions are satisfied.

## Built with Kiro

Requirements, design and tasks live in `.kiro/specs`; steering and guard hooks keep every change on spec. Kiro implemented and tested it; see `docs/kiro-log.md`.

## Used by

[THREAD for Alexa+](https://github.com/learnermaker/thread-alexa) — a voice add-on that surfaces thread status and drives handoffs through Alexa.

## Roadmap

See [ROADMAP.md](ROADMAP.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

Apache-2.0 — see [LICENSE](LICENSE).
