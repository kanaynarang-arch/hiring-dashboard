# Kargo Hiring Dashboard

Internal CV screening tool for a single founder. Upload a CV, pick the role the candidate
applied for (Product Manager or Senior Product Manager), and the pipeline handles the rest:
de-identification, rubric scoring, interview briefs for the top 5 per role, and draft emails —
sent only when you click the button.

## How it works

1. **Upload** — a PDF CV plus the applied role.
2. **De-identify** (`src/lib/deidentify.ts`) — name, email, and phone are extracted with
   deterministic regex/heuristics (no AI call) and stripped from the CV text before anything
   else touches it. If detection isn't confident, the candidate is flagged `needs_review` and
   never proceeds to scoring — this is expected to happen for CVs where the name is rendered as
   a graphic rather than text (common in some resume templates); it's not a bug.
3. **Score** (`src/lib/ai/scoring.ts`) — the de-identified CV is scored against *both* the PM and
   SPM rubrics (from `rubric_criteria`, seeded from `rubric.txt`), producing a 0-10 score and a
   one-line reason per criterion. Only the applied-role score is ever used for ranking; the other
   role's score is stored for reference only.
4. **Rank** (`src/lib/ranking.ts`) — candidates are ranked within their own applied role. The top
   5 per role are "above the line."
5. **Brief** (`src/lib/ai/brief.ts`) — a 3-sentence interview brief is generated only for
   above-the-line candidates.
6. **Draft email** (`src/lib/ai/email.ts`) — every candidate gets a drafted email (invite or warm
   rejection) written from the de-identified CV alone. The model never sees the real name — it
   writes a `{{CANDIDATE_NAME}}` placeholder, substituted with the real name after generation,
   entirely outside the AI call. The model also never sees scores or rubric data, so it cannot
   leak them into the email.
7. **Send** (`src/app/actions.ts` → `sendCandidateEmail`) — a separate, explicit action per
   candidate, never automatic. Sending is idempotent: a DB-level compare-and-swap plus a Resend
   idempotency key mean a duplicate click can never send the same candidate twice.

Ranking is recomputed on every upload, since "top 5" is a moving target. A brief/draft is
regenerated if a candidate's above/below-the-line status changes — **unless their email has
already been sent**, in which case they're never touched again.

## Privacy design

- `candidate_pii` (name, email, phone, raw CV text) is a separate table from everything an AI
  prompt is built from. No code path that calls the AI SDK reads from this table.
- `candidate_redacted_cv` holds the only CV text any AI call ever sees.
- All tables have Postgres RLS enabled with **no policies** — only the server, holding the
  `service_role` key, can read or write anything. The browser never talks to Supabase directly.
- Job descriptions (`src/lib/jd.ts`) are passed to the brief/email prompts as role context only,
  and explicitly instructed never to be used as scoring criteria. `rubric_criteria` (seeded from
  `rubric.txt`) is the sole scoring authority.

## Local development

```bash
npm install
npm run dev
```

Requires `.env.local` (see `.env.example`):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — from the `kargo-hiring-dashboard` Supabase project
- `RESEND_API_KEY`, `EMAIL_FROM` — from Resend
- `AI_SCORING_MODEL` — an AI Gateway model string (default `anthropic/claude-sonnet-5`); auth is
  automatic via `VERCEL_OIDC_TOKEN` when linked to the Vercel project

## Deploying

```bash
vercel deploy        # preview
vercel deploy --prod # production
```

Environment variables provisioned through Supabase/Resend marketplace integrations sync via
`vercel env pull .env.local`.
