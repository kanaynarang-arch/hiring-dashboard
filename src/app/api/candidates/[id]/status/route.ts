import { getDb } from '@/lib/db';

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
  return Response.json({
    id: data.id,
    status: data.status,
    stage: data.stage,
    reason: data.review_reason,
    role: data.applied_role,
  });
}
