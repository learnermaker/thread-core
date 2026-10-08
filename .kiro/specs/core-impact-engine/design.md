# Design Document: core-impact-engine

## Overview
`src/engine/impact.ts`, `src/engine/candidates.ts` and `src/engine/autonomy.ts` already contain the **architect's reference implementation**. It was verified against the golden story before handoff (trace output below). Your job: **read them, write the tests and property tests, and fix only real bugs your tests reveal** (note any fix in the commit message). Don't redesign them.

## Architecture
```text
change ──startNodes──▶ [avail:maya] ──traverse(depth≤4)──▶ person:maya → resp:* → thread:* / cond:*
                                                     │
  before-state, after-state ─────────────────────────┴─▶ assess(): evalResponsibility(before) vs (after)
                                                                 → severityOf → ThreadImpact[] (+ why[])
  rankCandidates(state, reg, thread, resp, quotes, now) → { candidates, excluded }   (pure; quotes pre-fetched)
  decide(severity, autonomy) → AutoAction[]
```
- The graph is rebuilt per call from `HouseholdState` (tiny; no graph database). Propagation follows only AVAILABILITY_OF, OWNS, REQUIRED_BY and AFFECTS. **Never thread → responsibility**, which would wrongly mark sibling duties (the jersey) as affected.
- `assess` needs a **before** state (a clone taken before the change was applied) and an **after** state (with the busy interval or travel signal added and `recomputeWindows` applied).
- `noCandidate(t, r)` is a callback so `assess` stays pure. The app layer passes `(t, r) => rankCandidates(...).candidates.length === 0`.

## How to build test states (helper pattern)
```ts
import { clone } from "../../src/model/util.ts";
import { recomputeWindows } from "../../src/engine/derive.ts";
import { assess, buildGraph, startNodes, traverse, type Change } from "../../src/engine/impact.ts";
import { rankCandidates } from "../../src/engine/candidates.ts";
import { registry as reg, seedState, pharmacy } from "../helpers.ts";

const now = new Date("2026-10-08T19:31:00-07:00").toISOString();
const s = seedState();
const change: Change = { type: "PERSON_UNAVAILABLE", person: "maya",
  start: new Date("2026-10-10T07:00:00-07:00").toISOString(), end: new Date("2026-10-10T13:00:00-07:00").toISOString() };
const before = clone(s);
s.busy.push({ id: "busy_1", person: "maya", start: change.start, end: change.end, withheld_label: "Maya's reason for being unavailable" });
recomputeWindows(s, reg);
const reached = traverse(buildGraph(s, reg), startNodes(change, s));
const quote = await pharmacy().query({ thread: s.threads[1]!, responsibility: s.threads[1]!.responsibilities[0]!, now });
const quotesFor = (type: string) => (type === "PICKUP" && quote ? [quote] : []);
const impacts = assess(before, s, reg, change, reached, now, (t, r) => rankCandidates(s, reg, t, r, quotesFor(r.type), now).candidates.length === 0);
```
To simulate "Sam accepted transport" in a pure test: set `r_transport.owner = "sam"`, `status = "ACCEPTED"`, `block = { block_id: "blk_1", start: window.start, end: window.end }`, and delete `risk`.

## Verified trace (architect run, Oct 8; your tests must reproduce these)
```text
RIPPLE thr_leo_tourney HIGH r_transport:HIGH | actions(COORDINATE): PROPOSE_HANDOFF
   why: Maya is unavailable Saturday 7:00 AM–1:00 PM.
   why: Maya owned Transport, which Leo's Saturday Tournament needs.
   candidates: Sam (free 7:55 AM–12:30 PM, can drive, has the jersey, already involved) || excluded: Rosa (doesn't drive)
RIPPLE thr_rosa_refill HIGH r_pickup:HIGH | actions: PROPOSE_HANDOFF
   why: Maya is unavailable Saturday 7:00 AM–1:00 PM.
   why: Maya owned Pickup, which Rosa's prescription refill needs.
   candidates: Sam (free 9:00 AM–12:00 PM, can drive) | Pharmacy delivery (slot 10:00 AM–11:00 AM, $4.99, needs your confirmation) || excluded: Rosa (doesn't drive)
RIPPLE thr_family_dinner NONE r_reservation:NONE | actions: UPDATE_SILENTLY
   why: Maya is free again by 1:00 PM; Family dinner is at 7:00 PM, so no action needed.
REFILL after Sam accepted: candidates: Pharmacy delivery (slot 10:00 AM–11:00 AM, $4.99, needs your confirmation)
   || excluded: Rosa (doesn't drive) | Sam (driving Leo until 12:30 PM (accepted earlier))
RAIN Sat 07:05 (40 min): thr_leo_tourney MEDIUM r_transport:MEDIUM | actions: ADJUST_PLAN
   why: Heavy rain: travel to Riverside Fields is now 40 min.
   why: Leave by 7:40 AM instead of 7:55 AM.
```
(`describe(candidate)` produces the `Name (reasons…)` strings.)

