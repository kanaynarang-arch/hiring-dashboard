import type { DashboardCandidate } from '@/lib/queries';

export default function NeedsReviewTable({ candidates }: { candidates: DashboardCandidate[] }) {
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-amber-800">Needs manual review ({candidates.length})</h2>
      <p className="mb-2 text-sm text-zinc-600">
        These were not scored, ranked, briefed or drafted, and nothing about them was sent to the AI.
        Review the original PDF yourself.
      </p>
      <div className="overflow-hidden rounded-lg border border-amber-200 bg-white">
        <table className="w-full border-collapse text-left">
          <thead className="bg-amber-50 text-xs uppercase tracking-wide text-amber-900">
            <tr>
              <th className="px-3 py-2 font-medium">File</th>
              <th className="px-3 py-2 font-medium">Applied for</th>
              <th className="px-3 py-2 font-medium">Why</th>
              <th className="px-3 py-2 font-medium">Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.id} className="border-t border-amber-100">
                <td className="px-3 py-2 text-sm">{c.original_filename}</td>
                <td className="px-3 py-2 text-sm uppercase">{c.applied_role}</td>
                <td className="px-3 py-2 text-sm text-zinc-600">{c.review_reason}</td>
                <td className="px-3 py-2 text-sm text-zinc-400">{new Date(c.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
