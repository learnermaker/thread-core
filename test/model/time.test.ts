import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { fmtTime, fmtDay, fmtRange, fmtMoney, toUtc, overlaps, within } from "../../src/model/time.ts";

const LA = "America/Los_Angeles";

describe("time helpers", () => {
  test("fmtTime returns '7:55 AM' with an ASCII space", () => {
    expect(fmtTime("2026-10-10T14:55:00Z", LA)).toBe("7:55 AM");
  });

  test("fmtDay returns 'Saturday'", () => {
    expect(fmtDay("2026-10-10T14:55:00Z", LA)).toBe("Saturday");
  });

  test("fmtRange joins with an en dash", () => {
    expect(fmtRange({ start: "2026-10-10T14:55:00Z", end: "2026-10-10T19:30:00Z" }, LA)).toBe("7:55 AM–12:30 PM");
  });

  test("fmtMoney(499) is $4.99 and fmtMoney(1200) is $12.00", () => {
    expect(fmtMoney(499)).toBe("$4.99");
    expect(fmtMoney(1200)).toBe("$12.00");
  });

  test("toUtc of 2026-10-10T08:30:00-07:00 is 2026-10-10T15:30:00.000Z", () => {
    expect(toUtc("2026-10-10T08:30:00-07:00")).toBe("2026-10-10T15:30:00.000Z");
  });

  test("overlaps: touching windows do not overlap", () => {
    const a = { start: "2026-10-10T10:00:00Z", end: "2026-10-10T11:00:00Z" };
    const b = { start: "2026-10-10T11:00:00Z", end: "2026-10-10T12:00:00Z" };
    expect(overlaps(a, b)).toBe(false);
    expect(overlaps(a, { start: "2026-10-10T10:59:00Z", end: "2026-10-10T12:00:00Z" })).toBe(true);
  });

  test("within is inclusive at both ends", () => {
    const w = { start: "2026-10-10T10:00:00Z", end: "2026-10-10T11:00:00Z" };
    expect(within("2026-10-10T10:00:00Z", w)).toBe(true);
    expect(within("2026-10-10T11:00:00Z", w)).toBe(true);
    expect(within("2026-10-10T11:00:01Z", w)).toBe(false);
  });

  test("property 1: formatting is machine-independent", () => {
    const start = Date.parse("2026-01-01T00:00:00Z");
    const end = Date.parse("2027-12-31T23:59:59Z");
    fc.assert(
      fc.property(fc.integer({ min: start, max: end }), (millis) => {
        const iso = new Date(millis).toISOString();
        return /^(1[0-2]|[1-9]):[0-5]\d (AM|PM)$/.test(fmtTime(iso, LA));
      }),
    );
  });
});
