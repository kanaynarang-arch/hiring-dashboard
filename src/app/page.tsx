import UploadPanel from '@/components/UploadPanel';

export default function UploadPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Upload a CV</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Pick the role the person applied for and upload their CV as a PDF. Personal details are
        separated out first and never go to the AI. The rest is scored against both rubrics
        automatically.
      </p>
      <UploadPanel />
    </main>
  );
}
