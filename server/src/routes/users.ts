import { Router } from 'express';
import { z } from 'zod';
import { one, q, tx } from '../db';
import { badRequest, notFound, parse } from '../lib/errors';
import { mapPublicUser, mapUser } from '../lib/mappers';
import { requireAuth } from '../middleware/auth';

export const usersRouter = Router();
usersRouter.use(requireAuth);

const idParam = z.string().uuid();

const profileSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    headline: z.string().trim().max(160).nullable(),
    specialization: z.string().trim().max(120).nullable(),
    qualifications: z.string().trim().max(300).nullable(),
    institution: z.string().trim().max(160).nullable(),
    location: z.string().trim().max(120).nullable(),
    bio: z.string().trim().max(1000).nullable(),
    experienceYears: z.number().int().min(0).max(70).nullable(),
    course: z.string().trim().max(120).nullable(),
    studyYear: z.number().int().min(1).max(8).nullable(),
  })
  .partial();

const COLUMNS: Record<string, string> = {
  name: 'name', headline: 'headline', specialization: 'specialization', qualifications: 'qualifications',
  institution: 'institution', location: 'location', bio: 'bio', experienceYears: 'experience_years',
  course: 'course', studyYear: 'study_year',
};

usersRouter.get('/suggestions', async (req, res) => {
  const rows = await q(
    `SELECT * FROM users u
     WHERE u.id <> $1 AND u.verification_status = 'verified'
       AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.followee_id = u.id)
     ORDER BY u.follower_count DESC, u.created_at DESC
     LIMIT 5`,
    [req.user!.id],
  );
  res.json({ items: rows.map(mapPublicUser) });
});

usersRouter.patch('/me', async (req, res) => {
  const data = parse(profileSchema, req.body) as Record<string, unknown>;
  const sets: string[] = [];
  const params: unknown[] = [req.user!.id];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    params.push(value === '' ? null : value);
    sets.push(`${COLUMNS[key]} = $${params.length}`);
  }
  if (!sets.length) throw badRequest('Nothing to update');
  const row = await one(`UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params);
  res.json({ user: mapUser(row) });
});

usersRouter.get('/:id', async (req, res) => {
  const id = parse(idParam, req.params.id);
  const row = await one(
    `SELECT u.*, EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $2 AND f.followee_id = u.id) AS following
     FROM users u WHERE u.id = $1`,
    [id, req.user!.id],
  );
  if (!row) throw notFound('Profile not found');
  res.json({ user: { ...mapPublicUser(row), following: row.following } });
});

usersRouter.post('/:id/follow', async (req, res) => {
  const id = parse(idParam, req.params.id);
  if (id === req.user!.id) throw badRequest('You cannot follow yourself');
  const exists = await one('SELECT 1 FROM users WHERE id = $1', [id]);
  if (!exists) throw notFound('Profile not found');
  await tx(async (c) => {
    const r = await c.query(
      'INSERT INTO follows (follower_id, followee_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.user!.id, id],
    );
    if (r.rowCount) {
      await c.query('UPDATE users SET follower_count = follower_count + 1 WHERE id = $1', [id]);
      await c.query('UPDATE users SET following_count = following_count + 1 WHERE id = $1', [req.user!.id]);
    }
  });
  res.json({ following: true });
});

usersRouter.delete('/:id/follow', async (req, res) => {
  const id = parse(idParam, req.params.id);
  await tx(async (c) => {
    const r = await c.query('DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2', [req.user!.id, id]);
    if (r.rowCount) {
      await c.query('UPDATE users SET follower_count = GREATEST(follower_count - 1, 0) WHERE id = $1', [id]);
      await c.query('UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE id = $1', [req.user!.id]);
    }
  });
  res.json({ following: false });
});
