import { useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { api, useInfinite } from '../api';
import { useAuth } from '../auth';
import { Empty, ErrorNote, Icon, LoadMore, Spinner, useDebounced } from '../components/ui';
import type { Opportunity, OpportunityKind } from '../types';

const KINDS: { id: '' | OpportunityKind; label: string }[] = [
  { id: '', label: 'All' }, { id: 'job', label: 'Jobs' }, { id: 'research', label: 'Research' },
  { id: 'freelance', label: 'Freelance' }, { id: 'course', label: 'Courses' }, { id: 'event', label: 'Events' }, { id: 'community', label: 'Communities' },
];

export function OpportunitiesPage() {
  const { user } = useAuth();
  const [kind, setKind] = useState<'' | OpportunityKind>('');
  const [text, setText] = useState('');
  const [location, setLocation] = useState('');
  const q = useDebounced(text.trim());
  const loc = useDebounced(location.trim());
  const feed = useInfinite<Opportunity>(['opps', kind, q, loc], '/api/opportunities', { kind, q, location: loc, limit: 15 });

  return (
    <>
      <div className="page-head"><h1>Opportunities</h1><p>Jobs, research, courses, events and communities.</p></div>
      <div className="chips" role="tablist" aria-label="Type">
        {KINDS.map((k) => <button key={k.id} role="tab" aria-selected={kind === k.id} className={kind === k.id ? 'is-active' : ''} onClick={() => setKind(k.id)}>{k.label}</button>)}
      </div>
      <div className="filters">
        <input className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search title, organisation, keywords" aria-label="Search" />
        <input className="field" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" aria-label="Location" />
      </div>
      {user?.verificationStatus === 'verified' && <NewListing />}
      {feed.isLoading && <Spinner />}
      <ErrorNote error={feed.error} />
      {feed.items.map((o) => <OpportunityCard key={o.id} item={o} mine={o.postedBy === user?.id} />)}
      {feed.isSuccess && !feed.items.length && <Empty title="No matches">Try a different keyword or clear the filters.</Empty>}
      <LoadMore hasNext={!!feed.hasNextPage} loading={feed.isFetchingNextPage} onMore={() => feed.fetchNextPage()} />
    </>
  );
}

function OpportunityCard({ item, mine }: { item: Opportunity; mine: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const meta = [item.location, item.employmentType, item.experienceLevel].filter(Boolean).join(' · ');
  return (
    <article className="card opp">
      <span className={`kind kind-${item.kind}`}>{item.kind}</span>
      <h3>{item.title}</h3>
      <p className="opp-org">{item.organization}{meta && ` · ${meta}`}</p>
      {item.eventDate && <p className="opp-date">{new Date(item.eventDate).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</p>}
      <p className={open ? '' : 'clamp'}>{item.description}</p>
      <div className="opp-actions">
        <button className="linkish" onClick={() => setOpen(!open)}>{open ? 'Show less' : 'Read more'}</button>
        {item.applyUrl && <a className="btn btn-primary" href={item.applyUrl} target="_blank" rel="noopener noreferrer nofollow">Apply</a>}
        {open && item.contact && <span className="opp-contact">{item.contact}</span>}
        {mine && <button className="icon-btn" aria-label="Delete listing" onClick={async () => { if (confirm('Delete this listing?')) { await api.del(`/api/opportunities/${item.id}`); qc.invalidateQueries({ queryKey: ['opps'] }); } }}><Icon name="trash" size={18} /></button>}
      </div>
    </article>
  );
}

function NewListing() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [f, setF] = useState({ kind: 'event', title: '', organization: '', location: '', employmentType: '', experienceLevel: '', description: '', applyUrl: '', contact: '', eventDate: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const canJobs = user?.role === 'doctor' || user?.isAdmin;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const body: Record<string, unknown> = { ...f };
      for (const k of Object.keys(body)) if (body[k] === '') delete body[k];
      if (f.eventDate) body.eventDate = new Date(f.eventDate).toISOString();
      await api.post('/api/opportunities', body);
      setF((s) => ({ ...s, title: '', organization: '', location: '', description: '', applyUrl: '', contact: '', eventDate: '' }));
      qc.invalidateQueries({ queryKey: ['opps'] });
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <details className="card upload">
      <summary><Icon name="plus" size={18} /> Post a listing</summary>
      <form onSubmit={submit}>
        <select className="field" value={f.kind} onChange={set('kind')} aria-label="Type">
          {canJobs && <option value="job">Job</option>}
          {canJobs && <option value="freelance">Freelance</option>}
          <option value="research">Research</option><option value="course">Course</option><option value="event">Event</option><option value="community">Community</option>
        </select>
        <input className="field" placeholder="Title" value={f.title} onChange={set('title')} required minLength={3} />
        <input className="field" placeholder="Organisation" value={f.organization} onChange={set('organization')} required />
        <div className="row">
          <input className="field" placeholder="Location" value={f.location} onChange={set('location')} />
          <input className="field" placeholder="Full-time, part-time…" value={f.employmentType} onChange={set('employmentType')} />
        </div>
        {f.kind === 'event' && <input className="field" type="datetime-local" value={f.eventDate} onChange={set('eventDate')} aria-label="Date" />}
        <textarea className="field" rows={4} placeholder="Description" value={f.description} onChange={set('description')} required minLength={10} />
        <input className="field" type="url" placeholder="Apply or registration link (optional)" value={f.applyUrl} onChange={set('applyUrl')} />
        <input className="field" placeholder="Contact (optional)" value={f.contact} onChange={set('contact')} />
        <ErrorNote error={error} />
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Publishing…' : 'Publish'}</button>
      </form>
    </details>
  );
}
