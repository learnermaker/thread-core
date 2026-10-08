// Time helpers. Rule: store and compare instants as UTC ISO strings; format only with an explicit IANA zone.
// Never use Date.now(), new Date() without an argument, or the machine's local time zone.

export const MINUTE = 60_000;

/** Normalizes any ISO-8601 instant (with offset or Z) to canonical UTC: 2026-10-10T15:30:00.000Z */
export function toUtc(iso: string): string {
  return new Date(iso).toISOString();
}
export function ms(iso: string): number {
  return Date.parse(iso);
}
export function addMinutes(iso: string, minutes: number): string {
  return new Date(ms(iso) + minutes * MINUTE).toISOString();
}
export function minutesBetween(fromIso: string, toIso: string): number {
  return Math.round((ms(toIso) - ms(fromIso)) / MINUTE);
}
export function overlaps(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  return ms(a.start) < ms(b.end) && ms(b.start) < ms(a.end);
}
export function within(iso: string, w: { start: string; end: string }): boolean {
  return ms(iso) >= ms(w.start) && ms(iso) <= ms(w.end);
}

// formatToParts + manual assembly: ICU versions differ in the space before AM/PM (U+0020 vs U+202F),
// so never compare Intl.format() output directly.
function parts(iso: string, tz: string, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts }).formatToParts(new Date(iso))) {
    out[p.type] = p.value;
  }
  return out;
}
/** "7:55 AM" */
export function fmtTime(iso: string, tz: string): string {
  const p = parts(iso, tz, { hour: "numeric", minute: "2-digit", hour12: true });
  return `${p.hour}:${p.minute} ${p.dayPeriod}`;
}
/** "Saturday" */
export function fmtDay(iso: string, tz: string): string {
  return parts(iso, tz, { weekday: "long" }).weekday ?? "";
}
/** "Saturday 7:55 AM" */
export function fmtDayTime(iso: string, tz: string): string {
  return `${fmtDay(iso, tz)} ${fmtTime(iso, tz)}`;
}
/** "7:55 AM–12:30 PM" (en dash) */
export function fmtRange(w: { start: string; end: string }, tz: string): string {
  return `${fmtTime(w.start, tz)}–${fmtTime(w.end, tz)}`;
}
/** 499 -> "$4.99" */
export function fmtMoney(cents: number): string {
  return `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
