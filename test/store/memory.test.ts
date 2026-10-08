import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { memoryStore } from "../../src/store/memory.ts";
import { StoreConflictError } from "../../src/ports.ts";
import type { ThreadEvent } from "../../src/model/schemas.ts";
import { seedState } from "../helpers.ts";

const hhId = "hh_rivera";
const evt = (seq: number): ThreadEvent => ({
  seq, at: "2026-10-08T19:30:00.000Z", type: "THREAD_CREATED", actor: "maya", thread_id: "thr_leo_tourney", data: {},
});

describe("memory store", () => {
  test("commit saves, appends events and bumps the version", async () => {
    const store = memoryStore();
    const v = await store.commit(hhId, seedState(), 0, [evt(1)]);
    expect(v).toBe(1);
    const loaded = await store.load(hhId);
    expect(loaded!.version).toBe(1);
    expect(loaded!.state.threads).toHaveLength(3);
    const v2 = await store.commit(hhId, seedState(), 1, [evt(2)]);
    expect(v2).toBe(2);
    expect((await store.events(hhId)).map((e) => e.seq)).toEqual([1, 2]);
  });

  test("a stale version throws StoreConflictError and changes nothing", async () => {
    const store = memoryStore();
    await store.commit(hhId, seedState(), 0, [evt(1)]);
    await expect(store.commit(hhId, seedState(), 0, [evt(2)])).rejects.toBeInstanceOf(StoreConflictError);
    expect((await store.load(hhId))!.version).toBe(1);
    expect(await store.events(hhId)).toHaveLength(1);
  });

  test("property 3: store isolation — mutating a loaded object never changes a later load", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), async (title) => {
        const store = memoryStore();
        const s = seedState();
        s.threads[0]!.title = title;
        await store.commit(hhId, s, 0, [evt(1)]);
        const first = await store.load(hhId);
        first!.state.threads[0]!.title = "MUTATED";
        first!.state.threads.pop();
        const second = await store.load(hhId);
        return second!.state.threads.length === 3 && second!.state.threads[0]!.title === title;
      }),
    );
  });
});
