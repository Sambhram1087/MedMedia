import { useState } from 'react';
import { useInfinite } from '../api';
import { Composer } from '../components/Composer';
import { PostCard } from '../components/PostCard';
import { Empty, ErrorNote, LoadMore, Spinner } from '../components/ui';
import type { Post } from '../types';

export function FeedPage() {
  const [scope, setScope] = useState<'all' | 'following'>('all');
  const feed = useInfinite<Post>(['posts', 'feed', scope], '/api/posts', { scope, limit: 15 });

  return (
    <>
      <Composer />
      <div className="seg seg-wide" role="tablist" aria-label="Feed">
        <button role="tab" aria-selected={scope === 'all'} className={scope === 'all' ? 'is-active' : ''} onClick={() => setScope('all')}>Everyone</button>
        <button role="tab" aria-selected={scope === 'following'} className={scope === 'following' ? 'is-active' : ''} onClick={() => setScope('following')}>Following</button>
      </div>
      {feed.isLoading && <Spinner />}
      <ErrorNote error={feed.error} />
      {feed.items.map((p) => <PostCard key={p.id} post={p} />)}
      {feed.isSuccess && !feed.items.length && (
        <Empty title={scope === 'following' ? 'Nothing here yet' : 'No posts yet'}>
          {scope === 'following' ? 'Follow colleagues to see their posts here.' : 'Be the first to share something.'}
        </Empty>
      )}
      <LoadMore hasNext={!!feed.hasNextPage} loading={feed.isFetchingNextPage} onMore={() => feed.fetchNextPage()} />
    </>
  );
}
