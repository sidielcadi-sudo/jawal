import 'server-only';
import type { Prisma } from '@/lib/db';
import type { LessonEntryUpsert } from '@jawal/shared';

type Tx = Prisma.TransactionClient;

type DayEnum = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

// getUTCDay() : 0=dimanche … 6=samedi → enum DayOfWeek.
const DOW_BY_INDEX: Record<number, DayEnum> = {
  0: 'SUN',
  1: 'MON',
  2: 'TUE',
  3: 'WED',
  4: 'THU',
  5: 'FRI',
  6: 'SAT',
};

/** 'YYYY-MM-DD' → Date à minuit UTC (les colonnes @db.Date ignorent l'heure). */
export function parseDateUTC(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

/** Date → 'YYYY-MM-DD' (UTC). */
export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Jour de la semaine (enum) d'une date 'YYYY-MM-DD'. */
export function dowOf(s: string): DayEnum {
  return DOW_BY_INDEX[parseDateUTC(s).getUTCDay()]!;
}

/** Lundi de la semaine contenant la date donnée (par défaut : aujourd'hui). */
export function mondayOf(s?: string): string {
  const d = s ? parseDateUTC(s) : parseDateUTC(toDateStr(new Date()));
  const day = d.getUTCDay(); // 0..6
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return toDateStr(d);
}

/** Décale une date 'YYYY-MM-DD' de n jours. */
export function addDays(s: string, n: number): string {
  const d = parseDateUTC(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateStr(d);
}

/** Les 6 jours ouvrés (lun→sam) d'une semaine à partir d'un lundi. */
export function weekDays(mondayStr: string): { date: string; dow: DayEnum }[] {
  const out: { date: string; dow: DayEnum }[] = [];
  for (let i = 0; i < 6; i++) {
    const date = addDays(mondayStr, i);
    out.push({ date, dow: dowOf(date) });
  }
  return out;
}

export type TeacherSession = {
  entryId: string;
  date: string;
  dow: DayEnum;
  slotStart: string;
  slotEnd: string;
  subject: string | null;
  className: string;
  room: string | null;
  filled: boolean;
};

/**
 * Séances datées d'un enseignant pour une semaine (lun→sam) : chaque case
 * d'EDT du prof est projetée sur la date correspondante, avec l'indication
 * « cahier rempli ou non ».
 */
export async function getTeacherWeekSessions(
  tx: Tx,
  teacherId: string,
  mondayStr: string,
): Promise<{ days: { date: string; dow: DayEnum }[]; sessions: TeacherSession[] }> {
  const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
  const days = weekDays(mondayStr);
  if (!year) return { days, sessions: [] };

  const entries = await tx.timetableEntry.findMany({
    where: {
      teacherId,
      academicYearId: year.id,
      dayOfWeek: { in: days.map((d) => d.dow) },
      slot: { isBreak: false },
    },
    include: {
      slot: { select: { startTime: true, endTime: true, order: true } },
      subject: { select: { label: true, labelAr: true } },
      class: { select: { name: true, nameAr: true } },
      room: { select: { code: true } },
    },
  });

  const dateObjs = days.map((d) => parseDateUTC(d.date));
  const lessons =
    entries.length > 0
      ? await tx.lessonEntry.findMany({
          where: { entryId: { in: entries.map((e) => e.id) }, date: { in: dateObjs } },
          select: { entryId: true, date: true },
        })
      : [];
  const filled = new Set(lessons.map((l) => `${l.entryId}|${toDateStr(l.date)}`));

  const sessions: TeacherSession[] = [];
  for (const day of days) {
    for (const e of entries) {
      if (e.dayOfWeek !== day.dow) continue;
      sessions.push({
        entryId: e.id,
        date: day.date,
        dow: day.dow,
        slotStart: e.slot.startTime,
        slotEnd: e.slot.endTime,
        subject: e.subject?.label ?? null,
        className: e.class.name,
        room: e.room?.code ?? null,
        filled: filled.has(`${e.id}|${day.date}`),
      });
    }
  }
  sessions.sort((a, b) => a.date.localeCompare(b.date) || a.slotStart.localeCompare(b.slotStart));
  return { days, sessions };
}

/**
 * Charge une séance pour saisie côté prof : vérifie que la séance appartient
 * bien à l'enseignant et que la date correspond au jour de la case d'EDT.
 * Renvoie null si non autorisé / incohérent.
 */
export async function getSessionForTeacher(
  tx: Tx,
  teacherId: string,
  entryId: string,
  dateStr: string,
) {
  const entry = await tx.timetableEntry.findUnique({
    where: { id: entryId },
    include: {
      slot: { select: { startTime: true, endTime: true } },
      subject: { select: { label: true, labelAr: true } },
      class: { select: { id: true, name: true, nameAr: true } },
      room: { select: { code: true } },
      teacher: { select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } },
    },
  });
  if (!entry || entry.teacherId !== teacherId) return null;
  if (dowOf(dateStr) !== entry.dayOfWeek) return null;

  const lesson = await tx.lessonEntry.findUnique({
    where: { entryId_date: { entryId, date: parseDateUTC(dateStr) } },
    include: {
      homeworks: { orderBy: { order: 'asc' } },
      resources: { orderBy: { order: 'asc' } },
    },
  });
  return { entry, lesson, dateStr };
}

type UpsertResult = { ok: true; id: string } | { ok: false; error: 'NOT_OWNER' | 'DATE_MISMATCH' };

/**
 * Crée ou met à jour le cahier de texte d'une séance (+ remplace ses devoirs).
 * Garde-fous : l'enseignant doit être le prof de la séance, et la date doit
 * tomber le bon jour de la semaine. L'unicité (entryId, date) garantit
 * « 1 séance = 1 cahier ».
 */
export async function upsertLesson(
  tx: Tx,
  tenantId: string,
  userId: string,
  teacherId: string,
  input: LessonEntryUpsert,
): Promise<UpsertResult> {
  const entry = await tx.timetableEntry.findUnique({
    where: { id: input.entryId },
    select: { id: true, teacherId: true, classId: true, dayOfWeek: true },
  });
  if (!entry || entry.teacherId !== teacherId) return { ok: false, error: 'NOT_OWNER' };
  if (dowOf(input.date) !== entry.dayOfWeek) return { ok: false, error: 'DATE_MISMATCH' };

  const dateObj = parseDateUTC(input.date);
  const content = {
    title: input.title,
    summary: input.summary ?? null,
    activities: input.activities ?? null,
    competencies: input.competencies ?? null,
    theme: input.theme ?? null,
    visibleToStudents: input.visibleToStudents,
    visibleToParents: input.visibleToParents,
    publishAt: input.publishAt ? new Date(input.publishAt) : null,
  };

  const lesson = await tx.lessonEntry.upsert({
    where: { entryId_date: { entryId: entry.id, date: dateObj } },
    create: {
      tenantId,
      entryId: entry.id,
      classId: entry.classId,
      date: dateObj,
      createdById: userId,
      ...content,
    },
    update: content,
  });

  // Devoirs : remplacement intégral (idempotent).
  await tx.homework.deleteMany({ where: { lessonEntryId: lesson.id } });
  if (input.homeworks.length > 0) {
    await tx.homework.createMany({
      data: input.homeworks.map((h, i) => ({
        tenantId,
        lessonEntryId: lesson.id,
        description: h.description,
        dueDate: h.dueDate ? parseDateUTC(h.dueDate) : null,
        type: h.type,
        difficulty: h.difficulty ?? null,
        order: i,
      })),
    });
  }

  return { ok: true, id: lesson.id };
}

/**
 * Filtre de visibilité parent : drapeau actif ET visibilité programmée
 * atteinte (publishAt null ou passé). Réutilisé par toutes les requêtes parent.
 */
function parentVisibleWhere(): Prisma.LessonEntryWhereInput {
  return {
    visibleToParents: true,
    OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }],
  };
}

