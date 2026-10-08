# Requirements Document: core-policy-evidence

## Introduction
THREAD's two trust guarantees: **minimum necessary context** (the Context Receipt) and **evidence over assertion** (condition satisfaction and derived Thread status). (Master Spec §D4, §D6, §D7, §D13.)

## Glossary
- **Policy**: `src/engine/policy.ts` (`threadFacts`, `allows`, `buildReceipt`, `GENERIC_WITHHELD`).
- **Status_Deriver**: `src/engine/status.ts` (`STRENGTH_RANK`, `evidenceProblem`, `isSatisfied`, `deriveStatus`).
- **Receipt**: `{ handoff_id, recipient, recipient_kind, shared[{key,label,value}], withheld[{label}], policy_version: "1", at }`.

## Requirements

### Requirement 1: Facts and sharing policy
**User Story:** As Maya, I want THREAD to share only what each helper needs, so that my private life and Rosa's health stay private.
#### Acceptance Criteria
1. THE Policy SHALL compute Thread facts `event_time`, `deadline`, `place`, `beneficiary` (if any), `items_status` and `item` (BRING_ITEM), and `depart_by` (TRANSPORT), all with sensitivity THREAD, plus the stored facts of that Thread.
2. THE Policy SHALL allow PUBLIC to anyone; HOUSEHOLD to adult account holders; THREAD to recipients of a handoff in that Thread; and PRIVATE only to the owner or people in `shared_with`.
3. THE Policy SHALL allow a service recipient only PUBLIC facts and THREAD facts of that Thread.

### Requirement 2: Context Receipt
**User Story:** As Sam, I want exactly the information I need to take over, so that I can act without a long explanation.
#### Acceptance Criteria
1. WHEN a receipt is built for Sam for tourney TRANSPORT THE Policy SHALL share, in this order, `event_time`, `deadline`, `place`, `beneficiary`, `items_status` and `depart_by` with the values in design.md, and withhold `Maya's reason for being unavailable`, `Other calendar events` and `Private notes`.
2. WHEN a receipt is built for `svc_pharmacy_delivery` for the refill PICKUP with order facts THE Policy SHALL share `order_ref`, `delivery_address` and `slot`, and withhold `Rosa's medication name`, then the cause label, then the generic labels.
3. THE Receipt SHALL list withheld facts as labels only, and SHALL never contain the value of a withheld fact.
4. IF a required need is missing or not allowed THEN THE Policy SHALL throw `OpError` `CONTEXT_BLOCKED` naming the missing keys, and nothing is shared.
5. WHEN an optional need (PICKUP `item_detail`) is not allowed THE Policy SHALL withhold it without blocking.

### Requirement 3: Evidence satisfaction
**User Story:** As the product owner, I want conditions satisfied only by sufficient, authorized, timely evidence, so that "okay" never counts as "done".
#### Acceptance Criteria
1. THE Status_Deriver SHALL order strengths ATTESTED < SYSTEM_VERIFIED < OUTCOME.
2. THE Status_Deriver SHALL treat a condition as satisfied only by evidence for that condition that is authorized, has strength ≥ `min_strength`, is observed inside the condition window (inclusive) if there is one, and is observed at or after `valid_from` if set.
3. WHEN evidence fails THE `evidenceProblem` function SHALL return one of `not from the responsible person`, `needs <STRENGTH> evidence`, `outside the time window`, `superseded by a later change`.

### Requirement 4: Derived Thread status
**User Story:** As a judge, I want status to be a consequence of evidence, so that "Accepted isn't done. Secured isn't done. Done is done."
#### Acceptance Criteria
1. THE Status_Deriver SHALL apply the precedence CANCELLED > RESOLVED > EXPIRED > NEEDS_ATTENTION > HANDOFF_PENDING > AT_RISK > PLAN_SECURED > ACTIVE.
2. THE Status_Deriver SHALL return RESOLVED only when every condition (PRE and OUTCOME) is satisfied, and PLAN_SECURED when every PRE condition is satisfied.
3. WHEN the deadline has passed and not every condition is satisfied THE Status_Deriver SHALL return EXPIRED.
4. WHEN a responsibility's risk has `no_candidate: true` THE Status_Deriver SHALL return NEEDS_ATTENTION.
5. WHEN the seeded state is derived at Thu 19:30 THE Status_Deriver SHALL return tourney ACTIVE, refill PLAN_SECURED and dinner PLAN_SECURED.
