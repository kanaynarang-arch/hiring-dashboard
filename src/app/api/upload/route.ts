import { after } from 'next/server';
import { createCandidate, runPipeline, sweepStaleProcessing } from '@/lib/pipeline';

export const maxDuration = 300;

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: 'Expected a multipart form upload.' }, { status: 400 });
  }
  const file = form.get('file');
  const role = form.get('role');

  if (role !== 'pm' && role !== 'spm') {
    return Response.json({ error: 'Choose the role the candidate applied for (PM or SPM).' }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: 'Choose a PDF file.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: 'The PDF is larger than 10 MB.' }, { status: 413 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return Response.json({ error: 'That file is not a PDF.' }, { status: 415 });
  }

  try {
    await sweepStaleProcessing().catch(() => {});
    const id = await createCandidate(file.name, role);
    after(async () => {
      await runPipeline(id, buffer);
    });
    return Response.json({ id }, { status: 202 });
  } catch {
    return Response.json({ error: 'Could not start processing this CV.' }, { status: 500 });
  }
}
