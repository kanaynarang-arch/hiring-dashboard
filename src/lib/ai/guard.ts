import { generateText, NoObjectGeneratedError, Output } from 'ai';
import type { z } from 'zod';
import { getDb } from '../db';
import { assertNoLeak, type PiiValues } from '../leakcheck';
import { getModel, runWithCandidateContext } from './model';

// Raised when the pre-flight leak check does not definitively pass. The model
// is NOT called in this case.
export class LeakBlockedError extends Error {
  constructor(public findings: string[]) {
    super(`PII leak check failed before the AI call (${findings.join(', ')}); no request was made.`);
  }
}

export class AiGenerationError extends Error {}

async function loadPii(candidateId: string): Promise<PiiValues> {
  const { data, error } = await getDb()
    .from('candidate_pii')
    .select('name,email,phone')
    .eq('candidate_id', candidateId)
    .maybeSingle();
  if (error) throw new Error(`Could not load PII for the leak check: ${error.message}`);
  // Without stored values to check against there is nothing to verify with:
  // that is not a pass.
  if (!data || !data.name || !data.email) throw new LeakBlockedError(['pii-record-incomplete']);
  return { name: data.name as string, email: data.email as string, phone: (data.phone as string | null) ?? null };
}

// The one way any AI request is made. Order matters: leak check first, model
// call second, and the model call only runs inside the candidate context
// that model.ts requires.
export async function generateStructured<S extends z.ZodTypeAny>(params: {
  candidateId: string;
  system: string;
  prompt: string;
  schema: S;
  attempts?: number;
}): Promise<z.infer<S>> {
  const pii = await loadPii(params.candidateId);
  const leak = assertNoLeak(pii, `${params.system}\n${params.prompt}`);
  if (!leak.pass) throw new LeakBlockedError(leak.findings);

  const attempts = params.attempts ?? 3;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const { output } = await runWithCandidateContext(params.candidateId, () =>
        generateText({
          model: getModel(),
          output: Output.object({ schema: params.schema }),
          system: params.system,
          prompt: params.prompt,
        }),
      );
      return output as z.infer<S>;
    } catch (err) {
      lastError = err;
      // Only an output that failed validation is retried (same model, same
      // prompt). API, auth and network failures surface immediately.
      if (!NoObjectGeneratedError.isInstance(err)) break;
    }
  }
  const message = lastError instanceof Error ? lastError.message : 'unknown error';
  throw new AiGenerationError(message.slice(0, 300));
}
