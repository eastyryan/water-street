import 'server-only';
import { NextResponse } from 'next/server';
import { db, NoDatabaseError } from './db';
import { ensureReady } from './init';
import { readSession, setSecret, type Session } from './session';

/** Throw from a handler to return a clean error to the browser. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export const bad = (message: string, status = 400) => new HttpError(status, message);

type Body = Record<string, unknown>;
type Ctx<S> = { session: S; body: Body; params: Record<string, string>; url: URL };
type Handler = (req: Request, extra: { params: Promise<Record<string, string>> }) => Promise<Response>;

/**
 * Wraps a route handler with the three things every endpoint needs: a session
 * check for the required access level, JSON body parsing, and error handling.
 *
 * Identity always comes from the signed cookie, never from the request body.
 */
export function route(access: 'public', fn: (ctx: Ctx<Session | null>) => Promise<unknown>): Handler;
export function route(access: 'staff' | 'manager', fn: (ctx: Ctx<Session>) => Promise<unknown>): Handler;
export function route(
  access: 'public' | 'staff' | 'manager',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (ctx: Ctx<any>) => Promise<unknown>
): Handler {
  return async (req, extra) => {
    try {
      setSecret(await ensureReady());
      let session = await readSession();
      if (session) {
        // A deactivated or demoted person loses access immediately, not when the cookie expires.
        const [row] = await db()`select role, is_active from staff where id = ${session.id}`;
        if (!row || !row.is_active || (session.role === 'manager' && row.role !== 'manager')) session = null;
      }
      if (access !== 'public') {
        if (!session) throw bad('Please enter your PIN.', 401);
        if (access === 'manager' && session.role !== 'manager') throw bad('Manager access only.', 403);
      }
      let body: Body = {};
      if (req.method !== 'GET') {
        try {
          const parsed = await req.json();
          if (parsed && typeof parsed === 'object') body = parsed as Body;
        } catch {
          /* an empty body is fine */
        }
      }
      const result = await fn({ session, body, params: await extra.params, url: new URL(req.url) });
      return result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof NoDatabaseError) {
        return NextResponse.json(
          { error: 'Almost there: no database is connected yet. In Vercel, open this project > Storage > Create Database > Neon, connect it, then redeploy.' },
          { status: 503 }
        );
      }
      console.error(`${req.method} ${new URL(req.url).pathname} failed:`, e);
      return NextResponse.json({ error: 'Something went wrong on the server. Try again.' }, { status: 500 });
    }
  };
}

// ---- small input helpers ----
export const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function int(v: unknown, what: string): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n)) throw bad(`${what} is not valid.`);
  return n;
}

export function pin(v: unknown): string {
  if (typeof v !== 'string' || !/^\d{4}$/.test(v)) throw bad('PIN must be exactly 4 digits.');
  return v;
}

export function day(v: unknown, what: string): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad(`${what} must be a date.`);
  return v;
}
