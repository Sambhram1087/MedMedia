import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { Empty, ErrorNote, Spinner } from '../components/ui';

interface Item { id: string; name: string; email: string; role: string; specialization: string | null; institution: string | null; course: string | null; studyYear: number | null; hasDocument: boolean; createdAt: string }

export function AdminPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['admin', 'pending'], queryFn: () => api.get<{ items: Item[] }>('/api/admin/verifications?status=pending') });
  const [error, setError] = useState<unknown>(null);

  async function decide(id: string, status: 'verified' | 'rejected') {
    setError(null);
    try {
      await api.post(`/api/admin/users/${id}/verification`, { status });
      qc.invalidateQueries({ queryKey: ['admin'] });
    } catch (e) { setError(e); }
  }

  return (
    <>
      <div className="page-head"><h1>Verification queue</h1><p>Check the document against the name and registration details, then approve or reject.</p></div>
      {list.isLoading && <Spinner />}
      <ErrorNote error={list.error ?? error} />
      {list.data?.items.map((u) => (
        <article key={u.id} className="card opp">
          <h3>{u.name}</h3>
          <p className="opp-org">{u.email} · {u.role}{u.specialization ? ` · ${u.specialization}` : ''}{u.course ? ` · ${u.course}${u.studyYear ? ` year ${u.studyYear}` : ''}` : ''}{u.institution ? ` · ${u.institution}` : ''}</p>
          <div className="opp-actions">
            {u.hasDocument ? <a className="btn btn-quiet" href={`/api/admin/users/${u.id}/document`} target="_blank" rel="noopener noreferrer">Open document</a> : <span>No document</span>}
            <button className="btn btn-primary" onClick={() => decide(u.id, 'verified')}>Approve</button>
            <button className="btn btn-quiet" onClick={() => decide(u.id, 'rejected')}>Reject</button>
          </div>
        </article>
      ))}
      {list.data && !list.data.items.length && <Empty title="Queue is empty">New requests will appear here.</Empty>}
    </>
  );
}
