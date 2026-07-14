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

const BRAND = '#1A56DB';
const TYPE_TONE: Record<string, string> = {
  ENCOURAGEMENT: 'bg-emerald-100 text-emerald-700',
  FELICITATION: 'bg-emerald-100 text-emerald-700',
  OBSERVATION: 'bg-blue-100 text-blue-700',
};

function avgColor(avg: number | null): string {
  if (avg === null) return '#cbd5e1';
  return avg < 10 ? '#dc2626' : avg < 14 ? '#d97706' : BRAND;
}

/** Anneau de progression (conic-gradient) avec une valeur au centre. */
function Donut({
  pct,
  color,
  center,
  label,
}: {
  pct: number;
  color: string;
  center: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="grid h-[88px] w-[88px] place-items-center rounded-full"
        style={{ background: `conic-gradient(${color} ${Math.max(0, Math.min(100, pct)) * 3.6}deg, #e6e9f5 0deg)` }}
      >
        <div className="grid h-16 w-16 place-items-center rounded-full bg-white text-sm font-bold text-slate-800">
          {center}
        </div>
      </div>
      <span className="max-w-[88px] text-center text-[11px] leading-tight text-slate-500">{label}</span>
    </div>
  );
}

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

  if (!dash)
    return <div className="px-6 py-8 text-sm text-slate-500">{t('noProfile')}</div>;

  const avg = dash.generalAverage;
  const rate = dash.attendanceRate;

  return (
    <div className="px-3 py-3">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Colonne principale */}
        <div className="space-y-4 xl:col-span-2">
          {/* Hero */}
          <section className="flex items-center justify-between gap-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-100 to-brand-50 shadow-sm p-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {t('home.hello', { name: dash.firstName })}
              </h1>
              <p className="mt-1 text-sm text-slate-600">{dash.className ?? t('home.noClass')}</p>
              <div className="mt-3 flex gap-2">
                <Link
                  href={`/${locale}/eleve/notes`}
                  className="rounded-full bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                >
                  {t('nav.notes')}
                </Link>
                <Link
                  href={`/${locale}/eleve/timetable`}
                  className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {t('nav.timetable')}
                </Link>
              </div>
            </div>
            <div className="grid h-28 w-40 shrink-0 place-items-center rounded-2xl bg-white/50 text-5xl">
              🎓
            </div>
          </section>

          {/* Progression (donuts) */}
          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-800">{t('home.progress')}</h2>
            <div className="grid grid-cols-3 gap-y-6 sm:grid-cols-4">
              <Donut
                pct={avg === null ? 0 : (avg / 20) * 100}
                color={avgColor(avg)}
                center={avg === null ? '—' : avg.toFixed(1)}
                label={t('home.generalAverage')}
              />
              <Donut
                pct={rate ?? 0}
                color={rate === null ? '#cbd5e1' : rate < 90 ? '#d97706' : '#059669'}
                center={rate === null ? '—' : `${Math.round(rate)}%`}
                label={t('home.attendanceRate')}
              />
              {dash.subjects
                .filter((s) => s.avg !== null)
                .map((s) => (
                  <Donut
                    key={s.label}
                    pct={(s.avg! / 20) * 100}
                    color={avgColor(s.avg)}
                    center={s.avg!.toFixed(1)}
                    label={s.label}
                  />
                ))}
            </div>
          </section>
        </div>

        {/* Colonne droite */}
        <div className="space-y-4">
          {/* Carnet récent */}
          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">{t('home.recentCarnet')}</h2>
              <Link href={`/${locale}/eleve/carnet`} className="text-xs font-medium text-brand-600 hover:underline">
                {t('home.seeAll')}
                {dash.carnetUnread > 0 ? ` (${dash.carnetUnread})` : ''}
              </Link>
            </div>
            {dash.recentCarnet.length === 0 ? (
              <p className="text-xs text-slate-400">{t('home.carnetEmpty')}</p>
            ) : (
              <ul className="space-y-2">
                {dash.recentCarnet.map((c) => (
                  <li key={c.id} className="rounded-2xl border border-slate-100 p-3">
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                          TYPE_TONE[c.type] ?? 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {t(`carnet.type.${c.type}`)}
                      </span>
                      {new Date(c.occurredAt).toLocaleDateString(locale)} · {c.authorName}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{c.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Absences récentes */}
          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-800">{t('home.recentAbsences')}</h2>
            {dash.recentAbsences.length === 0 ? (
              <p className="text-xs text-emerald-700">{t('home.noAbsence')}</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {dash.recentAbsences.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2"
                  >
                    <span className="text-slate-700">
                      {new Date(a.date).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} ·{' '}
                      <span className="text-slate-400">{a.className}</span>
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
      </div>
    </div>
  );
}
