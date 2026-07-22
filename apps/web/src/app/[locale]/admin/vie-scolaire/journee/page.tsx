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
import { RaCheckbox, MotifPicker, NotifyAppelButton, type Reason } from './row-actions';

// Colonnes du tableau, dans l'ordre Pronote. `data` = alimentée ; `placeholder`
// = grisée (modèle à venir) ; `convocations` = compteur niveau jour.
type ColDef =
  | { key: BoardCol; kind: 'data'; clickable: boolean }
  | { key: string; kind: 'placeholder' }
  | { key: 'convocations'; kind: 'convocations' };

const COLUMNS: ColDef[] = [
  { key: 'absRA', kind: 'data', clickable: true },
  { key: 'absNonRA', kind: 'data', clickable: true },
  { key: 'retards', kind: 'data', clickable: true },
  { key: 'exclCours', kind: 'data', clickable: true },
  { key: 'incidents', kind: 'data', clickable: true },
  { key: 'punitionsProg', kind: 'placeholder' },
  { key: 'convocations', kind: 'convocations' },
  { key: 'exclEtab', kind: 'placeholder' },
  { key: 'exclClasse', kind: 'placeholder' },
  { key: 'infirmerie', kind: 'data', clickable: true },
  { key: 'ensMaison', kind: 'placeholder' },
  { key: 'presents', kind: 'data', clickable: true },
  { key: 'elevesSansCours', kind: 'placeholder' },
  { key: 'appelsNonFaits', kind: 'data', clickable: true },
];

// Colonnes masquées pour gagner de la place (demande Vie scolaire).
const HIDDEN = new Set(['exclClasse', 'ensMaison', 'infirmerie']);
const VISIBLE = COLUMNS.filter((c) => !HIDDEN.has(c.key));
// Colonnes hors groupe « Absences » (rendu en-tête sur 2 lignes).
const SINGLE = VISIBLE.filter((c) => c.key !== 'absRA' && c.key !== 'absNonRA');

const slotFmt = (s: string) => s.replace(':', 'h');
function slotLabel(periodLabel: string): string {
  const [a, b] = periodLabel.split('-');
  return `${slotFmt(a ?? '')} - ${slotFmt(b ?? '')}`;
}

