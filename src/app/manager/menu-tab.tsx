'use client';
import { useCallback, useEffect, useState } from 'react';
import { ErrorNote, Modal, btn, input, label } from '@/components/ui';
import { api } from '@/lib/client';
import { money } from '@/lib/money';

type Item = { id: number; categoryId: number; name: string; description: string; cash: number; card: number; available: boolean; active: boolean };
type Menu = { categories: { id: number; name: string }[]; items: Item[]; settings: { taxPct: number; cardSurchargePct: number; tableCount: number } };

export function MenuTab() {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [catId, setCatId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [rates, setRates] = useState({ taxPct: '', cardSurchargePct: '', tableCount: '' });
  const [ratesSaved, setRatesSaved] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Menu>('/api/menu?all=1');
    if (!r.ok) return setError(r.error);
    setMenu(r.data);
    setCatId((c) => c ?? r.data.categories[0]?.id ?? null);
    setRates({ taxPct: String(r.data.settings.taxPct), cardSurchargePct: String(r.data.settings.cardSurchargePct), tableCount: String(r.data.settings.tableCount) });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const patch = async (body: Record<string, unknown>) => {
    const r = await api('/api/manager/menu', { method: 'PATCH', body });
    if (!r.ok) setError(r.error);
    else setError('');
    await load();
    return r.ok;
  };

  if (!menu) return <div className="py-16 text-center text-zinc-500">{error || 'Loading…'}</div>;
  const items = menu.items.filter((i) => i.categoryId === catId);

  return (
    <div className="space-y-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setRatesSaved(await patch(rates));
        }}
        className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200"
      >
        <label className="text-sm font-semibold text-zinc-600">
          Sales tax %
          <input className={`${input} w-28 py-2`} inputMode="decimal" value={rates.taxPct} onChange={(e) => { setRates({ ...rates, taxPct: e.target.value }); setRatesSaved(false); }} />
        </label>
        <label className="text-sm font-semibold text-zinc-600">
          Card surcharge %
          <input className={`${input} w-28 py-2`} inputMode="decimal" value={rates.cardSurchargePct} onChange={(e) => { setRates({ ...rates, cardSurchargePct: e.target.value }); setRatesSaved(false); }} />
        </label>
        <label className="text-sm font-semibold text-zinc-600">
          Tables
          <input className={`${input} w-24 py-2`} inputMode="numeric" value={rates.tableCount} onChange={(e) => { setRates({ ...rates, tableCount: e.target.value.replace(/\D/g, '') }); setRatesSaved(false); }} />
        </label>
        <button className={btn.small}>Save</button>
        {ratesSaved ? <span className="text-sm font-medium text-emerald-700">Saved</span> : null}
        <p className="basis-full text-sm text-zinc-500">The surcharge only fills in the card price for new and open items. Existing card prices change only when you edit them.</p>
      </form>

      <ErrorNote>{error}</ErrorNote>

      <div className="flex flex-wrap items-center gap-2">
        {menu.categories.map((c) => (
          <button key={c.id} onClick={() => setCatId(c.id)} className={`rounded-full px-4 py-2 text-sm font-semibold ${c.id === catId ? 'bg-navy text-white' : 'bg-white text-zinc-700 ring-1 ring-zinc-200'}`}>
            {c.name}
          </button>
        ))}
        <span className="flex-1" />
        <button className={btn.primary} onClick={() => setEditing('new')}>
          + Add item
        </button>
      </div>

      <ul className="divide-y divide-zinc-100 rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
        {items.map((i) => (
          <li key={i.id} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${i.active ? '' : 'opacity-50'}`}>
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{i.name}</span>
              {!i.active ? <span className="ml-2 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium">Off the menu</span> : null}
              {i.description ? <span className="block truncate text-sm text-zinc-500">{i.description}</span> : null}
            </span>
            <span className="tabular-nums text-zinc-700">
              {money(i.cash)} / {money(i.card)}
            </span>
            {i.active ? (
              <button
                onClick={() => patch({ id: i.id, available: !i.available })}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${i.available ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-800'}`}
                title="Tap when the kitchen runs out"
              >
                {i.available ? 'Available' : "86'd"}
              </button>
            ) : null}
            <button className={btn.small} onClick={() => setEditing(i)}>
              Edit
            </button>
          </li>
        ))}
        {items.length === 0 ? <li className="p-4 text-zinc-500">Nothing in this category yet.</li> : null}
      </ul>

      {editing && catId != null ? (
        <ItemForm
          item={editing === 'new' ? null : editing}
          categoryId={catId}
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

function ItemForm({ item, categoryId, onClose, onSaved }: { item: Item | null; categoryId: number; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: item?.name ?? '',
    description: item?.description ?? '',
    cash: item ? (item.cash / 100).toFixed(2) : '',
    card: item ? (item.card / 100).toFixed(2) : '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const send = async (body: Record<string, unknown>, method: 'POST' | 'PATCH') => {
    setBusy(true);
    const r = await api('/api/manager/menu', { method, body });
    setBusy(false);
    if (r.ok) onSaved();
    else setError(r.error);
  };

  return (
    <Modal title={item ? `Edit ${item.name}` : 'Add menu item'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(item ? { id: item.id, ...f } : { categoryId, ...f }, item ? 'PATCH' : 'POST');
        }}
        className="space-y-3"
      >
        <div>
          <label className={label} htmlFor="mi-name">
            Name
          </label>
          <input id="mi-name" className={input} value={f.name} onChange={set('name')} required />
        </div>
        <div>
          <label className={label} htmlFor="mi-desc">
            Description
          </label>
          <input id="mi-desc" className={input} value={f.description} onChange={set('description')} placeholder="Optional" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="mi-cash">
              Cash price
            </label>
            <input id="mi-cash" className={input} inputMode="decimal" value={f.cash} onChange={set('cash')} required />
          </div>
          <div>
            <label className={label} htmlFor="mi-card">
              Card price
            </label>
            <input id="mi-card" className={input} inputMode="decimal" value={f.card} onChange={set('card')} placeholder="Auto" />
          </div>
        </div>
        <p className="text-sm text-zinc-500">Leave the card price blank to add the card surcharge automatically.</p>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex gap-2">
          {item ? (
            <button type="button" disabled={busy} className={item.active ? btn.danger : btn.ghost} onClick={() => send({ id: item.id, active: !item.active }, 'PATCH')}>
              {item.active ? 'Take off menu' : 'Put back on menu'}
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
