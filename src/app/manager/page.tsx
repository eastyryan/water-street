'use client';
import { useState } from 'react';
import { PinGate, Shell, SignOutButton } from '@/components/ui';
import { MenuTab } from './menu-tab';
import { SalesTab, TodayTab } from './sales-tabs';
import { StaffTab } from './staff-tab';
import { TimeCardsTab } from './timecards-tab';

const TABS = ['Today', 'Time Cards', 'Staff', 'Menu', 'Sales'] as const;

export default function ManagerPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Today');
  return (
    <PinGate need="manager" prompt="Manager sign-in">
      {(session, signOut) => (
        <Shell title="Manager" wide right={<SignOutButton name={session.name} onClick={signOut} />}>
          <nav className="mb-5 flex flex-wrap gap-2 print:hidden">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${t === tab ? 'bg-navy text-white' : 'bg-white text-zinc-700 ring-1 ring-zinc-200'}`}
              >
                {t}
              </button>
            ))}
          </nav>
          {tab === 'Today' ? <TodayTab /> : null}
          {tab === 'Time Cards' ? <TimeCardsTab /> : null}
          {tab === 'Staff' ? <StaffTab /> : null}
          {tab === 'Menu' ? <MenuTab /> : null}
          {tab === 'Sales' ? <SalesTab /> : null}
        </Shell>
      )}
    </PinGate>
  );
}
