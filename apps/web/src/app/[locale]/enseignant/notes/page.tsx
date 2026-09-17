import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { SaisieGrid } from './saisie-grid';
import { ServiceSelect } from './service-select';
import { pickPeriodId } from '@/lib/periods';
import { localizedLabel } from '@/lib/localized-name';
import { PeriodPicker } from '@/components/period-picker';

export default async function NotesSaisiePage({
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

    // Services du prof : couples (classe × matière) via affectations + EDT.
    const select = {
      classId: true,
      subjectId: true,
      subject: { select: { label: true, labelAr: true } },
      class: { select: { name: true, nameAr: true, levelId: true } },
    } as const;
    const [assignments, entries] = await Promise.all([
      tx.teacherAssignment.findMany({ where: { teacherId, academicYearId: year.id }, select }),
      tx.timetableEntry.findMany({ where: { teacherId, academicYearId: year.id }, select }),
    ]);
    const services = new Map<
      string,
      { classId: string; className: string; levelId: string; subjectId: string; subjectLabel: string }
    >();
    for (const a of [...assignments, ...entries]) {
      if (!a.subjectId) continue;
      const key = `${a.classId}|${a.subjectId}`;
      if (!services.has(key))
        services.set(key, {
          classId: a.classId,
          className: localizedLabel(locale, a.class.name, a.class.nameAr),
          levelId: a.class.levelId,
          subjectId: a.subjectId,
          subjectLabel: a.subject?.label ?? '—',
        });
    }
    const allSvc = [...services.values()].sort(
      (a, b) => a.className.localeCompare(b.className) || a.subjectLabel.localeCompare(b.subjectLabel),
    );

    const periodId = pickPeriodId(year.periods, sp.period);

    // Une période rattachée à une session d'examen (« Évaluation diagnostique
    // 2AC ») ne concerne que les niveaux et les matières de cette session :
    // proposer toutes les classes du professeur menait à des carnets vides.
    const sessions = periodId
      ? await tx.examSession.findMany({
          where: { academicYearId: year.id, periodId },
          select: { label: true, levelId: true, papers: { select: { subjectId: true } } },
        })
      : [];
    const levelIds = new Set(sessions.map((s) => s.levelId));
    const subjectIds = new Set(sessions.flatMap((s) => s.papers.map((p) => p.subjectId)));
    const svc =
      sessions.length > 0
        ? allSvc.filter((s) => levelIds.has(s.levelId) && (subjectIds.size === 0 || subjectIds.has(s.subjectId)))
        : allSvc;

    // Sélection courante, dans le périmètre de la période.
    const classId = svc.find((s) => s.classId === sp.class)?.classId ?? svc[0]?.classId ?? null;
    const subjectsForClass = svc.filter((s) => s.classId === classId);
    const subjectId =
      subjectsForClass.find((s) => s.subjectId === sp.subject)?.subjectId ??
      subjectsForClass[0]?.subjectId ??
      null;
    const scope = sessions.length > 0 ? sessions.map((s) => s.label).join(', ') : null;

    if (!classId || !subjectId || !periodId) {
      return { svc, periods: year.periods, classId, subjectId, periodId, scope, grid: null };
    }

    const students = await tx.studentClass.findMany({
      where: { classId, unenrolledAt: null },
      include: { student: { select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } } },
      orderBy: { student: { lastName: 'asc' } },
    });
    const devoirs = await tx.evaluation.findMany({
      where: { classId, subjectId, periodId },
      orderBy: { date: 'desc' },
      include: { grades: { select: { studentId: true, value: true } } },
    });

    return {
      svc,
      periods: year.periods,
      classId,
      subjectId,
      periodId,
      scope,
      grid: {
        students: students.map((s) => ({
          id: s.student.id,
          firstName: s.student.firstName,
          lastName: s.student.lastName,
          firstNameAr: s.student.firstNameAr,
          lastNameAr: s.student.lastNameAr,
        })),
        devoirs: devoirs.map((d) => ({
          id: d.id,
          label: d.label,
          date: d.date.toISOString().slice(0, 10),
          maxValue: d.maxValue,
          weight: d.weight,
          optional: d.optional,
          optionalMode: d.optionalMode as 'BONUS' | 'NOTE',
          grades: Object.fromEntries(
            d.grades.map((g) => [g.studentId, g.value] as const),
          ) as Record<string, number | null>,
        })),
      },
    };
  });

  if (!data) {
    return <p className="text-sm text-slate-500">{t('noService')}</p>;
  }

  const { svc, periods, classId, subjectId, periodId, scope, grid } = data;

  return (
    <div>
      {/* Sélecteurs */}
      <div className="mb-3">
        <PeriodPicker periods={periods} selectedId={periodId} locale={locale} />
      </div>
      {scope && (
        <p className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          {t('sessionScope', { session: scope })}
        </p>
      )}
      {/* La clé remonte le composant quand la période change : ses menus
          repartent de la sélection calculée pour la nouvelle période. */}
      <ServiceSelect
        key={`${periodId}|${classId}|${subjectId}`}
        services={svc.map(({ levelId: _l, ...s }) => s)}
        classId={classId}
        subjectId={subjectId}
        title={t('saisieTitle')}
        applyLabel={t('apply')}
      />

      {grid && classId && subjectId && periodId ? (
        <SaisieGrid
          locale={locale}
          classId={classId}
          subjectId={subjectId}
          periodId={periodId}
          students={grid.students}
          devoirs={grid.devoirs}
        />
      ) : (
        <p className="text-sm text-slate-500">{scope ? t('sessionNoService') : t('noService')}</p>
      )}
    </div>
  );
}
