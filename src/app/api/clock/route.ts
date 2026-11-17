import { db, TZ } from '@/lib/db';
import { bad, route } from '@/lib/http';

/** Minutes worked, net of unpaid break. Open shifts count up to now. */
const WORKED_MIN = `greatest(0, extract(epoch from (coalesce(clock_out, now()) - clock_in)) / 60 - break_minutes)`;

async function status(staffId: number) {
  const sql = db();
  const [open] = await sql`select id, clock_in from shifts where staff_id = ${staffId} and clock_out is null`;
  const recent = await sql`
    select id, clock_in, clock_out, break_minutes, status,
           round((${sql.unsafe(WORKED_MIN)})::numeric)::int as minutes
    from shifts where staff_id = ${staffId}
    order by clock_in desc limit 8`;
  // This week = Monday through Sunday on the cafe's calendar.
  const [{ week }] = await sql`
    select coalesce(round(sum(${sql.unsafe(WORKED_MIN)})::numeric), 0)::int as week
    from shifts
    where staff_id = ${staffId}
      and clock_in >= date_trunc('week', now() at time zone ${TZ}) at time zone ${TZ}`;
  const scheduled = await sql`
    select to_char(start_time, 'HH24:MI') as start, to_char(end_time, 'HH24:MI') as "end", position
    from schedule_shifts
    where staff_id = ${staffId} and published and day = (now() at time zone ${TZ})::date
    order by start_time`;
  return { open: open ?? null, recent, weekMinutes: week, scheduled };
}

export const GET = route('staff', ({ session }) => status(session.id));

/**
 * POST { action: 'in' | 'out' }
 *
 * Who is punching comes from the signed cookie and the time is the server's
 * clock, so neither can be changed from the tablet or by editing a request.
 */
export const POST = route('staff', async ({ session, body }) => {
  const sql = db();
  if (body.action === 'in') {
    try {
      await sql`insert into shifts (staff_id) values (${session.id})`;
    } catch (e) {
      // 23505 = the one-open-shift-per-person index doing its job.
      if ((e as { code?: string }).code === '23505') throw bad('You are already clocked in.', 409);
      throw e;
    }
  } else if (body.action === 'out') {
    const done = await sql`
      update shifts set clock_out = now()
      where staff_id = ${session.id} and clock_out is null
      returning id`;
    if (!done.length) throw bad('You are not clocked in.', 409);
  } else {
    throw bad('Unknown action.');
  }
  return status(session.id);
});
