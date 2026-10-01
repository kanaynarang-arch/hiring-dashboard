import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateText } from 'ai';
import { getModel, getModelId, runWithCandidateContext } from '../src/lib/ai/model';

// model.ts reads these lazily, so setting them after the imports is fine.
process.env.AI_MODEL = 'test-model';
process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key-not-real';

test('model request outside a candidate context is blocked before any network call', async () => {
  await assert.rejects(() => generateText({ model: getModel(), prompt: 'hi', maxRetries: 0 }), /outside a leak-checked candidate context/);
});

test('AI_MODEL is required: no implicit default model', () => {
  const saved = process.env.AI_MODEL;
  delete process.env.AI_MODEL;
  assert.throws(() => getModelId(), /AI_MODEL is not set/);
  process.env.AI_MODEL = saved;
});

test('a request is only allowed for the configured model id', async () => {
  const model = getModel();
  process.env.AI_MODEL = 'some-other-model';
  await assert.rejects(
    () => runWithCandidateContext('c1', () => generateText({ model, prompt: 'hi', maxRetries: 0 })),
    /other than AI_MODEL/,
  );
  process.env.AI_MODEL = 'test-model';
});
