'use client';
import { useState } from 'react';
import { CalendarNav, MonthGrid, WeekGrid, fmtRange, fmtSpan, monthBounds, monthTitle, useSchedule } from '@/components/schedule';
import { ErrorNote, PinGate, Shell, SignOutButton, btn, input, label } from '@/components/ui';
import { addDays, api, fmtDayStr, fmtHours, todayStr, weekStart, type SessionInfo } from '@/lib/client';

export default function SchedulePage() {
  return (
    <PinGate need="staff" prompt="Whose schedule?">
      {(session, signOut) => (
        <Shell title="Schedule" wide right={<SignOutButton name={session.name} onClick={signOut} />}>
          <MySchedule session={session} />
        </Shell>
      )}
    </PinGate>
  );
}

function MySchedule({ session }: { session: SessionInfo }) {
  const today = todayStr();
  const [view, setView] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState(today);
  const ws = weekStart(anchor);
  const range = view === 'week' ? { from: ws, to: addDays(ws, 6) } : monthBounds(anchor);

  const team = useSchedule(range.from, range.to);
  // "My next shifts" always looks ahead from today, whatever week is on screen.
  const ahead = useSchedule(today, addDays(today, 27));

  const mine = (ahead.data?.shifts ?? []).filter((s) => s.staffId === session.id);
  const myRequests = (ahead.data?.timeOff ?? []).filter((t) => t.staffId === session.id);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
          <h2 className="border-b border-zinc-200 px-4 py-3 font-semibold">
            {session.name.split(' ')[0]}&apos;s next shifts
            {mine.length ? <span className="font-normal text-zinc-500"> · {fmtHours(mine.reduce((s, x) => s + x.minutes, 0))} in the next 4 weeks</span> : null}
          </h2>
          {!ahead.data ? <p className="p-4 text-zinc-500">{ahead.error || 'Loading…'}</p> : null}
          {ahead.data && mine.length === 0 ? <p className="p-4 text-zinc-500">Nothing posted for you yet. Shifts show up here once a manager publishes the schedule.</p> : null}
          <ul className="divide-y divide-zinc-100">
            {mine.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span>
                  <span className="font-semibold">{s.day === today ? 'Today' : fmtDayStr(s.day)}</span>
                  {s.position ? <span className="text-zinc-500"> · {s.position}</span> : null}
                  {s.note ? <span className="block text-sm text-zinc-600">{s.note}</span> : null}
                </span>
                <span className="whitespace-nowrap font-semibold tabular-nums">{fmtSpan(s)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
          <h2 className="border-b border-zinc-200 px-4 py-3 font-semibold">Time off</h2>
          <RequestForm
            onSent={() => {
              ahead.reload();
              team.reload();
            }}
          />
          <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
            {myRequests.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span>
                  {fmtRange(t.startDay, t.endDay)}
                  {t.reason ? <span className="text-zinc-500"> · {t.reason}</span> : null}
                </span>
                <span className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${t.status === 'approved' ? 'bg-emerald-100 text-emerald-900' : t.status === 'denied' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'}`}>
                    {t.status === 'pending' ? 'Waiting for a manager' : t.status === 'approved' ? 'Approved' : 'Denied'}
                  </span>
                  {t.status === 'pending' ? (
                    <button
                      className={btn.small}
                      onClick={async () => {
                        await api('/api/schedule', { method: 'DELETE', body: { id: t.id } });
                        ahead.reload();
                      }}
                    >
                      Withdraw
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="space-y-3">
        <CalendarNav view={view} setView={setView} anchor={anchor} setAnchor={setAnchor}>
          <span className="px-1 font-semibold">{view === 'week' ? fmtRange(ws, addDays(ws, 6)) : monthTitle(anchor)}</span>
        </CalendarNav>
        <ErrorNote>{team.error}</ErrorNote>
        {!team.data ? (
          <div className="py-10 text-center text-zinc-500">Loading…</div>
        ) : view === 'week' ? (
          <WeekGrid data={team.data} start={ws} meId={session.id} />
        ) : (
          <MonthGrid
            data={team.data}
            month={anchor.slice(0, 7)}
            meId={session.id}
            onPick={(d) => {
              setAnchor(d);
              setView('week');
            }}
          />
        )}
      </section>
    </div>
  );
}

function RequestForm({ onSent }: { onSent: () => void }) {
  const today = todayStr();
  const [f, setF] = useState({ startDay: '', endDay: '', reason: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await api('/api/schedule', { body: f });
        setBusy(false);
        if (!r.ok) return setError(r.error);
        setError('');
        setF({ startDay: '', endDay: '', reason: '' });
        onSent();
      }}
      className="space-y-3 p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="rq-a">
            First day off
          </label>
          <input id="rq-a" type="date" className={`${input} py-2`} min={today} value={f.startDay} required onChange={(e) => setF({ ...f, startDay: e.target.value, endDay: !f.endDay || e.target.value > f.endDay ? e.target.value : f.endDay })} />
        </div>
        <div>
          <label className={label} htmlFor="rq-b">
            Last day off
          </label>
          <input id="rq-b" type="date" className={`${input} py-2`} min={f.startDay || today} value={f.endDay} required onChange={(e) => setF({ ...f, endDay: e.target.value })} />
        </div>
      </div>
      <div className="flex gap-2">
        <input className={`${input} py-2`} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Reason (optional)" aria-label="Reason" maxLength={200} />
        <button disabled={busy} className={`${btn.primary} whitespace-nowrap py-2`}>
          Request
        </button>
      </div>
      <ErrorNote>{error}</ErrorNote>
    </form>
  );
}
