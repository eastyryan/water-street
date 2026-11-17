// Creates the tables and, if the menu is empty, loads the printed menu.
// Usage: npm run db:setup   (reads DATABASE_URL from .env.local or the environment)
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { groups, categories } from '../db/menu.mjs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Put it in .env.local (see .env.example).');
  process.exit(1);
}
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const sql = postgres(url, { prepare: false, max: 1, ssl: local ? false : 'require', onnotice: () => {} });
const cents = (d) => Math.round(d * 100);

try {
  await sql.unsafe(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  console.log('Tables are in place.');

  const [{ n }] = await sql`select count(*)::int as n from menu_categories`;
  if (n > 0) {
    console.log('Menu already has data - left untouched.');
  } else {
    await sql.begin(async (tx) => {
      for (const [key, [name, min, max, options]] of Object.entries(groups)) {
        await tx`insert into modifier_groups (key, name, min_select, max_select) values (${key}, ${name}, ${min}, ${max})`;
        let i = 0;
        for (const [optName, cash, card] of options) {
          await tx`insert into modifiers (group_key, name, cash_cents, card_cents, sort)
                   values (${key}, ${optName}, ${cents(cash)}, ${cents(card)}, ${i++})`;
        }
      }
      let c = 0;
      let count = 0;
      for (const [catName, items] of categories) {
        const [cat] = await tx`insert into menu_categories (name, sort) values (${catName}, ${c++}) returning id`;
        let i = 0;
        for (const [name, cash, card, description, groupKeys] of items) {
          for (const g of groupKeys) if (!groups[g]) throw new Error(`Unknown modifier group "${g}" on ${name}`);
          await tx`insert into menu_items (category_id, name, description, cash_cents, card_cents, modifier_groups, sort)
                   values (${cat.id}, ${name}, ${description}, ${cents(cash)}, ${cents(card)}, ${groupKeys}, ${i++})`;
          count++;
        }
      }
      console.log(`Loaded ${count} menu items in ${categories.length} categories.`);
    });
  }
  console.log('Done. Start the app and open /manager to create the first manager PIN.');
} finally {
  await sql.end();
}
