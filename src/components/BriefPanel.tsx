import { BRIEF_LABELS, splitBrief } from '@/lib/format';

// The three-sentence brief, laid out as what Arjun needs: why they fit, the best evidence, and
// what to probe if he moves forward.
export default function BriefPanel({ brief }: { brief: string }) {
  const parts = splitBrief(brief);
  if (parts.length !== 3) return <p className="text-sm leading-relaxed text-zinc-700">{brief}</p>;
  return (
    <dl className="space-y-3">
      {parts.map((sentence, i) => (
        <div key={i}>
          <dt className={`text-xs font-semibold uppercase tracking-wide ${i === 2 ? 'text-amber-700' : 'text-zinc-500'}`}>{BRIEF_LABELS[i]}</dt>
          <dd className="mt-0.5 text-sm leading-relaxed text-zinc-800">{sentence}</dd>
        </div>
      ))}
    </dl>
  );
}
