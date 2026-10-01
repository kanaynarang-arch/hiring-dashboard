import { getDb, type Role, type RubricCriterion } from './db';
import { extractPdfText } from './pdf';
import { deidentifyCv } from './deidentify';
import { scoreCvAgainstRubric } from './ai/scoring';
import { generateInterviewBrief } from './ai/brief';
import { draftCandidateEmail } from './ai/email';
import { getTopCandidateIds } from './ranking';

const ROLES: Role[] = ['pm', 'spm'];

export async function processUploadedCv(params: {
  buffer: Buffer;
  originalFilename: string;
  appliedRole: Role;
}): Promise<{ candidateId: string; status: string }> {
  const db = getDb();
  const rawText = await extractPdfText(params.buffer);

  const { data: candidateRow, error: insertErr } = await db
    .from('candidates')
    .insert({
      applied_role: params.appliedRole,
      original_filename: params.originalFilename,
      status: 'processing',
    })
    .select()
    .single();
  if (insertErr) throw insertErr;
  const candidateId = candidateRow.id as string;

  const deid = deidentifyCv(rawText, params.originalFilename);

  // Always store whatever was found — even on failure — in the isolated
  // PII table, for the founder's manual review. Never in a table an AI
  // prompt is built from.
  await db.from('candidate_pii').insert({
    candidate_id: candidateId,
    name: deid.name ?? '(not confidently detected — see review reason)',
    email: deid.email ?? '(not confidently detected — see review reason)',
    phone: deid.phone ?? null,
    raw_cv_text: rawText,
  });

  if (!deid.ok) {
    await db
      .from('candidates')
      .update({ status: 'needs_review', review_reason: deid.reason, updated_at: new Date().toISOString() })
      .eq('id', candidateId);
    return { candidateId, status: 'needs_review' };
  }

  await db.from('candidate_redacted_cv').insert({
    candidate_id: candidateId,
    redacted_text: deid.redactedText!,
  });

  try {
    await scoreCandidate(candidateId, deid.redactedText!);
    await db
      .from('candidates')
      .update({ status: 'scored', updated_at: new Date().toISOString() })
      .eq('id', candidateId);
    await refreshRoleRanking(params.appliedRole);
    return { candidateId, status: 'scored' };
  } catch (err) {
    // De-identification succeeded, but the AI scoring step failed (e.g. an
    // outage). Surface it as a flagged row rather than leaving the
    // candidate stuck in 'processing' with no visible status.
    const message = err instanceof Error ? err.message : 'Unknown scoring error';
    await db
      .from('candidates')
      .update({
        status: 'needs_review',
        review_reason: `Scoring failed: ${message}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', candidateId);
    return { candidateId, status: 'needs_review' };
  }
}

async function scoreCandidate(candidateId: string, redactedText: string): Promise<void> {
  const db = getDb();

  const { data: allCriteria, error } = await db
    .from('rubric_criteria')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;

  for (const role of ROLES) {
    const criteria = (allCriteria as RubricCriterion[]).filter((c) => c.role === role);
    const results = await scoreCvAgainstRubric(redactedText, role, criteria);

    const rows = results.map((r) => ({
      candidate_id: candidateId,
      role,
      criterion_id: r.criterion_id,
      score: r.score,
      reason: r.reason,
    }));
    const { error: insErr } = await db.from('candidate_scores').insert(rows);
    if (insErr) throw insErr;

    const weightById = new Map(criteria.map((c) => [c.id, Number(c.weight)]));
    const totalWeight = criteria.reduce((sum, c) => sum + Number(c.weight), 0);
    const weightedSum = results.reduce((sum, r) => {
      const weight = weightById.get(r.criterion_id) ?? 0;
      return sum + (r.score / 10) * weight;
    }, 0);
    // Normalized to a 0-100 scale even if weights don't sum to exactly 100.
    const totalScore = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;

    const { error: totErr } = await db
      .from('candidate_role_scores')
      .insert({ candidate_id: candidateId, role, total_score: totalScore });
    if (totErr) throw totErr;
  }
}

// Recomputes the top-5 for a role and generates briefs/email drafts for
// anyone whose above-the-line status is newly decided. A candidate whose
// email has already been sent is never touched again, even if a later,
// higher-scoring upload bumps them out of the top 5 — sending is final.
export async function refreshRoleRanking(role: Role): Promise<void> {
  const db = getDb();
  const topIds = await getTopCandidateIds(role);

  const { data: candidates, error } = await db
    .from('candidates')
    .select('id, status')
    .eq('applied_role', role)
    .in('status', ['scored', 'sent']);
  if (error) throw error;

  for (const candidate of candidates ?? []) {
    const candidateId = candidate.id as string;
    if (candidate.status === 'sent') continue;

    const isAboveLine = topIds.has(candidateId);

    const { data: existingBrief } = await db
      .from('candidate_briefs')
      .select('candidate_id')
      .eq('candidate_id', candidateId)
      .maybeSingle();

    if (isAboveLine && !existingBrief) {
      await generateAndStoreBrief(candidateId, role);
    } else if (!isAboveLine && existingBrief) {
      await db.from('candidate_briefs').delete().eq('candidate_id', candidateId);
    }

    const desiredEmailType = isAboveLine ? 'invite' : 'rejection';
    const { data: existingEmail } = await db
      .from('candidate_emails')
      .select('candidate_id, email_type, status')
      .eq('candidate_id', candidateId)
      .maybeSingle();

    if (!existingEmail) {
      await generateAndStoreEmailDraft(candidateId, role, desiredEmailType);
    } else if (existingEmail.status === 'draft' && existingEmail.email_type !== desiredEmailType) {
      await generateAndStoreEmailDraft(candidateId, role, desiredEmailType);
    }
  }
}

async function generateAndStoreBrief(candidateId: string, role: Role): Promise<void> {
  const db = getDb();
  const [{ data: redacted }, { data: scores }, { data: criteria }] = await Promise.all([
    db.from('candidate_redacted_cv').select('redacted_text').eq('candidate_id', candidateId).single(),
    db.from('candidate_scores').select('criterion_id, score, reason').eq('candidate_id', candidateId).eq('role', role),
    db.from('rubric_criteria').select('id, name').eq('role', role),
  ]);
  if (!redacted) return;

  const nameById = new Map((criteria ?? []).map((c) => [c.id, c.name as string]));
  const scoreList = (scores ?? []).map((s) => ({
    name: nameById.get(s.criterion_id) ?? `criterion ${s.criterion_id}`,
    score: Number(s.score),
    reason: s.reason as string,
  }));

  const briefText = await generateInterviewBrief(redacted.redacted_text, role, scoreList);
  await db.from('candidate_briefs').upsert({ candidate_id: candidateId, brief_text: briefText });
}

async function generateAndStoreEmailDraft(
  candidateId: string,
  role: Role,
  emailType: 'invite' | 'rejection',
): Promise<void> {
  const db = getDb();
  const { data: redacted } = await db
    .from('candidate_redacted_cv')
    .select('redacted_text')
    .eq('candidate_id', candidateId)
    .single();
  if (!redacted) return;

  const draft = await draftCandidateEmail(redacted.redacted_text, role, emailType);

  await db.from('candidate_emails').upsert({
    candidate_id: candidateId,
    email_type: emailType,
    subject: draft.subject,
    body: draft.body,
    status: 'draft',
  });
}
