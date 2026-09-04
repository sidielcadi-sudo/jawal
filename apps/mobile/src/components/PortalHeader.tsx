import React from 'react';
import { useAuth } from '../auth';
import { AppHeader } from './AppHeader';
import { TeacherHeader } from './TeacherHeader';

/**
 * En-tête des écrans partagés par les deux espaces (messagerie, écrans
 * d'attente).
 *
 * `AppHeader` lit l'état parent et `TeacherHeader` l'état enseignant : monter
 * le mauvais dans un espace fait planter l'écran (« hors AppStateProvider »).
 * Ce composant choisit d'après le rôle scellé dans le jeton.
 */
export function PortalHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const { role } = useAuth();
  return role === 'teacher' ? (
    <TeacherHeader title={title} right={right} />
  ) : (
    <AppHeader title={title} right={right} />
  );
}
