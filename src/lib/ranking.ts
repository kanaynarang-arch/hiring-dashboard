import { getDb, type Role } from './db';

export const TOP_N = 5;

export interface RankedCandidate {
  candidate_id: string;
  total_score: number;
}

// Ranks every scored (or already-sent) candidate who applied to `role`,
// using only that role's own total_score — never the other role's.
export async function rankCandidatesForRole(role: Role): Promise<RankedCandidate[]> {
  const db = getDb();

  const { data: candidates, error: cErr } = await db
    .from('candidates')
    .select('id')
    .eq('applied_role', role)
    .in('status', ['scored', 'sent']);
  if (cErr) throw cErr;

  const ids = (candidates ?? []).map((c) => c.id as string);
  if (ids.length === 0) return [];

  const { data: scores, error: sErr } = await db
    .from('candidate_role_scores')
    .select('candidate_id, total_score')
    .eq('role', role)
    .in('candidate_id', ids);
  if (sErr) throw sErr;

  return (scores ?? [])
    .map((s) => ({ candidate_id: s.candidate_id as string, total_score: Number(s.total_score) }))
    .sort((a, b) => b.total_score - a.total_score);
}

export async function getTopCandidateIds(role: Role, limit = TOP_N): Promise<Set<string>> {
  const ranked = await rankCandidatesForRole(role);
  return new Set(ranked.slice(0, limit).map((r) => r.candidate_id));
}
