-- Progress reporting for the upload page.
alter table candidates add column if not exists stage text not null default 'queued';
alter table candidates add column if not exists stage_updated_at timestamptz not null default now();

-- An ambiguous CV is stored without a guessed name/email.
alter table candidate_pii alter column name drop not null;
alter table candidate_pii alter column email drop not null;

-- Send flow: persisted confirmation bound to the exact content, plus a 'sending' claim state.
alter table candidate_emails drop constraint if exists candidate_emails_status_check;
alter table candidate_emails add constraint candidate_emails_status_check
  check (status in ('draft','sending','sent','failed'));
alter table candidate_emails add column if not exists confirmed_at timestamptz;
alter table candidate_emails add column if not exists confirmed_hash text;
alter table candidate_emails add column if not exists sending_started_at timestamptz;

-- One row per criterion per role, populated from rubric.txt by scripts/seed-rubric.ts.
alter table rubric_criteria drop constraint if exists rubric_criteria_role_name_key;
alter table rubric_criteria add constraint rubric_criteria_role_name_key unique (role, name);
alter table rubric_criteria drop constraint if exists rubric_weight_positive;
alter table rubric_criteria add constraint rubric_weight_positive check (weight > 0);
