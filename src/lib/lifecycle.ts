import { getDb } from './db';

const STALE_PROCESSING_MS = 10 * 60 * 1000;

// Moves a candidate to needs_review and removes everything derived from AI
// work, so a flagged candidate can never retain a score, brief or draft.
// A candidate that has already been sent is never touched.
export async function failCandidate(candidateId: string, reason: string): Promise<void> {
  const db = getDb();
  const { data: row } = await db.from('candidates').select('status, applied_role').eq('id', candidateId).maybeSingle();
  if (!row || row.status === 'sent') return;
  await db.from('candidate_emails').delete().eq('candidate_id', candidateId);
  await db.from('candidate_briefs').delete().eq('candidate_id', candidateId);
  await db.from('candidate_scores').delete().eq('candidate_id', candidateId);
  await db.from('candidate_role_scores').delete().eq('candidate_id', candidateId);
  await db
    .from('candidates')
    .update({
      status: 'needs_review',
      stage: 'needs_review',
      review_reason: reason.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq('id', candidateId);
}

// Anything stuck mid-flight (e.g. the function was killed) is moved to a
// terminal state, so nothing can sit in an intermediate status.
export async function sweepStaleProcessing(): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const { data } = await db.from('candidates').select('id').eq('status', 'processing').lt('updated_at', cutoff);
  for (const row of data ?? []) {
    await failCandidate(row.id as string, 'Processing did not finish (timed out); upload the CV again.');
  }
  return data?.length ?? 0;
}
