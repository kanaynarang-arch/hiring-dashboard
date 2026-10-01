import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roleFromStatedYears, statedYears } from './integration/lib';

test('stated experience maps to a role using the JD bands', () => {
  assert.equal(roleFromStatedYears(2, 'spm'), 'pm');
  assert.equal(roleFromStatedYears(4, 'spm'), 'pm');
  assert.equal(roleFromStatedYears(5, 'pm'), 'spm');
  assert.equal(roleFromStatedYears(13, 'pm'), 'spm');
});
test('a CV with no stated years keeps the fallback role', () => {
  assert.equal(roleFromStatedYears(null, 'pm'), 'pm');
  assert.equal(roleFromStatedYears(null, 'spm'), 'spm');
});
test('statedYears takes the largest plausible figure', () => {
  assert.equal(statedYears('3+ years in ops and 7 years overall'), 7);
  assert.equal(statedYears('no figures here'), null);
  assert.equal(statedYears('founded 2019, 120 years of history'), null);
});
