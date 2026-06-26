import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getStudentPersonId, loadStudentNotes } from '@/lib/student';

function tone(value: number | null, max: number) {
  if (value === null) return 'text-slate-400';
  return value < max / 2 ? 'text-red-700' : 'text-emerald-700';
}

export default async function StudentNotesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('eleve.notes');
  const session = (await auth())!;

  const notes = await withTenant(session.user.tenantId, async (tx) => {
    const studentId = await getStudentPersonId(tx, session.user.id);
    if (!studentId) return null;
    return loadStudentNotes(tx, studentId);
  });

  if (!notes) return <div className="mx-auto max-w-4xl px-6 py-8 text-sm text-slate-500">{t('empty')}</div>;

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-3xl bg-gradient-to-r from-[#e8edff] to-[#eef0ff] px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
        {notes.generalAverage !== null && (
          <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm">
            {t('general')} :{' '}
            <span
              className={`font-semibold tabular-nums ${notes.generalAverage < 10 ? 'text-red-700' : notes.generalAverage < 14 ? 'text-amber-700' : 'text-emerald-700'}`}
            >
              {notes.generalAverage.toFixed(2)}/20
            </span>
          </span>
        )}
      </header>

      {notes.subjects.length === 0 ? (
        <p className="text-sm text-slate-500">{t('empty')}</p>
      ) : (
        <div className="space-y-4">
          {notes.subjects.map((s) => (
            <section key={s.subjectId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2">
                <h2 className="text-sm font-semibold text-slate-700">{s.label}</h2>
                <span className="text-sm">
                  {t('average')} :{' '}
                  <span className={`font-semibold tabular-nums ${s.avg === null ? 'text-slate-400' : s.avg < 10 ? 'text-red-700' : s.avg < 14 ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {s.avg === null ? '—' : `${s.avg.toFixed(2)}/20`}
                  </span>
                </span>
              </div>
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-2 text-start">{t('evaluation')}</th>
                    <th className="px-2 py-2 text-start">{t('period')}</th>
                    <th className="px-2 py-2 text-end">{t('mark')}</th>
                    <th className="px-4 py-2 text-end">{t('classAvg')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {s.evals.map((e) => (
                    <tr key={e.id}>
                      <td className="px-4 py-2 text-slate-800">
                        {e.label}
                        <span className="ms-1 text-[10px] text-slate-400">
                          {new Date(e.date).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-slate-500">{e.period}</td>
                      <td className="px-2 py-2 text-end font-semibold tabular-nums">
                        {e.value === null ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span className={tone(e.value, e.max)}>
                            {e.value}
                            <span className="text-[10px] font-normal text-slate-400">/{e.max}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-end tabular-nums text-slate-500">
                        {e.classAvg === null ? '—' : `${e.classAvg.toFixed(2)}/${e.max}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
