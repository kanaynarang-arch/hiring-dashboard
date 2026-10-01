# Kargo Hiring Dashboard

Internal tool for one person (the founder). He uploads a CV, picks the role the person applied for
(Product Manager or Senior Product Manager), and the system separates the personal details from
the CV, scores the rest against **both** rubrics, ranks candidates per role, writes an interview
brief for the top 5 per role, drafts an email for every candidate, and sends an email only when he
presses **Confirm & send** for that candidate.

## Stack

| Piece | What it is |
| --- | --- |
| App | Next.js (App Router) + TypeScript, deployed on Vercel |
| Database | Supabase Postgres, accessed only from the server with the service-role key |
| AI | Gemini through the Vercel AI SDK (`@ai-sdk/google`), model from `AI_MODEL` |
| Email | Resend |
| PDF text | `pdf-parse` (kept external to the server bundle, see `next.config.ts`) |

## Pages and API

| Route | Purpose |
| --- | --- |
| `/` | Upload page: choose the role, upload a PDF, watch live progress, see the result |
| `/dashboard` | Candidates ranked per role, per-criterion breakdown with reasons, brief, draft email, status, **Confirm & send** |
| `POST /api/upload` | Validates the PDF and role, creates the candidate, runs the pipeline after the response |
| `GET /api/candidates/[id]/status` | Status and progress stage (used by the upload page) |
| `POST /api/candidates/[id]/confirm` | Persists the founder's confirmation for that candidate and exact content |
| `POST /api/candidates/[id]/send` | The only path to Resend; refuses without a stored confirmation |

## The pipeline

1. **Read** the PDF text.
2. **De-identify** (`src/lib/deidentify.ts`). Deterministic code only. Name, email, phone, URLs and
   social handles are extracted and removed. See *Data boundary* below.
3. **Score** (`src/lib/ai/scoring.ts`). The de-identified text is scored against the PM rubric and
   the SPM rubric, always both, whichever role was applied for. Each criterion gets a 0-10 score and
   a one-line reason. The weighted total (0-100) is computed in code from `rubric_criteria`.
4. **Rank** (`src/lib/ranking.ts`). Within the role the person applied for, by that role's total.
5. **Brief and draft** (`src/lib/pipeline.ts` `reconcileRole`). Top 5 per role: a three-sentence
   brief and an interview invite. Everyone else scored: a warm rejection. The real name is put into
   the email by code after the AI call.
6. **Send** (`src/lib/send.ts`). Only on **Confirm & send**.

Every run ends in a terminal state: `scored` (score, and brief where applicable, and draft all
persisted) or `needs_review` (with a stored reason). Nothing is left half-done.

## Tables

| Table | Holds |
| --- | --- |
| `candidates` | opaque UUID, applied role, filename, `status`, progress `stage`, review reason |
| `candidate_pii` | name, email, phone and the raw CV text. **Never read by any code that builds an AI request** except the leak check (which only compares) and the email-name substitution |
| `candidate_redacted_cv` | the de-identified text: the only CV content any AI request contains |
| `rubric_criteria` | one row per criterion per role, parsed from `rubric.txt` |
| `candidate_scores` | per candidate, per rubric, per criterion: score and one-line reason (8 rows per scored candidate) |
| `candidate_role_scores` | the weighted total per rubric (2 rows per scored candidate) |
| `candidate_briefs` | the three-sentence brief (top 5 per role only) |
| `candidate_emails` | draft or sent email, confirmation, send status, Resend message id, error |

RLS is enabled on every table with **no policies**. Only the server, using the service-role key,
can read or write. The browser never talks to Supabase. SQL is in `supabase/migrations/`.

### Statuses

`candidates.status`: `processing` (until the draft exists), `scored`, `needs_review`, `sent`.
The terminal ones are `scored`, `needs_review` and `sent`. `candidate_emails.status`: `draft`,
`sending` (atomic claim), `sent`, `failed`.

## Data boundary (de-identification)

* Name, email, phone, URLs and social handles are removed by deterministic code. **No model detects,
  removes, verifies or classifies PII, at any point.**
* The name is accepted only when it is *established*: a name-shaped segment near the header or the
  contact block (this covers the doubled name/contact blocks that design-heavy PDFs produce) that is
  corroborated either by a URL/email slug, the upload filename or the PDF metadata (preferred), or by
  being repeated in that area. If several different names are corroborated the candidate is
  ambiguous.
