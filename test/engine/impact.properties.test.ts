import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { clone } from "../../src/model/util.ts";
import { recomputeWindows } from "../../src/engine/derive.ts";
import { assess, buildGraph, node, startNodes, traverse, type Change } from "../../src/engine/impact.ts";
import { rankCandidates } from "../../src/engine/candidates.ts";
import type { HouseholdState, Responsibility, Thread } from "../../src/model/schemas.ts";
import { addMinutes } from "../../src/model/time.ts";
import { pharmacy, registry as reg, seedState } from "../helpers.ts";

const now = new Date("2026-10-08T19:31:00-07:00").toISOString();
const SAT = "2026-10-10T07:00:00.000Z"; // generator base (design.md hint)

const changeArb = fc
  .record({
    person: fc.constantFrom("maya", "sam", "rosa"),
    startMin: fc.integer({ min: 0, max: 1380 }),
    len: fc.integer({ min: 15, max: 600 }),
  })
  .map(({ person, startMin, len }): Change => ({
    type: "PERSON_UNAVAILABLE",
    person,
    start: addMinutes(SAT, startMin),
    end: addMinutes(SAT, startMin + len),
  }));

/** Full assess pipeline for a PERSON_UNAVAILABLE change on a fresh seeded clone. */
async function run(change: Change) {
  if (change.type !== "PERSON_UNAVAILABLE") throw new Error("test only drives PERSON_UNAVAILABLE");
  const s = seedState(now);
  const before = clone(s);
  s.busy.push({ id: "busy_1", person: change.person, start: change.start, end: change.end, withheld_label: "reason" });
  recomputeWindows(s, reg);
  const reached = traverse(buildGraph(s, reg), startNodes(change, s));
  const refill = s.threads.find((t) => t.id === "thr_rosa_refill")!;
  const quote = await pharmacy().query({ thread: refill, responsibility: refill.responsibilities[0]!, now });
  const quotesFor = (type: string) => (type === "PICKUP" && quote ? [quote] : []);
  const noCandidate = (t: Thread, r: Responsibility) =>
    rankCandidates(s, reg, t, r, quotesFor(r.type), now).candidates.length === 0;
  return { s, before, impacts: assess(before, s, reg, change, reached, now, noCandidate), reached };
}

describe("impact properties (task 6.1)", () => {
  test("property 1: assessment is deterministic", async () => {
    await fc.assert(
      fc.asyncProperty(changeArb, async (change) => {
        const a = (await run(change)).impacts;
        const b = (await run(change)).impacts;
        expect(a).toEqual(b);
      }),
    );
  });

  test("property 2: locality — every reported thread has a responsibility owned by X", async () => {
    await fc.assert(
      fc.asyncProperty(changeArb, async (change) => {
        if (change.type !== "PERSON_UNAVAILABLE") return;
        const { s, impacts } = await run(change);
        for (const ti of impacts) {
          const t = s.threads.find((x) => x.id === ti.thread_id)!;
          expect(t.responsibilities.some((r) => r.owner === change.person && r.owner_kind === "person")).toBe(true);
        }
        // Threads where X owns nothing are never reported.
        for (const t of s.threads) {
          const owns = t.responsibilities.some((r) => r.owner === change.person && r.owner_kind === "person");
          if (!owns) expect(impacts.some((ti) => ti.thread_id === t.id)).toBe(false);
        }
      }),
    );
  });

  test("property 3: severity in {HIGH,CRITICAL} ⇔ after.feasible === false", async () => {
    await fc.assert(
      fc.asyncProperty(changeArb, async (change) => {
        const { impacts } = await run(change);
        for (const ti of impacts) {
          for (const ri of ti.responsibilities) {
            const infeasible = ri.after.feasible === false;
            const highOrCritical = ri.severity === "HIGH" || ri.severity === "CRITICAL";
            expect(highOrCritical).toBe(infeasible);
          }
        }
      }),
    );
  });

  test("property 4: ranking partitions and orders", async () => {
    await fc.assert(
      fc.asyncProperty(changeArb, async (change) => {
        const { s } = await run(change);
        const quote = await pharmacy().query({
          thread: s.threads.find((t) => t.id === "thr_rosa_refill")!,
          responsibility: s.threads.find((t) => t.id === "thr_rosa_refill")!.responsibilities[0]!,
          now,
        });
        for (const t of s.threads) {
          for (const r of t.responsibilities) {
            const quotes = r.type === "PICKUP" && quote ? [quote] : [];
            const { candidates, excluded } = rankCandidates(s, reg, t, r, quotes, now);
            expect(candidates.every((c) => c.eligible)).toBe(true);
            expect(excluded.every((c) => !c.eligible)).toBe(true);
            expect([...candidates, ...excluded].some((c) => c.id === r.owner)).toBe(false);
            const people = candidates.filter((c) => c.kind === "person");
            for (let i = 1; i < people.length; i++) {
              const prev = people[i - 1]!;
              const cur = people[i]!;
              expect(prev.score > cur.score || (prev.score === cur.score && prev.id <= cur.id)).toBe(true);
            }
          }
        }
      }),
    );
  });
});
