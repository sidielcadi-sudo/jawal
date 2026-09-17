/**
 * Devoirs générés depuis une session d'examen interne.
 *
 * Une « Évaluation diagnostique 1AC » se prépare côté administration (épreuves,
 * dates, coefficients), mais les notes se saisissent côté enseignants, dans
 * leur carnet. À la publication, chaque épreuve devient donc un devoir pour
 * chaque classe du niveau concerné, avec le coefficient de l'épreuve :
 *
 *  - seuls les enseignants de ces classes et de ces matières le voient —
 *    un devoir appartient à une classe et à une matière ;
 *  - les notes rejoignent les moyennes comme n'importe quel devoir.
 *
 * Les examens officiels (régional, national) ne sont pas concernés : anonymat
 * des copies et correcteurs désignés, leurs notes suivent leur propre circuit.
 */
import type { Prisma } from '@jawal/db';
import { isOfficialKind } from './exam-kinds';

type Tx = Prisma.TransactionClient;

/** Une session de ce type produit-elle des devoirs pour les enseignants ? */
export function generatesEvaluations(kind: string): boolean {
  return !isOfficialKind(kind);
}

/**
 * Période d'un devoir généré : celle de la session si elle est précisée, sinon
 * celle qui contient la date de l'épreuve. Null si la date ne tombe dans
 * aucune période — le devoir ne peut alors pas être rattaché à une moyenne.
 */
export function periodForPaper(
  date: Date,
  sessionPeriodId: string | null,
  periods: ReadonlyArray<{ id: string; startDate: Date; endDate: Date }>,
): string | null {
  if (sessionPeriodId) return sessionPeriodId;
  return periods.find((p) => p.startDate <= date && date <= p.endDate)?.id ?? null;
}

export type SyncResult = {
  created: number;
  updated: number;
  removed: number;
  /** Épreuves dont la date ne tombe dans aucune période : pas de devoir. */
  skippedPapers: number;
};

/**
 * Aligne les devoirs des enseignants sur les épreuves de la session.
 *
 * Idempotent : un devoir par (épreuve, classe), mis à jour s'il existe. Les
 * devoirs devenus sans objet (épreuve retirée, filière décochée) sont supprimés
 * tant qu'aucune note n'y est saisie — jamais une note n'est perdue.
 */
export async function syncExamEvaluations(tx: Tx, tenantId: string, sessionId: string): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, removed: 0, skippedPapers: 0 };
  const session = await tx.examSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      label: true,
      kind: true,
      levelId: true,
      periodId: true,
      academicYearId: true,
      tracks: { select: { trackId: true } },
      papers: { select: { id: true, subjectId: true, date: true, coefficient: true, maxValue: true } },
    },
  });
  if (!session || !generatesEvaluations(session.kind)) return result;

  const trackIds = session.tracks.map((t) => t.trackId);
  const [classes, periods, existing] = await Promise.all([
    tx.class.findMany({
      where: {
        academicYearId: session.academicYearId,
        levelId: session.levelId,
        deletedAt: null,
        ...(trackIds.length > 0 ? { trackId: { in: trackIds } } : {}),
      },
      select: { id: true, students: { where: { unenrolledAt: null }, select: { studentId: true } } },
    }),
    tx.period.findMany({
      where: { academicYearId: session.academicYearId },
      select: { id: true, startDate: true, endDate: true },
      orderBy: { startDate: 'asc' },
    }),
    tx.evaluation.findMany({
      where: { examPaper: { is: { sessionId } } },
      select: {
        id: true,
        examPaperId: true,
        classId: true,
        grades: { where: { value: { not: null } }, select: { id: true }, take: 1 },
      },
    }),
  ]);

  const byKey = new Map(existing.map((e) => [`${e.examPaperId}|${e.classId}`, e]));
  const keep = new Set<string>();

  for (const paper of session.papers) {
    const periodId = periodForPaper(paper.date, session.periodId, periods);
    if (!periodId) {
      result.skippedPapers += 1;
      continue;
    }
    const data = {
      label: session.label,
      date: paper.date,
      weight: paper.coefficient,
      maxValue: paper.maxValue,
      periodId,
      subjectId: paper.subjectId,
    };
    for (const cls of classes) {
      const key = `${paper.id}|${cls.id}`;
      keep.add(key);
      const current = byKey.get(key);
      if (current) {
        await tx.evaluation.update({ where: { id: current.id }, data });
        result.updated += 1;
        continue;
      }
      const ev = await tx.evaluation.create({
        data: { tenantId, classId: cls.id, examPaperId: paper.id, ...data },
      });
      if (cls.students.length > 0) {
        await tx.grade.createMany({
          data: cls.students.map((s) => ({ tenantId, evaluationId: ev.id, studentId: s.studentId, value: null })),
          skipDuplicates: true,
        });
      }
      result.created += 1;
    }
  }

  const obsolete = existing.filter((e) => !keep.has(`${e.examPaperId}|${e.classId}`) && e.grades.length === 0);
  if (obsolete.length > 0) {
    await tx.evaluation.deleteMany({ where: { id: { in: obsolete.map((e) => e.id) } } });
    result.removed = obsolete.length;
  }
  return result;
}
