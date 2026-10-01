import type { EmailView } from '@/lib/queries';

export default function EmailChip({ email }: { email: EmailView | null }) {
  if (!email) return null;
  const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium';
  if (email.status === 'sent' && email.test_send) return <span className={`${base} bg-amber-100 text-amber-800`}>Test email sent</span>;
  if (email.status === 'sent') return <span className={`${base} bg-emerald-100 text-emerald-800`}>Sent</span>;
  if (email.status === 'failed') return <span className={`${base} bg-red-100 text-red-800`}>Send failed</span>;
  if (email.status === 'sending') return <span className={`${base} bg-amber-100 text-amber-800`}>Sending…</span>;
  return email.email_type === 'invite' ? (
    <span className={`${base} bg-blue-50 text-blue-700`}>Invite ready to send</span>
  ) : (
    <span className={`${base} bg-zinc-100 text-zinc-700`}>Rejection ready to send</span>
  );
}
