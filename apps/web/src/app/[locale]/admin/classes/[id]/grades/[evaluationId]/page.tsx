import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { GradeMatrix } from './grade-matrix';
import { saveGradesAction } from '../actions';
import { localizedLabel } from '@/lib/localized-name';

export default async function EvaluationSheetPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; evaluationId: string }>;
}) {
  const { locale, id, evaluationId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.grades');

  const session = (await auth())!;
  const tenantId = session.user.tenantId;

  const data = await withTenant(tenantId, async (tx) => {
    const ev = await tx.evaluation.findUnique({
      where: { id: evaluationId },
      include: {
        class: { select: { id: true, name: true, nameAr: true } },
        subject: true,
        period: true,
      },
    });
    if (!ev || ev.classId !== id) return null;

    const enrollments = await tx.studentClass.findMany({
      where: { classId: id, unenrolledAt: null },
      include: { student: true },
      orderBy: { student: { lastName: 'asc' } },
    });

    const grades = await tx.grade.findMany({
      where: { evaluationId },
    });
    const gradeByStudent = new Map<string, (typeof grades)[number]>();
    for (const g of grades) gradeByStudent.set(g.studentId, g);

    return {
      ev,
      rows: enrollments.map((sc) => {
        const g = gradeByStudent.get(sc.studentId);
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

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={`/${locale}/admin/classes`} className="hover:text-brand-700">
          {t('classes')}
        </Link>
        <span className="mx-1.5">›</span>
        <Link href={`/${locale}/admin/classes/${id}`} className="hover:text-brand-700">
          {localizedLabel(locale, ev.class.name, ev.class.nameAr)}
        </Link>
        <span className="mx-1.5">›</span>
        <Link href={`/${locale}/admin/classes/${id}/grades`} className="hover:text-brand-700">
          {t('title')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{ev.label}</span>
      </nav>

      <header className="mb-6">
        <h1 className="mb-4 -mx-6 overflow-hidden rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-3 text-2xl font-semibold text-slate-900">{ev.label}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {localizedLabel(locale, ev.subject.label, ev.subject.labelAr)} · {localizedLabel(locale, ev.period.label, ev.period.labelAr)} ·{' '}
          {new Date(ev.date).toLocaleDateString(locale)} ·{' '}
          {t('sheet.maxValue')}:{' '}<strong>/{ev.maxValue}</strong> ·{' '}
          {t('sheet.weight')}:{' '}<strong>×{ev.weight}</strong>
        </p>
      </header>

      <GradeMatrix
        evaluationId={ev.id}
        maxValue={ev.maxValue}
        rows={rows}
        backUrl={`/${locale}/admin/classes/${id}/grades`}
        onSave={saveGradesAction}
      />
    </div>
  );
}
