'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ConfirmSendButton({
  candidateId,
  sent,
  recipientAllowed,
  testSent,
}: {
  candidateId: string;
  sent: boolean;
  testSent: boolean;
  recipientAllowed: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent && testSent) return <span className="text-sm font-medium text-amber-700">Test-sent ✓</span>;
  if (sent) return <span className="text-sm font-medium text-green-700">Sent ✓</span>;
  if (!recipientAllowed) {
    return <span className="text-xs text-red-700">Sending disabled: not a MESA test address</span>;
  }

  async function click() {
    setBusy(true);
    setError(null);
    try {
      // The click persists a confirmation for this candidate first; the send
      // endpoint then refuses to proceed without it.
      const confirm = await fetch(`/api/candidates/${candidateId}/confirm`, { method: 'POST' });
      const c = await confirm.json();
      if (!confirm.ok) throw new Error(c.message ?? 'Could not confirm.');
      const send = await fetch(`/api/candidates/${candidateId}/send`, { method: 'POST' });
      const s = await send.json();
      if (!send.ok) throw new Error(s.message ?? 'Send failed.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed.');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button onClick={click} disabled={busy} className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
        {busy ? 'Sending…' : 'Confirm & send'}
      </button>
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
