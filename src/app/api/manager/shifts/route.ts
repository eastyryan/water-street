import { db, TZ } from '@/lib/db';
import { bad, day, int, route, str } from '@/lib/http';

/** datetime-local string ("2026-11-17T06:30") as typed by a manager, in cafe time. */
function localTime(v: unknown, what: string): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw bad(`${what} is not a valid time.`);
  return v;
}

/** Time cards whose clock-in falls between two cafe-calendar dates (inclusive). */
export const GET = route('manager', async ({ url }) => {
  const sql = db();
  const from = day(url.searchParams.get('from'), 'Start date');
  const to = day(url.searchParams.get('to'), 'End date');
  const shifts = await sql`
    select s.id, s.staff_id as "staffId", st.name, st.wage_cents as "wageCents",
           s.clock_in as "clockIn", s.clock_out as "clockOut",
           to_char(s.clock_in at time zone ${TZ}, 'YYYY-MM-DD"T"HH24:MI') as "clockInLocal",
           to_char(s.clock_out at time zone ${TZ}, 'YYYY-MM-DD"T"HH24:MI') as "clockOutLocal",
           s.break_minutes as "breakMinutes", s.status, s.note,
           case when s.clock_out is null then null else
             greatest(0, round(extract(epoch from (s.clock_out - s.clock_in)) / 60)::int - s.break_minutes) end as minutes,
           exists (select 1 from shift_audit a where a.shift_id = s.id and a.action in ('edit', 'create')) as edited
    from shifts s join staff st on st.id = s.staff_id
    where (s.clock_in at time zone ${TZ})::date between ${from}::date and ${to}::date
    order by st.name, s.clock_in`;
  return { shifts };
});

/**
 * POST { staffId, clockIn, clockOut, breakMinutes, reason }  add a missed shift
 * PATCH { id, clockIn?, clockOut?, breakMinutes?, reason }    correct a time card
 * PATCH { id, status }  or  PATCH { ids: [...], status }      approve / unapprove
 * DELETE { id, reason }
 *
 * Every change writes a shift_audit row with who, why, and before/after.
 */
export const POST = route('manager', async ({ body, session }) => {
  const sql = db();
  const staffId = int(body.staffId, 'Staff member');
  const clockIn = localTime(body.clockIn, 'Clock-in');
  const clockOut = localTime(body.clockOut, 'Clock-out');
  if (clockOut <= clockIn) throw bad('Clock-out must be after clock-in.');
  const breakMinutes = body.breakMinutes ? int(body.breakMinutes, 'Break') : 0;
  if (breakMinutes < 0) throw bad('Break cannot be negative.');
  const reason = str(body.reason, 300);
  if (!reason) throw bad('Add a short reason so the change is on record.');

  await sql.begin(async (tx) => {
    const [row] = await tx`
      insert into shifts (staff_id, clock_in, clock_out, break_minutes, note)
      values (${staffId}, ${clockIn}::timestamp at time zone ${TZ}, ${clockOut}::timestamp at time zone ${TZ},
              ${breakMinutes}, ${reason})
      returning *`;
    await tx`insert into shift_audit (shift_id, actor, action, reason, after)
             values (${row.id}, ${session.name}, 'create', ${reason}, ${tx.json(row)})`;
  });
  return { ok: true };
});

export const PATCH = route('manager', async ({ body, session }) => {
  const sql = db();

  if (body.status != null) {
    const status = body.status === 'approved' ? 'approved' : 'pending';
    const ids = Array.isArray(body.ids) ? body.ids.map((i) => int(i, 'Shift')) : [int(body.id, 'Shift')];
    if (!ids.length) return { ok: true };
    await sql.begin(async (tx) => {
      // An open shift has no hours yet, so it cannot be approved.
      const rows = await tx`
        update shifts set status = ${status}
        where id in ${tx(ids)} and status <> ${status} ${status === 'approved' ? tx`and clock_out is not null` : tx``}
        returning id`;
      for (const r of rows) {
        await tx`insert into shift_audit (shift_id, actor, action) values (${r.id}, ${session.name}, ${status === 'approved' ? 'approve' : 'unapprove'})`;
      }
    });
    return { ok: true };
  }

  const id = int(body.id, 'Shift');
  const reason = str(body.reason, 300);
  if (!reason) throw bad('Add a short reason so the change is on record.');
  const clockIn = localTime(body.clockIn, 'Clock-in');
  const clockOut = body.clockOut ? localTime(body.clockOut, 'Clock-out') : null;
  if (clockOut && clockOut <= clockIn) throw bad('Clock-out must be after clock-in.');
  const breakMinutes = body.breakMinutes ? int(body.breakMinutes, 'Break') : 0;
  if (breakMinutes < 0) throw bad('Break cannot be negative.');

  try {
    await sql.begin(async (tx) => {
      const [before] = await tx`select * from shifts where id = ${id} for update`;
      if (!before) throw bad('Time card not found.', 404);
      const [after] = await tx`
        update shifts set
          clock_in = ${clockIn}::timestamp at time zone ${TZ},
          clock_out = ${clockOut}::timestamp at time zone ${TZ},
          break_minutes = ${breakMinutes}, note = ${reason}
        where id = ${id} returning *`;
      await tx`insert into shift_audit (shift_id, actor, action, reason, before, after)
               values (${id}, ${session.name}, 'edit', ${reason}, ${tx.json(before)}, ${tx.json(after)})`;
    });
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw bad('That would leave this person with two open shifts.', 409);
    throw e;
  }
  return { ok: true };
});

export const DELETE = route('manager', async ({ body, session }) => {
  const sql = db();
  const id = int(body.id, 'Shift');
  const reason = str(body.reason, 300);
  if (!reason) throw bad('Add a short reason so the change is on record.');
  await sql.begin(async (tx) => {
    const [before] = await tx`delete from shifts where id = ${id} returning *`;
    if (!before) throw bad('Time card not found.', 404);
    await tx`insert into shift_audit (shift_id, actor, action, reason, before)
             values (${id}, ${session.name}, 'delete', ${reason}, ${tx.json(before)})`;
  });
  return { ok: true };
});
