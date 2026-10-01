// Test 4/5: the final loop. Removes two already-scored CVs from the database (so they are
// genuinely "not scored" again), uploads them through the real upload route, times upload ->
// terminal state, then reads the top candidate's brief and draft and presses Confirm & send.
// Usage: BASE_URL=... npx tsx --env-file=.env.local tests/integration/final.ts <cv-folder> [--files=a.pdf,b.pdf]
import path from 'node:path';
import { getDb } from '../../src/lib/db';
import { getResendDeliveryStatus } from '../../src/lib/resend';
import { getDashboardData } from '../../src/lib/queries';
import { BASE_URL, Checks, cvDir, readPdf, roleFor, uploadHttp, waitTerminal } from './lib';
import { verifyDatabase } from './verify-db';

(async () => {
  const dir = cvDir();
  const files = (process.argv.find((a) => a.startsWith('--files='))?.split('=')[1] ?? 'pm_10_rohan_sane.pdf,spm_22_manish_agarwal.pdf').split(',');
  const checks = new Checks();
  const db = getDb();
  console.log('server:', BASE_URL);

  // Make them "new": delete any prior record (cascades to scores, brief, draft, PII).
  await db.from('candidates').delete().in('original_filename', files);

  const loopStart = Date.now();
  const results: { file: string; ms: number; status: string }[] = [];
  const ids: string[] = [];
  for (const file of files) {
    const t0 = Date.now();
    const id = await uploadHttp(readPdf(path.join(dir, file)), file, roleFor(file));
    ids.push(id);
    const done = await waitTerminal(id);
    results.push({ file, ms: Date.now() - t0, status: done.status });
    console.log(`${file}: ${done.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s (upload -> terminal state in the database)`);
  }

  for (const [i, id] of ids.entries()) {
    const { data: cand } = await db.from('candidates').select('status,applied_role').eq('id', id).single();
    const [{ data: sc }, { data: tot }, { data: br }, { data: em }] = await Promise.all([
      db.from('candidate_scores').select('id').eq('candidate_id', id),
      db.from('candidate_role_scores').select('role').eq('candidate_id', id),
      db.from('candidate_briefs').select('brief_text').eq('candidate_id', id),
      db.from('candidate_emails').select('email_type').eq('candidate_id', id),
    ]);
    checks.check(`${files[i]}: terminal state is complete (score for both rubrics + draft persisted${cand?.status === 'scored' ? '' : '; needs_review has none'})`,
      cand?.status === 'scored' ? sc?.length === 8 && tot?.length === 2 && em?.length === 1 : cand?.status === 'needs_review' && !sc?.length && !em?.length, `${cand?.status}`);
  }
  checks.check('each CV reached its terminal state in under 5 minutes', results.every((r) => r.ms < 5 * 60_000), results.map((r) => `${(r.ms / 1000).toFixed(0)}s`).join(', '));

  // Top candidate overall (highest applied-role score among PM and SPM rank-1s)
  const dash = await getDashboardData();
  const top = [dash.pm[0], dash.spm[0]].filter(Boolean).sort((a, b) => (b.appliedRoleScore ?? 0) - (a.appliedRoleScore ?? 0))[0];
  console.log(`\nTop candidate: ${top.applied_role.toUpperCase()} rank ${top.rank}, score ${top.appliedRoleScore?.toFixed(1)}, ${top.email}`);
  console.log('BRIEF:', top.brief);
  console.log('DRAFT (%s) subject: %s', top.emailDraft?.email_type, top.emailDraft?.subject);
  console.log(top.emailDraft?.body);
  checks.check('top candidate has a three-sentence brief and an invite draft', Boolean(top.brief && top.brief.split(/(?<=[.!?])\s+(?=[A-Z])/).length === 3 && top.emailDraft?.email_type === 'invite'));

  if (!process.env.RESEND_API_KEY) {
    console.log('\nUNVERIFIED: RESEND_API_KEY is not set in this environment, so Confirm & send was NOT pressed and nothing was sent.');
  } else {
    const t0 = Date.now();
    const conf = await fetch(`${BASE_URL}/api/candidates/${top.id}/confirm`, { method: 'POST' });
    const send = await fetch(`${BASE_URL}/api/candidates/${top.id}/send`, { method: 'POST' });
    const out = await send.json();
    console.log('confirm', conf.status, 'send', send.status, out.message);
    const { data: e } = await db.from('candidate_emails').select('status,resend_message_id,sent_at,body').eq('candidate_id', top.id).single();
    const { data: c } = await db.from('candidates').select('status').eq('id', top.id).single();
    const { data: p } = await db.from('candidate_pii').select('name').eq('candidate_id', top.id).single();
    checks.check('Resend returned a message id and the email row is sent', send.ok && e?.status === 'sent' && Boolean(e.resend_message_id), e?.resend_message_id ?? '');
    checks.check('candidate status is sent in Supabase', c?.status === 'sent');
    checks.check('the sent email contains the real name', Boolean(p?.name && e?.body.includes(p.name)));
    const again = await fetch(`${BASE_URL}/api/candidates/${top.id}/send`, { method: 'POST' });
    const againJson = await again.json();
    checks.check('a second click does not send a second email', againJson.alreadySent === true);
    let last: string | null = null;
    for (let i = 0; i < 30 && last !== 'delivered'; i++) { await new Promise((r) => setTimeout(r, 1000)); last = await getResendDeliveryStatus(e!.resend_message_id!).catch(() => null); }
    checks.check('Resend reports the email delivered within 30 seconds of sending', last === 'delivered', `last_event=${last} after ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    console.log(`whole loop (upload start -> sent): ${((Date.now() - loopStart) / 1000).toFixed(0)}s`);
  }
  await verifyDatabase(checks);
  checks.summary();
  process.exit(checks.failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
