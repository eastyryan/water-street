import { db } from '@/lib/db';
import { hashPin } from '@/lib/data';
import { bad, int, pin, route, str } from '@/lib/http';
import { parseMoney } from '@/lib/money';

const COLUMNS = `id, name, role, position, phone, wage_cents as "wageCents", is_active as active, created_at as "createdAt"`;

export const GET = route('manager', async () => {
  const sql = db();
  return { staff: await sql`select ${sql.unsafe(COLUMNS)} from staff order by is_active desc, name` };
});

/** Add someone: POST { name, pin, role, position, phone, wage }. */
export const POST = route('manager', async ({ body }) => {
  const sql = db();
  const name = str(body.name, 60);
  if (!name) throw bad('Enter a name.');
  const wage = body.wage === '' || body.wage == null ? null : parseMoney(body.wage);
  if (body.wage && wage == null) throw bad('Hourly wage is not valid.');
  try {
    await sql`
      insert into staff (name, role, position, phone, wage_cents, pin_hash)
      values (${name}, ${body.role === 'manager' ? 'manager' : 'staff'}, ${str(body.position, 40)},
              ${str(body.phone, 30)}, ${wage}, ${await hashPin(pin(body.pin))})`;
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw bad(`There is already someone named ${name}.`, 409);
    throw e;
  }
  return { ok: true };
});

/**
 * Edit someone: PATCH { id, name?, role?, position?, phone?, wage?, active?, pin? }.
 * People are deactivated, never deleted, so their time cards stay intact.
 */
export const PATCH = route('manager', async ({ body }) => {
  const sql = db();
  const id = int(body.id, 'Staff member');
  const [cur] = await sql`select * from staff where id = ${id}`;
  if (!cur) throw bad('Staff member not found.', 404);

  const name = body.name == null ? cur.name : str(body.name, 60);
  if (!name) throw bad('Enter a name.');
  const role = body.role == null ? cur.role : body.role === 'manager' ? 'manager' : 'staff';
  const active = body.active == null ? cur.is_active : !!body.active;
  let wage = cur.wage_cents;
  if (body.wage !== undefined) {
    wage = body.wage === '' || body.wage == null ? null : parseMoney(body.wage);
    if (body.wage && wage == null) throw bad('Hourly wage is not valid.');
  }

  // Never lock everyone out of the manager screens.
  if (cur.role === 'manager' && cur.is_active && (role !== 'manager' || !active)) {
    const [{ n }] = await sql`select count(*)::int as n from staff where role = 'manager' and is_active and id <> ${id}`;
    if (n === 0) throw bad('This is the only manager. Make someone else a manager first.', 409);
  }

  try {
    await sql`
      update staff set name = ${name}, role = ${role}, is_active = ${active}, wage_cents = ${wage},
        position = ${body.position == null ? cur.position : str(body.position, 40)},
        phone = ${body.phone == null ? cur.phone : str(body.phone, 30)},
        pin_hash = ${body.pin ? await hashPin(pin(body.pin)) : cur.pin_hash}
      where id = ${id}`;
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw bad(`There is already someone named ${name}.`, 409);
    throw e;
  }
  if (body.pin) await sql`delete from login_attempts where staff_id = ${id}`;
  return { ok: true };
});
