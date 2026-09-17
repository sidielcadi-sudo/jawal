import 'server-only';
import { BOARD_COLS, type BoardCol } from '@/lib/vie-scolaire-board';
import { categoryOf } from '@/lib/attendance-category';

type Tx = Parameters<Parameters<typeof import('@/lib/db').withTenant>[1]>[0];
type Counts = Record<BoardCol, number>;

const zeroCounts = (): Counts => ({
  absRA: 0,
  absNonRA: 0,
  retards: 0,
  exclCours: 0,
  incidents: 0,
  infirmerie: 0,
  presents: 0,
  appelsNonFaits: 0,
});

export type PeriodBoardRow = {
  /** Clé de la ligne : `YYYY-MM-DD` en vue mensuelle, `YYYY-MM` en annuelle. */
  key: string;
  label: string;
  counts: Counts;
};

export type PeriodBoard = { rows: PeriodBoardRow[]; totals: Counts };

/**
 * Même lecture que le tableau de bord journalier, mais agrégée dans le temps :
 * une ligne par jour du mois, ou par mois de l'année.
 *
 * La colonne « appels non faits » n'est pas reprise : la calculer exigerait de
 * reconstituer, pour chaque jour, les créneaux attendus par l'emploi du temps —
 * coûteux sur une année entière, et sans usage à cette maille. Elle reste donc
 * à zéro plutôt que d'afficher un chiffre approximatif.
 */
export async function loadPeriodBoard(
  tx: Tx,
  {
    mode,
    from,
    to,
    classId,
    studentId,
    locale,
  }: {
    mode: 'month' | 'year';
    from: Date;
    /** Borne haute exclue. */
    to: Date;
    classId?: string | null;
    studentId?: string | null;
    locale: string;
  },
): Promise<PeriodBoard> {
  // Un élève sélectionné définit le périmètre, comme dans la vue journalière.
  let scopeClassIds: string[] | null = null;
  if (studentId) {
    const scs = await tx.studentClass.findMany({
      where: { studentId, unenrolledAt: null },
      select: { classId: true },
    });
    scopeClassIds = scs.map((s) => s.classId);
  } else if (classId) {
    scopeClassIds = [classId];
  }

  // Bornes de l'année active : la vue « année » est une année civile, qui
  // chevauche deux exercices ; seuls les pointages de l'année active comptent.
  const activeYear = await tx.academicYear.findFirst({
    where: { active: true },
    select: { startDate: true, endDate: true },
  });
  const yearEndExcl = activeYear ? new Date(activeYear.endDate.getTime() + 86_400_000) : null;
  const gte = activeYear && from < activeYear.startDate ? activeYear.startDate : from;
  const lt = yearEndExcl && to > yearEndExcl ? yearEndExcl : to;

  const records = await tx.attendanceRecord.findMany({
    where: {
      ...(studentId ? { studentId } : {}),
      session: {
        finalizedAt: { not: null },
        date: { gte, lt },
        ...(scopeClassIds ? { classId: { in: scopeClassIds } } : {}),
      },
    },
    select: {
      status: true,
      infirmary: true,
      punishment: true,
      exclusion: true,
      justification: { select: { status: true } },
      session: { select: { date: true } },
    },
  });

  // Lignes préconstruites : un jour ou un mois sans pointage doit apparaître
  // à zéro, pas disparaître de la grille.
  const rows: PeriodBoardRow[] = [];
  const index = new Map<string, PeriodBoardRow>();
  if (mode === 'month') {
    for (let d = new Date(from); d < to; d = new Date(d.getTime() + 86_400_000)) {
      const key = d.toISOString().slice(0, 10);
      const row = {
        key,
        label: d.toLocaleDateString(locale, {
          weekday: 'short',
          day: '2-digit',
          timeZone: 'UTC',
        }),
        counts: zeroCounts(),
      };
      rows.push(row);
      index.set(key, row);
    }
  } else {
    for (
      let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
      d < to;
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    ) {
      const key = d.toISOString().slice(0, 7);
      const row = {
        key,
        label: d.toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }),
        counts: zeroCounts(),
      };
      rows.push(row);
      index.set(key, row);
    }
  }

  const totals = zeroCounts();
  for (const r of records) {
    const iso = r.session.date.toISOString();
    const key = mode === 'month' ? iso.slice(0, 10) : iso.slice(0, 7);
    const row = index.get(key);
    if (!row) continue;
    const cat = categoryOf(r);
    const justified = r.justification?.status === 'APPROVED';

    // Mêmes règles que la vue journalière, exprimées sur la catégorie unique.
    const hits: BoardCol[] = [];
    if (cat === 'ABSENT') hits.push(justified ? 'absRA' : 'absNonRA');
    else if (cat === 'LATE') hits.push('retards');
    else if (cat === 'INFIRMARY') hits.push('infirmerie');
    else if (cat === 'PUNISHMENT') hits.push('incidents');
    if (cat !== 'ABSENT' && cat !== 'EXCLUSION') hits.push('presents');

    for (const col of hits) {
      row.counts[col] += 1;
      totals[col] += 1;
    }
  }

  // Exclusions : comptées depuis le carnet de correspondance.
  const exclusions = await tx.carnetEntry.findMany({
    where: {
      type: 'EXCLUSION',
      occurredAt: { gte, lt },
      ...(studentId ? { studentId } : {}),
      ...(scopeClassIds ? { classId: { in: scopeClassIds } } : {}),
    },
    select: { occurredAt: true },
  });
  for (const ex of exclusions) {
    const iso = ex.occurredAt.toISOString();
    const row = index.get(mode === 'month' ? iso.slice(0, 10) : iso.slice(0, 7));
    if (!row) continue;
    row.counts.exclCours += 1;
    totals.exclCours += 1;
  }

  void BOARD_COLS;
  return { rows, totals };
}
