import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { mondayOf } from '@/lib/lesson-book';
import { getTeacherWeekAppel, type AppelWeekSession } from '@/lib/teacher-attendance';
import { AppelFrame } from './appel-frame';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function TeacherAppelPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('enseignant.appel');

  const monday = mondayOf(sp.week && ISO_DATE.test(sp.week) ? sp.week : undefined);

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, session.user.id);
    if (!teacherId) return { days: [], sessions: [] as AppelWeekSession[] };
    return getTeacherWeekAppel(tx, teacherId, monday);
  });

  return (
    <AppelFrame locale={locale} monday={monday} days={data.days} sessions={data.sessions}>
      <div className="flex h-full min-h-[18rem] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center">
        <p className="text-sm text-slate-500">{t('selectSession')}</p>
      </div>
    </AppelFrame>
  );
}
