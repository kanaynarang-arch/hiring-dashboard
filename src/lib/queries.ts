import { getDb, type Role, type CandidateStatus, type EmailType, type EmailStatus } from './db';
import { rankCandidatesForRole, TOP_N } from './ranking';
import { deliveryAddress, isMesaTestAddress } from './send';

export interface CriterionScoreView {
  criterion_id: number;
  name: string;
  weight: number;
  score: number;
  reason: string;
}

export interface EmailView {
  email_type: EmailType;
  subject: string;
  body: string;
  status: EmailStatus;
  sent_at: string | null;
  resend_message_id: string | null;
  error_message: string | null;
  confirmed: boolean;
  test_send: boolean;
  sent_to: string | null;
}

export interface DashboardCandidate {
  id: string;
  applied_role: Role;
  status: CandidateStatus;
  review_reason: string | null;
  original_filename: string;
  created_at: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  recipientAllowed: boolean;
  rank: number | null;
  appliedRoleScore: number | null;
  otherRoleScore: number | null;
  isAboveLine: boolean;
  scoresByRole: Record<Role, CriterionScoreView[]>;
  brief: string | null;
  emailDraft: EmailView | null;
}

export interface DashboardData {
  pm: DashboardCandidate[];
  spm: DashboardCandidate[];
  needsReview: DashboardCandidate[];
  processing: number;
}

export async function getDashboardData(): Promise<DashboardData> {
  const db = getDb();

  const [
    { data: candidates, error: candErr },
    { data: pii },
    { data: roleScores },
    { data: scores },
    { data: criteria },
    { data: briefs },
    { data: emails },
  ] = await Promise.all([
    db.from('candidates').select('*').order('created_at', { ascending: false }),
    db.from('candidate_pii').select('*'),
    db.from('candidate_role_scores').select('*'),
    db.from('candidate_scores').select('*'),
    db.from('rubric_criteria').select('*'),
    db.from('candidate_briefs').select('*'),
    db.from('candidate_emails').select('*'),
  ]);
  if (candErr) throw candErr;

  const piiById = new Map((pii ?? []).map((p) => [p.candidate_id as string, p]));
  const briefById = new Map((briefs ?? []).map((b) => [b.candidate_id as string, b.brief_text as string]));
  const emailById = new Map((emails ?? []).map((e) => [e.candidate_id as string, e]));
  const criterionById = new Map((criteria ?? []).map((c) => [c.id as number, c]));

  const roleScoresByCandidate = new Map<string, Map<Role, number>>();
  for (const rs of roleScores ?? []) {
    const cid = rs.candidate_id as string;
    if (!roleScoresByCandidate.has(cid)) roleScoresByCandidate.set(cid, new Map());
    roleScoresByCandidate.get(cid)!.set(rs.role as Role, Number(rs.total_score));
  }

  const scoresByCandidate = new Map<string, Record<Role, CriterionScoreView[]>>();
  for (const s of scores ?? []) {
    const cid = s.candidate_id as string;
    const role = s.role as Role;
    if (!scoresByCandidate.has(cid)) scoresByCandidate.set(cid, { pm: [], spm: [] });
    const criterion = criterionById.get(s.criterion_id as number);
    scoresByCandidate.get(cid)![role].push({
      criterion_id: s.criterion_id as number,
      name: criterion?.name ?? `criterion ${s.criterion_id}`,
      weight: Number(criterion?.weight ?? 0),
      score: Number(s.score),
      reason: s.reason as string,
    });
  }
  for (const list of scoresByCandidate.values()) {
    list.pm.sort((a, b) => a.criterion_id - b.criterion_id);
    list.spm.sort((a, b) => a.criterion_id - b.criterion_id);
  }

  const rankByRole: Record<Role, Map<string, number>> = { pm: new Map(), spm: new Map() };
  const aboveLineByRole: Record<Role, Set<string>> = { pm: new Set(), spm: new Set() };
  for (const role of ['pm', 'spm'] as Role[]) {
    const ranked = await rankCandidatesForRole(role);
    ranked.forEach((r, idx) => rankByRole[role].set(r.candidate_id, idx + 1));
    ranked.slice(0, TOP_N).forEach((r) => aboveLineByRole[role].add(r.candidate_id));
  }

  const result: DashboardData = { pm: [], spm: [], needsReview: [], processing: 0 };

  for (const c of candidates ?? []) {
    const id = c.id as string;
    const role = c.applied_role as Role;
    const otherRole: Role = role === 'pm' ? 'spm' : 'pm';
    const p = piiById.get(id);
    const emailRow = emailById.get(id);

    const view: DashboardCandidate = {
      id,
      applied_role: role,
      status: c.status as CandidateStatus,
      review_reason: c.review_reason as string | null,
      original_filename: c.original_filename as string,
      created_at: c.created_at as string,
      name: (p?.name as string) ?? null,
      email: (p?.email as string) ?? null,
      phone: (p?.phone as string | null) ?? null,
      recipientAllowed: isMesaTestAddress(deliveryAddress(p?.email as string | undefined)),
      rank: rankByRole[role].get(id) ?? null,
      appliedRoleScore: roleScoresByCandidate.get(id)?.get(role) ?? null,
      otherRoleScore: roleScoresByCandidate.get(id)?.get(otherRole) ?? null,
      isAboveLine: aboveLineByRole[role].has(id),
      scoresByRole: scoresByCandidate.get(id) ?? { pm: [], spm: [] },
      brief: briefById.get(id) ?? null,
      emailDraft: emailRow
        ? {
            email_type: emailRow.email_type as EmailType,
            subject: emailRow.subject as string,
            body: emailRow.body as string,
            status: emailRow.status as EmailStatus,
            sent_at: emailRow.sent_at as string | null,
            resend_message_id: emailRow.resend_message_id as string | null,
            error_message: emailRow.error_message as string | null,
            confirmed: Boolean(emailRow.confirmed_at),
            test_send: Boolean(emailRow.test_send),
            sent_to: (emailRow.sent_to as string | null) ?? null,
          }
        : null,
    };

    if (view.status === 'processing') {
      result.processing += 1;
    } else if (view.status === 'needs_review') {
      result.needsReview.push(view);
    } else if (role === 'pm') {
      result.pm.push(view);
    } else {
      result.spm.push(view);
    }
  }

  const byRank = (a: DashboardCandidate, b: DashboardCandidate) => (a.rank ?? 1e9) - (b.rank ?? 1e9);
  result.pm.sort(byRank);
  result.spm.sort(byRank);

  return result;
}
