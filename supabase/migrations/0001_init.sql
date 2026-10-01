-- Initial schema (already applied to the project).
create table candidates (
  id uuid primary key default gen_random_uuid(),
  applied_role text not null check (applied_role in ('pm','spm')),
  original_filename text not null,
  status text not null default 'processing' check (status in ('processing','needs_review','scored','sent')),
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Isolated PII store. No code path that builds an AI prompt reads this table
-- (the only readers are the leak check, the email-name substitution and the send step).
create table candidate_pii (
  candidate_id uuid primary key references candidates(id) on delete cascade,
  name text not null, email text not null, phone text,
  raw_cv_text text not null,
  created_at timestamptz not null default now()
);
-- De-identified text: the only CV content any AI request may contain.
create table candidate_redacted_cv (
  candidate_id uuid primary key references candidates(id) on delete cascade,
  redacted_text text not null,
  created_at timestamptz not null default now()
);
create table rubric_criteria (
  id serial primary key,
  role text not null check (role in ('pm','spm')),
  name text not null, description text not null,
  weight numeric not null, sort_order int not null
);
create table candidate_scores (
  id serial primary key,
  candidate_id uuid not null references candidates(id) on delete cascade,
  role text not null check (role in ('pm','spm')),
  criterion_id int not null references rubric_criteria(id),
  score numeric not null check (score >= 0 and score <= 10),
  reason text not null,
  created_at timestamptz not null default now(),
  unique (candidate_id, role, criterion_id)
);
create table candidate_role_scores (
  candidate_id uuid not null references candidates(id) on delete cascade,
  role text not null check (role in ('pm','spm')),
  total_score numeric not null,
  created_at timestamptz not null default now(),
  primary key (candidate_id, role)
);
create table candidate_briefs (
  candidate_id uuid primary key references candidates(id) on delete cascade,
  brief_text text not null,
  created_at timestamptz not null default now()
);
create table candidate_emails (
  candidate_id uuid primary key references candidates(id) on delete cascade,
  email_type text not null check (email_type in ('invite','rejection')),
  subject text not null, body text not null,
  status text not null default 'draft' check (status in ('draft','sent','failed')),
  resend_message_id text, error_message text, sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_candidates_applied_role_status on candidates(applied_role, status);
create index idx_candidate_role_scores_role_total on candidate_role_scores(role, total_score desc);
alter table candidates enable row level security;
alter table candidate_pii enable row level security;
alter table candidate_redacted_cv enable row level security;
alter table rubric_criteria enable row level security;
alter table candidate_scores enable row level security;
alter table candidate_role_scores enable row level security;
alter table candidate_briefs enable row level security;
alter table candidate_emails enable row level security;
-- RLS is enabled with NO policies: only the service_role key (server only) can read or write.
