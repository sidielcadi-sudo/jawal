import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { can } from '@/lib/auth/rbac';
import { loadStudentCarnet } from '@/lib/carnet';
import { CarnetView } from '@/components/carnet/carnet-view';
import { CarnetFilters } from '@/components/carnet/carnet-filters';

// Types saisissables par la Vie scolaire (discipline.write). Gravité déduite
// par le tableau de bord : Remarque = Léger, Avertissement = Moyen, Exclusion = Grave.
const ALL_TYPES = ['OBSERVATION', 'ENCOURAGEMENT', 'DEFAUT_CARNET', 'REMARQUE_DISCIPLINAIRE', 'AVERTISSEMENT', 'EXCLUSION'];

export default async function AdminCarnetPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ class?: string; student?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('carnet');
  const session = (await auth())!;
  const canWrite = await can('discipline.write');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
    if (!year) return null;
    const classList = await tx.class.findMany({
      where: { academicYearId: year.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const classId = classList.find((c) => c.id === sp.class)?.id ?? classList[0]?.id ?? null;
    if (!classId) return { classList, students: [], classId, studentId: null, carnet: null };

    const scs = await tx.studentClass.findMany({
      // Élèves actifs uniquement. `unenrolledAt` ne suffit pas : le dossier
      // peut avoir été radié (WITHDRAWN) ou clôturé (GRADUATED) alors que
      // l'affectation de classe est restée ouverte. On exclut donc aussi les
      // élèves dont le dossier de l'année en cours n'est plus actif.
      where: {
        classId,
        unenrolledAt: null,
        student: {
          deletedAt: null,
          enrollments: {
            none: {
              academicYearId: year.id,
              status: { in: ['WITHDRAWN', 'GRADUATED'] },
            },
          },
        },
      },
      include: { student: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { student: { lastName: 'asc' } },
    });
    const students = scs.map((s) => ({
      id: s.student.id,
      name: `${s.student.lastName} ${s.student.firstName}`,
    }));
    const studentId = students.find((s) => s.id === sp.student)?.id ?? students[0]?.id ?? null;
    const carnet = studentId ? await loadStudentCarnet(tx, studentId) : null;
    return { classList, students, classId, studentId, carnet };
  });

  if (!data) return <div className="text-sm text-slate-500">{t('noAccess')}</div>;
  const { classList, students, classId, studentId, carnet } = data;

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
      </header>

      <CarnetFilters
        classes={classList}
        students={students}
        classId={classId}
        studentId={studentId}
      />

      <div className="mt-6">
        {studentId && carnet ? (
          <CarnetView
            studentId={studentId}
            entries={carnet.entries.map((e) => ({
              id: e.id,
              type: e.type,
              content: e.content,
              occurredAt: e.occurredAt.toISOString(),
              authorName: e.authorName,
              authorRole: e.authorRole,
              className: e.className,
              subjectLabel: e.subjectLabel,
            }))}
            events={carnet.events.map((ev) => ({
              id: ev.id,
              date: ev.date.toISOString(),
              category: ev.category,
              className: ev.className,
              justifStatus: ev.justifStatus,
            }))}
            allowedTypes={canWrite ? ALL_TYPES : []}
            canDelete={canWrite}
            locale={locale}
          />
        ) : (
          <p className="text-sm text-slate-500">{t('noStudent')}</p>
        )}
      </div>
    </div>
  );
}
