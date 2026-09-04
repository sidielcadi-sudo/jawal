import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { getTeacherAnnouncements } from '@/lib/teacher-announcements';

const AUDIENCE_TONE: Record<string, string> = {
  ALL: 'bg-slate-100 text-slate-600',
  TEACHERS: 'bg-brand-50 text-brand-700',
  STAFF: 'bg-amber-100 text-amber-800',
  CLASS: 'bg-blue-100 text-blue-700',
  LEVEL: 'bg-violet-100 text-violet-700',
};

/** Annonces dont l'enseignant est destinataire (établissement, profs, ses classes). */
export default async function TeacherAnnouncementsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('enseignant.announcements');

  const announcements = await withTenant(session.user.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, session.user.id);
    if (!teacherId) return [];
    return getTeacherAnnouncements(tx, teacherId, { limit: 100 });
  });

  return (
    <div className="px-3 py-3">
      <header className="mb-4 -mx-3 overflow-hidden rounded-2xl border border-brand-200 title-band px-4 py-2.5 shadow-sm">
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
                  className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium uppercase ${
                    AUDIENCE_TONE[a.audience] ?? 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {t(`audiences.${a.audience}`)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{a.body}</p>
              <div className="mt-3 text-[11px] text-slate-400">
                {a.publishedAt
                  ? new Date(a.publishedAt).toLocaleDateString(locale, { dateStyle: 'long' })
                  : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
