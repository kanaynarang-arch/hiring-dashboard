// Rule-based, deterministic PII extraction and redaction. No AI call is
// ever involved in this step — sending the raw CV to a model just to find
// the name would itself violate the "no AI call sees unredacted text" rule.
// When confidence is insufficient, this fails closed (needsReview = true)
// rather than guessing.

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// URLs and social handles are direct identifiers ("linkedin.com/in/jane-doe")
// and often embed the candidate's name, so they're removed outright.
const URL_RE =
  /(?:https?:\/\/|www\.)\S+|\b(?:linkedin|github|gitlab|behance|dribbble|twitter|medium|flowcv)\.[a-z]{2,}(?:\/\S*)?|\b[a-z0-9-]+\.(?:com|in|me|io|co|net|org|dev)\/\S*/gi;

// Requires 7-15 digits overall so it doesn't catch years, zip codes, etc.
// Accepts leading +, and common separators (space, dot, dash, parens).
const PHONE_RE =
  /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?:[\s.-]?\d{2,4})?/g;

// Substring match against the whole line — catches contact/link lines.
const HEADER_SKIP_KEYWORDS = [
  'resume',
  'curriculum vitae',
  ' cv ',
  'linkedin',
  'github',
  'http',
  'www',
  'address',
  'phone',
  'email',
  'mobile',
  'contact',
  'portfolio',
  'behance',
  'flowcv',
];

// Whole-word match against each token — catches section headers and job
// titles that would otherwise pass a plain Title-Case check (e.g. "Work
// Experience", "Product Manager", "Professional Summary").
const NAME_DISQUALIFYING_WORDS = new Set([
  // section headers
  'education',
  'experience',
  'skills',
  'summary',
  'objective',
  'profile',
  'competencies',
  'synopsis',
  'qualifications',
  'academic',
  'development',
  'professional',
  'core',
  'work',
  'scaling',
  'personal',
  'details',
  'technical',
  'tools',
  'publications',
  'volunteer',
  'leadership',
  'honors',
  'activities',
  'about',
  'career',
  'certifications',
  'projects',
  'achievements',
  'awards',
  'languages',
  'interests',
  'references',
  'contact',
  // job-title words
  'product',
  'manager',
  'engineer',
  'leader',
  'director',
  'associate',
  'officer',
  'executive',
  'analyst',
  'consultant',
  'specialist',
  'developer',
  'designer',
  'strategy',
  'operations',
  'growth',
  'marketing',
  'sales',
  'founder',
  'ceo',
  'cto',
  'coo',
  'cfo',
  'vp',
  'head',
  'lead',
  'senior',
  'junior',
  'intern',
  'ai',
  'ml',
  'data',
  'software',
  'business',
  'project',
  'program',
  'digital',
  'chief',
  'president',
  'partner',
]);

function countDigits(s: string): number {
  return (s.match(/\d/g) || []).length;
}

// Strict Title Case: first letter uppercase, every subsequent letter
// lowercase (allows hyphen/apostrophe/period for names like "Al-Amin" or
// "D'Souza" or initials like "R."). This alone rejects ALL-CAPS section
// headers ("EDUCATION") without needing to enumerate them.
const STRICT_NAME_WORD_RE = /^[A-Z][a-z'.-]*$/;

function isPlausibleNameLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 45) return false;
  if (countDigits(trimmed) > 0) return false;
  if (trimmed.includes('@')) return false;
  if (/[|/•⋄\-–—]/.test(trimmed)) return false;

  const lower = trimmed.toLowerCase();
  if (HEADER_SKIP_KEYWORDS.some((kw) => lower.includes(kw))) return false;

  const words = trimmed.split(/\s+/).filter(Boolean);
  // Real names are essentially always 2-4 tokens; reject single words
  // (section headers, countries, job-title fragments) and long lines.
  if (words.length < 2 || words.length > 4) return false;

  for (const w of words) {
    if (!STRICT_NAME_WORD_RE.test(w)) return false;
    if (NAME_DISQUALIFYING_WORDS.has(w.toLowerCase())) return false;
  }
  return true;
}

export interface NameDetection {
  name: string | null;
  confidence: 'high' | 'medium' | 'none';
}

function detectName(text: string): NameDetection {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 20);

  for (let i = 0; i < lines.length; i++) {
    if (isPlausibleNameLine(lines[i])) {
      return { name: lines[i], confidence: i < 8 ? 'high' : 'medium' };
    }
  }
  return { name: null, confidence: 'none' };
}

