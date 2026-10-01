// Usage: npx tsx --env-file=.env.local scripts/seed-rubric.ts [path/to/rubric.txt]
// Parses rubric.txt and upserts one rubric_criteria row per criterion per role.
import { readFileSync } from 'node:fs';
import { getDb } from '../src/lib/db';
import { parseRubric } from '../src/lib/rubric';

async function main() {
  const file = process.argv[2] ?? 'data/rubric.txt';
  const rows = parseRubric(readFileSync(file, 'utf8'));
  const db = getDb();
  const { error } = await db.from('rubric_criteria').upsert(rows, { onConflict: 'role,name' });
  if (error) throw error;
  const { data, error: readErr } = await db
    .from('rubric_criteria')
    .select('role,name,weight,sort_order')
    .order('role')
    .order('sort_order');
  if (readErr) throw readErr;
  for (const role of ['pm', 'spm']) {
    const r = (data ?? []).filter((x) => x.role === role);
    console.log(role, r.length, 'criteria, weights', r.map((x) => Number(x.weight)).join('/'), 'sum', r.reduce((s, x) => s + Number(x.weight), 0));
  }
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
