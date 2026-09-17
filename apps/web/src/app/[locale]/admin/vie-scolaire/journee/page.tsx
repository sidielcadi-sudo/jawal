import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { requirePermission, isVieScolaireOnly } from '@/lib/auth/rbac';
import { toDateStr, addDays } from '@/lib/lesson-book';
import {
  loadDailyBoard,
  loadSlotDetail,
  loadMissingAppels,
  latestAppelDate,
  listEnrolledStudents,
  BOARD_COLS,
  type BoardCol,
  type DailyBoard,
  type SlotDetailRow,
  type MissingAppelRow,
} from '@/lib/vie-scolaire-board';
import { DashboardTabs } from '../../dashboard-tabs';
import { StudentSearch } from './student-search';
import { type Reason } from './row-actions';
import { slotLabel, MissingAppelPanel, SlotDetailPanel } from './board-parts';
import { SlotGrid } from '../../attendance/slot-board';
import { JourneeTabs } from './attendance-tabs';
import { PeriodBoard } from './period-board';
import { loadPeriodBoard } from '@/lib/vie-scolaire-period-board';
import { monthlyAttendance, topStudents } from '@/lib/attendance-stats';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';

/** Mois de l'année scolaire couverts par les onglets d'évolution. */
const MONTH_COUNT = 10;

