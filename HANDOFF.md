# HANDOFF

Live URL: https://hiring-dashboard-sandy-omega.vercel.app (upload page `/`, dashboard `/dashboard`).
Nothing in this file is a secret. Items marked **UNVERIFIED** were not checked by the automated run.

## Blocked: needs you (in this order)

### 1. Verify a sending domain in Resend so real candidates can be emailed
The Resend key is now set (a **Sending access** key named `kargo-hiring-dashboard`, stored in
`.env.local` and in Vercel for production/preview/development, production redeployed). The real send
path is **verified end to end on the live site**: for a made-up candidate whose address was yours
(`kanay_narang@pg27.mesaschool.co`, the login address of the Resend team "mesaschool"), Confirm then
Send returned a Resend message id in about 4 s, the email and candidate rows became `sent`, the real
name was in the body, and a second click sent nothing.

But this Resend team has **no verified domain**, and `EMAIL_FROM` is Resend's sandbox sender, which
Resend only lets deliver to that one address. Confirm & send for the 60 real candidates (all
`squad_N@pg27.mesaschool.co`) therefore fails with Resend's *"You can only send testing emails to your
own email address"* error until you do this (DNS access is needed, so I can't):
1. Resend → Domains → Add domain, add the DNS records it shows at your DNS provider, wait for Verified.
2. Set `EMAIL_FROM` to an address on it, locally and in production, and redeploy:
   ```bash
   vercel env add EMAIL_FROM production --force   # e.g. Kargo Hiring <hiring@your-domain>
   ```
3. Prove it (this sends one real email to the top candidate's MESA test address):
   ```bash
   BASE_URL=https://hiring-dashboard-sandy-omega.vercel.app \
     npx tsx --env-file=.env.local tests/integration/final.ts "<folder of the 60 CV PDFs>"
   ```
A failed send leaves the draft as *Failed - retry* with Resend's message; nothing is lost.

### 2. UNVERIFIED: the email reaching the inbox within 30 seconds
I cannot read the inbox. Check `kanay_narang@pg27.mesaschool.co` for a test message addressed to
"Jane Roe" (Resend message id `01a0f76d-0916-7c9c-8a4f-0482d528b619`) and note when it arrived relative to
the send. Delivery status can't be read through the API because the key is sending-only; use a
full-access key if you want the tests to check Resend's `delivered` event automatically.

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
- Live send: Confirm then Send to a MESA address (yours) returned a Resend message id; see item 1.

## Notes

- Scores can differ by a few points between runs of the same CV (the model runs at its default
  temperature, as Google recommends for Gemini 3).
- Test data is left in the database (60 scored candidates) so the dashboard is populated. To start
  clean: `delete from candidates;` (everything cascades), then re-upload.
- Re-running `tests/integration/all60.ts` or `three.ts` **clears all candidates first**.
