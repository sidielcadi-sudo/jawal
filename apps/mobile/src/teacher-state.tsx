import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, type TeacherMe } from './api';
import { useAuth } from './auth';

/**
 * État global de l'espace enseignant : identité du prof, ses services
 * (classe × matière) et les compteurs de l'accueil. Pendant du `app-state`
 * parent, dont il partage la forme — c'est ce qui permet à l'en-tête et au
 * menu latéral de servir les deux espaces sans se dédoubler.
 */
type TeacherState = {
  me: TeacherMe | null;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  menuOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
};

const Ctx = createContext<TeacherState | null>(null);

export function TeacherStateProvider({ children }: { children: React.ReactNode }) {
  const { token, logout } = useAuth();
  const [me, setMe] = useState<TeacherMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    setError('');
    try {
      setMe(await api.teacherMe(token));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return logout();
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo<TeacherState>(
    () => ({
      me,
      loading,
      error,
      reload,
      menuOpen,
      openMenu: () => setMenuOpen(true),
      closeMenu: () => setMenuOpen(false),
    }),
    [me, loading, error, reload, menuOpen],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTeacherState() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTeacherState hors TeacherStateProvider');
  return v;
}
