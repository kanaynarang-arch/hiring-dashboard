import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRubric } from '../src/lib/rubric';

const rows = parseRubric(readFileSync('data/rubric.txt', 'utf8'));

test('one row per criterion per role, 4 each', () => {
  assert.equal(rows.filter((r) => r.role === 'pm').length, 4);
  assert.equal(rows.filter((r) => r.role === 'spm').length, 4);
});
test('PM weights 25/25/25/25 and SPM weights 20/20/35/25, each summing to 100', () => {
  assert.deepEqual(rows.filter((r) => r.role === 'pm').map((r) => r.weight), [25, 25, 25, 25]);
  assert.deepEqual(rows.filter((r) => r.role === 'spm').map((r) => r.weight), [20, 20, 35, 25]);
});
test('descriptions are non-empty single-line strings', () => {
  for (const r of rows) {
    assert.ok(r.description.length > 40);
    assert.ok(!r.description.includes('\n'));
  }
});
test('rejects a rubric whose weights do not sum to 100', () => {
  const broken = readFileSync('data/rubric.txt', 'utf8').replace('Weight: 35%', 'Weight: 30%');
  assert.throws(() => parseRubric(broken), /sum to/);
});
