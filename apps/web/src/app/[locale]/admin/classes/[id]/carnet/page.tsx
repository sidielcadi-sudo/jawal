import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { can } from '@/lib/auth/rbac';
import { loadStudentCarnet } from '@/lib/carnet';
import { searchCarnetEvents } from '@/lib/carnet-search';
import { CarnetView } from '@/components/carnet/carnet-view';
import { CarnetEventsTable } from '@/components/carnet/carnet-events-table';
import { personDisplayName } from '@/lib/localized-name';
import { ClassHeader, CLASS_PAGE_SHELL } from '../class-header';

const ALL_TYPES = ['OBSERVATION', 'ENCOURAGEMENT', 'DEFAUT_CARNET', 'REMARQUE_DISCIPLINAIRE', 'AVERTISSEMENT', 'EXCLUSION'];

function parseDay(v: string | undefined): Date | null {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Carnet de correspondance de la classe : le même écran que Carnet de
 * correspondance du menu, limité aux élèves de cette classe.
 */
export default async function ClassCarnetPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ student?: string; from?: string; to?: string }>;
}) {
  const tCrumb = await getTranslations('admin.classes.detail');
  const { locale, id } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('carnet');
  const session = (await auth())!;
  const canWrite = await can('discipline.write');

  const from = parseDay(sp.from);
  const toRaw = parseDay(sp.to);
  const to = toRaw ? new Date(toRaw.getTime() + 86_399_999) : null;

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const cls = await tx.class.findUnique({
      where: { id },
      include: {
        academicYear: { include: { periods: { orderBy: { startDate: 'asc' } } } },
        level: { include: { cycle: true } },
        students: { where: { unenrolledAt: null } },
      },
    });
    if (!cls) return null;
    const scs = await tx.studentClass.findMany({
      where: { classId: id, unenrolledAt: null },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } },
      },
      orderBy: { student: { lastName: 'asc' } },
    });
    const students = scs.map((s) => ({ id: s.student.id, name: personDisplayName(locale, s.student) }));
    const studentId = students.find((s) => s.id === sp.student)?.id ?? null;
    const [events, carnet] = await Promise.all([
      searchCarnetEvents(tx, { levelId: null, classId: id, studentId, from, to }),
      studentId ? loadStudentCarnet(tx, studentId) : Promise.resolve(null),
    ]);
    return { cls, students, studentId, events, carnet };
  });
  if (!data) notFound();
  const { cls, students, studentId, events, carnet } = data;
  const sel = 'mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm';

  return (
    <div className={CLASS_PAGE_SHELL}>
      <ClassHeader cls={cls} locale={locale} current={tCrumb('carnet')} />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="block text-xs font-medium text-slate-600">{t('filters.student')}</span>
          <select name="student" defaultValue={studentId ?? ''} className={`${sel} min-w-[14rem]`}>
            <option value="">{t('filters.allStudents')}</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-600">{t('filters.from')}</span>
          <input type="date" name="from" defaultValue={sp.from ?? ''} className={sel} />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-600">{t('filters.to')}</span>
          <input type="date" name="to" defaultValue={sp.to ?? ''} className={sel} />
        </label>
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          {t('apply')}
        </button>
        {(sp.from || sp.to || studentId) && (
          <Link href="?" className="rounded-lg px-2 py-2 text-xs text-slate-500 hover:text-slate-700">
            {t('filters.clearDates')}
          </Link>
        )}
      </form>

      <div className="mt-6 space-y-6">
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
