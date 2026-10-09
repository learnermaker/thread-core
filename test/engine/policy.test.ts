import { describe, test, expect } from "vitest";
import { clone } from "../../src/model/util.ts";
import { OpError } from "../../src/model/errors.ts";
import { allows, buildReceipt, threadFacts } from "../../src/engine/policy.ts";
import type { Fact, HouseholdState, SharedFact, Thread } from "../../src/model/schemas.ts";
import { registry as reg, seedState } from "../helpers.ts";

const now = "2026-10-08T19:31:00-07:00";
const thread = (s: HouseholdState, id: string): Thread => s.threads.find((t) => t.id === id)!;
const byKey = (facts: Fact[], key: string) => facts.find((f) => f.key === key)!;

/** A busy record whose only disclosure is its label, used as a handoff cause. */
function withBusy(s: HouseholdState): HouseholdState {
  s.busy.push({ id: "busy_1", person: "maya", start: "2026-10-10T14:00:00Z", end: "2026-10-10T20:00:00Z", withheld_label: "Maya's reason for being unavailable" });
  return s;
}

describe("threadFacts (task 1.1)", () => {
  test("the tourney computes event_time, deadline, place, beneficiary, items_status, item and depart_by with the design values, all THREAD", () => {
    const s = seedState(now);
    const facts = threadFacts(s, thread(s, "thr_leo_tourney"));
    const computed = facts.filter((f) => f.id.startsWith("cf_"));
    expect(computed.map((f) => [f.key, f.value])).toEqual([
      ["event_time", "Saturday 9:00 AM"],
      ["deadline", "Saturday 8:30 AM"],
      ["place", "Riverside Fields"],
      ["beneficiary", "Leo"],
      ["items_status", "jersey: with Sam"],
      ["item", "jersey"],
      ["depart_by", "Saturday 7:55 AM"],
    ]);
    expect(computed.every((f) => f.sensitivity === "THREAD")).toBe(true);
  });

  test("stored facts of the thread are appended after the computed facts", () => {
    const s = seedState(now);
    const facts = threadFacts(s, thread(s, "thr_rosa_refill"));
    const stored = facts.filter((f) => !f.id.startsWith("cf_"));
    expect(stored.map((f) => f.id).sort()).toEqual(["fact_address", "fact_rx_detail", "fact_rx_label"]);
  });

  test("extra order facts are appended to the computed facts (service handoff)", () => {
    const s = seedState(now);
    const extra: SharedFact[] = [
      { key: "order_ref", label: "Order reference", value: "ref_ho_2" },
      { key: "slot", label: "Delivery slot", value: "Saturday 10:00 AM–11:00 AM" },
    ];
    const facts = threadFacts(s, thread(s, "thr_rosa_refill"), extra);
    expect(byKey(facts, "order_ref").value).toBe("ref_ho_2");
    expect(byKey(facts, "slot").value).toBe("Saturday 10:00 AM–11:00 AM");
  });
});

describe("allows matrix (tasks 1.1, Requirement 1.2/1.3)", () => {
  const pub = (over: Partial<Fact>): Fact => ({ id: "f", key: "k", label: "l", value: "v", owner: "maya", sensitivity: "PUBLIC", shared_with: [], ...over });

  test("PUBLIC is allowed to anyone, including a service", () => {
    const s = seedState(now);
    const t = thread(s, "thr_leo_tourney");
    const f = pub({ sensitivity: "PUBLIC" });
    expect(allows(s, "sam", "person", f, t)).toBe(true);
    expect(allows(s, "leo", "person", f, t)).toBe(true);
    expect(allows(s, "svc_pharmacy_delivery", "service", f, t)).toBe(true);
  });

  test("HOUSEHOLD is allowed to adult account holders only", () => {
    const s = seedState(now);
    const t = thread(s, "thr_leo_tourney");
    const f = pub({ sensitivity: "HOUSEHOLD" });
    expect(allows(s, "sam", "person", f, t)).toBe(true); // adult + account
    expect(allows(s, "leo", "person", f, t)).toBe(false); // child, no account
  });

  test("THREAD is allowed to a handoff recipient of that thread, not another thread", () => {
    const s = seedState(now);
    const tourney = thread(s, "thr_leo_tourney");
    const refill = thread(s, "thr_rosa_refill");
    const f = pub({ sensitivity: "THREAD", thread_id: "thr_leo_tourney" });
    expect(allows(s, "sam", "person", f, tourney)).toBe(true);
    expect(allows(s, "sam", "person", f, refill)).toBe(false);
  });

  test("PRIVATE is allowed to the owner and to shared_with, nobody else", () => {
    const s = seedState(now);
    const t = thread(s, "thr_rosa_refill");
    const f = pub({ sensitivity: "PRIVATE", owner: "rosa", shared_with: ["maya"] });
    expect(allows(s, "rosa", "person", f, t)).toBe(true); // owner
    expect(allows(s, "maya", "person", f, t)).toBe(true); // shared_with
    expect(allows(s, "sam", "person", f, t)).toBe(false); // neither
  });

  test("a service may see only PUBLIC and THREAD facts of this thread", () => {
    const s = seedState(now);
    const t = thread(s, "thr_leo_tourney");
    expect(allows(s, "svc_pharmacy_delivery", "service", pub({ sensitivity: "HOUSEHOLD" }), t)).toBe(false);
    expect(allows(s, "svc_pharmacy_delivery", "service", pub({ sensitivity: "PRIVATE", owner: "maya" }), t)).toBe(false);
    expect(allows(s, "svc_pharmacy_delivery", "service", pub({ sensitivity: "THREAD", thread_id: "thr_leo_tourney" }), t)).toBe(true);
    expect(allows(s, "svc_pharmacy_delivery", "service", pub({ sensitivity: "THREAD", thread_id: "thr_rosa_refill" }), t)).toBe(false);
  });
});

