import Link from 'next/link';
import type { Role } from '@/lib/db';
import { ROLE_NAME, maskEmail } from '@/lib/format';
import { sweepStaleProcessing } from '@/lib/lifecycle';
import { getDashboardData } from '@/lib/queries';
import { reopenTestSends, testModeRecipient } from '@/lib/send';
import CandidateCard from '@/components/CandidateCard';
import CandidateRow from '@/components/CandidateRow';
import HashOpener from '@/components/HashOpener';
import NeedsReviewTable from '@/components/NeedsReviewTable';
import RoleTabs from '@/components/RoleTabs';
import SummaryStrip from '@/components/SummaryStrip';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role: roleParam } = await searchParams;
  await sweepStaleProcessing().catch(() => {});
  await reopenTestSends().catch(() => {});
  const data = await getDashboardData();
  const testRecipient = testModeRecipient();

  const role: Role = roleParam === 'spm' ? 'spm' : 'pm';
  const list = data[role];
  const shortlist = list.filter((c) => c.isAboveLine);
  const belowLine = list.filter((c) => !c.isAboveLine);

  const scored = [...data.pm, ...data.spm];
  const sentReal = scored.filter((c) => c.emailDraft?.status === 'sent' && !c.emailDraft.test_send).length;
  const sentTest = scored.filter((c) => c.emailDraft?.status === 'sent' && c.emailDraft.test_send).length;
  const applications = scored.length + data.needsReview.length + data.processing;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <HashOpener />
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Hiring dashboard</h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-600">
          The system ranks and explains. You decide and send. Candidates are ranked within the role they applied for, using that role&apos;s rubric only.
          Nothing is emailed until you press the button on that candidate.
        </p>
      </header>

      <SummaryStrip
        applications={applications}
        shortlisted={scored.filter((c) => c.isAboveLine).length}
        awaiting={scored.filter((c) => c.emailDraft && c.emailDraft.status !== 'sent').length}
        heardBack={sentReal}
        testSent={sentTest}
        needsReview={data.needsReview.length}
      />

      {testRecipient && (
        <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>Test mode.</b> Every email is delivered to <b>{maskEmail(testRecipient)}</b> instead of the candidate, with &ldquo;[TEST]&rdquo; in the subject.
          No candidate will be emailed.
        </p>
      )}
      {data.processing > 0 && (
        <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {data.processing} CV{data.processing > 1 ? 's are' : ' is'} still being processed.{' '}
          <Link href={`/dashboard?role=${role}`} className="font-semibold underline">Refresh</Link> in a moment.
        </p>
      )}
      {data.needsReview.length > 0 && <NeedsReviewTable candidates={data.needsReview} />}

      <RoleTabs active={role} counts={{ pm: data.pm.length, spm: data.spm.length }} />

      <section aria-labelledby="shortlist" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="shortlist" className="text-lg font-semibold">
            Shortlist · {ROLE_NAME[role]}
          </h2>
          <p className="text-sm text-zinc-500">Top {shortlist.length || 5}. Each has an interview brief and a draft invite.</p>
        </div>
        {shortlist.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
            No scored candidates for this role yet. <Link href="/" className="font-semibold text-blue-700 underline">Upload a CV</Link> to start.
          </p>
        ) : (
          shortlist.map((c) => <CandidateCard key={c.id} c={c} testRecipient={testRecipient} />)
        )}
      </section>

      {belowLine.length > 0 && (
        <section aria-labelledby="below" className="space-y-3">
          <div>
            <h2 id="below" className="text-lg font-semibold">
              Below the line · {belowLine.length} candidates
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              Look through these once. Each has a warm rejection drafted from their own CV; it is only sent when you confirm it. Open a row to see why they
              ranked here.
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            {belowLine.map((c) => (
              <CandidateRow key={c.id} c={c} testRecipient={testRecipient} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
