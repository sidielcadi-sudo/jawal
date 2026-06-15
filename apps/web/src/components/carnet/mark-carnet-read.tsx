'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { markCarnetReadAction } from './parent-actions';

/**
 * Marque le carnet de l'enfant comme lu au montage (la vue parent a été
 * réellement affichée). Rafraîchit pour refléter « Vu le » / vider le badge.
 */
export function MarkCarnetRead({ childId, hasUnread }: { childId: string; hasUnread: boolean }) {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !hasUnread) return;
    done.current = true;
    markCarnetReadAction(childId).then((r) => {
      if (r.ok) router.refresh();
    });
  }, [childId, hasUnread, router]);
  return null;
}