## Severity rule (reference: `severityOf`)
| Condition (evaluated after the change) | Severity |
|---|---|
| infeasible and (≤ 12 h to deadline **or** no eligible candidate) | CRITICAL |
| infeasible | HIGH |
| plan drift (an accepted block ≠ the recomputed window) | MEDIUM |
| slack shrank and is now < 30 min | MEDIUM |
| slack shrank, still ≥ 30 min | LOW |
| otherwise | NONE |

Slack = minutes from `now` to the responsibility window start. Infeasible = the owner's busy interval overlaps the window, the owner lacks the type capability, or the owner has a THREAD-created calendar block for an exclusive commitment in another live Thread (planned ownership without a block never counts as busy).

## Autonomy matrix (reference: `AUTONOMY_MATRIX`)
| Severity | OBSERVE | RECOMMEND | COORDINATE | ACT |
|---|---|---|---|---|
| NONE | LOG | LOG | UPDATE_SILENTLY | UPDATE_SILENTLY |
| LOW | LOG | LOG | UPDATE_SILENTLY | UPDATE_SILENTLY |
| MEDIUM | LOG | SURFACE | ADJUST_PLAN | ADJUST_PLAN |
| HIGH | SURFACE | PROPOSE_HANDOFF | PROPOSE_HANDOFF | SEND_HANDOFF |
| CRITICAL | SURFACE | PROPOSE_HANDOFF | SEND_HANDOFF + NOTIFY_CREATOR | SEND_HANDOFF + NOTIFY_CREATOR |

TRANSACT is never in the matrix: buying always needs `confirm_action` (enforced in spec core-app-api).

## Correctness Properties
### Property 1: Assessment is deterministic
*For any* PERSON_UNAVAILABLE change for any household adult with start/end on the demo Saturday (start < end), running the full assess pipeline twice on clones of the seeded state gives deep-equal results.
**Validates: Requirements 2.5**
### Property 2: Locality
*For any* such change for person X, every reported Thread contains at least one responsibility owned by X; Threads where X owns nothing are never reported.
**Validates: Requirements 1.2, 1.3**
### Property 3: Severity is consistent with feasibility
*For any* reported responsibility: severity ∈ {HIGH, CRITICAL} ⇔ `after.feasible === false`.
**Validates: Requirements 2.1, 2.4**
### Property 4: Ranking partitions and orders
*For any* change and any reached responsibility: candidates are all `eligible`, excluded are all not `eligible`, the current owner appears in neither, and candidate people are sorted by score desc, then id asc.
**Validates: Requirements 4.1, 4.2**
### Property 5: Low autonomy never acts
*For every* severity, `decide(severity, "OBSERVE")` and `decide(severity, "RECOMMEND")` contain neither ADJUST_PLAN nor SEND_HANDOFF.
**Validates: Requirements 5.2**

Generator hint: `fc.record({ person: fc.constantFrom("maya", "sam", "rosa"), startMin: fc.integer({ min: 0, max: 1380 }), len: fc.integer({ min: 15, max: 600 }) })`, mapped to instants on `2026-10-10T07:00:00.000Z` + minutes.

## Don'ts
- Don't add an LLM, randomness or I/O. Don't call `rankCandidates` inside `assess` (use the callback).
- Don't change explanation wording: the golden story asserts exact strings.
