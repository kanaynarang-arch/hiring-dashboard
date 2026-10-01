import { getModel } from './model';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import type { Role, RubricCriterion } from '../db';

const ScoreSchema = z.object({
  scores: z.array(
    z.object({
      criterion_id: z.number(),
      score: z.number().min(0).max(10),
      reason: z.string(),
    }),
  ),
});

export interface CriterionScore {
  criterion_id: number;
  score: number;
  reason: string;
}

// Scores a de-identified CV against a single rubric (PM or SPM). The model
// only ever sees the redacted CV text and the rubric criteria pulled from
// the database — never the raw CV, never the candidate's name/email/phone,
// and never the job description (rubric.txt is the sole scoring authority).
export async function scoreCvAgainstRubric(
  redactedCvText: string,
  role: Role,
  criteria: RubricCriterion[],
): Promise<CriterionScore[]> {
  const criteriaList = criteria
    .map((c) => `- id ${c.id} — "${c.name}" (weight ${c.weight}%): ${c.description}`)
    .join('\n');

  const { output } = await generateText({
    model: getModel(),
    output: Output.object({ schema: ScoreSchema }),
    system: `You are scoring a candidate's de-identified CV against a fixed hiring rubric. \
Use ONLY the criteria and descriptions given below — do not invent new criteria, do not use \
outside knowledge of the role or company, do not infer preferences beyond what is written. \
For each criterion, give a score from 0 (no evidence at all) to 10 (strong, unambiguous \
evidence exactly matching the description), grounded only in specific text from the CV. \
Give a one-line reason for each score, citing the concrete evidence. The CV has had the \
candidate's name, email, and phone number redacted — do not speculate about identity, and \
never refer to the candidate by name (you were not given one).`,
    prompt: `Rubric criteria for the ${role.toUpperCase()} role:\n${criteriaList}\n\nCandidate CV (de-identified):\n"""\n${redactedCvText}\n"""`,
  });

  return output.scores;
}
