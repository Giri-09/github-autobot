import { Router } from "express";
import { pool } from "../db/pool";
import { asyncHandler } from "../lib/asyncHandler";

export const usersRouter = Router();

usersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { githubUserId, githubLogin, name, avatarUrl } = req.body ?? {};

    if (!githubUserId || !githubLogin) {
      req.log.warn({ body: req.body }, "user upsert rejected: missing fields");
      res.status(400).json({ error: "githubUserId and githubLogin are required" });
      return;
    }

    const result = await pool.query(
      `INSERT INTO users (github_user_id, github_login, name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (github_user_id)
       DO UPDATE SET github_login = $2, name = $3, avatar_url = $4, updated_at = now()
       RETURNING id, github_user_id, github_login, name, avatar_url`,
      [githubUserId, githubLogin, name ?? null, avatarUrl ?? null]
    );

    res.json(result.rows[0]);
  })
);
