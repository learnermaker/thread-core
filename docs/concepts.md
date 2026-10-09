# thread-core concepts

## Domain model

```
Household
  ├─ Person[]       adult, has_account, can_drive, guardian_of
  ├─ Place[]        travel_minutes from home
  └─ Thread[]
       ├─ Responsibility[]   type, owner (person | service), window, status
       ├─ Condition[]        phase (PRE | OUTCOME), min_strength, window
       └─ Evidence[]         condition_id, strength, authorized, observed_at
```

A **Thread** is a commitment: _Leo's Saturday Tournament_ has an event window, a deadline, participants, and responsibilities. Threads are created by adults with accounts; they are never deleted — they resolve or expire.

A **Responsibility** belongs to exactly one person or service at a time. Its type comes from the registry (`TRANSPORT`, `BRING_ITEM`, `PICKUP`, `ATTEND`, or a custom type). Ownership transfers only through a handoff; it is never directly reassigned.

A **Condition** gates status. PRE conditions must be satisfied before a thread reaches PLAN_SECURED; OUTCOME conditions must be satisfied for RESOLVED. Each condition has a minimum evidence strength and an optional time window.

**Evidence** is the record that a condition was (or was not) met. It carries `authorized: boolean` — only evidence from the current owner of the responsibility satisfies owner-gated conditions.

---

## Household story as a running example

The Rivera household has a busy Saturday. Starting state (Friday evening):

- `thr_leo_tourney` — ACTIVE (owner: Maya, transport to Riverside Fields)
- `thr_rosa_refill` — PLAN_SECURED (owner: Maya, pickup at the pharmacy)
- `thr_family_dinner` — PLAN_SECURED (owner: Maya, reservation at Corner Bistro)

Maya reports she will be unavailable Saturday 7:00 AM–1:00 PM. thread-core traverses the **impact graph**, surfaces severity for each affected responsibility, and produces proposals.

---

## Derived status

Status is computed from state — callers never set it. Precedence (highest first):

| Status | Condition |
|---|---|
| `CANCELLED` | Thread was cancelled |
| `RESOLVED` | Every condition is satisfied |
| `EXPIRED` | Past deadline, not resolved |
| `NEEDS_ATTENTION` | An AT_RISK responsibility has no eligible candidate |
| `HANDOFF_PENDING` | A responsibility is awaiting a handoff response |
| `AT_RISK` | A responsibility has an active risk signal |
| `PLAN_SECURED` | All PRE conditions satisfied |
| `ACTIVE` | Default |

---

## Evidence strengths

| Strength | Source | Meaning |
|---|---|---|
| `ATTESTED` | A person's own assertion via `recordEvidence` or handoff acceptance | "I confirm this" |
| `SYSTEM_VERIFIED` | A connector (calendar, service) confirmed it externally | "The system checked this" |
| `OUTCOME` | Reserved for conditions that are satisfied only by an external OUTCOME signal | Future use |

`SYSTEM_VERIFIED` ≥ `ATTESTED` in rank: a condition with `min_strength: "SYSTEM_VERIFIED"` is not satisfied by ATTESTED evidence alone.

Only the **current owner** of a responsibility can provide authorized evidence. A non-owner can call `recordEvidence` but the evidence is stored with `authorized: false` and returns `reason: "not from the responsible person"`. See `examples/agent-handoff.ts` for a concrete illustration.

---

## Context policy (Context Receipt)

When a responsibility is handed off, the recipient receives only what the policy allows:

```
needed   = type.context_needs[recipient_kind]   // [{key, required}]
facts    = computed thread facts + stored facts for this thread
shared   = needed facts the recipient is allowed to see (by sensitivity and scope)
missing  = required needs not in shared  → CONTEXT_BLOCKED (handoff fails)
withheld = thread facts the recipient may not see + busy cause labels + generic labels
           (labels only, never values)
```

**Sensitivity levels** (`PUBLIC` ≥ `HOUSEHOLD` ≥ `THREAD` ≥ `PRIVATE`):
- `PUBLIC`: visible to anyone
- `HOUSEHOLD`: visible to adults with accounts
- `THREAD`: visible to participants in that thread (joining via handoff counts)
- `PRIVATE`: visible only to the owner or named `shared_with` persons

The receipt exposes *labels* for withheld facts — never their values.

**Example (Sam receives the transport handoff):**

```
shared:   Event time, Be there by, Place, Who, Items, Leave by
withheld: Maya's reason for being unavailable, Other calendar events, Private notes
```

Rosa's medication name (`PRIVATE`) never appears, even as a label in the transport receipt, because Sam isn't involved in the refill thread.

---

## Impact severity

When a change arrives (person unavailable, travel time changed), thread-core assesses each affected responsibility:

| Severity | Meaning |
|---|---|
| `NONE` | Change doesn't overlap or has no effect |
| `LOW` | Slack decreased but ≥ 30 minutes remain |
| `MEDIUM` | Slack < 30 minutes, or an accepted plan block must be adjusted |
| `HIGH` | Responsibility is infeasible and > 12 hours to deadline |
| `CRITICAL` | Responsibility is infeasible and ≤ 12 hours to deadline, **or** no eligible candidate exists |

The household ripple: Maya unavailable Sat 7–1 PM creates HIGH on the tournament (> 12 h away on Friday evening) and HIGH on the refill. Family dinner is NONE — Maya is back by 1 PM, dinner is at 7 PM.

---

## Autonomy matrix

Each thread has an `autonomy` level that controls how much thread-core acts without human confirmation:

| Level | Behaviour on HIGH/CRITICAL impact |
|---|---|
| `OBSERVE` | Surfaces the impact, no proposal |
| `RECOMMEND` | Produces a ranked proposal, waits |
| `COORDINATE` | Sends the handoff automatically (SEND_HANDOFF) if > 1 candidate |
| `ACT` | Same as COORDINATE; also adjusts calendar blocks on MEDIUM plan drift |

The Rivera threads use `COORDINATE`. On Maya's change, thread-core proposes Sam for the tournament (who is the top-ranked candidate), and also ranks Sam and the pharmacy service for the refill.
