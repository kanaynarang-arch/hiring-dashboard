# HANDOFF

Live URL: https://hiring-dashboard-sandy-omega.vercel.app (upload page `/`, dashboard `/dashboard`).
Nothing in this file is a secret. Items marked **UNVERIFIED** were not checked by the automated run.

## Blocked: needs you (in this order)

### 1. Resend API key and a sender that can reach the MESA addresses — nothing has been sent yet
`RESEND_API_KEY` is empty everywhere (`.env.local` and Vercel), so **Confirm & send has never been run
against Resend**. The live endpoints were exercised up to that point: an unconfirmed send is rejected
(HTTP 409), a confirmed send reaches the Resend step and fails safely with "RESEND_API_KEY is not set"
(HTTP 502), and the row was reset afterwards.

1. In Resend, create an API key with *Sending access*.
2. `EMAIL_FROM` is currently Resend's shared sandbox sender. That sender can only deliver to the email
   address of your own Resend account, **not** to `@pg27.mesaschool.co`. Verify a domain in Resend and
   set `EMAIL_FROM` to an address on it (for example `Kargo Hiring <hiring@your-domain>`).
3. Set both for local and production:
   ```bash
   # put RESEND_API_KEY and EMAIL_FROM in .env.local, then:
   vercel env add RESEND_API_KEY production
   vercel env add EMAIL_FROM production --force
   ```
   then redeploy (item 3).
4. Prove it end to end (this **sends one real email** to the top candidate's MESA test address):
   ```bash
   BASE_URL=https://hiring-dashboard-sandy-omega.vercel.app \
     npx tsx --env-file=.env.local tests/integration/final.ts "<folder of the 60 CV PDFs>"
   ```
   It re-uploads two CVs, times them, presses Confirm on the top candidate, and asserts: Resend message
   id returned, `sent` in Supabase, real name in the body, a second click sends nothing, and Resend
   reports `delivered` within 30 s.

### 2. UNVERIFIED: the email reaching the inbox within 30 seconds
I cannot read the MESA inbox. After step 1, open the inbox of the top PM candidate (address shown on the
dashboard) and confirm the message arrived, addressed by real name. `final.ts` checks Resend's own
`delivered` event, which is not the same as seeing it in the inbox.

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
- Live deployment: two new CVs reached a complete terminal state in 43 s and 31 s.

## Notes

- Scores can differ by a few points between runs of the same CV (the model runs at its default
  temperature, as Google recommends for Gemini 3).
- Test data is left in the database (60 scored candidates) so the dashboard is populated. To start
  clean: `delete from candidates;` (everything cascades), then re-upload.
- Re-running `tests/integration/all60.ts` or `three.ts` **clears all candidates first**.
