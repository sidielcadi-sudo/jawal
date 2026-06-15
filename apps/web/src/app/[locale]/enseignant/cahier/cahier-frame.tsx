import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { TeacherSession } from '@/lib/lesson-book';
import { TeacherWeekShell } from '../_shared/teacher-week-shell';

type Day = { date: string; dow: string };

/** Cadre du cahier de texte enseignant (délègue au shell hebdomadaire commun). */
export async function CahierFrame({
  locale,
  monday,
  days,
  sessions,
  activeKey,
  banner,
  children,
}: {
  locale: string;
  monday: string;
  days: Day[];
  sessions: TeacherSession[];
  activeKey?: string;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const t = await getTranslations('enseignant.cahier');
  return (
    <TeacherWeekShell
      base={`/${locale}/enseignant/cahier`}
      title={t('title')}
      subtitle={t('subtitle')}
      navLabels={{ prev: t('prevWeek'), current: t('thisWeek'), next: t('nextWeek') }}
      emptyLabel={t('emptyWeek')}
      locale={locale}
      monday={monday}
      days={days}
      sessions={sessions}
      variant="lesson"
      activeKey={activeKey}
      banner={banner}
    >
      {children}
    </TeacherWeekShell>
  );
}
