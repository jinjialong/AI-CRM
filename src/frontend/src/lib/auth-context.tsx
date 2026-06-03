'use client';

import { createContext, useContext, useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { UserInfo } from '@/types';

type AuthContextValue = {
  user: UserInfo | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = window.localStorage.getItem('access_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<UserInfo>('/auth/me')
      .then((result) => setUser(result))
      .catch(() => {
        window.localStorage.removeItem('access_token');
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (loginName: string, password: string) => {
    const result = await api.post<{ access_token: string; user: UserInfo }>('/auth/login', {
      login: loginName,
      password,
    });
    window.localStorage.setItem('access_token', result.access_token);
    setUser(result.user);
  };

  const logout = () => {
    window.localStorage.removeItem('access_token');
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

