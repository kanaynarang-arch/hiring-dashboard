import { z } from 'zod';
import type { Role } from '../db';
import { JOB_DESCRIPTIONS } from '../jd';
import { generateStructured } from './guard';

export interface ScoredCriterion {
  name: string;
  score: number;
  reason: string;
}

// A sentence that contains an internal sentence boundary is really two.
const INTERNAL_BOUNDARY = /[a-z0-9)]{2}[.!?]\s+[A-Z]/;

const sentence = z
  .string()
  .transform((s) => s.replace(/\s+/g, ' ').trim())
  .pipe(
    z
      .string()
      .min(25)
      .max(230)
      .regex(/[.!?]$/, 'must end with sentence punctuation')
      .refine((s) => !INTERNAL_BOUNDARY.test(s), 'must be a single sentence'),
  );

const BriefSchema = z.object({ sentences: z.array(sentence).length(3) });

// Exactly three sentences, enforced structurally (an array of three single
// sentences) and then joined — not by asking the model to count.
export async function generateInterviewBrief(
  candidateId: string,
  redactedCvText: string,
  role: Role,
  scores: ScoredCriterion[],
): Promise<string> {
  const scoreLines = scores.map((s) => `- ${s.name}: ${s.score}/10 — ${s.reason}`).join('\n');
  const out = await generateStructured({
    candidateId,
    schema: BriefSchema,
    system: `You write a three-sentence interview brief for the hiring manager from a de-identified CV \
and the candidate's rubric results. Return exactly three sentences: (1) what makes this candidate relevant, \
with a concrete fact from the CV; (2) their strongest evidence; (3) the main gap or risk to probe in the \
interview. Keep it concise: each sentence at most 30 words, plain and specific. Refer to the person only as "the candidate". Do not quote numeric scores. The role description is \
context for what is worth probing; it is not a scoring criterion.`,
    prompt: `Role context:\n${JOB_DESCRIPTIONS[role]}\n\nRubric results for this candidate:\n${scoreLines}\n\nCV (de-identified):\n"""\n${redactedCvText}\n"""`,
  });
  return out.sentences.join(' ');
}
