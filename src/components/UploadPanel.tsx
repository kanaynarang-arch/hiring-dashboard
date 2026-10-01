'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ROLE_NAME, formatBytes, formatScore } from '@/lib/format';
import { AlertIcon, CheckIcon, FileIcon, SpinnerIcon, UploadIcon } from './icons';

type Role = 'pm' | 'spm';

const ROLES: { value: Role; title: string; blurb: string }[] = [
  { value: 'pm', title: ROLE_NAME.pm, blurb: '2–4 years. The first PM on the core operations platform.' },
  { value: 'spm', title: ROLE_NAME.spm, blurb: '5–8 years. Owns the integration and data layer; the most senior PM.' },
];

const STAGES = [
  { key: 'queued', label: 'Received' },
  { key: 'extracting', label: 'Reading the PDF' },
  { key: 'deidentifying', label: 'Separating personal details from the CV' },
  { key: 'scoring', label: 'Scoring against the PM and SPM rubrics' },
  { key: 'drafting', label: 'Ranking, writing the brief and the draft email' },
];

interface Status {
  status: 'processing' | 'scored' | 'needs_review' | 'sent';
  stage: string;
  reason: string | null;
  role: Role;
  placement: { score: number; rank: number; ofTotal: number; shortlisted: boolean } | null;
}

export default function UploadPanel() {
  const [role, setRole] = useState<Role | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const finished = status !== null && status.status !== 'processing';

  useEffect(() => {
    if (!candidateId || finished) return;
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
  }, [candidateId, finished]);

  function pick(f: File | null | undefined) {
    setError(null);
    if (!f) return;
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) return setError('That is not a PDF. Please choose a PDF CV.');
    if (f.size > 10 * 1024 * 1024) return setError('That PDF is larger than 10 MB.');
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!role) return setError('Choose the role this person applied for.');
    if (!file) return setError('Add the CV as a PDF.');
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
      setStatus({ status: 'processing', stage: 'queued', reason: null, role, placement: null });
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
    setError(null);
    setElapsed(0);
    if (inputRef.current) inputRef.current.value = '';
  }

  const stageIndex = Math.max(0, STAGES.findIndex((s) => s.key === status?.stage));

  if (candidateId && status) {
    return (
      <section aria-live="polite" className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 border-b border-zinc-100 pb-4">
          <FileIcon className="text-zinc-400" width={20} height={20} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-900">{file?.name}</p>
            <p className="text-xs text-zinc-500">Applied for {ROLE_NAME[status.role]}</p>
          </div>
        </div>

        {!finished && (
          <>
            <ol className="mt-5 space-y-3">
              {STAGES.map((s, i) => {
                const done = i < stageIndex;
                const active = i === stageIndex;
                return (
                  <li key={s.key} className={`flex items-center gap-3 text-sm ${done ? 'text-zinc-900' : active ? 'font-medium text-zinc-900' : 'text-zinc-400'}`}>
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${done ? 'bg-emerald-100 text-emerald-700' : active ? 'bg-blue-100 text-blue-700' : 'bg-zinc-100'}`}>
                      {done ? <CheckIcon width={14} height={14} /> : active ? <SpinnerIcon width={14} height={14} /> : <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />}
                    </span>
                    {s.label}
                  </li>
                );
              })}
            </ol>
            <p className="mt-5 text-xs text-zinc-500">Working for {elapsed}s. This usually takes 25–40 seconds.</p>
          </>
        )}

        {finished && status.status !== 'needs_review' && (
          <div className="mt-5">
            <div className="flex items-center gap-2 text-emerald-700">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-100"><CheckIcon width={14} height={14} /></span>
              <p className="font-semibold">Scored and drafted in {elapsed}s</p>
            </div>
            {status.placement && (
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-zinc-50 px-3 py-3">
                  <div className="text-2xl font-bold tabular-nums">{formatScore(status.placement.score)}</div>
                  <div className="text-xs text-zinc-500">score / 100</div>
                </div>
                <div className="rounded-xl bg-zinc-50 px-3 py-3">
                  <div className="text-2xl font-bold tabular-nums">#{status.placement.rank}</div>
                  <div className="text-xs text-zinc-500">of {status.placement.ofTotal} {ROLE_NAME[status.role]} applicants</div>
                </div>
                <div className={`rounded-xl px-3 py-3 ${status.placement.shortlisted ? 'bg-blue-50' : 'bg-zinc-50'}`}>
                  <div className={`text-sm font-semibold ${status.placement.shortlisted ? 'text-blue-700' : 'text-zinc-700'}`}>
                    {status.placement.shortlisted ? 'Shortlisted' : 'Below the line'}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">{status.placement.shortlisted ? 'brief and invite drafted' : 'rejection drafted'}</div>
                </div>
              </div>
            )}
            <p className="mt-4 text-sm text-zinc-600">The draft email is waiting on the dashboard. Nothing is sent until you confirm it.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href={`/dashboard?role=${status.role}#c-${candidateId}`} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                Review on the dashboard
              </Link>
              <button type="button" onClick={reset} className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                Upload another CV
              </button>
            </div>
          </div>
        )}

        {finished && status.status === 'needs_review' && (
          <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="flex items-center gap-2 font-semibold text-amber-900"><AlertIcon /> Needs your review</p>
            <p className="mt-1.5 text-sm text-amber-900/90">
              The system could not safely separate this candidate&apos;s personal details, so it stopped. Nothing about this CV was sent to the AI, and it was
              not scored.
            </p>
            {status.reason && <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-sm text-zinc-700">{status.reason}</p>}
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/dashboard" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">Open dashboard</Link>
              <button type="button" onClick={reset} className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50">Upload another CV</button>
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <fieldset>
        <legend className="text-sm font-semibold text-zinc-900">1. Which role did they apply for?</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {ROLES.map((r) => (
            <label
              key={r.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-600 ${role === r.value ? 'border-blue-600 bg-blue-50/60 ring-1 ring-blue-600' : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'}`}
            >
              <input type="radio" name="role" value={r.value} checked={role === r.value} onChange={() => setRole(r.value)} className="mt-1 h-4 w-4 accent-blue-600" />
              <span>
                <span className="block text-sm font-semibold text-zinc-900">{r.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-zinc-600">{r.blurb}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <p className="text-sm font-semibold text-zinc-900">2. Add the CV</p>
        <label
          htmlFor="cv"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]); }}
          className={`mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-600 ${dragging ? 'border-blue-600 bg-blue-50' : file ? 'border-emerald-300 bg-emerald-50/50' : 'border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50'}`}
        >
          <input id="cv" ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          {file ? (
            <>
              <FileIcon className="text-emerald-600" width={26} height={26} />
              <span className="mt-2 max-w-full truncate text-sm font-semibold text-zinc-900">{file.name}</span>
              <span className="text-xs text-zinc-500">{formatBytes(file.size)} · click or drop to replace</span>
            </>
          ) : (
            <>
              <UploadIcon className="text-zinc-400" width={26} height={26} />
              <span className="mt-2 text-sm font-semibold text-zinc-900">Drop a PDF here, or click to choose</span>
              <span className="text-xs text-zinc-500">PDF only · up to 10 MB</span>
            </>
          )}
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60"
        >
          {busy && <SpinnerIcon />}
          {busy ? 'Uploading…' : 'Upload and process'}
        </button>
        {error && (
          <p role="alert" className="flex items-center gap-1.5 text-sm text-red-700">
            <AlertIcon /> {error}
          </p>
        )}
      </div>
    </form>
  );
}
