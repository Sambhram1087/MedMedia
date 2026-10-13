import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { one, q } from '../db';
import { notFound, parse } from '../lib/errors';
import { isValidKey, presignPrivateRead, uploadRoot } from '../lib/storage';
import { invalidateUser, requireAdmin, requireAuth } from '../middleware/auth';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

const idParam = z.string().uuid();

adminRouter.get('/verifications', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['pending', 'verified', 'rejected']).default('pending') }), req.query);
  const rows = await q(
    `SELECT id, name, email, role, specialization, institution, course, study_year, verification_status,
            verification_doc_key IS NOT NULL AS has_document, created_at
     FROM users WHERE verification_status = $1 ORDER BY created_at ASC LIMIT 100`,
    [status],
  );
  res.json({
    items: rows.map((r) => ({
      id: r.id, name: r.name, email: r.email, role: r.role, specialization: r.specialization,
      institution: r.institution, course: r.course, studyYear: r.study_year,
      status: r.verification_status, hasDocument: r.has_document, createdAt: r.created_at,
    })),
  });
});

adminRouter.post('/users/:id/verification', async (req, res) => {
  const id = parse(idParam, req.params.id);
  const { status } = parse(z.object({ status: z.enum(['verified', 'rejected']) }), req.body);
  const row = await one('UPDATE users SET verification_status = $2 WHERE id = $1 RETURNING id, verification_status', [id, status]);
  if (!row) throw notFound('User not found');
  invalidateUser(id);
  res.json({ id: row.id, status: row.verification_status });
});

/** Credential documents are only ever readable by admins, never via a public URL. */
adminRouter.get('/users/:id/document', async (req, res) => {
  const id = parse(idParam, req.params.id);
  const row = await one<{ verification_doc_key: string | null }>('SELECT verification_doc_key FROM users WHERE id = $1', [id]);
  const key = row?.verification_doc_key;
  if (!key || !isValidKey(key, 'verification')) throw notFound('No document uploaded');
  res.setHeader('Cache-Control', 'no-store');
  if (config.STORAGE_DRIVER === 's3') return res.redirect(await presignPrivateRead(key));
  const file = path.join(uploadRoot, key);
  if (!fs.existsSync(file)) throw notFound('Document file is missing');
  res.sendFile(file);
});
