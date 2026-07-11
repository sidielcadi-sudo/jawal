import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api } from './api';
import { registerForPush, unregisterPush } from './push';

const TOKEN_KEY = 'jawal_parent_token';

type AuthState = {
  token: string | null;
  loading: boolean;
  login: (tenantSlug: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  token: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Restaure le token stocké au démarrage.
  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY)
      .then((t) => setToken(t))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  // Enregistre l'appareil pour le push dès qu'un token est disponible.
  useEffect(() => {
    if (token) registerForPush(token);
  }, [token]);

  const login = useCallback(async (tenantSlug: string, email: string, password: string) => {
    const res = await api.login(tenantSlug, email, password);
    await SecureStore.setItemAsync(TOKEN_KEY, res.token);
    setToken(res.token);
  }, []);

  const logout = useCallback(async () => {
    if (token) await unregisterPush(token).catch(() => {});
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
  }, [token]);

  return <AuthContext.Provider value={{ token, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
