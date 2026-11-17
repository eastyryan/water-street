// Loads the printed menu into an empty database. Shared by the app's
// first-run setup and by `npm run db:setup`.
import { groups, categories } from './menu.mjs';

const cents = (d) => Math.round(d * 100);

/** @param tx a postgres.js client or transaction. Returns the number of items loaded (0 if the menu already has data). */
export async function seedMenu(tx) {
  const [{ n }] = await tx`select count(*)::int as n from menu_categories`;
  if (n > 0) return 0;

  for (const [key, [name, min, max, options]] of Object.entries(groups)) {
    await tx`insert into modifier_groups (key, name, min_select, max_select) values (${key}, ${name}, ${min}, ${max})`;
    const rows = options.map(([optName, cash, card], i) => ({ group_key: key, name: optName, cash_cents: cents(cash), card_cents: cents(card), sort: i }));
    await tx`insert into modifiers ${tx(rows)}`;
  }
  let count = 0;
  let c = 0;
  for (const [catName, items] of categories) {
    const [cat] = await tx`insert into menu_categories (name, sort) values (${catName}, ${c++}) returning id`;
    const rows = items.map(([name, cash, card, description, groupKeys], i) => {
      for (const g of groupKeys) if (!groups[g]) throw new Error(`Unknown modifier group "${g}" on ${name}`);
      return { category_id: cat.id, name, description, cash_cents: cents(cash), card_cents: cents(card), modifier_groups: groupKeys, sort: i };
    });
    await tx`insert into menu_items ${tx(rows)}`;
    count += rows.length;
  }
  return count;
}
