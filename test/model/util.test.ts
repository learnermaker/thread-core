import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { nextId, stableStringify, cmp, clone } from "../../src/model/util.ts";
import type { HouseholdState } from "../../src/model/schemas.ts";

const freshState = () => ({ counters: {} }) as unknown as HouseholdState;

describe("util helpers", () => {
  test("nextId sequences per prefix", () => {
    const s = freshState();
    expect(nextId(s, "ho")).toBe("ho_1");
    expect(nextId(s, "ho")).toBe("ho_2");
    expect(nextId(s, "evd")).toBe("evd_1");
    expect(nextId(s, "ho")).toBe("ho_3");
  });

  test("stableStringify is key-order independent", () => {
    expect(stableStringify({ a: 1, b: { c: 2, d: 3 } })).toBe(stableStringify({ b: { d: 3, c: 2 }, a: 1 }));
  });

  test("cmp orders deterministically", () => {
    expect(cmp("a", "b")).toBe(-1);
    expect(cmp("b", "a")).toBe(1);
    expect(cmp("a", "a")).toBe(0);
  });

  test("clone makes a deep copy", () => {
    const src = { a: { b: [1, 2] } };
    const copy = clone(src);
    copy.a.b.push(3);
    expect(src.a.b).toEqual([1, 2]);
  });

  test("property 2: ids are sequential per prefix, independent of other prefixes", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom("ho", "thr", "evd", "blk"), { minLength: 1, maxLength: 40 }), (prefixes) => {
        const s = freshState();
        const seen: Record<string, number> = {};
        for (const p of prefixes) {
          seen[p] = (seen[p] ?? 0) + 1;
          if (nextId(s, p) !== `${p}_${seen[p]}`) return false;
        }
        return true;
      }),
    );
  });
});
