import { db } from '@/lib/db';
import { bad, day, int, route, str } from '@/lib/http';
import { loadSchedule } from '@/lib/schedule';

/** The calendar for a date range, filtered to what the signed-in person may see. */
export const GET = route('staff', async ({ url, session }) => {
  const from = day(url.searchParams.get('from'), 'Start date');
  const to = day(url.searchParams.get('to'), 'End date');
  return loadSchedule(from, to, { id: session.id, manager: session.role === 'manager' });
});

/** Ask for time off: POST { startDay, endDay, reason }. Always for yourself. */
export const POST = route('staff', async ({ body, session }) => {
  const startDay = day(body.startDay, 'First day');
  const endDay = day(body.endDay || body.startDay, 'Last day');
  if (endDay < startDay) throw bad('The last day is before the first day.');
  await db()`insert into time_off (staff_id, start_day, end_day, reason)
             values (${session.id}, ${startDay}, ${endDay}, ${str(body.reason, 200)})`;
  return { ok: true };
});

/** Withdraw your own request while it is still pending: DELETE { id }. */
export const DELETE = route('staff', async ({ body, session }) => {
  const gone = await db()`delete from time_off
    where id = ${int(body.id, 'Request')} and staff_id = ${session.id} and status = 'pending' returning id`;
  if (!gone.length) throw bad('That request has already been answered. Ask a manager to change it.', 409);
  return { ok: true };
});
