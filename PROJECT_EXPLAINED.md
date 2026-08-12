# GitHub Autobot — The Whole Project Explained

This document explains every file in this project, **line by line**, in the simplest English possible.
You do **not** need to know how to code to follow along. If you only remember one thing, remember this:

> **GitHub Autobot is a helpful butler for your GitHub repositories. When something happens in a
> repository (a new issue, a pull request, or a push), the butler reads your list of "rules" and
> does the work for you — it adds labels, writes comments, sends Slack messages, and even asks an
> AI to summarize the event. You watch everything on a website dashboard.**

Let's meet the two "houses" that make up this project.

---

## 1. The Big Picture

```
                         (The frontend house)
                    ┌────────────────────────────┐
                    │  Next.js website (React)   │
                    │  · Login screen            │
                    │  · Dashboard               │
                    │     - Repositories list    │
                    │     - Activity feed        │
                    │     - Rules editor         │
                    └───────────┬────────────────┘
                                │ asks for data (with a secret password)
                                ▼
                    ┌────────────────────────────┐
                    │   Express backend (Node)   │  ───────►  Database (Postgres)
                    │  · The "brain"             │               (saves users,
                    │  · Receives webhooks       │                repositories,
                    │  · Processes events        │                rules, events)
                    └───────────┬────────────────┘
                                │ GitHub posts events here ("webhook")
                                ▼
                          GitHub (the outside world)
                                │ GitHub writes (add label, add comment)
                                ▼
                          Slack (notifications)
```

