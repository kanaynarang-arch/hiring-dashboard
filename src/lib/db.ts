import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _db: SupabaseClient | null = null;

// Server-only client using the service_role key, which bypasses RLS.
// Every table has RLS enabled with no policies, so this is the only
// credential in the system that can read or write candidate data —
// never import this file from client components.
export function getDb(): SupabaseClient {
  if (!_db) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    }
    _db = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return _db;
}

export type Role = 'pm' | 'spm';

export type CandidateStatus = 'processing' | 'needs_review' | 'scored' | 'sent';

export interface Candidate {
  id: string;
  applied_role: Role;
  original_filename: string;
  status: CandidateStatus;
  stage: string;
  review_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface CandidatePii {
  candidate_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  raw_cv_text: string;
  created_at: string;
}

export interface RubricCriterion {
  id: number;
  role: Role;
  name: string;
  description: string;
  weight: number;
  sort_order: number;
}

export interface CandidateScore {
  candidate_id: string;
  role: Role;
  criterion_id: number;
  score: number;
  reason: string;
}

export interface CandidateRoleScore {
  candidate_id: string;
  role: Role;
  total_score: number;
}

export interface CandidateBrief {
  candidate_id: string;
  brief_text: string;
}

export type EmailType = 'invite' | 'rejection';
export type EmailStatus = 'draft' | 'sending' | 'sent' | 'failed';

export interface CandidateEmail {
  candidate_id: string;
  email_type: EmailType;
  subject: string;
  body: string;
  status: EmailStatus;
  resend_message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  confirmed_at: string | null;
  confirmed_hash: string | null;
  sending_started_at: string | null;
}
