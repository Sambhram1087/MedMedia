import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Shell } from './components/Shell';
import { Spinner } from './components/ui';
import { AdminPage } from './pages/AdminPage';
import { AuthPage } from './pages/AuthPage';
import { ClipsPage } from './pages/ClipsPage';
import { FeedPage } from './pages/FeedPage';
import { OpportunitiesPage } from './pages/OpportunitiesPage';
import { ProfilePage } from './pages/ProfilePage';
import { SearchPage } from './pages/SearchPage';

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="splash"><Spinner /></div>;
  if (!user) return <AuthPage />;
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<FeedPage />} />
        <Route path="/clips" element={<ClipsPage />} />
        <Route path="/opportunities" element={<OpportunitiesPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/u/:id" element={<ProfilePage />} />
        {user.isAdmin && <Route path="/admin" element={<AdminPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
