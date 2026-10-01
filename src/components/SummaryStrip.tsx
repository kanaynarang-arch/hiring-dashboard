interface Props {
  applications: number;
  shortlisted: number;
  awaiting: number;
  heardBack: number;
  testSent: number;
  needsReview: number;
}

function Tile({ label, value, hint, tone = 'default', className = '' }: { label: string; value: string; hint?: string; tone?: 'default' | 'amber'; className?: string }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${tone === 'amber' ? 'border-amber-300 bg-amber-50' : 'border-zinc-200 bg-white'} ${className}`}>
      <div className="text-xs font-medium text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

export default function SummaryStrip({ applications, shortlisted, awaiting, heardBack, testSent, needsReview }: Props) {
  return (
    <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Tile label="Applications" value={String(applications)} hint="across both roles" />
      <Tile label="Shortlisted" value={String(shortlisted)} hint="top 5 per role" />
      <Tile label="Awaiting your send" value={String(awaiting)} hint="drafts ready" />
      <Tile label="Heard back" value={`${heardBack} of ${applications}`} hint={testSent ? `${testSent} test email sent` : 'candidates emailed'} />
      <Tile label="Needs review" value={String(needsReview)} hint={needsReview ? 'handle manually' : 'none'} tone={needsReview ? 'amber' : 'default'} className="col-span-2 lg:col-span-1" />
    </section>
  );
}
