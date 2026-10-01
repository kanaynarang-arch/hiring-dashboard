import type { Role } from './db';

export interface ParsedCriterion {
  role: Role;
  name: string;
  description: string;
  weight: number;
  sort_order: number;
}

const SECTION_HEADERS: Record<string, Role> = {
  'PRODUCT MANAGER - RUBRIC': 'pm',
  'SENIOR PRODUCT MANAGER - RUBRIC': 'spm',
};

// Parses rubric.txt into one row per criterion per role. Throws on anything
// unexpected (missing role, wrong criterion count, weights not summing to 100)
// so a malformed rubric can never be silently seeded.
export function parseRubric(text: string): ParsedCriterion[] {
  const lines = text.split(/\r?\n/);
  const rows: ParsedCriterion[] = [];
  let role: Role | null = null;
  let current: { name: string; description: string[]; inDescription: boolean } | null = null;
  const counters: Record<Role, number> = { pm: 0, spm: 0 };

  for (const raw of lines) {
    const line = raw.trim();
    if (line in SECTION_HEADERS) {
      role = SECTION_HEADERS[line];
      current = null;
      continue;
    }
    if (!role) continue;

    const nameMatch = line.match(/^Criterion name:\s*(.+)$/);
    if (nameMatch) {
      current = { name: nameMatch[1].trim(), description: [], inDescription: false };
      continue;
    }
    if (!current) continue;

    const descMatch = line.match(/^What a strong candidate looks like:\s*(.*)$/);
    if (descMatch) {
      current.inDescription = true;
      if (descMatch[1]) current.description.push(descMatch[1]);
      continue;
    }
    const weightMatch = line.match(/^Weight:\s*(\d+(?:\.\d+)?)\s*%$/);
    if (weightMatch) {
      if (!current.description.length) throw new Error(`Criterion "${current.name}" has no description`);
      counters[role] += 1;
      rows.push({
        role,
        name: current.name,
        description: current.description.join(' ').replace(/\s+/g, ' ').trim(),
        weight: Number(weightMatch[1]),
        sort_order: counters[role],
      });
      current = null;
      continue;
    }
    if (current.inDescription && line) current.description.push(line);
  }

  for (const r of ['pm', 'spm'] as Role[]) {
    const roleRows = rows.filter((x) => x.role === r);
    if (roleRows.length !== 4) throw new Error(`Expected 4 criteria for ${r}, parsed ${roleRows.length}`);
    const total = roleRows.reduce((s, x) => s + x.weight, 0);
    if (Math.abs(total - 100) > 1e-9) throw new Error(`Weights for ${r} sum to ${total}, expected 100`);
  }
  return rows;
}
