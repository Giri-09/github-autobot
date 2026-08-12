import crypto from "node:crypto";
import { Router } from "express";
import type { Request } from "express";
import { pool } from "../db/pool";
import { asyncHandler } from "../lib/asyncHandler";
import { enqueueEvent } from "../lib/processor";

const WEBHOOK_SECRET: string = (() => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("GITHUB_WEBHOOK_SECRET is not set");
  }
  return secret;
})();

export const webhookRouter = Router();

type RequestWithRawBody = Request & { rawBody?: Buffer };

function verifySignature(req: RequestWithRawBody): boolean {
  const signature = req.header("x-hub-signature-256");
  if (!signature || !req.rawBody) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", WEBHOOK_SECRET).update(req.rawBody).digest("hex");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Public endpoint. GitHub POSTs every delivery here; each delivery carries a
// unique X-GitHub-Delivery id that we use to make recording idempotent - a
// re-delivered (or forged-but-validly-signed) copy cannot create a duplicate
// row and is never re-processed. Processing into actions is queued fire-and-
// forget so the webhook answers fast; the background sweeper covers retries.
webhookRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    if (!verifySignature(req as RequestWithRawBody)) {
      req.log.warn("webhook rejected: bad signature");
      res.status(401).json({ error: "invalid signature" });
      return;
    }

    const deliveryId = req.header("x-github-delivery");
    const eventType = req.header("x-github-event");
    const payload = req.body as {
      repository?: { id?: number };
      action?: string;
    };

    if (!deliveryId || !eventType) {
      req.log.warn("webhook rejected: missing delivery headers");
      res.status(400).json({ error: "missing delivery headers" });
      return;
    }

    const githubRepoId = payload.repository?.id;
    if (!githubRepoId) {
      req.log.warn({ eventType }, "webhook missing repository");
      res.status(200).json({ ok: true });
      return;
    }

    const repoResult = await pool.query(
      "SELECT id FROM repositories WHERE github_repo_id = $1",
      [githubRepoId]
    );
    if (repoResult.rowCount === 0) {
      req.log.warn(
        { githubRepoId, eventType },
        "webhook for unconnected repository ignored"
      );
      res.status(200).json({ ok: true });
      return;
    }

    const repositoryId = repoResult.rows[0].id as number;

    const insertResult = await pool.query(
      `INSERT INTO events (repository_id, github_delivery_id, event_type, action, payload, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       ON CONFLICT (github_delivery_id) DO NOTHING
       RETURNING id`,
      [
        repositoryId,
        deliveryId,
        eventType,
        payload.action ?? null,
        JSON.stringify(req.body),
      ]
    );

    // rowCount 0 means this delivery was seen before - ack without reprocessing
    if (insertResult.rowCount && insertResult.rowCount > 0) {
      enqueueEvent(insertResult.rows[0].id as number);
    }

    res.status(200).json({ ok: true });
  })
);
