// Proves the real Confirm & send path to Resend using a SYNTHETIC candidate (a made-up person)
// whose email is TEST_RECIPIENT. Without a verified Resend domain, Resend only delivers to the
// account owner's own address, so TEST_RECIPIENT must be that address (and a MESA address).
// Usage: BASE_URL=... TEST_RECIPIENT=you@pg27.mesaschool.co npx tsx --env-file=.env.local tests/integration/send-self.ts [--keep]
import { getDb } from '../../src/lib/db';
import { isMesaTestAddress } from '../../src/lib/send';
import { getResendDeliveryStatus } from '../../src/lib/resend';
import { BASE_URL, Checks, uploadHttp, waitTerminal } from './lib';
import { CV_BODY, makePdf } from './pdf';

(async () => {
  const to = process.env.TEST_RECIPIENT;
  if (!to || !isMesaTestAddress(to)) throw new Error('Set TEST_RECIPIENT to a MESA test address (your own Resend login address).');
  const checks = new Checks();
  const db = getDb();
  const pdf = makePdf(['Jane Roe', 'Product Manager', `+91 91234 56789 | ${to} | Mumbai | linkedin.com/in/janeroe-pm`, ...CV_BODY]);
  const id = await uploadHttp(pdf, 'Jane_Roe_CV.pdf', 'pm');
  const done = await waitTerminal(id);
  checks.check('synthetic candidate reached scored', done.status === 'scored', done.status);

  const t0 = Date.now();
  const conf = await fetch(`${BASE_URL}/api/candidates/${id}/confirm`, { method: 'POST' });
  const send = await fetch(`${BASE_URL}/api/candidates/${id}/send`, { method: 'POST' });
  const out = await send.json();
  const sendMs = Date.now() - t0;
  console.log(`confirm ${conf.status}, send ${send.status} in ${sendMs}ms: ${out.message}`);
  const { data: e } = await db.from('candidate_emails').select('status,resend_message_id,sent_at,body,email_type').eq('candidate_id', id).single();
  const { data: c } = await db.from('candidates').select('status').eq('id', id).single();
  checks.check('Resend returned a message id and the email row is sent', send.ok && e?.status === 'sent' && Boolean(e.resend_message_id), e?.resend_message_id ?? '');
  checks.check('candidate status is sent in Supabase', c?.status === 'sent');
  checks.check('the sent email contains the real name', Boolean(e?.body.includes('Jane Roe')));
  checks.check('the send call returned quickly', sendMs < 30_000, `${sendMs}ms`);
  const again = await (await fetch(`${BASE_URL}/api/candidates/${id}/send`, { method: 'POST' })).json();
  checks.check('a second click sends nothing', again.alreadySent === true);
  if (e?.resend_message_id) {
    const status = await getResendDeliveryStatus(e.resend_message_id);
    if (status === 'unreadable_with_sending_only_key') console.log('UNVERIFIED: delivery status needs a full-access key; check the inbox of', to);
    else checks.check('Resend reports delivered', status === 'delivered', String(status));
  }
  checks.summary();
  if (!process.argv.includes('--keep')) await db.from('candidates').delete().eq('id', id);
  process.exit(checks.failed.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
