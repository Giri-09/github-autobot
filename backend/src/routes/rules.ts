import { Router } from "express";
import { pool } from "../db/pool";
import { asyncHandler } from "../lib/asyncHandler";

// mergeParams makes the :repoId from the mount path available to these handlers
export const rulesRouter = Router({ mergeParams: true });

const EVENT_TYPES = ["issues", "pull_request", "push"];
const MATCH_FIELDS = ["title", "body"];
const ACTION_TYPES = ["add_label", "comment"];

function parseRuleInput(body: Record<string, unknown>) {
  const {
    eventType,
    matchField,
    matchValue,
    actionType,
    actionValue,
    notifySlack = true,
    aiEnabled = false,
    enabled = true,
  } = body;

  if (
    typeof eventType !== "string" ||
    !EVENT_TYPES.includes(eventType) ||
    typeof matchField !== "string" ||
    !MATCH_FIELDS.includes(matchField) ||
    typeof matchValue !== "string" ||
    matchValue.trim() === "" ||
    typeof actionType !== "string" ||
    !ACTION_TYPES.includes(actionType) ||
    typeof actionValue !== "string" ||
    actionValue.trim() === ""
  ) {
    return null;
  }

  return {
    eventType,
    matchField,
    matchValue: matchValue.trim(),
    actionType,
    actionValue: actionValue.trim(),
    notifySlack: Boolean(notifySlack),
    aiEnabled: Boolean(aiEnabled),
    enabled: Boolean(enabled),
  };
}

rulesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const repositoryId = Number(req.params.repoId);
    if (!repositoryId) {
      res.status(400).json({ error: "repository id is required" });
      return;
    }

    const result = await pool.query(
      "SELECT * FROM rules WHERE repository_id = $1 ORDER BY id",
      [repositoryId]
    );
    res.json(result.rows);
  })
);

rulesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const repositoryId = Number(req.params.repoId);
    const rule = parseRuleInput(req.body ?? {});
    if (!repositoryId || !rule) {
      res.status(400).json({ error: "invalid rule or repository" });
      return;
    }

    const result = await pool.query(
      `INSERT INTO rules
         (repository_id, event_type, match_field, match_value, action_type, action_value, notify_slack, ai_enabled, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        repositoryId,
        rule.eventType,
        rule.matchField,
        rule.matchValue,
        rule.actionType,
        rule.actionValue,
        rule.notifySlack,
        rule.aiEnabled,
        rule.enabled,
      ]
    );
    res.status(201).json(result.rows[0]);
  })
);

rulesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const repositoryId = Number(req.params.repoId);
    const id = Number(req.params.id);
    const rule = parseRuleInput(req.body ?? {});
    if (!repositoryId || !id || !rule) {
      res.status(400).json({ error: "invalid rule or repository" });
      return;
    }

    const result = await pool.query(
      `UPDATE rules
       SET event_type = $1, match_field = $2, match_value = $3,
           action_type = $4, action_value = $5, notify_slack = $6,
           ai_enabled = $7, enabled = $8
       WHERE id = $9 AND repository_id = $10
       RETURNING *`,
      [
        rule.eventType,
        rule.matchField,
        rule.matchValue,
        rule.actionType,
        rule.actionValue,
        rule.notifySlack,
        rule.aiEnabled,
        rule.enabled,
        id,
        repositoryId,
      ]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: "rule not found" });
      return;
    }
    res.json(result.rows[0]);
  })
);

rulesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const repositoryId = Number(req.params.repoId);
    const id = Number(req.params.id);
    if (!repositoryId || !id) {
      res.status(400).json({ error: "invalid rule or repository" });
      return;
    }

    const result = await pool.query(
      "DELETE FROM rules WHERE id = $1 AND repository_id = $2",
      [id, repositoryId]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: "rule not found" });
      return;
    }
    res.status(204).end();
  })
);
