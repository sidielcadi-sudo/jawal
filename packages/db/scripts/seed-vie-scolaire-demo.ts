/**
 * Peuple les données de VIE SCOLAIRE du tenant DÉMO pour rendre le cockpit
 * (/admin/vie-scolaire) démontrable après le vidage de la base.
 *
 * Portée — tenant slug 'demo' UNIQUEMENT, et seulement ces 4 domaines :
 *   1. Assiduité   : sessions d'appel finalisées + records (présent/absent/retard)
 *                    + justificatifs (approuvés / en attente), étalés sur le
 *                    trimestre en cours jusqu'à aujourd'hui.
 *   2. Carnet      : encouragements, félicitations, remarques, avertissements,
 *                    exclusions — étalés sur le trimestre en cours (fenêtre du
 *                    bloc Discipline).
 *   3. EDT         : quelques annulations / remplacements datés d'aujourd'hui.
 *   4. Vie pratique / communication : pointages transport du jour + annonces.
 *
 * Ne touche NI élèves, NI classes, NI inscriptions, NI finances, NI paramètres.
 * Idempotent : purge d'abord ces 4 domaines pour le tenant démo, puis recrée.
 */
import { PrismaClient, type AttendanceStatus, type CarnetEntryType } from '@prisma/client';

const prisma = new PrismaClient();

/** PRNG déterministe — le jeu de démo doit être reproductible d'un run à l'autre. */
let seed = 20260715;
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]!;

