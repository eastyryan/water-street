'use client';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { addDays, api, fmtHours, todayStr } from '@/lib/client';
import { money } from '@/lib/money';

export type SShift = { id: number; staffId: number; name: string; day: string; start: string; end: string; position: string; note: string; published: boolean; minutes: number };
export type TimeOff = { id: number; staffId: number; name: string; startDay: string; endDay: string; reason: string; status: 'pending' | 'approved' | 'denied'; decidedBy: string };
export type CalEvent = { id: number; day: string; title: string; note: string; kind: 'event' | 'closed' };
export type SStaff = { id: number; name: string; position: string; wageCents: number | null };
export type Schedule = { shifts: SShift[]; timeOff: TimeOff[]; events: CalEvent[]; staff: SStaff[] };

/** "06:00" -> "6a", "14:30" -> "2:30p" */
export function fmtClock(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'a' : 'p'}`;
}
export const fmtSpan = (s: { start: string; end: string }) => `${fmtClock(s.start)}–${fmtClock(s.end)}`;

const dayParts = (d: string) => {
  const dt = new Date(`${d}T12:00:00Z`);
  return {
    dow: dt.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' }),
    date: dt.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }),
    num: dt.getUTCDate(),
  };
};
export const fmtRange = (a: string, b: string) => (a === b ? dayParts(a).date : `${dayParts(a).date} – ${dayParts(b).date}`);

export function useSchedule(from: string, to: string) {
  const [data, setData] = useState<Schedule | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const r = await api<Schedule>(`/api/schedule?from=${from}&to=${to}`);
    if (r.ok) {
      setData(r.data);
      setError('');
    } else setError(r.error);
  }, [from, to]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, reload: load };
}

const isOff = (data: Schedule, staffId: number, day: string) =>
  data.timeOff.find((t) => t.staffId === staffId && t.status === 'approved' && t.startDay <= day && t.endDay >= day);

/**
 * One week, one row per person. Read-only unless the on* handlers are passed.
 * Scrolls sideways inside its own box on a phone; the page itself never does.
 */
export function WeekGrid({
  data,
  start,
  meId,
  onCell,
  onShift,
  onDay,
  onEvent,
}: {
  data: Schedule;
  start: string;
  meId?: number;
  onCell?: (staff: SStaff, day: string) => void;
  onShift?: (shift: SShift) => void;
  onDay?: (day: string) => void;
  onEvent?: (e: CalEvent) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = todayStr();
  const editable = !!onCell;
  // Someone who left can still have shifts on an old week: keep their row.
  const extra = data.shifts.filter((s) => s.day >= days[0] && s.day <= days[6] && !data.staff.some((p) => p.id === s.staffId));
  const people = [...data.staff, ...[...new Map(extra.map((s) => [s.staffId, { id: s.staffId, name: s.name, position: '', wageCents: null }])).values()]];
  const weekShifts = data.shifts.filter((s) => s.day >= days[0] && s.day <= days[6]);
  const cost = weekShifts.reduce((sum, s) => sum + (s.minutes / 60) * (data.staff.find((p) => p.id === s.staffId)?.wageCents ?? 0), 0);

  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 print:overflow-visible print:shadow-none print:ring-0">
      <table className="w-full min-w-[56rem] border-collapse text-sm print:min-w-0">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-36 bg-white p-2 text-left font-semibold text-zinc-500">
              <span className="sr-only">Employee</span>
            </th>
            {days.map((d) => {
              const p = dayParts(d);
              const events = data.events.filter((e) => e.day === d);
              return (
                <th key={d} className={`border-l border-zinc-100 p-2 text-left align-top font-normal ${d === today ? 'bg-amber-50' : ''}`}>
                  <button disabled={!onDay} onClick={() => onDay?.(d)} className="block w-full text-left" title={onDay ? 'Add to the calendar' : undefined}>
                    <span className="font-semibold">{p.dow}</span> <span className="text-zinc-500">{p.date}</span>
                  </button>
                  {events.map((e) => (
                    <button
                      key={e.id}
                      disabled={!onEvent}
                      onClick={() => onEvent?.(e)}
                      title={e.note || undefined}
                      className={`mt-1 block w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-medium ${e.kind === 'closed' ? 'bg-red-100 text-red-800' : 'bg-violet-100 text-violet-900'}`}
                    >
                      {e.kind === 'closed' ? 'Closed: ' : ''}
                      {e.title}
                    </button>
                  ))}
                </th>
              );
            })}
            <th className="w-20 border-l border-zinc-100 p-2 text-right font-semibold text-zinc-500">Hours</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => {
            const mine = weekShifts.filter((s) => s.staffId === p.id);
            const mins = mine.reduce((s, x) => s + x.minutes, 0);
            return (
              <tr key={p.id} className={`border-t border-zinc-100 ${p.id === meId ? 'bg-sky-50/60' : ''}`}>
                <th className={`sticky left-0 z-10 p-2 text-left align-top font-semibold ${p.id === meId ? 'bg-sky-50' : 'bg-white'}`}>
                  {p.name}
                  {p.position ? <span className="block text-xs font-normal text-zinc-500">{p.position}</span> : null}
                </th>
                {days.map((d) => {
                  const off = isOff(data, p.id, d);
                  const cell = mine.filter((s) => s.day === d);
                  return (
                    <td key={d} className={`border-l border-zinc-100 p-1 align-top ${d === today ? 'bg-amber-50/60' : ''}`}>
                      {off ? (
                        <div className="rounded bg-zinc-100 px-1.5 py-1 text-xs font-medium text-zinc-600" title={off.reason || undefined}>
                          Time off
                        </div>
                      ) : null}
                      {cell.map((s) => (
                        <button
                          key={s.id}
                          disabled={!onShift}
                          onClick={() => onShift?.(s)}
                          title={s.note || undefined}
                          className={`mb-1 block w-full rounded px-1.5 py-1 text-left ${
                            s.published ? 'bg-navy text-white' : 'border border-dashed border-amber-500 bg-amber-50 text-amber-950'
                          }`}
                        >
                          <span className="block font-semibold tabular-nums">{fmtSpan(s)}</span>
                          <span className="block truncate text-xs opacity-80">
                            {s.position || ' '}
                            {s.note ? ' *' : ''}
                          </span>
                        </button>
                      ))}
                      {editable && !off ? (
                        <button
                          onClick={() => onCell?.(p, d)}
                          aria-label={`Add a shift for ${p.name} on ${dayParts(d).date}`}
                          className="flex h-7 w-full items-center justify-center rounded text-zinc-300 hover:bg-zinc-100 hover:text-zinc-600 print:hidden"
                        >
                          <Plus size={16} />
                        </button>
                      ) : null}
                    </td>
                  );
                })}
                <td className="border-l border-zinc-100 p-2 text-right align-top font-semibold tabular-nums">{mins ? fmtHours(mins) : '-'}</td>
              </tr>
            );
          })}
          {people.length === 0 ? (
            <tr>
              <td colSpan={9} className="p-6 text-center text-zinc-500">
                Add employees under Staff first.
              </td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr className="border-t border-zinc-200 text-zinc-600">
            <th className="sticky left-0 z-10 bg-white p-2 text-left font-semibold">On shift</th>
            {days.map((d) => {
              const c = weekShifts.filter((s) => s.day === d);
              return (
                <td key={d} className="border-l border-zinc-100 p-2 tabular-nums">
                  {c.length ? `${new Set(c.map((s) => s.staffId)).size} · ${fmtHours(c.reduce((s, x) => s + x.minutes, 0))}` : '-'}
                </td>
              );
            })}
            <td className="border-l border-zinc-100 p-2 text-right font-semibold tabular-nums">
              {fmtHours(weekShifts.reduce((s, x) => s + x.minutes, 0))}
              {cost > 0 ? <span className="block text-xs font-normal">{money(Math.round(cost))}</span> : null}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** A month at a glance: calendar entries and how many people are on each day. */
export function MonthGrid({ data, month, meId, onPick }: { data: Schedule; month: string; meId?: number; onPick: (day: string) => void }) {
  const first = `${month}-01`;
  const gridStart = addDays(first, -((new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  // Drop a trailing week that belongs entirely to next month.
  const shown = days[35].slice(0, 7) === month ? days : days.slice(0, 35);
  const today = todayStr();

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
      <div className="grid grid-cols-7 border-b border-zinc-200 text-center text-xs font-semibold text-zinc-500">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {shown.map((d) => {
          const inMonth = d.slice(0, 7) === month;
          const shifts = data.shifts.filter((s) => s.day === d);
          const events = data.events.filter((e) => e.day === d);
          const mine = meId ? shifts.filter((s) => s.staffId === meId) : [];
          const drafts = shifts.some((s) => !s.published);
          const off = data.timeOff.filter((t) => t.status === 'approved' && t.startDay <= d && t.endDay >= d);
          return (
            <button
              key={d}
              onClick={() => onPick(d)}
              className={`min-h-24 border-b border-r border-zinc-100 p-1.5 text-left align-top hover:bg-zinc-50 ${inMonth ? '' : 'bg-zinc-50 text-zinc-400'}`}
            >
              <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm font-semibold ${d === today ? 'bg-navy text-white' : ''}`}>
                {dayParts(d).num}
              </span>
              {events.map((e) => (
                <span key={e.id} className={`mt-0.5 block truncate rounded px-1 text-xs font-medium ${e.kind === 'closed' ? 'bg-red-100 text-red-800' : 'bg-violet-100 text-violet-900'}`}>
                  {e.kind === 'closed' ? 'Closed' : e.title}
                </span>
              ))}
              {mine.map((s) => (
                <span key={s.id} className="mt-0.5 block truncate rounded bg-navy px-1 text-xs font-medium text-white">
                  {fmtSpan(s)}
                </span>
              ))}
              {!meId && shifts.length ? (
                <span className={`mt-0.5 block truncate text-xs ${drafts ? 'text-amber-700' : 'text-zinc-600'}`}>
                  {new Set(shifts.map((s) => s.staffId)).size} working{drafts ? ' · draft' : ''}
                </span>
              ) : null}
              {off.length ? <span className="mt-0.5 block truncate text-xs text-zinc-500">{off.length === 1 ? `${off[0].name.split(' ')[0]} off` : `${off.length} off`}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Week / month switcher with previous, next and "today". Shared by staff and manager screens. */
export function CalendarNav({
  view,
  setView,
  anchor,
  setAnchor,
  children,
}: {
  view: 'week' | 'month';
  setView: (v: 'week' | 'month') => void;
  anchor: string; // any day inside the week or month being shown
  setAnchor: (d: string) => void;
  children?: React.ReactNode;
}) {
  const step = (n: number) => {
    if (view === 'week') return setAnchor(addDays(anchor, n * 7));
    const d = new Date(`${anchor.slice(0, 7)}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setAnchor(d.toISOString().slice(0, 10));
  };
  const small = 'rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50';
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button className={small} onClick={() => step(-1)} aria-label={`Previous ${view}`}>
        ←
      </button>
      <button className={small} onClick={() => setAnchor(todayStr())}>
        Today
      </button>
      <button className={small} onClick={() => step(1)} aria-label={`Next ${view}`}>
        →
      </button>
      <div className="flex overflow-hidden rounded-lg border border-zinc-300 text-sm font-medium">
        {(['week', 'month'] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 capitalize ${view === v ? 'bg-navy text-white' : 'bg-white text-zinc-800'}`}>
            {v}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

export const monthTitle = (anchor: string) =>
  new Date(`${anchor.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });

/** First and last day shown by a month grid (it spills into neighbouring months). */
export function monthBounds(anchor: string) {
  const first = `${anchor.slice(0, 7)}-01`;
  const from = addDays(first, -((new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7));
  return { from, to: addDays(from, 41) };
}
