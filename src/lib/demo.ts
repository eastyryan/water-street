import 'server-only';
import { hashPin } from './data';
import { db, TZ } from './db';

/**
 * Demo data: made-up staff, two weeks of schedule, time cards, a week of sales
 * and a few open tables, so every screen has something to show.
 *
 * Everything here is fictional. "Clear demo data" on the Staff tab removes it
 * all (the menu is kept) and returns the app to first-time setup.
 */
export const DEMO_MANAGER_PIN = '1234';
export const DEMO_STAFF_PIN = '1111';

// name, role, job, hourly wage, usual shift (start, end), days worked (0 = Monday)
const PEOPLE: [string, 'manager' | 'staff', string, number, string, string, number[]][] = [
  ['Morgan Hale', 'manager', 'Owner', 0, '06:00', '14:00', [0, 1, 2, 3, 4]],
  ['Riley Chen', 'manager', 'Manager', 24, '07:00', '15:00', [2, 3, 4, 5, 6]],
  ['Marcus Bell', 'staff', 'Cook', 21, '06:00', '14:00', [0, 1, 2, 3, 4]],
  ['Dana Ortiz', 'staff', 'Cook', 19.5, '06:00', '14:00', [3, 4, 5, 6]],
  ['Eli Novak', 'staff', 'Dishwasher', 16, '07:00', '14:00', [1, 2, 4, 5, 6]],
  ['Priya Shah', 'staff', 'Server', 11, '06:00', '14:00', [0, 1, 2, 5, 6]],
  ['Tom Becker', 'staff', 'Server', 11, '07:00', '15:00', [0, 3, 4, 5, 6]],
  ['Avery Lane', 'staff', 'Server', 11, '10:00', '14:00', [1, 2, 3, 4, 5]],
  ['Kim Russo', 'staff', 'Host', 15.5, '08:00', '13:00', [5, 6]],
];

