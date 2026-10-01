import { Resend } from 'resend';

function client(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set.');
  return new Resend(key);
}

// Incremented on every attempt to reach Resend; tests use it to prove a refused
// send never got this far.
export const resendStats = { calls: 0 };

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

// Only ever called from sendConfirmed() in send.ts, after the persisted
// confirmation, recipient and claim checks. The idempotency key makes a
// retried request return the original message instead of sending again.
export async function sendViaResend(params: {
  to: string;
  subject: string;
  body: string;
  idempotencyKey: string;
}): Promise<SendResult> {
  resendStats.calls += 1;
  const from = process.env.EMAIL_FROM;
  if (!from) return { ok: false, error: 'EMAIL_FROM is not set.' };
  try {
    const { data, error } = await client().emails.send(
      { from, to: params.to, subject: params.subject, text: params.body },
      { idempotencyKey: params.idempotencyKey },
    );
    if (error) return { ok: false, error: `${error.name}: ${error.message}`.slice(0, 300) };
    return { ok: true, messageId: data?.id };
  } catch (err) {
    return { ok: false, error: (err instanceof Error ? err.message : 'Resend request failed').slice(0, 300) };
  }
}

export async function getResendDeliveryStatus(messageId: string): Promise<string | null> {
  const { data } = await client().emails.get(messageId);
  return (data as { last_event?: string } | null)?.last_event ?? null;
}
