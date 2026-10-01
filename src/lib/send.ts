import { createHash } from 'node:crypto';
import { getDb } from './db';
import { sendViaResend } from './resend';

// Test data uses MESA test addresses only. Anything else is refused, in the
// UI and here, before Resend is ever invoked.
export const MESA_TEST_DOMAIN = 'mesaschool.co';

export function isMesaTestAddress(email: string | null | undefined): boolean {
  if (!email) return false;
  const m = email.trim().toLowerCase().match(/^[^@\s]+@([^@\s]+)$/);
  if (!m) return false;
  return m[1] === MESA_TEST_DOMAIN || m[1].endsWith(`.${MESA_TEST_DOMAIN}`);
}

// Test mode (opt-in, off by default): when EMAIL_TEST_RECIPIENT is set, every email is
// delivered to that address instead of the candidate's. A free Resend account without a
// verified domain can only deliver to its owner's own address, and the course test data
// uses MESA test addresses only, so this lets the whole confirm-and-send flow run for real.
export function testModeRecipient(): string | null {
  return process.env.EMAIL_TEST_RECIPIENT?.trim() || null;
}

// The address a draft will actually be sent to.
export function deliveryAddress(storedEmail: string | null | undefined): string | null {
  return testModeRecipient() ?? storedEmail ?? null;
}

export function contentHash(to: string, subject: string, body: string): string {
  return createHash('sha256').update(`${to.toLowerCase()}\n${subject}\n${body}`).digest('hex');
}

export type SendError =
  | 'not_found'
  | 'not_sendable'
  | 'recipient_not_allowed'
  | 'not_confirmed'
  | 'in_progress'
  | 'send_failed';

export interface SendOutcome {
  ok: boolean;
  error?: SendError;
  message: string;
  messageId?: string;
  alreadySent?: boolean;
  httpStatus: number;
}

const fail = (error: SendError, message: string, httpStatus: number): SendOutcome => ({ ok: false, error, message, httpStatus });

// Atomic claim (compare-and-swap on the persisted status). A concurrent or
// repeated click finds nothing to claim. A claim abandoned for 2 minutes can be
// retaken; the Resend idempotency key prevents a second message anyway.
export async function claimForSending(candidateId: string, hash: string): Promise<boolean> {
  const staleCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data } = await getDb()
    .from('candidate_emails')
    .update({ status: 'sending', sending_started_at: new Date().toISOString(), error_message: null })
    .eq('candidate_id', candidateId)
    .eq('confirmed_hash', hash)
    .or(`status.in.(draft,failed),and(status.eq.sending,sending_started_at.lt.${staleCutoff})`)
    .select('candidate_id')
    .maybeSingle();
  return Boolean(data);
}

async function loadForSend(candidateId: string) {
  const db = getDb();
  const [{ data: cand }, { data: email }, { data: pii }] = await Promise.all([
    db.from('candidates').select('status').eq('id', candidateId).maybeSingle(),
    db.from('candidate_emails').select('*').eq('candidate_id', candidateId).maybeSingle(),
    db.from('candidate_pii').select('email').eq('candidate_id', candidateId).maybeSingle(),
  ]);
  return { cand, email, to: deliveryAddress(pii?.email as string | null) };
}

// Step 1 — the founder's click. Persists a confirmation bound to the exact
// recipient, subject and body that were on screen.
export async function confirmSend(candidateId: string): Promise<SendOutcome> {
  const { cand, email, to } = await loadForSend(candidateId);
  if (!cand || !email) return fail('not_found', 'No such candidate or draft.', 404);
  if (cand.status === 'sent' || email.status === 'sent') {
    return { ok: true, alreadySent: true, message: 'Already sent.', messageId: email.resend_message_id ?? undefined, httpStatus: 200 };
  }
  if (cand.status !== 'scored') return fail('not_sendable', 'Only scored candidates can be emailed.', 409);
  if (!to || !isMesaTestAddress(to)) {
    return fail('recipient_not_allowed', `Refused: the stored address is not a MESA test address (@${MESA_TEST_DOMAIN}).`, 403);
  }
  const hash = contentHash(to, email.subject, email.body);
  const { error } = await getDb()
    .from('candidate_emails')
    .update({ confirmed_at: new Date().toISOString(), confirmed_hash: hash })
    .eq('candidate_id', candidateId)
    .in('status', ['draft', 'failed']);
  if (error) return fail('send_failed', 'Could not record the confirmation.', 500);
  return { ok: true, message: 'Confirmed.', httpStatus: 200 };
}

// Step 2 — the only code path that calls Resend. Requires the persisted
// confirmation for this candidate and this exact content; a button, a
// disabled state or a client flag is never what enforces that.
export async function sendConfirmed(candidateId: string): Promise<SendOutcome> {
  const db = getDb();
  const { cand, email, to } = await loadForSend(candidateId);
  if (!cand || !email) return fail('not_found', 'No such candidate or draft.', 404);

  if (cand.status === 'sent' || email.status === 'sent') {
    return { ok: true, alreadySent: true, message: 'Already sent; nothing was sent again.', messageId: email.resend_message_id ?? undefined, httpStatus: 200 };
  }
  if (cand.status !== 'scored') return fail('not_sendable', 'Only scored candidates can be emailed.', 409);
  if (!to || !isMesaTestAddress(to)) {
    return fail('recipient_not_allowed', `Refused: the stored address is not a MESA test address (@${MESA_TEST_DOMAIN}).`, 403);
  }

  const hash = contentHash(to, email.subject, email.body);
  if (!email.confirmed_at || email.confirmed_hash !== hash) {
    return fail('not_confirmed', 'This draft has not been confirmed (or it changed after confirmation).', 409);
  }

  if (!(await claimForSending(candidateId, hash))) {
    return fail('in_progress', 'This email is already being sent or has been sent.', 409);
  }

  const result = await sendViaResend({
    to,
    subject: testModeRecipient() ? `[TEST] ${email.subject}` : email.subject,
    body: email.body,
    idempotencyKey: `kargo-send-${candidateId}-${hash.slice(0, 24)}`,
  });

  if (!result.ok) {
    await db
      .from('candidate_emails')
      .update({ status: 'failed', error_message: result.error ?? 'Send failed', updated_at: new Date().toISOString() })
      .eq('candidate_id', candidateId);
    return fail('send_failed', result.error ?? 'Send failed', 502);
  }

  await db
    .from('candidate_emails')
    .update({ status: 'sent', resend_message_id: result.messageId, sent_at: new Date().toISOString(), error_message: null, updated_at: new Date().toISOString() })
    .eq('candidate_id', candidateId);
  await db.from('candidates').update({ status: 'sent', stage: 'sent', updated_at: new Date().toISOString() }).eq('id', candidateId);
  return { ok: true, message: 'Sent.', messageId: result.messageId, httpStatus: 200 };
}
