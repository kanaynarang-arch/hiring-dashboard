import type { EmailView } from '@/lib/queries';
import { ChevronIcon, MailIcon } from './icons';

export default function EmailPreview({ email, to, testRecipient }: { email: EmailView; to: string | null; testRecipient: string | null }) {
  const label = email.email_type === 'invite' ? 'Interview invite' : 'Rejection';
  return (
    <details className="group rounded-lg border border-zinc-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <MailIcon className="text-zinc-400" />
          Read the draft {label.toLowerCase()}
        </span>
        <ChevronIcon className="text-zinc-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-zinc-100 px-4 py-3">
        <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-zinc-500">
          <dt>To</dt>
          <dd className="text-zinc-700">
            {to ?? '—'}
            {testRecipient && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">test mode: delivered to you instead</span>}
          </dd>
          <dt>Subject</dt>
          <dd className="font-medium text-zinc-900">{email.subject}</dd>
        </dl>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{email.body}</p>
      </div>
    </details>
  );
}