/**
 * Cahier de texte visible par les parents pour une classe : séances récentes
 * (par défaut 30 derniers jours) avec leurs devoirs et ressources publiées.
 */
export async function getClassLessonBook(
  tx: Tx,
  classId: string,
  sinceDays = 30,
  sinceDateStr?: string,
) {
  const since = sinceDateStr
    ? parseDateUTC(sinceDateStr)
    : parseDateUTC(addDays(toDateStr(new Date()), -sinceDays));
  return tx.lessonEntry.findMany({
    where: { classId, date: { gte: since }, ...parentVisibleWhere() },
    orderBy: { date: 'desc' },
    take: 100,
    include: {
      entry: {
        include: {
          slot: { select: { startTime: true, endTime: true } },
          subject: { select: { label: true, labelAr: true } },
          teacher: { select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } },
        },
      },
      homeworks: { orderBy: { order: 'asc' } },
      resources: { orderBy: { order: 'asc' } },
    },
  });
}

/** Devoirs à venir (date de rendu ≥ depuis) visibles parents pour une classe. */
export async function getClassUpcomingHomeworks(tx: Tx, classId: string, sinceDateStr?: string) {
  const since = sinceDateStr ? parseDateUTC(sinceDateStr) : parseDateUTC(toDateStr(new Date()));
  return tx.homework.findMany({
    where: { dueDate: { gte: since }, lessonEntry: { classId, ...parentVisibleWhere() } },
    orderBy: { dueDate: 'asc' },
    take: 50,
    include: {
      lessonEntry: {
        // Le portail parent regroupe les devoirs par séance et titre la carte
        // « Matière — Enseignant · Séance du JJ/MM » : il lui faut donc la
        // date de la séance et son enseignant, pas seulement la matière.
        include: {
          entry: {
            include: {
              subject: { select: { label: true, labelAr: true } },
              teacher: {
                select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true },
              },
            },
          },
        },
      },
    },
  });
}

