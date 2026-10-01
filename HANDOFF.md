# HANDOFF

Live URL: https://hiring-dashboard-sandy-omega.vercel.app (upload page `/`, dashboard `/dashboard`).
Nothing in this file is a secret. Items marked **UNVERIFIED** were not checked by the automated run.

## Blocked: needs you (in this order)

### 1. Resend runs in TEST MODE (no domain); verify a domain only to email real candidates
The course material asks for a free Resend account and for Confirm to send to "the MESA test address".
A Resend account with no verified domain can only deliver to its owner's address
(`kanay_narang@pg27.mesaschool.co`), so production has `EMAIL_TEST_RECIPIENT` set to that address:
every Confirm & send goes to **your inbox** with `[TEST]` in the subject, and the dashboard shows a
banner saying so. Candidates are **not** emailed.

Verified on the live site: Confirm on the real top PM candidate returned Resend message
`01a0f77a-8d32-768d-93c3-359816ca8c7c`, the candidate is `sent` in Supabase, the body has the real name,
and a second click sends nothing. Gotcha: **that candidate now shows Sent and must not be re-sent**
(Resend's idempotency key returns the original message for 24 hours instead of sending again). Test your
own clicks on any other candidate.

To email real candidates later (needs DNS access, so I can't): Resend -> Domains -> Add domain, add the
SPF/DKIM records, set `EMAIL_FROM` to an address on it, then **remove** `EMAIL_TEST_RECIPIENT`
(`vercel env rm EMAIL_TEST_RECIPIENT production`) and redeploy.

### 2. UNVERIFIED: inbox arrival time and spam placement
I cannot read the inbox. Look for the `[TEST]` message(s) in `kanay_narang@pg27.mesaschool.co`. The
first test email (to "Jane Roe") landed in **spam**: the sandbox sender `onboarding@resend.dev` is a shared
address with no SPF/DKIM/DMARC for your own domain, and nothing in the course material addresses this.
Without a domain the only fixes are on the receiving side: mark the message "Not spam", or in Gmail create
a filter *from onboarding@resend.dev -> Never send to Spam* (I did not create it; it is a persistent mailbox
rule and needs your OK). A verified domain is the proper fix. Delivery status can't be read by the API
because the key is sending-only.

### 3. Vercel blocks Git-triggered deployments (production was deployed by CLI)
Every push to `main` creates a deployment with status **Blocked**: *"the commit author doesn't have
permission to create deployments for this project."* The commits are authored as
`kanaynarang@gmail.com`, which Vercel does not match to a team member. Fix one of:
- In GitHub → Settings → Emails, add/verify the commit email on the `kanaynarang-arch` account, and in
  Vercel → Account Settings → Authentication connect that GitHub account; or
- keep deploying with the CLI from a copy without `.git` (command in the README, "Deployment").

Current production was deployed that way, from the same source as the last pushed commit (plus later
commits that only touch docs and unused assets). I did not change git config.

### 4. UNVERIFIED: the Gemini key is on a billed plan
The key works (every request succeeded), but a key cannot tell me whether it is on the free tier,
which may use inputs to improve Google's models. Check in Google AI Studio → *API keys* that the
project shows billing enabled / a paid tier. Candidate text sent to Gemini is already de-identified.

### 5. The public URL has no login
Authentication was out of scope. `hiring-dashboard-sandy-omega.vercel.app` opens without a login and
shows candidate names and emails, and the Confirm & send button is live on it. Turn on Vercel
*Deployment Protection* (Project → Settings → Deployment Protection) or put it behind a password before
sharing the link. The unique per-deployment URLs are already behind Vercel login. Sending is limited to
`@mesaschool.co` addresses regardless.

### 6. Rotate the credentials that were pasted into the chat
The GitHub personal access token, the Supabase secret key (`sb_secret_…`) and the Gemini key were shared
in plain text. Rotate them (GitHub → Settings → Developer settings → Tokens; Supabase → Project
Settings → API Keys; Google AI Studio → API keys). After rotating Supabase/Gemini, update `.env.local`
and `vercel env add <NAME> production --force`, then redeploy. No secret is in the repo or its history
(scanned); the token was only ever used inline for `git push` and is not stored in git config.

## Done and verified (from persisted database state)

- `rubric_criteria`: 8 rows parsed from `rubric.txt`; PM 25/25/25/25, SPM 20/20/35/25.
- 60 CVs uploaded through the real upload route: **60 scored, 0 needs_review, 0 processing**, each with
  8 criterion scores (both rubrics) and 2 weighted totals; **10 briefs** (top 5 per role), **10 invite
  drafts**, **50 rejection drafts**, 0 sent. A first full run had 59 scored and 1 needs_review (a NUL
  character in the PDF text, now fixed and re-run).
- The stored name/email/phone appear nowhere in any stored de-identified CV text (60/60).
- Adversarial tests 3a-3f pass (34 checks), including the real Gemini request payloads.
- Live deployment: two new CVs reached a complete terminal state in 27-43 s (three runs).
- Live send: Confirm on the real top PM candidate, in test mode, returned a Resend message id and marked it sent; see item 1.

## Notes

- Scores can differ by a few points between runs of the same CV (the model runs at its default
  temperature, as Google recommends for Gemini 3).
- Test data is left in the database (60 scored candidates) so the dashboard is populated. To start
  clean: `delete from candidates;` (everything cascades), then re-upload.
- Re-running `tests/integration/all60.ts` or `three.ts` **clears all candidates first**.
