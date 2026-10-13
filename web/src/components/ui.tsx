import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Author } from '../types';

const ICONS: Record<string, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  play: 'M5 4l14 8-14 8z',
  briefcase: 'M3 8h18v12H3zM9 8V5h6v3M3 13h18',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6',
  heart: 'M12 20s-8-5-8-11a4.5 4.5 0 018-2.5A4.5 4.5 0 0120 9c0 6-8 11-8 11z',
  comment: 'M4 5h16v11H9l-5 4z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  check: 'M5 12l5 5 9-10',
  plus: 'M12 5v14M5 12h14',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3A4 4 0 0011 18.7l1-1',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  logout: 'M10 4H4v16h6M15 8l4 4-4 4M19 12H9',
  admin: 'M12 3l2.5 5 5.5.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.5-.8z',
};

export function Icon({ name, size = 20, filled = false }: { name: keyof typeof ICONS | string; size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Avatar({ author, size = 40 }: { author: Pick<Author, 'name' | 'avatarUrl' | 'role'>; size?: number }) {
  const initials = author.name.replace(/^Dr\.?\s+/i, '').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return author.avatarUrl ? (
    <img className="avatar" src={author.avatarUrl} alt="" width={size} height={size} loading="lazy" />
  ) : (
    <span className={`avatar avatar-${author.role}`} style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {initials}
    </span>
  );
}

export function VerifiedBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="verified" title="Credentials verified by MedMedia">
      <Icon name="check" size={11} />
      <span className="sr-only">Verified</span>
    </span>
  );
}

export function PersonLink({ author, sub }: { author: Author; sub?: ReactNode }) {
  return (
    <Link to={`/u/${author.id}`} className="person">
      <Avatar author={author} />
      <span className="person-text">
        <span className="person-name">
          {author.name} <VerifiedBadge show={author.verified} />
        </span>
        <span className="person-sub">{sub ?? author.headline ?? (author.role === 'student' ? 'Student' : 'Doctor')}</span>
      </span>
    </Link>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span className="dots" aria-hidden="true"><i /><i /><i /></span>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="error" role="alert">{error instanceof Error ? error.message : 'Something went wrong.'}</p>;
}

/** Loads the next page automatically when scrolled near the end, with a button as a fallback. */
export function LoadMore({ hasNext, loading, onMore }: { hasNext: boolean; loading: boolean; onMore: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasNext || loading || !ref.current) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && onMore(), { rootMargin: '400px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [hasNext, loading, onMore]);
  if (!hasNext) return null;
  return (
    <div ref={ref} className="load-more">
      {loading ? <Spinner /> : <button className="btn btn-quiet" onClick={onMore}>Load more</button>}
    </div>
  );
}

export function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d > 300 ? 'numeric' : undefined });
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
