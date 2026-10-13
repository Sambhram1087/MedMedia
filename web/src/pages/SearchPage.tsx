import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api';
import { PostCard } from '../components/PostCard';
import { Empty, ErrorNote, Icon, PersonLink, Spinner, useDebounced } from '../components/ui';
import type { Opportunity, Post } from '../types';

interface Results {
  people: { id: string; name: string; role: 'doctor' | 'student'; headline: string | null; institution: string | null; verified: boolean; avatarUrl: string | null }[];
  posts: Post[];
  opportunities: Opportunity[];
}

export function SearchPage() {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 350);
  const res = useQuery({
    queryKey: ['search', q],
    enabled: q.length >= 2,
    queryFn: () => api.get<Results>(`/api/search${qs({ q })}`),
    staleTime: 30_000,
  });
  const none = res.data && !res.data.people.length && !res.data.posts.length && !res.data.opportunities.length;

  return (
    <>
      <div className="page-head"><h1>Search</h1></div>
      <div className="searchbox">
        <Icon name="search" />
        <input className="field" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="People, posts, jobs, events" aria-label="Search" />
      </div>
      {q.length >= 2 && res.isFetching && <Spinner />}
      <ErrorNote error={res.error} />
      {none && <Empty title={`Nothing found for “${q}”`}>Check the spelling or try a shorter word.</Empty>}
      {!!res.data?.people.length && (
        <section><h2 className="section-title">People</h2>
          <div className="card list">{res.data.people.map((p) => <PersonLink key={p.id} author={{ ...p, headline: [p.headline, p.institution].filter(Boolean).join(' · ') || null }} />)}</div>
        </section>
      )}
      {!!res.data?.opportunities.length && (
        <section><h2 className="section-title">Opportunities</h2>
          <div className="card list">{res.data.opportunities.map((o) => <Link key={o.id} to="/opportunities" className="side-person"><strong>{o.title}</strong><span>{o.organization}{o.location ? ` · ${o.location}` : ''}</span></Link>)}</div>
        </section>
      )}
      {!!res.data?.posts.length && (
        <section><h2 className="section-title">Posts</h2>{res.data.posts.map((p) => <PostCard key={p.id} post={p} />)}</section>
      )}
    </>
  );
}
