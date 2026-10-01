// Pure string utility — no server-only imports — so it's safe to use from
// client components that just need to preview a draft with the real name.
export const NAME_PLACEHOLDER = '{{CANDIDATE_NAME}}';

export function applyCandidateName(text: string, name: string): string {
  return text.split(NAME_PLACEHOLDER).join(name);
}
