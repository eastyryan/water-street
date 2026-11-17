import 'server-only';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { seedMenu } from '../../db/seed.mjs';
import { db } from './db';

/**
 * First-run setup, done by the app itself so going live needs nothing but a
 * connected database: create the tables, load the menu, and make a signing
 * secret for login cookies. Bump SCHEMA_VERSION whenever db/schema.sql changes.
 */
const SCHEMA_VERSION = '3';

const g = globalThis as unknown as { __wscReady?: Promise<string> };

/** Resolves to the cookie-signing secret once the database is ready. */
export function ensureReady(): Promise<string> {
  if (!g.__wscReady) {
    g.__wscReady = init().catch((e) => {
      g.__wscReady = undefined; // let the next request try again
      throw e;
    });
  }
  return g.__wscReady;
}

async function init(): Promise<string> {
  const sql = db();
  const read = async () => {
    const [{ t }] = await sql`select to_regclass('public.settings') as t`;
    if (!t) return {};
    const rows = await sql`select key, value from settings where key in ('schema_version', 'session_secret')`;
    return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string>;
  };

  let s = await read();
  if (s.schema_version !== SCHEMA_VERSION || !s.session_secret) {
    const schema = await readFile(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8');
    await sql.begin(async (tx) => {
      // Two servers starting at once must not both run setup.
      await tx`select pg_advisory_xact_lock(4671025)`;
      await tx.unsafe(schema);
      await seedMenu(tx);
      await tx`insert into settings (key, value) values ('session_secret', ${randomBytes(48).toString('base64')})
               on conflict (key) do nothing`;
      await tx`insert into settings (key, value) values ('schema_version', ${SCHEMA_VERSION})
               on conflict (key) do update set value = excluded.value`;
    });
    s = await read();
  }
  // An explicit SESSION_SECRET still wins, for anyone who prefers to manage it themselves.
  const env = process.env.SESSION_SECRET;
  return env && env.length >= 32 ? env : s.session_secret;
}
