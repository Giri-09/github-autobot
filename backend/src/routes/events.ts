import { Router } from "express";
import { pool } from "../db/pool";
import { asyncHandler } from "../lib/asyncHandler";

export const eventsRouter = Router();

eventsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const githubUserId = Number(req.query.githubUserId);
    if (!githubUserId) {
      res.status(400).json({ error: "githubUserId is required" });
      return;
    }

    const result = await pool.query(
      `SELECT e.id, e.repository_id, e.github_delivery_id, e.event_type,
              e.action, e.status, e.received_at, e.processed_at,
              e.ai_summary,
              r.owner, r.name AS repo_name,
              COALESCE(
                json_agg(al ORDER BY al.created_at DESC)
                  FILTER (WHERE al.id IS NOT NULL),
                '[]'
              ) AS action_logs
       FROM events e
       JOIN repositories r ON r.id = e.repository_id
       JOIN users u ON u.id = r.user_id
       LEFT JOIN action_logs al ON al.event_id = e.id
       WHERE u.github_user_id = $1
       GROUP BY e.id, r.owner, r.name
       ORDER BY e.received_at DESC
       LIMIT 100`,
      [githubUserId]
    );

    res.json(result.rows);
  })
);
