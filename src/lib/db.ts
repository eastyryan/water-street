import 'server-only';
import postgres from 'postgres';

/**
 * One shared Postgres connection pool. SERVER ONLY - the `server-only` import
 * makes the build fail if this is ever pulled into browser code.
 *
 * Created lazily so `next build` works without a database configured.
 * `prepare: false` is required by Supabase's transaction pooler.
 */
export class NoDatabaseError extends Error {
  constructor() {
    super('DATABASE_URL is not set.');
  }
}

type Sql = ReturnType<typeof postgres>;
const g = globalThis as unknown as { __wscSql?: Sql };

export function db(): Sql {
  if (!g.__wscSql) {
    // POSTGRES_URL is what some Vercel database integrations name it.
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new NoDatabaseError();
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    g.__wscSql = postgres(url, {
      prepare: false,
      max: 5,
      idle_timeout: 20,
      ssl: local ? false : 'require',
      onnotice: () => {},
    });
  }
  return g.__wscSql;
}

/** The cafe's wall-clock time zone. Day boundaries and time-card edits use it. */
export const TZ = 'America/New_York';
