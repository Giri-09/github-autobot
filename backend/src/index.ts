import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
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

const app = express();
app.use(pinoHttp({ logger })); // logs every request/response: method, path, status, duration
// verify captures the raw body so the webhook router can check its HMAC signature
app.use(
  express.json({
    verify: (req: Request, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Public: GitHub delivers webhook events here (signed, not internal-secret)
app.use("/webhook", webhookRouter);

app.use("/internal/users", internalAuth, usersRouter);
app.use("/internal/repositories", internalAuth, repositoriesRouter);
app.use("/internal/repositories/:repoId/rules", internalAuth, rulesRouter);
app.use("/internal/events", internalAuth, eventsRouter);

// Catches errors forwarded by asyncHandler so one failed request can't crash the process
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  req.log.error({ err }, "request failed");
  res.status(500).json({ error: "internal error" });
});

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
const server = app.listen(port, () => {
  logger.info(`backend listening on :${port}`);
});

// Sweeps pending/failed events so nothing is lost if a webhook handler dies
// mid-processing or a downstream call is briefly unavailable
startEventProcessor();

// Without this, Ctrl+C hangs - the open DB connections keep the process alive
function shutdown() {
  logger.info("shutting down");
  stopEventProcessor();
  server.close(() => {
    pool.end().then(() => process.exit(0));
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
