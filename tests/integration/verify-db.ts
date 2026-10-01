/* eslint-disable @typescript-eslint/no-explicit-any -- test helper over untyped Supabase rows */
// Verifies the PERSISTED state of the whole database against the requirements.
import { getDb, type Role } from '../../src/lib/db';
import { assertNoLeak, nameTokens } from '../../src/lib/leakcheck';
import { rankCandidatesForRole, TOP_N } from '../../src/lib/ranking';
import { getDashboardData } from '../../src/lib/queries';
import { Checks } from './lib';

const rows = async (table: string) => {
  const { data, error } = await getDb().from(table).select('*').range(0, 4999);
  if (error) throw error;
  return data ?? [];
};

export async function verifyDatabase(checks: Checks, expect?: { scored?: number; total?: number }) {
  const [cands, pii, red, crit, scores, totals, briefs, emails] = await Promise.all(
    ['candidates', 'candidate_pii', 'candidate_redacted_cv', 'rubric_criteria', 'candidate_scores', 'candidate_role_scores', 'candidate_briefs', 'candidate_emails'].map(rows),
  );
  const by = <T extends { candidate_id: string }>(list: T[]) => {
    const m = new Map<string, T[]>();
    list.forEach((r) => m.set(r.candidate_id, [...(m.get(r.candidate_id) ?? []), r]));
    return m;
  };
  const piiBy = new Map(pii.map((p) => [p.candidate_id as string, p]));
  const redBy = new Map(red.map((r) => [r.candidate_id as string, r]));
  const scoresBy = by(scores as any[]);
  const totalsBy = by(totals as any[]);
  const briefBy = new Map(briefs.map((b) => [b.candidate_id as string, b]));
  const emailBy = new Map(emails.map((e) => [e.candidate_id as string, e]));

  const counts: Record<string, number> = {};
  cands.forEach((c) => (counts[c.status] = (counts[c.status] ?? 0) + 1));
  const reviewReasons = cands.filter((c) => c.status === 'needs_review').map((c) => ({ file: c.original_filename as string, role: c.applied_role as string, reason: c.review_reason as string }));

  checks.check('no candidate is in an intermediate status', !cands.some((c) => c.status === 'processing'), JSON.stringify(counts));

  // rubric_criteria
  for (const [role, w] of [['pm', [25, 25, 25, 25]], ['spm', [20, 20, 35, 25]]] as [Role, number[]][]) {
    const r = crit.filter((c) => c.role === role).sort((a, b) => a.sort_order - b.sort_order);
    checks.check(`rubric_criteria ${role}: 4 rows, weights ${w.join('/')} sum 100`, r.length === 4 && r.every((x, i) => Number(x.weight) === w[i]) && r.reduce((s, x) => s + Number(x.weight), 0) === 100);
  }
  const critById = new Map(crit.map((c) => [c.id as number, c]));

  const scored = cands.filter((c) => c.status === 'scored' || c.status === 'sent');
  const review = cands.filter((c) => c.status === 'needs_review');
  if (expect?.total !== undefined) checks.check(`database holds exactly ${expect.total} candidates`, cands.length === expect.total, `${cands.length}`);
  if (expect?.scored !== undefined) checks.check(`${expect.scored} candidates reached scored (checks below are not vacuous)`, scored.length === expect.scored, `${scored.length}`);

  let scoreOk = 0, leakOk = 0, totalOk = 0;
  const problems: string[] = [];
  for (const c of scored) {
    const id = c.id as string;
    const s = (scoresBy.get(id) ?? []) as any[];
    const t = (totalsBy.get(id) ?? []) as any[];
    const ok = s.length === 8 && s.every((x) => String(x.reason).trim().length >= 10 && !String(x.reason).includes('\n') && Number(x.score) >= 0 && Number(x.score) <= 10 && critById.get(x.criterion_id)?.role === x.role);
    if (ok && (['pm', 'spm'] as Role[]).every((r) => s.filter((x) => x.role === r).length === 4)) scoreOk++; else problems.push(`${c.original_filename}: scores`);
    let totOk = t.length === 2;
    for (const role of ['pm', 'spm'] as Role[]) {
      const sr = s.filter((x) => x.role === role);
      const weighted = sr.reduce((acc, x) => acc + (Number(x.score) / 10) * Number(critById.get(x.criterion_id)?.weight ?? 0), 0);
      const stored = t.find((x) => x.role === role);
      if (!stored || Math.abs(Number(stored.total_score) - weighted) > 0.011) totOk = false;
    }
    if (totOk) totalOk++; else problems.push(`${c.original_filename}: totals`);
    const p = piiBy.get(id), r = redBy.get(id);
    if (p?.name && p?.email && r) {
      const leak = assertNoLeak({ name: p.name, email: p.email, phone: p.phone }, r.redacted_text);
      const lower = String(r.redacted_text).toLowerCase();
      const tokenHit = nameTokens(p.name).some((tk) => (tk.length >= 4 ? lower.includes(tk.toLowerCase()) : new RegExp(`(?<![a-z0-9])${tk.toLowerCase()}(?![a-z0-9])`).test(lower)));
      const phoneHit = p.phone && lower.replace(/\D/g, '').includes(String(p.phone).replace(/\D/g, '').slice(-10));
      if (leak.pass && !tokenHit && !lower.includes(String(p.email).toLowerCase()) && !phoneHit) leakOk++; else problems.push(`${c.original_filename}: LEAK in stored CV text`);
    } else problems.push(`${c.original_filename}: missing pii/redacted row`);
  }
  checks.check(`every scored/sent candidate has 8 scores (4 per rubric) with one-line reasons`, scoreOk === scored.length, `${scoreOk}/${scored.length}`);
  checks.check(`every weighted total matches a recomputation from the stored scores`, totalOk === scored.length, `${totalOk}/${scored.length}`);
  checks.check(`stored name/email/phone appear nowhere in the stored de-identified CV text`, leakOk === scored.length, `${leakOk}/${scored.length}`);

  // needs_review isolation
  const reviewDirty = review.filter((c) => (scoresBy.get(c.id) ?? []).length || (totalsBy.get(c.id) ?? []).length || briefBy.has(c.id) || emailBy.has(c.id));
  checks.check('no needs_review candidate has a score, total, brief or draft', reviewDirty.length === 0, `${review.length} needs_review`);
  checks.check('every needs_review candidate has a stored reason', review.every((c) => String(c.review_reason ?? '').length > 5));

  // ranking, briefs, drafts
  for (const role of ['pm', 'spm'] as Role[]) {
    const ranked = await rankCandidatesForRole(role);
    const top = new Set(ranked.slice(0, TOP_N).map((r) => r.candidate_id));
    const inRole = scored.filter((c) => c.applied_role === role);
    checks.check(`${role}: ranked list == scored/sent candidates who applied for ${role}`, ranked.length === inRole.length && !ranked.some((r) => review.some((c) => c.id === r.candidate_id)), `${ranked.length} ranked`);
    let briefOk = true, typeOk = true, nameOk = true, textOk = true;
    for (const c of inRole) {
      const id = c.id as string;
      const isTop = top.has(id);
      const b = briefBy.get(id) as any, e = emailBy.get(id) as any, p = piiBy.get(id) as any;
      if (c.status === 'scored') {
        if (isTop !== Boolean(b)) briefOk = false;
        if (!e || e.email_type !== (isTop ? 'invite' : 'rejection')) typeOk = false;
      } else if (!e) typeOk = false;
      if (b) {
        const sentences = String(b.brief_text).split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean);
        if (sentences.length !== 3) briefOk = false;
        const lower = String(b.brief_text).toLowerCase();
        if (p && (nameTokens(p.name).some((tk: string) => lower.includes(tk.toLowerCase()) && tk.length >= 4) || lower.includes(String(p.email).toLowerCase()))) briefOk = false;
      }
      if (e && p) {
        const full = `${e.subject}\n${e.body}`;
        const nm = String(p.name).trim();
        const shown = nm === nm.toUpperCase() ? nm.toLowerCase().replace(/\b[a-z]/g, (x) => x.toUpperCase()) : nm;
        if (!e.body.includes(shown) || /\{\{|\}\}|\[REDACTED\]|\[NAME\]/i.test(full)) nameOk = false;
        if (/\b(score[ds]?|rubric|ranking|ranked|top[- ]?(5|five))\b/i.test(full)) textOk = false;
      }
    }
    checks.check(`${role}: exactly the top ${TOP_N} (or fewer) have a three-sentence brief and nobody else does`, briefOk);
    checks.check(`${role}: top ${TOP_N} have an invite draft, every other scored candidate a rejection draft`, typeOk);
    checks.check(`${role}: every draft shows the candidate's real name, no placeholders`, nameOk);
    checks.check(`${role}: no draft mentions a score, rubric or ranking`, textOk);
  }

  // dashboard view
  const dash = await getDashboardData();
  for (const role of ['pm', 'spm'] as Role[]) {
    const list = dash[role];
    const ranks = list.map((c) => c.rank);
    const sortedOk = list.every((c, i) => i === 0 || (list[i - 1].appliedRoleScore ?? 0) >= (c.appliedRoleScore ?? 0));
    checks.check(`dashboard ${role}: ranks are 1..n and ordered by score`, ranks.every((r, i) => r === i + 1) && sortedOk, `${list.length} rows`);
    checks.check(`dashboard ${role}: contains no needs_review candidate`, !list.some((c) => c.status === 'needs_review'));
  }
  checks.check('dashboard needsReview list matches the database', dash.needsReview.length === review.length);

  if (problems.length) console.log('Problems:', problems.slice(0, 10));
  return { counts, reviewReasons, total: cands.length };
}
