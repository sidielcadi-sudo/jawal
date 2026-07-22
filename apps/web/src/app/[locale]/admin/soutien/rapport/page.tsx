import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { requireRoleCode } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { SoutienTabs } from '../tabs';

export default async function SoutienReportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleCode(['tenant_admin', 'direction', 'cpe', 'scolarite']);
  const session = (await auth())!;
  const t = await getTranslations('admin.soutien');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
    const courses = await tx.supportCourse.findMany({
      where: year ? { academicYearId: year.id } : undefined,
      include: {
        _count: { select: { enrollments: { where: { status: 'ACTIVE' } }, sessions: true } },
      },
      orderBy: { title: 'asc' },
    });
    const courseIds = courses.map((c) => c.id);
    const subjects = await tx.subject.findMany({ select: { id: true, label: true } });
    const subjectById = new Map(subjects.map((s) => [s.id, s.label]));

    // Présence : agrégée par cours via séance.
    const attendance = courseIds.length
      ? await tx.supportAttendance.findMany({
          where: { session: { supportCourseId: { in: courseIds } } },
          select: { present: true, session: { select: { supportCourseId: true } } },
        })
      : [];
    const presByCourse = new Map<string, { present: number; total: number }>();
    for (const a of attendance) {
      const k = a.session.supportCourseId;
      const agg = presByCourse.get(k) ?? { present: 0, total: 0 };
      agg.total += 1;
      if (a.present) agg.present += 1;
      presByCourse.set(k, agg);
    }

    // Revenus par cours (échéances de soutien + paiements).
    const installments = courseIds.length
      ? await tx.installment.findMany({
          where: { supportCourseId: { in: courseIds }, status: { not: 'CANCELLED' } },
          select: { id: true, supportCourseId: true, amount: true, payments: { select: { amount: true } } },
        })
      : [];
    const revByCourse = new Map<string, { due: number; paid: number }>();
    for (const i of installments) {
      if (!i.supportCourseId) continue;
      const agg = revByCourse.get(i.supportCourseId) ?? { due: 0, paid: 0 };
      agg.due += Number(i.amount);
      agg.paid += i.payments.reduce((s, p) => s + Number(p.amount), 0);
      revByCourse.set(i.supportCourseId, agg);
    }

    const rows = courses.map((c) => {
      const pres = presByCourse.get(c.id) ?? { present: 0, total: 0 };
      const rev = revByCourse.get(c.id) ?? { due: 0, paid: 0 };
      return {
        id: c.id,
        title: c.title,
        subject: subjectById.get(c.subjectId) ?? '—',
        subjectId: c.subjectId,
        active: c.active,
        enrolled: c._count.enrollments,
        sessions: c._count.sessions,
        presenceRate: pres.total > 0 ? (pres.present / pres.total) * 100 : null,
        due: rev.due,
        paid: rev.paid,
        isPaid: c.pricingMode !== 'FREE',
      };
    });

    // Par matière.
    const bySubject = new Map<string, { subject: string; courses: number; enrolled: number }>();
    for (const r of rows) {
      const agg = bySubject.get(r.subjectId) ?? { subject: r.subject, courses: 0, enrolled: 0 };
      agg.courses += 1;
      agg.enrolled += r.enrolled;
      bySubject.set(r.subjectId, agg);
    }

    // Vue d'ensemble.
    const distinctStudents = new Set(
      (await tx.supportEnrollment.findMany({ where: { status: 'ACTIVE', supportCourseId: { in: courseIds } }, select: { studentId: true } })).map((e) => e.studentId),
    ).size;
    const totalAtt = attendance.length;
    const totalPresent = attendance.filter((a) => a.present).length;

    return {
      rows,
      bySubject: [...bySubject.values()].sort((a, b) => b.enrolled - a.enrolled),
      kpi: {
        courses: courses.filter((c) => c.active).length,
        students: distinctStudents,
        sessions: courses.reduce((s, c) => s + c._count.sessions, 0),
        presenceRate: totalAtt > 0 ? (totalPresent / totalAtt) * 100 : null,
      },
    };
  });

  const currency = 'MAD';
  const fmt = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(0)}%`);

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">📚 {t('title')}</h1>
        <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
      </header>

      <SoutienTabs locale={locale} active="report" />

      {/* Vue d'ensemble */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label={t('report.kpiCourses')} value={String(data.kpi.courses)} tone="brand" />
        <Tile label={t('report.kpiStudents')} value={String(data.kpi.students)} tone="slate" />
        <Tile label={t('report.kpiSessions')} value={String(data.kpi.sessions)} tone="slate" />
        <Tile label={t('report.kpiPresence')} value={pct(data.kpi.presenceRate)} tone="emerald" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Par cours */}
        <section className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('report.byCourse')}</h2>
          <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="px-4 py-2.5 text-start">{t('col.course')}</th>
                  <th className="px-4 py-2.5 text-end">{t('col.students')}</th>
                  <th className="px-4 py-2.5 text-end">{t('col.sessions')}</th>
                  <th className="px-4 py-2.5 text-end">{t('report.presence')}</th>
                  <th className="px-4 py-2.5 text-end">{t('report.revenue')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((r) => (
                  <tr key={r.id} className={r.active ? '' : 'opacity-50'}>
                    <td className="px-4 py-2.5">
                      <Link href={`/${locale}/admin/soutien/${r.id}`} className="font-medium text-slate-900 hover:text-brand-700 hover:underline">
                        {r.title}
                      </Link>
                      <div className="text-[11px] text-slate-400">{r.subject}</div>
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums text-slate-700">{r.enrolled}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums text-slate-600">{r.sessions}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums text-emerald-700">{pct(r.presenceRate)}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums text-slate-700">
                      {r.isPaid ? `${fmt(r.paid)} / ${fmt(r.due)} ${currency}` : t('free')}
                    </td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">{t('empty')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Par matière */}
        <aside>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('report.bySubject')}</h2>
          <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="px-4 py-2.5 text-start">{t('col.subject')}</th>
                  <th className="px-4 py-2.5 text-end">{t('report.coursesShort')}</th>
                  <th className="px-4 py-2.5 text-end">{t('col.students')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.bySubject.map((s) => (
                  <tr key={s.subject}>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{s.subject}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums text-slate-600">{s.courses}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums text-slate-700">{s.enrolled}</td>
                  </tr>
                ))}
                {data.bySubject.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-500">{t('empty')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">{t('report.rentabiliteHint')}</p>
        </aside>
      </div>
    </div>
  );
}

const TONE: Record<string, string> = {
  brand: 'text-brand-700',
  slate: 'text-slate-700',
  emerald: 'text-emerald-600',
};

function Tile({ label, value, tone }: { label: string; value: string; tone: keyof typeof TONE }) {
  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-4">
      <div className={`text-2xl font-bold tabular-nums ${TONE[tone]}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}