export type UnfilledSession = {
  entryId: string;
  date: string;
  slotStart: string;
  slotEnd: string;
  subject: string | null;
  className: string;
};

/**
 * Séances passées (avant aujourd'hui, sur les `sinceDays` derniers jours) d'un
 * enseignant dont le cahier n'a pas été rempli. Exclut les séances annulées
 * (override CANCELLED). Triées du plus récent au plus ancien.
 * Sert au rappel in-app + au cron de relance.
 */
export async function getUnfilledSessionsForTeacher(
  tx: Tx,
  teacherId: string,
  sinceDays = 14,
): Promise<UnfilledSession[]> {
  const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
  if (!year) return [];

  const todayStr = toDateStr(new Date());
  const dates: string[] = [];
  for (let s = addDays(todayStr, -sinceDays); s < todayStr; s = addDays(s, 1)) dates.push(s);
  if (dates.length === 0) return [];
  const dows = [...new Set(dates.map(dowOf))];

  const entries = await tx.timetableEntry.findMany({
    where: {
      teacherId,
      academicYearId: year.id,
      slot: { isBreak: false },
      dayOfWeek: { in: dows },
    },
    include: {
      slot: { select: { startTime: true, endTime: true } },
      subject: { select: { label: true, labelAr: true } },
      class: { select: { name: true, nameAr: true } },
    },
  });
  if (entries.length === 0) return [];

  const entryIds = entries.map((e) => e.id);
  const dateObjs = dates.map(parseDateUTC);
  const [lessons, overrides] = await Promise.all([
    tx.lessonEntry.findMany({
      where: { entryId: { in: entryIds }, date: { in: dateObjs } },
      select: { entryId: true, date: true },
    }),
    tx.timetableOverride.findMany({
      where: { entryId: { in: entryIds }, date: { in: dateObjs }, kind: 'CANCELLED' },
      select: { entryId: true, date: true },
    }),
  ]);
  const filled = new Set(lessons.map((l) => `${l.entryId}|${toDateStr(l.date)}`));
  const cancelled = new Set(overrides.map((o) => `${o.entryId}|${toDateStr(o.date)}`));

  const out: UnfilledSession[] = [];
  for (const d of dates) {
    for (const e of entries) {
      if (e.dayOfWeek !== dowOf(d)) continue;
      const key = `${e.id}|${d}`;
      if (filled.has(key) || cancelled.has(key)) continue;
      out.push({
        entryId: e.id,
        date: d,
        slotStart: e.slot.startTime,
        slotEnd: e.slot.endTime,
        subject: e.subject?.label ?? null,
        className: e.class.name,
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.slotStart.localeCompare(b.slotStart));
}

/** Une séance appartient-elle à l'enseignant (via sa case d'EDT) ? */
export async function teacherOwnsLesson(
  tx: Tx,
  teacherId: string,
  lessonEntryId: string,
): Promise<boolean> {
  const lesson = await tx.lessonEntry.findUnique({
    where: { id: lessonEntryId },
    select: { entry: { select: { teacherId: true } } },
  });
  return lesson?.entry.teacherId === teacherId;
}

/**
 * Contrôle d'accès au téléchargement d'une ressource fichier. Renvoie le
 * FileObject (s3Key, filename, mime) si autorisé, sinon null.
 * - enseignant : doit être le prof de la séance ;
 * - parent : la séance doit être visible/publiée et concerner la classe d'un
 *   de ses enfants ;
 * - admin (ni parent ni teacher) : accès au tenant courant.
 */
export async function resolveResourceForDownload(
  tx: Tx,
  opts: {
    resourceId: string;
    isParent: boolean;
    isTeacher: boolean;
    userId: string;
    parentClassIds: string[];
    teacherPersonId: string | null;
  },
) {
  const resource = await tx.lessonResource.findUnique({
    where: { id: opts.resourceId },
    select: {
      kind: true,
      fileId: true,
      lessonEntry: {
        select: {
          classId: true,
          visibleToParents: true,
          publishAt: true,
          entry: { select: { teacherId: true } },
        },
      },
    },
  });
  if (!resource || resource.kind !== 'FILE' || !resource.fileId) return null;
  const le = resource.lessonEntry;

  if (opts.isTeacher) {
    if (le.entry.teacherId !== opts.teacherPersonId) return null;
  } else if (opts.isParent) {
    const published = le.publishAt === null || le.publishAt <= new Date();
    if (!le.visibleToParents || !published || !opts.parentClassIds.includes(le.classId))
      return null;
  }
  // admin : autorisé dans le périmètre tenant (RLS)

  return tx.fileObject.findUnique({
    where: { id: resource.fileId },
    select: { s3Key: true, filename: true, mime: true },
  });
}