/** Small repeatable random generator, so the demo looks the same every time. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export async function loadDemo() {
  const sql = db();
  const managerHash = await hashPin(DEMO_MANAGER_PIN);
  const staffHash = await hashPin(DEMO_STAFF_PIN);
  const rand = rng(467);
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];

  await sql.begin(async (tx) => {
    const [{ n }] = await tx`select count(*)::int as n from staff`;
    if (n > 0) throw new Error('Demo data can only be loaded into an empty staff list.');
    await tx`insert into settings (key, value) values ('demo', '1') on conflict (key) do nothing`;

    // Dates on the cafe's calendar. week0 = Monday of this week.
    const [{ today, week0, dow, hour }] = await tx`
      select to_char(now() at time zone ${TZ}, 'YYYY-MM-DD') as today,
             to_char(date_trunc('week', now() at time zone ${TZ}), 'YYYY-MM-DD') as week0,
             (extract(isodow from now() at time zone ${TZ})::int - 1) as dow,
             extract(hour from now() at time zone ${TZ})::int as hour`;

    const ids: Record<string, number> = {};
    for (const [name, role, position, wage] of PEOPLE) {
      const [row] = await tx`
        insert into staff (name, role, position, wage_cents, pin_hash, phone)
        values (${name}, ${role}, ${position}, ${wage ? Math.round(wage * 100) : null},
                ${role === 'manager' ? managerHash : staffHash}, ${`(315) 555-01${String(Object.keys(ids).length + 10)}`})
        returning id`;
      ids[name] = row.id;
    }

    // ---- schedule: last week and this week published, next week still a draft
    for (const [name, , position, , start, end, days] of PEOPLE) {
      for (const week of [-1, 0, 1]) {
        for (const d of days) {
          await tx`insert into schedule_shifts (staff_id, day, start_time, end_time, position, published)
                   values (${ids[name]}, ${week0}::date + ${week * 7 + d}::int, ${start}, ${end}, ${position}, ${week < 1})`;
        }
      }
    }

    // ---- time cards for every scheduled day that has already happened
    for (const [name, , , , start, end, days] of PEOPLE) {
      for (const week of [-1, 0]) {
        for (const d of days) {
          const offset = week * 7 + d;
          const isToday = week === 0 && d === dow;
          if (week === 0 && d > dow) continue;
          const startH = Number(start.slice(0, 2));
          const endH = Number(end.slice(0, 2));
          if (isToday && hour < startH) continue;
          const inJitter = Math.floor(rand() * 9) - 4; // a few minutes early or late
          const outJitter = Math.floor(rand() * 16) - 3;
          const open = isToday && hour < endH; // still on the clock right now
          await tx`
            insert into shifts (staff_id, clock_in, clock_out, break_minutes, status)
            values (${ids[name]},
                    ((${week0}::date + ${offset}::int) + ${start}::time + make_interval(mins => ${inJitter})) at time zone ${TZ},
                    ${open ? null : tx`((${week0}::date + ${offset}::int) + ${end}::time + make_interval(mins => ${outJitter})) at time zone ${TZ}`},
                    ${endH - startH >= 6 && !open ? 30 : 0}, ${week === -1 ? 'approved' : 'pending'})`;
        }
      }
    }

    // ---- time off and calendar
    await tx`insert into time_off (staff_id, start_day, end_day, reason, status, decided_by) values
      (${ids['Avery Lane']}, ${week0}::date + 9, ${week0}::date + 10, 'Family visiting', 'pending', ''),
      (${ids['Eli Novak']}, ${week0}::date + 12, ${week0}::date + 12, 'Dentist', 'approved', 'Morgan Hale')`;
    await tx`delete from schedule_shifts where staff_id = ${ids['Eli Novak']} and day = ${week0}::date + 12`;
    await tx`insert into calendar_events (day, title, note, kind) values
      (${week0}::date + 5, 'Team Room booked - 20 for breakfast', '9:00am, set up the long tables', 'event'),
      (${week0}::date + 8, 'Produce delivery', 'Before 7am, back door', 'event'),
      (${week0}::date + 17, 'Closed for staff party', '', 'closed')`;

    // ---- sales: a week of paid checks, built from real menu items
    // Only items that need no choices, so every demo line is a valid order.
    const menu = await tx`
      select m.id, m.name, m.cash_cents as cash, m.card_cents as card, c.name as category
      from menu_items m join menu_categories c on c.id = m.category_id
      where not exists (select 1 from modifier_groups g where g.key = any(m.modifier_groups) and g.min_select > 0)
        and c.name not in ('A La Carte', 'Gluten Free', 'Sides')`;
    const food = menu.filter((m) => m.category !== 'Beverages');
    const drinks = await tx`select id, name, cash_cents as cash, card_cents as card from menu_items
                            where name in ('Cold Brew', 'Milk - Small', 'Almond Milk', 'Bottled Pure Leaf Tea', 'Chocolate Milk - Small')`;
    const servers = ['Priya Shah', 'Tom Becker', 'Avery Lane'];
    const [{ tax }] = await tx`select value::numeric as tax from settings where key = 'tax_pct'`;

    type Pick = { id: number; name: string; cash: number; card: number };
    const addLines = async (orderId: number, guests: number, at: Date | null, done: boolean) => {
      const lines: Pick[] = [];
      for (let seat = 1; seat <= guests; seat++) {
        for (const item of [pick(food), pick(drinks)] as unknown as Pick[]) {
          lines.push(item);
          await tx`insert into order_items (order_id, menu_item_id, name, seat, cash_cents, card_cents, sent_at, done_at)
                   values (${orderId}, ${item.id}, ${item.name}, ${seat}, ${item.cash}, ${item.card},
                           ${at}, ${done ? at : null})`;
        }
      }
      return lines;
    };

    for (let back = 7; back >= 0; back--) {
      const lastHour = back === 0 ? Math.min(hour, 14) : 14; // nothing in the future
      const checks = back === 0 ? Math.max(0, (lastHour - 6) * 2) : 14 + Math.floor(rand() * 8);
      for (let i = 0; i < checks; i++) {
        const mins = 6 * 60 + 20 + Math.floor(rand() * Math.max(1, (lastHour - 6) * 60 - 40));
        const when = tx`((${today}::date - ${back}::int) + make_interval(mins => ${mins})) at time zone ${TZ}`;
        const takeout = rand() < 0.2;
        const server = pick(servers);
        const card = rand() < 0.6;
        const [o] = await tx`
          insert into orders (order_type, label, server_id, server_name, status, created_at, closed_at)
          values (${takeout ? 'takeout' : 'dine_in'}, ${takeout ? pick(['Sam', 'Jordan', 'Chris', 'Pat', 'Alex']) : String(1 + Math.floor(rand() * 12))},
                  ${ids[server]}, ${server}, 'paid', ${when} - interval '35 minutes', ${when})
          returning id, closed_at`;
        const lines = await addLines(o.id, takeout ? 1 : 1 + Math.floor(rand() * 3), o.closed_at, true);
        const subtotal = lines.reduce((s, l) => s + (card ? l.card : l.cash), 0);
        const taxCents = Math.round((subtotal * Number(tax)) / 100);
        await tx`update orders set payment_method = ${card ? 'card' : 'cash'}, subtotal_cents = ${subtotal}, tax_cents = ${taxCents},
                 total_cents = ${subtotal + taxCents}, tip_cents = ${card ? Math.round((subtotal * 0.18) / 25) * 25 : 0} where id = ${o.id}`;
      }
    }

    // ---- three tables open right now: one ready, one cooking, one just started
    const now = new Date(Date.now() - 6 * 60000);
    const openTables: [string, string, number, 'done' | 'sent' | 'new'][] = [
      ['3', 'Priya Shah', 2, 'done'],
      ['7', 'Tom Becker', 4, 'sent'],
      ['10', 'Priya Shah', 2, 'new'],
    ];
    for (const [table, server, guests, state] of openTables) {
      const [o] = await tx`insert into orders (order_type, label, server_id, server_name, created_at)
                           values ('dine_in', ${table}, ${ids[server]}, ${server}, now() - interval '12 minutes') returning id`;
      await addLines(o.id, guests, state === 'new' ? null : now, state === 'done');
    }
  });
}

export async function clearDemo() {
  const sql = db();
  await sql.begin(async (tx) => {
    const [flag] = await tx`select 1 from settings where key = 'demo'`;
    if (!flag) throw new Error('not-demo');
    await tx`truncate order_items, orders, shift_audit, shifts, schedule_shifts, time_off, calendar_events,
             login_attempts, staff restart identity cascade`;
    await tx`delete from settings where key = 'demo'`;
  });
}
