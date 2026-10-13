import { useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { api, useInfinite } from '../api';
import { useAuth } from '../auth';
import type { Comment, Poll, Post } from '../types';
import { ErrorNote, Icon, LoadMore, PersonLink, timeAgo } from './ui';

export function PostCard({ post: initial, onDeleted }: { post: Post; onDeleted?: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [post, setPost] = useState(initial);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mine = user?.id === post.author.id;

  async function toggleLike() {
    const next = !post.liked;
    setPost((p) => ({ ...p, liked: next, likeCount: p.likeCount + (next ? 1 : -1) })); // optimistic
    try {
      const r = await (next ? api.post : api.del)<{ likeCount: number }>(`/api/posts/${post.id}/like`);
      setPost((p) => ({ ...p, likeCount: r.likeCount }));
    } catch (e) {
      setPost((p) => ({ ...p, liked: !next, likeCount: p.likeCount + (next ? -1 : 1) }));
      setError(e);
    }
  }

  async function remove() {
    if (!confirm('Delete this post?')) return;
    try {
      await api.del(`/api/posts/${post.id}`);
      qc.invalidateQueries({ queryKey: ['posts'] });
      onDeleted?.();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <article className={`card post ${post.kind === 'case_poll' ? 'post-case' : ''}`}>
      <header className="post-head">
        <PersonLink author={post.author} sub={`${post.author.headline ?? (post.author.role === 'student' ? 'Student' : 'Doctor')} · ${timeAgo(post.createdAt)}`} />
        {mine && (
          <button className="icon-btn" onClick={remove} aria-label="Delete post">
            <Icon name="trash" size={18} />
          </button>
        )}
      </header>

      {post.kind === 'case_poll' && <p className="case-label">Case discussion</p>}
      <p className="post-body">{post.body}</p>

      {post.imageUrl && <img className="post-image" src={post.imageUrl} alt="" loading="lazy" />}
      {post.linkUrl && (
        <a className="link-chip" href={post.linkUrl} target="_blank" rel="noopener noreferrer nofollow">
          <Icon name="link" size={16} /> {new URL(post.linkUrl).hostname.replace(/^www\./, '')}
        </a>
      )}
      {post.poll && <PollView postId={post.id} poll={post.poll} onChange={(poll) => setPost((p) => ({ ...p, poll }))} />}

      <footer className="post-actions">
        <button className={`action ${post.liked ? 'is-on' : ''}`} onClick={toggleLike} aria-pressed={post.liked}>
          <Icon name="heart" size={18} filled={post.liked} /> {post.likeCount || ''}
          <span className="sr-only">Like</span>
        </button>
        <button className="action" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Icon name="comment" size={18} /> {post.commentCount || ''}
          <span className="sr-only">Comments</span>
        </button>
      </footer>
      <ErrorNote error={error} />
      {open && <Comments postId={post.id} onAdded={() => setPost((p) => ({ ...p, commentCount: p.commentCount + 1 }))} />}
    </article>
  );
}

function PollView({ postId, poll, onChange }: { postId: string; poll: Poll; onChange: (p: Poll) => void }) {
  const [error, setError] = useState<unknown>(null);
  const voted = poll.myVote !== null;
  async function vote(option: number) {
    if (voted) return;
    try {
      onChange((await api.post<{ poll: Poll }>(`/api/posts/${postId}/vote`, { option })).poll);
    } catch (e) {
      setError(e);
    }
  }
  return (
    <div className="poll" role="group" aria-label="Poll">
      {poll.options.map((o, i) => {
        const pct = poll.total ? Math.round((o.votes / poll.total) * 100) : 0;
        return (
          <button key={i} className={`poll-opt ${voted ? 'is-result' : ''} ${poll.myVote === i ? 'is-mine' : ''}`} onClick={() => vote(i)} disabled={voted}>
            {voted && <span className="poll-bar" style={{ width: `${pct}%` }} />}
            <span className="poll-label">{o.label}</span>
            {voted && <span className="poll-pct">{pct}%</span>}
          </button>
        );
      })}
      <p className="poll-meta">{poll.total} {poll.total === 1 ? 'vote' : 'votes'}{voted ? '' : ' · vote to see results'}</p>
      <ErrorNote error={error} />
    </div>
  );
}

function Comments({ postId, onAdded }: { postId: string; onAdded: () => void }) {
  const list = useInfinite<Comment>(['comments', postId], `/api/posts/${postId}/comments`, { limit: 20 });
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [extra, setExtra] = useState<Comment[]>([]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ comment: Comment }>(`/api/posts/${postId}/comments`, { body });
      setExtra((x) => [...x, r.comment]);
      setBody('');
      onAdded();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const all = [...list.items, ...extra.filter((c) => !list.items.some((i) => i.id === c.id))];
  return (
    <div className="comments">
      {all.map((c) => (
        <div className="comment" key={c.id}>
          <PersonLink author={c.author} sub={timeAgo(c.createdAt)} />
          <p>{c.body}</p>
        </div>
      ))}
      <LoadMore hasNext={!!list.hasNextPage} loading={list.isFetchingNextPage} onMore={() => list.fetchNextPage()} />
      <form className="comment-form" onSubmit={submit}>
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment" maxLength={1000} aria-label="Add a comment" />
        <button className="btn btn-primary" disabled={busy || !body.trim()}>Reply</button>
      </form>
      <ErrorNote error={error} />
    </div>
  );
}
