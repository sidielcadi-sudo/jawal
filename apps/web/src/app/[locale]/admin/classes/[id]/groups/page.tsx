import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { requireRoleCode } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { ClassNav } from '../class-nav';
import { GroupsClient, type GroupRow, type StudentRow, type SubjectRow } from './client';
import { findUncoveredStudents } from '@/lib/class-groups';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';

/**
 * Groupes d'une classe — le dédoublement.
 *
 * Écran séparé plutôt qu'un bloc de plus sur la fiche de classe : composer des
 * demi-groupes est un travail de saisie à part entière, et la fiche est déjà
 * dense.
 */
export default async function ClassGroupsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ subject?: string }>;
}) {
  const { locale, id } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRoleCode(['tenant_admin', 'direction']);
  const session = (await auth())!;
  const t = await getTranslations('admin.classes.groups');

  /** `''` dans l'URL = les groupes polyvalents (toutes matières). */
  const selectedSubject = sp.subject === undefined ? null : sp.subject || null;

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const cls = await tx.class.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        nameAr: true,
        levelId: true,
        trackId: true,
        deletedAt: true,
        level: { select: { label: true, labelAr: true } },
        academicYear: { select: { label: true } },
        students: {
          where: { unenrolledAt: null },
          select: {
            student: {
              select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true },
            },
          },
          orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
        },
      },
    });
    if (!cls) return null;

    // Matières enseignées à cette classe — les seules pour lesquelles un
    // dédoublement a un sens. Même cascade que le générateur d'emploi du temps :
    // au lycée le programme est porté par la FILIÈRE, pas par le niveau, et
    // CurriculumSubject y est vide. Sans ce repli, l'écran n'aurait proposé
    // aucune matière sur une classe de lycée.
    const [curriculum, groups] = await Promise.all([
      cls.trackId
        ? tx.trackSubjectCoefficient.findMany({
            where: { trackId: cls.trackId },
            select: {
              weeklyHours: true,
              subject: { select: { id: true, label: true, labelAr: true } },
            },
            orderBy: { subject: { label: 'asc' } },
          })
        : tx.curriculumSubject.findMany({
            where: { levelId: cls.levelId },
            select: {
              weeklyHours: true,
              subject: { select: { id: true, label: true, labelAr: true } },
            },
            orderBy: [{ order: 'asc' }, { subject: { label: 'asc' } }],
          }),
      tx.classGroup.findMany({
        where: { classId: id },
        select: {
          id: true,
          name: true,
          nameAr: true,
          subjectId: true,
          splitHours: true,
          teacherId: true,
          subject: { select: { label: true, labelAr: true } },
          members: { select: { studentId: true } },
          _count: { select: { entries: true } },
        },
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
      }),
    ]);

    // Enseignants de l'établissement : le dédoublement demande un second
    // professeur, qui n'est pas forcément déjà affecté à la classe.
    const teachers = await tx.person.findMany({
      where: { type: 'TEACHER', deletedAt: null },
      select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return { cls, curriculum, groups, teachers };
  });

  if (!data?.cls) notFound();
  const { cls, curriculum, groups, teachers } = data;

  const students: StudentRow[] = cls.students.map((sc) => ({
    id: sc.student.id,
    name: personDisplayName(locale, sc.student),
  }));

  const subjects: SubjectRow[] = curriculum.map((c) => ({
    id: c.subject.id,
    label: localizedLabel(locale, c.subject.label, c.subject.labelAr),
    weeklyHours: c.weeklyHours ?? 0,
  }));

  const rows: GroupRow[] = groups
    .filter((g) => g.subjectId === selectedSubject)
    .map((g) => ({
      id: g.id,
      name: g.name,
      memberIds: g.members.map((m) => m.studentId),
      entryCount: g._count.entries,
      splitHours: g.splitHours,
      teacherId: g.teacherId,
    }));

  // Élèves qu'aucun groupe de cette matière ne couvre : sans ce contrôle, un
  // oubli ne se verrait qu'au premier appel — l'élève n'aurait pas cours.
  const uncovered = findUncoveredStudents(
    students.map((s) => s.id),
    groups.map((g) => ({
      id: g.id,
      name: g.name,
      subjectId: g.subjectId,
      memberIds: g.members.map((m) => m.studentId),
    })),
    selectedSubject,
  );

  // Vue d'ensemble : quelles matières sont déjà dédoublées.
  const bySubject = new Map<string | null, number>();
  for (const g of groups) bySubject.set(g.subjectId, (bySubject.get(g.subjectId) ?? 0) + 1);

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-bold text-slate-900">
              {t('title')} — {localizedLabel(locale, cls.name, cls.nameAr)}
            </h1>
            <p className="mt-0.5 text-sm text-slate-600">
              {localizedLabel(locale, cls.level.label, cls.level.labelAr)} ·{' '}
              {cls.academicYear.label} · {t('headcount', { count: students.length })}
            </p>
          </div>
          <ClassNav classId={cls.id} locale={locale} isArchived={!!cls.deletedAt} />
        </div>
      </header>

      <p className="mb-3 max-w-3xl text-xs text-slate-500">{t('intro')}</p>

      {/* Choix de la matière : un groupe de français et un groupe de physique ne
          contiennent pas les mêmes élèves, la composition se fait matière par
          matière. */}
      <nav className="mb-4 flex flex-wrap items-center gap-2">
        <SubjectChip
          href={`?subject=`}
          label={t('allSubjects')}
          active={selectedSubject === null}
          count={bySubject.get(null) ?? 0}
        />
        {subjects.map((s) => (
          <SubjectChip
            key={s.id}
            href={`?subject=${s.id}`}
            label={s.label}
            active={selectedSubject === s.id}
            count={bySubject.get(s.id) ?? 0}
          />
        ))}
      </nav>

      <GroupsClient
        classId={cls.id}
        subjectId={selectedSubject}
        programHours={
          selectedSubject ? (subjects.find((s) => s.id === selectedSubject)?.weeklyHours ?? 0) : 0
        }
        splitHours={rows[0]?.splitHours ?? null}
        subjectLabel={
          selectedSubject ? (subjects.find((s) => s.id === selectedSubject)?.label ?? '') : t('allSubjects')
        }
        students={students}
        groups={rows}
        uncoveredIds={uncovered}
        teachers={teachers.map((t) => ({ id: t.id, label: personDisplayName(locale, t) }))}
      />
    </div>
  );
}

function SubjectChip({
  href,
  label,
  active,
  count,
}: {
  href: string;
  label: string;
  active: boolean;
  count: number;
}) {
  return (
    <a
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {label}
      {count > 0 && (
        <span
          className={`rounded-full px-1.5 text-[11px] tabular-nums ${
            active ? 'bg-white/25' : 'bg-brand-100 text-brand-800'
          }`}
        >
          {count}
        </span>
      )}
    </a>
  );
}
