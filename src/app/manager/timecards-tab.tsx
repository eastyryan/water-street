'use client';
import { Download } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorNote, Modal, btn, input, label } from '@/components/ui';
import { addDays, api, fmtDay, fmtHours, fmtTime, hoursDecimal, todayStr, weekStart } from '@/lib/client';
import { money } from '@/lib/money';

type Shift = {
  id: number;
  staffId: number;
  name: string;
  wageCents: number | null;
  clockIn: string;
  clockOut: string | null;
  clockInLocal: string;
  clockOutLocal: string | null;
  breakMinutes: number;
  status: 'pending' | 'approved';
  note: string;
  minutes: number | null;
  edited: boolean;
};
type Person = { id: number; name: string; active: boolean };

export function TimeCardsTab() {
  const today = todayStr();
  const [from, setFrom] = useState(weekStart(today));
  const [to, setTo] = useState(addDays(weekStart(today), 6));
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [staff, setStaff] = useState<Person[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Shift | 'new' | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ shifts: Shift[] }>(`/api/manager/shifts?from=${from}&to=${to}`);
    if (r.ok) {
      setShifts(r.data.shifts);
      setError('');
    } else setError(r.error);
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    api<{ staff: Person[] }>('/api/manager/staff').then((r) => r.ok && setStaff(r.data.staff));
  }, []);

  const byPerson = useMemo(() => {
    const m = new Map<number, { name: string; wageCents: number | null; shifts: Shift[]; minutes: number }>();
    for (const s of shifts ?? []) {
      const g = m.get(s.staffId) ?? { name: s.name, wageCents: s.wageCents, shifts: [], minutes: 0 };
      g.shifts.push(s);
      g.minutes += s.minutes ?? 0;
      m.set(s.staffId, g);
    }
    return [...m.values()];
  }, [shifts]);

  const setStatus = async (ids: number[], status: 'approved' | 'pending') => {
    const r = await api('/api/manager/shifts', { method: 'PATCH', body: { ids, status } });
    if (!r.ok) setError(r.error);
    load();
  };

  const shiftWeek = (n: number) => {
    setFrom(addDays(from, n * 7));
    setTo(addDays(to, n * 7));
  };

  const exportCsv = () => {
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [['Employee', 'Date', 'Clock in', 'Clock out', 'Break (min)', 'Hours', 'Status', 'Note']];
    for (const g of byPerson) {
      for (const s of g.shifts) {
        rows.push([s.name, s.clockInLocal.slice(0, 10), fmtTime(s.clockIn), s.clockOut ? fmtTime(s.clockOut) : 'OPEN', String(s.breakMinutes), s.minutes != null ? hoursDecimal(s.minutes) : '', s.status, s.note]);
      }
      rows.push([`${g.name} TOTAL`, '', '', '', '', hoursDecimal(g.minutes), '', '']);
    }
    const blob = new Blob([rows.map((r) => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `water-st-hours-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const pendingIds = (shifts ?? []).filter((s) => s.status === 'pending' && s.clockOut).map((s) => s.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <button className={btn.small} onClick={() => shiftWeek(-1)} aria-label="Previous week">
          ← Earlier
        </button>
        <label className="text-sm font-semibold text-zinc-600">
          From
          <input type="date" className={`${input} py-2`} value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </label>
        <label className="text-sm font-semibold text-zinc-600">
          To
          <input type="date" className={`${input} py-2`} value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </label>
        <button className={btn.small} onClick={() => shiftWeek(1)} aria-label="Next week">
          Later →
        </button>
        <span className="flex-1" />
        <button className={btn.small} onClick={() => setEditing('new')}>
          + Add missed shift
        </button>
        <button className={btn.small} disabled={!pendingIds.length} onClick={() => setStatus(pendingIds, 'approved')}>
          Approve all ({pendingIds.length})
        </button>
        <button className={`${btn.small} flex items-center gap-1`} disabled={!shifts?.length} onClick={exportCsv}>
          <Download size={15} /> Export for payroll
        </button>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {!shifts ? <div className="py-16 text-center text-zinc-500">Loading…</div> : null}
      {shifts && byPerson.length === 0 ? <p className="rounded-2xl bg-white p-6 text-center text-zinc-500 ring-1 ring-zinc-200">No time cards in these dates.</p> : null}

      {byPerson.map((g) => (
        <section key={g.name} className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
          <h3 className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 px-4 py-3">
            <span className="font-semibold">{g.name}</span>
            <span className="tabular-nums">
              <span className="font-semibold">{fmtHours(g.minutes)}</span>
              <span className="text-zinc-500"> ({hoursDecimal(g.minutes)} hrs)</span>
              {g.wageCents != null ? <span className="text-zinc-500"> · {money(Math.round((g.minutes / 60) * g.wageCents))} gross</span> : null}
              {/* Simple heads-up for one-week views; payroll decides actual overtime. */}
              {g.minutes > 40 * 60 ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Over 40 hrs</span> : null}
            </span>
          </h3>
          <ul className="divide-y divide-zinc-100">
            {g.shifts.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span>
                  <span className="font-medium">{fmtDay(s.clockIn)}</span>
                  <span className="text-zinc-600">
                    {' '}
                    · {fmtTime(s.clockIn)} – {s.clockOut ? fmtTime(s.clockOut) : <span className="font-semibold text-amber-700">still clocked in</span>}
                  </span>
                  {s.breakMinutes ? <span className="text-zinc-500"> · {s.breakMinutes} min break</span> : null}
                  {s.edited ? (
                    <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700" title={s.note}>
                      Edited{s.note ? `: ${s.note}` : ''}
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-16 text-right font-semibold tabular-nums">{fmtHours(s.minutes)}</span>
                  <button className={btn.small} onClick={() => setEditing(s)}>
                    Edit
                  </button>
                  {s.status === 'approved' ? (
                    <button className="rounded-lg bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-900" onClick={() => setStatus([s.id], 'pending')} title="Tap to undo">
                      Approved ✓
                    </button>
                  ) : (
                    <button className={btn.small} disabled={!s.clockOut} onClick={() => setStatus([s.id], 'approved')}>
                      Approve
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {editing ? (
        <ShiftForm
          shift={editing === 'new' ? null : editing}
          staff={staff}
          defaultDay={from}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function ShiftForm({ shift, staff, defaultDay, onClose, onSaved }: { shift: Shift | null; staff: Person[]; defaultDay: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    staffId: shift ? String(shift.staffId) : '',
    clockIn: shift?.clockInLocal ?? `${defaultDay}T06:00`,
    clockOut: shift ? (shift.clockOutLocal ?? '') : `${defaultDay}T14:00`,
    breakMinutes: String(shift?.breakMinutes ?? 0),
    reason: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const send = async (method: 'POST' | 'PATCH' | 'DELETE') => {
    setBusy(true);
    const r = await api('/api/manager/shifts', { method, body: { ...f, id: shift?.id } });
    setBusy(false);
    if (r.ok) onSaved();
    else setError(r.error);
  };

  return (
    <Modal title={shift ? `Edit time card - ${shift.name}` : 'Add a missed shift'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(shift ? 'PATCH' : 'POST');
        }}
        className="space-y-3"
      >
        {!shift ? (
          <div>
            <label className={label} htmlFor="tf-who">
              Employee
            </label>
            <select id="tf-who" className={input} value={f.staffId} onChange={set('staffId')} required>
              <option value="">Choose…</option>
              {staff.filter((p) => p.active).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="tf-in">
              Clock in
            </label>
            <input id="tf-in" type="datetime-local" className={input} value={f.clockIn} onChange={set('clockIn')} required />
          </div>
          <div>
            <label className={label} htmlFor="tf-out">
              Clock out
            </label>
            <input id="tf-out" type="datetime-local" className={input} value={f.clockOut} onChange={set('clockOut')} required={!shift} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="tf-break">
            Unpaid break (minutes)
          </label>
          <input id="tf-break" className={input} inputMode="numeric" value={f.breakMinutes} onChange={(e) => setF({ ...f, breakMinutes: e.target.value.replace(/\D/g, '') })} />
        </div>
        <div>
          <label className={label} htmlFor="tf-reason">
            Reason for the change
          </label>
          <input id="tf-reason" className={input} value={f.reason} onChange={set('reason')} placeholder="e.g. forgot to clock out" required />
          <p className="mt-1 text-sm text-zinc-500">Saved with your name so there is a record of every change.</p>
        </div>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex gap-2">
          {shift ? (
            <button type="button" disabled={busy} className={btn.danger} onClick={() => (f.reason.trim() ? send('DELETE') : setError('Add a reason before deleting.'))}>
              Delete
            </button>
          ) : null}
          <button disabled={busy} className={`${btn.primary} flex-1`}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
