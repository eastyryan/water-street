// Shared by server and browser. All money is integer cents.

export type Mod = { name: string; cash: number; card: number };

export type Line = {
  id: number;
  menuItemId: number | null;
  name: string;
  qty: number;
  cash: number; // unit price including modifiers
  card: number;
  modifiers: Mod[];
  note: string;
  sentAt: string | null;
  doneAt: string | null;
};

export type Order = {
  id: number;
  orderType: 'dine_in' | 'takeout';
  label: string;
  serverName: string;
  status: 'open' | 'paid' | 'void';
  paymentMethod: 'cash' | 'card' | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  createdAt: string;
  closedAt: string | null;
  items: Line[];
};

export function totals(items: Pick<Line, 'qty' | 'cash' | 'card'>[], taxPct: number) {
  const side = (k: 'cash' | 'card') => {
    const subtotal = items.reduce((s, i) => s + i.qty * i[k], 0);
    const tax = Math.round((subtotal * taxPct) / 100);
    return { subtotal, tax, total: subtotal + tax };
  };
  return { cash: side('cash'), card: side('card') };
}

export const money = (cents: number | null | undefined) => (cents == null ? '-' : `$${(cents / 100).toFixed(2)}`);

/** "12.50" -> 1250. Returns null for anything that is not a sensible price. */
export function parseMoney(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace('$', '')) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 10000) return null;
  return Math.round(n * 100);
}
