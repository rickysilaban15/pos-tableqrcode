import type { NextFunction, Request, Response } from 'express';

export function createRateLimiter(options: { windowMs: number; max: number; message: string }) {
  const windows = new Map<string, { count: number; startedAt: number }>();

  // Periodically prune expired windows so long-lived processes stay bounded.
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of windows) {
      if (now - entry.startedAt >= options.windowMs) windows.delete(key);
    }
  }, Math.max(30_000, options.windowMs));
  timer.unref?.();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const existing = windows.get(key);
    const current =
      !existing || now - existing.startedAt >= options.windowMs
        ? { count: 0, startedAt: now }
        : existing;
    current.count += 1;
    windows.set(key, current);

    if (current.count > options.max) {
      res.status(429).json({ error: options.message });
      return;
    }
    next();
  };
}
