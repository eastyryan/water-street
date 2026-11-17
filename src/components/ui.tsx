'use client';
import Link from 'next/link';
import { ArrowLeft, Delete, LogOut, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, type SessionInfo } from '@/lib/client';

export function Shell({
  title,
  right,
  children,
  wide,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center gap-3 bg-navy px-4 py-3 text-white print:hidden">
        <Link href="/" aria-label="Home" className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-white/10">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="flex-1 text-lg font-semibold">{title}</h1>
        {right}
      </header>
      <main className={`mx-auto w-full flex-1 p-4 ${wide ? 'max-w-7xl' : 'max-w-3xl'}`}>{children}</main>
    </div>
  );
}

export function Modal({ onClose, children, title }: { onClose: () => void; children: React.ReactNode; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4 print:hidden" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 rounded-lg p-2 text-zinc-500 hover:bg-zinc-100">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{children}</p>;
}

export const btn = {
  primary: 'rounded-xl bg-navy px-4 py-3 font-semibold text-white hover:bg-navy-dark disabled:opacity-40',
  ghost: 'rounded-xl border border-zinc-300 bg-white px-4 py-3 font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-40',
  danger: 'rounded-xl border border-red-200 bg-white px-4 py-3 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40',
  small: 'rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-40',
};
export const input = 'w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base outline-none focus:border-navy';
export const label = 'mb-1 block text-sm font-semibold text-zinc-600';

/** Ten-key pad that calls onDone as soon as four digits are in. */
export function PinPad({ onDone, busy, error }: { onDone: (pin: string) => void; busy: boolean; error: string }) {
  const [pin, setPin] = useState('');

  const press = (d: string) => {
    if (busy) return;
    // Four dots still showing means the last try was wrong - start a clean attempt.
    const next = (pin.length >= 4 ? '' : pin) + d;
    setPin(next);
    if (next.length === 4) onDone(next);
  };

  return (
    <div className="mx-auto w-full max-w-xs">
      <div className="mb-4 flex justify-center gap-4" aria-label={`${pin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-4 w-4 rounded-full border-2 border-navy ${i < pin.length ? 'bg-navy' : ''}`} />
        ))}
      </div>
      <div className="min-h-6 text-center text-sm font-medium text-red-700">{error}</div>
      <div className="mt-2 grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} onClick={() => press(d)} className="h-16 rounded-2xl bg-white text-2xl font-semibold shadow-sm ring-1 ring-zinc-200 active:bg-zinc-100">
            {d}
          </button>
        ))}
        <span />
        <button onClick={() => press('0')} className="h-16 rounded-2xl bg-white text-2xl font-semibold shadow-sm ring-1 ring-zinc-200 active:bg-zinc-100">
          0
        </button>
        <button onClick={() => setPin(pin.length >= 4 ? '' : pin.slice(0, -1))} aria-label="Delete" className="flex h-16 items-center justify-center rounded-2xl text-zinc-600 active:bg-zinc-200">
          <Delete size={26} />
        </button>
      </div>
    </div>
  );
}

type RosterPerson = { id: number; name: string; role: 'staff' | 'manager'; position: string };
type Roster = { staff: RosterPerson[]; needsSetup: boolean; demo: boolean; session: SessionInfo | null };

/**
 * "Who are you?" -> PIN pad. Renders its children once someone with the right
 * access is signed in.
 *
 *   need="manager"  only managers get through
 *   alwaysAsk       ignore whoever is already signed in on this device (time clock)
 */
