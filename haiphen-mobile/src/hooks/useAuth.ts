import { useState, useCallback, useEffect } from 'react';
import { getToken, setToken, clearToken } from '../api/client';
import { fetchMe } from '../api/services';
import type { User, AuthState } from '../store/auth';

export function useAuthProvider(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    const res = await fetchMe();
    if (res.ok && res.data) {
      setUser(res.data);
    } else {
      await clearToken();
      setUser(null);
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (token: string) => {
    await setToken(token);
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await clearToken();
    setUser(null);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    refresh,
  };
}
