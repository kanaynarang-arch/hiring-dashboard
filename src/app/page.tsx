import { getDashboardData } from '@/lib/queries';
import UploadForm from '@/components/UploadForm';
import CandidateTable from '@/components/CandidateTable';
import NeedsReviewTable from '@/components/NeedsReviewTable';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const data = await getDashboardData();

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
        <header>
          <h1 className="text-2xl font-semibold">Kargo Hiring Dashboard</h1>
          <p className="text-sm text-zinc-500">
            Upload a CV and pick the role — it's scored automatically against both rubrics, and
            the top 5 per role get an interview brief and invite draft.
          </p>
        </header>

        <UploadForm />

        {data.needsReview.length > 0 && <NeedsReviewTable candidates={data.needsReview} />}

        <CandidateTable title="Product Manager" candidates={data.pm} />
        <CandidateTable title="Senior Product Manager" candidates={data.spm} />
      </main>
    </div>
  );
}
