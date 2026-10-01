import Link from 'next/link';
import type { Role } from '@/lib/db';
import { ROLE_NAME, ROLE_SHORT } from '@/lib/format';

export default function RoleTabs({ active, counts }: { active: Role; counts: Record<Role, number> }) {
  return (
    <nav aria-label="Role" className="flex gap-1 border-b border-zinc-200">
      {(['pm', 'spm'] as Role[]).map((r) => (
        <Link
          key={r}
          href={`/dashboard?role=${r}`}
          aria-current={active === r ? 'page' : undefined}
          aria-label={`${ROLE_NAME[r]}, ${counts[r]} candidates`}
          className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 ${active === r ? 'border-blue-600 text-blue-700' : 'border-transparent text-zinc-500 hover:text-zinc-800'}`}
        >
          <span className="sm:hidden">{ROLE_SHORT[r]}</span>
          <span className="hidden sm:inline">{ROLE_NAME[r]}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${active === r ? 'bg-blue-100 text-blue-700' : 'bg-zinc-100 text-zinc-600'}`}>{counts[r]}</span>
        </Link>
      ))}
    </nav>
  );
}