const GENERIC_FILENAME_WORDS = new Set([
  'resume',
  'cv',
  'curriculum',
  'vitae',
  'final',
  'draft',
  'updated',
  'update',
  'download',
  'doc',
  'document',
  'new',
  'latest',
  'copy',
  'pm',
  'spm',
]);

// Files are very commonly named after the candidate ("Priya_Sharma_Resume.pdf").
// Used only as a corroborating cross-check on the text-detected name below —
// never as the sole source of a name — so it adds precision without adding a
// second way to guess wrong.
function filenameNameTokens(filename: string): string[] {
  const base = filename.replace(/\.[^.]+$/, '');
  const rawTokens = base.split(/[_\-.\s]+/).filter(Boolean);
  const tokens: string[] = [];
  for (const t of rawTokens) {
    if (t.length < 3) continue;
    if (!/^[A-Za-z]+$/.test(t)) continue;
    const lower = t.toLowerCase();
    if (GENERIC_FILENAME_WORDS.has(lower)) continue;
    tokens.push(lower);
  }
  return tokens;
}

// Returns false only when the filename looks name-shaped but shares no
// token with the detected name — that combination is the strongest signal
// available that the text heuristic grabbed the wrong line.
function filenameCorroboratesOrIsUninformative(filename: string, detectedName: string): boolean {
  const fileTokens = filenameNameTokens(filename);
  if (fileTokens.length < 2) return true; // filename too generic to judge
  const nameTokens = detectedName.toLowerCase().split(/\s+/);
  return fileTokens.some((t) => nameTokens.includes(t));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Name tokens of 4+ letters are matched anywhere, even inside a longer word
// ("priyakrishnan", "Kumar_Resume"), because a name fused into a handle or
// filename-like string is still the name. Shorter tokens ("Rao", "Das") are
// whole-word only to avoid mangling ordinary words ("Dashboard").
function nameRegexes(name: string): RegExp[] {
  const tokens = name.split(/\s+/).filter((t) => t.length >= 2);
  const joined = tokens.map(escapeRegExp).join('[\\s._-]*');
  const regexes = [new RegExp(joined, 'gi')];
  for (const t of tokens) {
    const e = escapeRegExp(t);
    regexes.push(new RegExp(t.length >= 4 ? e : `\\b${e}\\b`, 'gi'));
  }
  return regexes;
}

export interface DeidentifyResult {
  ok: boolean;
  reason?: string;
  name?: string;
  email?: string;
  phone?: string;
  redactedText?: string;
}

export function deidentifyCv(rawText: string, originalFilename: string): DeidentifyResult {
  const emails = rawText.match(EMAIL_RE) || [];
  const nameDetection = detectName(rawText);
  // Surfaced even on failure so a manual reviewer isn't starting from zero.
  const partial = { name: nameDetection.name ?? undefined, email: emails[0], phone: (rawText.match(PHONE_RE) || [])[0] };

  if (emails.length === 0) {
    return { ok: false, reason: 'No email address could be confidently detected in the CV.', ...partial };
  }
  if (!nameDetection.name) {
    return { ok: false, reason: 'Candidate name could not be confidently detected in the CV.', ...partial };
  }
  if (!filenameCorroboratesOrIsUninformative(originalFilename, nameDetection.name)) {
    return {
      ok: false,
      reason: `Detected name "${nameDetection.name}" does not match the filename and could not be confirmed.`,
      ...partial,
    };
  }

  const primaryEmail = emails[0];
  const phones = rawText.match(PHONE_RE) || [];
  const primaryPhone = phones[0];
  const name = nameDetection.name;

  let redacted = rawText;

  // Redact every email/phone match found by the same regexes used for
  // detection, so nothing found is ever left unredacted by construction.
  redacted = redacted.replace(EMAIL_RE, '[REDACTED]');
  redacted = redacted.replace(URL_RE, '[REDACTED]');
  redacted = redacted.replace(PHONE_RE, '[REDACTED]');

  // Redact the full name (in any joined form), then each name token.
  const nameRes = nameRegexes(name);
  for (const re of nameRes) {
    redacted = redacted.replace(re, '[REDACTED]');
  }

  // Defense-in-depth: confirm nothing identifying survived redaction.
  const leaked =
    redacted.match(EMAIL_RE) ||
    redacted.match(URL_RE) ||
    redacted.match(PHONE_RE) ||
    nameRes.some((re) => redacted.match(re));
  if (leaked) {
    return {
      ok: false,
      reason: 'Residual identifying information remained after redaction.',
      name,
      email: primaryEmail,
      phone: primaryPhone,
    };
  }

  return {
    ok: true,
    name,
    email: primaryEmail,
    phone: primaryPhone,
    redactedText: redacted,
  };
}
