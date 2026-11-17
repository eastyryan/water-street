'use client';
import { Printer } from 'lucide-react';
import { useState } from 'react';
import { CalendarNav, MonthGrid, WeekGrid, fmtRange, monthBounds, monthTitle, useSchedule, type CalEvent, type SShift, type SStaff, type TimeOff } from '@/components/schedule';
import { ErrorNote, Modal, btn, input, label } from '@/components/ui';
import { addDays, api, todayStr, weekStart } from '@/lib/client';

type Dialog =
  | { type: 'shift'; shift?: SShift; staffId?: number; day: string }
  | { type: 'event'; event?: CalEvent; day: string }
  | { type: 'timeoff' }
  | { type: 'confirm'; title: string; text: string; go: string; body: Record<string, unknown> }
  | null;

const post = (body: Record<string, unknown>) => api<Record<string, number>>('/api/manager/schedule', { body });

export function ScheduleTab() {
  const [view, setView] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState(todayStr());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const ws = weekStart(anchor);
  const range = view === 'week' ? { from: ws, to: addDays(ws, 6) } : monthBounds(anchor);
  const { data, error: loadError, reload } = useSchedule(range.from, range.to);

  const run = async (body: Record<string, unknown>, describe: (r: Record<string, number>) => string) => {
    const r = await post(body);
    if (!r.ok) {
      setError(r.error);
      setNotice('');
    } else {
      setError('');
      setNotice(describe(r.data));
    }
    reload();
  };

  if (!data) return <div className="py-16 text-center text-zinc-500">{loadError || 'Loading…'}</div>;

  const weekShifts = data.shifts.filter((s) => s.day >= ws && s.day <= addDays(ws, 6));
  const drafts = weekShifts.filter((s) => !s.published).length;
  const pending = data.timeOff.filter((t) => t.status === 'pending');
  const closed = () => setDialog(null);
  const saved = () => {
    setDialog(null);
    reload();
  };

  return (
    <div className="space-y-4">
      <h2 className="hidden text-xl font-bold print:block">Water St. Cafe schedule · {fmtRange(ws, addDays(ws, 6))}</h2>

      <CalendarNav view={view} setView={setView} anchor={anchor} setAnchor={setAnchor}>
        <span className="px-1 font-semibold">{view === 'week' ? fmtRange(ws, addDays(ws, 6)) : monthTitle(anchor)}</span>
        <span className="flex-1" />
        <button className={btn.small} onClick={() => setDialog({ type: 'event', day: view === 'week' ? ws : todayStr() })}>
          + Calendar entry
        </button>
        <button className={btn.small} onClick={() => setDialog({ type: 'timeoff' })}>
          + Time off
        </button>
      </CalendarNav>

      {view === 'week' ? (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button className={btn.small} onClick={() => setDialog({ type: 'shift', day: ws })}>
            + Add shift
          </button>
          <button
            className={btn.small}
            onClick={() => run({ kind: 'copy', from: addDays(ws, -7), to: ws }, (r) => (r.copied || r.skipped ? `Copied ${r.copied} shifts from last week${r.skipped ? `, skipped ${r.skipped} (already scheduled, time off, or no longer on staff)` : ''}.` : 'Last week has no shifts to copy.'))}
          >
            Copy last week
          </button>
          <button
            className={btn.small}
            disabled={!weekShifts.length}
            onClick={() => setDialog({ type: 'confirm', title: 'Clear this week?', text: `This removes all ${weekShifts.length} shifts for ${fmtRange(ws, addDays(ws, 6))}.`, go: 'Clear week', body: { kind: 'clear', from: ws, to: addDays(ws, 6) } })}
          >
            Clear week
          </button>
          <button className={`${btn.small} flex items-center gap-1`} disabled={!weekShifts.length} onClick={() => window.print()}>
            <Printer size={15} /> Print
          </button>
          <span className="flex-1" />
          {drafts ? <span className="text-sm text-amber-800">{drafts} draft {drafts === 1 ? 'shift' : 'shifts'} - staff can&apos;t see drafts yet</span> : weekShifts.length ? <span className="text-sm text-emerald-700">Published - staff can see this week</span> : null}
          <button className={btn.primary} disabled={!drafts} onClick={() => run({ kind: 'publish', from: ws, to: addDays(ws, 6) }, (r) => `Published ${r.published} shifts. Staff can now see them.`)}>
            Publish week
          </button>
        </div>
      ) : null}

      <ErrorNote>{error || loadError}</ErrorNote>
      {notice ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 print:hidden">{notice}</p> : null}

      {pending.length ? (
        <section className="rounded-2xl bg-white shadow-sm ring-1 ring-amber-300 print:hidden">
          <h3 className="border-b border-zinc-200 px-4 py-3 font-semibold">Time-off requests waiting ({pending.length})</h3>
          <ul className="divide-y divide-zinc-100">
            {pending.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span>
                  <span className="font-semibold">{t.name}</span> · {fmtRange(t.startDay, t.endDay)}
                  {t.reason ? <span className="text-zinc-500"> · {t.reason}</span> : null}
                </span>
                <span className="flex gap-2">
                  <button className={btn.small} onClick={() => run({ kind: 'timeoff', id: t.id, status: 'denied' }, () => `Denied ${t.name}'s request.`)}>
                    Deny
                  </button>
                  <button
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white"
                    onClick={() => run({ kind: 'timeoff', id: t.id, status: 'approved' }, (r) => `Approved ${t.name}'s time off.${r.conflicts ? ` Heads up: ${r.conflicts} shift${r.conflicts === 1 ? ' is' : 's are'} still scheduled in those days - reassign or remove ${r.conflicts === 1 ? 'it' : 'them'}.` : ''}`)}
                  >
                    Approve
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view === 'week' ? (
        <WeekGrid
          data={data}
          start={ws}
          onCell={(p, day) => setDialog({ type: 'shift', staffId: p.id, day })}
          onShift={(shift) => setDialog({ type: 'shift', shift, day: shift.day })}
          onDay={(day) => setDialog({ type: 'event', day })}
          onEvent={(event) => setDialog({ type: 'event', event, day: event.day })}
        />
      ) : (
        <MonthGrid
          data={data}
          month={anchor.slice(0, 7)}
          onPick={(d) => {
            setAnchor(d);
            setView('week');
          }}
        />
      )}

      <TimeOffList items={data.timeOff.filter((t) => t.status !== 'pending')} onChange={(body, msg) => run(body, () => msg)} />

      {dialog?.type === 'shift' ? <ShiftForm d={dialog} staff={data.staff} onClose={closed} onSaved={saved} /> : null}
      {dialog?.type === 'event' ? <EventForm d={dialog} onClose={closed} onSaved={saved} /> : null}
      {dialog?.type === 'timeoff' ? <TimeOffForm staff={data.staff} onClose={closed} onSaved={saved} /> : null}
      {dialog?.type === 'confirm' ? (
        <Modal title={dialog.title} onClose={closed}>
          <p className="text-zinc-600">{dialog.text}</p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button className={btn.ghost} onClick={closed}>
              Cancel
            </button>
            <button
              className="rounded-xl bg-red-700 px-4 py-3 font-semibold text-white"
              onClick={() => {
                const body = dialog.body;
                setDialog(null);
                run(body, (r) => `Removed ${r.removed} shifts.`);
              }}
            >
              {dialog.go}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function TimeOffList({ items, onChange }: { items: TimeOff[]; onChange: (body: Record<string, unknown>, msg: string) => void }) {
  if (!items.length) return null;
  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 print:hidden">
      <h3 className="border-b border-zinc-200 px-4 py-3 font-semibold">Time off in view</h3>
      <ul className="divide-y divide-zinc-100">
        {items.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <span>
              <span className="font-semibold">{t.name}</span> · {fmtRange(t.startDay, t.endDay)}
              {t.reason ? <span className="text-zinc-500"> · {t.reason}</span> : null}
            </span>
            <span className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${t.status === 'approved' ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-800'}`}>
                {t.status === 'approved' ? 'Approved' : 'Denied'}
                {t.decidedBy ? ` by ${t.decidedBy.split(' ')[0]}` : ''}
              </span>
              <button className={btn.small} onClick={() => onChange({ kind: 'timeoff-delete', id: t.id }, 'Removed.')}>
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const PRESETS = [
  ['06:00', '14:00'],
  ['07:00', '15:00'],
  ['06:00', '11:00'],
  ['10:00', '14:00'],
];
const clockLabel = (t: string) => {
  const h = Number(t.slice(0, 2));
  return `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
};

function ShiftForm({ d, staff, onClose, onSaved }: { d: Extract<Dialog, { type: 'shift' }>; staff: SStaff[]; onClose: () => void; onSaved: () => void }) {
  const s = d.shift;
  const [f, setF] = useState({
    staffId: String(s?.staffId ?? d.staffId ?? ''),
    day: d.day,
    start: s?.start ?? '06:00',
    end: s?.end ?? '14:00',
    position: s?.position ?? staff.find((p) => p.id === d.staffId)?.position ?? '',
    note: s?.note ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    const r = await post(body);
    setBusy(false);
    if (r.ok) onSaved();
    else setError(r.error);
  };

  return (
    <Modal title={s ? 'Edit shift' : 'Add shift'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send({ kind: 'shift', id: s?.id, ...f });
        }}
        className="space-y-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="ss-who">
              Employee
            </label>
            <select
              id="ss-who"
              className={input}
              value={f.staffId}
              required
              onChange={(e) => setF({ ...f, staffId: e.target.value, position: staff.find((p) => String(p.id) === e.target.value)?.position ?? f.position })}
            >
              <option value="">Choose…</option>
              {staff.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="ss-day">
              Day
            </label>
            <input id="ss-day" type="date" className={input} value={f.day} required onChange={(e) => setF({ ...f, day: e.target.value })} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(([a, b]) => (
            <button type="button" key={a + b} onClick={() => setF({ ...f, start: a, end: b })} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${f.start === a && f.end === b ? 'bg-navy text-white' : 'bg-zinc-100 text-zinc-800'}`}>
              {clockLabel(a)}–{clockLabel(b)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="ss-start">
              Starts
            </label>
            <input id="ss-start" type="time" className={input} value={f.start} required onChange={(e) => setF({ ...f, start: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor="ss-end">
              Ends
            </label>
            <input id="ss-end" type="time" className={input} value={f.end} required onChange={(e) => setF({ ...f, end: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="ss-pos">
              Working as
            </label>
            <input id="ss-pos" className={input} value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} placeholder="Server, Cook…" />
          </div>
          <div>
            <label className={label} htmlFor="ss-note">
              Note
            </label>
            <input id="ss-note" className={input} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Optional" />
          </div>
        </div>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex gap-2">
          {s ? (
            <button type="button" disabled={busy} className={btn.danger} onClick={() => send({ kind: 'delete', id: s.id })}>
              Delete
            </button>
          ) : null}
          <button disabled={busy} className={`${btn.primary} flex-1`}>
            {busy ? 'Saving…' : 'Save shift'}
          </button>
        </div>
        {s?.published ? <p className="text-sm text-zinc-500">This shift is published, so staff see changes right away.</p> : null}
      </form>
    </Modal>
  );
}

function EventForm({ d, onClose, onSaved }: { d: Extract<Dialog, { type: 'event' }>; onClose: () => void; onSaved: () => void }) {
  const ev = d.event;
  const [f, setF] = useState({ day: d.day, title: ev?.title ?? '', note: ev?.note ?? '', type: ev?.kind ?? 'event' });
  const [error, setError] = useState('');

  const send = async (body: Record<string, unknown>) => {
    const r = await post(body);
    if (r.ok) onSaved();
    else setError(r.error);
  };

  return (
    <Modal title={ev ? 'Edit calendar entry' : 'Add to the calendar'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send({ kind: 'event', id: ev?.id, ...f });
        }}
        className="space-y-3"
      >
        <div className="grid grid-cols-2 gap-2">
          {(['event', 'closed'] as const).map((t) => (
            <button type="button" key={t} onClick={() => setF({ ...f, type: t, title: t === 'closed' && !f.title ? 'Closed' : f.title })} className={`rounded-xl py-3 font-semibold ${f.type === t ? 'bg-navy text-white' : 'bg-zinc-100 text-zinc-700'}`}>
              {t === 'event' ? 'Event or reminder' : 'Cafe closed'}
            </button>
          ))}
        </div>
        <div>
          <label className={label} htmlFor="ev-day">
            Day
          </label>
          <input id="ev-day" type="date" className={input} value={f.day} required onChange={(e) => setF({ ...f, day: e.target.value })} />
        </div>
        <div>
          <label className={label} htmlFor="ev-title">
            Title
          </label>
          <input id="ev-title" className={input} value={f.title} required onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={f.type === 'closed' ? 'e.g. Thanksgiving' : 'e.g. Team Room booked, 20 people'} />
        </div>
        <div>
          <label className={label} htmlFor="ev-note">
            Details
          </label>
          <input id="ev-note" className={input} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Optional" />
        </div>
        <p className="text-sm text-zinc-500">Everyone on staff sees calendar entries.</p>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex gap-2">
          {ev ? (
            <button type="button" className={btn.danger} onClick={() => send({ kind: 'event-delete', id: ev.id })}>
              Delete
            </button>
          ) : null}
          <button className={`${btn.primary} flex-1`}>Save</button>
        </div>
      </form>
    </Modal>
  );
}

function TimeOffForm({ staff, onClose, onSaved }: { staff: SStaff[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ staffId: '', startDay: todayStr(), endDay: todayStr(), reason: '' });
  const [error, setError] = useState('');
  return (
    <Modal title="Record time off" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await post({ kind: 'timeoff-add', ...f });
          if (r.ok) onSaved();
          else setError(r.error);
        }}
        className="space-y-3"
      >
        <div>
          <label className={label} htmlFor="to-who">
            Employee
          </label>
          <select id="to-who" className={input} value={f.staffId} required onChange={(e) => setF({ ...f, staffId: e.target.value })}>
            <option value="">Choose…</option>
            {staff.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="to-a">
              First day off
            </label>
            <input id="to-a" type="date" className={input} value={f.startDay} required onChange={(e) => setF({ ...f, startDay: e.target.value, endDay: e.target.value > f.endDay ? e.target.value : f.endDay })} />
          </div>
          <div>
            <label className={label} htmlFor="to-b">
              Last day off
            </label>
            <input id="to-b" type="date" className={input} value={f.endDay} min={f.startDay} required onChange={(e) => setF({ ...f, endDay: e.target.value })} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="to-why">
            Reason
          </label>
          <input id="to-why" className={input} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Optional" />
        </div>
        <p className="text-sm text-zinc-500">Saved as approved. Staff can also request time off themselves from the Schedule screen.</p>
        <ErrorNote>{error}</ErrorNote>
        <button className={`${btn.primary} w-full`}>Save</button>
      </form>
    </Modal>
  );
}
