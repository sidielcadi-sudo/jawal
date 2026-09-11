import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { requireRoleCode } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { localizedLabel, personDisplayName } from '@/lib/localized-name';
import {
  buildAlerts,
  buildTrend,
  donutSegments,
  presenceRate,
  rateTone,
  polylinePoints,
  type Alert,
  type AlertInput,
  type Counts,
  type TrendDay,
} from '@/lib/attendance-dashboard';
import { AttendanceFilters } from './filters';
import { NotifyButton } from './notify-button';

/** Fenêtre d'historique alimentant la courbe et les alertes. */
const WINDOW_DAYS = 30;

type ClassRow = {
  classId: string;
  name: string;
  levelLabel: string;
  cycleLabel: string;
  enrolled: number;
  sessionId: string | null;
  finalized: boolean;
} & Counts;

type IncidentRow = {
  recordId: string;
  studentId: string;
  studentName: string;
  className: string;
  classId: string;
  time: string | null;
  status: 'ABSENT' | 'LATE' | 'EXCUSED';
  reason: string | null;
  notified: 'SENT' | 'FAILED' | 'SKIPPED' | null;
};

const TONE_BAR: Record<string, string> = {
  good: 'bg-emerald-500',
  medium: 'bg-amber-500',
  weak: 'bg-red-500',
};

