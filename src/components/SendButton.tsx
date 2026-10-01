'use client';

import { useState, useTransition } from 'react';
import { sendCandidateEmail } from '@/app/actions';

export default function SendButton({
  candidateId,
  status,
}: {
  candidateId: string;
  status: 'draft' | 'sent' | 'failed';
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState(status);

  if (localStatus === 'sent') {
    return <span className="text-xs font-medium text-green-600">Sent</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await sendCandidateEmail(candidateId);
            if (result.ok) {
              setLocalStatus('sent');
            } else {
              setError(result.error ?? 'Failed to send');
            }
          });
        }}
        disabled={pending}
        className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-black"
      >
        {pending ? 'Sending…' : localStatus === 'failed' ? 'Retry send' : 'Send email'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
