-- Water St. Cafe - database schema.
--
-- Applied by `npm run db:setup` (safe to re-run; everything is "if not exists").
--
-- Row level security is switched on for every table with NO policies. The app
-- talks to Postgres directly as the table owner (which bypasses RLS), so this
-- only shuts the door on Supabase's auto-generated public REST API, which
-- would otherwise expose these tables to anyone holding the anon key.

create table if not exists staff (
  id          integer generated always as identity primary key,
  name        text not null,
  role        text not null default 'staff' check (role in ('staff', 'manager')),
  position    text not null default '',
  phone       text not null default '',
  wage_cents  integer check (wage_cents is null or wage_cents >= 0),
  pin_hash    text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists staff_name_unique on staff (lower(name));

create table if not exists login_attempts (
  id          integer generated always as identity primary key,
  staff_id    integer not null references staff(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists login_attempts_idx on login_attempts (staff_id, created_at desc);

-- ---------------------------------------------------------------- time clock
create table if not exists shifts (
  id             integer generated always as identity primary key,
  staff_id       integer not null references staff(id),
  clock_in       timestamptz not null default now(),
  clock_out      timestamptz,
  break_minutes  integer not null default 0 check (break_minutes >= 0),
  status         text not null default 'pending' check (status in ('pending', 'approved')),
  note           text not null default '',
  created_at     timestamptz not null default now(),
  check (clock_out is null or clock_out > clock_in)
);
-- One open shift per person: a double tap or two tablets cannot double clock-in.
create unique index if not exists shifts_one_open_per_staff on shifts (staff_id) where clock_out is null;
create index if not exists shifts_clock_in_idx on shifts (clock_in desc);

-- Append-only record of every manager change to a time card.
create table if not exists shift_audit (
  id          integer generated always as identity primary key,
  shift_id    integer not null,
  actor       text not null,
  action      text not null,
  reason      text not null default '',
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists shift_audit_shift_idx on shift_audit (shift_id, created_at desc);

-- ---------------------------------------------------------------------- menu
create table if not exists menu_categories (
  id    integer generated always as identity primary key,
  name  text not null unique,
  sort  integer not null default 0
);

create table if not exists modifier_groups (
  key         text primary key,
  name        text not null,
  min_select  integer not null default 0,
  max_select  integer not null default 1
);

create table if not exists modifiers (
  id          integer generated always as identity primary key,
  group_key   text not null references modifier_groups(key) on delete cascade,
  name        text not null,
  cash_cents  integer not null default 0,
  card_cents  integer not null default 0,
  sort        integer not null default 0
);

create table if not exists menu_items (
  id               integer generated always as identity primary key,
  category_id      integer not null references menu_categories(id),
  name             text not null,
  description      text not null default '',
  cash_cents       integer not null check (cash_cents >= 0),
  card_cents       integer not null check (card_cents >= 0),
  modifier_groups  text[] not null default '{}',
  is_available     boolean not null default true,   -- false = "86'd" for now
  is_active        boolean not null default true,   -- false = removed from the menu
  sort             integer not null default 0
);

-- -------------------------------------------------------------------- orders
create table if not exists orders (
  id              integer generated always as identity primary key,
  order_type      text not null default 'dine_in' check (order_type in ('dine_in', 'takeout')),
  label           text not null default '',          -- table number or customer name
  server_id       integer references staff(id),
  server_name     text not null default '',
  status          text not null default 'open' check (status in ('open', 'paid', 'void')),
  payment_method  text check (payment_method in ('cash', 'card')),
  subtotal_cents  integer,
  tax_cents       integer,
  total_cents     integer,
  created_at      timestamptz not null default now(),
  closed_at       timestamptz
);
create index if not exists orders_status_idx on orders (status, created_at desc);
create index if not exists orders_closed_idx on orders (closed_at desc);

create table if not exists order_items (
  id            integer generated always as identity primary key,
  order_id      integer not null references orders(id) on delete cascade,
  menu_item_id  integer references menu_items(id) on delete set null,
  name          text not null,
  qty           integer not null default 1 check (qty > 0),
  cash_cents    integer not null,     -- unit price INCLUDING modifiers
  card_cents    integer not null,
  modifiers     jsonb not null default '[]',
  note          text not null default '',
  sent_at       timestamptz,          -- null until sent to the kitchen
  done_at       timestamptz,          -- set when the kitchen finishes it
  created_at    timestamptz not null default now()
);
create index if not exists order_items_order_idx on order_items (order_id);

create table if not exists settings (
  key    text primary key,
  value  text not null
);
insert into settings (key, value) values
  ('tax_pct', '7.5'),              -- Ontario County, NY combined sales tax
  ('card_surcharge_pct', '4')      -- menu lists cash/card prices ~4% apart
on conflict (key) do nothing;

alter table staff            enable row level security;
alter table login_attempts   enable row level security;
alter table shifts           enable row level security;
alter table shift_audit      enable row level security;
alter table menu_categories  enable row level security;
alter table modifier_groups  enable row level security;
alter table modifiers        enable row level security;
alter table menu_items       enable row level security;
alter table orders           enable row level security;
alter table order_items      enable row level security;
alter table settings         enable row level security;

-- ------------------------------------------------------------------ schedule
-- Planned shifts (the schedule), separate from `shifts` (what was actually worked).
create table if not exists schedule_shifts (
  id          integer generated always as identity primary key,
  staff_id    integer not null references staff(id),
  day         date not null,
  start_time  time not null,
  end_time    time not null,
  position    text not null default '',
  note        text not null default '',
  published   boolean not null default false,   -- staff only see published shifts
  created_at  timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists schedule_shifts_day_idx on schedule_shifts (day);

create table if not exists time_off (
  id          integer generated always as identity primary key,
  staff_id    integer not null references staff(id),
  start_day   date not null,
  end_day     date not null,
  reason      text not null default '',
  status      text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decided_by  text not null default '',
  created_at  timestamptz not null default now(),
  check (end_day >= start_day)
);
create index if not exists time_off_days_idx on time_off (start_day, end_day);

-- Anything else that belongs on the cafe calendar: closures, catering, team bookings.
create table if not exists calendar_events (
  id          integer generated always as identity primary key,
  day         date not null,
  title       text not null,
  note        text not null default '',
  kind        text not null default 'event' check (kind in ('event', 'closed')),
  created_at  timestamptz not null default now()
);
create index if not exists calendar_events_day_idx on calendar_events (day);

alter table orders add column if not exists tip_cents integer not null default 0;

alter table schedule_shifts  enable row level security;
alter table time_off         enable row level security;
alter table calendar_events  enable row level security;

-- Which guest at the table ordered each line, so checks can be split per person.
alter table order_items add column if not exists seat integer not null default 1 check (seat between 1 and 20);
insert into settings (key, value) values ('table_count', '12') on conflict (key) do nothing;
