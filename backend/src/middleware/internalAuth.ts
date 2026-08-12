import type { Request, Response, NextFunction } from "express";

if (!process.env.INTERNAL_API_SECRET) {
  throw new Error("INTERNAL_API_SECRET is not set");
}

// Proves a request came from our own frontend server, not the public internet
export function internalAuth(req: Request, res: Response, next: NextFunction) {
  const secret = req.header("x-internal-secret");
  if (secret !== process.env.INTERNAL_API_SECRET) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}
