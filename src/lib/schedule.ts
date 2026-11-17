import 'server-only';
import { db } from './db';

/**
 * Everything on the calendar between two dates (inclusive).
 *
 * Managers see drafts and every time-off request. Staff see the published
 * schedule for the whole team (so they know who they are working with),
 * approved time off, and their own requests whatever the status.
 */
export async function loadSchedule(from: string, to: string, viewer: { id: number; manager: boolean }) {
  const sql = db();
  const [shifts, timeOff, events, staff] = await Promise.all([
    sql`select s.id, s.staff_id as "staffId", st.name, to_char(s.day, 'YYYY-MM-DD') as day,
               to_char(s.start_time, 'HH24:MI') as start, to_char(s.end_time, 'HH24:MI') as "end",
               s.position, s.note, s.published,
               (extract(epoch from (s.end_time - s.start_time)) / 60)::int as minutes
        from schedule_shifts s join staff st on st.id = s.staff_id
        where s.day between ${from}::date and ${to}::date
          ${viewer.manager ? sql`` : sql`and s.published`}
        order by s.day, s.start_time, st.name`,
    sql`select t.id, t.staff_id as "staffId", st.name, to_char(t.start_day, 'YYYY-MM-DD') as "startDay",
               to_char(t.end_day, 'YYYY-MM-DD') as "endDay", t.reason, t.status, t.decided_by as "decidedBy"
        from time_off t join staff st on st.id = t.staff_id
        where (
            (t.end_day >= ${from}::date and t.start_day <= ${to}::date)
            -- pending requests always show, so one for next month is not missed
            or (t.status = 'pending' and t.end_day >= ${from}::date)
          )
          ${viewer.manager ? sql`` : sql`and (t.staff_id = ${viewer.id} or t.status = 'approved')`}
        order by t.start_day, st.name`,
    sql`select id, to_char(day, 'YYYY-MM-DD') as day, title, note, kind
        from calendar_events where day between ${from}::date and ${to}::date order by day, id`,
    sql`select id, name, position, wage_cents as "wageCents" from staff where is_active order by name`,
  ]);
  return {
    shifts,
    timeOff,
    events,
    // Wages are for the manager's labor-cost estimate only.
    staff: viewer.manager ? staff : staff.map((s) => ({ id: s.id, name: s.name, position: s.position, wageCents: null })),
  };
}
