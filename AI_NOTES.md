# AI_NOTES.md

Implementation notes for future AI sessions. Read this before touching the codebase.

## Architecture

Two services, no root package.json (commands must run inside each dir):

- `frontend/` — Next.js 16 App Router, React 19, NextAuth v4 (JWT strategy). Serves the dashboard and thin `/api/*` proxies that keep the GitHub OAuth token server-side.
- `backend/` — Express 4 + `pg` + TypeScript. Owns the database, the public webhook receiver, and a background event processor.

Data flows: GitHub webhook → `POST /webhook` (HMAC verify + idempotent insert) → `enqueueEvent` → processor (`src/lib/processor.ts`) claims it → optional Gemini summary → rule matching → GitHub write / Slack notify → `action_logs`. Dashboard reads via `/internal/*` routes (guarded by the shared `INTERNAL_API_SECRET`).

## Key implementation decisions

- **Auth**: OAuth `repo` scope is required for webhook creation and label/comment writes. The token lives only in the server-side JWT (`frontend/lib/auth.ts`); session exposes only `id`/`login`. Server routes use `getToken` from `next-auth/jwt`.
- **Webhook idempotency**: `events.github_delivery_id` is UNIQUE; inserts use `ON CONFLICT DO NOTHING`. GitHub re-delivers events, so this uniqueness is load-bearing. Never drop it.
- **Rule ordering**: rules are evaluated in `id` order; first match wins. Non-matching rules fall through; multiple rules can act on one event (each writes its own action_log row).
- **Failure handling**: a failed GitHub write does not fail the event. `action_logs` records per-action success/failure; `events.status` is `processed` if the pipeline ran, `failed` only when the pipeline itself errors. The sweeper (every 5s) retries `failed` events (< 5 tries, after a 1-minute backoff) and reclaims `processing` events stuck > 2 minutes.
- **AI**: free-tier Gemini via REST (no SDK). Guarded by `GEMINI_API_KEY` being set; absent key means summaries are silently skipped and `ai_summary` stays null. Per-event summaries happen once per event (cached on the row), not per rule.
- **Slack**: Incoming Webhook only; `SLACK_WEBHOOK_URL` unset logs the notify action as failed without crashing.
- **DB**: `001_init.sql` is frozen. All new schema lives in numbered migrations (`002`, `003`, ...) applied **manually in DBeaver** (connect with the non-pooled `DIRECT_URL` connection). `psql` is not installed. Never edit `001_init.sql`.

## Verification environment

- Neon Postgres; `backend/src/db/pool.ts` forces IPv4-first resolution (`dns.setDefaultResultOrder('ipv4first')` + `net.setDefaultAutoSelectFamily(false)`). On this machine, a plain `pg` client without both hangs/ETIMEDOUTs (the machine's IPv6 is broken). Preserve this in any new DB-touching script.
- The backend's `package.json` has no lint/test scripts. Verify with `npm run build` (tsc).
- The frontend has lint, build, and `npx tsc --noEmit`. There are no tests anywhere.
- A real Slack message is delivered when `SLACK_WEBHOOK_URL` is set locally (this happened during manual testing). Don't be surprised.

## Things that bit us

- `pkill -f "tsx src/index.ts"` also matches the shell command line that runs it — it killed our own shell twice. Stop the dev server by pid (check `ss -tlnp | grep :4000`) or run with a different start command.
- The backend `express.json` `verify` hook stashes `req.rawBody` — the webhook HMAC check depends on it. Don't replace body parsing.
- `APP_URL` (frontend) vs `WEBHOOK_BASE_URL` (backend): the backend builds the GitHub webhook URL from its own `WEBHOOK_BASE_URL`, not from the frontend. In dev that must be a public tunnel URL for GitHub to reach it.
- `.env` values may be double-quoted; `grep | cut | tr -d '"'` when reading them from shell.
- `Router({ mergeParams: true })` is required for `req.params.repoId` on routes mounted as `app.use("/internal/repositories/:repoId/rules", ...)`.
- The frontend `react-hooks/set-state-in-effect` lint rule is strict: don't call `setState` synchronously inside effects — do it after an `await`, or from event handlers.

## Implemented, not yet exercised

- AI path (`ai_enabled` rules + summaries) is code-complete but was never run with a real `GEMINI_API_KEY`. Expect to debug Gemini's exact response shape when first enabled.
- Real-world GitHub write-back with a live token (tests used a fake token → expected 401s in `action_logs`).
