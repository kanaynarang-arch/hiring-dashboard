// Pure presentation helpers, safe to import from client components.

// The brief is exactly three sentences, written in a fixed order (see ai/brief.ts):
// why the candidate fits, the strongest evidence, and the main thing to probe.
export const BRIEF_LABELS = ['Why they fit', 'Strongest evidence', 'Probe in the interview'] as const;

export function splitBrief(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

export function formatScore(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : n.toFixed(1);
}

export function formatBytes(n: number): string {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export const ROLE_NAME = { pm: 'Product Manager', spm: 'Senior Product Manager' } as const;
export const ROLE_SHORT = { pm: 'PM', spm: 'SPM' } as const;
