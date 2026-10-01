import { google } from '@ai-sdk/google';

// Single place to choose the model for every AI step (scoring, briefs, emails).
export function getModel() {
  return google(process.env.AI_MODEL || 'gemini-3.1-pro-preview');
}
