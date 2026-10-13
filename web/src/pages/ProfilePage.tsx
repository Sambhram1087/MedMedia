import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, uploadFile, useInfinite } from '../api';
import { useAuth } from '../auth';
import { PostCard } from '../components/PostCard';
import { Avatar, Empty, ErrorNote, Icon, LoadMore, Spinner, VerifiedBadge } from '../components/ui';
import type { Post, User } from '../types';

export function ProfilePage() {
  const { id = '' } = useParams();
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ['user', id], queryFn: async () => (await api.get<{ user: User }>(`/api/users/${id}`)).user });
  const posts = useInfinite<Post>(['posts', 'user', id], '/api/posts', { authorId: id, limit: 10 });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (profile.isLoading) return <Spinner />;
  if (profile.error || !profile.data) return <ErrorNote error={profile.error ?? new Error('Profile not found')} />;
  const u = profile.data;
  const own = me?.id === u.id;

  async function toggleFollow() {
    setBusy(true); setError(null);
    try {
      await (u.following ? api.del : api.post)(`/api/users/${u.id}/follow`);
      await qc.invalidateQueries({ queryKey: ['user', id] });
      qc.invalidateQueries({ queryKey: ['posts', 'feed'] });
      qc.invalidateQueries({ queryKey: ['suggestions'] });
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <>
      <section className="card profile">
        <Avatar author={u} size={72} />
        <div className="profile-main">
          <h1>{u.name} <VerifiedBadge show={u.verificationStatus === 'verified'} /></h1>
          <p className="profile-headline">{u.headline ?? (u.role === 'student' ? 'Student' : 'Doctor')}</p>
          <p className="profile-meta">{[u.institution, u.location].filter(Boolean).join(' · ')}</p>
          {u.qualifications && <p className="profile-meta">{u.qualifications}</p>}
          {u.bio && <p className="profile-bio">{u.bio}</p>}
          <p className="profile-counts"><strong>{u.followerCount}</strong> followers · <strong>{u.followingCount}</strong> following</p>
          {!own && <button className={`btn ${u.following ? 'btn-quiet' : 'btn-primary'}`} onClick={toggleFollow} disabled={busy}>{u.following ? 'Following' : 'Follow'}</button>}
          {own && !editing && <button className="btn btn-quiet" onClick={() => setEditing(true)}>Edit profile</button>}
          <ErrorNote error={error} />
        </div>
      </section>

      {own && editing && <EditProfile user={u} onDone={() => { setEditing(false); qc.invalidateQueries({ queryKey: ['user', id] }); }} />}
      {own && u.verificationStatus !== 'verified' && <VerificationPanel status={u.verificationStatus} role={u.role} />}

      <h2 className="section-title">Posts</h2>
      {posts.isLoading && <Spinner />}
      {posts.items.map((p) => <PostCard key={p.id} post={p} />)}
      {posts.isSuccess && !posts.items.length && <Empty title="No posts yet" />}
      <LoadMore hasNext={!!posts.hasNextPage} loading={posts.isFetchingNextPage} onMore={() => posts.fetchNextPage()} />
    </>
  );
}

function EditProfile({ user, onDone }: { user: User; onDone: () => void }) {
  const { setUser } = useAuth();
  const [f, setF] = useState({
    name: user.name, headline: user.headline ?? '', specialization: user.specialization ?? '', qualifications: user.qualifications ?? '',
    institution: user.institution ?? '', location: user.location ?? '', bio: user.bio ?? '', experienceYears: user.experienceYears?.toString() ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api.patch<{ user: User }>('/api/users/me', { ...f, experienceYears: f.experienceYears === '' ? null : Number(f.experienceYears) });
      setUser(r.user);
      onDone();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <label>Name<input className="field" value={f.name} onChange={set('name')} required minLength={2} /></label>
      <label>Headline<input className="field" value={f.headline} onChange={set('headline')} placeholder="e.g. Consultant cardiologist" /></label>
      <div className="row">
        {user.role === 'doctor' && <label>Specialization<input className="field" value={f.specialization} onChange={set('specialization')} /></label>}
        {user.role === 'doctor' && <label className="narrow">Years<input className="field" type="number" min={0} max={70} value={f.experienceYears} onChange={set('experienceYears')} /></label>}
      </div>
      <label>Qualifications<input className="field" value={f.qualifications} onChange={set('qualifications')} placeholder="MBBS, MD" /></label>
      <div className="row">
        <label>Hospital or college<input className="field" value={f.institution} onChange={set('institution')} /></label>
        <label>Location<input className="field" value={f.location} onChange={set('location')} /></label>
      </div>
      <label>About<textarea className="field" rows={3} maxLength={1000} value={f.bio} onChange={set('bio')} /></label>
      <ErrorNote error={error} />
      <div className="row"><button className="btn btn-primary" disabled={busy}>Save</button><button type="button" className="btn btn-quiet" onClick={onDone}>Cancel</button></div>
    </form>
  );
}

function VerificationPanel({ status, role }: { status: User['verificationStatus']; role: User['role'] }) {
  const { setUser } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const { key } = await uploadFile(file, 'verification');
      const r = await api.post<{ user: User }>('/api/auth/verification', { docKey: key });
      setUser(r.user);
      setFile(null);
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <section className="card verify-panel">
      <h2><Icon name="shield" /> Get verified</h2>
      {status === 'pending' ? (
        <p>Thanks. Your document is with our review team. You will see the verified badge here once it is approved.</p>
      ) : (
        <form onSubmit={submit}>
          <p>{role === 'doctor' ? 'Upload your medical council registration certificate.' : 'Upload your college ID card or a bonafide certificate.'} Only our review team can open it. It is never shown to other members.</p>
          {status === 'rejected' && <p className="error">Your last document was not approved. Make sure the name and number are clearly readable.</p>}
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Verification document" />
          <ErrorNote error={error} />
          <button className="btn btn-primary" disabled={!file || busy}>{busy ? 'Uploading…' : 'Submit for review'}</button>
        </form>
      )}
    </section>
  );
}
