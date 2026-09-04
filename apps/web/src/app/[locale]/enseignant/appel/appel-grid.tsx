'use client';

import type { AppelRow } from '@/lib/teacher-attendance';
import { AppelSheet, type AppelSubmitRecord } from '@/components/appel-sheet';
import { saveTeacherAppelAction, reopenTeacherAppelAction } from './actions';

type Reason = { id: string; label: string; color: string | null };

/**
 * Feuille d'appel du professeur — enveloppe de `AppelSheet`, qui porte tout
 * l'écran. Seule la manière d'enregistrer est propre au portail prof : la
 * séance est désignée par sa case d'EDT et sa date.
 */
export function AppelGrid({
  locale,
  entryId,
  date,
  sessionId,
  isFinalized,
  className,
  subject,
  room,
  slotStart,
  slotEnd,
  rows,
  reasons,
}: {
  locale: string;
  entryId: string;
  date: string;
  sessionId: string | null;
  isFinalized: boolean;
  className: string;
  subject: string | null;
  room: string | null;
  slotStart: string;
  slotEnd: string;
  rows: AppelRow[];
  reasons: Reason[];
}) {
  async function save(records: AppelSubmitRecord[], finalize: boolean) {
    const fd = new FormData();
    fd.set('payload', JSON.stringify({ entryId, date, finalize, records }));
    return saveTeacherAppelAction(fd);
  }

  return (
    <AppelSheet
      locale={locale}
      date={date}
      isFinalized={isFinalized}
      className={className}
      subject={subject}
      room={room}
      slotStart={slotStart}
      slotEnd={slotEnd}
      rows={rows}
      reasons={reasons}
      onSave={save}
      onReopen={sessionId ? () => reopenTeacherAppelAction(sessionId, entryId) : undefined}
    />
  );
}
