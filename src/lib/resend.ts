import { Resend } from 'resend';

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY must be set');
    _resend = new Resend(key);
  }
  return _resend;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

// idempotencyKey is passed through to Resend so a network-level retry of
// the same request can never result in two sends of the same email.
export async function sendEmail(params: {
  to: string;
  subject: string;
  body: string;
  idempotencyKey: string;
}): Promise<SendResult> {
  const from = process.env.EMAIL_FROM;
  if (!from) return { ok: false, error: 'EMAIL_FROM is not configured' };

  const { data, error } = await getResend().emails.send(
    {
      from,
      to: params.to,
      subject: params.subject,
      text: params.body,
    },
    { idempotencyKey: params.idempotencyKey },
  );

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, messageId: data?.id };
}
