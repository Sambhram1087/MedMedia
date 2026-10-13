import { useQuery } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import type { User } from '../types';
import { Icon, VerifiedBadge } from './ui';

export function Wordmark() {
  return (
    <Link to="/" className="wordmark" aria-label="MedMedia home">
      <span className="wordmark-cross" aria-hidden="true" />
      Med<span>Media</span>
    </Link>
  );
}

const NAV = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/clips', label: 'Medclips', icon: 'play' },
  { to: '/opportunities', label: 'Opportunities', icon: 'briefcase' },
  { to: '/search', label: 'Search', icon: 'search' },
];

export function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  if (!user) return null;
  const items = [...NAV, { to: `/u/${user.id}`, label: 'Profile', icon: 'user' }, ...(user.isAdmin ? [{ to: '/admin', label: 'Review', icon: 'admin' }] : [])];

  return (
    <div className="shell">
      <aside className="rail-left">
        <Wordmark />
        <nav aria-label="Main">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={'end' in i && i.end} className="nav-item">
              <Icon name={i.icon} /> <span>{i.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="me">
          <div className="me-name">{user.name} <VerifiedBadge show={user.verificationStatus === 'verified'} /></div>
          <button className="linkish" onClick={async () => { await logout(); nav('/'); }}><Icon name="logout" size={16} /> Sign out</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar"><Wordmark /><Link to="/search" aria-label="Search" className="icon-btn"><Icon name="search" /></Link></header>
        {user.verificationStatus !== 'verified' && <VerifyBanner user={user} />}
        {children}
      </main>

      <aside className="rail-right"><Suggestions /><PrivacyNote /></aside>

      <nav className="tabbar" aria-label="Main">
        {items.slice(0, 5).map((i) => (
          <NavLink key={i.to} to={i.to} end={'end' in i && i.end} className="tab">
            <Icon name={i.icon} size={22} /><span>{i.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function VerifyBanner({ user }: { user: User }) {
  const text = {
    unverified: 'Verify your credentials to post Medclips and opportunities and to earn the verified badge.',
    pending: 'Your credentials are being reviewed. You will be able to post Medclips and opportunities once approved.',
    rejected: 'Your last verification request was not approved. Upload a clearer document to try again.',
    verified: '',
  }[user.verificationStatus];
  return (
    <div className="banner">
      <Icon name="shield" /> <p>{text}</p>
      {user.verificationStatus !== 'pending' && <Link className="btn btn-primary" to={`/u/${user.id}`}>Get verified</Link>}
    </div>
  );
}

function Suggestions() {
  const q = useQuery({ queryKey: ['suggestions'], queryFn: () => api.get<{ items: User[] }>('/api/users/suggestions'), staleTime: 120_000 });
  if (!q.data?.items.length) return null;
  return (
    <section className="card side-card">
      <h2>People to follow</h2>
      {q.data.items.map((u) => (
        <Link key={u.id} to={`/u/${u.id}`} className="side-person">
          <strong>{u.name} <VerifiedBadge show /></strong>
          <span>{u.headline ?? u.institution ?? ''}</span>
        </Link>
      ))}
    </section>
  );
}

function PrivacyNote() {
  return (
    <section className="side-note">
      <Icon name="shield" size={18} />
      <p>Never post anything that identifies a patient. Remove names, faces, record numbers and dates of birth before you share a case.</p>
    </section>
  );
}
