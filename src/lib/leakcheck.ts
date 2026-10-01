// Programmatic PII leak check. It is deliberately independent of the
// redaction code: it takes the exact PII values stored for a candidate and
// asserts that none of them (nor any contact-shaped residue) appear in a
// piece of text. Anything other than a definite pass is a failure.

export interface PiiValues {
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface LeakResult {
  pass: boolean;
  // Categories only — never the offending values — so results are safe to log.
  findings: string[];
}

export const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

export const URL_RE =
  /(?:https?:\/\/|www\.)\S+|\b(?:linkedin|github|gitlab|behance|dribbble|twitter|instagram|facebook|medium|flowcv|notion|kaggle)\.[a-z]{2,}(?:\/\S*)?|\b(?:[a-z0-9-]+\.)+(?:com|in|me|io|net|org|dev|app|co|ai)\b(?:\/\S*)?/gi;

export const HANDLE_RE = /(?<![\w@.])@[A-Za-z0-9_]{3,}/g;

// Plain spaces only as separators: a tab or newline separates two numbers.
export const PHONE_RE = /(?<![\w.])\+?\(?\d[\d (). -]{7,18}\d(?![\w])/g;

export function normalizeText(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[​-‍﻿­]/g, '')
    .replace(/\s*[[(]\s*at\s*[\])]\s*/gi, '@')
    .replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, '.');
}

const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const digits = (s: string) => s.replace(/\D/g, '');

export function isPhoneLike(match: string): boolean {
  const d = digits(match);
  if (d.length < 10 || d.length > 15) return false;
  // 2015-2018 style ranges and other date runs are not phone numbers.
  if (/^(?:19|20)\d{2}\D+(?:19|20)\d{2}$/.test(match.trim())) return false;
  return true;
}

export function findPhones(text: string): string[] {
  return (text.match(PHONE_RE) ?? []).filter(isPhoneLike);
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function nameTokens(name: string): string[] {
  return name
    .normalize('NFKC')
    .split(/\s+/)
    .map((t) => t.replace(/[.]/g, ''))
    .filter((t) => t.length >= 2);
}

export function assertNoLeak(pii: PiiValues, rawText: string): LeakResult {
  const findings: string[] = [];
  const text = normalizeText(rawText);
  const lower = text.toLowerCase();
  const flatText = flat(text);

  if (pii.email) {
    const e = pii.email.toLowerCase().trim();
    const local = e.split('@')[0];
    if (lower.includes(e) || (flat(e).length >= 8 && flatText.includes(flat(e)))) findings.push('email');
    if (local.length >= 5 && lower.includes(local) && /[a-z]{3}/.test(local)) findings.push('email-local-part');
  }

  if (pii.phone) {
    const d = digits(pii.phone);
    const last10 = d.slice(-10);
    if (last10.length === 10) {
      // Compare against every maximal number-like run so separate numbers
      // are never glued together into a false match.
      for (const run of text.match(/[+\d][\d (). -]{5,}\d/g) ?? []) {
        if (digits(run).includes(last10)) {
          findings.push('phone');
          break;
        }
      }
    }
  }

  if (pii.name) {
    const tokens = nameTokens(pii.name);
    const joined = flat(tokens.join(''));
    if (joined.length >= 5 && flatText.includes(joined)) findings.push('name-joined');
    if (tokens.length >= 2) {
      const reversed = flat([...tokens].reverse().join(''));
      if (reversed.length >= 5 && flatText.includes(reversed)) findings.push('name-joined-reversed');
    }
    for (const t of tokens) {
      const tl = t.toLowerCase();
      const hit = t.length >= 4 ? lower.includes(tl) : new RegExp(`(?<![a-z0-9])${escapeRe(tl)}(?![a-z0-9])`, 'i').test(lower);
      if (hit) {
        findings.push('name-token');
        break;
      }
    }
  }

  // Residual contact-shaped content, whatever the stored values are.
  if (new RegExp(EMAIL_RE.source).test(text)) findings.push('email-pattern');
  if (new RegExp(URL_RE.source, 'i').test(text)) findings.push('url-pattern');
  if (new RegExp(HANDLE_RE.source).test(text)) findings.push('handle-pattern');
  if (findPhones(text).length > 0) findings.push('phone-pattern');

  return { pass: findings.length === 0, findings: [...new Set(findings)] };
}