export default async function VieScolaireBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    date?: string;
    class?: string;
    student?: string;
    slot?: string;
    col?: string;
  }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requirePermission('discipline.write');
  const t = await getTranslations('admin.vieScolaire.board');
  const td = await getTranslations('admin.dashboard');
  const session = (await auth())!;
  // Onglet Pilotage visible seulement pour admin/direction (pas pour le CPE).
  const showPilotage = !(await isVieScolaireOnly());

  // Date demandée explicitement, sinon on ouvre sur la dernière journée ayant des
  // appels (résolu côté tx) pour éviter une vue vide le jour courant.
  const explicitDate = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null;

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const date = explicitDate ?? (await latestAppelDate(tx)) ?? toDateStr(new Date());
    const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
    const classList = year
      ? await tx.class.findMany({
          where: { academicYearId: year.id, deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : [];
    const classId = classList.find((c) => c.id === sp.class)?.id ?? null;

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

    const board: DailyBoard = await loadDailyBoard(tx, { date, classId, studentId });

    let detail: { rows: SlotDetailRow[]; periodLabel: string; col: BoardCol } | null = null;
    let missing: { rows: MissingAppelRow[]; periodLabel: string } | null = null;
    if (sp.slot && sp.col === 'appelsNonFaits') {
      const rows = await loadMissingAppels(tx, { date, classId, studentId, periodLabel: sp.slot });
      missing = { rows, periodLabel: sp.slot };
    } else if (sp.slot && sp.col && (BOARD_COLS as string[]).includes(sp.col)) {
      const col = sp.col as BoardCol;
      const rows = await loadSlotDetail(tx, { date, classId, studentId, periodLabel: sp.slot, col });
      detail = { rows, periodLabel: sp.slot, col };
    }

    return { date, classList, classId, students, studentId, studentName, reasons, board, detail, missing };
  });

  const { date, classList, classId, students, studentId, studentName, reasons, board, detail, missing } =
    data;
  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString(locale, { dateStyle: 'full' });

  const qs = (over: Record<string, string | undefined>) => {
    const base: Record<string, string | undefined> = {
      date,
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
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h2 className="text-base font-bold text-slate-900">{t('title')}</h2>
      </header>

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

      <DailyGrid board={board} qs={qs} t={t} activeSlot={sp.slot} activeCol={sp.col} />
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
    </div>
  );
}

function MissingAppelPanel({
  missing,
  date,
  t,
  slotFmtLabel,
}: {
  missing: { rows: MissingAppelRow[]; periodLabel: string };
  date: string;
  t: Tr;
  slotFmtLabel: string;
}) {
  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-brand-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
        {t('appel.title', { slot: slotFmtLabel })}
        <span className="ms-2 text-xs font-normal text-slate-400">
          {t('appel.count', { count: missing.rows.length })}
        </span>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-slate-100 table-head text-xs uppercase tracking-wide text-slate-700">
          <tr>
            <th className="px-4 py-2 text-start">{t('appel.teacher')}</th>
            <th className="px-4 py-2 text-start">{t('col.class')}</th>
            <th className="px-4 py-2 text-start">{t('col.subject')}</th>
            <th className="px-4 py-2 text-end">{t('col.action')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {missing.rows.map((r) => (
            <tr key={r.entryId}>
              <td className="px-4 py-2 font-medium text-slate-800">{r.teacherName ?? t('appel.noTeacher')}</td>
              <td className="px-4 py-2 text-xs text-slate-600">{r.className}</td>
              <td className="px-4 py-2 text-xs text-slate-600">{r.subject ?? '—'}</td>
              <td className="px-4 py-2 text-end">
                <NotifyAppelButton
                  teacherUserId={r.teacherUserId}
                  classId={r.classId}
                  periodLabel={missing.periodLabel}
                  date={date}
                />
              </td>
            </tr>
          ))}
          {missing.rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-xs text-slate-400">
                {t('appel.empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

type Tr = (k: string, v?: Record<string, string | number>) => string;
type Qs = (over: Record<string, string | undefined>) => string;

function DailyGrid({
  board,
  qs,
  t,
  activeSlot,
  activeCol,
}: {
  board: DailyBoard;
  qs: Qs;
  t: Tr;
  activeSlot?: string;
  activeCol?: string;
}) {
  const totalCols = VISIBLE.length + 1;
  return (
    <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <th rowSpan={2} className="sticky start-0 z-10 bg-slate-50 px-3 py-2 text-start font-semibold">
              {t('slot')}
            </th>
            <th colSpan={2} className="border-x border-slate-200 px-2 py-1 text-center font-semibold">
              {t('absencesGroup')}
            </th>
            {SINGLE.map((col) => (
              <th
                key={col.key}
                rowSpan={2}
                className={`px-2 py-2 text-center font-semibold ${col.kind === 'placeholder' ? 'text-slate-300' : ''}`}
              >
                {t(`cols.${col.key}`)}
              </th>
            ))}
          </tr>
          <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <th className="border-s border-slate-200 px-2 py-1 text-center font-semibold">{t('cols.absRA')}</th>
            <th className="border-e border-slate-200 px-2 py-1 text-center font-semibold">{t('cols.absNonRA')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {board.rows.map((row) => (
            <tr key={row.periodLabel} className="hover:bg-slate-50/60">
              <td className="sticky start-0 z-10 bg-white px-3 py-2 text-xs font-medium text-slate-600">
                {slotLabel(row.periodLabel)}
                {row.label && <span className="ms-1 text-[10px] text-slate-400">· {row.label}</span>}
              </td>
              {VISIBLE.map((col) => (
                <Cell
                  key={col.key}
                  col={col}
                  row={row}
                  qs={qs}
                  active={activeSlot === row.periodLabel && activeCol === col.key}
                />
              ))}
            </tr>
          ))}
          {board.rows.length === 0 && (
            <tr>
              <td colSpan={totalCols} className="px-4 py-8 text-center text-sm text-slate-400">
                {t('noSlots')}
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
            <td className="sticky start-0 z-10 bg-slate-50 px-3 py-2">{t('total')}</td>
            {VISIBLE.map((col) => (
              <td key={col.key} className="px-2 py-2 text-center tabular-nums">
                {col.kind === 'data' ? (
                  board.totals[col.key] || <span className="text-slate-300">—</span>
                ) : col.kind === 'convocations' ? (
                  board.convocations || <span className="text-slate-300">—</span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Cell({
  col,
  row,
  qs,
  active,
}: {
  col: ColDef;
  row: DailyBoard['rows'][number];
  qs: Qs;
  active: boolean;
}) {
  if (col.kind !== 'data') {
    // Placeholder grisé ou convocations (niveau jour → total en pied de grille).
    return (
      <td className="px-2 py-2 text-center text-slate-300">
        <span aria-hidden>—</span>
      </td>
    );
  }
  const value = row.counts[col.key];
  const base = 'block rounded px-2 py-1 text-center tabular-nums';
  if (value === 0) {
    return (
      <td className="px-1 py-1 text-center text-slate-300">
        <span className={base}>0</span>
      </td>
    );
  }
  const tone =
    col.key === 'presents'
      ? 'text-emerald-700'
      : col.key === 'absNonRA'
        ? 'text-red-700'
        : 'text-slate-800';
  if (!col.clickable) {
    return (
      <td className="px-1 py-1">
        <span className={`${base} font-semibold ${tone}`}>{value}</span>
      </td>
    );
  }
  return (
    <td className="px-1 py-1">
      <Link
        href={qs({ slot: row.periodLabel, col: col.key })}
        className={`${base} font-semibold ${tone} hover:bg-brand-50 ${active ? 'ring-2 ring-brand-400' : ''}`}
      >
        {value}
      </Link>
    </td>
  );
}

const CAT_TONE: Record<string, string> = {
  ABSENT: 'bg-red-100 text-red-700',
  EXCLUSION: 'bg-orange-100 text-orange-700',
  LATE: 'bg-amber-100 text-amber-800',
  INFIRMARY: 'bg-sky-100 text-sky-700',
  PUNISHMENT: 'bg-purple-100 text-purple-700',
  EXCUSED: 'bg-slate-100 text-slate-600',
  PRESENT: 'bg-emerald-100 text-emerald-700',
};

function CategoryBadge({ category, t }: { category: string; t: Tr }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${CAT_TONE[category] ?? 'bg-slate-100 text-slate-700'}`}>
      {t(`cat.${category}`)}
    </span>
  );
}

function JustifBadge({ status, t }: { status: 'PENDING' | 'APPROVED' | 'REJECTED' | null; t: Tr }) {
  if (!status) return <span className="text-slate-400">—</span>;
  const tone =
    status === 'APPROVED' ? 'text-emerald-700' : status === 'REJECTED' ? 'text-red-700' : 'text-amber-700';
  return <span className={tone}>{t(`justif.${status}`)}</span>;
}

function SlotDetailPanel({
  detail,
  reasons,
  locale,
  t,
  slotFmtLabel,
}: {
  detail: { rows: SlotDetailRow[]; periodLabel: string; col: BoardCol };
  reasons: Reason[];
  locale: string;
  t: Tr;
  slotFmtLabel: string;
}) {
  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-brand-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
        {t('detailTitle', { slot: slotFmtLabel, col: t(`cols.${detail.col}`) })}
        <span className="ms-2 text-xs font-normal text-slate-400">
          {t('detailCount', { count: detail.rows.length })}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 table-head text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-4 py-2 text-start">{t('col.student')}</th>
              <th className="px-4 py-2 text-start">{t('col.class')}</th>
              <th className="px-4 py-2 text-start">{t('col.category')}</th>
              <th className="px-4 py-2 text-start">{t('col.subject')}</th>
              <th className="px-4 py-2 text-start">{t('col.motif')}</th>
              <th className="px-4 py-2 text-start">{t('col.justif')}</th>
              <th className="px-2 py-2 text-center">{t('col.ra')}</th>
              <th className="px-2 py-2 text-center">{t('col.action')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {detail.rows.map((r) => {
              const absenceLike = r.category === 'ABSENT' || r.category === 'EXCLUSION';
              const motif = r.reasonLabel ?? (absenceLike ? t('sansExcuses') : r.note ?? '—');
              return (
                <tr key={r.recordId}>
                  <td className="px-4 py-2">
                    <Link
                      href={`/${locale}/admin/persons/${r.studentId}`}
                      className="font-medium text-slate-800 hover:text-brand-700 hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">{r.className}</td>
                  <td className="px-4 py-2">
                    <CategoryBadge category={r.category} t={t} />
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">
                    {r.subject ?? '—'}
                    {r.teacher && <span className="ms-1 text-slate-400">· {r.teacher}</span>}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-700">{motif}</td>
                  <td className="px-4 py-2 text-xs">
                    <JustifBadge status={r.justifStatus} t={t} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    {r.category !== 'PRESENT' ? (
                      <RaCheckbox recordId={r.recordId} checked={r.isRA} />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    {r.category !== 'PRESENT' ? (
                      <MotifPicker recordId={r.recordId} reasons={reasons} currentReasonId={r.reasonId} />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {detail.rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-xs text-slate-400">
                  {t('noEvent')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
