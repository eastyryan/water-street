'use client';
import { useCallback, useEffect, useState } from 'react';
import { ErrorNote, btn, input } from '@/components/ui';
import { addDays, api, fmtDayStr, fmtHours, fmtTime, minutesSince, todayStr, weekStart } from '@/lib/client';
import { fmtSpan } from '@/components/schedule';
import { money } from '@/lib/money';

type Report = {
  from: string;
  to: string;
  summary: { orders: number; total: number; subtotal: number; tax: number; tips: number; cash: number; card: number; cashOrders: number; cardOrders: number };
  byDay: { day: string; orders: number; total: number }[];
  topItems: { name: string; qty: number; sales: number }[];
  onClock: { id: number; name: string; position: string; clockIn: string }[];
  openOrders: number;
  scheduled: { id: number; name: string; position: string; start: string; end: string; clockedIn: boolean; pastStart: boolean }[];
  recent: { id: number; label: string; orderType: string; serverName: string; status: string; paymentMethod: string | null; total: number | null; closedAt: string }[];
};

function useReport(query: string, refreshMs?: number) {
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const r = await api<Report>(`/api/manager/reports${query}`);
    if (r.ok) {
      setData(r.data);
      setError('');
    } else setError(r.error);
  }, [query]);
  useEffect(() => {
    load();
    if (!refreshMs) return;
    const t = setInterval(load, refreshMs);
    return () => clearInterval(t);
  }, [load, refreshMs]);
  return { data, error, reload: load };
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
      <div className="text-sm font-semibold text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub ? <div className="text-sm text-zinc-500">{sub}</div> : null}
    </div>
  );
}

const card = 'rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200';
const h3 = 'border-b border-zinc-200 px-4 py-3 font-semibold';

