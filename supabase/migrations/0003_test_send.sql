-- Track where a sent email actually went, and whether it was a test-mode send (delivered to the
-- test inbox instead of the candidate). A test send does not permanently lock the candidate.
alter table candidate_emails add column if not exists test_send boolean not null default false;
alter table candidate_emails add column if not exists sent_to text;
