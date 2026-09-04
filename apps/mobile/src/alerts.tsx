import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, type StaffAlert } from './api';
import { useAuth } from './auth';

/**
 * Alertes in-app de la cloche — mêmes `StaffAlert` que les portails web.
 *
 * Elles sont rattachées à un utilisateur, pas à un rôle : le même état sert
 * l'espace parent et l'espace enseignant, d'où un fournisseur unique monté
 * au-dessus des deux plutôt qu'un dans chaque état d'espace.
 */
type AlertsState = {
  alerts: StaffAlert[];
  unread: number;
  reload: () => Promise<void>;
  markRead: (id?: string) => Promise<void>;
};

const Ctx = createContext<AlertsState | null>(null);

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [alerts, setAlerts] = useState<StaffAlert[]>([]);
  const [unread, setUnread] = useState(0);

  // Les alertes sont accessoires : leur échec ne doit ni bloquer un écran ni
  // déconnecter (contrairement au chargement du profil).
  const reload = useCallback(async () => {
    if (!token) return;
    try {
      const d = await api.alerts(token);
      setAlerts(d.items);
      setUnread(d.unread);
    } catch {
      /* cloche indisponible : on garde l'état précédent */
    }
  }, [token]);

  const markRead = useCallback(
    async (id?: string) => {
      if (!token) return;
      // Mise à jour optimiste : la pastille tombe tout de suite.
      setAlerts((as) => as.map((a) => (!id || a.id === id ? { ...a, read: true } : a)));
      setUnread((n) => (id ? Math.max(0, n - 1) : 0));
      try {
        await api.readAlerts(token, id);
      } catch {
        await reload();
      }
    },
    [token, reload],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo<AlertsState>(
    () => ({ alerts, unread, reload, markRead }),
    [alerts, unread, reload, markRead],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAlerts() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAlerts hors AlertsProvider');
  return v;
}
