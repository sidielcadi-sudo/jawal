import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BackHandler } from 'react-native';

/**
 * Mini-navigateur en pile, sans dépendance (l'app est volontairement légère
 * pour cette phase). On passera à Expo Router / React Navigation si l'arbre
 * d'écrans se complexifie.
 */
export type ChildTab = 'cahier' | 'notes' | 'vie' | 'competences' | 'soutien' | 'scolarite';

export type Route =
  | { name: 'home' }
  | { name: 'child'; tab: ChildTab } // enfant = celui sélectionné dans l'état global
  | { name: 'announcements' }
  | { name: 'messages' }
  | { name: 'thread'; conversationId: string; subject?: string }
  | { name: 'placeholder'; title: string; note?: string };

type NavState = {
  route: Route;
  navigate: (r: Route) => void;
  goBack: () => void;
  canGoBack: boolean;
};

const NavContext = createContext<NavState>({
  route: { name: 'home' },
  navigate: () => {},
  goBack: () => {},
  canGoBack: false,
});

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);
  const route = stack[stack.length - 1] ?? { name: 'home' as const };
  const canGoBack = stack.length > 1;

  const navigate = useCallback((r: Route) => setStack((s) => [...s, r]), []);
  const goBack = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

  // Bouton retour matériel Android.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) {
        goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack, goBack]);

  return <NavContext.Provider value={{ route, navigate, goBack, canGoBack }}>{children}</NavContext.Provider>;
}

export const useNav = () => useContext(NavContext);
