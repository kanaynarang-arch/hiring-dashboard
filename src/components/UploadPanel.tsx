'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const STAGES = [
  { key: 'queued', label: 'Queued' },
  { key: 'extracting', label: 'Reading the PDF' },
  { key: 'deidentifying', label: 'Separating personal details' },
  { key: 'scoring', label: 'Scoring against the PM and SPM rubrics' },
  { key: 'drafting', label: 'Ranking, brief and draft email' },
  { key: 'done', label: 'Done' },
];

interface Status {
  status: 'processing' | 'scored' | 'needs_review' | 'sent';
  stage: string;
  reason: string | null;
}

export default function UploadPanel() {
  const [role, setRole] = useState<'pm' | 'spm' | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const terminal = status && status.status !== 'processing';

  useEffect(() => {
    if (!candidateId || terminal) return;
    const tick = setInterval(async () => {
      setElapsed(Math.round((Date.now() - startedAt.current) / 1000));
      try {
        const res = await fetch(`/api/candidates/${candidateId}/status`, { cache: 'no-store' });
        if (res.ok) setStatus(await res.json());
      } catch {
        // transient; the next tick retries
      }
    }, 1500);
    return () => clearInterval(tick);
  }, [candidateId, terminal]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!role) return setError('Choose the role the candidate applied for.');
    if (!file) return setError('Choose a PDF file.');
    setBusy(true);
    startedAt.current = Date.now();
    setElapsed(0);
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('role', role);
      const res = await fetch('/api/upload', { method: 'POST', body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Upload failed.');
      setCandidateId(json.id);
      setStatus({ status: 'processing', stage: 'queued', reason: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setCandidateId(null);
    setStatus(null);
    setFile(null);
    setRole('');
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const stageIndex = STAGES.findIndex((s) => s.key === status?.stage);

  return (
    <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6">
      {!candidateId && (
        <form onSubmit={submit} className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Role applied for</legend>
            <div className="flex gap-3">
              {(
                [
                  ['pm', 'Product Manager'],
                  ['spm', 'Senior Product Manager'],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm ${role === value ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white'}`}
                >
                  <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="cv" className="mb-2 block text-sm font-medium">CV (PDF)</label>
            <input
              id="cv"
              ref={inputRef}
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-sm file:text-white"
            />
          </div>
          <button type="submit" disabled={busy} className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? 'Uploading…' : 'Upload and process'}
          </button>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      {candidateId && status && (
        <div>
          <ol className="space-y-2">
            {STAGES.map((s, i) => {
              const done = terminal ? status.status !== 'needs_review' || i < stageIndex : i < stageIndex;
              const active = !terminal && i === stageIndex;
              return (
                <li key={s.key} className={`flex items-center gap-2 text-sm ${done ? 'text-zinc-900' : active ? 'font-medium text-zinc-900' : 'text-zinc-400'}`}>
                  <span className="inline-block w-4">{done ? '✓' : active ? '…' : '·'}</span>
                  {s.label}
                </li>
              );
            })}
          </ol>
          {!terminal && <p className="mt-4 text-xs text-zinc-500">Working… {elapsed}s</p>}
          {terminal && status.status !== 'needs_review' && (
            <div className="mt-5 rounded border border-green-200 bg-green-50 p-4 text-sm text-green-900">
              Scored in {elapsed}s. It is on the dashboard with its ranking, breakdown and draft email.
              <div className="mt-3 flex gap-3">
                <Link href="/dashboard" className="rounded bg-zinc-900 px-3 py-1.5 text-white">Open dashboard</Link>
                <button onClick={reset} className="rounded border border-zinc-300 bg-white px-3 py-1.5">Upload another</button>
              </div>
            </div>
          )}
          {terminal && status.status === 'needs_review' && (
            <div className="mt-5 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">Needs manual review. It was not sent to the AI or scored.</p>
              <p className="mt-1">{status.reason}</p>
              <div className="mt-3 flex gap-3">
                <Link href="/dashboard" className="rounded bg-zinc-900 px-3 py-1.5 text-white">Open dashboard</Link>
                <button onClick={reset} className="rounded border border-zinc-300 bg-white px-3 py-1.5">Upload another</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
