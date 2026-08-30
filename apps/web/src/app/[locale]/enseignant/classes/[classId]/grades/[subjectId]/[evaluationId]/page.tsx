import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId, teacherTeachesClassSubject } from '@/lib/teacher';
import { GradeMatrix } from '@/app/[locale]/admin/classes/[id]/grades/[evaluationId]/grade-matrix';
import { saveTeacherGradesAction } from '../actions';
import { localizedLabel } from '@/lib/localized-name';

export default async function TeacherEvaluationSheetPage({
  params,
}: {
  params: Promise<{ locale: string; classId: string; subjectId: string; evaluationId: string }>;
}) {
  const { locale, classId, subjectId, evaluationId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('enseignant.grades');
  const tSheet = await getTranslations('admin.grades.sheet');
  const session = (await auth())!;

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, session.user.id);
    if (!teacherId) return null;
    if (!(await teacherTeachesClassSubject(tx, teacherId, classId, subjectId))) return null;

    const ev = await tx.evaluation.findUnique({
      where: { id: evaluationId },
      include: { class: { select: { name: true, nameAr: true } }, subject: true, period: true },
    });
    if (!ev || ev.classId !== classId || ev.subjectId !== subjectId) return null;

    const enrollments = await tx.studentClass.findMany({
      where: { classId, unenrolledAt: null },
      include: { student: true },
      orderBy: { student: { lastName: 'asc' } },
    });
    const grades = await tx.grade.findMany({ where: { evaluationId } });
    const byStudent = new Map(grades.map((g) => [g.studentId, g]));

    return {
      ev,
      rows: enrollments.map((sc) => {
        const g = byStudent.get(sc.studentId);
        return {
          studentId: sc.studentId,
          firstName: sc.student.firstName,
          lastName: sc.student.lastName,
          firstNameAr: sc.student.firstNameAr,
          lastNameAr: sc.student.lastNameAr,
          value: g?.value ?? null,
          comment: g?.comment ?? null,
        };
      }),
    };
  });

  if (!data) notFound();
  const { ev, rows } = data;
  const gradesBase = `/${locale}/enseignant/classes/${classId}/grades/${subjectId}`;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={`/${locale}/enseignant/classes`} className="hover:text-brand-700">
          {t('myClasses')}
        </Link>
        <span className="mx-1.5">›</span>
        <Link href={gradesBase} className="hover:text-brand-700">
          {localizedLabel(locale, ev.class.name, ev.class.nameAr)} · {localizedLabel(locale, ev.subject.label, ev.subject.labelAr)}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{ev.label}</span>
      </nav>

      <header className="mb-6">
        <h1 className="mb-4 -mx-6 overflow-hidden rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-3 text-2xl font-semibold text-slate-900">{ev.label}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {localizedLabel(locale, ev.subject.label, ev.subject.labelAr)} · {localizedLabel(locale, ev.period.label, ev.period.labelAr)} · {new Date(ev.date).toLocaleDateString(locale)} ·{' '}
          {tSheet('maxValue')}: <strong>/{ev.maxValue}</strong> · {tSheet('weight')}:{' '}
          <strong>×{ev.weight}</strong>
        </p>
      </header>

      <GradeMatrix
        evaluationId={ev.id}
        maxValue={ev.maxValue}
        rows={rows}
        backUrl={gradesBase}
        onSave={saveTeacherGradesAction}
      />
    </div>
  );
}
