import { z } from 'zod';

export const pageQuery = z.object({
  cursor: z.string().regex(/^\d+$/).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Keyset pagination: rows are fetched with limit+1 so we know if there is another page. */
export function toPage<T extends { seq: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].seq : null };
}
