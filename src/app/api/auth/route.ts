import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkPin, hashPin } from '@/lib/data';
import { bad, int, pin, route, str } from '@/lib/http';
import { SESSION_COOKIE, cookieOptions, createToken } from '@/lib/session';

const MAX_FAILURES = 5;
const WINDOW_MINUTES = 5;

/**
 * POST { staffId, pin }                -> sign in
 * POST { setup: true, name, pin }      -> create the very first manager (only while none exists)
 * DELETE                               -> sign out
 */
export const POST = route('public', async ({ body }) => {
  const sql = db();

  if (body.setup) {
    const name = str(body.name, 60);
    if (!name) throw bad('Enter your name.');
    const hash = await hashPin(pin(body.pin));
    // The "no manager yet" check and the insert are one statement, so two
    // people racing through setup cannot both become the first manager.
    const [row] = await sql`
      insert into staff (name, role, position, pin_hash)
      select ${name}, 'manager', 'Owner', ${hash}
      where not exists (select 1 from staff where role = 'manager' and is_active)
      returning id, name, role`;
    if (!row) throw bad('Setup is already done. Sign in with a manager PIN.', 409);
    return signedIn(row.id, row.name, row.role);
  }

  const staffId = int(body.staffId, 'Name');
  const given = pin(body.pin);

  const [who] = await sql`select id, name, role, pin_hash from staff where id = ${staffId} and is_active`;
  if (!who) throw bad('Pick your name from the list.', 401);

  // A 4-digit PIN has only 10,000 combinations, so guesses are limited per person.
  const [{ n }] = await sql`
    select count(*)::int as n from login_attempts
    where staff_id = ${staffId} and created_at > now() - make_interval(mins => ${WINDOW_MINUTES})`;
  if (n >= MAX_FAILURES) throw bad('Too many wrong PINs. Wait a few minutes or ask a manager.', 429);

  if (!(await checkPin(given, who.pin_hash))) {
    await sql`insert into login_attempts (staff_id) values (${staffId})`;
    throw bad('Incorrect PIN', 401);
  }
  await sql`delete from login_attempts where staff_id = ${staffId}`;
  return signedIn(who.id, who.name, who.role);
});

export const DELETE = route('public', async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', cookieOptions(0));
  return res;
});

function signedIn(id: number, name: string, role: 'staff' | 'manager') {
  const { token, maxAge } = createToken({ id, name, role });
  const res = NextResponse.json({ ok: true, session: { id, name, role } });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(maxAge));
  return res;
}
