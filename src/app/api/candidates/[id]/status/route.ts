import { getDb, type Role } from '@/lib/db';
import { TOP_N, rankCandidatesForRole } from '@/lib/ranking';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: RouteContext<'/api/candidates/[id]/status'>) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: 'Not found' }, { status: 404 });
  const { data } = await getDb()
    .from('candidates')
    .select('id, status, stage, review_reason, applied_role')
    .eq('id', id)
    .maybeSingle();
  if (!data) return Response.json({ error: 'Not found' }, { status: 404 });

  // Once scored, say where the CV landed. Score and rank are not personal details.
  let placement: { score: number; rank: number; ofTotal: number; shortlisted: boolean } | null = null;
  if (data.status === 'scored' || data.status === 'sent') {
    const ranked = await rankCandidatesForRole(data.applied_role as Role);
    const idx = ranked.findIndex((r) => r.candidate_id === id);
    if (idx >= 0) placement = { score: ranked[idx].total_score, rank: idx + 1, ofTotal: ranked.length, shortlisted: idx < TOP_N };
  }

  return Response.json({
    id: data.id,
    status: data.status,
    stage: data.stage,
    reason: data.review_reason,
    role: data.applied_role,
    placement,
  });
}
