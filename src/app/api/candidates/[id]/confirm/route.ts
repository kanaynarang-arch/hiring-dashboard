import { confirmSend } from '@/lib/send';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, ctx: RouteContext<'/api/candidates/[id]/confirm'>) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: 'not_found', message: 'Not found' }, { status: 404 });
  const out = await confirmSend(id);
  return Response.json(out, { status: out.httpStatus });
}