export function PinGate({
  need,
  alwaysAsk,
  prompt,
  children,
}: {
  need: 'staff' | 'manager';
  alwaysAsk?: boolean;
  prompt: string;
  children: (session: SessionInfo, signOut: () => void) => React.ReactNode;
}) {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [picked, setPicked] = useState<RosterPerson | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [setupName, setSetupName] = useState('');

  const load = useCallback(async () => {
    const r = await api<Roster>('/api/roster');
    if (!r.ok) return setError(r.error);
    setError('');
    setRoster(r.data);
    if (!alwaysAsk && r.data.session && (need === 'staff' || r.data.session.role === 'manager')) setSession(r.data.session);
  }, [alwaysAsk, need]);

  useEffect(() => {
    load();
  }, [load]);

  const signOut = useCallback(async () => {
    await api('/api/auth', { method: 'DELETE' });
    setSession(null);
    setPicked(null);
    setError('');
    load();
  }, [load]);

  if (session) return <>{children(session, signOut)}</>;
  if (!roster) return <div className="py-16 text-center text-zinc-500">{error || 'Loading…'}</div>;

  const submit = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    const r = await api<{ session: SessionInfo }>('/api/auth', { body });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setSession(r.data.session);
  };

  if (roster.needsSetup) {
    return (
      <div className="mx-auto max-w-sm py-6 text-center">
        <h2 className="text-xl font-semibold">Welcome - let&apos;s set up</h2>
        <p className="mt-2 text-zinc-600">Create the first manager. Type your name, then choose a 4-digit PIN you will remember.</p>
        <input className={`${input} my-5 text-center`} placeholder="Your name" value={setupName} onChange={(e) => setSetupName(e.target.value)} />
        {setupName.trim() ? (
          <PinPad busy={busy} error={error} onDone={(pin) => submit({ setup: true, name: setupName, pin })} />
        ) : (
          <>
            <div className="my-5 flex items-center gap-3 text-sm text-zinc-500">
              <span className="h-px flex-1 bg-zinc-300" /> or <span className="h-px flex-1 bg-zinc-300" />
            </div>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await api('/api/demo', { method: 'POST' });
                setBusy(false);
                if (!r.ok) return setError(r.error);
                load();
              }}
              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 font-semibold text-zinc-800 disabled:opacity-40"
            >
              {busy ? 'Loading demo…' : 'Try it with demo data'}
            </button>
            <p className="mt-2 text-sm text-zinc-500">Adds made-up staff, a schedule, time cards and sales so you can look around. You can clear it later.</p>
            <ErrorNote>{error}</ErrorNote>
          </>
        )}
      </div>
    );
  }

  const people = roster.staff.filter((p) => need === 'staff' || p.role === 'manager');
  const demoNote = roster.demo ? (
    <p className="mx-auto mt-6 max-w-sm rounded-lg bg-amber-100 px-3 py-2 text-center text-sm text-amber-950">
      Demo data. Manager PIN <b>1234</b> · everyone else <b>1111</b>
    </p>
  ) : null;

  if (!picked) {
    return (
      <div className="py-2">
        <h2 className="mb-4 text-center text-xl font-semibold">{prompt}</h2>
        <ErrorNote>{error}</ErrorNote>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {people.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setPicked(p);
                setError('');
              }}
              className="rounded-2xl bg-white px-3 py-5 text-center shadow-sm ring-1 ring-zinc-200 active:bg-zinc-100"
            >
              <span className="block text-lg font-semibold">{p.name}</span>
              {p.position ? <span className="block text-sm text-zinc-500">{p.position}</span> : null}
            </button>
          ))}
        </div>
        {demoNote}
      </div>
    );
  }

  return (
    <div className="py-2 text-center">
      <h2 className="text-xl font-semibold">Hi {picked.name.split(' ')[0]}</h2>
      <p className="mb-5 mt-1 text-zinc-600">Enter your 4-digit PIN</p>
      <PinPad busy={busy} error={error} onDone={(pin) => submit({ staffId: picked.id, pin })} />
      <button
        onClick={() => {
          setPicked(null);
          setError('');
        }}
        className="mt-6 text-sm font-medium text-zinc-600 underline"
      >
        Not you? Go back
      </button>
      {demoNote}
    </div>
  );
}

export function SignOutButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/10">
      <span className="hidden sm:inline">{name}</span>
      <LogOut size={18} />
    </button>
  );
}
