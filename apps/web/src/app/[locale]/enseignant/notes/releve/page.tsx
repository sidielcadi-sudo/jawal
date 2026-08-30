import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId, teacherTeachesClassSubject } from '@/lib/teacher';
import { loadReleveRows, loadClassSubjects, type ReleveRow } from '@/lib/notes-releve';
import { AppreciationCell } from './appreciation-cell';
import { pickPeriod } from '@/lib/periods';
import { localizedLabel } from '@/lib/localized-name';
import { PeriodButtons } from '@/components/period-buttons';

export default async function RelevePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ class?: string; period?: string; subject?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('enseignant.notes');

  const session = (await auth())!;
  const data = await withTenant(session.user.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, session.user.id);
    const year = await tx.academicYear.findFirst({
      where: { active: true },
      include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    if (!teacherId || !year) return null;

    // Classes du prof (via affectations + EDT).
    const sel = { classId: true, class: { select: { name: true, nameAr: true } } } as const;
    const [a, e] = await Promise.all([
      tx.teacherAssignment.findMany({ where: { teacherId, academicYearId: year.id }, select: sel }),
      tx.timetableEntry.findMany({ where: { teacherId, academicYearId: year.id }, select: sel }),
    ]);
    const classes = [...new Map([...a, ...e].map((x) => [x.classId, localizedLabel(locale, x.class.name, x.class.nameAr)])).entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((x, y) => x.name.localeCompare(y.name));
    const classId = classes.find((c) => c.id === sp.class)?.id ?? classes[0]?.id ?? null;
    if (!classId) return { classes, classId: null, subjects: [], subjectId: null, periods: year.periods, periodId: null, canEdit: false, rows: [] as ReleveRow[] };

    const subjects = await loadClassSubjects(tx, classId, year.id);
    const subjectId = subjects.find((s) => s.subjectId === sp.subject)?.subjectId ?? subjects[0]?.subjectId ?? null;
    const period = pickPeriod(year.periods, sp.period);

    if (!subjectId || !period) {
      return { classes, classId, subjects, subjectId, periods: year.periods, periodId: period?.id ?? null, canEdit: false, rows: [] as ReleveRow[] };
    }

    const canEdit = await teacherTeachesClassSubject(tx, teacherId, classId, subjectId);
    const rows = await loadReleveRows(tx, { classId, subjectId, period });
    return { classes, classId, subjects, subjectId, periods: year.periods, periodId: period.id, canEdit, rows };
  });

  if (!data) return <p className="text-sm text-slate-500">{t('noService')}</p>;
  const { classes, classId, subjects, subjectId, periods, periodId, canEdit, rows } = data;

  return (
    <div>
      <div className="mb-3">
        <PeriodButtons periods={periods} selectedId={periodId} locale={locale} />
      </div>
      <form method="get" className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-slate-700">{t('releve.title')}</span>
        <select name="class" defaultValue={classId ?? ''} className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm">
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="subject" defaultValue={subjectId ?? ''} className="min-w-[18rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm">
          {subjects.map((s) => (
            <option key={s.subjectId} value={s.subjectId}>
              {s.label}
              {s.teacherName ? ` — ${s.teacherName}` : ''}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          {t('apply')}
        </button>
      </form>

      {!canEdit && subjectId && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t('releve.readOnly')}
        </p>
      )}

      {subjectId && periodId ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
              <tr>
                <th className="px-4 py-2 text-start font-semibold">{t('releve.student')}</th>
                <th className="w-16 px-2 py-2 text-center font-semibold" title={t('releve.hAbsFull')}>{t('releve.hAbs')}</th>
                <th className="w-14 px-2 py-2 text-center font-semibold" title={t('releve.retFull')}>{t('releve.ret')}</th>
                <th className="w-16 px-2 py-2 text-center font-semibold">{t('releve.notes')}</th>
                <th className="w-20 px-2 py-2 text-center font-semibold">{t('releve.moy')}</th>
                <th className="w-28 px-3 py-2 text-start font-semibold">{t('releve.eval')}</th>
                <th className="px-4 py-2 text-start font-semibold">{t('releve.appreciation')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.studentId} className="align-top">
                  <td className="px-4 py-2 font-medium text-slate-800">{r.name}</td>
                  <td className="px-2 py-2 text-center tabular-nums text-slate-600">
                    {r.hAbs || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums text-slate-600">
                    {r.ret || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums text-slate-600">
                    {r.totalEvals > 0 ? `${r.notes}/${r.totalEvals}` : '—'}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <MoyBadge moy={r.moy} />
                  </td>
                  <td className="px-3 py-2">
                    <MoyBar moy={r.moy} />
                  </td>
                  <td className="px-4 py-2">
                    <AppreciationCell
                      studentId={r.studentId}
                      classId={classId!}
                      subjectId={subjectId}
                      periodId={periodId}
                      initial={r.appreciation}
                      canEdit={canEdit}
                    />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">
                    {t('releve.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500">{t('noService')}</p>
      )}
    </div>
  );
}

function moyTone(moy: number | null): string {
  if (moy === null) return 'text-slate-300';
  if (moy < 10) return 'text-red-700';
  if (moy < 14) return 'text-amber-700';
  return 'text-emerald-700';
}

function MoyBadge({ moy }: { moy: number | null }) {
  return (
    <span className={`font-semibold tabular-nums ${moyTone(moy)}`}>
      {moy === null ? '—' : moy.toFixed(2)}
    </span>
  );
}

function MoyBar({ moy }: { moy: number | null }) {
  if (moy === null) return <span className="text-slate-300">—</span>;
  const pct = Math.max(0, Math.min(100, (moy / 20) * 100));
  const color = moy < 10 ? 'bg-red-400' : moy < 14 ? 'bg-amber-400' : 'bg-emerald-500';
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100" title={`${moy.toFixed(2)}/20`}>
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
