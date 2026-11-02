import { NextFunction, Request, Response } from 'express';
import { User } from '../../src/types';
import { db } from '../db/database';
import { passwordFingerprint, readSessionToken } from './sessions';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/** Rejects requests without a valid session token; attaches the signed-in user. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
  const session = readSessionToken(token);
  const user = session ? db.getUserById(session.uid) : undefined;

  if (!session || !user || session.pv !== passwordFingerprint(db.getPasswordForUser(user.id))) {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }

  req.user = user;
  next();
}

/** Fixed-window, in-memory rate limiter keyed by client IP (single-instance deployments). */
export function rateLimit(options: { windowMs: number; max: number; message: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  // Drop expired windows so the map cannot grow without bound
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, options.windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + options.windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    if (entry.count > options.max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ error: options.message });
    }
    next();
  };
}

/** Baseline security headers for every response. */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // No frame restriction: the app is shown inside Google AI Studio's preview frame
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}
