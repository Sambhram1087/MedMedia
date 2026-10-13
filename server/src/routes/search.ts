import { Router } from 'express';
import { z } from 'zod';
import { q } from '../db';
import { parse } from '../lib/errors';
import { hydratePosts, POST_SELECT } from '../lib/posts';
import { requireAuth } from '../middleware/auth';
import { mapOpportunity } from '../lib/mappers';
import { tsQuery } from '../lib/tsquery';

export const searchRouter = Router();
searchRouter.use(requireAuth);

searchRouter.get('/', async (req, res) => {
  const { q: text, type } = parse(
    z.object({ q: z.string().trim().min(2).max(100), type: z.enum(['all', 'people', 'posts', 'opportunities']).default('all') }),
    req.query,
  );
  const tsq = tsQuery(text);
  if (!tsq) return res.json({ people: [], posts: [], opportunities: [] });
  const want = (t: string) => type === 'all' || type === t;

  const [people, posts, opportunities] = await Promise.all([
    want('people')
      ? q(
          `SELECT id, name, role, headline, specialization, institution, verification_status, avatar_url
           FROM users WHERE search @@ to_tsquery('simple', $1)
           ORDER BY (verification_status = 'verified') DESC, ts_rank(search, to_tsquery('simple', $1)) DESC LIMIT 10`,
          [tsq],
        )
      : [],
    want('posts')
      ? q(`${POST_SELECT} WHERE p.search @@ to_tsquery('simple', $2) ORDER BY p.seq DESC LIMIT 10`, [req.user!.id, tsq])
      : [],
    want('opportunities')
      ? q(
          `SELECT id, seq, kind, title, organization, location, employment_type, experience_level, description,
                  event_date, contact, apply_url, created_by, created_at
           FROM opportunities WHERE search @@ to_tsquery('simple', $1) ORDER BY seq DESC LIMIT 10`,
          [tsq],
        )
      : [],
  ]);

  res.json({
    people: people.map((r: any) => ({
      id: r.id, name: r.name, role: r.role, headline: r.headline ?? r.specialization,
      institution: r.institution, verified: r.verification_status === 'verified', avatarUrl: r.avatar_url,
    })),
    posts: await hydratePosts(posts),
    opportunities: opportunities.map(mapOpportunity),
  });
});
