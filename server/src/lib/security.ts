import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';

// scrypt runs on the libuv thread pool, so it does not block the event loop.
const scrypt = (pw: string, salt: Buffer, len: number) =>
  new Promise<Buffer>((resolve, reject) =>
    crypto.scrypt(pw, salt, len, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))),
  );

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export interface TokenPayload {
  sub: string;
  admin: boolean;
}

export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: TOKEN_TTL_SECONDS });
}

export function readToken(token: string): TokenPayload | null {
  try {
    const p = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    return typeof p.sub === 'string' ? { sub: p.sub, admin: !!p.admin } : null;
  } catch {
    return null;
  }
}