const DAY_OF_WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Jours de classe entre deux bornes incluses (lundi → samedi, dimanche exclu). */
function schoolDays(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (const d = utcDay(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() !== 0) out.push(new Date(d));
  }
  return out;
}

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'demo' } });
  if (!tenant) throw new Error("Tenant 'demo' introuvable.");
  const tenantId = tenant.id;
  console.log(`Tenant : ${tenant.name} (${tenant.slug})\n`);

  const today = utcDay(new Date());

  const year = await prisma.academicYear.findFirst({
    where: { tenantId, active: true },
    include: { periods: { orderBy: { startDate: 'asc' } } },
  });
  if (!year) throw new Error('Aucune année scolaire active.');

  // Fenêtre = période courante (ou dernière commencée) → aujourd'hui. C'est la
  // fenêtre que le cockpit interroge par défaut.
  const started = year.periods.filter((p) => p.startDate <= today);
  const period = started[started.length - 1] ?? year.periods[0]!;
  const from = utcDay(period.startDate);
  const to = today;
  console.log(`Période : ${period.label} (${from.toISOString().slice(0, 10)} → ${period.endDate.toISOString().slice(0, 10)})`);
  console.log(`Fenêtre de seed : ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}\n`);

  // ── Purge scopée ─────────────────────────────────────────────────────────
  const del = await prisma.$transaction([
    prisma.carnetEntry.deleteMany({ where: { tenantId } }),
    prisma.attendanceSession.deleteMany({ where: { tenantId } }), // cascade records + justifs
    prisma.transportAttendanceSession.deleteMany({ where: { tenantId } }),
    prisma.timetableOverride.deleteMany({ where: { tenantId } }),
    prisma.announcement.deleteMany({ where: { tenantId } }),
  ]);
  console.log(
    `Purge — carnet:${del[0].count} sessions appel:${del[1].count} transport:${del[2].count} overrides:${del[3].count} annonces:${del[4].count}\n`,
  );

  // ── Élèves actifs par classe ─────────────────────────────────────────────
  const enrollments = await prisma.enrollment.findMany({
    where: { tenantId, status: 'ACTIVE', classId: { not: null } },
    select: { studentId: true, classId: true },
  });
  const byClass = new Map<string, string[]>();
  for (const e of enrollments) {
    if (!e.classId) continue;
    let list = byClass.get(e.classId);
    if (!list) {
      list = [];
      byClass.set(e.classId, list);
    }
    list.push(e.studentId);
  }
  console.log(`${enrollments.length} inscriptions actives réparties sur ${byClass.size} classes.`);

  const days = schoolDays(from, to);
  console.log(`${days.length} jours de classe dans la fenêtre.\n`);

  // ── 1. Assiduité ─────────────────────────────────────────────────────────
  // Une session « Journée » finalisée par classe et par jour de classe.
  const sessionRows: { tenantId: string; classId: string; date: Date; periodLabel: string; finalizedAt: Date }[] = [];
  for (const [classId] of byClass) {
    for (const d of days) {
      sessionRows.push({
        tenantId,
        classId,
        date: d,
        periodLabel: 'Journée',
        finalizedAt: new Date(d.getTime() + 12 * 3600_000),
      });
    }
  }
  await prisma.attendanceSession.createMany({ data: sessionRows });
  const sessions = await prisma.attendanceSession.findMany({
    where: { tenantId },
    select: { id: true, classId: true, date: true },
  });
  console.log(`✓ ${sessions.length} sessions d'appel finalisées.`);

  // Records : ~93 % présent, ~4 % absent, ~3 % retard.
  // Une poignée d'élèves décrocheurs dépasse volontairement le seuil de 15 %
  // d'absentéisme, sinon le bloc « Points de vigilance » reste toujours vide
  // (cf. findAtRiskStudents, absenceThreshold = 15).
  const allStudents = [...new Set(enrollments.map((e) => e.studentId))];
  const atRisk = new Set(
    [...allStudents].sort(() => rnd() - 0.5).slice(0, 6),
  );

  const recordRows: {
    tenantId: string;
    sessionId: string;
    studentId: string;
    status: AttendanceStatus;
    lateMinutes: number | null;
  }[] = [];
  for (const s of sessions) {
    for (const studentId of byClass.get(s.classId) ?? []) {
      const r = rnd();
      const pAbs = atRisk.has(studentId) ? 0.28 : 0.04;
      const status: AttendanceStatus =
        r < pAbs ? 'ABSENT' : r < pAbs + 0.03 ? 'LATE' : 'PRESENT';
      recordRows.push({
        tenantId,
        sessionId: s.id,
        studentId,
        status,
        lateMinutes: status === 'LATE' ? 5 + Math.floor(rnd() * 20) : null,
      });
    }
  }
  for (let i = 0; i < recordRows.length; i += 5000) {
    await prisma.attendanceRecord.createMany({ data: recordRows.slice(i, i + 5000) });
  }
  const nAbs = recordRows.filter((r) => r.status === 'ABSENT').length;
  const nLate = recordRows.filter((r) => r.status === 'LATE').length;
  console.log(
    `✓ ${recordRows.length} pointages (${nAbs} absences, ${nLate} retards), dont ${atRisk.size} élèves décrocheurs (~28 % d'absentéisme).`,
  );

  // Justificatifs : ~60 % des absences approuvées, ~15 % en attente, reste non justifié.
  const absentIds = await prisma.attendanceRecord.findMany({
    where: { tenantId, status: 'ABSENT' },
    select: { id: true },
  });
  const reviewer = await prisma.user.findFirst({ where: { email: 'vie.scolaire@demo.jawal.ma' } });
  const REASONS = ['Maladie (certificat médical)', 'Rendez-vous médical', 'Raison familiale', 'Convocation administrative'];
  const justifRows = absentIds.flatMap((rec) => {
    const r = rnd();
    if (r >= 0.75) return []; // non justifiée
    const approved = r < 0.6;
    return [{
      tenantId,
      attendanceRecordId: rec.id,
      reason: pick(REASONS),
      status: approved ? ('APPROVED' as const) : ('PENDING' as const),
      reviewedByUserId: approved ? reviewer?.id ?? null : null,
      reviewedAt: approved ? new Date() : null,
    }];
  });
  await prisma.absenceJustification.createMany({ data: justifRows });
  const nApproved = justifRows.filter((j) => j.status === 'APPROVED').length;
  console.log(`✓ ${justifRows.length} justificatifs (${nApproved} approuvés, ${justifRows.length - nApproved} en attente).`);

  // ── 2. Carnet de correspondance ──────────────────────────────────────────
  const studentIds = allStudents;
  const CARNET: { type: CarnetEntryType; n: number; content: string[] }[] = [
    { type: 'ENCOURAGEMENT', n: 18, content: ['Participation orale remarquée.', 'Effort constant ce trimestre.', 'Bon esprit d\'entraide en classe.'] },
    { type: 'FELICITATION', n: 10, content: ['Excellents résultats, félicitations.', 'Progrès spectaculaires ce trimestre.'] },
    { type: 'REMARQUE_DISCIPLINAIRE', n: 20, content: ['Bavardages répétés en cours.', 'Travail non fait.', 'Matériel oublié.'] },
    { type: 'AVERTISSEMENT', n: 8, content: ['Avertissement de conduite.', 'Attitude irrespectueuse envers un camarade.'] },
    { type: 'EXCLUSION', n: 3, content: ['Exclusion de cours pour perturbation grave.'] },
  ];
  const spanMs = utcDay(period.endDate).getTime() - from.getTime();
  const carnetRows = CARNET.flatMap(({ type, n, content }) =>
    Array.from({ length: n }, () => ({
      tenantId,
      studentId: pick(studentIds),
      type,
      content: pick(content),
      // Étalé sur la période : c'est la fenêtre du bloc Discipline.
      occurredAt: new Date(from.getTime() + rnd() * spanMs),
      authorUserId: reviewer?.id ?? null,
      authorName: 'Service Vie scolaire',
      authorRole: 'cpe',
    })),
  );
  await prisma.carnetEntry.createMany({ data: carnetRows });
  console.log(`✓ ${carnetRows.length} entrées de carnet étalées sur ${period.label}.`);

  // ── 3. Organisation scolaire — annulations / remplacements du jour ────────
  const dayKey = DAY_OF_WEEK[today.getUTCDay()]!;
  const todayEntries = await prisma.timetableEntry.findMany({
    where: { tenantId, academicYearId: year.id, dayOfWeek: dayKey },
    select: { id: true },
    take: 8,
  });
  const teachers = await prisma.person.findMany({
    where: { tenantId, type: 'TEACHER', deletedAt: null },
    select: { id: true },
    take: 10,
  });
  const overrideRows = todayEntries.slice(0, 7).map((e, i) => ({
    tenantId,
    entryId: e.id,
    date: today,
    kind: i < 3 ? ('CANCELLED' as const) : ('SUBSTITUTION' as const),
    substituteTeacherId: i < 3 ? null : teachers.length ? pick(teachers).id : null,
    reason: i < 3 ? 'Enseignant absent' : 'Remplacement de dernière minute',
  }));
  await prisma.timetableOverride.createMany({ data: overrideRows });
  console.log(`✓ ${overrideRows.length} exceptions d'EDT aujourd'hui (${dayKey}) : 3 annulations, ${overrideRows.length - 3} remplacements.`);

  // ── 4. Transport du jour ─────────────────────────────────────────────────
  const line = await prisma.transportLine.findFirst({ where: { tenantId }, select: { id: true } });
  let nTransport = 0;
  if (line) {
    let riders = await prisma.person.findMany({
      where: { tenantId, type: 'STUDENT', deletedAt: null, usesTransport: true },
      select: { id: true },
    });
    if (riders.length === 0) riders = studentIds.slice(0, 24).map((id) => ({ id }));
    for (const direction of ['MORNING', 'EVENING'] as const) {
      const s = await prisma.transportAttendanceSession.create({
        data: { tenantId, lineId: line.id, date: today, direction },
      });
      const rows = riders.map((r, i) => {
        // 1 incident et 2 retards par sens, le reste nominal.
        const status =
          i === 0 ? ('INCIDENT' as const)
          : i <= 2 ? ('LATE' as const)
          : direction === 'MORNING' ? ('PRESENT' as const)
          : ('DROPPED' as const);
        return { tenantId, sessionId: s.id, studentId: r.id, status };
      });
      await prisma.transportAttendanceRecord.createMany({ data: rows });
      nTransport += rows.length;
    }
    console.log(`✓ ${nTransport} pointages transport aujourd'hui (matin + soir, ${riders.length} élèves).`);
  } else {
    console.log('⚠ Aucune ligne de transport — bloc Transport laissé vide.');
  }

  // ── 5. Annonces récentes ─────────────────────────────────────────────────
  const author = await prisma.user.findFirst({ where: { email: 'admin@demo.jawal.ma' } });
  if (author) {
    const ANNOUNCES = [
      { title: 'Réunion parents-professeurs', body: 'La réunion se tiendra samedi à 10h au grand hall.', days: 1 },
      { title: 'Sortie pédagogique', body: 'Autorisation à signer avant vendredi pour la sortie au musée.', days: 2 },
      { title: 'Fermeture exceptionnelle de la cantine', body: 'La cantine sera fermée jeudi pour maintenance.', days: 4 },
      { title: 'Remise des bulletins', body: 'Les bulletins du trimestre 3 sont disponibles dans le portail parent.', days: 6 },
    ];
    await prisma.announcement.createMany({
      data: ANNOUNCES.map((a) => ({
        tenantId,
        authorId: author.id,
        title: a.title,
        body: a.body,
        audience: 'ALL' as const,
        publishedAt: new Date(Date.now() - a.days * 86_400_000),
      })),
    });
    console.log(`✓ ${ANNOUNCES.length} annonces publiées ces 7 derniers jours.`);
  }

  console.log('\nTerminé.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
