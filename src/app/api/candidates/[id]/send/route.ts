import { sendConfirmed } from '@/lib/send';

export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sends only if a confirmation for this exact candidate and content has been
// persisted. Calling this directly without one is rejected and never reaches Resend.
export async function POST(_req: Request, ctx: RouteContext<'/api/candidates/[id]/send'>) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: 'not_found', message: 'Not found' }, { status: 404 });
  const out = await sendConfirmed(id);
  return Response.json(out, { status: out.httpStatus });
}
