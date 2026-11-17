'use client';
import { ChevronLeft, Minus, Plus, Printer, Send, StickyNote } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorNote, Modal, PinGate, Shell, SignOutButton, btn, input, label } from '@/components/ui';
import { api, fmtTime, type SessionInfo } from '@/lib/client';
import { money, totals, type Order } from '@/lib/money';

type Option = { id: number; name: string; cash: number; card: number };
type Group = { key: string; name: string; min: number; max: number; options: Option[] };
type Item = { id: number; categoryId: number; name: string; description: string; cash: number; card: number; groups: string[]; available: boolean };
type Menu = {
  categories: { id: number; name: string }[];
  items: Item[];
  groups: Group[];
  settings: { taxPct: number; cardSurchargePct: number };
};

export default function OrdersPage() {
  return (
    <PinGate need="staff" prompt="Who is taking orders?">
      {(session, signOut) => <Orders session={session} signOut={signOut} />}
    </PinGate>
  );
}

function Orders({ session, signOut }: { session: SessionInfo; signOut: () => void }) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const r = await api<{ orders: Order[] }>('/api/orders');
    if (r.ok) {
      setOrders(r.data.orders);
      setError('');
    } else setError(r.error);
  }, []);

  useEffect(() => {
    api<Menu>('/api/menu').then((r) => (r.ok ? setMenu(r.data) : setError(r.error)));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  // Replace one order in the list with the fresh copy the server just returned.
  const put = (o: Order) => setOrders((list) => (list ?? []).filter((x) => x.id !== o.id).concat(o.status === 'open' ? [o] : []));

  const current = orders?.find((o) => o.id === currentId) ?? null;
  const right = <SignOutButton name={session.name} onClick={signOut} />;

  if (!menu || !orders) {
    return (
      <Shell title="Orders" right={right}>
        <div className="py-16 text-center text-zinc-500">{error || 'Loading…'}</div>
      </Shell>
    );
  }

  if (current) {
    return (
      <Shell title={`${current.orderType === 'takeout' ? 'To-go' : 'Table'} ${current.label}`} wide right={right}>
        <Editor menu={menu} order={current} onChange={put} onBack={() => setCurrentId(null)} />
      </Shell>
    );
  }

  return (
    <Shell title="Orders" right={right}>
      <ErrorNote>{error}</ErrorNote>
      <NewOrder
        onCreated={(o) => {
          put(o);
          setCurrentId(o.id);
        }}
      />
      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500">Open checks ({orders.length})</h2>
      {orders.length === 0 ? <p className="rounded-2xl bg-white p-6 text-center text-zinc-500 ring-1 ring-zinc-200">No open checks.</p> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {orders.map((o) => {
          const unsent = o.items.filter((i) => !i.sentAt).length;
          const cooking = o.items.filter((i) => i.sentAt && !i.doneAt).length;
          return (
            <button key={o.id} onClick={() => setCurrentId(o.id)} className="rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-zinc-200 active:bg-zinc-50">
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-semibold">
                  {o.orderType === 'takeout' ? 'To-go · ' : 'Table '}
                  {o.label}
                </span>
                <span className="font-semibold tabular-nums">{money(totals(o.items, menu.settings.taxPct).cash.total)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm text-zinc-500">
                <span>
                  {o.serverName} · {fmtTime(o.createdAt)} · {o.items.reduce((s, i) => s + i.qty, 0)} items
                </span>
                {unsent ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">{unsent} not sent</span>
                ) : cooking ? (
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-900">In kitchen</span>
                ) : o.items.length ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-900">Ready</span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </Shell>
  );
}

function NewOrder({ onCreated }: { onCreated: (o: Order) => void }) {
  const [orderType, setOrderType] = useState<'dine_in' | 'takeout'>('dine_in');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await api<{ order: Order }>('/api/orders', { body: { orderType, label: text } });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setText('');
    setError('');
    onCreated(r.data.order);
  };

  return (
    <form onSubmit={create} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
      <div className="mb-3 grid grid-cols-2 gap-2">
        {(['dine_in', 'takeout'] as const).map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => setOrderType(t)}
            className={`rounded-xl py-3 font-semibold ${orderType === t ? 'bg-navy text-white' : 'bg-zinc-100 text-zinc-700'}`}
          >
            {t === 'dine_in' ? 'Dine in' : 'To-go'}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={orderType === 'dine_in' ? 'Table (e.g. 4 or Counter 2)' : 'Customer name'}
          aria-label={orderType === 'dine_in' ? 'Table' : 'Customer name'}
        />
        <button disabled={busy || !text.trim()} className={`${btn.primary} whitespace-nowrap`}>
          New check
        </button>
      </div>
      <div className="mt-2">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </form>
  );
}

function Editor({ menu, order, onChange, onBack }: { menu: Menu; order: Order; onChange: (o: Order) => void; onBack: () => void }) {
  const [catId, setCatId] = useState(menu.categories[0]?.id);
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState<Item | null>(null);
  const [dialog, setDialog] = useState<'pay' | 'custom' | 'void' | 'split' | null>(null);
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    const r = await api<{ order: Order }>(`/api/orders/${order.id}`, { method: 'PATCH', body });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return false;
    }
    setError('');
    onChange(r.data.order);
    return true;
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? menu.items.filter((i) => i.name.toLowerCase().includes(q)) : menu.items.filter((i) => i.categoryId === catId);
  }, [menu.items, search, catId]);

  const t = totals(order.items, menu.settings.taxPct);
  const unsent = order.items.filter((i) => !i.sentAt).length;

  const tap = (item: Item) => {
    if (!item.available) return;
    if (item.groups.length) setPicking(item);
    else act({ action: 'add', menuItemId: item.id });
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_24rem] print:hidden">
        {/* ---------------- menu ---------------- */}
        <section>
          <div className="mb-3 flex gap-2">
            <button onClick={onBack} className={`${btn.ghost} flex items-center gap-1 py-2`}>
              <ChevronLeft size={18} /> Checks
            </button>
            <input className={`${input} py-2`} placeholder="Search the menu…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search the menu" />
          </div>
          {!search ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {menu.categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCatId(c.id)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${c.id === catId ? 'bg-navy text-white' : 'bg-white text-zinc-700 ring-1 ring-zinc-200'}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {shown.map((item) => (
              <button
                key={item.id}
                onClick={() => tap(item)}
                disabled={busy || !item.available}
                className="flex min-h-20 flex-col justify-between rounded-xl bg-white p-3 text-left shadow-sm ring-1 ring-zinc-200 active:bg-zinc-100 disabled:opacity-50"
              >
                <span className="font-semibold leading-snug">{item.name}</span>
                <span className="mt-1 text-sm text-zinc-500">{item.available ? `${money(item.cash)} / ${money(item.card)}` : "86'd"}</span>
              </button>
            ))}
            {!search ? (
              <button onClick={() => setDialog('custom')} className="min-h-20 rounded-xl border-2 border-dashed border-zinc-300 p-3 text-left font-semibold text-zinc-600">
                + Open item
                <span className="block text-sm font-normal text-zinc-500">Special or custom price</span>
              </button>
            ) : null}
          </div>
          {shown.length === 0 && search ? <p className="mt-6 text-center text-zinc-500">Nothing on the menu matches “{search}”.</p> : null}
        </section>

        {/* ---------------- check ---------------- */}
        <aside className="self-start rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 lg:sticky lg:top-4">
          <div className="border-b border-zinc-200 px-4 py-3">
            <div className="font-semibold">
              Check #{order.id} · {order.orderType === 'takeout' ? 'To-go' : 'Table'} {order.label}
            </div>
            <div className="text-sm text-zinc-500">
              {order.serverName} · opened {fmtTime(order.createdAt)}
            </div>
          </div>
          {error ? (
            <div className="px-4 pt-3">
              <ErrorNote>{error}</ErrorNote>
            </div>
          ) : null}
          {order.items.length === 0 ? <p className="px-4 py-8 text-center text-zinc-500">Tap menu items to add them.</p> : null}
          <ul className="divide-y divide-zinc-100">
            {order.items.map((i) => (
              <li key={i.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold leading-snug">{i.name}</span>
                  <span className="whitespace-nowrap tabular-nums">{money(i.qty * i.cash)}</span>
                </div>
                {i.modifiers.length ? <div className="text-sm text-zinc-600">{i.modifiers.map((m) => m.name).join(', ')}</div> : null}
                {i.note ? <div className="text-sm font-medium text-red-700">** {i.note}</div> : null}
                <div className="mt-2 flex items-center gap-2">
                  <button aria-label="One less" disabled={busy} onClick={() => act({ action: 'qty', itemId: i.id, qty: i.qty - 1 })} className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 active:bg-zinc-200">
                    <Minus size={16} />
                  </button>
                  <span className="w-6 text-center font-semibold tabular-nums">{i.qty}</span>
                  <button aria-label="One more" disabled={busy} onClick={() => act({ action: 'qty', itemId: i.id, qty: i.qty + 1 })} className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 active:bg-zinc-200">
                    <Plus size={16} />
                  </button>
                  <button aria-label="Note for the kitchen" onClick={() => setNoteFor(i.id)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 active:bg-zinc-200">
                    <StickyNote size={16} />
                  </button>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${!i.sentAt ? 'bg-amber-100 text-amber-900' : i.doneAt ? 'bg-emerald-100 text-emerald-900' : 'bg-sky-100 text-sky-900'}`}>
                    {!i.sentAt ? 'Not sent' : i.doneAt ? 'Ready' : 'In kitchen'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <div className="space-y-1 border-t border-zinc-200 px-4 py-3 text-sm">
            <Row a="Subtotal" cash={t.cash.subtotal} card={t.card.subtotal} />
            <Row a={`Tax (${menu.settings.taxPct}%)`} cash={t.cash.tax} card={t.card.tax} />
            <div className="flex justify-between pt-1 text-base font-bold">
              <span>Total</span>
              <span className="tabular-nums">
                {money(t.cash.total)} cash · {money(t.card.total)} card
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-zinc-200 p-4">
            <button disabled={busy || !unsent} onClick={() => act({ action: 'send' })} className={`${btn.primary} col-span-2 flex items-center justify-center gap-2`}>
              <Send size={18} /> {unsent ? `Send ${unsent} to kitchen` : 'Everything is sent'}
            </button>
            <button disabled={busy || !order.items.length} onClick={() => setDialog('pay')} className="col-span-2 rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white active:bg-emerald-800 disabled:opacity-40">
              Take payment
            </button>
            <button disabled={order.items.length < 2} onClick={() => setDialog('split')} className={`${btn.ghost} col-span-2`}>
              Split check
            </button>
            <button disabled={!order.items.length} onClick={() => window.print()} className={`${btn.ghost} flex items-center justify-center gap-2`}>
              <Printer size={18} /> Print check
            </button>
            <button onClick={() => setDialog('void')} className={btn.danger}>
              Void check
            </button>
          </div>
        </aside>
      </div>

      <PrintedCheck order={order} taxPct={menu.settings.taxPct} />

      {picking ? (
        <Options
          item={picking}
          groups={picking.groups.map((k) => menu.groups.find((g) => g.key === k)).filter((g): g is Group => !!g)}
          onClose={() => setPicking(null)}
          onAdd={async (body) => {
            if (await act({ action: 'add', menuItemId: picking.id, ...body })) setPicking(null);
          }}
          busy={busy}
          error={error}
        />
      ) : null}

      {noteFor != null ? (
        <NoteDialog
          initial={order.items.find((i) => i.id === noteFor)?.note ?? ''}
          onClose={() => setNoteFor(null)}
          onSave={async (note) => {
            if (await act({ action: 'note', itemId: noteFor, note })) setNoteFor(null);
          }}
        />
      ) : null}

      {dialog === 'custom' ? (
        <CustomDialog
          onClose={() => setDialog(null)}
          onAdd={async (body) => {
            if (await act({ action: 'custom', ...body })) setDialog(null);
          }}
          error={error}
        />
      ) : null}

      {dialog === 'pay' ? (
        <PayDialog
          cash={t.cash.total}
          card={t.card.total}
          busy={busy}
          error={error}
          onClose={() => setDialog(null)}
          onPay={async (method, tip) => {
            if (await act({ action: 'pay', method, tip })) onBack();
          }}
        />
      ) : null}

      {dialog === 'split' ? (
        <SplitDialog
          order={order}
          error={error}
          onClose={() => setDialog(null)}
          onSplit={async (itemIds) => {
            // The moved lines become a new open check; the 5-second refresh lists it.
            if (await act({ action: 'split', itemIds })) setDialog(null);
          }}
        />
      ) : null}

      {dialog === 'void' ? (
        <Modal title="Void this check?" onClose={() => setDialog(null)}>
          <p className="text-zinc-600">The check is cancelled and nothing is charged. It still shows in the manager&apos;s sales report as voided.</p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button className={btn.ghost} onClick={() => setDialog(null)}>
              Keep it
            </button>
            <button
              className="rounded-xl bg-red-700 px-4 py-3 font-semibold text-white"
              onClick={async () => {
                if (await act({ action: 'void' })) onBack();
              }}
            >
              Void check
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function Row({ a, cash, card }: { a: string; cash: number; card: number }) {
  return (
    <div className="flex justify-between text-zinc-600">
      <span>{a}</span>
      <span className="tabular-nums">
        {money(cash)} · {money(card)}
      </span>
    </div>
  );
}

function Options({
  item,
  groups,
  onClose,
  onAdd,
  busy,
  error,
}: {
  item: Item;
  groups: Group[];
  onClose: () => void;
  onAdd: (body: { modifierIds: number[]; qty: number; note: string }) => void;
  busy: boolean;
  error: string;
}) {
  const [picked, setPicked] = useState<Record<string, number[]>>({});
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');

  const toggle = (g: Group, id: number) =>
    setPicked((p) => {
      const cur = p[g.key] ?? [];
      if (cur.includes(id)) return { ...p, [g.key]: cur.filter((x) => x !== id) };
      // "Choose one" swaps the choice; "choose several" stops at the limit.
      if (g.max === 1) return { ...p, [g.key]: [id] };
      return cur.length >= g.max ? p : { ...p, [g.key]: [...cur, id] };
    });

  const missing = groups.find((g) => (picked[g.key]?.length ?? 0) < g.min);
  const chosen = groups.flatMap((g) => g.options.filter((o) => picked[g.key]?.includes(o.id)));
  const cash = (item.cash + chosen.reduce((s, o) => s + o.cash, 0)) * qty;

  return (
    <Modal title={item.name} onClose={onClose}>
      {item.description ? <p className="-mt-2 mb-3 text-sm text-zinc-600">{item.description}</p> : null}
      {groups.map((g) => (
        <fieldset key={g.key} className="mb-4">
          <legend className="mb-2 text-sm font-semibold text-zinc-700">
            {g.name}{' '}
            <span className="font-normal text-zinc-500">
              {g.min > 0 ? (g.min === g.max ? `· choose ${g.min}` : `· choose ${g.min}–${g.max}`) : g.max > 1 ? '· optional, any' : '· optional'}
            </span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {g.options.map((o) => {
              const on = picked[g.key]?.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={!!on}
                  onClick={() => toggle(g, o.id)}
                  className={`rounded-xl px-3 py-2.5 text-sm font-medium ${on ? 'bg-navy text-white' : 'bg-zinc-100 text-zinc-800'}`}
                >
                  {o.name}
                  {o.cash ? <span className={on ? 'text-white/80' : 'text-zinc-500'}> +{money(o.cash)}</span> : null}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
      <label className={label} htmlFor="opt-note">
        Note for the kitchen
      </label>
      <input id="opt-note" className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. no onions, well done" maxLength={200} />
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="One less" onClick={() => setQty(Math.max(1, qty - 1))} className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100">
            <Minus size={18} />
          </button>
          <span className="w-6 text-center text-lg font-semibold">{qty}</span>
          <button type="button" aria-label="One more" onClick={() => setQty(Math.min(50, qty + 1))} className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100">
            <Plus size={18} />
          </button>
        </div>
        <button
          disabled={busy || !!missing}
          onClick={() => onAdd({ modifierIds: chosen.map((o) => o.id), qty, note })}
          className={`${btn.primary} flex-1`}
        >
          {missing ? `Choose ${missing.name.toLowerCase()}` : `Add · ${money(cash)}`}
        </button>
      </div>
    </Modal>
  );
}

function NoteDialog({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (note: string) => void }) {
  const [note, setNote] = useState(initial);
  return (
    <Modal title="Note for the kitchen" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(note);
        }}
      >
        <input autoFocus className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. no onions, well done" maxLength={200} aria-label="Note" />
        <button className={`${btn.primary} mt-4 w-full`}>Save note</button>
      </form>
    </Modal>
  );
}

function CustomDialog({ onClose, onAdd, error }: { onClose: () => void; onAdd: (b: { name: string; price: string; note: string }) => void; error: string }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  return (
    <Modal title="Open item" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onAdd({ name, price, note: '' });
        }}
        className="space-y-3"
      >
        <div>
          <label className={label} htmlFor="ci-name">
            What is it?
          </label>
          <input id="ci-name" autoFocus className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Daily special" />
        </div>
        <div>
          <label className={label} htmlFor="ci-price">
            Cash price
          </label>
          <input id="ci-price" className={input} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
          <p className="mt-1 text-sm text-zinc-500">The card price is worked out automatically.</p>
        </div>
        <ErrorNote>{error}</ErrorNote>
        <button disabled={!name.trim() || !price.trim()} className={`${btn.primary} w-full`}>
          Add to check
        </button>
      </form>
    </Modal>
  );
}

function PayDialog({
  cash,
  card,
  busy,
  error,
  onClose,
  onPay,
}: {
  cash: number;
  card: number;
  busy: boolean;
  error: string;
  onClose: () => void;
  onPay: (method: 'cash' | 'card', tip: string) => void;
}) {
  const [tendered, setTendered] = useState('');
  const [tip, setTip] = useState('');
  const given = Math.round(Number(tendered) * 100);
  const change = tendered && Number.isFinite(given) ? given - cash : null;

  return (
    <Modal title="Take payment" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
          <div className="text-sm font-semibold text-zinc-500">Cash</div>
          <div className="text-3xl font-bold tabular-nums">{money(cash)}</div>
          <input className={`${input} mt-3 py-2`} inputMode="decimal" placeholder="Cash handed over" aria-label="Cash handed over" value={tendered} onChange={(e) => setTendered(e.target.value)} />
          <div className="mt-2 min-h-6 text-sm font-semibold">
            {change == null ? null : change >= 0 ? <span className="text-emerald-700">Change due: {money(change)}</span> : <span className="text-red-700">Short by {money(-change)}</span>}
          </div>
          <button disabled={busy} onClick={() => onPay('cash', '')} className="mt-2 w-full rounded-xl bg-emerald-700 py-3 font-semibold text-white disabled:opacity-40">
            Paid cash
          </button>
        </div>
        <div className="flex flex-col rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
          <div className="text-sm font-semibold text-zinc-500">Card</div>
          <div className="text-3xl font-bold tabular-nums">{money(card)}</div>
          <p className="mt-3 text-sm text-zinc-500">Run this on the card reader, then tap below.</p>
          <input className={`${input} mt-2 py-2`} inputMode="decimal" placeholder="Tip on card (optional)" aria-label="Tip on card" value={tip} onChange={(e) => setTip(e.target.value)} />
          <span className="flex-1" />
          <button disabled={busy} onClick={() => onPay('card', tip)} className={`${btn.primary} mt-2 w-full`}>
            Paid by card
          </button>
        </div>
      </div>
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

function SplitDialog({ order, error, onClose, onSplit }: { order: Order; error: string; onClose: () => void; onSplit: (ids: number[]) => void }) {
  const [picked, setPicked] = useState<number[]>([]);
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Modal title="Split check" onClose={onClose}>
      <p className="-mt-1 mb-3 text-sm text-zinc-600">Tick what goes on the new check. Everything else stays here. Repeat for more checks.</p>
      <ul className="divide-y divide-zinc-100 rounded-xl ring-1 ring-zinc-200">
        {order.items.map((i) => (
          <li key={i.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-3">
              <input type="checkbox" className="h-5 w-5" checked={picked.includes(i.id)} onChange={() => toggle(i.id)} />
              <span className="flex-1">
                {i.qty > 1 ? `${i.qty} × ` : ''}
                {i.name}
                {i.modifiers.length ? <span className="block text-sm text-zinc-500">{i.modifiers.map((m) => m.name).join(', ')}</span> : null}
              </span>
              <span className="tabular-nums">{money(i.qty * i.cash)}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
      <button disabled={!picked.length || picked.length === order.items.length} onClick={() => onSplit(picked)} className={`${btn.primary} mt-4 w-full`}>
        Move {picked.length || ''} to a new check
      </button>
    </Modal>
  );
}

/** Only visible on paper: a narrow guest check that fits a receipt printer. */
function PrintedCheck({ order, taxPct }: { order: Order; taxPct: number }) {
  const t = totals(order.items, taxPct);
  return (
    <div className="mx-auto hidden max-w-xs text-sm text-black print:block">
      <div className="text-center">
        <div className="text-xl font-bold">Water St. Cafe</div>
        <div>467 Exchange St. · Geneva, NY 14456</div>
        <div>(315) 789-2560</div>
      </div>
      <div className="my-3 border-y border-dashed border-black py-1">
        Check #{order.id} · {order.orderType === 'takeout' ? 'To-go' : 'Table'} {order.label}
        <br />
        Server: {order.serverName} · {new Date(order.createdAt).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'short', timeStyle: 'short' })}
      </div>
      {order.items.map((i) => (
        <div key={i.id} className="mb-1">
          <div className="flex justify-between gap-2">
            <span>
              {i.qty} × {i.name}
            </span>
            <span>
              {money(i.qty * i.cash)} / {money(i.qty * i.card)}
            </span>
          </div>
          {i.modifiers.length ? <div className="pl-4 text-xs">{i.modifiers.map((m) => m.name).join(', ')}</div> : null}
        </div>
      ))}
      <div className="mt-3 border-t border-dashed border-black pt-2">
        <div className="flex justify-between font-semibold">
          <span />
          <span>Cash / Card</span>
        </div>
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>
            {money(t.cash.subtotal)} / {money(t.card.subtotal)}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Tax</span>
          <span>
            {money(t.cash.tax)} / {money(t.card.tax)}
          </span>
        </div>
        <div className="flex justify-between text-base font-bold">
          <span>Total</span>
          <span>
            {money(t.cash.total)} / {money(t.card.total)}
          </span>
        </div>
      </div>
      <p className="mt-4 text-center">Cash gratuity is appreciated. Thank you!</p>
    </div>
  );
}
