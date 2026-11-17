import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Signed, httpOnly session cookie: an HMAC over a small JSON payload.
 * The PIN is checked on the server and never stored in the browser.
 */
export const SESSION_COOKIE = 'wsc_session';

// Staff sessions last a shift so the order and kitchen tablets stay usable;
// the time clock signs out after every punch. Manager sessions are shorter.
const TTL_SECONDS = { staff: 12 * 60 * 60, manager: 2 * 60 * 60 } as const;

export type Role = 'staff' | 'manager';
export type Session = { id: number; name: string; role: Role; exp: number };

function secret(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET is missing or too short (needs >= 32 chars). Generate one with: openssl rand -base64 48');
  }
  return Buffer.from(s, 'utf8');
}

const sign = (body: string) => createHmac('sha256', secret()).update(body).digest('base64url');

export function createToken(s: Omit<Session, 'exp'>): { token: string; maxAge: number } {
  const maxAge = TTL_SECONDS[s.role];
  const payload: Session = { ...s, exp: Math.floor(Date.now() / 1000) + maxAge };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return { token: `${body}.${sign(body)}`, maxAge };
}

export function verifyToken(token: string | undefined): Session | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(sign(body));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Session;
    if (typeof s.exp !== 'number' || s.exp * 1000 < Date.now()) return null;
    if (s.role !== 'staff' && s.role !== 'manager') return null;
    if (typeof s.id !== 'number' || typeof s.name !== 'string') return null;
    return s;
  } catch {
    return null;
  }
}

export async function readSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifyToken(jar.get(SESSION_COOKIE)?.value);
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}
