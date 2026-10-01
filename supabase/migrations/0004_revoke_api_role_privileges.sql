-- Defence in depth: RLS already denies everything (enabled, no policies), but the API roles should not
-- hold table privileges at all. Only the server (service_role) touches these tables.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
create index if not exists idx_candidate_scores_criterion on candidate_scores(criterion_id);
