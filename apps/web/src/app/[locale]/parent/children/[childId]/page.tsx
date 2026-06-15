import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { parentCanAccessChild } from '@/lib/parent';
import { loadStudentCarnet } from '@/lib/carnet';
import { MarkCarnetRead } from '@/components/carnet/mark-carnet-read';
import {
  categoryOf,
  tallyAttendance,
  ATTENDANCE_CATEGORIES,
  type AttendanceCategory,
} from '@/lib/attendance-category';
import { DocumentsPanel } from '@/components/documents-panel';
import { JustifyButton } from './justify-button';

// Catégories d'absence que le parent peut justifier.
const JUSTIFIABLE = new Set<AttendanceCategory>(['ABSENT', 'LATE', 'EXCLUSION']);

const CATEGORY_TONE: Record<AttendanceCategory, string> = {
  PRESENT: 'bg-emerald-100 text-emerald-700',
  LATE: 'bg-amber-100 text-amber-700',
  INFIRMARY: 'bg-blue-100 text-blue-700',
  PUNISHMENT: 'bg-purple-100 text-purple-700',
  EXCLUSION: 'bg-rose-100 text-rose-700',
  EXCUSED: 'bg-green-100 text-green-700',
  ABSENT: 'bg-red-100 text-red-700',
};

const STATUS_TONE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  PARTIAL: 'bg-blue-100 text-blue-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

