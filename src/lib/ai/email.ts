import { z } from 'zod';
import type { EmailType, Role } from '../db';
import { JOB_DESCRIPTIONS } from '../jd';
import { NAME_PLACEHOLDER } from '../namePlaceholder';
import { generateStructured } from './guard';

const FORBIDDEN =
  /\b(score[ds]?|scoring|rubric|ranking|ranked|rank|top[- ]?(?:5|five)|shortlist(?:ed)?|criteria|benchmark(?:ed)?|compared (?:to|with) other)\b/i;
const OTHER_PLACEHOLDER = /\{\{(?!CANDIDATE_NAME\}\})[^}]*\}\}|\[(?:NAME|CANDIDATE|REDACTED|Your [A-Za-z ]+)\]/i;
const TIME_UNIT = /^\s*[-–]?\s*(?:minute|min|hour|hr|day|week|month)s?\b/i;

// Numbers in the email must come from the CV (or be a duration): this is the
// programmatic guard against invented facts.
function numbersAreGrounded(body: string, cv: string): boolean {
  for (const m of body.matchAll(/\d[\d,.]*/g)) {
    const num = m[0].replace(/[.,]+$/, '');
    const after = body.slice((m.index ?? 0) + m[0].length);
    if (TIME_UNIT.test(after)) continue;
    if (!cv.includes(num)) return false;
  }
  return true;
}

export interface EmailDraft {
  subject: string;
  body: string;
}

export async function draftCandidateEmail(
  candidateId: string,
  redactedCvText: string,
  role: Role,
  emailType: EmailType,
): Promise<EmailDraft> {
  const roleName = role === 'pm' ? 'Product Manager' : 'Senior Product Manager';
  const schema = z
    .object({
      subject: z.string().min(5).max(120),
      body: z.string().min(120).max(2500),
    })
    .superRefine((v, ctx) => {
      const all = `${v.subject}\n${v.body}`;
      if (!v.body.includes(NAME_PLACEHOLDER)) ctx.addIssue({ code: 'custom', message: 'body must greet the candidate with the name placeholder' });
      if (FORBIDDEN.test(all)) ctx.addIssue({ code: 'custom', message: 'must not mention scores, rubric or ranking' });
      if (OTHER_PLACEHOLDER.test(all)) ctx.addIssue({ code: 'custom', message: 'contains a stray placeholder' });
      if (!numbersAreGrounded(all, redactedCvText)) ctx.addIssue({ code: 'custom', message: 'contains a number that is not in the CV' });
    });

  const task =
    emailType === 'invite'
      ? `Invite the candidate to interview for the ${roleName} role at Kargo. Warmly mention one or two specific things from their CV that stood out, and ask them to reply with their availability. Do not state any date, time or duration.`
      : `Decline the candidate for the ${roleName} role at Kargo. Be warm, brief and human, not templated. Mention one genuine, specific thing from their CV that you respect. Do not give a reason for the decision, do not promise to keep their details, and do not suggest they were compared with others.`;

  return generateStructured({
    candidateId,
    schema,
    system: `You draft a plain-text email to a job candidate using ONLY facts that appear literally in the \
de-identified CV given to you; never invent or embellish. You do not know the candidate's name: address them \
by writing the literal token ${NAME_PLACEHOLDER} exactly where their name goes (for example "Hi ${NAME_PLACEHOLDER},"), \
and use no other name or placeholder. Sign off as "The Kargo hiring team". Never mention scores, a rubric, \
rankings, criteria or an evaluation process. The role description is background for tone only.`,
    prompt: `Role context:\n${JOB_DESCRIPTIONS[role]}\n\nTask: ${task}\n\nCV (de-identified):\n"""\n${redactedCvText}\n"""`,
  });
}

function titleCaseIfShouting(name: string): string {
  return name === name.toUpperCase() ? name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : name;
}

// Deterministic substitution of the real name, after the AI call. Throws if
// anything placeholder-like survives or the name did not land in the body.
export function finalizeEmail(draft: EmailDraft, realName: string): EmailDraft {
  const name = titleCaseIfShouting(realName.trim());
  const fill = (s: string) => s.split(NAME_PLACEHOLDER).join(name);
  const out = { subject: fill(draft.subject), body: fill(draft.body) };
  if (!out.body.includes(name)) throw new Error('Email body does not contain the candidate name after substitution.');
  if (/\{\{|\}\}|\[REDACTED\]|\[NAME\]/i.test(`${out.subject}\n${out.body}`)) {
    throw new Error('Email still contains a placeholder after substitution.');
  }
  return out;
}
