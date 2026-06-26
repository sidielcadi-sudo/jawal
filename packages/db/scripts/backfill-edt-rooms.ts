/**
 * (Ré)affecte les salles des séances d'EDT existantes — modèle « salle du prof ».
 *  - matière spécialisée (PC/SVT/Info/EPS) → salle du type requis ;
 *  - sinon → salle attitrée de l'enseignant (Person.metadata.homeRoomId) ;
 *  - repli → salle attitrée de la classe / 1re salle libre.
 *  - sans conflit : jamais deux séances dans la même salle au même (jour, créneau).
 *
 * Réinitialise d'abord toutes les salles (pour basculer proprement de modèle).
 * Lancer : pnpm --filter @jawal/db exec tsx scripts/backfill-edt-rooms.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type RoomType = 'STD' | 'LABO_SVT' | 'LABO_PC' | 'INFO' | 'EPS';

function classifyRoom(code: string, label: string, equipment: string[]): RoomType {
  const text = `${code} ${label} ${equipment.join(' ')}`.toUpperCase();
  if (text.includes('MICROSCOPE') || (text.includes('LABO') && (text.includes('SVT') || text.includes('BIO'))))
    return 'LABO_SVT';
  if (text.includes('HOTTE') || (text.includes('LABO') && (text.includes('PC') || text.includes('PHYSIQUE') || text.includes('CHIMIE'))))
    return 'LABO_PC';
  if (text.includes('INFO') || text.includes('ORDINATEUR') || text.includes(' PC ') || text.includes('TABLEAU INTERACTIF'))
    return 'INFO';
  if (text.includes('GYM') || text.includes('EPS') || text.includes('SPORT') || text.includes('TAPIS') || text.includes('VESTIAIRE') || text.includes('BALLON'))
    return 'EPS';
  return 'STD';
}

function subjectRoomRequirement(subjectLabel: string): RoomType | null {
  const u = subjectLabel.toUpperCase();
  if (u.includes('PHYSIQUE') || u.includes('CHIMIE') || u.includes('PC ')) return 'LABO_PC';
  if (u.includes('SVT') || u.includes('BIOLOGIE') || u.includes('NATUREL')) return 'LABO_SVT';
  if (u.includes('INFO')) return 'INFO';
  if (u.includes('EPS') || u.includes('SPORT')) return 'EPS';
  return null;
}

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  for (const tenant of tenants) {
    const rooms = await prisma.room.findMany({ where: { tenantId: tenant.id } });
    if (rooms.length === 0) continue;

    const roomsByType = new Map<RoomType, string[]>();
    for (const r of rooms) {
      const ty = classifyRoom(r.code, r.label, r.equipment);
      (roomsByType.get(ty) ?? roomsByType.set(ty, []).get(ty)!).push(r.id);
    }
    const stdRooms = roomsByType.get('STD') ?? rooms.map((r) => r.id);
    const roomIds = new Set(rooms.map((r) => r.id));

    // Salle attitrée par enseignant : metadata.homeRoomId explicite, sinon
    // dérivée (round-robin sur les salles standard) pour une salle STABLE par
    // prof → « le prof ne change pas (ou peu) de salle ».
    const teachers = await prisma.person.findMany({
      where: { tenantId: tenant.id, type: 'TEACHER' },
      orderBy: { id: 'asc' },
      select: { id: true, metadata: true },
    });
    const teacherHome = new Map<string, string | null>();
    teachers.forEach((t, i) => {
      const md = t.metadata as { homeRoomId?: string } | null;
      const hr = md?.homeRoomId ?? null;
      teacherHome.set(
        t.id,
        hr && roomIds.has(hr) ? hr : stdRooms.length ? (stdRooms[i % stdRooms.length] ?? null) : null,
      );
    });

    // Réinitialise pour rebasculer proprement de modèle.
    await prisma.timetableEntry.updateMany({ where: { tenantId: tenant.id }, data: { roomId: null } });

    const entries = await prisma.timetableEntry.findMany({
      where: { tenantId: tenant.id },
      include: { subject: { select: { label: true } } },
      orderBy: [{ dayOfWeek: 'asc' }, { slotId: 'asc' }],
    });

    const classIds = [...new Set(entries.map((e) => e.classId))];
    const classHome = new Map<string, string | null>();
    classIds.forEach((cid, i) =>
      classHome.set(cid, stdRooms.length ? (stdRooms[i % stdRooms.length] ?? null) : null),
    );

    const usedByCell = new Map<string, Set<string>>();
    let assigned = 0;
    for (const e of entries) {
      const key = `${e.dayOfWeek}|${e.slotId}`;
      const used = usedByCell.get(key) ?? new Set<string>();
      const reqType = subjectRoomRequirement(e.subject?.label ?? '');
      let chosen: string | null = null;
      // 1) Matière spécialisée → salle du type requis.
      if (reqType && reqType !== 'STD') {
        chosen = (roomsByType.get(reqType) ?? []).find((r) => !used.has(r)) ?? null;
      }
      // 2) Salle attitrée du prof.
      if (!chosen) {
        const tr = teacherHome.get(e.teacherId) ?? null;
        if (tr && !used.has(tr)) chosen = tr;
      }
      // 3) Repli : salle de la classe, sinon 1re salle libre (toute salle).
      if (!chosen) {
        const home = classHome.get(e.classId) ?? null;
        chosen = home && !used.has(home) ? home : (stdRooms.find((r) => !used.has(r)) ?? null);
      }
      if (!chosen) {
        chosen = rooms.map((r) => r.id).find((r) => !used.has(r)) ?? null;
      }
      if (chosen) {
        used.add(chosen);
        usedByCell.set(key, used);
        await prisma.timetableEntry.update({ where: { id: e.id }, data: { roomId: chosen } });
        assigned++;
      }
    }
    const withTeacherRoom = entries.filter(
      (e) => !subjectRoomRequirement(e.subject?.label ?? '') && teacherHome.get(e.teacherId),
    ).length;
    console.log(
      `Tenant ${tenant.name}: ${assigned}/${entries.length} séances affectées ` +
        `(profs avec salle attitrée : ${[...teacherHome.values()].filter(Boolean).length}/${teachers.length}).`,
    );
    void withTeacherRoom;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
