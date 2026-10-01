'use client';

import { useState } from 'react';
import type { DashboardCandidate } from '@/lib/queries';
import { applyCandidateName } from '@/lib/namePlaceholder';
import SendButton from './SendButton';

const ROLE_LABEL = { pm: 'PM', spm: 'SPM' } as const;

export default function CandidateRow({ candidate }: { candidate: DashboardCandidate }) {
  const [open, setOpen] = useState(false);
  const criteria = candidate.scoresByRole[candidate.applied_role];
  const otherRole = candidate.applied_role === 'pm' ? 'spm' : 'pm';

  return (
    <>
      <tr
        className="cursor-pointer border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="px-3 py-2 text-sm text-zinc-400">{candidate.rank}</td>
        <td className="px-3 py-2 text-sm font-medium">{candidate.name}</td>
        <td className="px-3 py-2 text-sm text-zinc-500">{candidate.email}</td>
        <td className="px-3 py-2 text-sm tabular-nums">{candidate.appliedRoleScore?.toFixed(1)}</td>
        <td className="px-3 py-2 text-sm">
          {candidate.isAboveLine ? (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
              Top 5 — Invite
            </span>
          ) : (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              Not selected
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-sm" onClick={(e) => e.stopPropagation()}>
          {candidate.emailDraft && (
            <SendButton candidateId={candidate.id} status={candidate.emailDraft.status} />
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-t border-zinc-100 bg-zinc-50 dark:border-zinc-900 dark:bg-zinc-900/50">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {ROLE_LABEL[candidate.applied_role]} rubric (applied role — used for ranking)
                </h4>
                <ul className="space-y-1.5">
                  {criteria.map((c) => (
                    <li key={c.criterion_id} className="text-sm">
                      <span className="font-medium">{c.name}</span>{' '}
                      <span className="text-zinc-400">({c.weight}%)</span> — {c.score}/10
                      <div className="text-xs text-zinc-500">{c.reason}</div>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-zinc-400">
                  {ROLE_LABEL[otherRole]} score (context only, not used for ranking):{' '}
                  {candidate.otherRoleScore?.toFixed(1) ?? '—'}
                </p>
              </div>

              <div className="space-y-4">
                {candidate.brief && (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Interview brief
                    </h4>
                    <p className="text-sm">{candidate.brief}</p>
                  </div>
                )}
                {candidate.emailDraft && (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Draft email ({candidate.emailDraft.email_type})
                    </h4>
                    <p className="text-sm font-medium">
                      {applyCandidateName(candidate.emailDraft.subject, candidate.name ?? '')}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
                      {applyCandidateName(candidate.emailDraft.body, candidate.name ?? '')}
                    </p>
                    {candidate.emailDraft.status === 'sent' && candidate.emailDraft.sent_at && (
                      <p className="mt-2 text-xs text-green-600">
                        Sent {new Date(candidate.emailDraft.sent_at).toLocaleString()} · message{' '}
                        {candidate.emailDraft.resend_message_id}
                      </p>
                    )}
                    {candidate.emailDraft.status === 'failed' && (
                      <p className="mt-2 text-xs text-red-600">
                        Last error: {candidate.emailDraft.error_message}
                      </p>
                    )}
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
