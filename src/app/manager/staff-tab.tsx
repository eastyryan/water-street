'use client';
import { useCallback, useEffect, useState } from 'react';
import { ErrorNote, Modal, btn, input, label } from '@/components/ui';
import { api } from '@/lib/client';
import { money } from '@/lib/money';

type Person = { id: number; name: string; role: 'staff' | 'manager'; position: string; phone: string; wageCents: number | null; active: boolean };

export function StaffTab() {
  const [staff, setStaff] = useState<Person[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Person | 'new' | null>(null);
  const [demo, setDemo] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ staff: Person[] }>('/api/manager/staff');
    if (r.ok) setStaff(r.data.staff);
    else setError(r.error);
  }, []);
  useEffect(() => {
    load();
    api<{ demo: boolean }>('/api/roster').then((r) => r.ok && setDemo(r.data.demo));
  }, [load]);

  if (!staff) return <div className="py-16 text-center text-zinc-500">{error || 'Loading…'}</div>;

  return (
    <div>
      {demo ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-100 px-4 py-3 text-amber-950">
          <span>
            <b>These are made-up people.</b> When you are ready to use the app for real, clear the demo data and add your own staff.
          </span>
          <button className={btn.small} onClick={() => setConfirmClear(true)}>
            Clear demo data
          </button>
        </div>
      ) : null}
      {confirmClear ? (
        <Modal title="Clear all demo data?" onClose={() => setConfirmClear(false)}>
          <p className="text-zinc-600">This removes every demo employee, shift, time card, check and calendar entry. The menu and your settings stay. You will then create your own manager PIN.</p>
          <ErrorNote>{error}</ErrorNote>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button className={btn.ghost} onClick={() => setConfirmClear(false)}>
              Keep it
            </button>
            <button
              className="rounded-xl bg-red-700 px-4 py-3 font-semibold text-white"
              onClick={async () => {
                const r = await api('/api/demo', { method: 'DELETE' });
                if (r.ok) window.location.reload();
                else setError(r.error);
              }}
            >
              Clear demo data
            </button>
          </div>
        </Modal>
      ) : null}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-zinc-600">{staff.filter((s) => s.active).length} active</p>
        <button className={btn.primary} onClick={() => setEditing('new')}>
          + Add employee
        </button>
      </div>
      <ul className="divide-y divide-zinc-100 rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
        {staff.map((p) => (
          <li key={p.id} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${p.active ? '' : 'opacity-50'}`}>
            <span>
              <span className="font-semibold">{p.name}</span>
              {p.role === 'manager' ? <span className="ml-2 rounded-full bg-navy px-2 py-0.5 text-xs font-medium text-white">Manager</span> : null}
              {!p.active ? <span className="ml-2 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium">Inactive</span> : null}
              <span className="block text-sm text-zinc-500">
                {[p.position, p.phone, p.wageCents != null ? `${money(p.wageCents)}/hr` : ''].filter(Boolean).join(' · ') || 'No details yet'}
              </span>
            </span>
            <button className={btn.small} onClick={() => setEditing(p)}>
              Edit
            </button>
          </li>
        ))}
      </ul>
      {editing ? (
        <StaffForm
          person={editing === 'new' ? null : editing}
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

function StaffForm({ person, onClose, onSaved }: { person: Person | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: person?.name ?? '',
    position: person?.position ?? '',
    phone: person?.phone ?? '',
    wage: person?.wageCents != null ? (person.wageCents / 100).toFixed(2) : '',
    role: person?.role ?? 'staff',
    active: person?.active ?? true,
    pin: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await api('/api/manager/staff', {
      method: person ? 'PATCH' : 'POST',
      body: { ...f, id: person?.id, pin: f.pin || undefined },
    });
    setBusy(false);
    if (r.ok) onSaved();
    else setError(r.error);
  };

  return (
    <Modal title={person ? `Edit ${person.name}` : 'Add employee'} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div>
          <label className={label} htmlFor="sf-name">
            Name
          </label>
          <input id="sf-name" className={input} value={f.name} onChange={set('name')} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="sf-pos">
              Job
            </label>
            <input id="sf-pos" className={input} value={f.position} onChange={set('position')} placeholder="Server, Cook…" />
          </div>
          <div>
            <label className={label} htmlFor="sf-wage">
              Hourly wage
            </label>
            <input id="sf-wage" className={input} inputMode="decimal" value={f.wage} onChange={set('wage')} placeholder="Optional" />
          </div>
          <div>
            <label className={label} htmlFor="sf-phone">
              Phone
            </label>
            <input id="sf-phone" className={input} type="tel" value={f.phone} onChange={set('phone')} placeholder="Optional" />
          </div>
          <div>
            <label className={label} htmlFor="sf-role">
              Access
            </label>
            <select id="sf-role" className={input} value={f.role} onChange={set('role')}>
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
            </select>
          </div>
        </div>
        <div>
          <label className={label} htmlFor="sf-pin">
            {person ? 'New PIN (leave blank to keep the current one)' : '4-digit PIN'}
          </label>
          <input
            id="sf-pin"
            className={input}
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            value={f.pin}
            onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })}
            required={!person}
            autoComplete="off"
          />
        </div>
        {person ? (
          <label className="flex items-center gap-3 py-1">
            <input type="checkbox" className="h-5 w-5" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
            <span>
              Active <span className="text-sm text-zinc-500">- untick when someone leaves. Their time cards are kept.</span>
            </span>
          </label>
        ) : null}
        <ErrorNote>{error}</ErrorNote>
        <button disabled={busy} className={`${btn.primary} w-full`}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Modal>
  );
}
