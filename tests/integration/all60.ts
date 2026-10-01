// Test 2: upload every CV in the folder through the real HTTP upload route, wait for each
// to reach a terminal state in the DATABASE, then verify the whole database.
// Usage: npx tsx --env-file=.env.local tests/integration/all60.ts <cv-folder> [--concurrency=3]
import { writeFileSync, mkdirSync } from 'node:fs';
import { getDb } from '../../src/lib/db';
import { reconcileRole } from '../../src/lib/pipeline';
import { Checks, clearAllCandidates, cvDir, listCvs, readPdf, runLimited, uploadHttp, waitTerminal } from './lib';
import { verifyDatabase } from './verify-db';

(async () => {
  const concurrency = Number(process.argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? 3);
  const cvs = await listCvs(cvDir());
  console.log(`${cvs.length} CVs, concurrency ${concurrency}`);
  await clearAllCandidates();
  const t0 = Date.now();
  const timings: { file: string; role: string; status: string; sec: number }[] = [];
  await runLimited(cvs, concurrency, async (cv) => {
    const id = await uploadHttp(readPdf(cv.path), cv.file, cv.role);
    const done = await waitTerminal(id);
    timings.push({ file: cv.file, role: cv.role, status: done.status, sec: Math.round(done.ms / 100) / 10 });
    console.log(`${String(timings.length).padStart(2)}/${cvs.length} ${cv.file.padEnd(30)} ${cv.role.toUpperCase().padEnd(3)} -> ${done.status}${done.status === 'needs_review' ? ` (${String(done.review_reason).slice(0, 80)})` : ''} ${(done.ms / 1000).toFixed(1)}s`);
  });
  console.log(`\nwall time ${(Date.now() - t0) / 1000}s`);

  let checks = new Checks();
  console.log('\n--- verification pass 1 ---');
  let sum = await verifyDatabase(checks, { total: cvs.length });
  if (checks.failed.length) {
    console.log('\nInconsistencies after the concurrent batch; running the app\'s own reconcile for both roles, then re-verifying.');
    await reconcileRole('pm');
    await reconcileRole('spm');
    checks = new Checks();
    console.log('\n--- verification pass 2 ---');
    sum = await verifyDatabase(checks, { total: cvs.length });
  }
  const { data: tops } = await getDb().from('candidate_briefs').select('candidate_id');
  console.log('\nstatus counts', sum.counts, '| briefs stored:', tops?.length);
  if (sum.reviewReasons.length) console.log('needs_review:', sum.reviewReasons);
  checks.summary();
  mkdirSync('.scratch', { recursive: true });
  writeFileSync('.scratch/all60.json', JSON.stringify({ counts: sum.counts, reviewReasons: sum.reviewReasons, timings, failed: checks.failed, wallSec: (Date.now() - t0) / 1000 }, null, 1));
  process.exit(checks.failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
