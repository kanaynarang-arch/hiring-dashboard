'use client';

import { useState } from 'react';
import type { DashboardCandidate } from '@/lib/queries';
import ConfirmSendButton from './ConfirmSendButton';

const ROLE_LABEL = { pm: 'PM', spm: 'SPM' } as const;

function EmailStatus({ c }: { c: DashboardCandidate }) {
  const e = c.emailDraft;
  if (!e) return <span className="text-zinc-400">—</span>;
  if (e.status === 'sent') {
    return <span className="text-green-700">Sent {e.sent_at ? new Date(e.sent_at).toLocaleTimeString() : ''}</span>;
  }
  if (e.status === 'failed') return <span className="text-red-700">Failed — retry</span>;
  if (e.status === 'sending') return <span className="text-amber-700">Sending…</span>;
  return <span className="text-zinc-600">Draft ready</span>;
}

export default function CandidateRow({ candidate: c }: { candidate: DashboardCandidate }) {
  const [open, setOpen] = useState(false);
  const rubric = c.scoresByRole[c.applied_role];
  const other = c.applied_role === 'pm' ? 'spm' : 'pm';

  return (
    <>
      <tr className="cursor-pointer border-t border-zinc-100 hover:bg-zinc-50" onClick={() => setOpen((v) => !v)}>
        <td className="px-3 py-3 text-sm tabular-nums text-zinc-500">{c.rank}</td>
        <td className="px-3 py-3 text-sm font-semibold tabular-nums">{c.appliedRoleScore?.toFixed(1)}</td>
        <td className="px-3 py-3">
          <div className="text-sm font-medium">{c.name}</div>
          <div className="text-xs text-zinc-500">{c.email}</div>
        </td>
        <td className="px-3 py-3 text-sm">
          {c.isAboveLine ? (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Interview invite</span>
          ) : (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">Rejection</span>
          )}
        </td>
        <td className="px-3 py-3 text-sm">
          <EmailStatus c={c} />
        </td>
        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
          {c.emailDraft && (
            <ConfirmSendButton candidateId={c.id} sent={c.emailDraft.status === 'sent'} recipientAllowed={c.recipientAllowed} />
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-t border-zinc-100 bg-zinc-50">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {ROLE_LABEL[c.applied_role]} rubric breakdown (used for ranking)
                </h4>
                <ul className="space-y-2">
                  {rubric.map((r) => (
                    <li key={r.criterion_id} className="text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="font-medium">
                          {r.name} <span className="font-normal text-zinc-400">({r.weight}%)</span>
                        </span>
                        <span className="tabular-nums">{r.score}/10</span>
                      </div>
                      <div className="text-xs text-zinc-600">{r.reason}</div>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-zinc-400">
                  For reference only, {ROLE_LABEL[other]} rubric total: {c.otherRoleScore?.toFixed(1) ?? '—'} (not used for ranking, briefs or email choice)
                </p>
              </div>
              <div className="space-y-4">
                {c.brief && (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Interview brief</h4>
                    <p className="text-sm">{c.brief}</p>
                  </div>
                )}
                {c.emailDraft && (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Draft email ({c.emailDraft.email_type}) to {c.email}
                    </h4>
                    <div className="rounded border border-zinc-200 bg-white p-3">
                      <p className="text-sm font-medium">{c.emailDraft.subject}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{c.emailDraft.body}</p>
                    </div>
                    {c.emailDraft.status === 'sent' && (
                      <p className="mt-2 text-xs text-green-700">
                        Sent {c.emailDraft.sent_at ? new Date(c.emailDraft.sent_at).toLocaleString() : ''} · Resend message {c.emailDraft.resend_message_id}
                      </p>
                    )}
                    {c.emailDraft.status === 'failed' && <p className="mt-2 text-xs text-red-700">Last error: {c.emailDraft.error_message}</p>}
                    {!c.recipientAllowed && <p className="mt-2 text-xs text-red-700">Refused: this address is not a MESA test address, so it cannot be emailed.</p>}
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
