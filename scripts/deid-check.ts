// Usage: npx tsx scripts/deid-check.ts <cv-folder>
// Runs the deterministic de-identification on every PDF in the folder (no AI,
// no database) and reports how many resolve cleanly. Filenames of the form
// [pm_|spm_|NN_]first_last.pdf are used ONLY as a test oracle for correctness.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { extractPdf } from '../src/lib/pdf';
import { deidentify } from '../src/lib/deidentify';

const dir = process.argv[2] ?? process.env.CV_DIR;
if (!dir) { console.error('Usage: tsx scripts/deid-check.ts <cv-folder>'); process.exit(2); }

async function main() {
  let ok = 0, review = 0, wrong = 0, leaks = 0;
  const reasons = new Map<string, number>();
  for (const f of readdirSync(dir).filter((x) => x.toLowerCase().endsWith('.pdf')).sort()) {
    const pdf = await extractPdf(readFileSync(path.join(dir, f)));
    const blind = process.env.NO_HINTS === '1'; // simulate a generic filename and no PDF metadata
    const r = deidentify({ rawText: pdf.text, filename: blind ? 'cv.pdf' : f, pdfTitle: blind ? '' : pdf.title, pdfAuthor: blind ? '' : pdf.author });
    if (!r.ok) {
      review++;
      reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
      console.log('NEEDS_REVIEW', f, '-', r.reason);
      continue;
    }
    ok++;
    const oracle = f.replace(/\.pdf$/i, '').split('_').filter((t) => /^[a-z]{3,}$/.test(t) && t !== 'pm' && t !== 'spm');
    const got = r.name.toLowerCase().split(/\s+/);
    if (oracle.length >= 2 && !(got.includes(oracle[0]) && got.includes(oracle[oracle.length - 1]))) {
      wrong++;
      console.log('WRONG_NAME', f);
    }
    const t = r.redactedText.toLowerCase();
    const flatT = t.replace(/[^a-z0-9]/g, '');
    const bad: string[] = [];
    // Independent of the app's own check: 4+ letter tokens match anywhere, shorter ones as whole words.
    for (const tok of oracle) if (tok.length >= 4 ? t.includes(tok) : new RegExp(`(?<![a-z0-9])${tok}(?![a-z0-9])`).test(t)) bad.push('name');
    if (oracle.length >= 2 && flatT.includes(oracle.join(''))) bad.push('name-joined');
    if (t.includes(r.email.toLowerCase())) bad.push('email');
    if (r.phone && flatT.includes(r.phone.replace(/\D/g, '').slice(-10))) bad.push('phone');
    if (bad.length) { leaks++; console.log('LEAK', f, [...new Set(bad)].join(',')); }
  }
  console.log(JSON.stringify({ total: ok + review, resolved: ok, needs_review: review, wrongName: wrong, leaks }, null, 0));
  for (const [k, v] of reasons) console.log(`  ${v}x ${k}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
