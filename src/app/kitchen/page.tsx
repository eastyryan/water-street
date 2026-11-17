'use client';
import { Check } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PinGate, Shell, SignOutButton } from '@/components/ui';
import { api, fmtTime, minutesSince } from '@/lib/client';
import type { Mod } from '@/lib/money';

type Ticket = {
  id: number;
  orderType: 'dine_in' | 'takeout';
  label: string;
  serverName: string;
  sentAt: string;
  items: { id: number; name: string; qty: number; modifiers: Mod[]; note: string; seat: number; done: boolean }[];
};

export default function KitchenPage() {
  return (
    <PinGate need="staff" prompt="Who is on the line?">
      {(session, signOut) => (
        <Shell title="Kitchen" wide right={<SignOutButton name={session.name} onClick={signOut} />}>
          <Board />
        </Shell>
      )}
    </PinGate>
  );
}

function Board() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const r = await api<{ tickets: Ticket[] }>('/api/kitchen');
    if (r.ok) {
      setTickets(r.data.tickets);
      setError('');
    } else setError(r.error);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const patch = async (body: Record<string, unknown>) => {
    await api('/api/kitchen', { method: 'PATCH', body });
    load();
  };

  if (!tickets) return <div className="py-16 text-center text-zinc-500">{error || 'Loading…'}</div>;

  return (
    <>
      {error ? <p className="mb-3 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900">{error} Showing the last tickets received.</p> : null}
      {tickets.length === 0 ? (
        <div className="py-24 text-center text-xl text-zinc-500">All caught up. New tickets appear here on their own.</div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tickets.map((t) => {
            const age = minutesSince(t.sentAt);
            const manyGuests = new Set(t.items.map((i) => i.seat)).size > 1;
            const tone = age >= 20 ? 'bg-red-700' : age >= 10 ? 'bg-amber-600' : 'bg-navy';
            return (
              <article key={t.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
                <header className={`flex items-baseline justify-between px-4 py-2 text-white ${tone}`}>
                  <span className="text-lg font-bold">
                    {t.orderType === 'takeout' ? 'TO-GO · ' : 'Table '}
                    {t.label}
                  </span>
                  <span className="text-sm">
                    {age} min · {fmtTime(t.sentAt)}
                  </span>
                </header>
                <ul className="divide-y divide-zinc-100">
                  {t.items.map((i) => (
                    <li key={i.id}>
                      <button
                        onClick={() => patch({ itemId: i.id, done: !i.done })}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left ${i.done ? 'text-zinc-400 line-through' : ''}`}
                      >
                        <span className="w-7 shrink-0 text-lg font-bold tabular-nums">{i.qty}×</span>
                        <span className="flex-1">
                          <span className="block text-lg font-semibold leading-snug">
                            {manyGuests ? <span className="mr-2 rounded bg-zinc-200 px-1.5 text-sm text-zinc-700">G{i.seat}</span> : null}
                            {i.name}
                          </span>
                          {i.modifiers.length ? <span className="block text-zinc-600">{i.modifiers.map((m) => m.name).join(', ')}</span> : null}
                          {i.note ? <span className="mt-0.5 block font-semibold text-red-700">** {i.note}</span> : null}
                        </span>
                        {i.done ? <Check size={20} className="mt-1 shrink-0 text-emerald-600" /> : null}
                      </button>
                    </li>
                  ))}
                </ul>
                <footer className="flex items-center justify-between gap-3 border-t border-zinc-200 px-4 py-3">
                  <span className="text-sm text-zinc-500">
                    #{t.id} · {t.serverName}
                  </span>
                  <button onClick={() => patch({ orderId: t.id })} className="rounded-xl bg-emerald-700 px-5 py-2.5 font-semibold text-white active:bg-emerald-800">
                    Done
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
