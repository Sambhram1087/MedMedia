import { Router } from 'express';
import { z } from 'zod';
import { one, q, tx } from '../db';
import { badRequest, forbidden, notFound, parse } from '../lib/errors';
import { AUTHOR_COLUMNS, mapAuthor } from '../lib/mappers';
import { pageQuery, toPage } from '../lib/pagination';
import { isValidKey, publicUrl } from '../lib/storage';
import { requireAuth, requireVerified } from '../middleware/auth';
import { writeLimiter } from '../middleware/limits';

export const clipsRouter = Router();
clipsRouter.use(requireAuth, writeLimiter);

const idParam = z.string().uuid();

const SELECT = `
  SELECT c.id, c.seq, c.caption, c.video_url, c.category, c.like_count, c.created_at, ${AUTHOR_COLUMNS},
         EXISTS (SELECT 1 FROM clip_likes l WHERE l.clip_id = c.id AND l.user_id = $1) AS liked
  FROM clips c JOIN users u ON u.id = c.author_id`;

const mapClip = (r: any) => ({
  id: r.id, seq: r.seq, caption: r.caption, videoUrl: r.video_url, category: r.category,
  likeCount: r.like_count, createdAt: r.created_at, liked: !!r.liked, author: mapAuthor(r),
});

clipsRouter.get('/', async (req, res) => {
  const { cursor, limit, category } = parse(pageQuery.extend({ category: z.enum(['clinical', 'social', 'education']).optional() }), req.query);
  const params: unknown[] = [req.user!.id];
  const where: string[] = [];
  if (cursor) { params.push(cursor); where.push(`c.seq < $${params.length}`); }
  if (category) { params.push(category); where.push(`c.category = $${params.length}`); }
  params.push(limit + 1);
  const rows = await q(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.seq DESC LIMIT $${params.length}`, params);
  const page = toPage(rows, limit);
  res.json({ items: page.items.map(mapClip), nextCursor: page.nextCursor });
});

const createSchema = z.object({
  caption: z.string().trim().min(1).max(500),
  category: z.enum(['clinical', 'social', 'education']),
  videoKey: z.string(),
  noPatientInfo: z.literal(true, { errorMap: () => ({ message: 'Confirm that nothing in this clip identifies a patient' }) }),
});

clipsRouter.post('/', requireVerified, async (req, res) => {
  const d = parse(createSchema, req.body);
  if (!isValidKey(d.videoKey, 'clip')) throw badRequest('Invalid video upload');
  const created = await one<{ id: string }>(
    'INSERT INTO clips (author_id, caption, category, video_url) VALUES ($1,$2,$3,$4) RETURNING id',
    [req.user!.id, d.caption, d.category, publicUrl(d.videoKey)],
  );
  const rows = await q(`${SELECT} WHERE c.id = $2`, [req.user!.id, created!.id]);
  res.status(201).json({ clip: mapClip(rows[0]) });
});

clipsRouter.delete('/:id', async (req, res) => {
  const id = parse(idParam, req.params.id);
  const clip = await one<{ author_id: string }>('SELECT author_id FROM clips WHERE id = $1', [id]);
  if (!clip) throw notFound('Clip not found');
  if (clip.author_id !== req.user!.id && !req.user!.isAdmin) throw forbidden();
  await q('DELETE FROM clips WHERE id = $1', [id]);
  res.json({ ok: true });
});

clipsRouter.post('/:id/like', async (req, res) => {
  const id = parse(idParam, req.params.id);
  const likeCount = await tx(async (c) => {
    const exists = await c.query('SELECT 1 FROM clips WHERE id = $1', [id]);
    if (!exists.rowCount) throw notFound('Clip not found');
    const r = await c.query('INSERT INTO clip_likes (clip_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, req.user!.id]);
    const u = await c.query('UPDATE clips SET like_count = like_count + $2 WHERE id = $1 RETURNING like_count', [id, r.rowCount ? 1 : 0]);
    return u.rows[0].like_count as number;
  });
  res.json({ liked: true, likeCount });
});

clipsRouter.delete('/:id/like', async (req, res) => {
  const id = parse(idParam, req.params.id);
  const likeCount = await tx(async (c) => {
    const r = await c.query('DELETE FROM clip_likes WHERE clip_id = $1 AND user_id = $2', [id, req.user!.id]);
    const u = await c.query('UPDATE clips SET like_count = GREATEST(like_count - $2, 0) WHERE id = $1 RETURNING like_count', [id, r.rowCount ? 1 : 0]);
    if (!u.rowCount) throw notFound('Clip not found');
    return u.rows[0].like_count as number;
  });
  res.json({ liked: false, likeCount });
});
