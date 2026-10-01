// A test-mode send must not lock a candidate forever. Uses a throwaway candidate row only.
// Usage: npx tsx --env-file=.env.local tests/integration/test-send-reopen.ts
import { getDb } from '../../src/lib/db';
import { reopenTestSends } from '../../src/lib/send';
import { Checks } from './lib';

(async () => {
  const checks = new Checks();
  const db = getDb();
  delete process.env.EMAIL_TEST_RECIPIENT;
  const { data: c } = await db.from('candidates').insert({ applied_role: 'pm', original_filename: 'reopen-test.pdf', status: 'sent', stage: 'sent' }).select('id').single();
  const id = c!.id as string;
  await db.from('candidate_emails').insert({ candidate_id: id, email_type: 'rejection', subject: 's', body: 'b', status: 'sent', resend_message_id: 'x', sent_at: new Date().toISOString(), test_send: true, sent_to: 'owner@pg27.mesaschool.co', confirmed_at: new Date().toISOString(), confirmed_hash: 'h' });

  process.env.EMAIL_TEST_RECIPIENT = 'owner@pg27.mesaschool.co';
  checks.check('while test mode is on, a test send stays sent (nothing reopened)', (await reopenTestSends([id])) === 0);

  delete process.env.EMAIL_TEST_RECIPIENT;
  checks.check('once test mode is off, the test send is reopened', (await reopenTestSends([id])) === 1);
  const { data: e } = await db.from('candidate_emails').select('status,test_send,sent_to,resend_message_id,confirmed_at').eq('candidate_id', id).single();
  const { data: cs } = await db.from('candidates').select('status').eq('id', id).single();
  checks.check('draft is clean: unsent, unconfirmed, no message id', e?.status === 'draft' && !e.test_send && !e.sent_to && !e.resend_message_id && !e.confirmed_at);
  checks.check('candidate is back to scored', cs?.status === 'scored');
  const { data: g } = await db.from('candidate_emails').select('send_generation').eq('candidate_id', id).single();
  checks.check('send_generation was incremented, so the next send gets a fresh Resend idempotency key', Number(g?.send_generation) === 1);

  // a REAL send (test_send false) is never reopened
  await db.from('candidate_emails').update({ status: 'sent', test_send: false, resend_message_id: 'real' }).eq('candidate_id', id);
  await db.from('candidates').update({ status: 'sent' }).eq('id', id);
  checks.check('a real (non-test) send is never reopened', (await reopenTestSends([id])) === 0);

  await db.from('candidates').delete().eq('id', id);
  checks.summary();
  process.exit(checks.failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
