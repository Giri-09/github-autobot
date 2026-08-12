import { Router } from "express";
import { pool } from "../db/pool";
import { asyncHandler } from "../lib/asyncHandler";
import { logger } from "../lib/logger";
import { createWebhook } from "../lib/github";

const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL;

if (!WEBHOOK_BASE_URL) {
  throw new Error("WEBHOOK_BASE_URL is not set");
}

const WEBHOOK_URL = `${WEBHOOK_BASE_URL}/webhook`;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? "";

export const repositoriesRouter = Router();

repositoriesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const {
      githubUserId,
      githubLogin,
      name,
      avatarUrl,
      githubRepoId,
      owner,
      repoName,
      accessToken,
    } = req.body ?? {};

    if (
      !githubUserId ||
      !githubLogin ||
      !githubRepoId ||
      !owner ||
      !repoName ||
      !accessToken
    ) {
      res.status(400).json({ error: "missing required fields" });
      return;
    }

    // Sign-in's user sync is best-effort and may have failed, so make sure the
    // user row exists here. ON CONFLICT DO NOTHING inserts only when the user
    // id is new - no UPDATE write when the row already exists, so re-connecting
    // a repo doesn't churn the users table.
    const userResult = await pool.query(
      `WITH ensure_user AS (
         INSERT INTO users (github_user_id, github_login, name, avatar_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (github_user_id) DO NOTHING
         RETURNING id
       )
       SELECT id FROM ensure_user
       UNION ALL
       SELECT id FROM users WHERE github_user_id = $1
       LIMIT 1`,
      [githubUserId, githubLogin, name ?? null, avatarUrl ?? null]
    );

    const userId = userResult.rows[0].id as number;

    const repoResult = await pool.query(
      `INSERT INTO repositories (user_id, github_repo_id, owner, name, github_access_token)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, owner, name)
       DO UPDATE SET github_repo_id = EXCLUDED.github_repo_id,
                     github_access_token = EXCLUDED.github_access_token
       RETURNING id, github_repo_id, owner, name, webhook_id, active, created_at`,
      [userId, githubRepoId, owner, repoName, accessToken]
    );

    const repo = repoResult.rows[0];

    // Only register the webhook once per repository row - a re-connect just
    // refreshes the stored token. A failure leaves webhook_id null so the
    // dashboard can surface it and a later connect can retry.
    if (repo.webhook_id === null) {
      try {
        const webhookId = await createWebhook({
          owner,
          name: repoName,
          accessToken,
          webhookUrl: WEBHOOK_URL,
          webhookSecret: WEBHOOK_SECRET,
        });
        await pool.query(
          "UPDATE repositories SET webhook_id = $1 WHERE id = $2",
          [webhookId, repo.id]
        );
        repo.webhook_id = webhookId;
      } catch (err) {
        logger.error({ owner, repoName, err }, "webhook registration failed");
      }
    }

    res.json(repo);
  })
);

repositoriesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const githubUserId = Number(req.query.githubUserId);
    if (!githubUserId) {
      res.status(400).json({ error: "githubUserId is required" });
      return;
    }

    const result = await pool.query(
      `SELECT r.id, r.github_repo_id, r.owner, r.name, r.webhook_id,
              r.active, r.created_at,
              (SELECT count(*) FROM events e WHERE e.repository_id = r.id)
                AS event_count
       FROM repositories r
       JOIN users u ON u.id = r.user_id
       WHERE u.github_user_id = $1
       ORDER BY r.created_at DESC`,
      [githubUserId]
    );

    res.json(result.rows);
  })
);
