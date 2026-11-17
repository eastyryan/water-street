import { db } from '@/lib/db';
import { loadOrders } from '@/lib/data';
import { bad, route, str } from '@/lib/http';

/** Open checks, oldest first. */
export const GET = route('staff', async () => ({ orders: await loadOrders({ status: 'open' }) }));

/** Start a new check: POST { orderType, label }. */
export const POST = route('staff', async ({ session, body }) => {
  const orderType = body.orderType === 'takeout' ? 'takeout' : 'dine_in';
  const label = str(body.label, 40);
  if (!label) throw bad(orderType === 'takeout' ? 'Enter a name for the order.' : 'Enter a table.');
  const [row] = await db()`
    insert into orders (order_type, label, server_id, server_name)
    values (${orderType}, ${label}, ${session.id}, ${session.name})
    returning id`;
  return { order: (await loadOrders({ id: row.id }))[0] };
});
