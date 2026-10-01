// Adversarial tests (3a-3f). Runs the real pipeline in-process against the real
// database and the real Gemini API, recording every outgoing Gemini HTTP request.
// Usage: npx tsx --env-file=.env.local tests/integration/adversarial.ts <cv-folder>
// Needs the dev/prod server on BASE_URL for the direct-API checks (3b).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getDb } from '../../src/lib/db';
import { processCv } from '../../src/lib/pipeline';
import { setAiRequestRecorder, getModelId, type AiRequestRecord } from '../../src/lib/ai/model';
import { generateStructured, LeakBlockedError } from '../../src/lib/ai/guard';
import { assertNoLeak, nameTokens } from '../../src/lib/leakcheck';
import { rankCandidatesForRole, getTopCandidateIds } from '../../src/lib/ranking';
import { getDashboardData } from '../../src/lib/queries';
import { claimForSending, confirmSend, sendConfirmed, contentHash } from '../../src/lib/send';
import { resendStats } from '../../src/lib/resend';
import { z } from 'zod';
import { BASE_URL, Checks, cvDir, clearAllCandidates } from './lib';
import { CV_BODY, makePdf } from './pdf';

const checks = new Checks();
const requests: AiRequestRecord[] = [];
setAiRequestRecorder((r) => requests.push(r));
const reqsFor = (id: string) => requests.filter((r) => r.candidateId === id);

const goodCv = (email = 'jane.roe@example.org') => makePdf([
  'Jane Roe', 'Product Manager',
  `+91 91234 56789 | ${email} | Mumbai | linkedin.com/in/janeroe-pm`, ...CV_BODY,
]);
const ambiguousCv = makePdf([
  'Jane Roe | Jane Roe', 'Sam Lee | Sam Lee',
  '+91 91234 56789 | contact@example.org | Mumbai', ...CV_BODY,
]);
const noEmailCv = makePdf(['Jane Roe', 'Product Manager', '+91 91234 56789 | Mumbai | linkedin.com/in/janeroe-pm', ...CV_BODY]);

function payloadTexts(body: string): string {
  const j = JSON.parse(body);
  const parts: string[] = [];
  for (const c of j.contents ?? []) for (const p of c.parts ?? []) if (p.text) parts.push(p.text);
  for (const p of j.systemInstruction?.parts ?? []) if (p.text) parts.push(p.text);
  return parts.join('\n');
}

async function rowsFor(id: string) {
  const db = getDb();
  const [s, t, b, e, r] = await Promise.all([
    db.from('candidate_scores').select('id').eq('candidate_id', id),
    db.from('candidate_role_scores').select('role').eq('candidate_id', id),
    db.from('candidate_briefs').select('candidate_id').eq('candidate_id', id),
    db.from('candidate_emails').select('candidate_id').eq('candidate_id', id),
    db.from('candidate_redacted_cv').select('candidate_id').eq('candidate_id', id),
  ]);
  return { scores: s.data?.length ?? 0, totals: t.data?.length ?? 0, briefs: b.data?.length ?? 0, emails: e.data?.length ?? 0, redacted: r.data?.length ?? 0 };
}

