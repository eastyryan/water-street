import 'server-only';
import postgres from 'postgres';

/**
 * One shared Postgres connection pool. SERVER ONLY - the `server-only` import
 * makes the build fail if this is ever pulled into browser code.
 *
 * Created lazily so `next build` works without a database configured.
 * `prepare: false` is required by Supabase's transaction pooler.
 */
type Sql = ReturnType<typeof postgres>;
const g = globalThis as unknown as { __wscSql?: Sql };

export function db(): Sql {
  if (!g.__wscSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set. Add it to .env.local and to the hosting project.');
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    g.__wscSql = postgres(url, {
      prepare: false,
      max: 5,
      idle_timeout: 20,
      ssl: local ? false : 'require',
    });
  }
  return g.__wscSql;
}

/** The cafe's wall-clock time zone. Day boundaries and time-card edits use it. */
export const TZ = 'America/New_York';
