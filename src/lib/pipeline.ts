import { getDb, type EmailType, type Role, type RubricCriterion } from './db';
import { extractPdf } from './pdf';
import { deidentify } from './deidentify';
import { scoreCvAgainstRubric } from './ai/scoring';
import { generateInterviewBrief } from './ai/brief';
import { draftCandidateEmail, finalizeEmail } from './ai/email';
import { getTopCandidateIds, rankCandidatesForRole, SCORED_FILTER } from './ranking';

const ROLES: Role[] = ['pm', 'spm'];
const STALE_PROCESSING_MS = 10 * 60 * 1000;

async function setStage(candidateId: string, stage: string) {
  await getDb()
    .from('candidates')
    .update({ stage, stage_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', candidateId);
}

export async function createCandidate(filename: string, appliedRole: Role): Promise<string> {
  const { data, error } = await getDb()
    .from('candidates')
    .insert({ applied_role: appliedRole, original_filename: filename, status: 'processing', stage: 'queued' })
    .select('id')
    .single();
  if (error) throw new Error(`Could not create candidate: ${error.message}`);
  return data.id as string;
}

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

// Runs the whole pipeline for one candidate. Never throws: every path ends in
// scored or needs_review.
export async function runPipeline(candidateId: string, pdf: Buffer): Promise<'scored' | 'needs_review'> {
  const db = getDb();
  try {
    const { data: cand, error: cErr } = await db
      .from('candidates')
      .select('applied_role, original_filename')
      .eq('id', candidateId)
      .single();
    if (cErr || !cand) throw new Error('Candidate row not found');
    const role = cand.applied_role as Role;

    await setStage(candidateId, 'extracting');
    let extracted;
    try {
      extracted = await extractPdf(pdf);
    } catch (err) {
      await failCandidate(candidateId, `The PDF could not be read: ${err instanceof Error ? err.message : 'unknown error'}`.slice(0, 300));
      return 'needs_review';
    }

    await setStage(candidateId, 'deidentifying');
    const deid = deidentify({
      rawText: extracted.text,
      filename: cand.original_filename as string,
      pdfTitle: extracted.title,
      pdfAuthor: extracted.author,
    });

    // PII (and the raw text) goes to its own table in every case, including failure,
    // so a reviewer can handle it. Nothing in that table ever reaches a model.
    const { error: piiErr } = await db.from('candidate_pii').upsert({
      candidate_id: candidateId,
      name: deid.ok ? deid.name : null,
      email: deid.email,
      phone: deid.phone,
      raw_cv_text: extracted.text,
    });
    if (piiErr) throw new Error(`Could not store personal details: ${piiErr.message}`);

    if (!deid.ok) {
      await failCandidate(candidateId, deid.reason);
      return 'needs_review';
    }
    const { error: redErr } = await db
      .from('candidate_redacted_cv')
      .upsert({ candidate_id: candidateId, redacted_text: deid.redactedText });
    if (redErr) throw new Error(`Could not store de-identified text: ${redErr.message}`);

    await setStage(candidateId, 'scoring');
    await scoreCandidate(candidateId, deid.redactedText);
    // Scores are stored; the candidate stays 'processing' (and counts in the
    // ranking) until its brief/draft exist. Only then is it 'scored'.
    await setStage(candidateId, 'drafting');

    await reconcileRole(role);

    const { data: final } = await db.from('candidates').select('status').eq('id', candidateId).single();
    if (final?.status === 'processing') {
      await db
        .from('candidates')
        .update({ status: 'scored', stage: 'done', updated_at: new Date().toISOString() })
        .eq('id', candidateId);
      return 'scored';
    }
    return final?.status === 'needs_review' ? 'needs_review' : 'scored';
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    await failCandidate(candidateId, `Pipeline stopped: ${message}`).catch(() => {});
    return 'needs_review';
  }
}

export async function processCv(params: { buffer: Buffer; filename: string; role: Role }) {
  const id = await createCandidate(params.filename, params.role);
  const status = await runPipeline(id, params.buffer);
  return { id, status };
}

async function scoreCandidate(candidateId: string, redactedText: string): Promise<void> {
  const db = getDb();
  const { data: allCriteria, error } = await db.from('rubric_criteria').select('*').order('sort_order');
  if (error) throw error;

  // Both rubrics, always, regardless of the role applied for.
  const perRole = await Promise.all(
    ROLES.map(async (role) => {
      const criteria = (allCriteria as RubricCriterion[]).filter((c) => c.role === role);
      if (criteria.length === 0) throw new Error(`No rubric criteria found for ${role}; run scripts/seed-rubric.ts`);
      const results = await scoreCvAgainstRubric(candidateId, redactedText, role, criteria);
      const weightById = new Map(criteria.map((c) => [c.id, Number(c.weight)]));
      const totalWeight = criteria.reduce((s, c) => s + Number(c.weight), 0);
      const weighted = results.reduce((s, r) => s + (r.score / 10) * (weightById.get(r.criterion_id) ?? 0), 0);
      return { role, results, total: Math.round((weighted / totalWeight) * 100 * 100) / 100 };
    }),
  );

  for (const { role, results, total } of perRole) {
    const { error: sErr } = await db.from('candidate_scores').upsert(
      results.map((r) => ({ candidate_id: candidateId, role, criterion_id: r.criterion_id, score: r.score, reason: r.reason })),
      { onConflict: 'candidate_id,role,criterion_id' },
    );
    if (sErr) throw new Error(`Could not store scores: ${sErr.message}`);
    const { error: tErr } = await db
      .from('candidate_role_scores')
      .upsert({ candidate_id: candidateId, role, total_score: total }, { onConflict: 'candidate_id,role' });
    if (tErr) throw new Error(`Could not store totals: ${tErr.message}`);
  }
}

// Makes briefs and drafts match the current ranking for a role: the top 5 get
// a brief and an invite, every other scored candidate gets a rejection and no
// brief. Candidates already sent are left alone. A candidate whose brief or
// draft cannot be produced is moved to needs_review (which purges its scores),
// and the ranking is then re-evaluated, since that can change who is top 5.
export async function reconcileRole(role: Role): Promise<void> {
  const db = getDb();
  for (let pass = 0; pass < 6; pass++) {
    const top = await getTopCandidateIds(role);
    const { data: rows, error } = await db
      .from('candidates')
      .select('id')
      .eq('applied_role', role)
      .or(SCORED_FILTER)
      .neq('status', 'sent');
    if (error) throw error;

    let failures = 0;
    await runLimited((rows ?? []).map((r) => r.id as string), 4, async (id) => {
      try {
        await reconcileCandidate(id, role, top.has(id));
      } catch (err) {
        failures += 1;
        await failCandidate(id, `Brief/draft generation failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    });
    if (failures === 0) return;
  }
  throw new Error('Ranking did not settle after repeated failures.');
}

async function runLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) await fn(queue.shift() as T);
    }),
  );
}

async function reconcileCandidate(candidateId: string, role: Role, isTop: boolean): Promise<void> {
  const db = getDb();
  const [{ data: brief }, { data: email }] = await Promise.all([
    db.from('candidate_briefs').select('candidate_id').eq('candidate_id', candidateId).maybeSingle(),
    db.from('candidate_emails').select('email_type, status').eq('candidate_id', candidateId).maybeSingle(),
  ]);
  const wanted: EmailType = isTop ? 'invite' : 'rejection';
  const emailStale = !email || (email.email_type !== wanted && (email.status === 'draft' || email.status === 'failed'));

  if (!isTop && brief) await db.from('candidate_briefs').delete().eq('candidate_id', candidateId);

  if (!isTop && !emailStale && !brief) return;
  if (isTop && brief && !emailStale) return;

  const { data: red } = await db.from('candidate_redacted_cv').select('redacted_text').eq('candidate_id', candidateId).single();
  const { data: pii } = await db.from('candidate_pii').select('name').eq('candidate_id', candidateId).single();
  if (!red || !pii?.name) throw new Error('De-identified text or name missing');

  if (isTop && !brief) {
    const [{ data: scores }, { data: criteria }] = await Promise.all([
      db.from('candidate_scores').select('criterion_id, score, reason').eq('candidate_id', candidateId).eq('role', role),
      db.from('rubric_criteria').select('id, name').eq('role', role),
    ]);
    const nameById = new Map((criteria ?? []).map((c) => [c.id as number, c.name as string]));
    const text = await generateInterviewBrief(
      candidateId,
      red.redacted_text as string,
      role,
      (scores ?? []).map((s) => ({
        name: nameById.get(s.criterion_id as number) ?? 'criterion',
        score: Number(s.score),
        reason: s.reason as string,
      })),
    );
    // Re-check just before writing: the ranking may have moved while the model was working.
    if (!(await getTopCandidateIds(role)).has(candidateId)) return;
    await db.from('candidate_briefs').upsert({ candidate_id: candidateId, brief_text: text });
  }

  if (emailStale) {
    const draft = finalizeEmail(await draftCandidateEmail(candidateId, red.redacted_text as string, role, wanted), pii.name as string);
    if ((await getTopCandidateIds(role)).has(candidateId) !== isTop) return;
    await saveDraft(candidateId, wanted, draft);
  }
}

// Never overwrites an email that is being sent or has been sent.
async function saveDraft(candidateId: string, type: EmailType, draft: { subject: string; body: string }) {
  const db = getDb();
  const fields = {
    email_type: type,
    subject: draft.subject,
    body: draft.body,
    status: 'draft',
    confirmed_at: null,
    confirmed_hash: null,
    error_message: null,
    updated_at: new Date().toISOString(),
  };
  const { error: insErr } = await db
    .from('candidate_emails')
    .upsert({ candidate_id: candidateId, ...fields }, { onConflict: 'candidate_id', ignoreDuplicates: true });
  if (insErr) throw new Error(`Could not save draft: ${insErr.message}`);
  const { error: updErr } = await db
    .from('candidate_emails')
    .update(fields)
    .eq('candidate_id', candidateId)
    .in('status', ['draft', 'failed']);
  if (updErr) throw new Error(`Could not update draft: ${updErr.message}`);
}

export { rankCandidatesForRole };
