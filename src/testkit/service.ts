import type { ServiceProvider } from "../ports.ts";
import { ms, toUtc } from "../model/time.ts";

export interface FakeServiceConfig {
  id: string; name: string; handles: string[];
  quote: { slot: { start: string; end: string }; amount_cents: number; currency: "USD" };
  delivered_at: string;
}
export interface FakeService extends ServiceProvider { orders: Map<string, string>; calls: string[] }
export function fakeServiceProvider(cfg: FakeServiceConfig): FakeService {
  const orders = new Map<string, string>(); // order_id -> order_ref
  const calls: string[] = [];
  const slot = { start: toUtc(cfg.quote.slot.start), end: toUtc(cfg.quote.slot.end) };
  return {
    id: cfg.id, name: cfg.name, handles: cfg.handles, orders, calls,
    async query({ now }) {
      calls.push("query");
      return ms(now) < ms(slot.start)
        ? { provider_id: cfg.id, slot, amount_cents: cfg.quote.amount_cents, currency: "USD", summary: cfg.name }
        : null;
    },
    async act({ order_ref }) {
      calls.push(`act:${order_ref}`);
      for (const [id, ref] of orders) if (ref === order_ref) return { order_id: id }; // idempotent per order_ref
      const order_id = `ord_${orders.size + 1}`;
      orders.set(order_id, order_ref);
      return { order_id };
    },
    async verify({ order_id, now }) {
      calls.push(`verify:${order_id}`);
      if (!orders.has(order_id)) throw new Error(`unknown order ${order_id}`);
      return ms(now) >= ms(cfg.delivered_at) ? { state: "DELIVERED", delivered_at: toUtc(cfg.delivered_at) } : { state: "PLACED" };
    },
  };
}
