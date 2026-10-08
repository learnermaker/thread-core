// Ports: the ONLY way thread-core touches the outside world. Core itself does no network or file I/O.
import type { HouseholdState, Quote, Responsibility, SharedFact, Thread, ThreadEvent } from "./model/schemas.ts";

/** Injected clock. Returns an ISO-8601 instant. Tests and DEMO_MODE use fixedClock(). */
export interface Clock {
  now(): string;
}

/** Persistence. One versioned state document per household plus an append-only event log. */
export interface Store {
  load(householdId: string): Promise<{ state: HouseholdState; version: number } | undefined>;
  /** Atomically replaces the state and appends events. Throws StoreConflictError if version !== expectedVersion. */
  commit(householdId: string, state: HouseholdState, expectedVersion: number, events: ThreadEvent[]): Promise<number>;
  events(householdId: string): Promise<ThreadEvent[]>;
}

export class StoreConflictError extends Error {
  constructor() {
    super("store version conflict");
  }
}

/** Calendar connector: THREAD-created commitment blocks only (create, move, verify). Calls must be idempotent per `ref`. */
export interface CalendarConnector {
  createBlock(input: { person_id: string; title: string; start: string; end: string; ref: string }): Promise<{ block_id: string }>;
  moveBlock(input: { person_id: string; block_id: string; start: string; end: string }): Promise<void>;
  verifyBlock(input: { person_id: string; block_id: string; start: string; end: string }): Promise<boolean>;
}

/** A service that can take a responsibility (e.g. pharmacy delivery for PICKUP). act() is TRANSACT: only after confirm_action. */
export interface ServiceProvider {
  id: string;
  name: string;
  handles: string[]; // responsibility types, e.g. ["PICKUP"]
  query(input: { thread: Thread; responsibility: Responsibility; now: string }): Promise<Quote | null>;
  act(input: { order_ref: string; quote: Quote; shared: SharedFact[] }): Promise<{ order_id: string }>;
  verify(input: { order_id: string; now: string }): Promise<{ state: "PLACED" | "DELIVERED"; delivered_at?: string }>;
}
