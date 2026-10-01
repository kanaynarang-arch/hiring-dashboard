import { generateText } from 'ai';
import type { Role } from '../db';
import { JOB_DESCRIPTIONS } from '../jd';

const model = () => process.env.AI_SCORING_MODEL || 'anthropic/claude-sonnet-5';

export interface ScoredCriterion {
  name: string;
  score: number;
  reason: string;
}

// Writes a 3-sentence interview brief for a top-5-per-role candidate, from
// the de-identified CV and their own rubric scores/reasons. The JD is
// passed only as role context (never as scoring criteria).
export async function generateInterviewBrief(
  redactedCvText: string,
  role: Role,
  scores: ScoredCriterion[],
): Promise<string> {
  const scoreLines = scores.map((s) => `- ${s.name}: ${s.score}/10 — ${s.reason}`).join('\n');

  const { text } = await generateText({
    model: model(),
    system: `Write a three-sentence interview brief for the hiring manager, based on the \
candidate's de-identified CV and their rubric scores below. Reference concrete facts from the \
CV. Refer to them as "the candidate" — never invent or use a name. The job description below \
is role context only, to help you judge what's worth probing in the interview — it is not a \
scoring criterion and you already have the candidate's scores. Output exactly three sentences, \
no preamble, no headers.`,
    prompt: `Role context (for framing only):\n${JOB_DESCRIPTIONS[role]}\n\nRubric scores for this candidate:\n${scoreLines}\n\nCandidate CV (de-identified):\n"""\n${redactedCvText}\n"""`,
  });

  return text.trim();
}
