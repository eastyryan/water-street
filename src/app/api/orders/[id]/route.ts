import { db } from '@/lib/db';
import { getSettings, loadOrders } from '@/lib/data';
import { bad, int, route, str } from '@/lib/http';
import { parseMoney, totals, type Mod } from '@/lib/money';

export const GET = route('staff', async ({ params }) => {
  const [order] = await loadOrders({ id: int(params.id, 'Order') });
  if (!order) throw bad('Order not found.', 404);
  return { order };
});

/**
 * Every change to a check goes through here as { action, ... }:
 *
 *   add     { menuItemId, modifierIds, qty, note }   prices are looked up on the server
 *   custom  { name, price, note }                    open item, e.g. a daily special
 *   qty     { itemId, qty }                          qty 0 removes the line
 *   note    { itemId, note }                         note for the kitchen
 *   send                                             sends unsent lines to the kitchen
 *   split   { itemIds }                              move lines onto a new check for the same table
 *   pay     { method: 'cash' | 'card', tip? }        tip is recorded separately from sales
 *   void | reopen                                    reopen is manager-only
 */
export const PATCH = route('staff', async ({ params, body, session }) => {
  const sql = db();
  const id = int(params.id, 'Order');
  const [order] = await sql`select id, status from orders where id = ${id}`;
  if (!order) throw bad('Order not found.', 404);

  const action = body.action;
  if (action === 'reopen') {
    if (session.role !== 'manager') throw bad('Only a manager can reopen a closed check.', 403);
    await sql`update orders set status = 'open', payment_method = null, subtotal_cents = null,
              tax_cents = null, total_cents = null, tip_cents = 0, closed_at = null where id = ${id}`;
    return { order: (await loadOrders({ id }))[0] };
  }
  if (order.status !== 'open') throw bad('This check is already closed.', 409);

  if (action === 'add') {
    const menuItemId = int(body.menuItemId, 'Item');
    const [item] = await sql`
      select id, name, cash_cents, card_cents, modifier_groups, is_available
      from menu_items where id = ${menuItemId} and is_active`;
    if (!item) throw bad('That item is no longer on the menu.');
    if (!item.is_available) throw bad(`${item.name} is 86'd right now.`);

    const ids = Array.isArray(body.modifierIds) ? [...new Set(body.modifierIds.map((m) => int(m, 'Option')))] : [];
    const groupKeys: string[] = item.modifier_groups;
    const chosen = ids.length
      ? await sql`select id, group_key, name, cash_cents, card_cents from modifiers
                  where id in ${sql(ids)} and group_key in ${sql(groupKeys.length ? groupKeys : [''])}
                  order by sort, id`
      : [];
    if (chosen.length !== ids.length) throw bad('One of those options does not apply to this item.');

    // Enforce "choose 1" / "choose 2" rules here too, not only in the UI.
    const groups = groupKeys.length
      ? await sql`select key, name, min_select, max_select from modifier_groups where key in ${sql(groupKeys)}`
      : [];
    for (const g of groups) {
      const n = chosen.filter((c) => c.group_key === g.key).length;
      if (n < g.min_select) throw bad(`Choose ${g.name.toLowerCase()} for ${item.name}.`);
      if (n > g.max_select) throw bad(`Too many choices for ${g.name.toLowerCase()}.`);
    }

    const modifiers: Mod[] = chosen.map((c) => ({ name: c.name, cash: c.cash_cents, card: c.card_cents }));
    const qty = body.qty == null ? 1 : int(body.qty, 'Quantity');
    if (qty < 1 || qty > 50) throw bad('Quantity must be between 1 and 50.');
    await sql`
      insert into order_items (order_id, menu_item_id, name, qty, cash_cents, card_cents, modifiers, note)
      values (${id}, ${item.id}, ${item.name}, ${qty},
              ${item.cash_cents + modifiers.reduce((s, m) => s + m.cash, 0)},
              ${item.card_cents + modifiers.reduce((s, m) => s + m.card, 0)},
              ${sql.json(modifiers)}, ${str(body.note, 200)})`;
  } else if (action === 'custom') {
    const name = str(body.name, 80);
    const cash = parseMoney(body.price);
    if (!name || cash == null) throw bad('Enter a name and a price.');
    const { cardSurchargePct } = await getSettings();
    await sql`
      insert into order_items (order_id, name, cash_cents, card_cents, note)
      values (${id}, ${name}, ${cash}, ${Math.round(cash * (1 + cardSurchargePct / 100))}, ${str(body.note, 200)})`;
  } else if (action === 'qty') {
    const itemId = int(body.itemId, 'Line');
    const qty = int(body.qty, 'Quantity');
    if (qty < 0 || qty > 50) throw bad('Quantity must be between 0 and 50.');
    if (qty === 0) await sql`delete from order_items where id = ${itemId} and order_id = ${id}`;
    else await sql`update order_items set qty = ${qty} where id = ${itemId} and order_id = ${id}`;
  } else if (action === 'note') {
    await sql`update order_items set note = ${str(body.note, 200)} where id = ${int(body.itemId, 'Line')} and order_id = ${id}`;
  } else if (action === 'split') {
    const ids = Array.isArray(body.itemIds) ? [...new Set(body.itemIds.map((i) => int(i, 'Line')))] : [];
    if (!ids.length) throw bad('Choose what to move to the new check.');
    await sql.begin(async (tx) => {
      const [{ n, total }] = await tx`select count(*) filter (where id in ${tx(ids)})::int as n, count(*)::int as total
                                      from order_items where order_id = ${id}`;
      if (n !== ids.length) throw bad('Some of those lines are not on this check.');
      if (n === total) throw bad('Leave at least one item on this check.');
      const [fresh] = await tx`
        insert into orders (order_type, label, server_id, server_name)
        select order_type, label, server_id, server_name from orders where id = ${id} returning id`;
      // Lines keep their kitchen status, so nothing is cooked twice.
      await tx`update order_items set order_id = ${fresh.id} where id in ${tx(ids)}`;
    });
  } else if (action === 'send') {
    const sent = await sql`update order_items set sent_at = now() where order_id = ${id} and sent_at is null returning id`;
    if (!sent.length) throw bad('Nothing new to send.');
  } else if (action === 'pay') {
    const method = body.method === 'card' ? 'card' : body.method === 'cash' ? 'cash' : null;
    if (!method) throw bad('Choose cash or card.');
    const items = await sql`select qty, cash_cents as cash, card_cents as card from order_items where order_id = ${id}`;
    if (!items.length) throw bad('This check is empty.');
    const { taxPct } = await getSettings();
    const t = totals(items as unknown as { qty: number; cash: number; card: number }[], taxPct)[method];
    const tip = body.tip === '' || body.tip == null ? 0 : parseMoney(body.tip);
    if (tip == null) throw bad('Tip amount is not valid.');
    await sql.begin(async (tx) => {
      // Anything never sent goes to the kitchen now so it cannot be forgotten.
      await tx`update order_items set sent_at = now() where order_id = ${id} and sent_at is null`;
      await tx`update orders set status = 'paid', payment_method = ${method}, subtotal_cents = ${t.subtotal},
               tax_cents = ${t.tax}, total_cents = ${t.total}, tip_cents = ${tip}, closed_at = now() where id = ${id}`;
    });
  } else if (action === 'void') {
    await sql`update orders set status = 'void', closed_at = now() where id = ${id}`;
  } else {
    throw bad('Unknown action.');
  }
  return { order: (await loadOrders({ id }))[0] };
});
