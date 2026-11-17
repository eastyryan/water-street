# Water St. Cafe

One web app that replaces the paper at Water St. Cafe (467 Exchange St., Geneva, NY): the employee list, the time sheet, the order pad, and the kitchen tickets. It runs in a browser on any tablet, phone, or computer.

| Screen | Who uses it | What it does |
| --- | --- | --- |
| **Time Clock** (`/clock`) | Everyone | Tap your name, enter a 4-digit PIN, clock in or out. Shows this week's hours. |
| **Orders** (`/orders`) | Servers | Open a check for a table or a to-go name, tap menu items and options, send to the kitchen, take payment in cash or card, print a check. |
| **Kitchen** (`/kitchen`) | Cooks | New tickets appear on their own. Tap an item to cross it off, tap **Done** to clear the ticket. Tickets turn amber at 10 minutes and red at 20. |
| **Schedule** (`/schedule`) | Everyone | Your next shifts, the team's week and month calendar, and time-off requests. |
| **Manager** (`/manager`) | Owners | Who is on the clock and who is scheduled, today's sales, the schedule builder, time cards (fix, approve, export for payroll), the employee list, menu prices and 86'd items, sales reports. |

## How it works

- **PINs.** Each person has a 4-digit PIN. PINs are stored hashed and checked on the server. Five wrong tries locks that name for five minutes.
- **Time cards.** Clock times come from the server, so changing a tablet's clock changes nothing. A person can have only one open shift. Managers can correct a card or add a missed shift; every change needs a reason and is recorded with the manager's name.
- **Schedule.** Managers build a week by tapping a cell, or copy last week. New shifts are drafts until **Publish week**; staff only see published shifts. Overlapping shifts and shifts on approved time off are refused. The calendar also holds closures and events, such as a Team Room booking.
- **Time off.** Staff request it from the Schedule screen and a manager approves or denies it.
- **Split checks and tips.** Split check moves chosen lines to a new check for the same table. A card tip can be recorded at payment and is reported separately from sales.
- **Prices.** Every item carries the two prices printed on the menu (cash / card). Checks show both totals, and the one charged is saved when the check is paid.
- **Sales tax.** Set to 7.5% to start. Change it under Manager > Menu.
- **Times.** Everything is shown in Eastern time, whatever the device is set to.

## Setting it up

You need a Postgres database (a free [Supabase](https://supabase.com) project works) and a place to host the app ([Vercel](https://vercel.com) works).

1. Copy `.env.example` to `.env.local` and fill in the two values:
   - `DATABASE_URL` - in Supabase: **Connect > Transaction pooler**, copy the URI and put in your database password.
   - `SESSION_SECRET` - any long random string. `openssl rand -base64 48` makes one.
2. Install and create the tables. This also loads the full menu the first time:

   ```bash
   npm install
   ```

   ```bash
   npm run db:setup
   ```

3. Start it:

   ```bash
   npm run dev
   ```

4. Open <http://localhost:3000/manager>. The first visit asks you to create the first manager and PIN. Then add everyone else under **Staff**.

To put it online, import the repo into Vercel and add the same two environment variables there.

## Where things live

```
db/schema.sql          tables
db/menu.mjs            the printed menu, loaded once by db:setup
scripts/setup-db.mjs   creates tables, loads the menu if empty
src/app/api/           server endpoints (auth, clock, orders, kitchen, manager)
src/app/*/page.tsx     the four screens
src/lib/               database, sessions, money maths
```

After the first setup the menu lives in the database. Change prices from Manager > Menu, not by editing `db/menu.mjs`.

## Not built yet

- Card processing. The app records that a check was paid by card; the card itself is still run on the cafe's reader.
- Shift swaps between staff, text or email reminders, and inventory.
