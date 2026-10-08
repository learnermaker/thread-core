import { describe, test, expect } from "vitest";
import { fixedClock, fakeCalendar } from "../../src/testkit/index.ts";
import { pharmacy } from "../helpers.ts";

describe("fixedClock", () => {
  test("returns the set instant until set/advance", () => {
    const clk = fixedClock("2026-10-10T08:00:00-07:00");
    expect(clk.now()).toBe("2026-10-10T15:00:00.000Z");
    clk.set("2026-10-10T09:30:00-07:00");
    expect(clk.now()).toBe("2026-10-10T16:30:00.000Z");
    clk.advance(30);
    expect(clk.now()).toBe("2026-10-10T17:00:00.000Z");
  });
});

describe("fakeCalendar", () => {
  const block = { person_id: "maya", title: "Driving Leo", start: "2026-10-10T14:55:00.000Z", end: "2026-10-10T19:30:00.000Z", ref: "thr_leo_tourney:r_transport" };

  test("createBlock is idempotent per ref", async () => {
    const cal = fakeCalendar();
    const a = await cal.createBlock(block);
    const b = await cal.createBlock(block);
    expect(a.block_id).toBe("blk_1");
    expect(b.block_id).toBe(a.block_id);
    expect(cal.blocks.size).toBe(1);
  });

  test("moveBlock changes start and end", async () => {
    const cal = fakeCalendar();
    const { block_id } = await cal.createBlock(block);
    await cal.moveBlock({ person_id: "maya", block_id, start: "2026-10-10T15:00:00.000Z", end: "2026-10-10T19:30:00.000Z" });
    expect(cal.blocks.get(block_id)!.start).toBe("2026-10-10T15:00:00.000Z");
  });

  test("verifyBlock is true only for the exact block, false otherwise", async () => {
    const cal = fakeCalendar();
    const { block_id } = await cal.createBlock(block);
    expect(await cal.verifyBlock({ person_id: "maya", block_id, start: block.start, end: block.end })).toBe(true);
    expect(await cal.verifyBlock({ person_id: "maya", block_id, start: block.start, end: "2026-10-10T20:00:00.000Z" })).toBe(false);
    expect(await cal.verifyBlock({ person_id: "sam", block_id, start: block.start, end: block.end })).toBe(false);
  });

  test("failNext fails one call then recovers", async () => {
    const cal = fakeCalendar();
    cal.failNext = true;
    await expect(cal.createBlock(block)).rejects.toThrow("calendar unavailable");
    expect(cal.failNext).toBe(false);
    await expect(cal.createBlock(block)).resolves.toEqual({ block_id: "blk_1" });
  });
});

describe("fakeServiceProvider (pharmacy)", () => {
  const thread = {} as never;
  const responsibility = {} as never;

  test("quotes only while now is before the slot start", async () => {
    const svc = pharmacy();
    // slot starts 2026-10-10T10:00:00-07:00 = 17:00Z
    expect(await svc.query({ thread, responsibility, now: "2026-10-10T09:00:00-07:00" })).not.toBeNull();
    expect(await svc.query({ thread, responsibility, now: "2026-10-10T10:00:00-07:00" })).toBeNull();
  });

  test("order_ref is idempotent", async () => {
    const svc = pharmacy();
    const quote = (await svc.query({ thread, responsibility, now: "2026-10-10T09:00:00-07:00" }))!;
    const a = await svc.act({ order_ref: "thr_rosa_refill:r_pickup", quote, shared: [] });
    const b = await svc.act({ order_ref: "thr_rosa_refill:r_pickup", quote, shared: [] });
    expect(a.order_id).toBe("ord_1");
    expect(b.order_id).toBe(a.order_id);
    expect(svc.orders.size).toBe(1);
  });

  test("PLACED before delivered_at, DELIVERED once now >= delivered_at (10:42)", async () => {
    const svc = pharmacy();
    const quote = (await svc.query({ thread, responsibility, now: "2026-10-10T09:00:00-07:00" }))!;
    const { order_id } = await svc.act({ order_ref: "thr_rosa_refill:r_pickup", quote, shared: [] });
    expect(await svc.verify({ order_id, now: "2026-10-10T10:41:00-07:00" })).toEqual({ state: "PLACED" });
    expect(await svc.verify({ order_id, now: "2026-10-10T10:42:00-07:00" })).toEqual({ state: "DELIVERED", delivered_at: "2026-10-10T17:42:00.000Z" });
  });

  test("records every call in the calls log", async () => {
    const svc = pharmacy();
    const quote = (await svc.query({ thread, responsibility, now: "2026-10-10T09:00:00-07:00" }))!;
    const { order_id } = await svc.act({ order_ref: "thr_rosa_refill:r_pickup", quote, shared: [] });
    await svc.verify({ order_id, now: "2026-10-10T09:00:00-07:00" });
    expect(svc.calls).toEqual(["query", "act:thr_rosa_refill:r_pickup", `verify:${order_id}`]);
  });
});
