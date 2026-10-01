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

### 2. Inbox arrival: confirmed by you; spam placement still not guaranteed
You reported that the `[TEST]` email for the real top candidate **arrived in your inbox immediately**, so
the 30-second target is met for the test inbox (reported by you, not measured by me). The earlier
"Jane Roe" test email had landed in **spam**, so placement is not reliable: the sandbox sender
`onboarding@resend.dev` is a shared address with no SPF/DKIM/DMARC for your own domain. If it lands in spam
again, mark it "Not spam" or add a Gmail filter *from onboarding@resend.dev -> Never send to Spam* (I did
not create one; it is a persistent mailbox rule). A verified domain is the proper fix. The API cannot
report delivery status because the key is sending-only.

### 3. Push-to-deploy works only if commits use your GitHub-linked email
Vercel blocked Git-triggered deployments because commits were authored as `kanaynarang@gmail.com`, which
is not linked to your GitHub account. Commits authored with your GitHub noreply address
(`332791709+kanaynarang-arch@users.noreply.github.com`) deploy normally; I verified that (a push built and
went Ready). I passed it per command and did **not** change your git config. To make it permanent, either
add `kanaynarang@gmail.com` as a verified email on the GitHub account, or run in this repo:
`git config user.email "332791709+kanaynarang-arch@users.noreply.github.com"`. Until then, a push from a
different identity will show as Blocked. The CLI snapshot deploy in the README still works as a fallback.

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

- **Roles of the 30 unlabelled CVs are inferred, not given.** The course folder does not say which role
  they applied for. I assigned them from stated experience (<=4 years PM, >=5 SPM); 7 CVs (files 06, 09, 12,
  15, 16, 22, 25) state no figure and kept the file-number fallback. If you know the real roles, tell me and
  I will re-assign and rebuild the rankings, briefs and drafts (no re-scoring needed). Current split:
  25 PM, 35 SPM.

- Scores can differ by a few points between runs of the same CV (the model runs at its default
  temperature, as Google recommends for Gemini 3).
- Test data is left in the database (60 scored candidates) so the dashboard is populated. To start
  clean: `delete from candidates;` (everything cascades), then re-upload.
- Re-running `tests/integration/all60.ts` or `three.ts` **clears all candidates first**.
