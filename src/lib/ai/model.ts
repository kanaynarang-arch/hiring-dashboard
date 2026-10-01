import { AsyncLocalStorage } from 'node:async_hooks';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

// Every request to Gemini goes through this module. Two guarantees live here:
//  1. The model is exactly process.env.AI_MODEL. There is no default and no
//     fallback model: a missing or failing model is an error, never a switch.
//  2. A request can only be made inside runWithCandidateContext(), which is
//     entered by guardedGenerate() after the PII leak check has passed.

export interface AiRequestRecord {
  candidateId: string;
  url: string;
  body: string;
}

const context = new AsyncLocalStorage<{ candidateId: string }>();

let recorder: ((r: AiRequestRecord) => void) | null = null;

// Test hook: receives the exact HTTP request body sent to the Gemini API.
export function setAiRequestRecorder(fn: ((r: AiRequestRecord) => void) | null) {
  recorder = fn;
}

export function runWithCandidateContext<T>(candidateId: string, fn: () => Promise<T>): Promise<T> {
  return context.run({ candidateId }, fn);
}

export function getModelId(): string {
  const id = process.env.AI_MODEL;
  if (!id) throw new Error('AI_MODEL is not set; refusing to pick a model implicitly.');
  return id;
}

const guardedFetch: typeof fetch = async (input, init) => {
  const ctx = context.getStore();
  if (!ctx) {
    throw new Error('Blocked: model request attempted outside a leak-checked candidate context.');
  }
  const body = typeof init?.body === 'string' ? init.body : '';
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes(`/models/${getModelId()}:`)) {
    throw new Error('Blocked: request targets a model other than AI_MODEL.');
  }
  recorder?.({ candidateId: ctx.candidateId, url, body });
  return fetch(input, init);
};

export function getModel() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set.');
  return createGoogleGenerativeAI({ apiKey, fetch: guardedFetch })(getModelId());
}