describe("verified receipts (task 1.2, Requirements 2.1/2.2/2.5)", () => {
  test("transport receipt for sam shares the six facts in order and withholds the cause plus generic labels", () => {
    const s = withBusy(seedState(now));
    const t = thread(s, "thr_leo_tourney");
    const r = buildReceipt(s, reg, t, "TRANSPORT", "sam", "person", "ho_1", ["busy_1"], now);
    expect(r.shared).toEqual([
      { key: "event_time", label: "Event time", value: "Saturday 9:00 AM" },
      { key: "deadline", label: "Be there by", value: "Saturday 8:30 AM" },
      { key: "place", label: "Place", value: "Riverside Fields" },
      { key: "beneficiary", label: "Who", value: "Leo" },
      { key: "items_status", label: "Items", value: "jersey: with Sam" },
      { key: "depart_by", label: "Leave by", value: "Saturday 7:55 AM" },
    ]);
    expect(r.withheld).toEqual([
      { label: "Maya's reason for being unavailable" },
      { label: "Other calendar events" },
      { label: "Private notes" },
    ]);
    expect(r.policy_version).toBe("1");
  });

  test("service receipt for the pharmacy shares the order facts and withholds the medication name, cause and generics", () => {
    const s = withBusy(seedState(now));
    const t = thread(s, "thr_rosa_refill");
    const extra: SharedFact[] = [
      { key: "order_ref", label: "Order reference", value: "ref_ho_2" },
      { key: "slot", label: "Delivery slot", value: "Saturday 10:00 AM–11:00 AM" },
    ];
    const r = buildReceipt(s, reg, t, "PICKUP", "svc_pharmacy_delivery", "service", "ho_2", ["busy_1"], now, extra);
    expect(r.shared).toEqual([
      { key: "order_ref", label: "Order reference", value: "ref_ho_2" },
      { key: "delivery_address", label: "Delivery address", value: "12 Alder Lane" },
      { key: "slot", label: "Delivery slot", value: "Saturday 10:00 AM–11:00 AM" },
    ]);
    expect(r.withheld).toEqual([
      { label: "Rosa's medication name" },
      { label: "Maya's reason for being unavailable" },
      { label: "Other calendar events" },
      { label: "Private notes" },
    ]);
    expect(r.policy_version).toBe("1");
  });

  test("person receipt for sam for the refill pickup withholds the optional medication name without blocking (Requirement 2.5)", () => {
    const s = seedState(now);
    const t = thread(s, "thr_rosa_refill");
    const r = buildReceipt(s, reg, t, "PICKUP", "sam", "person", "ho_3", [], now);
    expect(r.shared.map((f) => f.key)).toEqual(["item_label", "place", "deadline"]);
    expect(r.withheld.map((w) => w.label)).toContain("Rosa's medication name");
    expect(r.policy_version).toBe("1");
  });
});

describe("CONTEXT_BLOCKED (task 1.3, Requirement 2.4)", () => {
  test("when a required fact (delivery_address) becomes HOUSEHOLD, the service receipt throws CONTEXT_BLOCKED without leaking the value", () => {
    const s = withBusy(seedState(now));
    const blocked = clone(s);
    byKey(blocked.facts, "delivery_address").sensitivity = "HOUSEHOLD";
    const t = thread(blocked, "thr_rosa_refill");
    const extra: SharedFact[] = [
      { key: "order_ref", label: "Order reference", value: "ref_ho_2" },
      { key: "slot", label: "Delivery slot", value: "Saturday 10:00 AM–11:00 AM" },
    ];
    let thrown: OpError | undefined;
    try {
      buildReceipt(blocked, reg, t, "PICKUP", "svc_pharmacy_delivery", "service", "ho_2", ["busy_1"], now, extra);
    } catch (e) {
      thrown = e as OpError;
    }
    expect(thrown).toBeInstanceOf(OpError);
    expect(thrown!.body.code).toBe("CONTEXT_BLOCKED");
    expect(thrown!.message).toContain("delivery_address");
    expect(thrown!.message).not.toContain("12 Alder Lane");
  });
});