export default async function ParentChildPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; childId: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { locale, childId } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = (await auth())!;
  const tenantId = session.user.tenantId;
  const t = await getTranslations('parent.child');

  const data = await withTenant(tenantId, async (tx) => {
    if (!(await parentCanAccessChild(tx, session.user.id, childId))) return null;

    const child = await tx.person.findUnique({
      where: { id: childId },
      select: { id: true, firstName: true, lastName: true, birthDate: true },
    });
    if (!child) return null;

    // Historique multi-années : on liste toutes les années et on sélectionne
    // celle demandée (?year=), sinon l'année active, sinon la plus récente.
    const years = await tx.academicYear.findMany({
      orderBy: { startDate: 'desc' },
      include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    const selectedYear =
      years.find((y) => y.id === sp.year) ?? years.find((y) => y.active) ?? years[0] ?? null;

    const sc = await tx.studentClass.findFirst({
      where: {
        studentId: childId,
        unenrolledAt: null,
        ...(selectedYear ? { class: { academicYearId: selectedYear.id } } : {}),
      },
      include: { class: { select: { id: true, name: true, level: { select: { cycle: { select: { label: true } }, label: true } } } } },
    });

    // Présences sur l'année sélectionnée.
    const records = selectedYear
      ? await tx.attendanceRecord.findMany({
          where: {
            studentId: childId,
            session: {
              finalizedAt: { not: null },
              date: { gte: selectedYear.startDate, lte: selectedYear.endDate },
            },
          },
          include: {
            session: { include: { class: { select: { name: true } } } },
            justification: { select: { status: true } },
          },
          orderBy: { session: { date: 'desc' } },
        })
      : [];
    const att = tallyAttendance(records);
    const rate = att.rate;
    const recentAbsences = records
      .map((r) => ({ r, cat: categoryOf(r) }))
      .filter(({ cat }) => cat !== 'PRESENT')
      .slice(0, 8)
      .map(({ r, cat }) => ({
        id: r.id,
        date: r.session.date,
        cat,
        className: r.session.class.name,
        justif: (r.justification?.status as 'PENDING' | 'APPROVED' | 'REJECTED' | undefined) ?? null,
      }));

    // Scolarité.
    const installments = await tx.installment.findMany({
      where: { studentId: childId, status: { not: 'CANCELLED' } },
      include: { payments: { select: { amount: true } } },
      orderBy: { dueDate: 'asc' },
    });
    const fees = installments.map((i) => {
      const paid = i.payments.reduce((s, p) => s + Number(p.amount), 0);
      return {
        id: i.id,
        label: i.label,
        amount: Number(i.amount),
        paid,
        remaining: Math.max(0, Number(i.amount) - paid),
        dueDate: i.dueDate,
        status: i.status as 'PENDING' | 'PARTIAL' | 'PAID',
      };
    });
    const totalDue = fees.reduce((s, f) => s + f.amount, 0);
    const totalPaid = fees.reduce((s, f) => s + f.paid, 0);

    // Carnet de correspondance (entrées visibles aux parents).
    const carnet = await loadStudentCarnet(tx, childId, { forParents: true });

    // Motifs d'absence proposés au parent dans la popup « Justifier ».
    const reasons = (
      await tx.attendanceReason.findMany({
        where: { active: true },
        orderBy: [{ order: 'asc' }, { label: 'asc' }],
        select: { id: true, label: true },
      })
    ).map((r) => ({ id: r.id, label: r.label }));

    // Notes : évaluations de la classe de l'enfant (année sélectionnée) avec la
    // note de l'enfant et la moyenne de classe (notes non nulles).
    const periodIds = (selectedYear?.periods ?? []).map((p) => p.id);
    const evals =
      sc?.class.id && periodIds.length > 0
        ? await tx.evaluation.findMany({
            where: { classId: sc.class.id, periodId: { in: periodIds } },
            orderBy: { date: 'desc' },
            include: {
              subject: { select: { label: true } },
              period: { select: { label: true } },
              grades: { select: { studentId: true, value: true } },
            },
          })
        : [];
    const notes = evals.map((e) => {
      const childValue = e.grades.find((g) => g.studentId === childId)?.value ?? null;
      const vals = e.grades.map((g) => g.value).filter((v): v is number => v !== null);
      const classAvg = vals.length > 0 ? vals.reduce((s, x) => s + x, 0) / vals.length : null;
      return {
        id: e.id,
        subject: e.subject.label,
        period: e.period.label,
        label: e.label,
        date: e.date,
        max: e.maxValue,
        childValue,
        classAvg,
      };
    });

    return {
      child,
      classInfo: sc?.class ?? null,
      periods: selectedYear?.periods ?? [],
      notes,
      carnet: carnet.entries.map((e) => ({
        id: e.id,
        type: e.type,
        content: e.content,
        occurredAt: e.occurredAt.toISOString(),
        authorName: e.authorName,
        read: e.parentReadAt ? e.parentReadAt.toISOString() : null,
      })),
      years: years.map((y) => ({ id: y.id, label: y.label, active: y.active })),
      selectedYearId: selectedYear?.id ?? null,
      reasons,
      att,
      rate,
      recentAbsences,
      fees,
      totalDue,
      totalPaid,
      totalRemaining: Math.max(0, totalDue - totalPaid),
    };
  });

  if (!data) notFound();
  const { child, classInfo, periods, notes, carnet, years, selectedYearId, reasons, att, rate, recentAbsences, fees, totalDue, totalPaid, totalRemaining } = data;
  const carnetUnread = carnet.some((c) => !c.read);

  // Notes regroupées par matière pour l'affichage.
  const notesBySubject = new Map<string, typeof notes>();
  for (const n of notes) {
    const arr = notesBySubject.get(n.subject) ?? [];
    arr.push(n);
    notesBySubject.set(n.subject, arr);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={`/${locale}/parent`} className="hover:text-brand-700">
          {t('breadcrumbHome')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>
          {child.firstName} {child.lastName}
        </span>
      </nav>

      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-xl bg-slate-200 text-xl font-semibold text-slate-600">
            {(child.firstName[0] ?? '') + (child.lastName[0] ?? '')}
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {child.firstName} {child.lastName}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {classInfo ? `${classInfo.level.cycle.label} · ${classInfo.name}` : t('noClass')}
            </p>
          </div>
        </div>

        {years.length > 1 && (
          <form method="get" className="flex items-end gap-2">
            <label className="block">
              <span className="block text-xs text-slate-500">{t('year')}</span>
              <select
                name="year"
                defaultValue={selectedYearId ?? ''}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm"
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t('viewYear')}
            </button>
          </form>
        )}
      </header>

      {/* Carnet de correspondance */}
      <MarkCarnetRead childId={child.id} hasUnread={carnetUnread} />
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">{t('carnet.title')}</h2>
          {carnetUnread && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              {t('carnet.unread', { count: carnet.filter((c) => !c.read).length })}
            </span>
          )}
        </div>
        {carnet.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">{t('carnet.empty')}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {carnet.map((c) => (
              <li
                key={c.id}
                className={`rounded-xl border p-3 ${
                  c.read ? 'border-slate-100' : 'border-red-200 bg-red-50/40'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                        c.type === 'ENCOURAGEMENT' || c.type === 'FELICITATION'
                          ? 'bg-emerald-100 text-emerald-700'
                          : c.type === 'OBSERVATION'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {t(`carnet.type.${c.type}`)}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(c.occurredAt).toLocaleDateString(locale)} · {c.authorName}
                    </span>
                  </span>
                  {c.read ? (
                    <span className="text-[10px] text-slate-400">
                      {t('carnet.seenOn', { date: new Date(c.read).toLocaleDateString(locale) })}
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-red-600">{t('carnet.new')}</span>
                  )}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-800">{c.content}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Notes */}
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">{t('notes.title')}</h2>
        {notes.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">{t('notes.empty')}</p>
        ) : (
          <div className="mt-3 space-y-4">
            {[...notesBySubject.entries()].map(([subject, list]) => (
              <div key={subject}>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {subject}
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-100">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-3 py-1.5 text-start">{t('notes.evaluation')}</th>
                        <th className="px-2 py-1.5 text-start">{t('notes.period')}</th>
                        <th className="px-2 py-1.5 text-end">{t('notes.mark')}</th>
                        <th className="px-3 py-1.5 text-end">{t('notes.classAvg')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {list.map((n) => (
                        <tr key={n.id}>
                          <td className="px-3 py-1.5 text-slate-800">
                            {n.label}
                            <span className="ms-1 text-[10px] text-slate-400">
                              {new Date(n.date).toLocaleDateString(locale, {
                                day: '2-digit',
                                month: '2-digit',
                              })}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-slate-500">{n.period}</td>
                          <td className="px-2 py-1.5 text-end font-semibold tabular-nums">
                            {n.childValue === null ? (
                              <span className="text-slate-400">—</span>
                            ) : (
                              <span
                                className={
                                  n.childValue < n.max / 2 ? 'text-red-700' : 'text-emerald-700'
                                }
                              >
                                {n.childValue}
                                <span className="text-[10px] font-normal text-slate-400">
                                  /{n.max}
                                </span>
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-end tabular-nums text-slate-500">
                            {n.classAvg === null ? '—' : `${n.classAvg.toFixed(2)}/${n.max}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Bulletins */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">{t('bulletins.title')}</h2>
        {!classInfo || periods.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">{t('bulletins.empty')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {periods.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-800">{p.label}</span>
                <a
                  href={`/api/parent/children/${child.id}/bulletin.pdf?period=${p.id}`}
                  className="rounded-lg border border-brand-600 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 shadow-sm hover:bg-brand-50"
                >
                  ⬇ {t('bulletins.download')}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Documents officiels */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('documentsTitle')}</h2>
        <DocumentsPanel
          hrefBase={`/api/parent/children/${child.id}/document.pdf`}
          years={years.map((y) => ({ id: y.id, label: y.label }))}
          periods={periods.map((p) => ({ id: p.id, label: p.label }))}
        />
      </section>

      {/* Présences */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">{t('attendance.title')}</h2>
          {rate !== null && (
            <span
              className={`text-lg font-semibold tabular-nums ${rate < 90 ? 'text-red-700' : 'text-emerald-700'}`}
            >
              {rate.toFixed(1)}%
            </span>
          )}
        </div>
        {att.total === 0 ? (
          <p className="mt-2 text-xs text-slate-500">{t('attendance.empty')}</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-4">
              {ATTENDANCE_CATEGORIES.filter((c) => att.counts[c] > 0).map((c) => (
                <Mini key={c} value={att.counts[c]} label={t(`attendance.cat.${c}`)} tone={c} />
              ))}
            </div>
            {recentAbsences.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <span className="text-xs font-medium text-slate-700">{t('attendance.recent')}</span>
                <ul className="mt-2 space-y-1.5 text-xs">
                  {recentAbsences.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between rounded-lg border border-slate-100 px-2 py-1.5"
                    >
                      <span className="text-slate-700">
                        {new Date(a.date).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })}{' '}
                        · <span className="text-slate-500">{a.className}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${CATEGORY_TONE[a.cat]}`}
                        >
                          {t(`attendance.cat.${a.cat}`)}
                        </span>
                        {a.justif === 'APPROVED' ? (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                            ✓ {t('attendance.justified')}
                          </span>
                        ) : a.justif === 'PENDING' ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                            {t('attendance.justify.pending')}
                          </span>
                        ) : (
                          JUSTIFIABLE.has(a.cat) && (
                            <JustifyButton
                              recordId={a.id}
                              reasons={reasons}
                              dateLabel={new Date(a.date).toLocaleDateString(locale, { dateStyle: 'long' })}
                              className={a.className}
                            />
                          )
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      {/* Scolarité */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">{t('finance.title')}</h2>
          <span className="text-xs text-slate-500">
            {t('finance.paidOf', {
              paid: totalPaid.toLocaleString(locale),
              due: totalDue.toLocaleString(locale),
            })}
          </span>
        </div>
        {fees.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">{t('finance.empty')}</p>
        ) : (
          <>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="py-2 text-start font-medium">{t('finance.label')}</th>
                  <th className="py-2 text-end font-medium">{t('finance.dueDate')}</th>
                  <th className="py-2 text-end font-medium">{t('finance.amount')}</th>
                  <th className="py-2 text-end font-medium">{t('finance.remaining')}</th>
                  <th className="py-2 text-center font-medium">{t('finance.status')}</th>
                </tr>
              </thead>
              <tbody>
                {fees.map((f) => (
                  <tr key={f.id} className="border-b border-slate-100">
                    <td className="py-2 text-slate-800">{f.label}</td>
                    <td className="py-2 text-end tabular-nums text-slate-500">
                      {new Date(f.dueDate).toLocaleDateString(locale)}
                    </td>
                    <td className="py-2 text-end tabular-nums">{f.amount.toLocaleString(locale)}</td>
                    <td className="py-2 text-end tabular-nums font-medium">
                      {f.remaining > 0 ? f.remaining.toLocaleString(locale) : '—'}
                    </td>
                    <td className="py-2 text-center">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${STATUS_TONE[f.status]}`}
                      >
                        {t(`finance.statuses.${f.status}`)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <span className="text-sm font-medium text-slate-700">{t('finance.totalRemaining')}</span>
              <div className="flex items-center gap-3">
                <span
                  className={`text-lg font-semibold tabular-nums ${totalRemaining > 0 ? 'text-amber-700' : 'text-emerald-700'}`}
                >
                  {totalRemaining.toLocaleString(locale)} MAD
                </span>
                {totalRemaining > 0 && (
                  <button
                    type="button"
                    disabled
                    title={t('finance.payOnlineSoon')}
                    className="cursor-not-allowed rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500"
                  >
                    {t('finance.payOnline')} · {t('finance.soon')}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Mini({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: AttendanceCategory;
}) {
  const colors: Record<AttendanceCategory, string> = {
    PRESENT: 'text-emerald-700',
    LATE: 'text-amber-700',
    INFIRMARY: 'text-blue-700',
    PUNISHMENT: 'text-purple-700',
    EXCLUSION: 'text-rose-700',
    EXCUSED: 'text-green-700',
    ABSENT: 'text-red-700',
  };
  return (
    <div className="rounded-lg border border-slate-100 px-2 py-2">
      <div className={`text-lg font-semibold tabular-nums ${colors[tone]}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
