// Creates the tables and, if the menu is empty, loads the printed menu.
// The app also does this by itself on first run, so this script is optional.
// Usage: npm run db:setup   (reads DATABASE_URL from .env.local or the environment)
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { seedMenu } from '../db/seed.mjs';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Put it in .env.local (see .env.example).');
  process.exit(1);
}
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const sql = postgres(url, { prepare: false, max: 1, ssl: local ? false : 'require', onnotice: () => {} });

try {
  await sql.unsafe(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  console.log('Tables are in place.');
  const count = await sql.begin((tx) => seedMenu(tx));
  console.log(count ? `Loaded ${count} menu items.` : 'Menu already has data - left untouched.');
  console.log('Done. Start the app and open /manager to create the first manager PIN.');
} finally {
  await sql.end();
}
