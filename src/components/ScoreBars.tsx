import type { CriterionScoreView } from '@/lib/queries';

// Why this person is ranked where they are: one bar per rubric criterion, with the model's
// one-line reason underneath. Weights are shown because they drive the ranking.
export default function ScoreBars({ criteria }: { criteria: CriterionScoreView[] }) {
  return (
    <ul className="space-y-3.5">
      {criteria.map((c) => (
        <li key={c.criterion_id}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-zinc-900">
              {c.name} <span className="ml-1 text-xs font-normal text-zinc-400">{c.weight}% of score</span>
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900">{c.score}<span className="font-normal text-zinc-400">/10</span></span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100" role="img" aria-label={`${c.name}: ${c.score} out of 10`}>
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(0, Math.min(10, c.score)) * 10}%` }} />
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-600">{c.reason}</p>
        </li>
      ))}
    </ul>
  );
}
