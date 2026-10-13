import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useCallback, useContext, useMemo } from 'react';
import { api, ApiError } from './api';
import type { User } from './types';

interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: Record<string, unknown>) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
}

const Ctx = createContext<AuthValue>(null as never);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        return (await api.get<{ user: User }>('/api/auth/me')).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
  });

  const setUser = useCallback((u: User) => qc.setQueryData(['me'], u), [qc]);

  const value = useMemo<AuthValue>(
    () => ({
      user: me.data ?? null,
      loading: me.isLoading,
      setUser,
      refresh: async () => void (await qc.invalidateQueries({ queryKey: ['me'] })),
      login: async (email, password) => {
        const r = await api.post<{ user: User }>('/api/auth/login', { email, password });
        qc.clear();
        qc.setQueryData(['me'], r.user);
      },
      register: async (data) => {
        const r = await api.post<{ user: User }>('/api/auth/register', data);
        qc.clear();
        qc.setQueryData(['me'], r.user);
      },
      logout: async () => {
        await api.post('/api/auth/logout');
        qc.clear();
        qc.setQueryData(['me'], null);
      },
    }),
    [me.data, me.isLoading, qc, setUser],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
