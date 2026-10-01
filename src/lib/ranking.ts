import { getDb, type Role } from './db';

export const TOP_N = 5;

export const SCORED_FILTER = 'status.in.(scored,sent),and(status.eq.processing,stage.eq.drafting)';

export interface RankedCandidate {
  candidate_id: string;
  total_score: number;
}

// Ranks the candidates who APPLIED for `role`, by that role's own rubric total.
// Only candidates that hold a score are ranked: status scored or sent, plus the
// candidate currently being drafted (status processing, stage drafting, whose
// scores are already stored). A needs_review candidate has no score and is never
// ranked, never promoted to fill a slot.
// Ties are broken by earlier upload, then id, so the order is deterministic.
export async function rankCandidatesForRole(role: Role): Promise<RankedCandidate[]> {
  const db = getDb();
  const { data: candidates, error } = await db
    .from('candidates')
    .select('id, created_at')
    .eq('applied_role', role)
    .or(SCORED_FILTER);
  if (error) throw error;
  const ids = (candidates ?? []).map((c) => c.id as string);
  if (ids.length === 0) return [];

  const { data: scores, error: sErr } = await db
    .from('candidate_role_scores')
    .select('candidate_id, total_score')
    .eq('role', role)
    .in('candidate_id', ids);
  if (sErr) throw sErr;

  const createdAt = new Map((candidates ?? []).map((c) => [c.id as string, c.created_at as string]));
  return (scores ?? [])
    .map((s) => ({ candidate_id: s.candidate_id as string, total_score: Number(s.total_score) }))
    .sort(
      (a, b) =>
        b.total_score - a.total_score ||
        createdAt.get(a.candidate_id)!.localeCompare(createdAt.get(b.candidate_id)!) ||
        a.candidate_id.localeCompare(b.candidate_id),
    );
}

export async function getTopCandidateIds(role: Role, limit = TOP_N): Promise<Set<string>> {
  const ranked = await rankCandidatesForRole(role);
  return new Set(ranked.slice(0, limit).map((r) => r.candidate_id));
}
