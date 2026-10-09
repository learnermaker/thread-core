import type { Clock } from "../ports.ts";
import { addMinutes, toUtc } from "../model/time.ts";

export interface TestClock extends Clock { set(iso: string): void; advance(minutes: number): void }
export function fixedClock(iso: string): TestClock {
  let now = toUtc(iso);
  return { now: () => now, set: (i) => { now = toUtc(i); }, advance: (m) => { now = addMinutes(now, m); } };
}
