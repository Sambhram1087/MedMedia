import { useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, uploadFile, useInfinite } from '../api';
import { useAuth } from '../auth';
import { Empty, ErrorNote, Icon, LoadMore, PersonLink, Spinner } from '../components/ui';
import type { Clip } from '../types';

const CATEGORIES = [
  { id: '', label: 'All' },
  { id: 'clinical', label: 'Clinical' },
  { id: 'education', label: 'Education' },
  { id: 'social', label: 'Social' },
] as const;

export function ClipsPage() {
  const { user } = useAuth();
  const [category, setCategory] = useState('');
  const feed = useInfinite<Clip>(['clips', category], '/api/clips', { category, limit: 8 });

  return (
    <>
      <div className="page-head"><h1>Medclips</h1><p>Short videos from verified doctors and students.</p></div>
      <div className="chips" role="tablist" aria-label="Category">
        {CATEGORIES.map((c) => (
          <button key={c.id} role="tab" aria-selected={category === c.id} className={category === c.id ? 'is-active' : ''} onClick={() => setCategory(c.id)}>{c.label}</button>
        ))}
      </div>
      {user?.verificationStatus === 'verified' && <ClipUpload />}
      {feed.isLoading && <Spinner />}
      <ErrorNote error={feed.error} />
      <div className="clips">{feed.items.map((c) => <ClipCard key={c.id} clip={c} />)}</div>
      {feed.isSuccess && !feed.items.length && <Empty title="No clips yet">Verified members can upload the first one.</Empty>}
      <LoadMore hasNext={!!feed.hasNextPage} loading={feed.isFetchingNextPage} onMore={() => feed.fetchNextPage()} />
    </>
  );
}

function ClipCard({ clip: initial }: { clip: Clip }) {
  const [clip, setClip] = useState(initial);
  const ref = useRef<HTMLVideoElement>(null);

  // Only the clip on screen plays and loads; the rest stay idle to save bandwidth.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && e.intersectionRatio > 0.6) v.play().catch(() => undefined);
      else v.pause();
    }, { threshold: [0, 0.6] });
    io.observe(v);
    return () => io.disconnect();
  }, []);

  async function like() {
    const next = !clip.liked;
    setClip((c) => ({ ...c, liked: next, likeCount: c.likeCount + (next ? 1 : -1) }));
    try {
      const r = await (next ? api.post : api.del)<{ likeCount: number }>(`/api/clips/${clip.id}/like`);
      setClip((c) => ({ ...c, likeCount: r.likeCount }));
    } catch {
      setClip((c) => ({ ...c, liked: !next, likeCount: c.likeCount + (next ? -1 : 1) }));
    }
  }

  return (
    <article className="clip">
      <video ref={ref} src={clip.videoUrl} muted loop playsInline controls preload="metadata" />
      <div className="clip-meta">
        <PersonLink author={clip.author} />
        <p>{clip.caption}</p>
        <span className="tag">{clip.category}</span>
        <button className={`action ${clip.liked ? 'is-on' : ''}`} onClick={like} aria-pressed={clip.liked}>
          <Icon name="heart" size={18} filled={clip.liked} /> {clip.likeCount || ''}<span className="sr-only">Like</span>
        </button>
      </div>
    </article>
  );
}

function ClipUpload() {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState('clinical');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const { key } = await uploadFile(file, 'clip');
      await api.post('/api/clips', { videoKey: key, caption, category, noPatientInfo: ok });
      setFile(null); setCaption(''); setOk(false);
      qc.invalidateQueries({ queryKey: ['clips'] });
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <details className="card upload">
      <summary><Icon name="plus" size={18} /> Upload a clip</summary>
      <form onSubmit={submit}>
        <input type="file" accept="video/mp4,video/webm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required aria-label="Video file" />
        <input className="field" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption" maxLength={500} required />
        <select className="field" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="clinical">Clinical</option><option value="education">Education</option><option value="social">Social</option>
        </select>
        <label className="check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span>Nothing in this clip identifies a patient.</span></label>
        <ErrorNote error={error} />
        <button className="btn btn-primary" disabled={busy || !file || !ok}>{busy ? 'Uploading…' : 'Publish clip'}</button>
      </form>
    </details>
  );
}
