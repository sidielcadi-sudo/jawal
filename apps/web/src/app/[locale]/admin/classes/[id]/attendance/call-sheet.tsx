'use client';

import type { AppelRow } from '@/lib/teacher-attendance';
import { AppelSheet, type AppelSubmitRecord } from '@/components/appel-sheet';
import { reopenSessionAction, saveAdminAppelAction } from './actions';

type Reason = { id: string; label: string; color: string | null };

/**
 * Feuille d'appel du portail admin — enveloppe de `AppelSheet`, exactement le
 * même écran que celui du professeur. Seule la désignation de la séance
 * diffère : ici une classe, une date et le créneau choisi au-dessus.
 */
export function AttendanceCallSheet({
  locale,
  classId,
  date,
  periodLabel,
  sessionId,
  isFinalized,
  className,
  subject,
  teacherName,
  room,
  slotStart,
  slotEnd,
  rows,
  reasons,
}: {
  locale: string;
  classId: string;
  date: string;
  periodLabel: string | null;
  sessionId: string | null;
  isFinalized: boolean;
  className: string;
  subject: string | null;
  teacherName: string | null;
  room: string | null;
  slotStart: string | null;
  slotEnd: string | null;
  rows: AppelRow[];
  reasons: Reason[];
}) {
  async function save(records: AppelSubmitRecord[], finalize: boolean) {
    const fd = new FormData();
    fd.set('payload', JSON.stringify({ classId, date, periodLabel, finalize, records }));
    return saveAdminAppelAction(fd);
  }

  return (
    <AppelSheet
      locale={locale}
      date={date}
      isFinalized={isFinalized}
      className={className}
      subject={subject}
      // Le professeur de la séance figure dans la ligne de contexte : c'est
      // lui que l'administration supplée en faisant l'appel à sa place.
      teacherName={teacherName}
      room={room}
      slotStart={slotStart}
      slotEnd={slotEnd}
      rows={rows}
      reasons={reasons}
      onSave={save}
      onReopen={sessionId ? () => reopenSessionAction(sessionId) : undefined}
    />
  );
}
