import type { DashboardCandidate } from '@/lib/queries';
import { formatScore } from '@/lib/format';
import { ChevronIcon } from './icons';
import EmailChip from './EmailChip';
import EmailPreview from './EmailPreview';
import ScoreBars from './ScoreBars';
import SendAction from './SendAction';

// Below the line: one compact row each, expandable with the same evidence as a shortlist card.
export default function CandidateRow({ c, testRecipient }: { c: DashboardCandidate; testRecipient: string | null }) {
  return (
    <details id={`c-${c.id}`} className="group scroll-mt-24 border-t border-zinc-100 first:border-t-0 open:bg-zinc-50/70">
      <summary className="grid cursor-pointer list-none grid-cols-[2rem_1fr_auto_1.25rem] items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 sm:grid-cols-[2.5rem_1fr_9rem_11rem_1.25rem] [&::-webkit-details-marker]:hidden">
        <span className="text-sm tabular-nums text-zinc-400">{c.rank}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-zinc-900">{c.name}</span>
          <span className="block truncate text-xs text-zinc-500">{c.email}</span>
        </span>
        <span className="hidden items-center gap-2 sm:flex" aria-label={`Score ${formatScore(c.appliedRoleScore)} out of 100`}>
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-100">
            <span className="block h-full rounded-full bg-zinc-400" style={{ width: `${Math.max(0, Math.min(100, c.appliedRoleScore ?? 0))}%` }} />
          </span>
          <span className="text-sm font-semibold tabular-nums text-zinc-800">{formatScore(c.appliedRoleScore)}</span>
        </span>
        <span className="justify-self-end sm:justify-self-start">
          <EmailChip email={c.emailDraft} />
        </span>
        <ChevronIcon className="text-zinc-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-6 px-4 pb-5 pt-2 sm:pl-14 lg:grid-cols-2">
        <section aria-label="Why ranked here">
          <h4 className="mb-3 text-sm font-semibold text-zinc-900">Why ranked here · score {formatScore(c.appliedRoleScore)}</h4>
          <ScoreBars criteria={c.scoresByRole[c.applied_role]} />
        </section>
        {c.emailDraft && (
          <section aria-label="Draft email" className="space-y-4">
            <EmailPreview email={c.emailDraft} to={c.email} testRecipient={testRecipient} />
            <SendAction
              candidateId={c.id}
              emailType={c.emailDraft.email_type}
              status={c.emailDraft.status}
              testSend={c.emailDraft.test_send}
              recipientAllowed={c.recipientAllowed}
              testMode={Boolean(testRecipient)}
              lastError={c.emailDraft.error_message}
            />
          </section>
        )}
      </div>
    </details>
  );
}
