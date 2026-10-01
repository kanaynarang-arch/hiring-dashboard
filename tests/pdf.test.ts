import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeExtractedText } from '../src/lib/pdf';

test('NUL and control characters are removed, newlines and tabs kept', () => {
  assert.equal(sanitizeExtractedText('a\u0000b\u0007c\n\td\u007Fe'), 'abc\n\tde');
});
test('lone surrogates are removed, valid pairs kept', () => {
  assert.equal(sanitizeExtractedText('x\uD800y'), 'xy');
  assert.equal(sanitizeExtractedText('x\u{1F600}y'), 'x\u{1F600}y');
});