export function TodayTab() {
  const { data, error } = useReport('', 15000);
  if (!data) return <div className="py-16 text-center text-zinc-500">{error || 'Loading…'}</div>;
  const s = data.summary;
  return (
    <div className="space-y-4">
      <ErrorNote>{error}</ErrorNote>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales today" value={money(s.total)} sub={`${s.orders} paid checks`} />
        <Stat label="Cash" value={money(s.cash)} sub={`${s.cashOrders} checks`} />
        <Stat label="Card" value={money(s.card)} sub={`${s.cardOrders} checks`} />
        <Stat label="Open checks" value={String(data.openOrders)} sub={`Tax collected ${money(s.tax)}`} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={card}>
          <h3 className={h3}>On the clock ({data.onClock.length})</h3>
          {data.onClock.length === 0 ? <p className="p-4 text-zinc-500">Nobody is clocked in.</p> : null}
          <ul className="divide-y divide-zinc-100">
            {data.onClock.map((p) => {
              const mins = minutesSince(p.clockIn);
              return (
                <li key={p.id} className="flex items-center justify-between px-4 py-3">
                  <span>
                    <span className="font-semibold">{p.name}</span>
                    {p.position ? <span className="text-zinc-500"> · {p.position}</span> : null}
                    {/* A shift this long almost always means a forgotten clock-out. */}
                    {mins > 12 * 60 ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Forgot to clock out?</span> : null}
                  </span>
                  <span className="text-sm text-zinc-600">
                    since {fmtTime(p.clockIn)} · {fmtHours(mins)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
        <section className={card}>
          <h3 className={h3}>Scheduled today ({data.scheduled.length})</h3>
          {data.scheduled.length === 0 ? <p className="p-4 text-zinc-500">No shifts on today&apos;s schedule.</p> : null}
          <ul className="divide-y divide-zinc-100">
            {data.scheduled.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-3">
                <span>
                  <span className="font-semibold">{s.name}</span>
                  {s.position ? <span className="text-zinc-500"> · {s.position}</span> : null}
                </span>
                <span className="flex items-center gap-2 text-sm">
                  <span className="tabular-nums text-zinc-600">{fmtSpan(s)}</span>
                  {s.clockedIn ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">Clocked in</span>
                  ) : s.pastStart ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Not clocked in</span>
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">Later</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <TopItems items={data.topItems} title="Top sellers today" />
      </div>
    </div>
  );
}

function TopItems({ items, title }: { items: Report['topItems']; title: string }) {
  return (
    <section className={card}>
      <h3 className={h3}>{title}</h3>
      {items.length === 0 ? <p className="p-4 text-zinc-500">No paid checks yet.</p> : null}
      <ul className="divide-y divide-zinc-100">
        {items.map((i) => (
          <li key={i.name} className="flex items-center justify-between px-4 py-2.5">
            <span>
              <span className="mr-2 inline-block w-8 font-semibold tabular-nums">{i.qty}×</span>
              {i.name}
            </span>
            <span className="tabular-nums text-zinc-600">{money(i.sales)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SalesTab() {
  const today = todayStr();
  const [from, setFrom] = useState(weekStart(today));
  const [to, setTo] = useState(today);
  const { data, error, reload } = useReport(`?from=${from}&to=${to}`);

  const preset = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
  };
  const reopen = async (id: number) => {
    await api(`/api/orders/${id}`, { method: 'PATCH', body: { action: 'reopen' } });
    reload();
  };
  const lastWeek = addDays(weekStart(today), -7);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm font-semibold text-zinc-600">
          From
          <input type="date" className={`${input} py-2`} value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </label>
        <label className="text-sm font-semibold text-zinc-600">
          To
          <input type="date" className={`${input} py-2`} value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </label>
        <button className={btn.small} onClick={() => preset(today, today)}>
          Today
        </button>
        <button className={btn.small} onClick={() => preset(weekStart(today), today)}>
          This week
        </button>
        <button className={btn.small} onClick={() => preset(lastWeek, addDays(lastWeek, 6))}>
          Last week
        </button>
        <button className={btn.small} onClick={() => preset(`${today.slice(0, 8)}01`, today)}>
          This month
        </button>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {!data ? (
        <div className="py-16 text-center text-zinc-500">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Total collected" value={money(data.summary.total)} sub={`${data.summary.orders} paid checks`} />
            <Stat label="Sales before tax" value={money(data.summary.subtotal)} sub={`Sales tax ${money(data.summary.tax)}`} />
            <Stat label="Cash" value={money(data.summary.cash)} sub={`${data.summary.cashOrders} checks`} />
            <Stat label="Card" value={money(data.summary.card)} sub={`${data.summary.cardOrders} checks · tips ${money(data.summary.tips)}`} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className={card}>
              <h3 className={h3}>By day</h3>
              {data.byDay.length === 0 ? <p className="p-4 text-zinc-500">No paid checks in this range.</p> : null}
              <ul className="divide-y divide-zinc-100">
                {data.byDay.map((d) => (
                  <li key={d.day} className="flex items-center justify-between px-4 py-2.5">
                    <span>{fmtDayStr(d.day)}</span>
                    <span className="tabular-nums">
                      <span className="mr-3 text-zinc-500">{d.orders} checks</span>
                      <span className="font-semibold">{money(d.total)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <TopItems items={data.topItems} title="Top sellers" />
          </div>
          <section className={card}>
            <h3 className={h3}>Closed checks{data.recent.length === 100 ? ' (latest 100)' : ''}</h3>
            {data.recent.length === 0 ? <p className="p-4 text-zinc-500">None in this range.</p> : null}
            <ul className="divide-y divide-zinc-100">
              {data.recent.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <span>
                    <span className="font-semibold">#{o.id}</span> · {o.orderType === 'takeout' ? 'To-go' : 'Table'} {o.label}
                    <span className="text-zinc-500">
                      {' '}
                      · {o.serverName} · {fmtTime(o.closedAt)}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    {o.status === 'void' ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Voided</span>
                    ) : (
                      <span className="tabular-nums">
                        {money(o.total)} <span className="text-zinc-500">{o.paymentMethod}</span>
                      </span>
                    )}
                    <button className={btn.small} onClick={() => reopen(o.id)}>
                      Reopen
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
