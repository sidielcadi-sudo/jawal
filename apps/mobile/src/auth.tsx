import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, type MobileRole } from './api';
import { registerForPush, unregisterPush } from './push';

const TOKEN_KEY = 'jawal_parent_token';
const ROLE_KEY = 'jawal_role';

type AuthState = {
  token: string | null;
  /** Espace ouvert par le compte : parent ou enseignant. */
  role: MobileRole;
  loading: boolean;
  login: (tenantSlug: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  token: null,
  role: 'parent',
  loading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  // Par défaut 'parent' : c'est ce que valent les sessions ouvertes avant
  // l'arrivée de l'espace enseignant, qu'on ne veut pas déconnecter.
  const [role, setRole] = useState<MobileRole>('parent');
  const [loading, setLoading] = useState(true);

  // Restaure le token stocké au démarrage.
  useEffect(() => {
    Promise.all([SecureStore.getItemAsync(TOKEN_KEY), SecureStore.getItemAsync(ROLE_KEY)])
      .then(([t, r]) => {
        setToken(t);
        setRole(r === 'teacher' ? 'teacher' : 'parent');
      })
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
    await SecureStore.setItemAsync(ROLE_KEY, res.user.role);
    setRole(res.user.role);
    setToken(res.token);
  }, []);

  const logout = useCallback(async () => {
    if (token) await unregisterPush(token).catch(() => {});
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(ROLE_KEY).catch(() => {});
    setToken(null);
    setRole('parent');
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, role, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