export default async function AdminAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    date?: string;
    class?: string;
    q?: string;
    page?: string;
    size?: string;
  }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRoleCode(['tenant_admin', 'direction', 'scolarite', 'cpe']);

  const session = (await auth())!;
  const t = await getTranslations('admin.attendanceIndex');
  const tStatus = await getTranslations('admin.attendance.status');

  const today = isoDay(new Date());
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? sp.date! : today;
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  const windowStart = new Date(date);
  windowStart.setUTCDate(windowStart.getUTCDate() - WINDOW_DAYS);

  const data = await withTenant(session.user.tenantId, async (tx) => {
    // L'année suit la date consultée, pas le drapeau « active » : un appel du
    // 15 juillet appartient à l'exercice qui se terminait alors. Charger les
    // classes de l'année active afficherait « appel non fait » sur toute la
    // page, alors que la feuille existe — sur d'autres classes.
    const years = await tx.academicYear.findMany({
      select: { id: true, label: true, active: true, startDate: true, endDate: true },
      orderBy: { startDate: 'desc' },
    });
    const year =
      years.find((y) => isoDay(y.startDate) <= dateStr && dateStr <= isoDay(y.endDate)) ??
      years.find((y) => y.active) ??
      years[0];
    if (!year) return null;

    const classes = await tx.class.findMany({
      where: { academicYearId: year.id, deletedAt: null },
      select: {
        id: true,
        name: true,
        nameAr: true,
        level: {
          select: {
            order: true,
            label: true,
            labelAr: true,
            cycle: { select: { label: true, labelAr: true } },
          },
        },
        students: { where: { unenrolledAt: null }, select: { id: true } },
        attendanceSessions: {
          where: { date },
          select: {
            id: true,
            periodLabel: true,
            finalizedAt: true,
            records: {
              select: {
                id: true,
                status: true,
                note: true,
                studentId: true,
                lateReason: { select: { label: true } },
                justification: { select: { reason: true } },
                student: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    firstNameAr: true,
                    lastNameAr: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ level: { order: 'asc' } }, { name: 'asc' }],
    });

    // Journal des avis envoyés, pour la colonne « Parent informé ». Le dernier
    // état par élève-jour fait foi : un renvoi après un échec doit se lire
    // comme un succès.
    const recordIds = classes.flatMap((c) =>
      c.attendanceSessions.flatMap((s) => s.records.map((r) => r.id)),
    );
    const notices = recordIds.length
      ? await tx.notificationLog.findMany({
          where: { relatedType: 'AttendanceRecord', relatedId: { in: recordIds } },
          select: { relatedId: true, status: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
    const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);
    const noticesSent = await tx.notificationLog.count({
      where: {
        relatedType: 'AttendanceRecord',
        status: 'SENT',
        createdAt: { gte: dayStart, lte: dayEnd },
      },
    });

    // Fenêtre glissante : comptages par jour pour la courbe…
    const windowSessions = await tx.attendanceSession.findMany({
      where: { date: { gte: windowStart, lte: date } },
      select: { date: true, classId: true, records: { select: { status: true } } },
    });

    // …et détail des incidents pour les alertes.
    const windowIncidents = await tx.attendanceSession.findMany({
      where: { date: { gte: windowStart, lte: date } },
      select: {
        date: true,
        classId: true,
        class: { select: { name: true, nameAr: true } },
        records: {
          where: { status: { in: ['ABSENT', 'LATE'] } },
          select: {
            studentId: true,
            status: true,
            justification: { select: { status: true, attachmentUrl: true } },
            student: {
              select: {
                firstName: true,
                lastName: true,
                firstNameAr: true,
                lastNameAr: true,
              },
            },
          },
        },
      },
    });

    const pendingJustifications = await tx.absenceJustification.count({
      where: { status: 'PENDING' },
    });

    // Dernier jour réellement pointé : sert à l'invite quand la date demandée
    // est vide (un dimanche, une veille de rentrée…).
    const lastSession = await tx.attendanceSession.findFirst({
      orderBy: { date: 'desc' },
      select: { date: true },
    });

    return {
      year,
      classes,
      notices,
      noticesSent,
      windowSessions,
      windowIncidents,
      pendingJustifications,
      lastDay: lastSession ? isoDay(lastSession.date) : null,
    };
  });

  if (!data) {
    return (
      <div className="px-3 py-3">
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {t('noYear')}
        </p>
      </div>
    );
  }

  /* ── Mise en forme ────────────────────────────────────────────────────── */

  const noticeByRecord = new Map<string, 'SENT' | 'FAILED' | 'SKIPPED'>();
  for (const n of data.notices) {
    if (n.relatedId) noticeByRecord.set(n.relatedId, n.status as 'SENT' | 'FAILED' | 'SKIPPED');
  }

  const classFilter = sp.class && sp.class !== 'all' ? sp.class : null;
  const scoped = classFilter ? data.classes.filter((c) => c.id === classFilter) : data.classes;

  const rows: ClassRow[] = scoped.map((cls) => {
    const records = cls.attendanceSessions.flatMap((s) => s.records);
    return {
      classId: cls.id,
      name: localizedLabel(locale, cls.name, cls.nameAr),
      levelLabel: localizedLabel(locale, cls.level.label, cls.level.labelAr),
      cycleLabel: localizedLabel(locale, cls.level.cycle.label, cls.level.cycle.labelAr),
      enrolled: cls.students.length,
      sessionId: cls.attendanceSessions[0]?.id ?? null,
      finalized: cls.attendanceSessions.every((s) => s.finalizedAt) && cls.attendanceSessions.length > 0,
      present: records.filter((r) => r.status === 'PRESENT').length,
      absent: records.filter((r) => r.status === 'ABSENT').length,
      late: records.filter((r) => r.status === 'LATE').length,
      excused: records.filter((r) => r.status === 'EXCUSED').length,
    };
  });

  const totals: Counts = {
    present: rows.reduce((s, r) => s + r.present, 0),
    absent: rows.reduce((s, r) => s + r.absent, 0),
    late: rows.reduce((s, r) => s + r.late, 0),
    excused: rows.reduce((s, r) => s + r.excused, 0),
  };
  const donutTotal = totals.present + totals.absent + totals.late;
  const pct = (n: number) => (donutTotal > 0 ? Math.round((n / donutTotal) * 1000) / 10 : 0);

  /* Détail du jour : absences et retards, filtrés puis paginés. */
  const allIncidents: IncidentRow[] = scoped.flatMap((cls) =>
    cls.attendanceSessions.flatMap((s) =>
      s.records
        .filter((r) => r.status !== 'PRESENT')
        .map<IncidentRow>((r) => ({
          recordId: r.id,
          studentId: r.student.id,
          studentName: personDisplayName(locale, r.student),
          className: localizedLabel(locale, cls.name, cls.nameAr),
          classId: cls.id,
          time: s.periodLabel,
          status: r.status as IncidentRow['status'],
          reason:
            r.lateReason?.label ??
            r.justification?.reason ??
            r.note ??
            null,
          notified: noticeByRecord.get(r.id) ?? null,
        })),
    ),
  );

  const q = (sp.q ?? '').trim().toLocaleLowerCase(locale);
  const filtered = q
    ? allIncidents.filter((i) => i.studentName.toLocaleLowerCase(locale).includes(q))
    : allIncidents;
  filtered.sort((a, b) => a.studentName.localeCompare(b.studentName, locale));

  const size = clamp(Number(sp.size) || 5, 5, 100);
  const pageCount = Math.max(1, Math.ceil(filtered.length / size));
  const page = clamp(Number(sp.page) || 1, 1, pageCount);
  const pageRows = filtered.slice((page - 1) * size, page * size);

  /* Courbe et alertes. */
  // Calendrier des appels par classe : ce qui permet de distinguer « absent
  // trois jours de suite » de « trois absences dans le mois ».
  const callDays: Record<string, string[]> = {};
  for (const s of data.windowSessions) {
    const key = isoDay(s.date);
    const list = (callDays[s.classId] ??= []);
    if (list[list.length - 1] !== key) list.push(key);
  }
  for (const list of Object.values(callDays)) {
    list.sort();
    // Une classe peut avoir plusieurs séances le même jour : un seul jour compte.
    let w = 0;
    for (let i = 0; i < list.length; i++) if (i === 0 || list[i] !== list[i - 1]) list[w++] = list[i]!;
    list.length = w;
  }

  const byDay = new Map<string, TrendDay>();
  for (const s of data.windowSessions) {
    const key = isoDay(s.date);
    const acc = byDay.get(key) ?? { date: key, present: 0, absent: 0, late: 0, excused: 0 };
    for (const r of s.records) {
      if (r.status === 'PRESENT') acc.present++;
      else if (r.status === 'ABSENT') acc.absent++;
      else if (r.status === 'LATE') acc.late++;
      else acc.excused++;
    }
    byDay.set(key, acc);
  }
  const trend = buildTrend([...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)), 7);

  const alertInputs: AlertInput[] = data.windowIncidents.flatMap((s) =>
    s.records.map((r) => ({
      studentId: r.studentId,
      studentName: personDisplayName(locale, r.student),
      classId: s.classId,
      className: localizedLabel(locale, s.class.name, s.class.nameAr),
      date: isoDay(s.date),
      status: r.status as AlertInput['status'],
      justified: r.justification?.status === 'APPROVED',
      pending: r.justification?.status === 'PENDING',
      hasAttachment: Boolean(r.justification?.attachmentUrl),
    })),
  );
  const alerts = buildAlerts(alertInputs, {
    today: dateStr,
    weekStart: mondayOf(dateStr),
    callDays,
    limit: 4,
  });

  /* ── Liens ────────────────────────────────────────────────────────────── */

  const base = `/${locale}/admin/attendance`;
  const href = (patch: Record<string, string | undefined>) => {
    const qs = new URLSearchParams({ date: dateStr });
    if (classFilter) qs.set('class', classFilter);
    if (sp.q) qs.set('q', sp.q);
    if (size !== 5) qs.set('size', String(size));
    if (page !== 1) qs.set('page', String(page));
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') qs.delete(k);
      else qs.set(k, v);
    }
    return `${base}?${qs.toString()}`;
  };
  const exportHref = `/api/admin/exports/attendance.csv?date=${dateStr}${
    classFilter ? `&class=${classFilter}` : ''
  }`;

  const dayLabel = new Date(`${dateStr}T12:00:00`).toLocaleDateString(locale, {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const anyCall = rows.some((r) => r.sessionId);

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600 first-letter:uppercase">
            {t('subtitle')} · {dayLabel}
          </p>
        </div>
        <a
          href={exportHref}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <span aria-hidden>⭳</span> {t('export')}
        </a>
      </header>

      <AttendanceFilters
        base={base}
        date={dateStr}
        today={today}
        classId={classFilter ?? 'all'}
        classes={data.classes.map((c) => ({
          id: c.id,
          label: localizedLabel(locale, c.name, c.nameAr),
        }))}
        allLabel={t('allClasses')}
        todayLabel={t('todayIs')}
      />

      {!anyCall && data.lastDay && data.lastDay !== dateStr && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          {t('noCallThatDay')}{' '}
          <Link href={href({ date: data.lastDay, page: undefined })} className="font-medium underline">
            {t('goToLastDay', { date: data.lastDay })}
          </Link>
        </p>
      )}

      {/* ── Indicateurs du jour ─────────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon="👥"
          tone="emerald"
          label={t('kpi.presentToday')}
          value={totals.present}
          hint={`${pct(totals.present)} %`}
          hintTone="text-emerald-700"
        />
        <Kpi
          icon="🚷"
          tone="red"
          label={t('kpi.absent')}
          value={totals.absent}
          hint={`${pct(totals.absent)} %`}
          hintTone="text-red-700"
        />
        <Kpi
          icon="⏱"
          tone="amber"
          label={t('kpi.late')}
          value={totals.late}
          hint={`${pct(totals.late)} %`}
          hintTone="text-amber-700"
        />
        <Kpi
          icon="✉"
          tone="sky"
          label={t('kpi.notices')}
          value={data.noticesSent}
          hint={t('kpi.noticesHint')}
        />
      </div>

      <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          {/* ── Vue d'ensemble par classe ─────────────────────────────── */}
          <section className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <header className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">{t('byClass.title')}</h2>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-start">{t('byClass.class')}</th>
                    <th className="px-4 py-3 text-end">{t('byClass.present')}</th>
                    <th className="px-4 py-3 text-end">{t('byClass.absent')}</th>
                    <th className="px-4 py-3 text-end">{t('byClass.late')}</th>
                    <th className="px-4 py-3 text-start">{t('byClass.rate')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const rate = presenceRate(r);
                    const tone = rateTone(rate);
                    return (
                      <tr key={r.classId}>
                        <td className="px-4 py-2.5">
                          {/* Le nom reste la porte d'entrée vers la feuille
                              d'appel : c'est de là qu'on corrige un pointage. */}
                          <Link
                            href={`/${locale}/admin/classes/${r.classId}/attendance?date=${dateStr}`}
                            className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                          >
                            {r.name}
                          </Link>
                          <div className="text-[11px] text-slate-400">{r.cycleLabel}</div>
                        </td>
                        <td className="px-4 py-2.5 text-end tabular-nums text-slate-700">
                          {r.sessionId ? r.present : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-end tabular-nums">
                          <span className={r.absent > 0 ? 'text-red-700' : 'text-slate-400'}>
                            {r.sessionId ? r.absent : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-end tabular-nums">
                          <span className={r.late > 0 ? 'text-amber-700' : 'text-slate-400'}>
                            {r.sessionId ? r.late : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {rate === null ? (
                            <span className="text-xs text-slate-400">{t('status.notTaken')}</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="w-12 shrink-0 text-xs font-medium tabular-nums text-slate-700">
                                {rate.toFixed(1)}%
                              </span>
                              <span className="h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-slate-100">
                                <span
                                  className={`block h-full rounded-full ${TONE_BAR[tone!]}`}
                                  style={{ width: `${Math.max(2, rate)}%` }}
                                />
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                        {t('byClass.empty')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <footer className="flex flex-wrap items-center gap-4 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-600">
              <Legend tone="good" label={t('legend.good')} />
              <Legend tone="medium" label={t('legend.medium')} />
              <Legend tone="weak" label={t('legend.weak')} />
            </footer>
          </section>

          {/* ── Détail des absences et retards ─────────────────────────── */}
          <section className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">{t('detail.title')}</h2>
              <form method="get" className="flex items-center gap-2">
                <input type="hidden" name="date" value={dateStr} />
                {classFilter && <input type="hidden" name="class" value={classFilter} />}
                {size !== 5 && <input type="hidden" name="size" value={String(size)} />}
                <input
                  type="search"
                  name="q"
                  defaultValue={sp.q ?? ''}
                  placeholder={t('detail.search')}
                  className="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </form>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-start">{t('detail.student')}</th>
                    <th className="px-4 py-3 text-start">{t('detail.class')}</th>
                    <th className="px-4 py-3 text-start">{t('detail.time')}</th>
                    <th className="px-4 py-3 text-start">{t('detail.status')}</th>
                    <th className="px-4 py-3 text-start">{t('detail.reason')}</th>
                    <th className="px-4 py-3 text-start">{t('detail.notified')}</th>
                    <th className="px-4 py-3 text-end">{t('detail.action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map((i) => (
                    <tr key={i.recordId}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700">
                            {initials(i.studentName)}
                          </span>
                          <span className="font-medium text-slate-800">{i.studentName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{i.className}</td>
                      <td className="px-4 py-2.5 text-xs tabular-nums text-slate-600">
                        {i.time ?? '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusPill status={i.status} label={tStatus(pillKey(i.status))} />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">
                        {i.reason ?? t('detail.noReason')}
                      </td>
                      <td className="px-4 py-2.5">
                        <NotifiedPill state={i.notified} t={t} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <NotifyButton recordId={i.recordId} label={t('detail.notify')} />
                          <Link
                            href={`/${locale}/admin/persons/${i.studentId}`}
                            title={t('detail.openStudent')}
                            className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          >
                            👁
                          </Link>
                          <Link
                            href={`/${locale}/admin/classes/${i.classId}/attendance?date=${dateStr}`}
                            title={t('detail.openSheet')}
                            className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          >
                            ⋮
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                        {t('detail.empty')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5">
              <p className="text-xs text-slate-500">
                {filtered.length === 0
                  ? t('detail.countEmpty')
                  : t('detail.count', {
                      from: (page - 1) * size + 1,
                      to: (page - 1) * size + pageRows.length,
                      total: filtered.length,
                    })}
              </p>
              <div className="flex items-center gap-1">
                <PageLink href={href({ page: String(page - 1) })} disabled={page === 1} label="‹" />
                {pageNumbers(page, pageCount).map((n, idx) =>
                  n === null ? (
                    <span key={`gap${idx}`} className="px-1 text-xs text-slate-400">
                      …
                    </span>
                  ) : (
                    <PageLink
                      key={n}
                      href={href({ page: String(n) })}
                      label={String(n)}
                      active={n === page}
                    />
                  ),
                )}
                <PageLink
                  href={href({ page: String(page + 1) })}
                  disabled={page === pageCount}
                  label="›"
                />
              </div>
            </footer>
          </section>
        </div>

        {/* ── Colonne droite ──────────────────────────────────────────── */}
        <div className="w-full shrink-0 space-y-4 xl:w-[360px]">
          {/* Répartition globale */}
          <section className="rounded-2xl border border-brand-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">{t('donut.title')}</h2>
            <Donut counts={totals} total={donutTotal} label={t('donut.total')} />
            <ul className="mt-3 space-y-1.5 text-xs">
              <DonutLine
                color="bg-emerald-500"
                label={t('kpi.presentToday')}
                pct={pct(totals.present)}
                count={totals.present}
              />
              <DonutLine
                color="bg-red-500"
                label={t('kpi.absent')}
                pct={pct(totals.absent)}
                count={totals.absent}
              />
              <DonutLine
                color="bg-amber-500"
                label={t('kpi.late')}
                pct={pct(totals.late)}
                count={totals.late}
              />
            </ul>
          </section>

          {/* Tendances */}
          <section className="rounded-2xl border border-brand-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-800">{t('trend.title')}</h2>
              <span className="rounded-lg border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500">
                {t('trend.window')}
              </span>
            </div>
            <TrendChart trend={trend} locale={locale} empty={t('trend.empty')} />
            <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-slate-600">
              <Legend tone="good" label={t('trend.presence')} />
              <Legend tone="weak" label={t('trend.absence')} />
            </div>
          </section>

          {/* Alertes */}
          <section className="rounded-2xl border border-brand-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-800">{t('alerts.title')}</h2>
              <Link
                href={`/${locale}/admin/attendance/management`}
                className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                {t('alerts.seeAll')}
                {data.pendingJustifications > 0 ? ` (${data.pendingJustifications})` : ''}
              </Link>
            </div>
            {alerts.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">{t('alerts.empty')}</p>
            ) : (
              <ul className="space-y-2">
                {alerts.map((a) => (
                  <AlertRow key={a.studentId + a.kind} alert={a} locale={locale} t={t} />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/* ── Composants de présentation ───────────────────────────────────────────── */

function Kpi({
  icon,
  tone,
  label,
  value,
  hint,
  hintTone,
}: {
  icon: string;
  tone: 'emerald' | 'red' | 'amber' | 'sky';
  label: string;
  value: number;
  hint?: string;
  hintTone?: string;
}) {
  const bg: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
    sky: 'bg-sky-50 text-sky-600',
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-white p-4">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg ${bg[tone]}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-2xl font-bold tabular-nums text-slate-900">{value}</div>
        {hint && <div className={`text-xs ${hintTone ?? 'text-slate-400'}`}>{hint}</div>}
      </div>
    </div>
  );
}

function Legend({ tone, label }: { tone: 'good' | 'medium' | 'weak'; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${TONE_BAR[tone]}`} />
      {label}
    </span>
  );
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const tone =
    status === 'ABSENT'
      ? 'bg-red-100 text-red-800'
      : status === 'LATE'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-sky-100 text-sky-800';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{label}</span>
  );
}

/**
 * État de l'avis aux parents.
 *
 * Trois états et non deux : « pas d'adresse » n'est pas « pas prévenu par
 * négligence », et un échec technique doit se distinguer d'un envoi jamais
 * tenté, sinon on rappelle les mauvaises familles.
 */
function NotifiedPill({
  state,
  t,
}: {
  state: 'SENT' | 'FAILED' | 'SKIPPED' | null;
  t: (k: string) => string;
}) {
  if (state === 'SENT')
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
        {t('detail.yes')}
      </span>
    );
  if (state === 'FAILED')
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800">
        {t('detail.failed')}
      </span>
    );
  if (state === 'SKIPPED')
    return (
      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">
        {t('detail.noContact')}
      </span>
    );
  return (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800">
      {t('detail.no')}
    </span>
  );
}

function DonutLine({
  color,
  label,
  pct,
  count,
}: {
  color: string;
  label: string;
  pct: number;
  count: number;
}) {
  return (
    <li className="flex items-center gap-2">
      <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} />
      <span className="flex-1 text-slate-600">{label}</span>
      <span className="font-semibold tabular-nums text-slate-800">{pct} %</span>
      <span className="tabular-nums text-slate-400">({count})</span>
    </li>
  );
}

function Donut({ counts, total, label }: { counts: Counts; total: number; label: string }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const segs = donutSegments(counts, C);
  const color: Record<string, string> = {
    present: '#10b981',
    absent: '#ef4444',
    late: '#f59e0b',
  };
  return (
    <div className="relative mx-auto h-[150px] w-[150px]">
      <svg viewBox="0 0 130 130" className="h-full w-full -rotate-90">
        <circle cx="65" cy="65" r={R} fill="none" stroke="#f1f5f9" strokeWidth="20" />
        {segs.map((s) => (
          <circle
            key={s.key}
            cx="65"
            cy="65"
            r={R}
            fill="none"
            stroke={color[s.key]}
            strokeWidth="20"
            strokeDasharray={s.dash}
            strokeDashoffset={s.offset}
          />
        ))}
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="text-xl font-bold tabular-nums text-slate-900">{total}</div>
          <div className="text-[11px] text-slate-400">{label}</div>
        </div>
      </div>
    </div>
  );
}

function TrendChart({
  trend,
  locale,
  empty,
}: {
  trend: Array<{ date: string; presencePct: number; absencePct: number }>;
  locale: string;
  empty: string;
}) {
  if (trend.length === 0) {
    return <p className="py-10 text-center text-xs text-slate-400">{empty}</p>;
  }
  const W = 300;
  const H = 120;
  const opts = { width: W, height: H, padX: 6, padY: 8 };
  const presence = polylinePoints(
    trend.map((p) => p.presencePct),
    opts,
  );
  const absence = polylinePoints(
    trend.map((p) => p.absencePct),
    opts,
  );
  return (
    <div>
      <div className="flex gap-1">
        <div className="flex flex-col justify-between py-1 text-[9px] text-slate-400">
          {[100, 75, 50, 25, 0].map((v) => (
            <span key={v}>{v}%</span>
          ))}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[120px] w-full" preserveAspectRatio="none">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <line
              key={f}
              x1="0"
              x2={W}
              y1={8 + f * (H - 16)}
              y2={8 + f * (H - 16)}
              stroke="#f1f5f9"
              strokeWidth="1"
            />
          ))}
          <polyline points={presence} fill="none" stroke="#10b981" strokeWidth="2" />
          <polyline points={absence} fill="none" stroke="#ef4444" strokeWidth="2" />
        </svg>
      </div>
      <div className="mt-1 flex justify-between ps-6 text-[9px] text-slate-400">
        {trend.map((p) => (
          <span key={p.date}>
            {new Date(`${p.date}T12:00:00`).toLocaleDateString(locale, {
              day: '2-digit',
              month: 'short',
            })}
          </span>
        ))}
      </div>
    </div>
  );
}

function AlertRow({
  alert,
  locale,
  t,
}: {
  alert: Alert;
  locale: string;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const icon: Record<string, string> = {
    PROLONGED: '🚷',
    UNJUSTIFIED: '❗',
    FREQUENT_LATE: '⏱',
    MISSING_DOC: '📄',
  };
  return (
    <li className="flex gap-2.5 rounded-xl bg-slate-50 px-3 py-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-sm">
        {icon[alert.kind]}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-800">{t(`alerts.kind.${alert.kind}`)}</p>
        <p className="truncate text-[11px] text-slate-600">
          {alert.studentName} ({alert.className})
        </p>
        <p className="text-[11px] text-slate-400">
          {t(`alerts.detail.${alert.kind}`, { count: alert.count })} ·{' '}
          {new Date(`${alert.date}T12:00:00`).toLocaleDateString(locale, {
            day: '2-digit',
            month: 'short',
          })}
        </p>
      </div>
    </li>
  );
}

function PageLink({
  href,
  label,
  active,
  disabled,
}: {
  href: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
}) {
  const cls = 'grid h-7 min-w-[28px] place-items-center rounded-lg px-1.5 text-xs font-medium';
  if (disabled) return <span className={`${cls} text-slate-300`}>{label}</span>;
  return (
    <Link
      href={href}
      className={
        active
          ? `${cls} bg-brand-600 text-white`
          : `${cls} border border-slate-200 text-slate-600 hover:bg-slate-50`
      }
    >
      {label}
    </Link>
  );
}

/* ── Utilitaires ──────────────────────────────────────────────────────────── */

/** Jour ISO en UTC : les dates d'appel sont stockées en `@db.Date`. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Lundi de la semaine contenant `day`, au format ISO. */
function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return isoDay(d);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

function pillKey(status: string): 'absent' | 'late' | 'excused' {
  if (status === 'LATE') return 'late';
  if (status === 'EXCUSED') return 'excused';
  return 'absent';
}

/** Pagination compacte : 1 2 3 … 45, comme la maquette. */
function pageNumbers(page: number, count: number): Array<number | null> {
  if (count <= 5) return Array.from({ length: count }, (_, i) => i + 1);
  const out: Array<number | null> = [];
  const near = new Set([1, count, page, page - 1, page + 1]);
  for (let i = 1; i <= count; i++) {
    if (near.has(i)) out.push(i);
    else if (out[out.length - 1] !== null) out.push(null);
  }
  return out;
}
