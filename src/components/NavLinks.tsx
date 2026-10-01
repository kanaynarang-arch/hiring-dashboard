'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Upload' },
  { href: '/dashboard', label: 'Dashboard' },
];

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex items-center gap-1">
      {LINKS.map((l) => {
        const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${active ? 'bg-blue-50 text-blue-700' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
