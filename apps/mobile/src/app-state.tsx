import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, type Child, type Me } from './api';
import { useAuth } from './auth';

/**
 * État global de l'appli parent (façon Pronote) : le compte, la liste des
 * enfants scolarisés, l'enfant actuellement sélectionné (partagé par tous les
 * écrans), et l'ouverture du menu latéral.
 */
type AppState = {
  me: Me | null;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  children: Child[];
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  selectedChild: Child | null;
  menuOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
};

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const { token, logout } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    setError('');
    try {
      const data = await api.me(token);
      setMe(data);
      // Sélectionne le premier enfant par défaut (ou conserve la sélection).
      setSelectedId((cur) => (cur && data.children.some((c) => c.id === cur) ? cur : data.children[0]?.id ?? null));
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

  const value = useMemo<AppState>(() => {
    const kids = me?.children ?? [];
    return {
      me,
      loading,
      error,
      reload,
      children: kids,
      selectedId,
      setSelectedId,
      selectedChild: kids.find((c) => c.id === selectedId) ?? null,
      menuOpen,
      openMenu: () => setMenuOpen(true),
      closeMenu: () => setMenuOpen(false),
    };
  }, [me, loading, error, reload, selectedId, menuOpen]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState hors AppStateProvider');
  return v;
}
