import type { DashboardCandidate } from '@/lib/queries';

export default function NeedsReviewTable({ candidates }: { candidates: DashboardCandidate[] }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold text-amber-700 dark:text-amber-400">
        Needs manual review ({candidates.length})
      </h2>
      <p className="mb-2 text-sm text-zinc-500">
        De-identification could not be completed confidently, so these were never sent to
        scoring. Review the original PDF yourself.
      </p>
      <div className="overflow-hidden rounded-lg border border-amber-200 dark:border-amber-900">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-amber-50 text-left text-xs uppercase tracking-wide text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              <th className="px-3 py-2 font-medium">File</th>
              <th className="px-3 py-2 font-medium">Applied role</th>
              <th className="px-3 py-2 font-medium">Reason</th>
              <th className="px-3 py-2 font-medium">Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.id} className="border-t border-amber-100 dark:border-amber-900">
                <td className="px-3 py-2 text-sm">{c.original_filename}</td>
                <td className="px-3 py-2 text-sm uppercase">{c.applied_role}</td>
                <td className="px-3 py-2 text-sm text-zinc-500">{c.review_reason}</td>
                <td className="px-3 py-2 text-sm text-zinc-400">
                  {new Date(c.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
