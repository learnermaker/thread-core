import { describe, test, expect } from "vitest";
import { clone } from "../../src/model/util.ts";
import { buildGraph, startNodes, traverse, node, type Change } from "../../src/engine/impact.ts";
import { registry as reg, seedState } from "../helpers.ts";

const has = (edges: ReturnType<typeof buildGraph>, from: string, rel: string, to: string) =>
  edges.some((e) => e.from === from && e.rel === rel && e.to === to);

const ripple: Change = {
  type: "PERSON_UNAVAILABLE",
  person: "maya",
  start: new Date("2026-10-10T07:00:00-07:00").toISOString(),
  end: new Date("2026-10-10T13:00:00-07:00").toISOString(),
};

describe("impact graph (task 1.1)", () => {
  const edges = buildGraph(seedState(), reg);

  test("availability, ownership, affects and holds edges exist", () => {
    expect(has(edges, node.avail("maya"), "AVAILABILITY_OF", node.person("maya"))).toBe(true);
    expect(has(edges, node.person("maya"), "OWNS", node.resp("thr_leo_tourney", "r_transport"))).toBe(true);
    expect(has(edges, node.travel("place_riverside"), "AFFECTS", node.cond("thr_leo_tourney", "c_departure_plan"))).toBe(true);
    expect(has(edges, node.person("sam"), "HOLDS", node.object("jersey"))).toBe(true);
  });

  test("a cancelled thread contributes no edges", () => {
    const s = seedState();
    s.threads.find((t) => t.id === "thr_family_dinner")!.cancelled = true;
    const e = buildGraph(s, reg);
    expect(e.some((x) => x.from.includes("thr_family_dinner") || x.to.includes("thr_family_dinner"))).toBe(false);
  });
});

describe("traversal (task 1.2)", () => {
  test("the Ripple reaches the three affected responsibilities but not the jersey", () => {
    const s = seedState();
    const reached = traverse(buildGraph(s, reg), startNodes(ripple, s));
    expect(reached.has(node.resp("thr_leo_tourney", "r_transport"))).toBe(true);
    expect(reached.has(node.resp("thr_rosa_refill", "r_pickup"))).toBe(true);
    expect(reached.has(node.resp("thr_family_dinner", "r_reservation"))).toBe(true);
    expect(reached.has(node.resp("thr_leo_tourney", "r_jersey"))).toBe(false);
  });

  test("the path to the tourney thread starts at avail:maya", () => {
    const s = seedState();
    const reached = traverse(buildGraph(s, reg), startNodes(ripple, s));
    expect(reached.get(node.thread("thr_leo_tourney"))![0]).toBe(node.avail("maya"));
  });

  test("the travel signal reaches only the tourney transport", () => {
    const s = seedState();
    const travel: Change = { type: "TRAVEL_TIME_CHANGED", place: "place_riverside", minutes: 40, cause: "heavy rain", source_id: "wx" };
    const reached = traverse(buildGraph(s, reg), startNodes(travel, s));
    const resps = [...reached.keys()].filter((k) => k.startsWith("resp:"));
    expect(resps).toEqual([node.resp("thr_leo_tourney", "r_transport")]);
  });

  test("depth 1 from avail:maya returns exactly avail:maya and person:maya", () => {
    const s = seedState();
    const reached = traverse(buildGraph(clone(s), reg), ["avail:maya"], 1);
    expect([...reached.keys()].sort()).toEqual([node.avail("maya"), node.person("maya")].sort());
  });
});
