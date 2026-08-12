# GitHub Automation Bot

An event-driven bot for GitHub that watches your repositories and automates triage: it reacts to issues, pull requests, and pushes with label and comment actions, sends Slack notifications, and uses a free-tier AI (Google Gemini) to summarize each event.

Two independent services live in this repo — there is **no root package.json**:

- `frontend/` — Next.js 16 (App Router) + React 19 + NextAuth v4. Auth-protected dashboard on `:3000`.
- `backend/` — Express 4 + PostgreSQL (Neon). Webhook receiver + event processor on `:4000`.

## How it works

1. You sign in with GitHub (OAuth `repo` scope) and connect repositories.
2. The backend registers a GitHub webhook on each connected repo and saves the token needed for GitHub write-backs.
3. GitHub posts every issue / PR / push event to `POST /webhook` (public). The backend verifies the `X-Hub-Signature-256` HMAC and stores the event idempotently (a re-delivered webhook is never processed twice).
4. A background processor claims pending events, optionally asks Gemini for a one-line AI summary, then evaluates your **rules** in order.
5. Matching rules run GitHub actions (add a label, post a comment) and optionally send a Slack notification (with the AI summary, when enabled). Every action is written to `action_logs`.
6. The dashboard shows connected repos, the event stream with action outcomes, and a per-repo rules editor.

Rules look like: *"when an **issue** **title** contains **bug**, add the **bug** label and alert Slack (with AI summary)."*

## Prerequisites

- Node.js 20+
- A PostgreSQL database (this project uses Neon — a pooled `DATABASE_URL` and a non-pooled `DIRECT_URL`)
- A GitHub OAuth App (Homepage URL + Authorization callback URL → `https://your-app.example.com/api/auth/callback/github`)
- A Slack Incoming Webhook (optional but recommended)
- A Google AI Studio API key (optional, free tier)

## Local setup

Copy the env examples and fill them in:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

`INTERNAL_API_SECRET` **must be identical** in both files (generate with `openssl rand -hex 32`).

Apply the schema by running the numbered SQL files in `backend/src/migrations/` **in order** in DBeaver (connect with the non-pooled `DIRECT_URL` connection):

1. `backend/src/migrations/001_init.sql`
2. `backend/src/migrations/002_add_processing.sql`
3. `backend/src/migrations/003_allow_processing_state.sql`

Run both services:

```bash
cd backend && npm run dev     # :4000
cd frontend && npm run dev    # :3000
```

Open http://localhost:3000 and sign in with GitHub.

For local webhook testing, expose the backend with a tunnel (e.g. `ngrok http 4000`) and point `WEBHOOK_BASE_URL` at the tunnel URL.

## Environment variables

Backend (`backend/.env`):

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Pooled Neon connection string (runtime) |
| `DIRECT_URL` | no | Non-pooled connection string (migrations/DDL) |
| `INTERNAL_API_SECRET` | yes | Shared secret; must match the frontend |
| `GITHUB_WEBHOOK_SECRET` | yes | HMAC secret for webhook signatures |
| `WEBHOOK_BASE_URL` | yes | Public base URL used to build the webhook URL |
| `PORT` | no | Listen port (default 4000) |
| `SLACK_WEBHOOK_URL` | no | Slack notifications |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | no | Free-tier AI summaries |

Frontend (`frontend/.env`):

| Variable | Required | Purpose |
| --- | --- | --- |
| `AUTH_SECRET` | yes | Auth.js session encryption |
| `NEXTAUTH_URL` | yes | Base URL of this app |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | yes | GitHub OAuth App |
| `APP_URL` | yes | Public base URL used to register webhooks |
| `BACKEND_URL` | yes | Base URL of the backend |
| `INTERNAL_API_SECRET` | yes | Must match the backend |

## Scripts

Frontend: `npm run dev` · `npm run lint` · `npm run build` (typecheck: `npx tsc --noEmit`)

Backend: `npm run dev` · `npm run build` · `npm start`

## API surface

Public:
- `GET /health` — liveness probe
- `POST /webhook` — GitHub webhook receiver (HMAC-verified)

Internal (require the `x-internal-secret` header):
- `GET|POST /internal/repositories` — list / connect repositories
- `GET|POST /internal/repositories/:repoId/rules` — list / create rules
- `PUT|DELETE /internal/repositories/:repoId/rules/:id` — update / delete rules
- `GET /internal/events?githubUserId=...` — event stream with action logs

## Testing the pipeline locally

With both services running, seed a repo and a rule, then send a signed webhook:

```bash
SECRET=$(grep -E '^GITHUB_WEBHOOK_SECRET=' backend/.env | cut -d= -f2- | tr -d '"')
PAYLOAD='{"action":"opened","issue":{"number":1,"title":"Fix login bug","body":"","labels":[]},"repository":{"id":<REPO_ID>,"owner":"<OWNER>","name":"<REPO>"}}'
SIG="sha256=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -binary | xxd -p -c 256)"
curl -X POST http://localhost:4000/webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: issues" \
  -H "X-GitHub-Delivery: test-$(date +%s)" \
  -H "X-Hub-Signature-256: $SIG" \
  -d "$PAYLOAD"
```

The event appears in the dashboard Activity view; the rule fires and the action shows up under "Actions taken".

## Deployment

- **Backend**: a plain Node service. Run `npm run build` then `npm start`. Health check: `/health`. Must expose a public URL (used for `WEBHOOK_BASE_URL` and GitHub callback).
- **Frontend**: a Next.js Node service (it has server-side API routes and middleware, so deploy as Node, not static export). Run `npm run build` then `npm start`. Set `NEXTAUTH_URL`/`APP_URL` to the public frontend URL and `BACKEND_URL` to the public backend URL.
- See `backend/render.yaml` for a Render.com blueprint (backend only — the frontend deploys on Vercel as a Node service).
