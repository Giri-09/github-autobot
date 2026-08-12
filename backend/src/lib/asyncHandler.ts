import type { Request, Response, NextFunction, RequestHandler } from "express";

// Express 4 doesn't catch rejected promises from async handlers on its own -
// without this, a failed query crashes the whole process instead of just this request
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