* **Fail closed.** No email, more than one distinct email, no established name, an ambiguous name, an
  unreadable or text-less PDF, any error, or a failed verification ⇒ `needs_review`. The candidate is
  never sent to Gemini and never gets a score, rank, brief or draft. No threshold or fallback turns an
  uncertain result into a scored one.
* **Leak check before every Gemini call** (`src/lib/leakcheck.ts`, called from `src/lib/ai/guard.ts`).
  It takes the exact PII stored for the candidate and asserts none of it appears in the request
  (case-insensitive; name tokens, joined name forms, email incl. `[at]`/`[dot]`/spacing variants and
  local part, phone by its last 10 digits across separators), plus any residual email/URL/handle/phone
  pattern. Anything but a definite pass blocks the call.
* PII is stored in its own table keyed by a random UUID that encodes nothing about the person.

## AI boundary

* Only de-identified text, the rubric criteria and short role context ever enter an AI request. The
  role descriptions are context for brief and email tone only; **`rubric.txt` (via `rubric_criteria`)
  is the sole scoring authority** and the scoring requests do not include the job descriptions.
* All requests go through `src/lib/ai/guard.ts` to the single model in `AI_MODEL`. There is **no
  default and no fallback model**; if it is missing or the API fails, that is an error and the
  candidate goes to `needs_review`. `src/lib/ai/model.ts` additionally refuses any request made
  outside a leak-checked candidate context or to a different model.
* Outputs are validated with zod and in code: exactly one score per criterion, one-line reasons; a
  brief is exactly three single-sentence strings of at most 230 characters each; an email must carry the name placeholder, must not
  mention scores/rubric/ranking, must not contain placeholders, and every number in it must appear in
  the CV.
* Use a **billed** Gemini API key. The free tier may use inputs to improve Google's models.

## Confirm before send

* **Confirm & send** performs two server calls: `confirm` stores a confirmation bound to a hash of
  the exact recipient + subject + body; `send` then refuses unless that confirmation exists and still
  matches. Calling `send` directly, or editing the draft after confirming, is rejected and never
  reaches Resend. A disabled button is never the only enforcement.
* Sending is idempotent: an atomic compare-and-swap claims the draft (`draft|failed → sending`), the
  Resend idempotency key repeats the same message id on retry, and a second click on a sent candidate
  returns "already sent" without calling Resend.
* **Test mode.** The course material only asks for a free Resend account and for Confirm to send to "the MESA test address". A Resend account without a verified domain can only deliver to its owner's own address, so setting `EMAIL_TEST_RECIPIENT` sends every email to that address instead of the candidate (still through Confirm, the stored confirmation and Resend). Unset it, and verify a domain, to email candidates.
* **Recipients are restricted to MESA test addresses** (`@mesaschool.co` and subdomains). Anything
  else is refused in the UI, in `confirm` and in `send`.
* Sent candidates are frozen: later uploads never regenerate their email. A send made in test mode is
  recorded as a *test send* (`candidate_emails.test_send`, `sent_to`), shown as "Test-sent", and is
  reopened for a real send once test mode is turned off, so a test never uses up a candidate.

## Environment variables

All are in `.env.example`. Real values live only in `.env.local` (git-ignored) and in Vercel.

| Variable | Used for |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side database access (secret) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini (secret; billed key) |
| `AI_MODEL` | The single Gemini model id used for every AI step. Required |
| `RESEND_API_KEY` | Sending (secret) |
| `EMAIL_TEST_RECIPIENT` | Optional test mode: deliver every email to this MESA address instead of the candidate's (subject gets `[TEST]`, dashboard shows a banner). Needed while Resend has no verified domain |
| `EMAIL_FROM` | Sender. Needs a Resend-verified domain to reach anyone other than the Resend account owner; the sandbox sender only delivers to the owner |
| `BASE_URL`, `CV_DIR`, `NO_HINTS`, `TEST_RECIPIENT` | Optional, tests/scripts only |

Nothing is exposed to the browser; there are no `NEXT_PUBLIC_` variables.

## Local setup

```bash
npm install
cp .env.example .env.local        # then fill in the values
npx tsx --env-file=.env.local scripts/seed-rubric.ts   # populate rubric_criteria from data/rubric.txt
npm run build && npx next start -p 3100
```

The schema is in `supabase/migrations/` (apply `0001` then `0002`).

