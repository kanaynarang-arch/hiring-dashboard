// Test 1: upload 3 CVs (strong PM, weak SPM, ambiguous) through the real HTTP upload.
// Usage: npx tsx --env-file=.env.local tests/integration/three.ts <cv-folder>
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getDb } from '../../src/lib/db';
import { Checks, clearAllCandidates, cvDir, uploadHttp, waitTerminal } from './lib';
import { verifyDatabase } from './verify-db';

const PICKS = [
  { file: 'pm_01_priya_krishnan.pdf', role: 'pm' as const, why: 'clearly strong PM' },
  { file: '15_ravi_kumar.pdf', role: 'spm' as const, why: 'clearly weak SPM (project manager in IT services)' },
  { file: '24_shrey_marathe.pdf', role: 'pm' as const, why: 'ambiguous (associate-level product experience)' },
];

(async () => {
  const dir = cvDir();
  const checks = new Checks();
  await clearAllCandidates();
  const ids: string[] = [];
  for (const p of PICKS) {
    const id = await uploadHttp(readFileSync(path.join(dir, p.file)), p.file, p.role);
    ids.push(id);
    const done = await waitTerminal(id);
    console.log(`uploaded ${p.file} (${p.why}) -> ${done.status} in ${(done.ms / 1000).toFixed(1)}s`);
  }
  const { count } = await getDb().from('candidates').select('*', { count: 'exact', head: true });
  checks.check('candidates table has exactly 3 rows', count === 3, `${count}`);
  const { data: pii } = await getDb().from('candidate_pii').select('name,email,phone').in('candidate_id', ids);
  checks.check('PII table has name, email and phone for all 3', (pii ?? []).length === 3 && (pii ?? []).every((p) => p.name && p.email && p.phone));

  const sum = await verifyDatabase(checks, { total: 3, scored: 3 });
  console.log('status counts', sum.counts);

  const { data: totals } = await getDb().from('candidate_role_scores').select('candidate_id,role,total_score').in('candidate_id', ids);
  const { data: cands } = await getDb().from('candidates').select('id,original_filename,applied_role').in('id', ids);
  for (const c of cands ?? []) {
    const t = (totals ?? []).filter((x) => x.candidate_id === c.id).map((x) => `${x.role}=${Number(x.total_score).toFixed(1)}`).join(' ');
    console.log(`  ${String(c.original_filename).padEnd(28)} applied ${c.applied_role}  totals ${t}`);
  }
  const strong = (cands ?? []).find((c) => c.original_filename === PICKS[0].file)!;
  const weak = (cands ?? []).find((c) => c.original_filename === PICKS[1].file)!;
  const get = (id: string, role: string) => Number((totals ?? []).find((x) => x.candidate_id === id && x.role === role)?.total_score);
  checks.check('strong PM scores higher on its applied rubric than the weak SPM on its own', get(strong.id, 'pm') > get(weak.id, 'spm'), `${get(strong.id, 'pm').toFixed(1)} vs ${get(weak.id, 'spm').toFixed(1)}`);
  checks.summary();
  process.exit(checks.failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
