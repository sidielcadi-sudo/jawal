import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getStudentPersonId, getStudentClassRef, getStudentAnnouncements } from '@/lib/student';

const AUDIENCE_TONE: Record<string, string> = {
  ALL: 'bg-slate-100 text-slate-600',
  CLASS: 'bg-blue-100 text-blue-700',
  LEVEL: 'bg-violet-100 text-violet-700',
};

export default async function StudentAnnouncementsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('eleve.announcements');

  const announcements = await withTenant(session.user.tenantId, async (tx) => {
    const studentId = await getStudentPersonId(tx, session.user.id);
    if (!studentId) return [];
    const ref = await getStudentClassRef(tx, studentId);
    return getStudentAnnouncements(tx, ref?.classId ?? null, ref?.levelId ?? null, 100);
  });

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-100 to-brand-50 shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
      </header>

      {announcements.length === 0 ? (
        <p className="text-sm text-slate-500">{t('empty')}</p>
      ) : (
        <ul className="space-y-3">
          {announcements.map((a) => (
            <li key={a.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold text-slate-900">{a.title}</h2>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium uppercase ${AUDIENCE_TONE[a.audience] ?? 'bg-slate-100 text-slate-600'}`}
                >
                  {t(`audiences.${a.audience}`)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{a.body}</p>
              <div className="mt-3 text-[11px] text-slate-400">
                {a.publishedAt ? new Date(a.publishedAt).toLocaleDateString(locale, { dateStyle: 'long' }) : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
