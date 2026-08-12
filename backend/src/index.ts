import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";
import { pool } from "./db/pool";
import { internalAuth } from "./middleware/internalAuth";
import { usersRouter } from "./routes/users";

const app = express();
app.use(pinoHttp({ logger })); // logs every request/response: method, path, status, duration
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/internal/users", internalAuth, usersRouter);

// Catches errors forwarded by asyncHandler so one failed request can't crash the process
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  req.log.error({ err }, "request failed");
  res.status(500).json({ error: "internal error" });
});

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
const server = app.listen(port, () => {
  logger.info(`backend listening on :${port}`);
});

// Without this, Ctrl+C hangs - the open DB connections keep the process alive
function shutdown() {
  logger.info("shutting down");
  server.close(() => {
    pool.end().then(() => process.exit(0));
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
