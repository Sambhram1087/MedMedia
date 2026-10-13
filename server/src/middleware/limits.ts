import rateLimit from 'express-rate-limit';
import { config } from '../config';

const json = (message: string) => ({ error: message, code: 'rate_limited' });

/** Broad per-IP ceiling for the whole API. */
export const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.RATE_LIMIT_PER_MIN,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('Too many requests. Please slow down.'),
});

/** Protects login/register from password guessing. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: config.isProd ? config.AUTH_RATE_LIMIT_PER_15MIN : 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('Too many attempts. Try again in a few minutes.'),
});

/** Per signed-in user limit for anything that creates content. Mount after requireAuth. */
export const writeLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? 'anonymous',
  skip: (req) => req.method === 'GET',
  message: json('You are posting too quickly. Wait a moment and try again.'),
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? 'anonymous',
  message: json('Upload limit reached. Try again later.'),
});
