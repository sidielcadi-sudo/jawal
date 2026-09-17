import 'server-only';
import type { Prisma } from '@/lib/db';
import { activeYearStart } from '@/lib/active-year';

type Tx = Prisma.TransactionClient;

/**
 * Annonces dont l'enseignant est destinataire.
 *
 * Un prof reçoit les annonces de l'établissement (`ALL`), celles adressées au
 * corps enseignant (`TEACHERS`) et au personnel (`STAFF`), plus celles ciblant
 * une classe ou un niveau où il intervient — un mot destiné à la 6e B concerne
 * autant ses profs que ses familles. Les annonces `PARENTS` restent hors champ.
 *
 * `since` borne la période (l'accueil mobile ne montre que le dernier mois).
 * À appeler dans un `withTenant`.
 */
export async function getTeacherAnnouncements(
  tx: Tx,
  teacherId: string,
  opts: { limit?: number; since?: Date } = {},
) {
  const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
  // Annonces de l'année active : la borne demandée, sans remonter avant la rentrée.
  const yearStart = await activeYearStart(tx);
  const since =
    opts.since && yearStart ? (opts.since > yearStart ? opts.since : yearStart) : (opts.since ?? yearStart);

  // Classes du prof : affectations + cases d'EDT de l'année active.
  const [assignments, entries] = year
    ? await Promise.all([
        tx.teacherAssignment.findMany({
          where: { teacherId, academicYearId: year.id },
          select: { class: { select: { id: true, levelId: true } } },
        }),
        tx.timetableEntry.findMany({
          where: { teacherId, academicYearId: year.id },
          select: { class: { select: { id: true, levelId: true } } },
        }),
      ])
    : [[], []];

  const taught = [...assignments, ...entries];
  const classIds = [...new Set(taught.map((a) => a.class.id))];
  const levelIds = [...new Set(taught.map((a) => a.class.levelId))];

  return tx.announcement.findMany({
    where: {
      publishedAt: {
        not: null,
        lte: new Date(),
        ...(since ? { gte: since } : {}),
      },
      OR: [
        { audience: 'ALL' as const },
        { audience: 'TEACHERS' as const },
        { audience: 'STAFF' as const },
        ...(classIds.length ? [{ audience: 'CLASS' as const, classId: { in: classIds } }] : []),
        ...(levelIds.length ? [{ audience: 'LEVEL' as const, levelId: { in: levelIds } }] : []),
      ],
    },
    orderBy: { publishedAt: 'desc' },
    take: opts.limit ?? 100,
    select: { id: true, title: true, body: true, audience: true, publishedAt: true },
  });
}
