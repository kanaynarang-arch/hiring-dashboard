// Deterministic PII extraction and removal. No model is involved at any
// point: not to find the name, not to check that it is gone.
//
// The result is either a definite success (name established, exactly one
// email, everything identifying removed, leak check passed) or a failure
// that routes the candidate to needs_review. There is no "best effort" path.

import {
  EMAIL_RE,
  HANDLE_RE,
  PHONE_RE,
  URL_RE,
  assertNoLeak,
  findPhones,
  nameTokens,
  normalizeText,
} from './leakcheck';

export interface DeidInput {
  rawText: string;
  filename: string;
  pdfTitle?: string;
  pdfAuthor?: string;
}

export type DeidResult =
  | { ok: true; name: string; email: string; phone: string | null; redactedText: string }
  | { ok: false; reason: string; email: string | null; phone: string | null };

const REDACTED = '[REDACTED]';

// Words that make a segment NOT a person's name: section headings, job titles,
// organisations, places, dates. Matching is whole-word and case-insensitive.
const NON_NAME_WORDS = new Set(
  `education experience skills skill summary objective profile competencies competency synopsis
   qualifications qualification academic development professional core work scaling personal details
   technical tools tool publications volunteer leadership honors honours activities about career
   certifications certification projects project achievements awards languages interests references
   contact contacts overview highlights expertise strengths responsibilities additional training courses
   internship internships employment history key areas domain focus declaration hobbies extra curricular
   product products manager management engineer engineering leader director associate officer executive
   analyst consultant specialist developer designer strategy strategic operations growth marketing sales
   founder ceo cto coo cfo vp head lead senior junior intern ai ml data software business program digital
   chief president partner owner principal staff architect coordinator administrator assistant research
   researcher scientist analytics design user customer revenue platform integration integrations
   university institute college school academy technologies technology tech solutions systems services
   private pvt ltd limited inc llc corp corporation company group labs lab logistics freight supply chain
   capital finance bank banking consulting consultancy ventures industries enterprises international
   global foundation india mumbai delhi new bangalore bengaluru pune hyderabad chennai kolkata gurgaon
   gurugram noida ahmedabad jaipur kochi thane navi maharashtra karnataka telangana gujarat tamil nadu
   kerala usa uk singapore dubai present current month year years months expected cgpa gpa percent class
   board hsc ssc icse cbse btech mtech bachelor master masters mba pgdm bsc msc science arts commerce
   january february march april may june july august september october november december jan feb mar apr
   jun jul aug sep sept oct nov dec linkedin email phone mobile portfolio website address github kargo
   mesa page of the and for with from full time part remote hybrid onsite generative agentic gen`
    .split(/\s+/)
    .filter(Boolean),
);