## Tests

```bash
# unit tests (no network): rubric parser, de-identification, leak check, model guard
npx tsx --test tests/*.test.ts

# de-identification over a folder of CVs (no AI, no DB)
npx tsx scripts/deid-check.ts /path/to/cv-folder

# integration tests (run with EMAIL_TEST_RECIPIENT unset), against a running server + real DB + real Gemini (CV_DIR or argument)
npx tsx --env-file=.env.local tests/integration/three.ts       /path/to/cv-folder
npx tsx --env-file=.env.local tests/integration/adversarial.ts /path/to/cv-folder
npx tsx --env-file=.env.local tests/integration/all60.ts       /path/to/cv-folder --concurrency=3
BASE_URL=https://<deployment> npx tsx --env-file=.env.local tests/integration/final.ts /path/to/cv-folder

# real send to Resend, using a made-up candidate addressed to YOUR Resend login address
BASE_URL=https://<deployment> TEST_RECIPIENT=you@pg27.mesaschool.co npx tsx --env-file=.env.local tests/integration/send-self.ts
```

All integration checks read the **persisted database state**, not UI messages. The CV PDFs are
test data: they are never copied into the repo or logged.

## Deployment

Production: https://hiring-dashboard-sandy-omega.vercel.app (Vercel project `kanay-mesa/hiring-dashboard`).

Set the six variables above for the Production environment (`vercel env add NAME production`).
`next.config.ts` keeps `pdf-parse`/`pdfjs-dist`/`@napi-rs/canvas` external and explicitly traces them
into `/api/upload`, because PDF.js loads its worker and canvas polyfill through dynamic requires that
file tracing cannot see. (`/dashboard` does not import them.)

The GitHub repo is connected to the Vercel project, so pushing to `main` deploys, **provided the commit
author is linked to your GitHub account** (for example the `…@users.noreply.github.com` address). Commits
authored with an unlinked email are shown as *Blocked* ("the commit author doesn't have permission").
As a fallback, deploy with the CLI from a copy of the source that has no `.git` folder (the CLI otherwise
sends the commit author with the upload and is blocked the same way):

```bash
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude '.env*' --exclude tests --exclude scripts ./ /tmp/deploy && cd /tmp/deploy && vercel deploy --prod --yes
```

See `HANDOFF.md` for the open items.

## Decisions

1. **Ranking.** Only candidates with a score (`scored`, `sent`, and the one being drafted) are ranked,
   within the role they applied for, by that role's rubric total only. `needs_review` candidates are
   never scored, ranked, briefed or drafted for, and are never promoted to fill the top 5. Ties break
   by earlier upload. A candidate already sent keeps their slot.
2. **Top 5 vs "invite the top one".** The rule is top 5 *per role*. With five or fewer scored
   candidates in a role, all of them are above the line and get a brief and an invite.
3. **Unlabelled test CVs.** Files named `NN_name.pdf` follow the same numbering as `pm_`/`spm_`:
   01-15 applied for PM, 16-30 for SPM. Only the test harness uses this.
4. **Model.** `gemini-3.8-flash` (all Flash 3.x models were probed and returned valid structured
   output; this was the newest and fastest). One identifier, in `.env.example`; none in code.
   Temperature is left at the model default (Google advises this for Gemini 3), so scores can vary a
   little between runs of the same CV.
5. **Name evidence.** The upload filename and PDF metadata are used only as corroboration, never as
   the sole source of a name. Without them (generic filename, no metadata) the body alone still
   resolves almost every sample CV; the rest fail closed.
6. **Several emails in one CV** (for example a reference's) are treated as ambiguous: the candidate's
   own address cannot be known, so the CV goes to `needs_review`.
7. **Re-ranking.** Every upload re-evaluates the role. An unsent draft whose invite/rejection type
   changes is regenerated, and a brief is removed if the candidate drops out of the top 5.
8. **Processing state.** A candidate stays `processing` until its draft exists. A run that dies is
   moved to `needs_review` by a sweep after 10 minutes.
9. **Duplicates.** Uploading the same CV twice creates two candidates; there is no de-duplication.
10. **Scanned PDFs** (no extractable text) go to `needs_review`; there is no OCR.
11. **No authentication** was added (out of scope). The deployment is therefore reachable by anyone
    with the URL; turn on Vercel Deployment Protection. The MESA-only recipient rule limits the harm.
