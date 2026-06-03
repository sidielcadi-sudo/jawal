import 'server-only';
import type { Prisma } from '@/lib/db';

type Tx = Prisma.TransactionClient;

export type ParentChild = {
  id: string;
  firstName: string;
  lastName: string;
  /** Lien déclaré (FATHER/MOTHER/…) ou null si rattachement direct. */
  relation: string | null;
  className: string | null;
  classId: string | null;
  levelId: string | null;
};

/**
 * Résout les enfants accessibles par un compte parent, à partir des liens
 * `UserPerson`. Deux cas couverts :
 *   - le compte est rattaché à une personne de type PARENT → enfants via
 *     `PersonRelation` ;
 *   - le compte est rattaché directement à un élève (STUDENT).
 * Renvoie des élèves distincts, triés, avec leur classe de l'année active.
 *
 * À appeler dans un `withTenant` (RLS positionné).
 */
export async function getParentChildren(tx: Tx, userId: string): Promise<ParentChild[]> {
  const links = await tx.userPerson.findMany({
    where: { userId },
    select: { person: { select: { id: true, type: true } } },
  });
  if (links.length === 0) return [];

  const parentPersonIds = links.filter((l) => l.person.type === 'PARENT').map((l) => l.person.id);
  const directStudentIds = links.filter((l) => l.person.type === 'STUDENT').map((l) => l.person.id);

  const relations = parentPersonIds.length
    ? await tx.personRelation.findMany({
        where: { parentId: { in: parentPersonIds } },
        select: { childId: true, type: true },
      })
    : [];

  // childId → relation (la première rencontrée suffit pour l'affichage).
  const relById = new Map<string, string | null>();
  for (const r of relations) if (!relById.has(r.childId)) relById.set(r.childId, r.type);
  for (const sid of directStudentIds) if (!relById.has(sid)) relById.set(sid, null);

  const childIds = [...relById.keys()];
  if (childIds.length === 0) return [];

  const activeYear = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });

  const students = await tx.person.findMany({
    where: { id: { in: childIds }, type: 'STUDENT', deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      studentClasses: {
        where: {
          unenrolledAt: null,
          ...(activeYear ? { class: { academicYearId: activeYear.id } } : {}),
        },
        select: { class: { select: { id: true, name: true, levelId: true } } },
        take: 1,
      },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });

  return students.map((s) => {
    const sc = s.studentClasses[0]?.class ?? null;
    return {
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      relation: relById.get(s.id) ?? null,
      className: sc?.name ?? null,
      classId: sc?.id ?? null,
      levelId: sc?.levelId ?? null,
    };
  });
}

/**
 * Garde d'accès : `true` si l'enfant fait bien partie des enfants du parent.
 * À utiliser en tête de chaque page/route scopée enfant pour éviter qu'un
 * parent n'accède aux données d'un élève qui n'est pas le sien.
 */
export async function parentCanAccessChild(
  tx: Tx,
  userId: string,
  childId: string,
): Promise<boolean> {
  const children = await getParentChildren(tx, userId);
  return children.some((c) => c.id === childId);
}

/**
 * Annonces publiées visibles par un parent : audience ALL ou PARENTS, plus
 * les annonces ciblant la classe ou le niveau d'un de ses enfants.
 */
export async function getParentAnnouncements(
  tx: Tx,
  children: ParentChild[],
  limit = 50,
) {
  const classIds = children.map((c) => c.classId).filter((v): v is string => v !== null);
  const levelIds = children.map((c) => c.levelId).filter((v): v is string => v !== null);

  return tx.announcement.findMany({
    where: {
      publishedAt: { not: null, lte: new Date() },
      OR: [
        { audience: 'ALL' },
        { audience: 'PARENTS' },
        ...(classIds.length ? [{ audience: 'CLASS' as const, classId: { in: classIds } }] : []),
        ...(levelIds.length ? [{ audience: 'LEVEL' as const, levelId: { in: levelIds } }] : []),
      ],
    },
    orderBy: { publishedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      title: true,
      body: true,
      audience: true,
      publishedAt: true,
      classId: true,
      levelId: true,
    },
  });
}
