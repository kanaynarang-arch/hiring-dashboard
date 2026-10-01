import type { DashboardCandidate } from '@/lib/queries';
import CandidateRow from './CandidateRow';

export default function CandidateTable({
  title,
  candidates,
}: {
  title: string;
  candidates: DashboardCandidate[];
}) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {candidates.length === 0 ? (
        <p className="text-sm text-zinc-400">No candidates yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium">Decision</th>
                <th className="px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <CandidateRow key={c.id} candidate={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
