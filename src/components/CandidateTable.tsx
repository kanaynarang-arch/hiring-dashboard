import type { DashboardCandidate } from '@/lib/queries';
import CandidateRow from './CandidateRow';

export default function CandidateTable({ title, candidates }: { title: string; candidates: DashboardCandidate[] }) {
  const invites = candidates.filter((c) => c.isAboveLine).length;
  return (
    <section>
      <h2 className="mb-2 flex items-baseline gap-3 text-lg font-semibold">
        {title}
        <span className="text-sm font-normal text-zinc-500">
          {candidates.length} scored · top {invites} get an invite
        </span>
      </h2>
      {candidates.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-500">No scored candidates yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full border-collapse text-left">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="w-12 px-3 py-2 font-medium">Rank</th>
                <th className="w-20 px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium">Candidate</th>
                <th className="px-3 py-2 font-medium">Draft</th>
                <th className="px-3 py-2 font-medium">Email status</th>
                <th className="w-44 px-3 py-2 font-medium">Action</th>
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
