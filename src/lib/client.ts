// Browser-side helpers.

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

export type SessionInfo = { id: number; name: string; role: 'staff' | 'manager' };

/** fetch wrapper that never throws - a kitchen losing wifi should see a message, not a crash. */
export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: init?.method ?? (init?.body ? 'POST' : 'GET'),
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    });
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      /* handled below */
    }
    if (!res.ok) {
      const error =
        payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : `Something went wrong (${res.status}).`;
      return { ok: false, error, status: res.status };
    }
    return { ok: true, data: payload as T };
  } catch {
    return { ok: false, error: 'No connection. Check the wifi and try again.', status: 0 };
  }
}

// All times are shown on the cafe's clock, whatever the device is set to.
const TZ = 'America/New_York';

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });

export const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });

export function fmtHours(minutes: number | null | undefined) {
  if (minutes == null) return '-';
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export const hoursDecimal = (minutes: number) => (minutes / 60).toFixed(2);

/** Today's date on the cafe's calendar, as YYYY-MM-DD. */
export const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

/** Add days to a YYYY-MM-DD string. */
export function addDays(dayStr: string, n: number) {
  const d = new Date(`${dayStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing a YYYY-MM-DD date. */
export function weekStart(dayStr: string) {
  const dow = new Date(`${dayStr}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(dayStr, -((dow + 6) % 7));
}

export const fmtDayStr = (dayStr: string) =>
  new Date(`${dayStr}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });

export const minutesSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
