'use server';

import { revalidatePath } from 'next/cache';
import { getDb, type Role } from '@/lib/db';
import { processUploadedCv } from '@/lib/pipeline';
import { sendEmail } from '@/lib/resend';
import { applyCandidateName } from '@/lib/namePlaceholder';

export interface UploadState {
  error?: string;
  success?: string;
}

export async function uploadCandidateCv(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const file = formData.get('file');
  const appliedRole = formData.get('appliedRole');

  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Please choose a PDF file.' };
  }
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return { error: 'Only PDF files are accepted.' };
  }
  if (appliedRole !== 'pm' && appliedRole !== 'spm') {
    return { error: 'Please select which role the candidate applied for.' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await processUploadedCv({
      buffer,
      originalFilename: file.name,
      appliedRole: appliedRole as Role,
    });
    revalidatePath('/');
    if (result.status === 'needs_review') {
      return { success: `Uploaded "${file.name}" — flagged for manual review (de-identification was not confident enough to proceed automatically).` };
    }
    return { success: `Uploaded and scored "${file.name}".` };
  } catch (err) {
    console.error('upload failed', err);
    return { error: err instanceof Error ? err.message : 'Something went wrong processing this CV.' };
  }
}

export async function sendCandidateEmail(candidateId: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();

  // Atomic compare-and-swap: only one caller can move a draft into
  // 'sending'. A duplicate click racing in finds zero rows to update and
  // is told the current status instead of sending again.
  const { data: claimed, error: claimErr } = await db
    .from('candidate_emails')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .eq('candidate_id', candidateId)
    .in('status', ['draft', 'failed'])
    .select()
    .maybeSingle();

  if (claimErr) return { ok: false, error: claimErr.message };
  if (!claimed) {
    const { data: existing } = await db
      .from('candidate_emails')
      .select('status, resend_message_id')
      .eq('candidate_id', candidateId)
      .maybeSingle();
    if (existing?.status === 'sent') return { ok: true };
    return { ok: false, error: 'Email is already being sent or does not have a draft.' };
  }

  const { data: pii } = await db.from('candidate_pii').select('name, email').eq('candidate_id', candidateId).single();
  if (!pii) {
    await db
      .from('candidate_emails')
      .update({ status: 'failed', error_message: 'Candidate PII not found' })
      .eq('candidate_id', candidateId);
    return { ok: false, error: 'Candidate contact info not found.' };
  }

  const subject = applyCandidateName(claimed.subject as string, pii.name as string);
  const body = applyCandidateName(claimed.body as string, pii.name as string);

  const result = await sendEmail({
    to: pii.email as string,
    subject,
    body,
    idempotencyKey: candidateId,
  });

  if (result.ok) {
    await db
      .from('candidate_emails')
      .update({
        status: 'sent',
        resend_message_id: result.messageId,
        sent_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('candidate_id', candidateId);
    await db.from('candidates').update({ status: 'sent' }).eq('id', candidateId);
    revalidatePath('/');
    return { ok: true };
  }

  await db
    .from('candidate_emails')
    .update({ status: 'failed', error_message: result.error })
    .eq('candidate_id', candidateId);
  revalidatePath('/');
  return { ok: false, error: result.error };
}
