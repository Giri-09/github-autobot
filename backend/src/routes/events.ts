import { Router } from "express";
import { pool } from "../db/pool";
import { asyncHandler } from "../lib/asyncHandler";

export const eventsRouter = Router();

// Lightweight marker used by the dashboard's auto-refresh: cheap to query and
// only the full list (with action logs) is fetched when latest_id changes.
eventsRouter.get(
  "/latest",
  asyncHandler(async (req, res) => {
    const githubUserId = Number(req.query.githubUserId);
    if (!githubUserId) {
      res.status(400).json({ error: "githubUserId is required" });
      return;
    }

    const result = await pool.query(
      `SELECT COALESCE(max(e.id), 0)::int AS latest_id,
              count(*)::int AS count
       FROM events e
       JOIN repositories r ON r.id = e.repository_id
       JOIN users u ON u.id = r.user_id
       WHERE u.github_user_id = $1`,
      [githubUserId]
    );

    res.json(result.rows[0]);
  })
);

eventsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const githubUserId = Number(req.query.githubUserId);
    if (!githubUserId) {
      res.status(400).json({ error: "githubUserId is required" });
      return;
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const beforeId = req.query.before_id ? Number(req.query.before_id) : null;

    // Cursor pagination by id: fetch limit+1 so we can report has_more without
    // a separate count query. New events arriving don't shift already-loaded pages.
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
         AND ($2::int IS NULL OR e.id < $2)
       GROUP BY e.id, r.owner, r.name
       ORDER BY e.id DESC
       LIMIT $3`,
      [githubUserId, beforeId, limit + 1]
    );

    const rows = result.rows;
    const hasMore = rows.length > limit;
    const events = hasMore ? rows.slice(0, limit) : rows;

    res.json({ events, has_more: hasMore });
  })
);
