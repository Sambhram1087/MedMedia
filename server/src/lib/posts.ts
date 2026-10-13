import { q } from '../db';
import { AUTHOR_COLUMNS, mapPost } from './mappers';

/** $1 must always be the viewer's user id. */
export const POST_SELECT = `
  SELECT p.id, p.seq, p.kind, p.body, p.image_url, p.link_url, p.poll_options,
         p.like_count, p.comment_count, p.created_at, ${AUTHOR_COLUMNS},
         EXISTS (SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = $1) AS liked,
         (SELECT v.option_idx FROM poll_votes v WHERE v.post_id = p.id AND v.user_id = $1) AS my_vote
  FROM posts p JOIN users u ON u.id = p.author_id`;

export async function pollTallies(postIds: string[]): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (!postIds.length) return out;
  const rows = await q<{ post_id: string; option_idx: number; n: number }>(
    `SELECT post_id, option_idx, count(*)::int AS n FROM poll_votes WHERE post_id = ANY($1::uuid[]) GROUP BY 1, 2`,
    [postIds],
  );
  for (const r of rows) {
    const arr = out.get(r.post_id) ?? [];
    arr[r.option_idx] = r.n;
    out.set(r.post_id, arr);
  }
  return out;
}

export async function hydratePosts(rows: any[]) {
  const pollIds = rows.filter((r) => r.poll_options).map((r) => r.id);
  const tallies = await pollTallies(pollIds);
  return rows.map((r) => {
    const t = tallies.get(r.id);
    const len = (r.poll_options as string[] | null)?.length ?? 0;
    const filled = r.poll_options ? Array.from({ length: len }, (_, i) => t?.[i] ?? 0) : null;
    return mapPost(r, filled);
  });
}
