import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { can } from '@/lib/auth/rbac';
import { loadStudentCarnet } from '@/lib/carnet';
import { searchCarnetEvents } from '@/lib/carnet-search';
import { CarnetView } from '@/components/carnet/carnet-view';
import { CarnetFilters } from '@/components/carnet/carnet-filters';
import { CarnetEventsTable } from '@/components/carnet/carnet-events-table';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';

// Types saisissables par la Vie scolaire (discipline.write). Gravité déduite
// par le tableau de bord : Remarque = Léger, Avertissement = Moyen, Exclusion = Grave.
const ALL_TYPES = ['OBSERVATION', 'ENCOURAGEMENT', 'DEFAUT_CARNET', 'REMARQUE_DISCIPLINAIRE', 'AVERTISSEMENT', 'EXCLUSION'];

/** `YYYY-MM-DD` → Date UTC, ou null si la saisie est vide ou invalide. */
function parseDay(v: string | undefined): Date | null {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function AdminCarnetPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    level?: string;
    class?: string;
    student?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('carnet');
  const session = (await auth())!;
  const canWrite = await can('discipline.write');

  const from = parseDay(sp.from);
  // Borne haute incluse : on la pousse en fin de journée.
  const toRaw = parseDay(sp.to);
  const to = toRaw ? new Date(toRaw.getTime() + 86_399_999) : null;

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
    if (!year) return null;

    const [levelRows, classRows] = await Promise.all([
      tx.level.findMany({
        orderBy: [{ cycle: { order: 'asc' } }, { order: 'asc' }],
        select: { id: true, label: true, labelAr: true },
      }),
      tx.class.findMany({
        where: { academicYearId: year.id, deletedAt: null },
        select: { id: true, name: true, nameAr: true, levelId: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const levelId = levelRows.find((l) => l.id === sp.level)?.id ?? null;
    const visibleClasses = levelId ? classRows.filter((c) => c.levelId === levelId) : classRows;
    const classId = visibleClasses.find((c) => c.id === sp.class)?.id ?? null;

    // Élèves proposés : ceux de la classe choisie, sinon ceux du niveau.
    const scs = await tx.studentClass.findMany({
      // Élèves actifs uniquement. `unenrolledAt` ne suffit pas : le dossier
      // peut avoir été radié (WITHDRAWN) ou clôturé (GRADUATED) alors que
      // l'affectation de classe est restée ouverte.
      where: {
        unenrolledAt: null,
        ...(classId
          ? { classId }
          : levelId
            ? { class: { levelId, deletedAt: null, academicYearId: year.id } }
            : { class: { academicYearId: year.id, deletedAt: null } }),
        student: {
          deletedAt: null,
          enrollments: {
            none: { academicYearId: year.id, status: { in: ['WITHDRAWN', 'GRADUATED'] } },
          },
        },
      },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true },
        },
      },
      orderBy: { student: { lastName: 'asc' } },
    });
    const students = scs.map((s) => ({
      id: s.student.id,
      name: personDisplayName(locale, s.student),
    }));
    const studentId = students.find((s) => s.id === sp.student)?.id ?? null;

    // Le carnet détaillé (entrées saisies) n'a de sens que pour un élève donné.
    const carnet = studentId ? await loadStudentCarnet(tx, studentId) : null;
    const events = await searchCarnetEvents(tx, { levelId, classId, studentId, from, to });

    return {
      levels: levelRows.map((l) => ({ id: l.id, name: localizedLabel(locale, l.label, l.labelAr) })),
      classes: visibleClasses.map((c) => ({
        id: c.id,
        name: localizedLabel(locale, c.name, c.nameAr),
      })),
      students,
      levelId,
      classId,
      studentId,
      carnet,
      events,
    };
  });

  if (!data) return <div className="text-sm text-slate-500">{t('noAccess')}</div>;
  const { levels, classes, students, levelId, classId, studentId, carnet, events } = data;

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
      </header>

      <CarnetFilters
        levels={levels}
        classes={classes}
        students={students}
        levelId={levelId}
        classId={classId}
        studentId={studentId}
        from={sp.from ?? ''}
        to={sp.to ?? ''}
      />

      <div className="mt-6 space-y-6">
        {/* Recherche d'événements : elle vaut pour toute la portée choisie,
            y compris sans élève sélectionné. */}
        <CarnetEventsTable
          events={events.map((ev) => ({
            id: ev.id,
            date: ev.date.toISOString(),
            category: ev.category,
            className: ev.className,
            justifStatus: ev.justifStatus,
            periodLabel: ev.periodLabel,
            subjectLabel: ev.subjectLabel,
            teacherName: ev.teacherName,
            studentName: ev.studentName,
          }))}
          locale={locale}
          showStudent={!studentId}
        />

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
            allowedTypes={canWrite ? ALL_TYPES : []}
            canDelete={canWrite}
            locale={locale}
          />
        ) : (
          <p className="text-sm text-slate-500">{t('pickStudentForEntries')}</p>
        )}
      </div>
    </div>
  );
}
