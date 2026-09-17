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
import {
  BOARD_COLS,
  loadDailyBoard,
  loadMissingAppels,
  loadSlotDetail,
  type BoardCol,
} from '@/lib/vie-scolaire-board';
import { clampDay } from '@/lib/year-bounds';
import { AttendanceFilters } from './filters';
import { NotifyButton } from './notify-button';
import { SlotGrid } from './slot-board';
import {
  MissingAppelPanel,
  SlotDetailPanel,
  slotLabel,
} from '../vie-scolaire/journee/board-parts';

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
  punished: number;
  excluded: number;
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

/**
 * Absences et Justif — deux lectures d'une même journée.
 *
 * - **Par classe** : vue d'ensemble, détail des absences et retards, tendances.
 * - **Par créneau** : le tableau de bord journalier de la vie scolaire, les
 *   créneaux en colonnes et les types d'absence en lignes.
 *
 * Tout est borné à l'année scolaire active : une date hors de l'année est
 * ramenée à sa borne, et les fenêtres glissantes ne remontent pas avant la
 * rentrée.
 */
export default async function AdminAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    view?: string;
    date?: string;
    cycle?: string;
    class?: string;
    q?: string;
    page?: string;
    size?: string;
    slot?: string;
    col?: string;
  }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRoleCode(['tenant_admin', 'direction', 'scolarite', 'cpe']);

  const session = (await auth())!;
  const tenantId = session.user.tenantId;
  const t = await getTranslations('admin.attendanceIndex');
  const tStatus = await getTranslations('admin.attendance.status');
  const view: 'class' | 'slot' = sp.view === 'slot' ? 'slot' : 'class';

  /* ── Cadre commun : année active, cycles, classes, créneaux ─────────── */
  const frame = await withTenant(tenantId, async (tx) => {
    const year = await tx.academicYear.findFirst({
      where: { active: true },
      select: { id: true, label: true, startDate: true, endDate: true },
    });
    if (!year) return null;
    const [classes, slots, cycleRows] = await Promise.all([
      tx.class.findMany({
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
              cycleId: true,
              cycle: { select: { id: true, label: true, labelAr: true, order: true } },
            },
          },
        },
        orderBy: [{ level: { order: 'asc' } }, { name: 'asc' }],
      }),
      tx.timetableSlot.findMany({
        where: { isBreak: false },
        select: { startTime: true, endTime: true, label: true },
      }),
      // Tous les cycles de l'établissement, comme les boutons de la page Élèves.
      tx.cycle.findMany({
        orderBy: { order: 'asc' },
        select: { id: true, label: true, labelAr: true, order: true },
      }),
    ]);
    return { year, classes, slots, cycles: cycleRows };
  });

  if (!frame) {
    return (
      <div className="px-3 py-3">
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {t('noYear')}
        </p>
      </div>
    );
  }

  const today = isoDay(new Date());
  const yearStart = isoDay(frame.year.startDate);
  const yearEnd = isoDay(frame.year.endDate);
  const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? sp.date! : today;
  const dateStr = clampDay(requestedDate, yearStart, yearEnd);
  const date = new Date(`${dateStr}T00:00:00.000Z`);

  const cycles = frame.cycles;
  const cycleFilter = cycles.find((c) => c.id === sp.cycle)?.id ?? null;
  const cycleClasses = cycleFilter
    ? frame.classes.filter((c) => c.level.cycleId === cycleFilter)
    : frame.classes;
  const classFilter =
    sp.class && sp.class !== 'all' && cycleClasses.some((c) => c.id === sp.class) ? sp.class : null;
  const scopedIds = classFilter ? [classFilter] : cycleClasses.map((c) => c.id);

  /* ── Liens ─────────────────────────────────────────────────────────── */
  const base = `/${locale}/admin/attendance`;
  const link = (patch: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = {
      view: view === 'slot' ? 'slot' : undefined,
      date: dateStr,
      cycle: cycleFilter ?? undefined,
      class: classFilter ?? undefined,
      ...patch,
    };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
    return `${base}?${qs.toString()}`;
  };
  const exportHref = `/api/admin/exports/attendance.csv?date=${dateStr}${
    classFilter ? `&class=${classFilter}` : ''
  }`;

  /** Créneau horaire lisible d'une séance : « 08h00 - 09h00 · M1 ». */
  const slotName = new Map(frame.slots.map((s) => [`${s.startTime}-${s.endTime}`, s.label]));
  const slotText = (periodLabel: string | null) => {
    if (!periodLabel) return null;
    if (!/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(periodLabel)) return periodLabel;
    const name = slotName.get(periodLabel);
    return name ? `${slotLabel(periodLabel)} · ${name}` : slotLabel(periodLabel);
  };

  /* ── En-tête, onglets, cycles, filtres : communs aux deux vues ─────── */
  const chrome = (
    <>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/${locale}/admin/attendance/management`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t('justification')}
          </Link>
          <a
            href={exportHref}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <span aria-hidden>⭳</span> {t('export')}
          </a>
        </div>
      </header>

      <nav className="folder-tabs mb-4">
        <Link
          href={link({ view: undefined, slot: undefined, col: undefined })}
          className={`folder-tab ${view === 'class' ? 'is-active' : ''}`}
        >
          {t('tabs.byClass')}
        </Link>
        <Link href={link({ view: 'slot' })} className={`folder-tab ${view === 'slot' ? 'is-active' : ''}`}>
          {t('tabs.bySlot')}
        </Link>
      </nav>

      {/* Tous · Primaire · Collège · Lycée — comme la page Élèves. */}
      {cycles.length > 0 && (
        <nav className="mb-3 flex flex-wrap items-center gap-2">
          <CycleTab
            href={link({ cycle: undefined, class: undefined, slot: undefined, col: undefined })}
            label={t('cycleAll')}
            active={!cycleFilter}
          />
          {cycles.map((c) => (
            <CycleTab
              key={c.id}
              href={link({ cycle: c.id, class: undefined, slot: undefined, col: undefined })}
              label={localizedLabel(locale, c.label, c.labelAr)}
              active={cycleFilter === c.id}
            />
          ))}
        </nav>
      )}

      <AttendanceFilters
        base={base}
        date={dateStr}
        today={today}
        minDate={yearStart}
        maxDate={yearEnd}
        classId={classFilter ?? 'all'}
        classes={cycleClasses.map((c) => ({
          id: c.id,
          label: localizedLabel(locale, c.name, c.nameAr),
        }))}
        allLabel={t('allClasses')}
        todayLabel={t('todayIs')}
        keep={{ view: view === 'slot' ? 'slot' : undefined, cycle: cycleFilter ?? undefined }}
      />

      {requestedDate !== dateStr && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          {t('outOfYear', { date: dateStr })}
        </p>
      )}
    </>
  );

  /* ════ Onglet « Par créneau » ═════════════════════════════════════════ */
  if (view === 'slot') {
    const tb = await getTranslations('admin.vieScolaire.board');
    const col = sp.col && (BOARD_COLS as string[]).includes(sp.col) ? (sp.col as BoardCol) : null;
    // Tous les cycles, toutes les classes : pas de restriction, l'emploi du
    // temps de l'année active délimite déjà le périmètre.
    const scope = cycleFilter || classFilter ? scopedIds : null;

    const slotData = await withTenant(tenantId, async (tx) => {
      const board = await loadDailyBoard(tx, { date: dateStr, classIds: scope });
      const missing =
        sp.slot && col === 'appelsNonFaits'
          ? {
              rows: await loadMissingAppels(tx, { date: dateStr, classIds: scope, periodLabel: sp.slot }),
              periodLabel: sp.slot,
            }
          : null;
      const detail =
        sp.slot && col && col !== 'appelsNonFaits'
          ? {
              rows: await loadSlotDetail(tx, { date: dateStr, classIds: scope, periodLabel: sp.slot, col }),
              periodLabel: sp.slot,
              col,
            }
          : null;
      const reasons = (
        await tx.attendanceReason.findMany({
          where: { active: true },
          orderBy: [{ order: 'asc' }, { label: 'asc' }],
          select: { id: true, label: true, color: true },
        })
      ).map((r) => ({ id: r.id, label: r.label, color: r.color }));
      return { board, missing, detail, reasons };
    });

    return (
      <div className="px-3 py-3">
        {chrome}
        <SlotGrid
          board={slotData.board}
          hrefFor={(slot, c) => link({ slot, col: c })}
          rowLabel={(key) => t(`slot.rows.${key}` as never)}
          headerLabel={t('slot.typeHeader')}
          totalLabel={t('slot.total')}
          emptyLabel={t('slot.empty')}
          activeSlot={sp.slot}
          activeCol={sp.col}
        />
        {slotData.missing && (
          <MissingAppelPanel
            missing={slotData.missing}
            date={dateStr}
            t={tb as never}
            slotFmtLabel={slotLabel(slotData.missing.periodLabel)}
          />
        )}
        {slotData.detail && (
          <SlotDetailPanel
            detail={slotData.detail}
            reasons={slotData.reasons}
            locale={locale}
            t={tb as never}
            slotFmtLabel={slotLabel(slotData.detail.periodLabel)}
          />
        )}
      </div>
    );
  }

  /* ════ Onglet « Par classe » ══════════════════════════════════════════ */
  const windowStartRaw = new Date(date);
  windowStartRaw.setUTCDate(windowStartRaw.getUTCDate() - WINDOW_DAYS);
  // La fenêtre ne remonte pas avant la rentrée.
  const windowStart = windowStartRaw < frame.year.startDate ? frame.year.startDate : windowStartRaw;

  const data = await withTenant(tenantId, async (tx) => {
    const classes = await tx.class.findMany({
      where: { id: { in: scopedIds } },
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
                punishment: true,
                exclusion: true,
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

    // Fenêtre glissante, sur le périmètre choisi : comptages par jour pour la
    // courbe…
    const windowSessions = await tx.attendanceSession.findMany({
      where: { date: { gte: windowStart, lte: date }, classId: { in: scopedIds } },
      select: { date: true, classId: true, records: { select: { status: true } } },
    });

    // …et détail des incidents pour les alertes.
    const windowIncidents = await tx.attendanceSession.findMany({
      where: { date: { gte: windowStart, lte: date }, classId: { in: scopedIds } },
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

    // Justificatifs en attente de l'année active.
    const pendingJustifications = await tx.absenceJustification.count({
      where: {
        status: 'PENDING',
        attendanceRecord: { session: { class: { academicYearId: frame.year.id } } },
      },
    });

    // Dernier jour réellement pointé dans l'année active, sur le périmètre :
    // sert à l'invite quand la date demandée est vide.
    const lastSession = await tx.attendanceSession.findFirst({
      where: { classId: { in: scopedIds }, date: { lte: frame.year.endDate } },
      orderBy: { date: 'desc' },
      select: { date: true },
    });

    // Exclusions du jour : signalées dans le carnet de correspondance.
    const exclusions = await tx.carnetEntry.groupBy({
      by: ['classId'],
      where: { type: 'EXCLUSION', occurredAt: { gte: dayStart, lte: dayEnd }, classId: { in: scopedIds } },
      _count: { _all: true },
    });

    return {
      classes,
      exclusions,
      notices,
      noticesSent,
      windowSessions,
      windowIncidents,
      pendingJustifications,
      lastDay: lastSession ? isoDay(lastSession.date) : null,
    };
  });

  /* ── Mise en forme ────────────────────────────────────────────────────── */

  const noticeByRecord = new Map<string, 'SENT' | 'FAILED' | 'SKIPPED'>();
  for (const n of data.notices) {
    if (n.relatedId) noticeByRecord.set(n.relatedId, n.status as 'SENT' | 'FAILED' | 'SKIPPED');
  }

  const rows: ClassRow[] = data.classes.map((cls) => {
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
      // Marqueurs cumulables avec la présence : un élève présent peut être puni.
      punished: records.filter((r) => r.punishment).length,
      excluded: data.exclusions.find((x) => x.classId === cls.id)?._count._all ?? 0,
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
  const allIncidents: IncidentRow[] = data.classes.flatMap((cls) =>
    cls.attendanceSessions.flatMap((s) =>
      s.records
        .filter((r) => r.status !== 'PRESENT')
        .map<IncidentRow>((r) => ({
          recordId: r.id,
          studentId: r.student.id,
          studentName: personDisplayName(locale, r.student),
          className: localizedLabel(locale, cls.name, cls.nameAr),
          classId: cls.id,
          time: slotText(s.periodLabel),
          status: r.status as IncidentRow['status'],
          reason: r.lateReason?.label ?? r.justification?.reason ?? r.note ?? null,
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

  const href = (patch: Record<string, string | undefined>) =>
    link({
      q: sp.q || undefined,
      size: size !== 5 ? String(size) : undefined,
      page: page !== 1 ? String(page) : undefined,
      ...patch,
    });
  const anyCall = rows.some((r) => r.sessionId);

  return (
    <div className="px-3 py-3">
      {chrome}

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
                    <th className="px-3 py-3 text-end">{t('byClass.present')}</th>
                    <th className="px-3 py-3 text-end">{t('byClass.absent')}</th>
                    <th className="px-3 py-3 text-end">{t('byClass.late')}</th>
                    <th className="px-3 py-3 text-end">{t('byClass.punished')}</th>
                    <th className="px-3 py-3 text-end">{t('byClass.excluded')}</th>
                    <th className="px-3 py-3 text-end">{t('byClass.exempt')}</th>
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
                        <td className="px-3 py-2.5 text-end tabular-nums text-slate-700">
                          {r.sessionId ? r.present : '—'}
                        </td>
                        <CountCell value={r.absent} taken={Boolean(r.sessionId)} tone="text-red-700" />
                        <CountCell value={r.late} taken={Boolean(r.sessionId)} tone="text-amber-700" />
                        <CountCell value={r.punished} taken={Boolean(r.sessionId)} tone="text-purple-700" />
                        <CountCell value={r.excluded} taken={Boolean(r.sessionId)} tone="text-orange-700" />
                        <CountCell value={r.excused} taken={Boolean(r.sessionId)} tone="text-sky-700" />
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
                      <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
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
                {cycleFilter && <input type="hidden" name="cycle" value={cycleFilter} />}
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
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-slate-600">
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

function CycleTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-brand-600 text-white'
          : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {label}
    </Link>
  );
}

function CountCell({ value, taken, tone }: { value: number; taken: boolean; tone: string }) {
  return (
    <td className="px-3 py-2.5 text-end tabular-nums">
      <span className={value > 0 ? tone : 'text-slate-400'}>{taken ? value : '—'}</span>
    </td>
  );
}

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
