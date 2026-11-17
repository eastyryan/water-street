import { db } from '@/lib/db';
import { getSettings } from '@/lib/data';
import { bad, int, route, str } from '@/lib/http';
import { parseMoney } from '@/lib/money';

/** Card price defaults to cash price plus the surcharge when left blank. */
async function prices(body: Record<string, unknown>) {
  const cash = parseMoney(body.cash);
  if (cash == null) throw bad('Enter a cash price.');
  let card = body.card === '' || body.card == null ? null : parseMoney(body.card);
  if (card == null) {
    const { cardSurchargePct } = await getSettings();
    card = Math.round(cash * (1 + cardSurchargePct / 100));
  }
  return { cash, card };
}

/** Add an item: POST { categoryId, name, description, cash, card }. */
export const POST = route('manager', async ({ body }) => {
  const name = str(body.name, 80);
  if (!name) throw bad('Enter a name.');
  const { cash, card } = await prices(body);
  await db()`
    insert into menu_items (category_id, name, description, cash_cents, card_cents, sort)
    values (${int(body.categoryId, 'Category')}, ${name}, ${str(body.description, 300)}, ${cash}, ${card}, 1000)`;
  return { ok: true };
});

/**
 * PATCH { id, available }                         86 / un-86 (any staff member can do this)
 * PATCH { id, active }                            remove from / restore to the menu
 * PATCH { id, name, description, cash, card }     edit
 * PATCH { taxPct, cardSurchargePct, tableCount }  settings
 */
export const PATCH = route('staff', async ({ body, session }) => {
  const sql = db();
  const onlyAvailability = body.id != null && typeof body.available === 'boolean' && Object.keys(body).length === 2;
  if (!onlyAvailability && session.role !== 'manager') throw bad('Manager access only.', 403);

  if (body.id == null) {
    for (const [key, field] of [['tax_pct', 'taxPct'], ['card_surcharge_pct', 'cardSurchargePct']] as const) {
      if (body[field] == null) continue;
      const n = Number(body[field]);
      if (!Number.isFinite(n) || n < 0 || n > 25) throw bad('Percent must be between 0 and 25.');
      await sql`insert into settings (key, value) values (${key}, ${String(n)})
                on conflict (key) do update set value = excluded.value`;
    }
    if (body.tableCount != null) {
      const n = Number(body.tableCount);
      if (!Number.isInteger(n) || n < 0 || n > 60) throw bad('Tables must be a whole number up to 60.');
      await sql`insert into settings (key, value) values ('table_count', ${String(n)})
                on conflict (key) do update set value = excluded.value`;
    }
    return { ok: true };
  }

  const id = int(body.id, 'Item');
  if (typeof body.available === 'boolean') await sql`update menu_items set is_available = ${body.available} where id = ${id}`;
  if (typeof body.active === 'boolean') await sql`update menu_items set is_active = ${body.active} where id = ${id}`;
  if (body.name != null) {
    const name = str(body.name, 80);
    if (!name) throw bad('Enter a name.');
    const { cash, card } = await prices(body);
    await sql`update menu_items set name = ${name}, description = ${str(body.description, 300)},
              cash_cents = ${cash}, card_cents = ${card} where id = ${id}`;
  }
  return { ok: true };
});