- **frontend/** — the website you see. Written in a framework called **Next.js** (which uses React).
- **backend/** — the engine room. Written in **Node.js** (JavaScript on a server) using a library
  called **Express**. It talks to a **Postgres** database.
- There is a **database** (Postgres on Neon) where all data is stored permanently.

There are TWO big secrets (passwords) in this project:

1. `INTERNAL_API_SECRET` — the password the **website** sends to the **backend** so the backend
   knows "this request really came from my own website."
2. `GITHUB_WEBHOOK_SECRET` — the password the **backend** shares with **GitHub** so the backend
   can be sure webhook messages really came from GitHub and not from a stranger.

---

## 2. A Quick Tour of the Folders

```
github-autobot/
├── README.md              → instructions to run the project
├── AI_NOTES.md            → notes for future developers/AI
├── AGENTS.md              → instructions for coding assistants
└── backend/               → the engine room
    ├── package.json       → list of tools the backend needs
    ├── .env.example       → example of secret settings
    ├── render.yaml        → instructions for the Render hosting service
    ├── src/
    │   ├── index.ts       → the front door of the backend
    │   ├── db/pool.ts     → how to talk to the database
    │   ├── middleware/    → "security guards" for incoming requests
    │   ├── routes/        → "phone operators" that answer different calls
    │   ├── lib/           → the helpers: GitHub, Slack, AI, processor, logger
    │   └── migrations/    → SQL files that create the database tables
└── frontend/              → the control room
    ├── package.json
    ├── proxy.ts           → guards the dashboard pages
    ├── next.config.ts     → website settings
    ├── app/               → the pages of the website + tiny "post office" routes
    ├── lib/               → helpers that talk to the backend
    ├── types/             → extra type information
    └── components/        → building blocks of the screen (buttons, lists...)
```

---

## 3. The Backend — the Engine Room

### 3.1 The database tables (the "cupboards")

Think of the database as cupboards where the butler stores notes. Each table is one cupboard.

| Table | What it stores | One row = |
| --- | --- | --- |
| `users` | People who signed in with GitHub | one person |
| `repositories` | The repos a person connected | one repo |
| `rules` | The automation rules the person wrote | one rule |
| `events` | Every webhook message that arrived | one happening (an issue was opened...) |
| `action_logs` | Proof of what the bot did | one action (added label, sent Slack...) |

### 3.2 `backend/src/migrations/001_init.sql` — creating the cupboards (line by line)

These SQL files were run once to create the tables. "SQL" is the language databases understand.

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,                    -- every user gets a number (1, 2, 3...)
  github_user_id BIGINT NOT NULL UNIQUE,    -- the person's GitHub ID, must be unique
  github_login TEXT NOT NULL,               -- their GitHub username (@name)
  name TEXT,                                -- their display name (optional)
  avatar_url TEXT,                          -- link to their profile picture
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),  -- when this row was created
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()   -- when this row was last changed
);
```

- `id SERIAL PRIMARY KEY` → give each person their own ticket number; the database counts 1, 2, 3...
- `github_user_id BIGINT NOT NULL UNIQUE` → remember GitHub's own ID for the person. `NOT NULL`
  means "this box must always be filled", `UNIQUE` means "two people can never share this number".
- `github_login` → their username, e.g. `Giri-09`.
- `name`, `avatar_url` → their real name and profile picture.
- `created_at`, `updated_at` → timestamps; `DEFAULT now()` means "fill this box with the current
  time automatically when the row is made".

```sql
CREATE TABLE repositories (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- who owns this repo
  github_repo_id BIGINT NOT NULL,           -- GitHub's own number for the repo
  owner TEXT NOT NULL,                      -- the account that owns the repo
  name TEXT NOT NULL,                       -- the repo's short name
  github_access_token TEXT NOT NULL,        -- the secret key to act on GitHub
  webhook_id BIGINT,                        -- GitHub's number for our webhook (can be empty)
  active BOOLEAN NOT NULL DEFAULT true,     -- is this repo turned on?
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, owner, name)             -- same person can't connect the same repo twice
);
```

- `user_id ... REFERENCES users(id) ON DELETE CASCADE` → points to the person who owns this repo.
  `ON DELETE CASCADE` means: if the person is deleted, delete their repos too (like tidying their
  shelves away).
- `github_repo_id` → GitHub's number for the repo.
- `github_access_token` → the secret key we keep so we can add labels/comments later. (This is the
  most precious thing in the cupboard — never let it out.)
- `webhook_id` → after we tell GitHub to post events here, GitHub gives us a receipt number. It is
  empty (`NULL`) if we haven't registered the webhook yet.

```sql
CREATE TABLE rules (
  id SERIAL PRIMARY KEY,
  repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE, -- which repo
  event_type TEXT NOT NULL,                 -- "issues", "pull_request" or "push"
  match_field TEXT NOT NULL CHECK (match_field IN ('title', 'body')), -- look at title or body?
  match_value TEXT NOT NULL,                -- the keyword, e.g. "bug"
  action_type TEXT NOT NULL CHECK (action_type IN ('add_label', 'comment')), -- what to do
  action_value TEXT NOT NULL,               -- the label name or the comment text
  notify_slack BOOLEAN NOT NULL DEFAULT true,  -- also tell Slack?
  enabled BOOLEAN NOT NULL DEFAULT true,    -- is this rule switched on?
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- `CHECK (...)` → a rule that the database itself enforces. For `event_type` we say "only allow
  issues, pull_request, or push". That stops silly mistakes.
- `notify_slack` and `enabled` → both "switches" (`true`/`false`).

```sql
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  github_delivery_id TEXT NOT NULL UNIQUE,  -- GitHub's message number; never repeat it
  event_type TEXT NOT NULL,
  action TEXT,                              -- e.g. "opened", "closed" (optional)
  payload JSONB NOT NULL,                   -- the full message GitHub sent, saved as-is
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
```

- `github_delivery_id` → every webhook message from GitHub carries its own unique number. We store
  it and say "never insert the same number twice" (`UNIQUE`). This is how we ignore repeated
  messages (GitHub re-sends messages sometimes).
- `payload JSONB` → the raw message itself, saved for later (JSON is a text format machines use).
- `status` → is the event `pending` (waiting), `processed` (done), or `failed` (went wrong)?

```sql
CREATE TABLE action_logs (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rule_id INTEGER REFERENCES rules(id) ON DELETE SET NULL,  -- which rule did this
  type TEXT NOT NULL CHECK (type IN ('github_write', 'slack_notify')),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  detail TEXT,                             -- extra note (e.g. the error message)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- `rule_id ... ON DELETE SET NULL` → if a rule is deleted, we keep the action log but empty the
  "which rule" box (don't delete history).
- `type` → was it a GitHub write (label/comment) or a Slack notification?

```sql
CREATE INDEX idx_repositories_user_id ON repositories(user_id);
CREATE INDEX idx_rules_repository_id ON rules(repository_id);
CREATE INDEX idx_events_repository_id ON events(repository_id);
CREATE INDEX idx_action_logs_event_id ON action_logs(event_id);
```

- `CREATE INDEX` → like the index at the back of a book: it makes finding things fast. We index the
  columns we search on a lot.

### 3.3 `backend/src/migrations/002_add_processing.sql`

This migration was added later, when the background processor was built:

```sql
ALTER TABLE events
  ADD COLUMN try_count INTEGER NOT NULL DEFAULT 0,   -- how many times we tried
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN ai_summary TEXT;                        -- the AI's one-line summary

ALTER TABLE rules
  ADD COLUMN ai_enabled BOOLEAN NOT NULL DEFAULT false;  -- rule asks for AI summary?
```

- `ALTER TABLE ... ADD COLUMN` → "open the cupboard and add a new box".
- `try_count` → counts attempts so we don't retry forever (we stop after 5).
- `ai_summary` → the summary the AI wrote about this issue/PR, shown on the dashboard.
- `ai_enabled` → per-rule switch: "include the AI summary in the Slack message?"

### 3.4 `backend/src/migrations/003_allow_processing_state.sql`

```sql
ALTER TABLE events DROP CONSTRAINT events_status_check;
ALTER TABLE events
  ADD CONSTRAINT events_status_check
  CHECK (status IN ('pending', 'processing', 'processed', 'failed'));
```

- In file 001, `status` was only allowed three values. We now added a fourth: `processing`
  ("the bot is currently working on this right now"). So we remove the old rule
  (`DROP CONSTRAINT`) and add a new one that allows all four values.

### 3.5 `backend/src/db/pool.ts` — talking to the database

```ts
import "dotenv/config";          // load the secret settings from the .env file
import dns from "node:dns";
import net from "node:net";
import { Pool } from "pg";

dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily(false);
```

- `import "dotenv/config"` → read the `.env` file (the secret settings) into the program.
- `dns`/`net` → low-level internet tools. The next two lines force the computer to use the IPv4
  internet addresses instead of trying IPv6 too. (On this machine, IPv6 is broken, so without this
  the program would hang forever waiting to connect.)

```ts
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");   // if the setting is missing, refuse to start
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,   // the address of our database
});
```

- `throw new Error(...)` → stop the whole program with a clear message if the setting is missing.
  It's better to fail loudly than to run with no database.
- `new Pool(...)` → create a small fleet of database connections that can be shared. `pool` is the
  tool every other file uses to ask the database questions.

### 3.6 `backend/src/lib/logger.ts` — writing a diary

```ts
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
});
```

- `pino` is a logging library. It writes neat, machine-friendly diary entries ("logs") so we can
  see what the server did.
- `level` → how chatty the diary should be. Default `info`. If you want more detail, set
  `LOG_LEVEL=debug`.

### 3.7 `backend/src/lib/asyncHandler.ts` — catching dropped plates

```ts
import type { Request, Response, NextFunction, RequestHandler } from "express";

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
```

- Express (the server library) does not wait for async work to finish. If an async function fails
  on its own, Express would just crash the whole server.
- `asyncHandler` wraps every route so that if the work fails, the error is passed to `next`, which
  sends it to our "catch-all" error handler (in `index.ts`) instead of crashing.

### 3.8 `backend/src/middleware/internalAuth.ts` — the bouncer

```ts
if (!process.env.INTERNAL_API_SECRET) {
  throw new Error("INTERNAL_API_SECRET is not set");   // refuse to start without the password
}

export function internalAuth(req: Request, res: Response, next: NextFunction) {
  const secret = req.header("x-internal-secret");   // read the password from the request's hat
  if (secret !== process.env.INTERNAL_API_SECRET) { // does it match ours?
    res.status(401).json({ error: "unauthorized" }); // no → "get lost", 401 = not allowed
    return;
  }
  next();                                           // yes → let them through
}
```

- This guards all `/internal/...` routes. Only requests that carry the correct
  `x-internal-secret` password are let through.
- `401` is the standard "not authorized" answer.

### 3.9 `backend/src/lib/github.ts` — talking to GitHub

```ts
const API = "https://api.github.com";

export class GithubApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
```

- `API` → the base address of GitHub's API (the way programs talk to GitHub).
- `GithubApiError` → a special error that also carries the HTTP status number, so we know whether
  it was a "not found" (404), "bad credentials" (401), etc.

```ts
async function githubFetch(path, accessToken, init?) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
  ...
}
```

- `githubFetch` is a helper for all GitHub calls. It:
  - builds the full URL from `API` + `path`;
  - adds the `Authorization: Bearer <token>` header — this is the access token, our "key" to act
    on GitHub;
  - adds the GitHub API version header (GitHub requires it);
  - if GitHub answers with an error, turns the whole response text into a `GithubApiError`.

```ts
export async function createWebhook(opts) {
  const res = await githubFetch(`/repos/${owner}/${name}/hooks`, ..., {
    method: "POST",
    body: JSON.stringify({
      name: "web",
      active: true,
      events: ["issues", "pull_request", "push"],
      config: {
        url: opts.webhookUrl,
        content_type: "json",
        secret: opts.webhookSecret,
        insecure_ssl: "0",
      },
    }),
  });
  const hook = (await res.json()) as { id: number };
  return hook.id;
}
```

- `createWebhook` asks GitHub: "please send me issues, pull requests and pushes from this repo to
  this URL, signed with this secret."
- GitHub answers with a receipt (`hook.id`), which we save as `webhook_id`.

```ts
export function addLabel(opts) { ... }    // POST to /issues/N/labels  → add a label
export function addComment(opts) { ... }  // POST to /issues/N/comments → write a comment
```

- Fun fact: on GitHub, issues **and** pull requests both live under the same "issues" address, so
  one function works for both.
- `.then(() => undefined)` → we don't need the answer, we just need it done.

### 3.10 `backend/src/lib/slack.ts` — talking to Slack

```ts
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
export function isSlackConfigured(): boolean {
  return Boolean(SLACK_WEBHOOK_URL);
}
```

- `isSlackConfigured` → "do we have a Slack address configured?" (`Boolean(...)` turns a value into
  true/false).

```ts
export async function sendSlack(opts) {
  ...
  const repoLink = `https://github.com/${owner}/${name}`;
  const titleLine = opts.url ? `<${opts.url}|${opts.title}>` : opts.title;
  ...
  const blocks = [
    { type: "section", text: { type: "mrkdwn",
      text: `*${eventLabel}* in <${repoLink}|${owner}/${name}>\n${titleLine}` } },
  ];
  if (opts.aiSummary) blocks.push({ ... AI summary block ... });
  if (opts.actionDescription) blocks.push({ ... "what the bot did" block ... });

  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  });
  if (!res.ok) throw new Error(...);
}
```

- Slack's Incoming Webhook expects a special message format made of `blocks`. This code builds a
  pretty Slack message:
  1. A header line: "Issue opened in owner/repo" with a clickable title.
  2. An optional "AI summary" block.
  3. An optional "what the bot did" block (with a little robot emoji).
- `sendSlack` posts that message to Slack and throws if Slack didn't accept it.

### 3.11 `backend/src/lib/ai.ts` — asking the AI (Gemini)

```ts
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
export function isAiConfigured(): boolean { return Boolean(GEMINI_API_KEY); }
```

- We use Google's **Gemini** — a free AI. We only use it if an API key is configured.

```ts
const PROMPT = (kind, title, body) =>
  `You are a GitHub triage assistant. Read this ${kind} and produce:
1. SUMMARY: a concise 2-3 sentence summary...
2. LABEL: one suggested label ... bug, enhancement, question, documentation, urgent.
Format your reply exactly like this, nothing else:
SUMMARY: <summary>
LABEL: <label>
${kind} title: ${title}
${kind} body: ${body?.slice(0, 8000) ?? "(empty)"}`;
```

- `PROMPT` is the instruction we send to the AI. We tell it exactly how to reply so we can read the
  answer with a simple pattern.

```ts
function parse(text: string): AiResult {
  const summaryMatch = text.match(/SUMMARY:\s*([\s\S]*?)(?:\nLABEL:|$)/i);
  const labelMatch = text.match(/LABEL:\s*([^\n]+)/i);
  ...
}
```

- The `/SUMMARY: .../` and `/LABEL: .../` are search patterns (regex). We pull the summary and the
  label out of the AI's reply.

```ts
export async function summarizeIssue(opts) {
  ...
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000),   // give up if the AI is slow (>20 seconds)
    body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT(...) }] }] }),
  });
  ...
}
```

- `AbortSignal.timeout(20_000)` → a safety timer: if the AI doesn't answer within 20 seconds, stop
  waiting. That's how a webhook stays fast.
- Then we dig the answer out of Gemini's reply (`data.candidates[0].content.parts[0].text`) and
  return the summary + suggested label.

### 3.12 `backend/src/routes/webhook.ts` — the public letterbox

This is the address GitHub posts messages to: `POST /webhook`.

```ts
const WEBHOOK_SECRET: string = (() => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) throw new Error("GITHUB_WEBHOOK_SECRET is not set");
  return secret;
})();
```

- Read the webhook secret at startup; refuse to start without it.

```ts
function verifySignature(req): boolean {
  const signature = req.header("x-hub-signature-256");
  if (!signature || !req.rawBody) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", WEBHOOK_SECRET).update(req.rawBody).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

- GitHub signs every message with our secret and sends the signature in the
  `X-Hub-Signature-256` header. We compute the signature ourselves from the raw message + secret,
  and compare. `timingSafeEqual` compares the two in a way that doesn't leak timing information
  (a security detail). If they don't match → this message is not really from GitHub.

```ts
webhookRouter.post("/", asyncHandler(async (req, res) => {
  if (!verifySignature(...)) { res.status(401)...; return; }
  const deliveryId = req.header("x-github-delivery");
  const eventType = req.header("x-github-event");
  const payload = req.body;
  if (!deliveryId || !eventType) { res.status(400)...; return; }
  const githubRepoId = payload.repository?.id;
  if (!githubRepoId) { res.status(200).json({ ok: true }); return; }   // not our business
  const repoResult = await pool.query(
    "SELECT id FROM repositories WHERE github_repo_id = $1", [githubRepoId]);
  if (repoResult.rowCount === 0) { ...ignore, it's not a repo we know... }
  ...
```

- Walk through:
  - bad signature → 401.
  - missing delivery headers → 400 (GitHub made a mistake).
  - no repository id, or the repo is not one of ours → answer `ok` but do nothing. (We always
    answer 200 so GitHub doesn't keep retrying — this is why strangers can't make us do work.)

```ts
  const insertResult = await pool.query(
    `INSERT INTO events (repository_id, github_delivery_id, event_type, action, payload, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     ON CONFLICT (github_delivery_id) DO NOTHING
     RETURNING id`, [...]);
  if (insertResult.rowCount && insertResult.rowCount > 0) {
    enqueueEvent(insertResult.rows[0].id);   // tell the processor "go do this event"
  }
  res.status(200).json({ ok: true });
}));
```

- We save the event in the database. `ON CONFLICT (github_delivery_id) DO NOTHING` means: "if we
  have already seen this message number, ignore this one." GitHub sometimes re-sends messages, and
  this stops duplicates.
- If this is a genuinely new event (`rowCount > 0`), we ask the processor to start working on it
  (`enqueueEvent`), but we don't wait — we answer GitHub immediately (`ok: true`).

### 3.13 `backend/src/lib/processor.ts` — the heart of the bot

This file contains the whole "thinking" of the bot.

```ts
type EventPayload = { action?, issue?, pull_request? };
type TextContext = { kind, title, body, number, url };
type RuleRow = { id, match_field, match_value, action_type, action_value, notify_slack, ai_enabled };
```

- These are just shapes/descriptions ("types") of the data we work with. `TextContext` holds the
  text of an issue/PR so rules can search it.

```ts
function textFromPayload(eventType, payload): TextContext | null {
  const item = eventType === "issues" ? payload.issue
             : eventType === "pull_request" ? payload.pull_request
             : null;
  if (!item) return null;
  return { kind, title: item.title ?? "(untitled)", body: item.body ?? null,
           number: item.number, url: item.html_url ?? "" };
}
```

- Pulls the title/body/number/url out of the webhook message. Push events (which have no issue)
  return `null` — there's nothing to match text against.

```ts
function ruleMatches(rule, text): boolean {
  const field = rule.match_field === "title" ? text.title : (text.body ?? "");
  return field.toLowerCase().includes(rule.match_value.toLowerCase());
}
```

- Does the rule match? If the rule says "look at the title for 'bug'", we check whether the title
  (in lowercase) contains "bug" (in lowercase). Lowercasing means "Bug" and "bug" both match.

```ts
async function logAction(eventId, ruleId, type, status, detail) {
  await pool.query(
    `INSERT INTO action_logs (event_id, rule_id, type, status, detail) VALUES ($1, $2, $3, $4, $5)`,
    [eventId, ruleId, type, status, detail]);
}
```

- Writes one line into the `action_logs` cupboard — proof of what the bot did.

```ts
async function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
```

- Wait for `ms` milliseconds. Used to pause between retries.

```ts
async function claimEvent(eventId) {
  const res = await pool.query(
    `UPDATE events SET status = 'processing', try_count = try_count + 1, updated_at = now()
     WHERE id = $1 AND status IN ('pending', 'failed')
     RETURNING payload`, [eventId]);
  return res.rows[0] ?? null;
}
```

- `claimEvent` is a clever trick. It changes the event's status to `processing` (so nobody else
  grabs it) AND only does so if it was `pending` or `failed`. This is how we stop two processes
  from handling the same event twice at once. If the row is already `processing`, it returns
  nothing (`null`).

```ts
async function finishEvent(eventId, status) {
  await pool.query(
    `UPDATE events SET status = $1, updated_at = now(),
            processed_at = CASE WHEN $1 = 'processed' THEN now() ELSE processed_at END
     WHERE id = $2`, [status, eventId]);
}
```

- Marks the event done. The `CASE ... WHEN` means: only set `processed_at` when it finished
  successfully; for a failure we leave the old `processed_at` alone.

```ts
async function generateAiSummary(eventId, eventType, text) {
  if (!isAiConfigured()) return null;        // no AI key → no summary, that's fine
  try {
    const result = await summarizeIssue({ kind, title, body });
    await pool.query("UPDATE events SET ai_summary = $1 WHERE id = $2", [result.summary, eventId]);
    return result.summary;
  } catch (err) { logger.error(...); return null; }   // AI failed → just skip it
}
```

- Asks Gemini once per event, saves the summary on the event row, and returns it. If anything goes
  wrong, we shrug and return `null` — AI is optional, never allowed to break the pipeline.

```ts
async function notifySlack(eventId, rule, repo, eventType, action, text, aiSummary, actionDescription) {
  if (!rule.notify_slack) return;            // rule says no Slack → skip
  if (!isSlackConfigured()) { logAction(..., "failed", "SLACK_WEBHOOK_URL is not configured"); return; }
  let lastError = null;
  for (const attempt of [1, 2, 3]) {          // try up to 3 times
    try {
      await sendSlack({ ... aiSummary: rule.ai_enabled ? aiSummary : null ... });
      await logAction(eventId, rule.id, "slack_notify", "success", null);
      return;
    } catch (err) { lastError = err; if (attempt < 3) await sleep(attempt * 1000); }
  }
  logger.error(...);
  await logAction(eventId, rule.id, "slack_notify", "failed", "Slack send failed after 3 attempts");
}
```

- Sends the Slack message with up to 3 attempts (waiting 1s, then 2s between tries — backoff).
  Every outcome is written to `action_logs` so the dashboard can show success/failure.
- The AI summary is only included if the rule has `ai_enabled` on.

```ts
async function processEvent(eventId) {
  const claimed = await claimEvent(eventId);
  if (!claimed) return;                       // someone else is already doing it

  try {
    const event = (await pool.query("SELECT ... FROM events WHERE id = $1", [eventId])).rows[0];
    const repo = (await pool.query("SELECT owner, name, github_access_token FROM repositories WHERE id = $1", [event.repository_id])).rows[0];
    if (!repo) { await finishEvent(eventId, "failed"); return; }

    const text = textFromPayload(event.event_type, event.payload);
    const aiSummary = text && (await generateAiSummary(eventId, event.event_type, text));

    const rulesRes = await pool.query(
      "SELECT ... FROM rules WHERE repository_id = $1 AND event_type = $2 AND enabled = true",
      [event.repository_id, event.event_type]);
    const matchingRules = rulesRes.rows.filter((rule) => text && ruleMatches(rule, text));
```

- Load the event, load its repo, get the AI summary, then fetch all the **enabled** rules for that
  repo **and** that event type, and keep only the ones whose keyword actually appears in the text.

```ts
    for (const rule of matchingRules) {
      let actionDetail = null; let actionStatus = "failed";
      try {
        if (rule.action_type === "add_label") {
          await addLabel({ ...labels: [rule.action_value] });
          actionDetail = `Added label "${rule.action_value}"`; actionStatus = "success";
        } else if (rule.action_type === "comment") {
          await addComment({ ...body: rule.action_value });
          actionDetail = "Posted a comment"; actionStatus = "success";
        }
      } catch (err) { actionDetail = `GitHub write failed: ...`; logger.error(...); }
      await logAction(eventId, rule.id, "github_write", actionStatus, actionDetail);
      await notifySlack(eventId, rule, repo, event.event_type, event.action, text, aiSummary, actionDetail);
    }
```

- For every matching rule, do the GitHub action (add label / post comment). If it fails (e.g.
  expired token), we record `failed` with the reason — we never stop the event, we just note it.
  Then we send the Slack notification if the rule wants one.

```ts
    await finishEvent(eventId, "processed");
  } catch (err) {
    logger.error({ eventId, err }, "event processing failed");
    await finishEvent(eventId, "failed");
  }
}
```

- If everything (or even some things) ran, the event is `processed`. If the whole pipeline blew up,
  it's `failed` and the sweeper will retry later.

```ts
const SWEEP_INTERVAL_MS = 5_000;
let stopped = false;

async function sweepOnce() {
  const res = await pool.query(
    `SELECT id FROM events
     WHERE status = 'pending'
        OR (status = 'failed' AND try_count < 5 AND updated_at < now() - interval '1 minute')
        OR (status = 'processing' AND updated_at < now() - interval '2 minutes')
     ORDER BY id ASC LIMIT 20`);
  for (const row of res.rows) await processEvent(row.id);
}
```

- The sweeper is the safety net. Every 5 seconds it looks for:
  - events still `pending` (nobody picked them up yet);
  - events that `failed` but were tried fewer than 5 times, and at least a minute has passed;
  - events stuck in `processing` for more than 2 minutes (the process probably died mid-way).
- It then re-runs them. This is why nothing ever gets lost — even if a webhook handler crashes
  halfway, the sweeper finds and finishes the job.

```ts
export function startEventProcessor(): void {
  const loop = async () => {
    while (!stopped) {
      try { await sweepOnce(); } catch (err) { logger.error(...); }
      await sleep(SWEEP_INTERVAL_MS);
    }
  };
  void loop();     // run in the background, don't block anything
}

export function stopEventProcessor(): void { stopped = true; }

export function enqueueEvent(eventId: number): void {
  void processEvent(eventId).catch((err) => logger.error(...));
}
```

- `startEventProcessor` starts the background loop. `stopEventProcessor` tells it to stop
  (used on shutdown). `enqueueEvent` is what the webhook calls to process an event right away,
  fire-and-forget.

### 3.14 `backend/src/routes/users.ts` — sign-in helper

```ts
usersRouter.post("/", asyncHandler(async (req, res) => {
  const { githubUserId, githubLogin, name, avatarUrl } = req.body ?? {};
  if (!githubUserId || !githubLogin) { res.status(400).json({ error: "..." }); return; }
  const result = await pool.query(
    `INSERT INTO users (github_user_id, github_login, name, avatar_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (github_user_id)
     DO UPDATE SET github_login = $2, name = $3, avatar_url = $4, updated_at = now()
     RETURNING id, github_user_id, github_login, name, avatar_url`,
    [githubUserId, githubLogin, name ?? null, avatarUrl ?? null]);
  res.json(result.rows[0]);
}));
```

- When someone signs in on the website, the frontend sends the person's GitHub profile here.
- `ON CONFLICT (github_user_id) DO UPDATE` → "if this person already exists, just refresh their
  name/picture; if not, create them." That's called an *upsert*.

### 3.15 `backend/src/routes/repositories.ts` — connecting a repo

```ts
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL;
if (!WEBHOOK_BASE_URL) throw new Error("WEBHOOK_BASE_URL is not set");
const WEBHOOK_URL = `${WEBHOOK_BASE_URL}/webhook`;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? "";
```

- The public address of this backend + the webhook secret are read once at startup. The webhook URL
  becomes `<public-url>/webhook`.

```ts
repositoriesRouter.post("/", asyncHandler(async (req, res) => {
  const { githubUserId, githubLogin, name, avatarUrl, githubRepoId, owner, repoName, accessToken } = req.body ?? {};
  if (!githubUserId || !githubLogin || !githubRepoId || !owner || !repoName || !accessToken) {
    res.status(400).json({ error: "missing required fields" }); return;
  }
  const userResult = await pool.query(
    `WITH ensure_user AS (
       INSERT INTO users (...) VALUES ($1, $2, $3, $4)
       ON CONFLICT (github_user_id) DO NOTHING
       RETURNING id
     )
     SELECT id FROM ensure_user
     UNION ALL
     SELECT id FROM users WHERE github_user_id = $1
     LIMIT 1`,
    [...]);
  const userId = userResult.rows[0].id;
```

- Validate that all required pieces arrived.
- Then make sure the user exists. The `WITH ensure_user` trick tries to insert the user, but only
  if the user is brand new (`ON CONFLICT DO NOTHING` — no updating on a re-connect). If the insert
  didn't happen because the user already existed, the second `SELECT` finds them. `LIMIT 1` makes
  sure we only get one row. This is a clever one-liner for "create if missing, else fetch".

```ts
  const repoResult = await pool.query(
    `INSERT INTO repositories (user_id, github_repo_id, owner, name, github_access_token)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, owner, name)
     DO UPDATE SET github_repo_id = EXCLUDED.github_repo_id,
                   github_access_token = EXCLUDED.github_access_token
     RETURNING id, github_repo_id, owner, name, webhook_id, active, created_at`,
    [userId, githubRepoId, owner, repoName, accessToken]);
  const repo = repoResult.rows[0];
```

- Save (or refresh) the repo row. Reconnecting the same repo just updates the stored token.
- `EXCLUDED` in Postgres means "the new values we tried to insert" — used to copy the fresh token in.

```ts
  if (repo.webhook_id === null) {          // only register the webhook once
    try {
      const webhookId = await createWebhook({ owner, name: repoName, accessToken, webhookUrl: WEBHOOK_URL, webhookSecret: WEBHOOK_SECRET });
      await pool.query("UPDATE repositories SET webhook_id = $1 WHERE id = $2", [webhookId, repo.id]);
      repo.webhook_id = webhookId;
    } catch (err) { logger.error({ owner, repoName, err }, "webhook registration failed"); }
  }
  res.json(repo);
}));
```

- Only if this repo has never had a webhook do we ask GitHub to register one. If the registration
  fails (say, the token expired), we leave `webhook_id` empty and the dashboard shows
  "Webhook pending". Reconnecting later retries it.

```ts
repositoriesRouter.get("/", asyncHandler(async (req, res) => {
  const githubUserId = Number(req.query.githubUserId);
  if (!githubUserId) { res.status(400).json({ error: "githubUserId is required" }); return; }
  const result = await pool.query(
    `SELECT r.id, r.github_repo_id, r.owner, r.name, r.webhook_id, r.active, r.created_at,
            (SELECT count(*) FROM events e WHERE e.repository_id = r.id) AS event_count
     FROM repositories r
     JOIN users u ON u.id = r.user_id
     WHERE u.github_user_id = $1
     ORDER BY r.created_at DESC`,
    [githubUserId]);
  res.json(result.rows);
}));
```

- Lists a person's connected repos, each with a count of how many events it has had
  (`event_count`). The `JOIN users` finds the user by their GitHub id so we know whose repos to
  return.

### 3.16 `backend/src/routes/events.ts` — the activity feed

```ts
eventsRouter.get("/", asyncHandler(async (req, res) => {
  const githubUserId = Number(req.query.githubUserId);
  if (!githubUserId) { res.status(400)...; return; }
  const result = await pool.query(
    `SELECT e.id, e.repository_id, e.github_delivery_id, e.event_type,
            e.action, e.status, e.received_at, e.processed_at, e.ai_summary,
            r.owner, r.name AS repo_name,
            COALESCE(json_agg(al ORDER BY al.created_at DESC)
              FILTER (WHERE al.id IS NOT NULL), '[]') AS action_logs
     FROM events e
     JOIN repositories r ON r.id = e.repository_id
     JOIN users u ON u.id = r.user_id
     LEFT JOIN action_logs al ON al.event_id = e.id
     WHERE u.github_user_id = $1
     GROUP BY e.id, r.owner, r.name
     ORDER BY e.received_at DESC
     LIMIT 100`,
    [githubUserId]);
  res.json(result.rows);
}));
```

- Returns the 100 latest events for a person, newest first.
- `LEFT JOIN action_logs` → attach each event's action logs.
- `json_agg(...) FILTER (WHERE al.id IS NOT NULL)` → squash all the action logs of one event into
  one list (a JSON array). `COALESCE(..., '[]')` → if there are none, give an empty list instead
  of nothing.

### 3.17 `backend/src/routes/rules.ts` — rules CRUD (create/read/update/delete)

```ts
export const rulesRouter = Router({ mergeParams: true });
```

- `mergeParams: true` → this router is mounted at `/internal/repositories/:repoId/rules`, and this
  setting lets the handlers below see the `:repoId` from the mount path. Without it, the repo id
  would be invisible — an easy trap.

```ts
const EVENT_TYPES = ["issues", "pull_request", "push"];
const MATCH_FIELDS = ["title", "body"];
const ACTION_TYPES = ["add_label", "comment"];

function parseRuleInput(body) {
  const { eventType, matchField, matchValue, actionType, actionValue, notifySlack = true, aiEnabled = false, enabled = true } = body;
  if (typeof eventType !== "string" || !EVENT_TYPES.includes(eventType) || ...) return null;
  return { eventType, matchField, matchValue: matchValue.trim(), actionType, actionValue: actionValue.trim(), notifySlack: Boolean(notifySlack), aiEnabled: Boolean(aiEnabled), enabled: Boolean(enabled) };
}
```

- The whitelists (`EVENT_TYPES`, etc.) are the only allowed values — anything else is rejected.
- `parseRuleInput` checks every field carefully and returns `null` if anything is wrong. Defaults:
  Slack on, AI off, rule enabled.
- `matchValue.trim()` → remove extra spaces around the keyword.

The four handlers:

```ts
rulesRouter.get("/", ...)      → "SELECT * FROM rules WHERE repository_id = $1 ORDER BY id"
rulesRouter.post("/", ...)     → validate + INSERT INTO rules ... RETURNING *
rulesRouter.put("/:id", ...)   → validate + UPDATE rules SET ... WHERE id = $9 AND repository_id = $10
                                 (if no row was updated → 404 "rule not found")
rulesRouter.delete("/:id", ...) → DELETE FROM rules WHERE id = $1 AND repository_id = $2
                                 (if nothing was deleted → 404)
```

- Note that update and delete require **both** the rule id **and** the repository id, so you can't
  touch a rule that belongs to another repo.

### 3.18 `backend/src/index.ts` — the front door (line by line)

```ts
import "dotenv/config";
import express from "express";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";
import { pool } from "./db/pool";
import { internalAuth } from "./middleware/internalAuth";
import { usersRouter } from "./routes/users";
import { repositoriesRouter } from "./routes/repositories";
import { eventsRouter } from "./routes/events";
import { rulesRouter } from "./routes/rules";
import { webhookRouter } from "./routes/webhook";
import { startEventProcessor, stopEventProcessor } from "./lib/processor";
```

- Load the secret settings, then gather all the parts: the server library, the logger, the
  database pool, the security guard, the four "phone operator" routers, and the processor.

```ts
const app = express();
app.use(pinoHttp({ logger }));   // logs every request/response: method, path, status, duration
```

- Create the app. `pinoHttp` logs every incoming request (method, URL, status code, speed) — that
  is the diary entry for each visitor.

```ts
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as Request & { rawBody?: Buffer }).rawBody = buf;
  },
}));
```

- Normally Express parses the incoming JSON body. The `verify` hook runs while it does, and we save
  the **raw, un-touched bytes** into `req.rawBody`. The webhook route needs these exact bytes to
  recompute the GitHub signature (if the body were re-encoded, the signature would never match).

```ts
app.get("/health", (_req, res) => { res.json({ ok: true }); });
```

- A tiny "are you alive?" check. Hosting services (like Render) ping this to know the server is
  healthy.

```ts
app.use("/webhook", webhookRouter);                        // public — GitHub posts here
app.use("/internal/users", internalAuth, usersRouter);     // guarded by the secret
app.use("/internal/repositories", internalAuth, repositoriesRouter);
app.use("/internal/repositories/:repoId/rules", internalAuth, rulesRouter);
app.use("/internal/events", internalAuth, eventsRouter);
```

- Route mounting. `/webhook` is open to the world (GitHub). Everything under `/internal` passes
  through `internalAuth` (the bouncer) first.

```ts
app.use((err, req, res, _next) => {
  req.log.error({ err }, "request failed");
  res.status(500).json({ error: "internal error" });
});
```

- The catch-all error handler. If any handler throws, we log it and reply 500 instead of crashing
  the whole server. This is where `asyncHandler` sends its caught errors.

```ts
const port = process.env.PORT ? Number(process.env.PORT) : 4000;
const server = app.listen(port, () => { logger.info(`backend listening on :${port}`); });
```

- Start listening on the port from settings (default 4000).

```ts
startEventProcessor();
```

- Turn on the background sweeper that retries events.

```ts
function shutdown() {
  logger.info("shutting down");
  stopEventProcessor();
  server.close(() => { pool.end().then(() => process.exit(0)); });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

- When the server is told to stop (Ctrl+C = SIGINT, or hosting sends SIGTERM), shut down cleanly:
  stop the sweeper, close the server, close the database pool, then exit. Without this, the open
  database connections keep the program alive forever and Ctrl+C hangs.

### 3.19 `backend/.env.example` and `backend/render.yaml`

`.env.example` is just the list of settings the backend can use (with empty values), so you know
what to put in your real `.env`:

```bash
DATABASE_URL="..."            # address of the database (the pooled one)
DIRECT_URL="..."              # same database but direct, for admin work in DBeaver
PORT=4000
INTERNAL_API_SECRET=""        # the secret the frontend must send (MUST match frontend!)
WEBHOOK_BASE_URL="https://your-app.example.com"  # public URL of THIS backend
GITHUB_WEBHOOK_SECRET=""      # secret shared with GitHub for signing webhooks
SLACK_WEBHOOK_URL=""          # Slack incoming webhook (optional)
GEMINI_API_KEY=""             # Google AI Studio key (optional)
GEMINI_MODEL="gemini-2.0-flash"
```

`render.yaml` tells the Render hosting service how to run the backend:

```yaml
services:
  - type: web
    name: github-autobot-backend
    runtime: node
    plan: free
    buildCommand: npm ci && npm run build   # install dependencies, then compile
    startCommand: npm start                # start the compiled program
    healthCheckPath: /health               # ping this to check health
    envVars:
      - key: PORT
        value: 4000
      - key: INTERNAL_API_SECRET
        sync: false        # you must type this in the dashboard
      - key: GITHUB_WEBHOOK_SECRET
        generateValue: true # Render makes a random one for you
      ...
```

- `sync: false` means "don't put a value in the file — the human must type it in the dashboard."
- `generateValue: true` means "generate a random one for me."

---

## 4. The Frontend — the Control Room

### 4.1 `frontend/lib/backend.ts` — the frontend's helper that talks to the backend

The top half of this file only defines **types** — descriptions of data shapes (a person, a repo,
a rule...). These descriptions make the code safe: if the data doesn't match, the program complains
at build time.

```ts
type GithubProfile = { id, login, name, avatar_url };
type ConnectedRepository = { id, github_repo_id, owner, name, webhook_id, active, created_at, event_count };
type ActionLog = { id, type, status, detail, created_at };
type RepoEvent = { ..., ai_summary, action_logs: ActionLog[] };
type Rule = { ..., notify_slack, ai_enabled, enabled, created_at };
type RuleInput = { eventType, matchField, matchValue, actionType, actionValue, notifySlack, aiEnabled, enabled };
```

- Notice the rule types appear twice: `Rule` (how the backend stores it, `snake_case`) and
  `RuleInput` (how the website form sends it, `camelCase`). The website converts one to the other.

Then the actual helpers:

```ts
async function internalFetch(path, init?) {
  return fetch(`${process.env.BACKEND_URL}/internal${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.INTERNAL_API_SECRET as string,
      ...(init?.headers ?? {}),
    },
  });
}
```

- This is how the frontend talks to the backend. Every call:
  - goes to `<BACKEND_URL>/internal/...`;
  - carries the `x-internal-secret` password. `process.env.BACKEND_URL` and
    `process.env.INTERNAL_API_SECRET` are read from the frontend's secret settings (only available
    on the server side — that's why the browser can never see this password).

The rest are simple wrappers, one per backend route:

```ts
upsertUser(profile)   → POST /internal/users               (save a signed-in person)
getRepositories(id)   → GET  /internal/repositories?githubUserId=...
addRepository(body)   → POST /internal/repositories        (connect a repo)
getEvents(id)         → GET  /internal/events?githubUserId=...
getRules(repoId)      → GET  /internal/repositories/:id/rules
createRule(repoId, input)  → POST   ... (create)
updateRule(repoId, id, input) → PUT   ... (update)
deleteRule(repoId, id) → DELETE ... (delete)
```

- Each checks `res.ok` and throws a simple English error if the call failed, so the website can
  show it to the user.

### 4.2 `frontend/lib/auth.ts` — login settings

```ts
export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  providers: [ GitHubProvider({ clientId: ..., clientSecret: ..., authorization: { params: { scope: "read:user user:email repo" } } }) ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
        token.id = profile?.id ? String(profile.id) : undefined;
        token.login = profile?.login;
        try { await upsertUser(profile); } catch (err) { console.error("Failed to sync user..."); }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id ?? "";
      session.user.login = token.login ?? "";
      return session;
    },
  },
};
```

- **`secret`** → the key used to encrypt the session cookie.
- **`strategy: "jwt"`** → after login, all the identity info is packed into a signed token (JWT)
  instead of being stored in a database. No extra database needed for sessions.
- **`scope: "read:user user:email repo"`** → we ask GitHub for permission to read the profile and
  — importantly — `repo` access, which lets us create webhooks and add labels/comments later.
- **`jwt` callback** → runs when a token is created (right after sign-in). It stores the GitHub
  access token, the user's id, and login on the JWT, and *tries* to save the user to the backend.
  If that save fails, it's fine (we noted "best-effort"): connecting a repo re-creates the user row.
- **`session` callback** → this decides what the **browser** is allowed to see. Only `id` and
  `login` are put into the visible session. The precious access token stays safely in the server
  JWT and is never sent to the browser.

### 4.3 `frontend/types/next-auth.d.ts` — telling TypeScript about our extras

```ts
declare module "next-auth" { interface Session { user: { id: string; login: string } & DefaultSession["user"]; } }
declare module "next-auth/jwt" { interface JWT { accessToken?: string; id?: string; login?: string; } }
```

- NextAuth doesn't know about our custom `id`/`login`/`accessToken` fields by default. These
  "declarations" tell TypeScript: "trust me, the session and the token DO have these extra
  fields." This is why the rest of the code can use `session.user.id` and `token.accessToken`
  without errors.

### 4.4 `frontend/proxy.ts` — the dashboard guard

```ts
export default withAuth({ pages: { signIn: "/signin" } });
export const config = { matcher: ["/dashboard/:path*"] };
```

- `withAuth` is a middleware: before the `/dashboard` pages are shown, it checks "is the user
  signed in?" If not, it bounces them to `/signin`. The `matcher` says "guard everything that
  starts with `/dashboard/`."

### 4.5 `frontend/app/layout.tsx` — the page skeleton

```ts
export const metadata: Metadata = { title: "GitHub Autobot", description: "..." };
export default function RootLayout({ children }) {
  return (
    <html lang="en" className={...fonts...}>
      <body className="...background colors...">{children}</body>
    </html>
  );
}
```

- `layout.tsx` is the outer shell of every page in the app (this is a Next.js App Router rule).
- `metadata` → the browser tab title and description.
- It loads two Google fonts (Geist and Geist Mono) and sets the page background (light gray in day
  mode, near-black in dark mode).

### 4.6 `frontend/app/page.tsx` — the front page

```ts
export default function RootPage() { redirect("/dashboard"); }
```

- If someone visits the root URL, send them straight to the dashboard. (The dashboard's own guard
  will send them to sign-in if they aren't logged in.)

### 4.7 `frontend/app/signin/page.tsx` — the login screen

```ts
const session = await getServerSession(authOptions);
if (session) redirect("/dashboard");
```

- If you're already logged in, skip the login screen.

```ts
<SignInButton callbackUrl={callbackUrl} />
```

- Shows the "Continue with GitHub" button. `callbackUrl` lets NextAuth send the user back to the
  page they wanted. There's also a small note that the app asks for repo access so it can create
  webhooks and post labels/comments.

### 4.8 `frontend/app/dashboard/page.tsx` — the dashboard (server-side)

```ts
export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/signin");
  const githubUserId = session.user.id;
  const [repos, events] = await Promise.all([
    getRepositories(githubUserId).catch(() => []),
    getEvents(githubUserId).catch(() => []),
  ]);
  return <DashboardShell initialRepos={repos} initialEvents={events} user={{...}} />;
}
```

- A "server component": it runs on the server before the page is sent to the browser.
- If not signed in → redirect to `/signin`.
- Fetch the repos and events from the backend (with `.catch(() => [])` so a backend hiccup shows an
  empty page instead of crashing).
- Passes them to `DashboardShell` as "initial" data, along with the user's name/login/picture.

### 4.9 `frontend/app/api/...` — the tiny post offices (route handlers)

Next.js route handlers are like mini backend routes inside the website. They all follow the same
pattern: read the JWT to confirm login, then forward to the real backend with the secret header.
Because the access token only lives in the JWT on the server, these routes keep it away from the
browser.

`app/api/auth/[...nextauth]/route.ts`:
```ts
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```
- The special NextAuth endpoint that handles login/logout and callbacks. The `[...nextauth]`
  folder name is a NextAuth convention.

`app/api/repos/route.ts`:
- `GET` → asks GitHub (using `token.accessToken`) for the user's repositories and returns a tidy
  list. If the token is missing → 401.
- `POST` → takes `{ githubRepoId, owner, repoName }`, calls `addRepository` with the token from the
  JWT (never from the browser), and returns the saved repo. Errors → 502.

`app/api/events/route.ts`:
- `GET` → reads the token, calls `getEvents(token.id)`, returns the events. Errors → 502.

`app/api/rules/route.ts`:
- `GET` → needs `repositoryId` in the URL; returns that repo's rules via `getRules`.
- `POST` → needs `repositoryId`; reads the rule JSON from the request body and creates it.

`app/api/rules/[id]/route.ts`:
- `PUT` → needs `repositoryId` and the rule `id`; updates the rule.
- `DELETE` → needs `repositoryId` and the rule `id`; deletes it.
- The `params` are promises (Next.js 16 convention), so they are awaited: `const id = Number((await params).id)`.

### 4.10 `frontend/components/SignInButton.tsx`

```ts
<button onClick={() => signIn("github", { callbackUrl: callbackUrl || "/dashboard" })}>
  ...GitHub logo... Continue with GitHub
</button>
```

- A simple button that calls NextAuth's `signIn("github", ...)`, which starts the GitHub OAuth
  dance and brings the user back to the dashboard.

### 4.11 `frontend/components/dashboard/DashboardShell.tsx` — the app's main screen layout

```ts
export function DashboardShell({ initialRepos, initialEvents, user }) {
  const [activeView, setActiveView] = useState<ViewId>("repositories");
  const [repos, setRepos] = useState<ConnectedRepository[]>(initialRepos);
  const [events, setEvents] = useState<RepoEvent[]>(initialEvents);
  const [loadingRepos, setLoadingRepos] = useState(false);
  ...
  const refreshRepos = async () => { ... fetch("/api/repos") ... setRepos(...) };
  const refreshEvents = async () => { ... fetch("/api/events") ... };
  const loadGithubRepos = async () => { ... fetch("/api/repos") ... };  // list from GitHub
  const openConnect = () => { setConnectOpen(true); loadGithubRepos(); };
  const handleConnected = async () => { await Promise.all([refreshRepos(), refreshEvents()]); };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeView={activeView} onSelect={setActiveView} user={user} />
      <main>
        {activeView === "repositories" && <RepositoriesView ... />}
        {activeView === "activity" && <ActivityView ... />}
        {activeView === "rules" && <RulesView repos={repos} />}
      </main>
      <ConnectRepositoryModal ... />
    </div>
  );
}
```

- This is a **client component** (it uses state). It holds the current screen (`activeView`),
  the list of repos and events, and the functions to refresh them.
- The sidebar is on the left; one of the three views is shown in the middle; the connect-repository
  popup lives at the end.
- `handleConnected` refreshes both repos and events after a new repo is connected.

### 4.12 `frontend/components/dashboard/Sidebar.tsx`

```ts
const navItems = [
  { id: "repositories", label: "Repositories", icon: RepoIcon },
  { id: "activity", label: "Activity", icon: ActivityIcon },
  { id: "rules", label: "Rules", icon: RuleIcon },
];
```

- Defines the three navigation buttons. The active one is highlighted.
- At the bottom it shows the user's avatar (or first letter), name, `@login`, and a "Sign out"
  button that calls `signOut({ callbackUrl: "/signin" })`.

### 4.13 `frontend/components/dashboard/RepositoriesView.tsx`

```tsx
if (repos.length === 0) return <EmptyState ... action={<Button onClick={onConnect}>Connect a repository</Button>} />;
```

- If there are no repos, show a friendly "connect one" invitation.

```tsx
{repo.webhook_id !== null ? <Badge tone="green">Webhook active</Badge>
                          : <Badge tone="amber">Webhook pending</Badge>}
```

- Each repo card shows `owner/name`, the event count ("12 events"), a green "Webhook active" badge
  if the webhook was registered, or an amber "Webhook pending" badge if it wasn't. If pending, a
  hint says "Reconnect to retry webhook setup."

### 4.14 `frontend/components/dashboard/ActivityView.tsx`

```tsx
{events.map((event) => (
  <tr key={event.id}>
    <td>{formatTime(event.received_at)}</td>
    <td>{event.owner}/{event.repo_name}</td>
    <td>{eventLabel(event)}{event.ai_summary && <p>{event.ai_summary}</p>}</td>
    <td>... list of action_logs, with Slack or GitHub icon and success/failed badge ...</td>
    <td><Badge tone={statusTone(event.status)}>{event.status}</Badge></td>
  </tr>
))}
```

- A table of events: when, which repo, which event, what the bot did (from `action_logs`), and the
  status. If there's an AI summary it's shown under the event name. Status colors: green =
  processed, red = failed, amber = anything else (e.g. pending/processing).

### 4.15 `frontend/components/dashboard/RulesView.tsx` — the rules editor

```tsx
const [selectedRepoId, setSelectedRepoId] = useState(repos[0]?.id ?? null);
const [rules, setRules] = useState<Rule[]>([]);
```

- The rules screen is per repository, so it starts by picking the first repo.

```tsx
useEffect(() => {
  if (!selectedRepoId) return;
  let cancelled = false;
  (async () => {
    const res = await fetch(`/api/rules?repositoryId=${selectedRepoId}`);
    if (cancelled) return;
    setRules(res.ok ? await res.json() : []);
    setLoading(false);
  })();
  return () => { cancelled = true; };
}, [selectedRepoId]);
```

- Whenever the selected repo changes, load its rules. The `cancelled` flag makes sure a slow old
  request doesn't overwrite a newer one. (Note: the loading state is only changed *after* the
  await, to keep React's lint rules happy.)

```tsx
const submit = async (input: RuleInput) => {
  ...
  const url = editingRule
    ? `/api/rules/${editingRule.id}?repositoryId=${selectedRepoId}`  // PUT for editing
    : `/api/rules?repositoryId=${selectedRepoId}`;                    // POST for creating
  const res = await fetch(url, { method: editingRule ? "PUT" : "POST", ... });
  ...
};
```

- Saving a rule: creating uses POST, editing uses PUT to the rule's own URL.

```tsx
const toggleEnabled = async (rule) => { ... PUT with { ...toInput(rule), enabled: !rule.enabled } ... };
const removeRule = async (rule) => { if (!window.confirm("Delete this rule?")) return; ... DELETE ... };
```

- `toggleEnabled` flips the on/off switch and saves it. `removeRule` asks for confirmation, then
  deletes.

```tsx
<select value={selectedRepoId} onChange={(e) => setSelectedRepoId(Number(e.target.value))}>...</select>
```

- The repository picker at the top.

Each rule card shows (see `toInput`, `eventName`, `actionText` helpers):

```
[Issue] title contains "bug" → [Add label "bug"] [Slack] [+ AI summary]
```

- with an Active/Disabled switch, Edit and Delete buttons.

### 4.16 `frontend/components/dashboard/RuleFormModal.tsx` — the create/edit rule popup

```tsx
const [eventType, setEventType] = useState(rule?.event_type ?? "issues");
const [matchField, setMatchField] = useState(rule?.match_field ?? "title");
const [matchValue, setMatchValue] = useState(rule?.match_value ?? "");
...
```

- The form starts with sensible defaults, or with the existing rule's values when editing.

```tsx
const submit = () => {
  if (matchValue.trim() === "" || actionValue.trim() === "") { setLocalError("Match keyword and action value are required."); return; }
  onSubmit({ eventType, matchField, matchValue: matchValue.trim(), actionType, actionValue: actionValue.trim(), notifySlack, aiEnabled, enabled });
};
```

- Checks the two required text boxes are filled, then hands the form values up to `RulesView` as a
  `RuleInput`.

The form fields:
- "When this happens" → dropdown: A new issue / pull request / push.
- "Match in" → dropdown: title or body.
- "Contains keyword" → text box (e.g. "bug").
- "Then" → dropdown: add label or post a comment.
- Label name / comment text → text box (or textarea).
- Three checkboxes: "Send a Slack notification", "Include the AI summary in Slack", "Rule is active".
- Cancel / Create (or Save) buttons, plus an error line if validation failed.

### 4.17 `frontend/components/dashboard/ConnectRepositoryModal.tsx` — the "connect repo" popup

```tsx
const [query, setQuery] = useState("");
const filtered = useMemo(() => {
  if (!repos) return [];
  const q = query.trim().toLowerCase();
  if (!q) return repos;
  return repos.filter((r) => r.full_name.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q));
}, [repos, query]);
```

- A search box. `useMemo` re-runs the filtering only when the list or the search text changes
  (a performance nicety).

```tsx
const connect = async (repo) => {
  setConnecting(repo.id);
  try {
    const res = await fetch("/api/repos", { method: "POST", body: JSON.stringify({ githubRepoId: repo.id, owner: repo.owner, repoName: repo.name }) });
    if (!res.ok) throw new Error("Failed to connect repository");
    onConnected(); onClose();
  } catch (e) { setConnectError(...); } finally { setConnecting(null); }
};
```

- Clicking "Connect" posts to the website's `/api/repos` (which forwards to the backend). On
  success, tells the shell to refresh and closes the popup. While connecting, a spinner shows on
  that row's button and all other Connect buttons are disabled.

States handled:
- Backend list failed → "Could not load repositories" with a "Try again" button.
- Loading → spinner.
- No results → "No matches" or "No repositories found".
- Already connected repos show a green "Connected" check instead of a button.

### 4.18 `frontend/components/dashboard/icons.tsx`

```tsx
function base(props) { return { viewBox, fill, stroke, strokeWidth, className, "aria-hidden": true }; }
export function LogoIcon(props) { return <svg {...base(props)}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg>; }
```

- Small hand-drawn SVG icons (logo, repo, activity, rules, plus, X, check, alert, search, clock,
  refresh, Slack, GitHub). Each one is just a `svg` with some `path` shapes. `aria-hidden` tells
  screen readers to skip them (they're decorative).

### 4.19 The reusable UI pieces (`frontend/components/ui/`)

**`Button.tsx`** — one button component with 4 styles and 2 sizes:

```tsx
const variantClass = {
  primary: "bg-zinc-900 text-white ...",   // dark filled button
  secondary: "border ...",                  // outlined button
  ghost: "text-zinc-600 ...",               // plain text button
  danger: "bg-red-600 text-white ...",      // red destructive button
};
const sizeClass = { sm: "px-2.5 py-1.5 text-xs", md: "px-3.5 py-2 text-sm" };
export function Button({ variant = "primary", size = "md", className = "", type = "button", ...props }) {
  return <button type={type} className={`... ${variantClass[variant]} ${sizeClass[size]} ${className}`} {...props} />;
}
```

- Every button in the app goes through this, so they all look consistent. The long strings are
  Tailwind CSS classes (layout/colors/sizes).

**`Badge.tsx`** — a small colored pill:

```tsx
const toneClass = { neutral, green, amber, red, blue };
export function Badge({ tone = "neutral", children, ... }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${toneClass[tone]}`}>{children}</span>;
}
```

**`Modal.tsx`** — a popup window:

```tsx
useEffect(() => {
  if (!open) return;
  const onKey = (e) => { if (e.key === "Escape") onClose(); };
  document.addEventListener("keydown", onKey);
  document.body.style.overflow = "hidden";          // stop the page behind from scrolling
  return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
}, [open, onClose]);
```

- When open, pressing **Escape** closes it and the page behind can't scroll. Clicking the dark
  backdrop (the check `e.target === e.currentTarget`) also closes it. It has a title bar with an X
  button and the content area, plus a screen-reader `aria-label`.

**`Spinner.tsx`** — a small spinning circle:

```tsx
<svg className={`animate-spin ${className}`} ...>
  <circle className="opacity-25" ... />   // faint full ring
  <path className="opacity-75" ... />     // bright arc
</svg>
```

- The CSS class `animate-spin` rotates it. Used in buttons while things are loading.

**`EmptyState.tsx`** — a friendly "nothing here" box:

```tsx
<div className="...dashed border...">
  {icon}
  <p>{title}</p>
  <p>{description}</p>
  {action}
</div>
```

- Shown when a list is empty (no repos, no events, no rules).

### 4.20 `frontend/next.config.ts` — website settings

```ts
const nextConfig: NextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "avatars.githubusercontent.com" }] },
};
```

- Next.js is strict about which websites it will load images from. This allows profile pictures
  from `avatars.githubusercontent.com` (where GitHub stores avatars).

### 4.21 `frontend/tsconfig.json` — TypeScript settings

- Mostly standard Next.js settings. The interesting bits:
  - `"strict": true` → make the type checker as careful as possible.
  - `"paths": { "@/*": ["./*"] }` → the alias that lets code write `@/lib/backend` instead of a
    long relative path. `@/` always means the frontend folder root.

---

## 5. Follow One Full Story: "An Issue is Opened"

Put it all together with one example. Imagine you signed in and connected `your-name/blog`, and
made this rule:

> **Issue, title contains "bug", → add label "bug" + Slack notification.**

Now someone opens an issue titled **"Fix the login bug on mobile"**.

1. **GitHub** sees the new issue and posts a webhook message to `https://<your-backend>/webhook`,
   signed with the webhook secret, carrying the delivery id, event type `issues`, action `opened`,
   and the issue's title/body/number.
2. **`routes/webhook.ts`** checks the signature (matches → good), finds the repo is ours, inserts
   the event as `pending` (unique delivery id prevents duplicates), and calls `enqueueEvent`.
3. **`lib/processor.ts`** claims the event (`processing`), asks **Gemini** for a summary (if a key
   is configured), loads the enabled rules for that repo + `issues`, and checks each:
   - title contains "bug"? Yes → **rule matches.**
4. The bot calls **GitHub** to add the `bug` label (using your stored token), writes a
   `github_write: success` line to `action_logs`, then sends **Slack** the pretty notification
   (with AI summary if the rule asked), writing a `slack_notify: success` line.
5. It marks the event `processed`.
6. Meanwhile the **dashboard** calls `/api/events` → `/internal/events`, and the Activity view now
   shows the new issue with green "processed" status and both actions taken.

If the Slack send failed once, it retries; if GitHub's token expired, the label write is logged as
`failed` but the event still finishes. And if the process crashed mid-way, the **sweeper** finds
the stuck event within 2 minutes and finishes it.

---

## 6. Security, in Plain Words

| Question | Answer |
| --- | --- |
| How do we know a webhook is really from GitHub? | `GITHUB_WEBHOOK_SECRET`. GitHub signs each message; we verify the signature in `webhook.ts` before trusting it. |
| How do we know the website is ours? | `INTERNAL_API_SECRET` (frontend sends it on every call; the backend's `internalAuth` checks it). |
| Where is the GitHub access token kept? | Only in the server-side JWT and in the database. The browser never receives it (see `lib/auth.ts` session callback). |
| What happens to unknown repositories? | We ignore them (still answer `ok` so GitHub stops retrying). |
| Can someone spam us with forged requests? | They'd need the webhook secret to pass the signature check, so no. |
| What if the DB connection string is missing? | The backend refuses to start with a clear error instead of failing weirdly. |

---

## 7. A Tiny Glossary

| Word | Simple meaning |
| --- | --- |
| **Webhook** | A message GitHub sends to a URL when something happens |
| **HMAC / signature** | A secret "fingerprint" of a message only the holder of the secret can create |
| **JWT** | A small, signed "ID card" the browser keeps so it doesn't have to log in every time |
| **OAuth** | The "login with GitHub" system that lets us ask for permissions |
| **Migration** | A SQL file that changes the database structure |
| **Upsert** | "Update if exists, Insert if not" |
| **Route / endpoint** | A URL the server responds to (e.g. `/webhook`) |
| **Middleware** | A step that runs in the middle of a request (guard, parser...) |
| **Backoff** | Waiting longer between retries |
| **CRUD** | Create, Read, Update, Delete — the four basic operations |
| **Server component** | React code that runs on the server, not in the browser |
| **Client component** | React code that runs in the browser (can use state/effects) |
