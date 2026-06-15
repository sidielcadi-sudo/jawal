import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getStudentPersonId, loadStudentDashboard } from '@/lib/student';
import type { AttendanceCategory } from '@/lib/attendance-category';

const CAT_TONE: Record<AttendanceCategory, string> = {
  PRESENT: 'bg-emerald-100 text-emerald-700',
  LATE: 'bg-amber-100 text-amber-700',
  INFIRMARY: 'bg-blue-100 text-blue-700',
  PUNISHMENT: 'bg-purple-100 text-purple-700',
  EXCLUSION: 'bg-rose-100 text-rose-700',
  EXCUSED: 'bg-green-100 text-green-700',
  ABSENT: 'bg-red-100 text-red-700',
};

export default async function StudentHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('eleve');
  const session = (await auth())!;

  const dash = await withTenant(session.user.tenantId, async (tx) => {
    const studentId = await getStudentPersonId(tx, session.user.id);
    if (!studentId) return null;
    return loadStudentDashboard(tx, studentId);
  });

  if (!dash) return <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-slate-500">{t('noProfile')}</div>;

  const avgTone =
    dash.generalAverage === null
      ? 'text-slate-400'
      : dash.generalAverage < 10
        ? 'text-red-700'
        : dash.generalAverage < 14
          ? 'text-amber-700'
          : 'text-emerald-700';
  const rateTone =
    dash.attendanceRate === null ? 'text-slate-400' : dash.attendanceRate < 90 ? 'text-amber-700' : 'text-emerald-700';

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          {t('home.hello', { name: dash.firstName })}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">{dash.className ?? t('home.noClass')}</p>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label={t('home.generalAverage')} value={dash.generalAverage === null ? '—' : `${dash.generalAverage.toFixed(2)}/20`} tone={avgTone} />
        <Kpi label={t('home.attendanceRate')} value={dash.attendanceRate === null ? '—' : `${dash.attendanceRate.toFixed(1)}%`} tone={rateTone} />
        <Link href={`/${locale}/eleve/carnet`} className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-brand-300">
          <div className="text-xs text-slate-500">{t('home.carnet')}</div>
          <div className={`mt-1 text-3xl font-bold tabular-nums ${dash.carnetUnread > 0 ? 'text-red-700' : 'text-slate-800'}`}>
            {dash.carnetUnread}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">{t('home.carnetUnread')}</div>
        </Link>
      </div>

      {/* Carnet récent */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">{t('home.recentCarnet')}</h2>
          <Link href={`/${locale}/eleve/carnet`} className="text-xs text-brand-700 hover:underline">
            {t('home.seeAll')}
          </Link>
        </div>
        {dash.recentCarnet.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">{t('home.carnetEmpty')}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {dash.recentCarnet.map((c) => (
              <li key={c.id} className="rounded-xl border border-slate-100 p-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-600">
                    {t(`carnet.type.${c.type}`)}
                  </span>
                  {new Date(c.occurredAt).toLocaleDateString(locale)} · {c.authorName}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{c.content}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Absences récentes */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">{t('home.recentAbsences')}</h2>
        {dash.recentAbsences.length === 0 ? (
          <p className="mt-2 text-xs text-emerald-700">{t('home.noAbsence')}</p>
        ) : (
          <ul className="mt-3 space-y-1.5 text-xs">
            {dash.recentAbsences.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-2 py-1.5">
                <span className="text-slate-700">
                  {new Date(a.date).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} ·{' '}
                  <span className="text-slate-500">{a.className}</span>
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${CAT_TONE[a.cat]}`}>
                  {t(`carnet.eventCat.${a.cat}`)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
