# AGENTS.md

Monorepo-less two-service project: a Next.js web app and an Express API. Each lives in its own directory with its own `package.json`/`node_modules` — there is **no root package.json or workspace tooling**. Run npm commands from inside the relevant subdirectory.

## Services

- `frontend/` — Next.js 16 App Router + React 19 + NextAuth v4. Auth-protected dashboard. Dev server on `:3000`.
- `backend/` — Express 4 + pg + TypeScript. `src/index.ts` is the entrypoint. Serves `/health`, `/webhook` (public — GitHub posts events here), and `/internal/*`. Dev server on `:4000`.

## Commands

Frontend (`frontend/`):
- `npm run dev` — next dev
- `npm run lint` — eslint
- `npm run build` — next build
- No `typecheck` script — use `npx tsc --noEmit`

Backend (`backend/`):
- `npm run dev` — `tsx watch src/index.ts`
- `npm run build` — `tsc` (outputs `dist/`)
- `npm start` — `node dist/index.js`
- No lint/test scripts.

There are no tests or CI anywhere in the repo. Verify changes with the relevant build/typecheck above.

## Env and secrets

Both dirs have real gitignored `.env` files plus committed `.env.example` docs. Copy from the example to set up.

- Backend requires `DATABASE_URL` (pooled Neon URL), `INTERNAL_API_SECRET`, `GITHUB_WEBHOOK_SECRET`, and `WEBHOOK_BASE_URL` (public base URL used to build the GitHub webhook URL); it throws at import time if any is missing. `DIRECT_URL` is the non-pooled URL used manually for DDL. Optional: `SLACK_WEBHOOK_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-2.0-flash`).
- Frontend requires `AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `BACKEND_URL`, and `INTERNAL_API_SECRET` (plus `NEXTAUTH_URL` and `APP_URL`).
- `INTERNAL_API_SECRET` must match between the two `.env` files. The frontend sends it as the `x-internal-secret` header on every backend call; `backend/src/middleware/internalAuth.ts` rejects anything else on `/internal/*` routes.
- `.env` values may be double-quoted; strip quotes when reading them from shell scripts.

## DB / migrations

Postgres on Neon (via `pg`). `DATABASE_URL` is the pooled connection used at runtime; `DIRECT_URL` is the non-pooled URL for admin/DDL work.

Apply schema by running the numbered `.sql` files in `backend/src/migrations/` **in order** (001 → 002 → 003) in a DB tool like DBeaver against the Neon database (use the non-pooled `DIRECT_URL` connection). `psql` is not installed on this machine. New schema changes: add a new numbered `.sql` file; never edit `001_init.sql` retroactively.

`backend/src/db/pool.ts` forces IPv4-first DNS resolution (`dns.setDefaultResultOrder("ipv4first")` + `net.setDefaultAutoSelectFamily(false)`) to avoid hangs on this machine's broken IPv6. A plain `pg` client without both will ETIMEDOUT — preserve this in any new DB-touching script.

## Frontend gotchas

- This is Next.js 16; read `frontend/AGENTS.md` — it carries an auto-generated block flagging breaking changes and pointing to `node_modules/next/dist/docs/`. Do not delete that block from diffs; `next dev` re-adds it, so committing it keeps the tree clean.
- Path alias `@/*` maps to the `frontend/` root (`frontend/tsconfig.json`).
- Auth is NextAuth v4, JWT strategy. The GitHub OAuth `repo` scope is required (webhooks + label/comment writes). The access token is stored only in the server-side JWT and deliberately NOT added to the client session (`lib/auth.ts`); server routes that need it use `getToken` from `next-auth/jwt`. The session exposes only `id`/`login` (client-visible).
- `proxy.ts` is middleware protecting `/dashboard`; route handlers live in `app/api/auth/[...nextauth]/`.
- `app/` pages fetch the backend only via `lib/backend.ts` (fire-and-forget user upsert on sign-in; `getRepositories`/`getEvents` for the dashboard; rules CRUD in the Rules view). `/api/repos` (GitHub repo list + connect), `/api/events`, `/api/rules`, and `/api/rules/[id]` are thin server-side proxies that keep the GitHub token off the client.
- The Rules view is a client component (`components/dashboard/RulesView.tsx` + `RuleFormModal.tsx`) that calls `/api/rules` per selected repo. Don't call `lib/backend.ts` directly from client components — its `internalFetch` reads `INTERNAL_API_SECRET` (server-only).

## Backend gotchas

- `src/lib/asyncHandler.ts` wraps async route handlers; the error middleware in `src/index.ts` catches everything. Follow that pattern for new routes.
- SIGINT/SIGTERM handlers in `src/index.ts` close the server then the pg pool — without them Ctrl+C hangs. Keep this wiring when adding processes.
- Existing schema (from `001_init.sql`): `users`, `repositories`, `rules`, `events`, `action_logs`.
- `express.json` in `src/index.ts` uses a `verify` hook to stash the raw body (`req.rawBody`) — the webhook router needs it for HMAC checks. Preserve it when touching body parsing.
- `/webhook` (public, no internal secret) verifies `X-Hub-Signature-256` and records events idempotently via the unique `github_delivery_id` (`ON CONFLICT DO NOTHING`) — GitHub re-delivers events, so never drop the uniqueness. The background processor (`src/lib/processor.ts`) claims pending events, optionally asks Gemini for a summary, matches rules, runs GitHub/Slack actions, writes `action_logs`, and has a 5s retry sweeper (`failed` < 5 tries after 1 min; `processing` stuck > 2 min reclaimed). A replay of an already-recorded delivery acks without reprocessing.
- `POST /internal/repositories` ensures the user row with `ON CONFLICT (github_user_id) DO NOTHING` (inserts only when the user is new — sign-in's fire-and-forget upsert may have failed) then upserts the repo row. Webhook registration failure leaves `webhook_id` null so the dashboard shows a "webhook pending" state instead of failing the whole connect.
- Rules CRUD lives in `src/routes/rules.ts` mounted at `/internal/repositories/:repoId/rules` (uses `Router({ mergeParams: true })`). Events + action logs: `GET /internal/events?githubUserId=...`.
