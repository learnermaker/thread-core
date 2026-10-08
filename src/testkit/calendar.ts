import type { CalendarConnector } from "../ports.ts";

export interface FakeBlock { person_id: string; title: string; start: string; end: string; ref: string }
export interface FakeCalendar extends CalendarConnector { blocks: Map<string, FakeBlock>; calls: string[]; failNext: boolean }
export function fakeCalendar(): FakeCalendar {
  const blocks = new Map<string, FakeBlock>();
  const calls: string[] = [];
  let n = 0;
  const cal: FakeCalendar = {
    blocks, calls, failNext: false,
    async createBlock(i) {
      calls.push(`createBlock:${i.ref}`);
      if (cal.failNext) { cal.failNext = false; throw new Error("calendar unavailable"); }
      for (const [id, b] of blocks) if (b.ref === i.ref) return { block_id: id }; // idempotent per ref
      const block_id = `blk_${++n}`;
      blocks.set(block_id, { ...i });
      return { block_id };
    },
    async moveBlock(i) {
      calls.push(`moveBlock:${i.block_id}`);
      if (cal.failNext) { cal.failNext = false; throw new Error("calendar unavailable"); }
      const b = blocks.get(i.block_id);
      if (!b) throw new Error(`no block ${i.block_id}`);
      blocks.set(i.block_id, { ...b, start: i.start, end: i.end });
    },
    async verifyBlock(i) {
      calls.push(`verifyBlock:${i.block_id}`);
      const b = blocks.get(i.block_id);
      return !!b && b.person_id === i.person_id && b.start === i.start && b.end === i.end;
    },
  };
  return cal;
}
