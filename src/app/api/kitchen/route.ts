import { db } from '@/lib/db';
import { bad, int, route } from '@/lib/http';

/** Tickets for the kitchen screen: every order with sent-but-unfinished lines. */
export const GET = route('staff', async () => {
  const tickets = await db()`
    select o.id, o.order_type as "orderType", o.label, o.server_name as "serverName",
           min(i.sent_at) filter (where i.done_at is null) as "sentAt",
           json_agg(json_build_object(
             'id', i.id, 'name', i.name, 'qty', i.qty, 'modifiers', i.modifiers,
             'note', i.note, 'seat', i.seat, 'done', i.done_at is not null) order by i.seat, i.id) as items
    from orders o
    join order_items i on i.order_id = o.id and i.sent_at is not null
    where o.status <> 'void'
      and o.created_at > now() - interval '18 hours'
    group by o.id
    having bool_or(i.done_at is null)
    order by min(i.sent_at) filter (where i.done_at is null)`;
  return { tickets };
});

/** PATCH { itemId, done } toggles one line; PATCH { orderId } bumps the whole ticket. */
export const PATCH = route('staff', async ({ body }) => {
  const sql = db();
  if (body.orderId != null) {
    await sql`update order_items set done_at = now()
              where order_id = ${int(body.orderId, 'Order')} and sent_at is not null and done_at is null`;
  } else if (body.itemId != null) {
    await sql`update order_items set done_at = ${body.done ? sql`now()` : null}
              where id = ${int(body.itemId, 'Line')} and sent_at is not null`;
  } else {
    throw bad('Nothing to update.');
  }
  return { ok: true };
});
