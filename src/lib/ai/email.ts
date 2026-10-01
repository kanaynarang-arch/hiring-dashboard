import { getModel } from './model';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import type { EmailType, Role } from '../db';
import { JOB_DESCRIPTIONS } from '../jd';
import { NAME_PLACEHOLDER } from '../namePlaceholder';

const EmailSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

// Drafts a personalized email from the de-identified CV alone. The model
// never sees the candidate's real name — it writes the placeholder token,
// which is substituted with the real name afterward, entirely outside the
// model call. The model also never sees scores/rubric/ranking, so it
// physically cannot leak them into the email.
export async function draftCandidateEmail(
  redactedCvText: string,
  role: Role,
  emailType: EmailType,
): Promise<{ subject: string; body: string }> {
  const intent =
    emailType === 'invite'
      ? `Warmly invite the candidate to interview for the ${role.toUpperCase()} role. Reference \
1-2 specific, genuine things from their CV that make them a good fit for this kind of role. Ask \
them to reply with their availability for a call.`
      : `Write a warm, respectful rejection for the ${role.toUpperCase()} role. Keep it brief and \
human, not generic or robotic. If it fits naturally, reference one genuine thing from their \
background positively, but do not overdo it or imply a reason for the decision.`;

  const { output } = await generateText({
    model: getModel(),
    output: Output.object({ schema: EmailSchema }),
    system: `You draft candidate emails using ONLY facts literally present in the de-identified \
CV text given to you — never invent facts, never speculate. You do not know the candidate's \
name, so wherever you would address them by name (e.g. the greeting), write the literal \
placeholder token ${NAME_PLACEHOLDER} — never any other name or "Dear Candidate". Never mention \
a score, rubric, ranking, evaluation, or that the candidate was compared to others — the \
candidate must never learn this process exists. The job description below is role context only, \
to help your tone and framing — never cite it as a reason for the decision.`,
    prompt: `Role context (for framing only):\n${JOB_DESCRIPTIONS[role]}\n\nTask: ${intent}\n\nCandidate CV (de-identified):\n"""\n${redactedCvText}\n"""`,
  });

  return output;
}
