import { Router } from 'express';
import { z } from 'zod';
import { one, q, tx } from '../db';
import { badRequest, forbidden, notFound, parse } from '../lib/errors';
import { AUTHOR_COLUMNS } from '../lib/mappers';
import { pageQuery, toPage } from '../lib/pagination';
import { hydratePosts, pollTallies, POST_SELECT } from '../lib/posts';
import { isValidKey, publicUrl } from '../lib/storage';
import { requireAuth } from '../middleware/auth';
import { writeLimiter } from '../middleware/limits';

export const postsRouter = Router();
postsRouter.use(requireAuth, writeLimiter);

const idParam = z.string().uuid();

const listQuery = pageQuery.extend({
  scope: z.enum(['all', 'following']).default('all'),
  authorId: z.string().uuid().optional(),
});

postsRouter.get('/', async (req, res) => {
  const { cursor, limit, scope, authorId } = parse(listQuery, req.query);
  const params: unknown[] = [req.user!.id];
  const where: string[] = [];
  if (cursor) { params.push(cursor); where.push(`p.seq < $${params.length}`); }
  if (authorId) { params.push(authorId); where.push(`p.author_id = $${params.length}`); }
  if (scope === 'following') {
    where.push('(p.author_id = $1 OR p.author_id IN (SELECT followee_id FROM follows WHERE follower_id = $1))');
  }
  params.push(limit + 1);
  const rows = await q(
    `${POST_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.seq DESC LIMIT $${params.length}`,
    params,
  );
  const page = toPage(rows, limit);
  res.json({ items: await hydratePosts(page.items), nextCursor: page.nextCursor });
});

