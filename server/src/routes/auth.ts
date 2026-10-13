import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { one } from '../db';
import { badRequest, parse, unauthorized } from '../lib/errors';
import { mapUser } from '../lib/mappers';
import { hashPassword, signToken, TOKEN_TTL_SECONDS, verifyPassword } from '../lib/security';
import { isValidKey } from '../lib/storage';
import { COOKIE, invalidateUser, requireAuth } from '../middleware/auth';

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(['doctor', 'student']),
  specialization: z.string().trim().max(120).optional(),
  institution: z.string().trim().max(160).optional(),
  course: z.string().trim().max(120).optional(),
  studyYear: z.number().int().min(1).max(8).optional(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms to continue' }) }),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

// Used to keep login timing similar whether or not the email exists.
const DUMMY_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;

function setSession(res: any, userId: string, isAdmin: boolean) {
  const token = signToken({ sub: userId, admin: isAdmin });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.httpsOnly,
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: '/',
  });
  return token;
}

authRouter.post('/register', async (req, res) => {
  const d = parse(registerSchema, req.body);
  const isAdmin = config.adminEmails.includes(d.email);
  const headline = d.role === 'doctor' ? d.specialization : d.course;
  const hash = await hashPassword(d.password);
  const row = await one(
    `INSERT INTO users (email, password_hash, name, role, is_admin, headline, specialization, institution, course, study_year)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [d.email, hash, d.name, d.role, isAdmin, headline ?? null, d.specialization ?? null, d.institution ?? null, d.course ?? null, d.studyYear ?? null],
  );
  if (!row) throw badRequest('An account with this email already exists');
  const token = setSession(res, row.id, row.is_admin);
  res.status(201).json({ user: mapUser(row), token });
});

authRouter.post('/login', async (req, res) => {
  const d = parse(loginSchema, req.body);
  const row = await one('SELECT * FROM users WHERE lower(email) = $1', [d.email]);
  const ok = await verifyPassword(d.password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) throw unauthorized('Incorrect email or password');
  // ADMIN_EMAILS is the source of truth, so promoting an existing account only needs an env change + login.
  if (config.adminEmails.includes(d.email) && !row.is_admin) {
    row.is_admin = true;
    await one('UPDATE users SET is_admin = true WHERE id = $1', [row.id]);
  }
  const token = setSession(res, row.id, row.is_admin);
  res.json({ user: mapUser(row), token });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const row = await one('SELECT * FROM users WHERE id = $1', [req.user!.id]);
  res.json({ user: mapUser(row) });
});

authRouter.post('/verification', requireAuth, async (req, res) => {
  const { docKey } = parse(z.object({ docKey: z.string() }), req.body);
  if (!isValidKey(docKey, 'verification')) throw badRequest('Invalid document upload');
  if (req.user!.verification === 'verified') throw badRequest('You are already verified');
  const row = await one(
    `UPDATE users SET verification_doc_key = $2, verification_status = 'pending' WHERE id = $1 RETURNING *`,
    [req.user!.id, docKey],
  );
  invalidateUser(req.user!.id);
  res.json({ user: mapUser(row) });
});
