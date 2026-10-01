import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deidentify } from '../src/lib/deidentify';
import { assertNoLeak } from '../src/lib/leakcheck';

const BODY = `PROFESSIONAL SUMMARY
Product manager with six years of experience building logistics software for freight forwarders.
Led the shipment tracking roadmap, ran customer discovery with operations teams and shipped
three features that customers adopted without being asked.
EXPERIENCE
Acme Freight Tech  2019 - 2024
Built a carrier coordination tool used by the whole operations team. Wrote a post-mortem after a
failed launch and turned it into a launch checklist the team still uses. CGPA 9.48/10.
EDUCATION
Delhi University  2015 - 2018`;

const pmStyle = (extra = '') => `Jane Roe
Product Manager
+91 91234 56789 · jane.roe@example.org · Mumbai · linkedin.com/in/janeroe-pm
${BODY}
${extra}`;

const designStyle = `${BODY}
Jane Roe\tJane Roe
jane.roe@example.org\t+91 91234 56789\t91234 56789
https://janeroe.example.com`;

test('header + contact line + URL slug: resolves and removes every identifier', () => {
  const r = deidentify({ rawText: pmStyle(), filename: 'cv.pdf' });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.name, 'Jane Roe');
  assert.equal(r.email, 'jane.roe@example.org');
  const t = r.redactedText.toLowerCase();
  for (const bad of ['jane', 'roe', 'janeroe', 'jane.roe@example.org', '91234', 'linkedin.com']) {
    assert.ok(!t.includes(bad), `redacted text still contains ${bad}`);
  }
  assert.ok(t.includes('shipment tracking'));
  assert.ok(t.includes('2019 - 2024'), 'year ranges must survive');
  assert.ok(t.includes('9.48/10'), 'CGPA must survive');
});

test('design-heavy layout with doubled name and contact block at the end resolves', () => {
  const r = deidentify({ rawText: designStyle, filename: 'cv.pdf' });
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(!/jane|roe|example\.org|91234/i.test(r.redactedText));
});

test('ALL-CAPS name is stored in normal case', () => {
  const r = deidentify({ rawText: pmStyle().replaceAll('Jane Roe', 'JANE ROE'), filename: 'JANE_ROE_CV.pdf' });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.name, 'Jane Roe');
});

test('name fused into a LinkedIn slug is removed', () => {
  const r = deidentify({ rawText: pmStyle(), filename: 'cv.pdf' });
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(!/janeroe/i.test(r.redactedText));
});

test('social handles and labelled handles are removed', () => {
  const r = deidentify({ rawText: pmStyle('Twitter: @jroe_pm\nGitHub: jroe-codes\n'), filename: 'cv.pdf' });
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(!/jroe/i.test(r.redactedText));
});

test('FAIL CLOSED: no email', () => {
  const r = deidentify({ rawText: pmStyle().replace('jane.roe@example.org', ''), filename: 'cv.pdf' });
  assert.equal(r.ok, false);
});

test('FAIL CLOSED: two different email addresses', () => {
  const r = deidentify({ rawText: pmStyle('Reference: sam.lee@other.org'), filename: 'cv.pdf' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /different email/);
});

test('FAIL CLOSED: no corroborated name (name appears once, no hint anywhere)', () => {
  const text = `Jane Roe\n+91 91234 56789 · hello@example.org · Mumbai\n${BODY}`;
  const r = deidentify({ rawText: text, filename: 'resume.pdf' });
  assert.equal(r.ok, false);
});

test('FAIL CLOSED: two different corroborated names are ambiguous', () => {
  const text = `Jane Roe\tJane Roe\nSam Lee\tSam Lee\n+91 91234 56789 · hello@example.org\n${BODY}`;
  const r = deidentify({ rawText: text, filename: 'resume.pdf' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /ambiguous/);
});

test('an externally corroborated name outranks a repeated look-alike phrase', () => {
  const text = `Jane Roe\nReal Estate\tReal Estate\n+91 91234 56789 · hello@example.org\n${BODY}`;
  const r = deidentify({ rawText: text, filename: 'Jane_Roe_CV.pdf' });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.name, 'Jane Roe');
});

test('FAIL CLOSED: a PDF with no extractable text (scan)', () => {
  const r = deidentify({ rawText: ' \n\n ', filename: 'scan.pdf' });
  assert.equal(r.ok, false);
});

test('leak check: stored values are detected including normalised variants', () => {
  const pii = { name: 'Jane Roe', email: 'squad_1@pg27.mesaschool.co', phone: '+91 91234 56789' };
  assert.equal(assertNoLeak(pii, 'Led a team of six at a logistics startup.').pass, true);
  assert.equal(assertNoLeak(pii, 'contact: JANE ROE').pass, false);
  assert.equal(assertNoLeak(pii, 'reach me at SQUAD_1@PG27.MESASCHOOL.CO').pass, false);
  assert.equal(assertNoLeak(pii, 'squad_1 [at] pg27 [dot] mesaschool [dot] co').pass, false);
  assert.equal(assertNoLeak(pii, 'call (+91) 91234-56789').pass, false);
  assert.equal(assertNoLeak(pii, 'call 9123456789').pass, false);
  assert.equal(assertNoLeak(pii, 'profile janeroe-pm').pass, false);
  assert.equal(assertNoLeak(pii, 'see linkedin.com/in/someone').pass, false);
});

test('leak check: findings never contain the offending value', () => {
  const r = assertNoLeak({ name: 'Jane Roe', email: null, phone: null }, 'Jane Roe');
  assert.equal(r.pass, false);
  assert.ok(!JSON.stringify(r).toLowerCase().includes('jane'));
});

test('leak check: a short name token only matches as a whole word', () => {
  const pii = { name: 'Sam Das', email: null, phone: null };
  assert.equal(assertNoLeak(pii, 'Built a dashboard for the team').pass, true);
  assert.equal(assertNoLeak(pii, 'Managed by Das on the project').pass, false);
});
