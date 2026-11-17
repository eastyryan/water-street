'use client';
import { CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ErrorNote, PinGate, Shell } from '@/components/ui';
import { api, fmtDay, fmtHours, fmtTime, type SessionInfo } from '@/lib/client';

type Status = {
  open: { id: number; clock_in: string } | null;
  weekMinutes: number;
  recent: { id: number; clock_in: string; clock_out: string | null; minutes: number; status: string }[];
};

export default function ClockPage() {
  return (
    <Shell title="Time Clock">
      {/* alwaysAsk: a punch always needs a fresh PIN, even if someone else is signed in on this tablet. */}
      <PinGate need="staff" alwaysAsk prompt="Tap your name">
        {(session, signOut) => <Punch session={session} signOut={signOut} />}
      </PinGate>
    </Shell>
  );
}

function Punch({ session, signOut }: { session: SessionInfo; signOut: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'in' | 'out' | null>(null);

  useEffect(() => {
    api<Status>('/api/clock').then((r) => (r.ok ? setStatus(r.data) : setError(r.error)));
  }, []);

  // After a punch, show the confirmation briefly, then hand the tablet back.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(signOut, 3500);
    return () => clearTimeout(t);
  }, [done, signOut]);

  const punch = async (action: 'in' | 'out') => {
    setBusy(true);
    setError('');
    const r = await api<Status>('/api/clock', { body: { action } });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setStatus(r.data);
    setDone(action);
  };

  if (done) {
    return (
      <div className="py-16 text-center">
        <CheckCircle2 size={72} className="mx-auto text-emerald-600" />
        <h2 className="mt-4 text-2xl font-semibold">{done === 'in' ? 'Clocked in' : 'Clocked out'}</h2>
        <p className="mt-1 text-lg text-zinc-600">
          {session.name} · {fmtTime(new Date().toISOString())}
        </p>
        {done === 'out' && status?.recent[0] ? <p className="mt-1 text-zinc-600">Shift: {fmtHours(status.recent[0].minutes)}</p> : null}
        <button onClick={signOut} className="mt-8 rounded-xl bg-navy px-8 py-3 font-semibold text-white">
          Done
        </button>
      </div>
    );
  }

  if (!status) return <div className="py-16 text-center text-zinc-500">{error || 'Loading…'}</div>;

  return (
    <div className="mx-auto max-w-md text-center">
      <h2 className="text-2xl font-semibold">{session.name}</h2>
      <p className="mt-1 text-zinc-600">
        {status.open ? `On the clock since ${fmtTime(status.open.clock_in)}` : 'Not clocked in'}
      </p>

      <div className="my-6">
        <ErrorNote>{error}</ErrorNote>
      </div>

      <button
        disabled={busy}
        onClick={() => punch(status.open ? 'out' : 'in')}
        className={`w-full rounded-3xl py-10 text-3xl font-bold text-white shadow-md disabled:opacity-50 ${
          status.open ? 'bg-red-700 active:bg-red-800' : 'bg-emerald-700 active:bg-emerald-800'
        }`}
      >
        {busy ? 'Saving…' : status.open ? 'Clock Out' : 'Clock In'}
      </button>

      <p className="mt-6 text-zinc-700">
        This week: <span className="font-semibold">{fmtHours(status.weekMinutes)}</span>
      </p>

      {status.recent.length ? (
        <ul className="mt-4 divide-y divide-zinc-200 rounded-2xl bg-white text-left text-sm shadow-sm ring-1 ring-zinc-200">
          {status.recent.map((s) => (
            <li key={s.id} className="flex items-center justify-between px-4 py-3">
              <span>
                <span className="font-medium">{fmtDay(s.clock_in)}</span>
                <span className="text-zinc-500">
                  {' '}
                  · {fmtTime(s.clock_in)} – {s.clock_out ? fmtTime(s.clock_out) : 'now'}
                </span>
              </span>
              <span className="font-semibold tabular-nums">{fmtHours(s.minutes)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <button onClick={signOut} className="mt-6 text-sm font-medium text-zinc-600 underline">
        Cancel
      </button>
    </div>
  );
}
