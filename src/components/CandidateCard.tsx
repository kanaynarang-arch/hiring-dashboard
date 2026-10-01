import type { DashboardCandidate } from '@/lib/queries';
import { ROLE_SHORT, formatScore } from '@/lib/format';
import BriefPanel from './BriefPanel';
import EmailChip from './EmailChip';
import EmailPreview from './EmailPreview';
import ScoreBars from './ScoreBars';
import SendAction from './SendAction';

// A shortlisted candidate: everything Arjun needs to decide without opening a PDF.
export default function CandidateCard({ c, testRecipient }: { c: DashboardCandidate; testRecipient: string | null }) {
  const rubric = c.scoresByRole[c.applied_role];
  const other = c.applied_role === 'pm' ? 'spm' : 'pm';
  return (
    <article id={`c-${c.id}`} className="scroll-mt-24 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 bg-gradient-to-r from-blue-50/60 to-white px-5 py-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-600 text-base font-bold text-white" aria-label={`Rank ${c.rank}`}>
            {c.rank}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold leading-tight text-zinc-900">{c.name}</h3>
            <p className="truncate text-sm text-zinc-500">{c.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <EmailChip email={c.emailDraft} />
          <div className="text-right">
            <div className="text-3xl font-bold leading-none tabular-nums text-zinc-900">{formatScore(c.appliedRoleScore)}</div>
            <div className="mt-1 text-xs text-zinc-500">{ROLE_SHORT[c.applied_role]} rubric score / 100</div>
          </div>
        </div>
      </header>

      <div className="grid gap-x-10 gap-y-6 px-5 py-5 md:grid-cols-2">
        <section aria-label="Interview brief">
          <h4 className="mb-3 text-sm font-semibold text-zinc-900">Interview brief</h4>
          {c.brief ? <BriefPanel brief={c.brief} /> : <p className="text-sm text-zinc-500">No brief.</p>}
        </section>
        <section aria-label="Why this rank">
          <h4 className="mb-3 text-sm font-semibold text-zinc-900">Why ranked here</h4>
          <ScoreBars criteria={rubric} />
          <p className="mt-3 text-xs text-zinc-400">
            For reference only: {ROLE_SHORT[other]} rubric score {formatScore(c.otherRoleScore)}. Ranking uses only the role they applied for.
          </p>
        </section>
      </div>

      {c.emailDraft && (
        <footer className="grid gap-4 border-t border-zinc-100 bg-zinc-50/60 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-start">
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
        </footer>
      )}
    </article>
  );
}
