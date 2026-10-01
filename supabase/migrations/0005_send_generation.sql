-- Part of the Resend idempotency key. Incremented whenever a test-mode send is reopened for a real send,
-- so Resend's 24h duplicate suppression can never swallow a genuinely new send.
alter table candidate_emails add column if not exists send_generation int not null default 0;
