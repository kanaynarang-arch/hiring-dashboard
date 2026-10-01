import { getDashboardData } from '@/lib/queries';
import { testModeRecipient } from '@/lib/send';
import { sweepStaleProcessing } from '@/lib/lifecycle';
import CandidateTable from '@/components/CandidateTable';
import NeedsReviewTable from '@/components/NeedsReviewTable';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  await sweepStaleProcessing().catch(() => {});
  const data = await getDashboardData();
  const testRecipient = testModeRecipient();

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Candidates are ranked within the role they applied for, using that role&apos;s rubric only.
          The top 5 per role get an interview invite draft and a brief; everyone else gets a
          rejection draft. Nothing is sent until you press <b>Confirm &amp; send</b> on that
          candidate.
          {data.processing > 0 && <span className="ml-1 text-amber-700">{data.processing} CV(s) still processing — refresh in a moment.</span>}
        </p>
      </header>
      {testRecipient && (
        <p role="status" className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>Test mode:</b> every email is delivered to <b>{testRecipient}</b> instead of the candidate, with
          &ldquo;[TEST]&rdquo; added to the subject. Candidates are not emailed.
        </p>
      )}
      <CandidateTable title="Product Manager" candidates={data.pm} />
      <CandidateTable title="Senior Product Manager" candidates={data.spm} />
      {data.needsReview.length > 0 && <NeedsReviewTable candidates={data.needsReview} />}
    </main>
  );
}