export default async function VieScolaireBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    tab?: string;
    month?: string;
    yearNum?: string;
    date?: string;
    class?: string;
    student?: string;
    slot?: string;
    col?: string;
    cycle?: string;
  }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requirePermission('discipline.write');
  const t = await getTranslations('admin.vieScolaire.board');
  const td = await getTranslations('admin.dashboard');
  const ta = await getTranslations('admin.attendanceIndex');
  const session = (await auth())!;
  // Onglet Pilotage visible seulement pour admin/direction (pas pour le CPE).
  const showPilotage = !(await isVieScolaireOnly());

  // Date demandée explicitement, sinon on ouvre sur la dernière journée ayant des
  // appels (résolu côté tx) pour éviter une vue vide le jour courant.
  const explicitDate = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null;

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const date = explicitDate ?? (await latestAppelDate(tx)) ?? toDateStr(new Date());
    const year = await tx.academicYear.findFirst({
      where: { active: true },
      select: { id: true, startDate: true },
    });
    const classList = year
      ? await tx.class.findMany({
          where: { academicYearId: year.id, deletedAt: null },
          select: { id: true, name: true, nameAr: true, level: { select: { cycleId: true } } },
          orderBy: { name: 'asc' },
        })
      : [];
    // Tous · Primaire · Collège · Lycée, comme l’onglet « Par créneau » des absences.
    const cycles = await tx.cycle.findMany({
      orderBy: { order: 'asc' },
      select: { id: true, label: true, labelAr: true },
    });
    const cycleId = cycles.find((c) => c.id === sp.cycle)?.id ?? null;
    const cycleClasses = cycleId ? classList.filter((c) => c.level.cycleId === cycleId) : classList;
    const classId = cycleClasses.find((c) => c.id === sp.class)?.id ?? null;
    const scope = cycleId && !classId ? cycleClasses.map((c) => c.id) : null;

    const students = await listEnrolledStudents(tx);
    const studentId = students.find((s) => s.id === sp.student)?.id ?? null;
    const studentName = students.find((s) => s.id === studentId)?.name ?? null;

    const reasons: Reason[] = (
      await tx.attendanceReason.findMany({
        where: { active: true },
        orderBy: [{ order: 'asc' }, { label: 'asc' }],
        select: { id: true, label: true, color: true },
      })
    ).map((r) => ({ id: r.id, label: r.label, color: r.color }));

    const board: DailyBoard = await loadDailyBoard(tx, { date, classId, studentId, classIds: scope });

    let detail: { rows: SlotDetailRow[]; periodLabel: string; col: BoardCol } | null = null;
    let missing: { rows: MissingAppelRow[]; periodLabel: string } | null = null;
    if (sp.slot && sp.col === 'appelsNonFaits') {
      const rows = await loadMissingAppels(tx, { date, classId, studentId, classIds: scope, periodLabel: sp.slot });
      missing = { rows, periodLabel: sp.slot };
    } else if (sp.slot && sp.col && (BOARD_COLS as string[]).includes(sp.col)) {
      const col = sp.col as BoardCol;
      const rows = await loadSlotDetail(tx, { date, classId, studentId, classIds: scope, periodLabel: sp.slot, col });
      detail = { rows, periodLabel: sp.slot, col };
    }

    // Onglets d'analyse : évolution mensuelle et palmarès, sur l'année active.
    const monthly = await monthlyAttendance(tx, MONTH_COUNT, year ? new Date(year.startDate) : null);

    // Vue mensuelle : mois choisi, sinon celui de la date consultée.
    const monthParam = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? sp.month! : date.slice(0, 7);
    const [my, mm] = monthParam.split('-').map(Number);
    const monthBoard = await loadPeriodBoard(tx, {
      mode: 'month',
      from: new Date(Date.UTC(my!, mm! - 1, 1)),
      to: new Date(Date.UTC(my!, mm!, 1)),
      classId,
      studentId,
      locale,
    });

    // Vue annuelle : année civile choisie, sinon celle de la date consultée.
    const yearParam = /^\d{4}$/.test(sp.yearNum ?? '') ? Number(sp.yearNum) : Number(date.slice(0, 4));
    const yearBoard = await loadPeriodBoard(tx, {
      mode: 'year',
      from: new Date(Date.UTC(yearParam, 0, 1)),
      to: new Date(Date.UTC(yearParam + 1, 0, 1)),
      classId,
      studentId,
      locale,
    });
    const nameOf = (pp: {
      firstName: string;
      lastName: string;
      firstNameAr: string | null;
      lastNameAr: string | null;
    }) => personDisplayName(locale, pp);
    const labelOf = (l: string, la: string | null) => localizedLabel(locale, l, la);
    const [topAbsences, topLates] = await Promise.all([
      topStudents(tx, 'ABSENCE', 10, locale, nameOf, labelOf),
      topStudents(tx, 'LATE', 10, locale, nameOf, labelOf),
    ]);
    const monthStart = year ? new Date(year.startDate) : new Date();
    const monthLabels = Array.from({ length: MONTH_COUNT }, (_, k) =>
      new Date(
        Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + k, 1),
      ).toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' }),
    );

    return {
      date, classList: cycleClasses, cycles, cycleId, classId, students, studentId, studentName, reasons, board, detail, missing,
      monthly, monthLabels, topAbsences, topLates,
      monthBoard, yearBoard, monthParam, yearParam,
    };
  });

  const {
    date, classList, cycles, cycleId, classId, students, studentId, studentName, reasons, board, detail, missing,
    monthly, monthLabels, topAbsences, topLates,
    monthBoard, yearBoard, monthParam, yearParam,
  } = data;
  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString(locale, { dateStyle: 'full' });

  const qs = (over: Record<string, string | undefined>) => {
    const base: Record<string, string | undefined> = {
      date,
      cycle: cycleId ?? undefined,
      class: classId ?? undefined,
      student: studentId ?? undefined,
    };
    const merged = { ...base, ...over };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{td('bandTitle')}</h1>
      </header>
      <div className="mb-4">
        <DashboardTabs locale={locale} showPilotage={showPilotage} />
      </div>
      <JourneeTabs
        initialTab={sp.tab}
        monthView={
          <div>
            <form method="get" className="mb-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="tab" value="month" />
              {classId && <input type="hidden" name="class" value={classId} />}
              {studentId && <input type="hidden" name="student" value={studentId} />}
              <label className="block">
                <span className="block text-xs text-slate-500">{t('month')}</span>
                <input
                  type="month"
                  name="month"
                  defaultValue={monthParam}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                {t('apply')}
              </button>
            </form>
            <PeriodBoard
              rows={monthBoard.rows}
              totals={monthBoard.totals}
              firstColLabel={t('day')}
            />
          </div>
        }
        yearView={
          <div>
            <form method="get" className="mb-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="tab" value="year" />
              {classId && <input type="hidden" name="class" value={classId} />}
              {studentId && <input type="hidden" name="student" value={studentId} />}
              <label className="block">
                <span className="block text-xs text-slate-500">{t('year')}</span>
                <input
                  type="number"
                  name="yearNum"
                  min={2000}
                  max={2100}
                  defaultValue={yearParam}
                  className="mt-1 w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                {t('apply')}
              </button>
            </form>
            <PeriodBoard
              rows={yearBoard.rows}
              totals={yearBoard.totals}
              firstColLabel={t('monthCol')}
            />
          </div>
        }
        labels={monthLabels}
        monthly={monthly}
        topAbsences={topAbsences}
        topLates={topLates}
        board={
          <>
      {cycles.length > 0 && (
        <nav className="mt-4 flex flex-wrap items-center gap-2">
          {[
            { id: null as string | null, label: ta('cycleAll') },
            ...cycles.map((c) => ({ id: c.id as string | null, label: localizedLabel(locale, c.label, c.labelAr) })),
          ].map((c) => (
            <Link
              key={c.id ?? 'all'}
              href={qs({ cycle: c.id ?? undefined, class: undefined, student: undefined, slot: undefined, col: undefined })}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
                cycleId === c.id
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {c.label}
            </Link>
          ))}
        </nav>
      )}

      {/* Barre d'outils : date, classe, élève */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Link
            href={qs({ date: addDays(date, -1), slot: undefined, col: undefined })}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-50"
            aria-label={t('prevDay')}
          >
            ‹
          </Link>
          <form method="get" className="flex items-center gap-1">
            {cycleId && <input type="hidden" name="cycle" value={cycleId} />}
            {classId && <input type="hidden" name="class" value={classId} />}
            {studentId && <input type="hidden" name="student" value={studentId} />}
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
            />
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t('apply')}
            </button>
          </form>
          <Link
            href={qs({ date: addDays(date, 1), slot: undefined, col: undefined })}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-50"
            aria-label={t('nextDay')}
          >
            ›
          </Link>
        </div>

        <span className="text-sm font-medium capitalize text-slate-700">{dateLabel}</span>

        <div className="ms-auto flex flex-wrap items-center gap-2">
          {/* Filtre classe (GET) */}
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="date" value={date} />
            {cycleId && <input type="hidden" name="cycle" value={cycleId} />}
            <select
              name="class"
              defaultValue={classId ?? ''}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
            >
              <option value="">{t('allClasses')}</option>
              {classList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t('apply')}
            </button>
          </form>

          {/* Recherche élève (autocomplétion) */}
          <StudentSearch
            students={students}
            date={date}
            classId={classId}
            currentId={studentId}
            currentName={studentName}
          />
        </div>
      </div>

      {/* Même grille que l’onglet « Par créneau » d’Absences et Justif : créneaux en
          colonnes, types en lignes. */}
      <SlotGrid
        board={board}
        hrefFor={(slot, c) => qs({ slot, col: c })}
        rowLabel={(key) => ta(`slot.rows.${key}` as never)}
        headerLabel={ta('slot.typeHeader')}
        totalLabel={ta('slot.total')}
        emptyLabel={ta('slot.empty')}
        activeSlot={sp.slot}
        activeCol={sp.col}
      />
      {missing && (
        <MissingAppelPanel missing={missing} date={date} t={t} slotFmtLabel={slotLabel(missing.periodLabel)} />
      )}
      {detail && (
        <SlotDetailPanel
          detail={detail}
          reasons={reasons}
          locale={locale}
          t={t}
          slotFmtLabel={slotLabel(detail.periodLabel)}
        />
      )}
          </>
        }
      />
    </div>
  );
}

