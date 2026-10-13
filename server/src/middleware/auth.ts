import type { NextFunction, Request, Response } from 'express';
import { one } from '../db';
import { forbidden, unauthorized } from '../lib/errors';
import { readToken } from '../lib/security';

export interface AuthUser {
  id: string;
  isAdmin: boolean;
  verification: string;
  role: 'doctor' | 'student';
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export const COOKIE = 'mm_token';

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.[COOKIE] ?? null;
}

// Every API request needs the current user. A few seconds of caching removes one DB query from
// each request, which matters a lot when the connection pool is the bottleneck. Changes made on
// this instance invalidate immediately; other instances catch up within TTL_MS.
const TTL_MS = 5_000;
const MAX_ENTRIES = 5_000;
const cache = new Map<string, { user: AuthUser | null; exp: number }>();

export function invalidateUser(id: string) {
  cache.delete(id);
}

async function loadUser(id: string): Promise<AuthUser | null> {
  const hit = cache.get(id);
  if (hit && hit.exp > Date.now()) return hit.user;
  const row = await one<{ id: string; is_admin: boolean; verification_status: string; role: 'doctor' | 'student' }>(
    'SELECT id, is_admin, verification_status, role FROM users WHERE id = $1',
    [id],
  );
  const user = row ? { id: row.id, isAdmin: row.is_admin, verification: row.verification_status, role: row.role } : null;
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(id, { user, exp: Date.now() + TTL_MS });
  return user;
}

/** Requires a valid session. Role and verification are re-read at most every few seconds. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  const payload = token ? readToken(token) : null;
  if (!payload) throw unauthorized();
  const user = await loadUser(payload.sub);
  if (!user) throw unauthorized('Your session has expired. Please sign in again.');
  req.user = user;
  next();
}

export function requireVerified(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.verification !== 'verified' && !req.user?.isAdmin) {
    throw forbidden('Only verified doctors and students can do this. Upload your credentials on your profile.');
  }
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user?.isAdmin) throw forbidden('Admins only');
  next();
}
