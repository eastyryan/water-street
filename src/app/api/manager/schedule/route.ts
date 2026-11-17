import { db } from '@/lib/db';
import { bad, day, int, route, str } from '@/lib/http';

function clock(v: unknown, what: string): string {
  if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw bad(`${what} is not a valid time.`);
  return v;
}

/**
 * All schedule changes, as POST { kind, ... }:
 *
 *   shift      { id?, staffId, day, start, end, position, note }   add, or edit when id is given
 *   delete     { id }                                              remove a shift
 *   publish    { from, to }                                        make a range visible to staff
 *   copy       { from, to }                                        copy the week starting `from` onto the week starting `to`
 *   clear      { from, to }                                        remove every shift in a range
 *   timeoff    { id, status }                                      approve / deny / reset a request
 *   timeoff-add { staffId, startDay, endDay, reason }              record approved time off directly
 *   timeoff-delete { id }
 *   event      { id?, day, title, note, type }                     add or edit a calendar entry
 *   event-delete { id }
 */
export const POST = route('manager', async ({ body, session }) => {
  const sql = db();

  switch (body.kind) {
    case 'shift': {
      const staffId = int(body.staffId, 'Employee');
      const d = day(body.day, 'Day');
      const start = clock(body.start, 'Start time');
      const end = clock(body.end, 'End time');
      if (end <= start) throw bad('The shift must end after it starts.');
      const id = body.id == null ? null : int(body.id, 'Shift');

      const [who] = await sql`select name, position from staff where id = ${staffId} and is_active`;
      if (!who) throw bad('Pick an active employee.');

      const [off] = await sql`select 1 from time_off
        where staff_id = ${staffId} and status = 'approved' and ${d}::date between start_day and end_day`;
      if (off) throw bad(`${who.name} has approved time off that day.`, 409);

      const [clash] = await sql`select 1 from schedule_shifts
        where staff_id = ${staffId} and day = ${d} and id is distinct from ${id}
          and start_time < ${end}::time and end_time > ${start}::time`;
      if (clash) throw bad(`${who.name} already has a shift that overlaps this one.`, 409);

      const position = body.position == null ? who.position : str(body.position, 40);
      if (id == null) {
        await sql`insert into schedule_shifts (staff_id, day, start_time, end_time, position, note)
                  values (${staffId}, ${d}, ${start}, ${end}, ${position}, ${str(body.note, 200)})`;
      } else {
        // Editing a published shift keeps it published: staff see the correction right away.
        const done = await sql`update schedule_shifts set staff_id = ${staffId}, day = ${d}, start_time = ${start},
          end_time = ${end}, position = ${position}, note = ${str(body.note, 200)} where id = ${id} returning id`;
        if (!done.length) throw bad('That shift no longer exists.', 404);
      }
      return { ok: true };
    }

    case 'delete':
      await sql`delete from schedule_shifts where id = ${int(body.id, 'Shift')}`;
      return { ok: true };

    case 'publish': {
      const rows = await sql`update schedule_shifts set published = true
        where day between ${day(body.from, 'Start date')}::date and ${day(body.to, 'End date')}::date and not published
        returning id`;
      return { published: rows.length };
    }

    case 'clear': {
      const rows = await sql`delete from schedule_shifts
        where day between ${day(body.from, 'Start date')}::date and ${day(body.to, 'End date')}::date returning id`;
      return { removed: rows.length };
    }

    case 'copy': {
      const from = day(body.from, 'Source week');
      const to = day(body.to, 'Target week');
      // Copies land as drafts. Anything that would break a rule is skipped, not forced:
      // people who left, approved time off, and shifts already on the target day.
      const rows = await sql`
        insert into schedule_shifts (staff_id, day, start_time, end_time, position, note)
        select s.staff_id, s.day + (${to}::date - ${from}::date), s.start_time, s.end_time, s.position, s.note
        from schedule_shifts s join staff st on st.id = s.staff_id and st.is_active
        where s.day between ${from}::date and ${from}::date + 6
          and not exists (select 1 from time_off t where t.staff_id = s.staff_id and t.status = 'approved'
                          and s.day + (${to}::date - ${from}::date) between t.start_day and t.end_day)
          and not exists (select 1 from schedule_shifts x where x.staff_id = s.staff_id
                          and x.day = s.day + (${to}::date - ${from}::date)
                          and x.start_time < s.end_time and x.end_time > s.start_time)
        returning id`;
      const [{ n }] = await sql`select count(*)::int as n from schedule_shifts where day between ${from}::date and ${from}::date + 6`;
      return { copied: rows.length, skipped: n - rows.length };
    }

    case 'timeoff': {
      const status = body.status === 'approved' ? 'approved' : body.status === 'denied' ? 'denied' : 'pending';
      const [row] = await sql`update time_off set status = ${status}, decided_by = ${status === 'pending' ? '' : session.name}
        where id = ${int(body.id, 'Request')} returning staff_id, start_day, end_day`;
      if (!row) throw bad('That request no longer exists.', 404);
      // Approving time off over existing shifts would leave the schedule lying, so say how many are affected.
      const [{ n }] = status === 'approved'
        ? await sql`select count(*)::int as n from schedule_shifts where staff_id = ${row.staff_id} and day between ${row.start_day} and ${row.end_day}`
        : [{ n: 0 }];
      return { ok: true, conflicts: n };
    }

    case 'timeoff-add': {
      const startDay = day(body.startDay, 'First day');
      const endDay = day(body.endDay || body.startDay, 'Last day');
      if (endDay < startDay) throw bad('The last day is before the first day.');
      await sql`insert into time_off (staff_id, start_day, end_day, reason, status, decided_by)
                values (${int(body.staffId, 'Employee')}, ${startDay}, ${endDay}, ${str(body.reason, 200)}, 'approved', ${session.name})`;
      return { ok: true };
    }

    case 'timeoff-delete':
      await sql`delete from time_off where id = ${int(body.id, 'Request')}`;
      return { ok: true };

    case 'event': {
      const title = str(body.title, 80);
      if (!title) throw bad('Give it a title.');
      const d = day(body.day, 'Day');
      const kind = body.type === 'closed' ? 'closed' : 'event';
      if (body.id == null) {
        await sql`insert into calendar_events (day, title, note, kind) values (${d}, ${title}, ${str(body.note, 300)}, ${kind})`;
      } else {
        await sql`update calendar_events set day = ${d}, title = ${title}, note = ${str(body.note, 300)}, kind = ${kind}
                  where id = ${int(body.id, 'Event')}`;
      }
      return { ok: true };
    }

    case 'event-delete':
      await sql`delete from calendar_events where id = ${int(body.id, 'Event')}`;
      return { ok: true };

    default:
      throw bad('Unknown action.');
  }
});
