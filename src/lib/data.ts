import 'server-only';
import bcrypt from 'bcryptjs';
import { db } from './db';
import type { Order } from './money';

export const hashPin = (pin: string) => bcrypt.hash(pin, 10);
export const checkPin = (pin: string, hash: string) => bcrypt.compare(pin, hash);

export async function getSettings(): Promise<{ taxPct: number; cardSurchargePct: number }> {
  const rows = await db()`select key, value from settings`;
  const m = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
  return { taxPct: m.tax_pct ?? 7.5, cardSurchargePct: m.card_surcharge_pct ?? 4 };
}

/** Orders with their line items, shaped for the browser. */
export async function loadOrders(opts: { id?: number; status?: 'open' } = {}): Promise<Order[]> {
  const sql = db();
  const rows = await sql`
    select o.id, o.order_type, o.label, o.server_name, o.status, o.payment_method,
           o.subtotal_cents, o.tax_cents, o.total_cents, o.created_at, o.closed_at,
           coalesce(
             (select json_agg(json_build_object(
                'id', i.id, 'menuItemId', i.menu_item_id, 'name', i.name, 'qty', i.qty,
                'cash', i.cash_cents, 'card', i.card_cents, 'modifiers', i.modifiers,
                'note', i.note, 'sentAt', i.sent_at, 'doneAt', i.done_at) order by i.id)
              from order_items i where i.order_id = o.id), '[]'::json) as items
    from orders o
    where true
      ${opts.id != null ? sql`and o.id = ${opts.id}` : sql``}
      ${opts.status ? sql`and o.status = ${opts.status}` : sql``}
    order by o.created_at`;
  return rows.map((r) => ({
    id: r.id,
    orderType: r.order_type,
    label: r.label,
    serverName: r.server_name,
    status: r.status,
    paymentMethod: r.payment_method,
    subtotal: r.subtotal_cents,
    tax: r.tax_cents,
    total: r.total_cents,
    createdAt: r.created_at,
    closedAt: r.closed_at,
    items: r.items,
  }));
}
