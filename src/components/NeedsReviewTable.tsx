import type { DashboardCandidate } from '@/lib/queries';
import { ROLE_SHORT } from '@/lib/format';
import { AlertIcon } from './icons';

export default function NeedsReviewTable({ candidates }: { candidates: DashboardCandidate[] }) {
  return (
    <section aria-label="Needs manual review" className="rounded-2xl border border-amber-300 bg-amber-50/60 p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-amber-900">
        <AlertIcon /> Needs your review ({candidates.length})
      </h2>
      <p className="mt-1 text-sm text-amber-900/80">
        The system could not safely separate these candidates&apos; personal details, so it did not score, rank or draft for them, and nothing about them
        went to the AI. Open the original PDF yourself.
      </p>
      <ul className="mt-3 divide-y divide-amber-200 overflow-hidden rounded-xl border border-amber-200 bg-white">
        {candidates.map((c) => (
          <li key={c.id} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[1fr_5rem_2fr] sm:gap-4">
            <span className="truncate font-medium text-zinc-900">{c.original_filename}</span>
            <span className="text-zinc-500">{ROLE_SHORT[c.applied_role]}</span>
            <span className="text-zinc-600">{c.review_reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
