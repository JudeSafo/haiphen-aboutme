import { createContext, useContext } from 'react';

export type User = {
  user_login: string;
  name?: string | null;
  email?: string | null;
  avatar?: string | null;
  plan?: string;
};

export type AuthState = {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

export const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: async () => {},
  refresh: async () => {},
});

export const useAuth = () => useContext(AuthContext);
