# Design Document: core-policy-evidence

## Overview
`src/engine/policy.ts` and `src/engine/status.ts` are **architect reference code**, verified against the golden story. Write the tests and property tests; fix only real bugs (note them in the commit).

## Context policy (reference: `buildReceipt`)
```text
needs    = registry.get(type).context_needs[recipient_kind]   // [{key, required}]
facts    = threadFacts(state, thread, extra)                   // computed THREAD facts + stored facts of the thread (+ order facts)
shared   = needs whose fact exists and allows(recipient, fact)  -> {key, label, value}   (needs order)
missing  = required needs not shared -> throw OpError("CONTEXT_BLOCKED")
withheld = labels of thread facts NOT allowed  ++  busy.withheld_label for causeBusyIds  ++  GENERIC_WITHHELD  (deduped, in that order)
```
**Withheld = labels only.** The busy record stores no reason at all, only `withheld_label` (e.g. "Maya's reason for being unavailable").

### Verified values (architect trace)
Transport receipt for `sam` (cause `busy_1`):
```text
shared:   Event time=Saturday 9:00 AM | Be there by=Saturday 8:30 AM | Place=Riverside Fields | Who=Leo | Items=jersey: with Sam | Leave by=Saturday 7:55 AM
withheld: Maya's reason for being unavailable | Other calendar events | Private notes
```
Service receipt for `svc_pharmacy_delivery`, with extra = `[{key:"order_ref",label:"Order reference",value:"ref_ho_2"}, {key:"slot",label:"Delivery slot",value:"Saturday 10:00 AM–11:00 AM"}]`:
```text
shared:   Order reference=ref_ho_2 | Delivery address=12 Alder Lane | Delivery slot=Saturday 10:00 AM–11:00 AM
withheld: Rosa's medication name | Maya's reason for being unavailable | Other calendar events | Private notes
```
Person receipt for `sam` for the refill PICKUP (no cause): shares `item_label`, `place`, `deadline`; withholds `Rosa's medication name` (optional need, not allowed), plus the generic labels.

## Evidence & status (reference: `status.ts`)
```text
evidenceProblem(c, e): different condition | not from the responsible person | needs X evidence | outside the time window | superseded by a later change | null
isSatisfied(c, ev)  = some e with evidenceProblem(c, e) === null
deriveStatus(t, ev, now):
  CANCELLED if t.cancelled
  RESOLVED  if all conditions satisfied
  EXPIRED   if now > deadline
  NEEDS_ATTENTION if any responsibility.risk.no_candidate
  HANDOFF_PENDING if any responsibility.status == HANDOFF_PENDING
  AT_RISK   if any responsibility.status == AT_RISK
  PLAN_SECURED if all PRE satisfied
  ACTIVE
```
Note the RESOLVED-before-EXPIRED order: arriving at 08:21 for an 08:30 deadline stays RESOLVED after 08:30.

## Building test evidence
```ts
const ev = (condition_id: string, strength: Strength, observed_at: string, authorized = true): Evidence => ({
  id: `e_${condition_id}_${observed_at}`, thread_id: "thr_leo_tourney", condition_id, strength,
  actor: "sam", source: "TOOL", at: observed_at, observed_at, authorized,
});
```

## Correctness Properties
### Property 1: Withheld values never leak
*For any* recipient in {maya, sam, rosa, svc_pharmacy_delivery}, any handoff Thread/type from the seed, and any extra PRIVATE fact on that Thread, owned by someone other than the recipient and not shared with them, the JSON of the receipt never contains that fact's value. Generate values as `"SECRET-" + fc.string({ unit: fc.constantFrom(..."abcdefghijkl0123456789"), minLength: 6 })`, so they can't collide with normal text.
**Validates: Requirements 2.3, 1.2**
### Property 2: Resolution needs evidence
*For any* subset of a fully satisfying evidence set for the tourney, `deriveStatus` returns RESOLVED **iff** every condition still has a satisfying evidence item in the subset.
**Validates: Requirements 4.2**
### Property 3: Insufficient strength never satisfies
*For any* condition with `min_strength` SYSTEM_VERIFIED and any ATTESTED evidence (any time, authorized or not), `isSatisfied` is false.
**Validates: Requirements 3.2**
### Property 4: Cancelled wins
*For any* thread state and evidence, if `cancelled` is true, `deriveStatus` is CANCELLED.
**Validates: Requirements 4.1**
### Property 5: Window is inclusive and strict outside
*For any* instant t: evidence observed at t satisfies `c_arrival` (window 14:30Z–15:30Z on Oct 10, authorized ATTESTED) **iff** 14:30Z ≤ t ≤ 15:30Z.
**Validates: Requirements 3.2**

## Don'ts
- Never put a fact *value* in `withheld`. Never log or return PRIVATE values in errors.
- Don't let a caller-supplied strength or status reach these functions; strengths come from the app layer's rules.