(async () => {
  if (process.env.EMAIL_TEST_RECIPIENT) throw new Error('Unset EMAIL_TEST_RECIPIENT before running this suite: test mode would redirect (and really send) the 3b/3f emails.');
  const dir = cvDir();
  await clearAllCandidates();
  const cleanup: string[] = [];

  // ---------- 3a: ambiguous CV -> needs_review and no Gemini request ----------
  console.log('\n== 3a ambiguous / unresolvable CVs make no Gemini request ==');
  for (const [label, pdf, expect] of [
    ['two corroborated names', ambiguousCv, /ambiguous/],
    ['no email address', noEmailCv, /No email/],
  ] as const) {
    const before = requests.length;
    const r = await processCv({ buffer: pdf, filename: 'resume.pdf', role: 'pm' });
    cleanup.push(r.id);
    const { data } = await getDb().from('candidates').select('status, review_reason').eq('id', r.id).single();
    const rows = await rowsFor(r.id);
    checks.check(`3a (${label}): becomes needs_review with a stored reason`, data?.status === 'needs_review' && expect.test(String(data.review_reason)), String(data?.review_reason).slice(0, 90));
    checks.check(`3a (${label}): zero requests were made to Gemini`, requests.length === before && reqsFor(r.id).length === 0);
    checks.check(`3a (${label}): no de-identified text, scores, brief or draft stored`, rows.redacted === 0 && rows.scores === 0 && rows.totals === 0 && rows.briefs === 0 && rows.emails === 0);
  }

  // ---------- 3c: payload to Gemini has no PII; final email has the real name ----------
  console.log('\n== 3c Gemini request payloads vs the stored personal details ==');
  const cvFile = 'pm_03_deepika_nair.pdf';
  const real = await processCv({ buffer: readFileSync(path.join(dir, cvFile)), filename: cvFile, role: 'pm' });
  cleanup.push(real.id);
  checks.check('3c: test candidate reached scored', real.status === 'scored');
  const { data: pii } = await getDb().from('candidate_pii').select('name,email,phone,raw_cv_text').eq('candidate_id', real.id).single();
  const mine = reqsFor(real.id);
  checks.check('3c: Gemini was called for this candidate (2 rubric scores + brief + email)', mine.length >= 4, `${mine.length} requests`);
  checks.check(`3c: every request targeted only the configured model (${getModelId()})`, mine.every((r) => r.url.includes(`/models/${getModelId()}:`)));
  let leaks: string[] = [];
  for (const [i, r] of mine.entries()) {
    const text = payloadTexts(r.body);
    const lower = text.toLowerCase();
    const found: string[] = [];
    for (const tk of nameTokens(pii!.name)) if (tk.length >= 4 ? lower.includes(tk.toLowerCase()) : new RegExp(`(?<![a-z0-9])${tk.toLowerCase()}(?![a-z0-9])`).test(lower)) found.push('name');
    if (lower.includes(String(pii!.email).toLowerCase())) found.push('email');
    const phone10 = String(pii!.phone).replace(/\D/g, '').slice(-10);
    if ((text.match(/[+\d][\d (). -]{5,}\d/g) ?? []).some((run) => run.replace(/\D/g, '').includes(phone10))) found.push('phone');
    // raw (unredacted) text: no raw line that carries PII may appear in the payload
    const piiLines = String(pii!.raw_cv_text).split('\n').map((l) => l.trim().toLowerCase()).filter((l) => l.length > 6 && (l.includes('@') || l.includes('linkedin') || nameTokens(pii!.name).some((tk) => l.includes(tk.toLowerCase()))));
    if (piiLines.some((l) => lower.includes(l))) found.push('raw-pii-line');
    if (lower.includes(String(pii!.raw_cv_text).toLowerCase().slice(0, 400))) found.push('raw-text-block');
    if (!assertNoLeak({ name: pii!.name, email: pii!.email, phone: pii!.phone }, text).pass) found.push('leakcheck');
    if (found.length) leaks.push(`req${i}:${[...new Set(found)].join('+')}`);
  }
  checks.check('3c: no request contains the name, email, phone, a raw PII line or raw text', leaks.length === 0, leaks.join(' ') || `${mine.length} payloads clean`);
  const { data: em } = await getDb().from('candidate_emails').select('subject,body,email_type').eq('candidate_id', real.id).single();
  checks.check("3c: the final stored email contains the candidate's real name", Boolean(em && em.body.includes(pii!.name)), `name present: ${em?.body.includes(pii!.name)}`);
  checks.check('3c: the final email has no placeholder', !/\{\{|\}\}|\[NAME\]|\[REDACTED\]/.test(`${em?.subject}\n${em?.body}`));

  // pre-flight block: a payload that contains the stored name is stopped before any request
  const before = requests.length;
  let blocked = false;
  try {
    await generateStructured({ candidateId: real.id, system: 'test', prompt: `Write about ${pii!.name}`, schema: z.object({ x: z.string() }) });
  } catch (e) { blocked = e instanceof LeakBlockedError; }
  checks.check('3c: a payload containing the stored name is blocked before the model is called', blocked && requests.length === before);

  // ---------- 3b: send without a persisted confirmation ----------
  console.log('\n== 3b send for an unconfirmed candidate ==');
  const callsBefore = resendStats.calls;
  const http = await fetch(`${BASE_URL}/api/candidates/${real.id}/send`, { method: 'POST' });
  const httpJson = await http.json();
  const { data: emRow } = await getDb().from('candidate_emails').select('status,sending_started_at,error_message,resend_message_id,confirmed_at').eq('candidate_id', real.id).single();
  checks.check('3b: direct POST /send without confirmation is rejected (409 not_confirmed)', http.status === 409 && httpJson.error === 'not_confirmed', `HTTP ${http.status}`);
  checks.check('3b: the draft row is untouched (no claim, no error, no message id) so Resend was not reached', emRow?.status === 'draft' && !emRow.sending_started_at && !emRow.error_message && !emRow.resend_message_id && !emRow.confirmed_at);
  const direct = await sendConfirmed(real.id);
  checks.check('3b: in-process sendConfirmed is rejected and the Resend wrapper was never called', !direct.ok && direct.error === 'not_confirmed' && resendStats.calls === callsBefore, `resend calls: ${resendStats.calls - callsBefore}`);

  // confirmation is bound to the exact content
  const conf = await confirmSend(real.id);
  checks.check('3b: confirm persists a confirmation (MESA address)', conf.ok);
  await getDb().from('candidate_emails').update({ body: `${em!.body}\nP.S. edited after confirmation` }).eq('candidate_id', real.id);
  const edited = await sendConfirmed(real.id);
  checks.check('3b: editing the draft after confirmation invalidates it; Resend still not called', !edited.ok && edited.error === 'not_confirmed' && resendStats.calls === callsBefore);
  await getDb().from('candidate_emails').update({ body: em!.body, confirmed_at: null, confirmed_hash: null }).eq('candidate_id', real.id);

  // atomic claim: 8 concurrent claimers, exactly one wins
  await confirmSend(real.id);
  const { data: cur } = await getDb().from('candidate_emails').select('subject,body,confirmed_hash').eq('candidate_id', real.id).single();
  const hash = cur!.confirmed_hash as string;
  checks.check('3b: stored confirmation hash matches the current content', hash === contentHash(pii!.email, cur!.subject, cur!.body));
  const claims = await Promise.all(Array.from({ length: 8 }, () => claimForSending(real.id, hash)));
  checks.check('3b: atomic claim - 8 concurrent attempts, exactly 1 wins', claims.filter(Boolean).length === 1, `winners: ${claims.filter(Boolean).length}`);
  await getDb().from('candidate_emails').update({ status: 'draft', sending_started_at: null, confirmed_at: null, confirmed_hash: null }).eq('candidate_id', real.id);

  // ---------- 3f: non-MESA address is refused ----------
  console.log('\n== 3f send to a non-MESA address ==');
  const ext = await processCv({ buffer: goodCv('jane.roe@example.org'), filename: 'Jane_Roe_CV.pdf', role: 'spm' });
  cleanup.push(ext.id);
  checks.check('3f: synthetic candidate with a non-MESA address was scored', ext.status === 'scored', ext.status);
  const c0 = resendStats.calls;
  const confHttp = await fetch(`${BASE_URL}/api/candidates/${ext.id}/confirm`, { method: 'POST' });
  const sendHttp = await fetch(`${BASE_URL}/api/candidates/${ext.id}/send`, { method: 'POST' });
  const sendIn = await sendConfirmed(ext.id);
  const { data: extRow } = await getDb().from('candidate_emails').select('status,confirmed_at,sending_started_at,resend_message_id').eq('candidate_id', ext.id).single();
  checks.check('3f: confirm and send are both refused with 403 recipient_not_allowed', confHttp.status === 403 && sendHttp.status === 403 && sendIn.error === 'recipient_not_allowed', `${confHttp.status}/${sendHttp.status}`);
  checks.check('3f: nothing was recorded or sent; Resend wrapper not called', extRow?.status === 'draft' && !extRow.confirmed_at && !extRow.sending_started_at && !extRow.resend_message_id && resendStats.calls === c0);
  const dash = await getDashboardData();
  checks.check('3f: the dashboard marks the address as not sendable', dash.spm.find((c) => c.id === ext.id)?.recipientAllowed === false);

  // idempotency guard on an already-sent row (row pre-marked in the test; no email is sent)
  await getDb().from('candidate_emails').update({ status: 'sent', resend_message_id: 'test-prefilled', sent_at: new Date().toISOString() }).eq('candidate_id', ext.id);
  await getDb().from('candidates').update({ status: 'sent' }).eq('id', ext.id);
  const again = await sendConfirmed(ext.id);
  checks.check('idempotency: a second send on an already-sent candidate sends nothing', again.ok && again.alreadySent === true && resendStats.calls === c0);

  // ---------- 3d: needs_review never ranked / top 5 ----------
  console.log('\n== 3d needs_review isolation ==');
  const { data: review } = await getDb().from('candidates').select('id').eq('status', 'needs_review');
  const ranked = [...(await rankCandidatesForRole('pm')), ...(await rankCandidatesForRole('spm'))].map((r) => r.candidate_id);
  const tops = [...(await getTopCandidateIds('pm')), ...(await getTopCandidateIds('spm'))];
  checks.check('3d: needs_review candidates exist for this check', (review ?? []).length >= 2, `${review?.length}`);
  checks.check('3d: none appear in any ranking or top-5 set', (review ?? []).every((c) => !ranked.includes(c.id) && !tops.includes(c.id)));
  const d2 = await getDashboardData();
  checks.check('3d: none appear in the dashboard ranked lists; all are in the review list', (review ?? []).every((c) => ![...d2.pm, ...d2.spm].some((x) => x.id === c.id) && d2.needsReview.some((x) => x.id === c.id)));
  const dirty = await Promise.all((review ?? []).map((c) => rowsFor(c.id)));
  checks.check('3d: none has a score, brief or draft', dirty.every((r) => r.scores + r.totals + r.briefs + r.emails === 0));

  // ---------- 3e: Gemini failure ----------
  console.log('\n== 3e Gemini failure ==');
  const goodKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'invalid-key-for-failure-test';
  const start = requests.length;
  const failed = await processCv({ buffer: readFileSync(path.join(dir, 'pm_05_ananya_rajan.pdf')), filename: 'pm_05_ananya_rajan.pdf', role: 'pm' });
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = goodKey;
  cleanup.push(failed.id);
  const failedReqs = requests.slice(start).filter((r) => r.candidateId === failed.id);
  const { data: fRow } = await getDb().from('candidates').select('status,review_reason').eq('id', failed.id).single();
  const { data: fPii } = await getDb().from('candidate_pii').select('name,email,phone').eq('candidate_id', failed.id).single();
  const fRows = await rowsFor(failed.id);
  checks.check('3e: the failure surfaces as needs_review with a reason', fRow?.status === 'needs_review' && String(fRow.review_reason).length > 10, String(fRow?.review_reason).slice(0, 100));
  checks.check('3e: the reason does not contain the key, the name, email or phone', !String(fRow?.review_reason).includes('invalid-key') && assertNoLeak(fPii!, String(fRow?.review_reason)).pass);
  checks.check('3e: requests were attempted, all to the configured model only (no model switch)', failedReqs.length > 0 && failedReqs.every((r) => r.url.includes(`/models/${getModelId()}:`)), `${failedReqs.length} attempts`);
  checks.check('3e: every payload that was sent was de-identified (no raw text, no PII)', failedReqs.every((r) => assertNoLeak(fPii!, payloadTexts(r.body)).pass));
  checks.check('3e: no scores, brief or draft were stored for the failed candidate', fRows.scores + fRows.totals + fRows.briefs + fRows.emails === 0);

  checks.summary();
  await getDb().from('candidates').delete().in('id', cleanup);
  setAiRequestRecorder(null);
  process.exit(checks.failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
