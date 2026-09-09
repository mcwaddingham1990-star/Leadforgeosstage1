import type { Request, Response, NextFunction } from "express";
import { getClientIp } from "./clientInfo";

// Minimal in-memory sliding-window limiter for endpoints that have to stay
// reachable without a login (webhook-style forms, AI usage that costs real
// money per call) and would otherwise let a single caller hammer them --
// there was previously no limit of any kind on these routes. Per-process
// only (fine for this app's single-instance deployment); resets on restart.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(name: string, windowMs: number, max: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${name}:${getClientIp(req)}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (bucket.count >= max) {
      res.status(429).json({ error: "Too many requests. Please try again later." });
      return;
    }
    bucket.count++;
    next();
  };
}

// Periodic cleanup so long-lived processes don't accumulate stale entries.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 10 * 60 * 1000).unref?.();
