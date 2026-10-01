import UploadPanel from '@/components/UploadPanel';

export default function UploadPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight">Upload a CV</h1>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-600">
        Choose the role the person applied for and add their CV. Their name, email and phone are separated out first and never reach the AI. The rest is
        scored against both rubrics, ranked, and drafted for, in about half a minute.
      </p>
      <UploadPanel />
    </main>
  );
}
