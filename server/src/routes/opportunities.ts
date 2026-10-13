import { Router } from 'express';
import { z } from 'zod';
import { one, q } from '../db';
import { forbidden, notFound, parse } from '../lib/errors';
import { pageQuery, toPage } from '../lib/pagination';
import { requireAuth, requireVerified } from '../middleware/auth';
import { writeLimiter } from '../middleware/limits';
import { mapOpportunity } from '../lib/mappers';
import { tsQuery } from '../lib/tsquery';

export const opportunitiesRouter = Router();
opportunitiesRouter.use(requireAuth, writeLimiter);

const KINDS = ['job', 'research', 'freelance', 'course', 'event', 'community'] as const;

const COLS = `id, seq, kind, title, organization, location, employment_type, experience_level,
              description, event_date, contact, apply_url, created_by, created_at`;

const listQuery = pageQuery.extend({
  kind: z.enum(KINDS).optional(),
  q: z.string().trim().max(100).optional(),
  location: z.string().trim().max(100).optional(),
  employmentType: z.string().trim().max(40).optional(),
  experienceLevel: z.string().trim().max(40).optional(),
});

opportunitiesRouter.get('/', async (req, res) => {
  const f = parse(listQuery, req.query);
  const params: unknown[] = [];
  const where: string[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (f.cursor) add('seq < ?', f.cursor);
  if (f.kind) add('kind = ?', f.kind);
  if (f.employmentType) add('employment_type = ?', f.employmentType);
  if (f.experienceLevel) add('experience_level = ?', f.experienceLevel);
  if (f.location) add('position(lower(?) in lower(coalesce(location, \'\'))) > 0', f.location);
  const tsq = f.q ? tsQuery(f.q) : null;
  if (tsq) add("search @@ to_tsquery('simple', ?)", tsq);
  params.push(f.limit + 1);
  const rows = await q(`SELECT ${COLS} FROM opportunities ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY seq DESC LIMIT $${params.length}`, params);
  const page = toPage(rows, f.limit);
  res.json({ items: page.items.map(mapOpportunity), nextCursor: page.nextCursor });
});

const createSchema = z.object({
  kind: z.enum(KINDS),
  title: z.string().trim().min(3).max(140),
  organization: z.string().trim().min(2).max(140),
  location: z.string().trim().max(120).optional(),
  employmentType: z.string().trim().max(40).optional(),
  experienceLevel: z.string().trim().max(40).optional(),
  description: z.string().trim().min(10).max(4000),
  eventDate: z.string().datetime().optional(),
  contact: z.string().trim().max(200).optional(),
  applyUrl: z.string().url().max(500).refine((u) => /^https?:\/\//i.test(u)).optional(),
});

opportunitiesRouter.post('/', requireVerified, async (req, res) => {
  const d = parse(createSchema, req.body);
  if ((d.kind === 'job' || d.kind === 'freelance') && req.user!.role !== 'doctor' && !req.user!.isAdmin) {
    throw forbidden('Only verified doctors can post jobs and freelance work');
  }
  const row = await one(
    `INSERT INTO opportunities (kind, title, organization, location, employment_type, experience_level, description, event_date, contact, apply_url, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${COLS}`,
    [d.kind, d.title, d.organization, d.location ?? null, d.employmentType ?? null, d.experienceLevel ?? null, d.description, d.eventDate ?? null, d.contact ?? null, d.applyUrl ?? null, req.user!.id],
  );
  res.status(201).json({ item: mapOpportunity(row) });
});

opportunitiesRouter.delete('/:id', async (req, res) => {
  const id = parse(z.string().uuid(), req.params.id);
  const row = await one<{ created_by: string | null }>('SELECT created_by FROM opportunities WHERE id = $1', [id]);
  if (!row) throw notFound('Listing not found');
  if (row.created_by !== req.user!.id && !req.user!.isAdmin) throw forbidden();
  await q('DELETE FROM opportunities WHERE id = $1', [id]);
  res.json({ ok: true });
});
