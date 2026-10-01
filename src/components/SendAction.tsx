'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { EmailStatus, EmailType } from '@/lib/db';
import { AlertIcon, CheckIcon, SpinnerIcon } from './icons';

interface Props {
  candidateId: string;
  emailType: EmailType;
  status: EmailStatus;
  testSend: boolean;
  recipientAllowed: boolean;
  testMode: boolean;
  lastError: string | null;
}

// One explicit button per candidate. Pressing it records a confirmation on the server and then
// sends; the server refuses to send without that stored confirmation, so this is never the only guard.
export default function SendAction({ candidateId, emailType, status, testSend, recipientAllowed, testMode, lastError }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);

  if (status === 'sent' || justSent) {
    const test = testSend || (justSent && testMode);
    return (
      <p role="status" className={`flex items-center gap-1.5 text-sm font-medium ${test ? 'text-amber-700' : 'text-emerald-700'}`}>
        <CheckIcon />
        {test ? 'Test email sent to your inbox. The candidate was not emailed.' : 'Sent'}
      </p>
    );
  }
  if (!recipientAllowed) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-red-700">
        <AlertIcon /> Sending is blocked: this is not a MESA test address.
      </p>
    );
  }

  async function click() {
    setBusy(true);
    setError(null);
    try {
      const confirm = await fetch(`/api/candidates/${candidateId}/confirm`, { method: 'POST' });
      const c = await confirm.json();
      if (!confirm.ok) throw new Error(c.message ?? 'Could not confirm.');
      const send = await fetch(`/api/candidates/${candidateId}/send`, { method: 'POST' });
      const s = await send.json();
      if (!send.ok) throw new Error(s.message ?? 'Send failed.');
      setJustSent(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed.');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const isInvite = emailType === 'invite';
  const label = status === 'failed' ? 'Retry send' : isInvite ? 'Confirm & send invite' : 'Confirm & send rejection';
  const shownError = error ?? (status === 'failed' ? lastError : null);

  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
      <button
        type="button"
        onClick={click}
        disabled={busy}
        className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60 ${isInvite ? 'bg-blue-600 text-white hover:bg-blue-700' : 'border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50'}`}
      >
        {busy && <SpinnerIcon />}
        {busy ? 'Sending…' : label}
      </button>
      <p className="text-xs text-zinc-500">{testMode ? 'Test mode: goes to your inbox, not the candidate.' : 'Nothing is sent until you press this.'}</p>
      {shownError && (
        <p role="alert" className="flex items-start gap-1.5 text-xs text-red-700">
          <AlertIcon className="mt-0.5 shrink-0" /> {shownError}
        </p>
      )}
    </div>
  );
}