const createSchema = z
  .object({
    kind: z.enum(['update', 'case_poll', 'link']),
    body: z.string().trim().min(1, 'Write something before posting').max(3000),
    imageKey: z.string().optional(),
    linkUrl: z.string().url().max(500).refine((u) => /^https?:\/\//i.test(u), 'Link must start with http or https').optional(),
    pollOptions: z.array(z.string().trim().min(1).max(120)).min(2).max(4).optional(),
    noPatientInfo: z.boolean().default(false),
  })
  .superRefine((d, ctx) => {
    if (d.kind === 'case_poll' && !d.pollOptions) ctx.addIssue({ code: 'custom', message: 'Add at least two answer options', path: ['pollOptions'] });
    if (d.kind === 'link' && !d.linkUrl) ctx.addIssue({ code: 'custom', message: 'Add a link', path: ['linkUrl'] });
    if ((d.kind === 'case_poll' || d.imageKey) && !d.noPatientInfo) {
      ctx.addIssue({ code: 'custom', message: 'Confirm that nothing in this post identifies a patient', path: ['noPatientInfo'] });
    }
  });

postsRouter.post('/', async (req, res) => {
  const d = parse(createSchema, req.body);
  if (d.imageKey && !isValidKey(d.imageKey, 'post')) throw badRequest('Invalid image upload');
  const created = await one<{ id: string }>(
    `INSERT INTO posts (author_id, kind, body, image_url, link_url, poll_options)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [
      req.user!.id, d.kind, d.body,
      d.imageKey ? publicUrl(d.imageKey) : null,
      d.kind === 'link' ? d.linkUrl : null,
      d.kind === 'case_poll' ? JSON.stringify(d.pollOptions) : null,
    ],
  );
  const rows = await q(`${POST_SELECT} WHERE p.id = $2`, [req.user!.id, created!.id]);
  res.status(201).json({ post: (await hydratePosts(rows))[0] });
});

postsRouter.delete('/:id', async (req, res) => {
  const id = parse(idParam, req.params.id);
  const post = await one<{ author_id: string }>('SELECT author_id FROM posts WHERE id = $1', [id]);
  if (!post) throw notFound('Post not found');
  if (post.author_id !== req.user!.id && !req.user!.isAdmin) throw forbidden('You can only delete your own posts');
  await q('DELETE FROM posts WHERE id = $1', [id]);
  res.json({ ok: true });
});

postsRouter.post('/:id/like', async (req, res) => {
  const id = parse(idParam, req.params.id);
  const likeCount = await tx(async (c) => {
    const exists = await c.query('SELECT 1 FROM posts WHERE id = $1', [id]);
    if (!exists.rowCount) throw notFound('Post not found');
    const r = await c.query('INSERT INTO post_likes (post_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, req.user!.id]);
    const u = await c.query(
      `UPDATE posts SET like_count = like_count + $2 WHERE id = $1 RETURNING like_count`,
      [id, r.rowCount ? 1 : 0],
    );
    return u.rows[0].like_count as number;
  });
  res.json({ liked: true, likeCount });
});

postsRouter.delete('/:id/like', async (req, res) => {
  const id = parse(idParam, req.params.id);
  const likeCount = await tx(async (c) => {
    const r = await c.query('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [id, req.user!.id]);
    const u = await c.query(
      `UPDATE posts SET like_count = GREATEST(like_count - $2, 0) WHERE id = $1 RETURNING like_count`,
      [id, r.rowCount ? 1 : 0],
    );
    if (!u.rowCount) throw notFound('Post not found');
    return u.rows[0].like_count as number;
  });
  res.json({ liked: false, likeCount });
});

postsRouter.post('/:id/vote', async (req, res) => {
  const id = parse(idParam, req.params.id);
  const { option } = parse(z.object({ option: z.number().int().min(0).max(3) }), req.body);
  const post = await one<{ poll_options: string[] | null }>('SELECT poll_options FROM posts WHERE id = $1', [id]);
  if (!post?.poll_options) throw notFound('Poll not found');
  if (option >= post.poll_options.length) throw badRequest('That option does not exist');
  await q('INSERT INTO poll_votes (post_id, user_id, option_idx) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [id, req.user!.id, option]);
  const mine = await one<{ option_idx: number }>('SELECT option_idx FROM poll_votes WHERE post_id = $1 AND user_id = $2', [id, req.user!.id]);
  const t = (await pollTallies([id])).get(id) ?? [];
  const options = post.poll_options.map((label, i) => ({ label, votes: t[i] ?? 0 }));
  res.json({ poll: { options, total: options.reduce((a, b) => a + b.votes, 0), myVote: mine?.option_idx ?? null } });
});

postsRouter.get('/:id/comments', async (req, res) => {
  const id = parse(idParam, req.params.id);
  const { cursor, limit } = parse(pageQuery, req.query);
  const params: unknown[] = [id, limit + 1];
  let where = 'c.post_id = $1';
  if (cursor) { params.push(cursor); where += ` AND c.seq > $${params.length}`; }
  const rows = await q(
    `SELECT c.id, c.seq, c.body, c.created_at, ${AUTHOR_COLUMNS}
     FROM post_comments c JOIN users u ON u.id = c.author_id
     WHERE ${where} ORDER BY c.seq ASC LIMIT $2`,
    params,
  );
  const page = toPage(rows, limit);
  res.json({ items: page.items.map(mapComment), nextCursor: page.nextCursor });
});

postsRouter.post('/:id/comments', async (req, res) => {
  const id = parse(idParam, req.params.id);
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(1000) }), req.body);
  const row = await tx(async (c) => {
    const upd = await c.query('UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1', [id]);
    if (!upd.rowCount) throw notFound('Post not found');
    const ins = await c.query('INSERT INTO post_comments (post_id, author_id, body) VALUES ($1,$2,$3) RETURNING id', [id, req.user!.id, body]);
    const full = await c.query(
      `SELECT c.id, c.seq, c.body, c.created_at, ${AUTHOR_COLUMNS}
       FROM post_comments c JOIN users u ON u.id = c.author_id WHERE c.id = $1`,
      [ins.rows[0].id],
    );
    return full.rows[0];
  });
  res.status(201).json({ comment: mapComment(row) });
});

function mapComment(r: any) {
  return {
    id: r.id,
    seq: r.seq,
    body: r.body,
    createdAt: r.created_at,
    author: { id: r.author_id, name: r.author_name, role: r.author_role, verified: r.author_verification === 'verified', avatarUrl: r.author_avatar ?? null, headline: r.author_headline ?? null },
  };
}
