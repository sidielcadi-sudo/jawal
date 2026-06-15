import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { TeacherSession } from '@/lib/lesson-book';
import type { AppelWeekSession } from '@/lib/teacher-attendance';
import { TeacherWeekShell } from '../_shared/teacher-week-shell';

/** Cadre du module Appel enseignant (vert = fait, rose = à faire). */
export async function AppelFrame({
  locale,
  monday,
  days,
  sessions,
  activeKey,
  children,
}: {
  locale: string;
  monday: string;
  days: { date: string; dow: string }[];
  sessions: AppelWeekSession[];
  activeKey?: string;
  children: ReactNode;
}) {
  const t = await getTranslations('enseignant.appel');
  // L'état d'appel (`done`) est porté par le champ `filled` attendu par la grille.
  const gridSessions: TeacherSession[] = sessions.map((s) => ({
    entryId: s.entryId,
    date: s.date,
    dow: s.dow as TeacherSession['dow'],
    slotStart: s.slotStart,
    slotEnd: s.slotEnd,
    subject: s.subject,
    className: s.className,
    room: s.room,
    filled: s.done,
  }));

  return (
    <TeacherWeekShell
      base={`/${locale}/enseignant/appel`}
      title={t('title')}
      subtitle={t('subtitle')}
      navLabels={{ prev: t('prevWeek'), current: t('thisWeek'), next: t('nextWeek') }}
      emptyLabel={t('emptyWeek')}
      locale={locale}
      monday={monday}
      days={days}
      sessions={gridSessions}
      variant="appel"
      activeKey={activeKey}
    >
      {children}
    </TeacherWeekShell>
  );
}
