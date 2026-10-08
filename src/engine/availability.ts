import type { HouseholdState, Window } from "../model/schemas.ts";
import { fmtDay, fmtRange, fmtTime, overlaps } from "../model/time.ts";
import type { TypeRegistry } from "../registry/types.ts";
import { makeEnv } from "./derive.ts";

export interface Conflict {
  code: "BUSY" | "COMMITMENT";
  text: string; // e.g. "driving Leo until 12:30 PM (accepted earlier)"
  busy_id?: string;
}

const ACTIVE_OWNERSHIP = new Set(["OWNED", "AT_RISK", "HANDOFF_PENDING", "ACCEPTED"]);

/**
 * Why `personId` can't cover `window`. Availability = what is actually on the person's calendar:
 *  1. busy intervals ingested from their calendar (reason never stored; only "busy"),
 *  2. calendar blocks THREAD itself created for exclusive responsibilities they own in OTHER live threads
 *     (THREAD reasoning about its own commitments: "driving Leo until 12:30 PM (accepted earlier)").
 * Planned-but-unscheduled ownership (no block) does not make anyone busy.
 * Same-thread responsibilities never conflict (Sam can drive AND bring the jersey).
 */
export function conflicts(state: HouseholdState, reg: TypeRegistry, personId: string, window: Window, exceptThreadId: string): Conflict[] {
  const env = makeEnv(state);
  const out: Conflict[] = [];
  for (const b of state.busy) {
    if (b.person === personId && overlaps(b, window)) {
      out.push({ code: "BUSY", text: `busy ${fmtDay(b.start, env.tz)} ${fmtRange(b, env.tz)}`, busy_id: b.id });
    }
  }
  for (const t of state.threads) {
    if (t.id === exceptThreadId || t.cancelled || t.status === "RESOLVED" || t.status === "EXPIRED") continue;
    for (const r of t.responsibilities) {
      const type = reg.get(r.type);
      if (!type?.exclusive || r.owner_kind !== "person" || r.owner !== personId || !ACTIVE_OWNERSHIP.has(r.status)) continue;
      if (!r.block || !overlaps(r.block, window)) continue;
      const accepted = r.status === "ACCEPTED" ? " (accepted earlier)" : "";
      out.push({ code: "COMMITMENT", text: `${type.busyText(t, r, env)} until ${fmtTime(r.block.end, env.tz)}${accepted}` });
    }
  }
  return out;
}
