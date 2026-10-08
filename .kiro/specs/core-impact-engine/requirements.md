# Requirements Document: core-impact-engine

## Introduction
The heart of THREAD: **"What does this change affect?"** An in-memory Impact Graph, a bounded traversal, a computable severity, deterministic candidate ranking (people and services), template explanations, and the severity × autonomy decision matrix. (Master Spec §D5, refined Oct 8: plan-drift MEDIUM, same-thread commitments don't conflict, load bonus only with ≥ 2 eligible people.)

## Glossary
- **Impact_Engine**: `src/engine/impact.ts` (`buildGraph`, `startNodes`, `traverse`, `reachedResponsibilities`, `evalResponsibility`, `severityOf`, `assess`, `explainImpact`).
- **Ranker**: `src/engine/candidates.ts` (`rankCandidates`, `eligibleByPolicy`, `describe`).
- **Autonomy_Matrix**: `src/engine/autonomy.ts` (`AUTONOMY_MATRIX`, `decide`).
- **Ripple**: Maya PERSON_UNAVAILABLE Sat 07:00–13:00 (local), reported Thu 19:31.

## Requirements

### Requirement 1: Impact Graph and traversal
**User Story:** As a parent, I want THREAD to find exactly the plans a change touches, so that I'm not flooded and nothing is missed.
#### Acceptance Criteria
1. THE Impact_Engine SHALL build edges AVAILABILITY_OF, OWNS, REQUIRES, REQUIRED_BY, AFFECTS, HOLDS and NEEDS_OBJECT from state, and skip cancelled Threads.
2. WHEN traversing THE Impact_Engine SHALL follow only AVAILABILITY_OF, OWNS, REQUIRED_BY and AFFECTS edges, up to depth 4, recording the path to each reached node.
3. WHEN the Ripple is traversed THE Impact_Engine SHALL reach `r_transport`, `r_pickup` and `r_reservation`, and SHALL NOT reach `r_jersey`.
4. WHEN a TRAVEL_TIME_CHANGED signal for `place_riverside` is traversed THE Impact_Engine SHALL reach only `thr_leo_tourney`'s `r_transport`.

### Requirement 2: Severity
**User Story:** As a parent, I want a consistent urgency level, so that THREAD interrupts only when it matters.
#### Acceptance Criteria
1. IF the responsibility is infeasible after the change THEN THE Impact_Engine SHALL rate it CRITICAL when ≤ 12 h remain to the deadline or no eligible candidate exists, and HIGH otherwise.
2. IF it is feasible but an accepted calendar block no longer matches its window (plan drift) THEN THE Impact_Engine SHALL rate it MEDIUM.
3. IF it is feasible with no drift and its slack shrank THEN THE Impact_Engine SHALL rate it MEDIUM below 30 min of slack, and LOW otherwise.
4. OTHERWISE THE Impact_Engine SHALL rate it NONE, and SHALL still report reached Threads with NONE (shown as "not affected").
5. WHEN the Ripple is assessed THE Impact_Engine SHALL return tourney HIGH, refill HIGH and dinner NONE, sorted by severity, then Thread id.
6. WHEN the Saturday 07:05 rain (40 min) is assessed after Sam's accepted block 07:55–12:30 THE Impact_Engine SHALL return tourney MEDIUM.

### Requirement 3: Explanations
**User Story:** As a judge, I want THREAD to say why in plain words, so that its decisions are trustworthy.
#### Acceptance Criteria
1. WHEN the Ripple is assessed THE Impact_Engine SHALL explain the tourney as exactly `Maya is unavailable Saturday 7:00 AM–1:00 PM.` and `Maya owned Transport, which Leo's Saturday Tournament needs.`
2. WHEN dinner is NONE THE Impact_Engine SHALL explain `Maya is free again by 1:00 PM; Family dinner is at 7:00 PM, so no action needed.`
3. WHEN the rain causes plan drift THE Impact_Engine SHALL explain `Heavy rain: travel to Riverside Fields is now 40 min.` and `Leave by 7:40 AM instead of 7:55 AM.`
4. THE explanations SHALL be template-generated and SHALL never contain PRIVATE fact values.

### Requirement 4: Candidate ranking
**User Story:** As a parent, I want the best person (or service) suggested with reasons, so that the handoff is one tap.
#### Acceptance Criteria
1. THE Ranker SHALL exclude the current owner and people failing the handoff policy, apply the hard filters FREE and the type capability (recording each as a reason), and score eligible people +2 HOLDS_ITEM, +3 PARTICIPANT, and +1 LOWEST_LOAD only when ≥ 2 people are eligible.
2. THE Ranker SHALL order candidates as eligible people (score desc, id asc) followed by eligible services (id asc), and excluded ones as people (id asc) then services.
3. WHEN ranking tourney transport after the Ripple THE Ranker SHALL return Sam (score 5) with reasons `free 7:55 AM–12:30 PM`, `can drive`, `has the jersey`, `already involved`, and exclude Rosa with `doesn't drive`.
4. WHEN ranking the refill after Sam accepted transport THE Ranker SHALL exclude Sam with `driving Leo until 12:30 PM (accepted earlier)` and Rosa with `doesn't drive`, and offer `svc_pharmacy_delivery` with reasons `slot 10:00 AM–11:00 AM`, `$4.99`, `needs your confirmation`.
5. IF a service's quoted slot starts before now or ends after the deadline THEN THE Ranker SHALL exclude it with `no slot before the deadline`.

### Requirement 5: Autonomy matrix
**User Story:** As a user, I want THREAD to act only within the autonomy I chose, so that it never oversteps.
#### Acceptance Criteria
1. THE Autonomy_Matrix SHALL equal the table in design.md for all 20 severity × autonomy cells.
2. THE Autonomy_Matrix SHALL never return ADJUST_PLAN or SEND_HANDOFF for OBSERVE or RECOMMEND.
