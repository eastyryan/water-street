import Image from 'next/image';
import Link from 'next/link';
import { ChefHat, Clock, ClipboardList, LayoutDashboard } from 'lucide-react';

const TILES = [
  { href: '/clock', title: 'Time Clock', sub: 'Clock in or out', Icon: Clock },
  { href: '/orders', title: 'Orders', sub: 'Take and close out checks', Icon: ClipboardList },
  { href: '/kitchen', title: 'Kitchen', sub: 'Tickets on the line', Icon: ChefHat },
  { href: '/manager', title: 'Manager', sub: 'Staff, hours, menu, sales', Icon: LayoutDashboard },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center p-6">
      <Image src="/logo.png" alt="Water St. Cafe, est. 2020" width={800} height={508} priority className="h-auto w-72 mix-blend-multiply" />
      <div className="mt-8 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        {TILES.map(({ href, title, sub, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-4 rounded-2xl bg-navy p-5 text-white shadow-sm transition hover:bg-navy-dark"
          >
            <Icon size={34} strokeWidth={1.6} />
            <span>
              <span className="block text-xl font-semibold">{title}</span>
              <span className="block text-sm text-white/75">{sub}</span>
            </span>
          </Link>
        ))}
      </div>
      <p className="mt-8 text-sm text-zinc-500">467 Exchange St. · Geneva, NY</p>
    </main>
  );
}
