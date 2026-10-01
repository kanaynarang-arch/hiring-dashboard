import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, type Role } from '../../src/lib/db';
import { extractPdf } from '../../src/lib/pdf';

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100';

export function cvDir(): string {
  const dir = process.argv.find((a, i) => i >= 2 && !a.startsWith('--') && a.includes(path.sep)) ?? process.env.CV_DIR;
  if (!dir) throw new Error('Pass the CV folder as an argument or set CV_DIR.');
  return dir;
}

// Applied role for the test CVs. pm_* / spm_* are labelled. The unlabelled NN_name.pdf files have no
// stated role, so it is inferred from the experience the CV states, against the JD bands (PM 2-4 years,
// SPM 5-8): the largest "N years" figure, <= 4 means PM, >= 5 means SPM. CVs that state no figure fall
// back to the file number (01-15 PM, 16-30 SPM). A real founder selects the role in the upload form.
export function statedYears(text: string): number | null {
  const nums = [...text.matchAll(/(?<!\d)(\d{1,2})\s*\+?\s*(?:years|yrs)\b/gi)].map((m) => Number(m[1])).filter((n) => n >= 1 && n <= 25);
  return nums.length ? Math.max(...nums) : null;
}

export function roleFromStatedYears(years: number | null, fallback: Role): Role {
  return years === null ? fallback : years <= 4 ? 'pm' : 'spm';
}

export function roleFor(file: string): Role {
  if (file.startsWith('pm_')) return 'pm';
  if (file.startsWith('spm_')) return 'spm';
  return Number(file.slice(0, 2)) <= 15 ? 'pm' : 'spm';
}

export async function listCvs(dir: string) {
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  return Promise.all(
    files.map(async (file) => {
      const p = path.join(dir, file);
      const labelled = file.startsWith('pm_') || file.startsWith('spm_');
      const role = labelled ? roleFor(file) : roleFromStatedYears(statedYears((await extractPdf(readFileSync(p))).text), roleFor(file));
      return { file, path: p, role };
    }),
  );
}

export async function uploadHttp(buffer: Buffer, filename: string, role: Role): Promise<string> {
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }), filename);
  form.set('role', role);
  const res = await fetch(`${BASE_URL}/api/upload`, { method: 'POST', body: form });
  const json = (await res.json()) as { id?: string; error?: string };
  if (!res.ok || !json.id) throw new Error(`upload ${filename} -> ${res.status} ${json.error ?? ''}`);
  return json.id;
}

// Waits on the PERSISTED row, not on any UI or HTTP message.
export async function waitTerminal(id: string, timeoutMs = 300_000) {
  const t0 = Date.now();
  for (;;) {
    const { data } = await getDb().from('candidates').select('status, stage, review_reason').eq('id', id).single();
    if (data && data.status !== 'processing') return { ...data, ms: Date.now() - t0 };
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${id} (stage ${data?.stage})`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export async function runLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: limit }, async () => { while (queue.length) await fn(queue.shift() as T); }));
}

export class Checks {
  results: { name: string; pass: boolean; detail?: string }[] = [];
  check(name: string, pass: boolean, detail?: string) {
    this.results.push({ name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  }
  get failed() { return this.results.filter((r) => !r.pass); }
  summary() {
    console.log(`\n${this.results.length - this.failed.length}/${this.results.length} checks passed`);
    if (this.failed.length) { console.log('FAILED:'); this.failed.forEach((f) => console.log(' -', f.name, f.detail ?? '')); }
  }
}

export function readPdf(p: string): Buffer { return readFileSync(p); }

// Deletes EVERY candidate (and, by cascade, all scores, briefs and drafts). Refuses unless explicitly allowed.
export async function clearAllCandidates() {
  if (process.env.ALLOW_WIPE !== '1') {
    throw new Error('This test deletes ALL candidates. Re-run with ALLOW_WIPE=1 if that is what you want.');
  }
  const { error } = await getDb().from('candidates').delete().not('id', 'is', null);
  if (error) throw error;
}
