import type { Autonomy, Severity } from "../model/schemas.ts";

/**
 * What THREAD may do on its own (Master Spec §D5). TRANSACT is never automatic; RESOLVE is never an action.
 *  LOG               record an event only
 *  UPDATE_SILENTLY   keep derived data current (windows), no message
 *  SURFACE           message the thread creator
 *  ADJUST_PLAN       move an ALREADY-ACCEPTED, owner-consented calendar block, then verify; notify the owner
 *  PROPOSE_HANDOFF   return ranked candidates for the caller to choose ("Ask Sam?")
 *  SEND_HANDOFF      request a handoff to the top PERSON candidate automatically (services are only proposed)
 *  NOTIFY_CREATOR    message the creator that THREAD acted
 */
export type AutoAction = "LOG" | "UPDATE_SILENTLY" | "SURFACE" | "ADJUST_PLAN" | "PROPOSE_HANDOFF" | "SEND_HANDOFF" | "NOTIFY_CREATOR";

export const AUTONOMY_MATRIX: Record<Severity, Record<Autonomy, AutoAction[]>> = {
  NONE: { OBSERVE: ["LOG"], RECOMMEND: ["LOG"], COORDINATE: ["UPDATE_SILENTLY"], ACT: ["UPDATE_SILENTLY"] },
  LOW: { OBSERVE: ["LOG"], RECOMMEND: ["LOG"], COORDINATE: ["UPDATE_SILENTLY"], ACT: ["UPDATE_SILENTLY"] },
  MEDIUM: { OBSERVE: ["LOG"], RECOMMEND: ["SURFACE"], COORDINATE: ["ADJUST_PLAN"], ACT: ["ADJUST_PLAN"] },
  HIGH: { OBSERVE: ["SURFACE"], RECOMMEND: ["PROPOSE_HANDOFF"], COORDINATE: ["PROPOSE_HANDOFF"], ACT: ["SEND_HANDOFF"] },
  CRITICAL: {
    OBSERVE: ["SURFACE"], RECOMMEND: ["PROPOSE_HANDOFF"],
    COORDINATE: ["SEND_HANDOFF", "NOTIFY_CREATOR"], ACT: ["SEND_HANDOFF", "NOTIFY_CREATOR"],
  },
};

export function decide(severity: Severity, autonomy: Autonomy): AutoAction[] {
  return AUTONOMY_MATRIX[severity][autonomy];
}