const TITLE_WORD = /^[A-Z][a-z]+(?:[-'’][A-Za-z]+)*\.?$/;
const UPPER_WORD = /^[A-Z]{2,}(?:[-'’][A-Z]+)*\.?$/;
const INITIAL = /^[A-Z]\.?$/;

const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function stripPageMarkers(text: string): string {
  return text.replace(/^\s*-- \d+ of \d+ --\s*$/gm, '');
}

// Replaces anything contact-shaped with a tab so the surrounding words fall
// into their own segments.
function maskContactTokens(line: string): string {
  return line
    .replace(EMAIL_RE, '\t')
    .replace(URL_RE, '\t')
    .replace(HANDLE_RE, '\t')
    .replace(PHONE_RE, (m) => (findPhones(m).length ? '\t' : m))
    .replace(/\b(?:e-?mail|phone|mobile|mob|tel|contact|linkedin|github|portfolio|website|address)\s*:/gi, '\t');
}

function splitSegments(line: string): string[] {
  return line
    .split(/\t+|\s{2,}|[|·•●○◦▪‣⋄◆■►▶,;]|\s[-–—]\s|\s\/\s/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isNameShaped(segment: string): string[] | null {
  const words = segment.split(/\s+/);
  if (words.length < 2 || words.length > 4) return null;
  let realWords = 0;
  for (const w of words) {
    if (!(TITLE_WORD.test(w) || UPPER_WORD.test(w) || INITIAL.test(w))) return null;
    const bare = w.replace(/\./g, '').toLowerCase();
    if (NON_NAME_WORDS.has(bare)) return null;
    if (bare.length >= 2) realWords += 1;
  }
  if (realWords < 2) return null;
  if (words[0].replace(/\./g, '').length < 2) return null; // first token must be a real name, not an initial
  return words.map((w) => w.replace(/\./g, ''));
}

interface NameGroup {
  first: string;
  last: string;
  variants: string[][];
  lines: number[];
  count: number;
}

function titleCase(words: string[]): string {
  return words
    .map((w) => (w === w.toUpperCase() && w.length > 1 ? w[0] + w.slice(1).toLowerCase() : w))
    .join(' ');
}

interface Established {
  name: string;
}

function establishName(
  lines: string[],
  contactLines: number[],
  corroborationText: { url: string; filename: string; meta: string },
): Established | { error: string } {
  const groups = new Map<string, NameGroup>();

  lines.forEach((line, idx) => {
    for (const seg of splitSegments(maskContactTokens(line))) {
      const words = isNameShaped(seg);
      if (!words) continue;
      const first = words[0].toLowerCase();
      const last = words[words.length - 1].toLowerCase();
      if (first === last) continue;
      const key = `${first}|${last}`;
      const g = groups.get(key) ?? { first, last, variants: [], lines: [], count: 0 };
      g.variants.push(words);
      g.lines.push(idx);
      g.count += 1;
      groups.set(key, g);
    }
  });

  // Tier A: corroborated by something independent of the CV body (a URL slug,
  // the filename or the PDF metadata). Tier B: only repeated near the header or
  // contact block. Tier A always outranks tier B, so a repeated phrase that
  // merely looks like a name ("Real Estate") cannot compete with the real one.
  const tierA: NameGroup[] = [];
  const tierB: NameGroup[] = [];
  for (const g of groups.values()) {
    const adjacent = g.lines.some(
      (l) => l <= 2 || contactLines.some((c) => Math.abs(c - l) <= 3),
    );
    if (!adjacent) continue;
    const both = (hay: string) => hay.includes(flat(g.first)) && hay.includes(flat(g.last));
    if (both(corroborationText.url) || both(corroborationText.filename) || both(corroborationText.meta)) {
      tierA.push(g);
    } else if (g.count >= 2) {
      tierB.push(g);
    }
  }
  const eligible = tierA.length > 0 ? tierA : tierB;

  if (eligible.length === 0) {
    return { error: 'Candidate name could not be established: no name near the header or contact block was corroborated.' };
  }
  if (eligible.length > 1) {
    return { error: `Candidate name is ambiguous: ${eligible.length} different corroborated name candidates were found.` };
  }
  const g = eligible[0];
  const best = g.variants.reduce((a, b) => (b.length > a.length ? b : a));
  const display = titleCase(best);
  return { name: display };
}

function nameRegexes(name: string): RegExp[] {
  const tokens = nameTokens(name);
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const joined = tokens.map(escape).join('[\\s._-]*');
  const regexes = [new RegExp(joined, 'gi')];
  for (const t of tokens) {
    const e = escape(t);
    // 4+ letters match inside longer words ("priyakrishnan"); shorter tokens
    // ("Rao") are whole-word only so ordinary words are not mangled.
    regexes.push(new RegExp(t.length >= 4 ? e : `(?<![A-Za-z0-9])${e}(?![A-Za-z0-9])`, 'gi'));
  }
  return regexes;
}

export function deidentify(input: DeidInput): DeidResult {
  try {
    const text = stripPageMarkers(normalizeText(input.rawText));
    if (text.replace(/\s/g, '').length < 200) {
      return { ok: false, reason: 'The PDF has no extractable text (it may be a scan).', email: null, phone: null };
    }
    const lines = text.split('\n');

    const emails = [...new Set((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))];
    const phones = findPhones(text);
    const distinctPhones = [...new Set(phones.map((p) => p.replace(/\D/g, '').slice(-10)))];

    const contactLines: number[] = [];
    lines.forEach((l, i) => {
      if (new RegExp(EMAIL_RE.source).test(l) || findPhones(l).length || new RegExp(URL_RE.source, 'i').test(l)) {
        contactLines.push(i);
      }
    });

    const firstEmailLine = lines.findIndex((l) => new RegExp(EMAIL_RE.source).test(l));
    const primaryPhone =
      phones.length === 0
        ? null
        : [...phones].sort((a, b) => {
            const dist = (p: string) =>
              Math.min(...lines.map((l, i) => (l.includes(p) ? Math.abs(i - firstEmailLine) : Infinity)));
            return dist(a) - dist(b);
          })[0].trim();
    const partialPhone = distinctPhones.length === 1 ? primaryPhone : null;

    if (emails.length === 0) {
      return { ok: false, reason: 'No email address was found in the CV.', email: null, phone: partialPhone };
    }
    if (emails.length > 1) {
      return {
        ok: false,
        reason: `The CV contains ${emails.length} different email addresses, so the candidate's own address is ambiguous.`,
        email: null,
        phone: partialPhone,
      };
    }
    const email = emails[0];

    const urlTexts = [...(text.match(URL_RE) ?? []), email.split('@')[0]].join(' ');
    const established = establishName(lines, contactLines, {
      url: flat(urlTexts),
      filename: flat(input.filename.replace(/\.[^.]+$/, '')),
      meta: flat(`${input.pdfTitle ?? ''} ${input.pdfAuthor ?? ''}`),
    });
    if ('error' in established) {
      return { ok: false, reason: established.error, email, phone: partialPhone };
    }
    const name = established.name;

    let redacted = text;
    redacted = redacted.replace(EMAIL_RE, REDACTED);
    redacted = redacted.replace(URL_RE, REDACTED);
    redacted = redacted.replace(
      /\b(?:linkedin|github|twitter|instagram|behance|portfolio|website)\s*:\s*\S+/gi,
      REDACTED,
    );
    redacted = redacted.replace(HANDLE_RE, REDACTED);
    redacted = redacted.replace(PHONE_RE, (m) => (findPhones(m).length ? REDACTED : m));
    for (const re of nameRegexes(name)) redacted = redacted.replace(re, REDACTED);
    redacted = redacted
      .replace(/(?:\[REDACTED\][ \t·|,•–—-]*){2,}/g, `${REDACTED} `)
      .replace(/[ \t]+\n/g, '\n');

    const leak = assertNoLeak({ name, email, phone: primaryPhone }, redacted);
    if (!leak.pass) {
      return {
        ok: false,
        reason: `Leak check failed after redaction (${leak.findings.join(', ')}).`,
        email,
        phone: partialPhone,
      };
    }
    return { ok: true, name, email, phone: primaryPhone, redactedText: redacted };
  } catch (err) {
    return {
      ok: false,
      reason: `De-identification errored: ${err instanceof Error ? err.message : 'unknown error'}`,
      email: null,
      phone: null,
    };
  }
}
