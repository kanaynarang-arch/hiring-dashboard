import { z } from 'zod';
import type { Role, RubricCriterion } from '../db';
import { generateStructured } from './guard';

export interface CriterionScore {
  criterion_id: number;
  score: number;
  reason: string;
}

// Scores one de-identified CV against ONE rubric. The request contains only
// the rubric criteria from the database and the redacted CV text: no job
// description (rubric.txt is the sole scoring authority) and no PII.
export async function scoreCvAgainstRubric(
  candidateId: string,
  redactedCvText: string,
  role: Role,
  criteria: RubricCriterion[],
): Promise<CriterionScore[]> {
  const expectedIds = new Set(criteria.map((c) => c.id));

  const schema = z
    .object({
      scores: z.array(
        z.object({
          criterion_id: z.number().int(),
          score: z.number().min(0).max(10),
          reason: z
            .string()
            .transform((r) => r.replace(/\s+/g, ' ').trim())
            .pipe(z.string().min(10).max(350)),
        }),
      ),
    })
    .superRefine((v, ctx) => {
      const ids = v.scores.map((s) => s.criterion_id);
      if (ids.length !== expectedIds.size || new Set(ids).size !== ids.length || ids.some((i) => !expectedIds.has(i))) {
        ctx.addIssue({ code: 'custom', message: 'scores must contain exactly one entry per rubric criterion' });
      }
    });

  const criteriaList = criteria
    .map((c) => `- criterion_id ${c.id}: "${c.name}" (weight ${c.weight}%): ${c.description}`)
    .join('\n');

  const result = await generateStructured({
    candidateId,
    schema,
    system: `You score one de-identified CV against a fixed hiring rubric. Use ONLY the criteria below. \
Do not add criteria, do not use outside knowledge of the company or role, and do not reward anything the \
rubric does not describe. For every criterion give a score from 0 (no evidence at all) to 10 (strong, \
unambiguous evidence matching the description) and a one-line reason that cites the specific evidence \
in the CV (or states that there is none). Return exactly one entry per criterion_id. The CV has had \
personal details removed; never guess at identity.`,
    prompt: `Rubric: ${role === 'pm' ? 'Product Manager' : 'Senior Product Manager'}\n${criteriaList}\n\nCV (de-identified):\n"""\n${redactedCvText}\n"""`,
  });
  return result.scores;
}
