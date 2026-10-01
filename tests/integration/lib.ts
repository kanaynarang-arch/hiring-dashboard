import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, type Role } from '../../src/lib/db';

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100';

export function cvDir(): string {
  const dir = process.argv.find((a, i) => i >= 2 && !a.startsWith('--') && a.includes(path.sep)) ?? process.env.CV_DIR;
  if (!dir) throw new Error('Pass the CV folder as an argument or set CV_DIR.');
  return dir;
}

export function listCvs(dir: string) {
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .sort()
    .map((f) => ({ file: f, path: path.join(dir, f), role: roleFor(f) }));
}

// pm_* / spm_* are labelled. Unlabelled NN_name.pdf files follow the same
// numbering convention: 01-15 applied for PM, 16-30 for SPM.
export function roleFor(file: string): Role {
  if (file.startsWith('pm_')) return 'pm';
  if (file.startsWith('spm_')) return 'spm';
  const n = Number(file.slice(0, 2));
  return n <= 15 ? 'pm' : 'spm';
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

export async function clearAllCandidates() {
  const { error } = await getDb().from('candidates').delete().not('id', 'is', null);
  if (error) throw error;
}
