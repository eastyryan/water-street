import { db, TZ } from '@/lib/db';
import { day, route } from '@/lib/http';

/**
 * Sales for a range of cafe-calendar dates, plus the live "right now" picture
 * (who is on the clock, open checks) for the manager's Today tab.
 */
export const GET = route('manager', async ({ url }) => {
  const sql = db();
  const [{ today }] = await sql`select to_char(now() at time zone ${TZ}, 'YYYY-MM-DD') as today`;
  const from = url.searchParams.get('from') ? day(url.searchParams.get('from'), 'Start date') : today;
  const to = url.searchParams.get('to') ? day(url.searchParams.get('to'), 'End date') : today;
  const inRange = sql`o.status = 'paid' and (o.closed_at at time zone ${TZ})::date between ${from}::date and ${to}::date`;

  const [[summary], byDay, topItems, onClock, [open], recent, scheduled] = await Promise.all([
    sql`select count(*)::int as orders,
               coalesce(sum(total_cents), 0)::int as total,
               coalesce(sum(subtotal_cents), 0)::int as subtotal,
               coalesce(sum(tax_cents), 0)::int as tax,
               coalesce(sum(tip_cents), 0)::int as tips,
               coalesce(sum(total_cents) filter (where payment_method = 'cash'), 0)::int as cash,
               coalesce(sum(total_cents) filter (where payment_method = 'card'), 0)::int as card,
               count(*) filter (where payment_method = 'cash')::int as "cashOrders",
               count(*) filter (where payment_method = 'card')::int as "cardOrders"
        from orders o where ${inRange}`,
    sql`select to_char((o.closed_at at time zone ${TZ})::date, 'YYYY-MM-DD') as day,
               count(*)::int as orders, sum(total_cents)::int as total
        from orders o where ${inRange} group by 1 order by 1`,
    sql`select i.name, sum(i.qty)::int as qty,
               sum(i.qty * case when o.payment_method = 'card' then i.card_cents else i.cash_cents end)::int as sales
        from order_items i join orders o on o.id = i.order_id
        where ${inRange} group by i.name order by qty desc, sales desc limit 15`,
    sql`select s.id, st.name, st.position, s.clock_in as "clockIn"
        from shifts s join staff st on st.id = s.staff_id
        where s.clock_out is null order by s.clock_in`,
    sql`select count(*)::int as n from orders where status = 'open'`,
    sql`select o.id, o.label, o.order_type as "orderType", o.server_name as "serverName", o.status,
               o.payment_method as "paymentMethod", o.total_cents as total, o.closed_at as "closedAt"
        from orders o
        where o.status <> 'open' and (o.closed_at at time zone ${TZ})::date between ${from}::date and ${to}::date
        order by o.closed_at desc limit 100`,
    // Today's schedule against the time clock: who is due, in, late, or done.
    sql`select s.id, st.name, s.position, to_char(s.start_time, 'HH24:MI') as start, to_char(s.end_time, 'HH24:MI') as "end",
               exists (select 1 from shifts w where w.staff_id = s.staff_id
                       and (w.clock_in at time zone ${TZ})::date = s.day) as "clockedIn",
               (now() at time zone ${TZ})::time > s.start_time + interval '5 minutes' as "pastStart"
        from schedule_shifts s join staff st on st.id = s.staff_id
        where s.day = ${today}::date order by s.start_time, st.name`,
  ]);
  return { from, to, today, summary, byDay, topItems, onClock, openOrders: open.n, recent, scheduled };
});
