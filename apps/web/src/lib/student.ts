import 'server-only';
import type { Prisma } from '@/lib/db';
import { categoryOf, tallyAttendance, type AttendanceCategory } from '@/lib/attendance-category';
import { computeAverage20, type AverageItem } from '@/lib/grade-average';
import { loadStudentCarnet } from '@/lib/carnet';

type Tx = Prisma.TransactionClient;

/** Personne (type STUDENT) rattachée à un compte élève via UserPerson. */
export async function getStudentPersonId(tx: Tx, userId: string): Promise<string | null> {
  const link = await tx.userPerson.findFirst({
    where: { userId, person: { type: 'STUDENT' } },
    select: { personId: true },
  });
  return link?.personId ?? null;
}

/** Classe (et niveau) de l'élève sur l'année active. */
export async function getStudentClassRef(
  tx: Tx,
  studentId: string,
): Promise<{ classId: string; levelId: string | null } | null> {
  const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
  if (!year) return null;
  const sc = await tx.studentClass.findFirst({
    where: { studentId, unenrolledAt: null, class: { academicYearId: year.id } },
    select: { class: { select: { id: true, levelId: true } } },
  });
  return sc ? { classId: sc.class.id, levelId: sc.class.levelId ?? null } : null;
}

/** Annonces visibles par un élève : ALL + sa classe (CLASS) + son niveau (LEVEL). */
export async function getStudentAnnouncements(
  tx: Tx,
  classId: string | null,
  levelId: string | null,
  limit = 100,
) {
  return tx.announcement.findMany({
    where: {
      publishedAt: { not: null, lte: new Date() },
      OR: [
        { audience: 'ALL' as const },
        ...(classId ? [{ audience: 'CLASS' as const, classId }] : []),
        ...(levelId ? [{ audience: 'LEVEL' as const, levelId }] : []),
      ],
    },
    orderBy: { publishedAt: 'desc' },
    take: limit,
    select: { id: true, title: true, body: true, audience: true, publishedAt: true },
  });
}

type Ctx = {
  yearId: string;
  startDate: Date;
  endDate: Date;
  classId: string | null;
  className: string | null;
  periods: { id: string; label: string }[];
};

/** Année active + classe de l'élève + périodes. */
async function studentContext(tx: Tx, studentId: string): Promise<Ctx | null> {
  const year = await tx.academicYear.findFirst({
    where: { active: true },
    include: { periods: { orderBy: { startDate: 'asc' } } },
  });
  if (!year) return null;
  const sc = await tx.studentClass.findFirst({
    where: { studentId, unenrolledAt: null, class: { academicYearId: year.id } },
    include: { class: { select: { id: true, name: true, nameAr: true } } },
  });
  return {
    yearId: year.id,
    startDate: year.startDate,
    endDate: year.endDate,
    classId: sc?.class.id ?? null,
    className: sc?.class.name ?? null,
    periods: year.periods.map((p) => ({ id: p.id, label: p.label, labelAr: p.labelAr })),
  };
}

/** Moyenne /20 par matière + moyenne générale pour la classe/année de l'élève. */
async function subjectAverages(
  tx: Tx,
  studentId: string,
  classId: string,
  periodIds: string[],
): Promise<{ bySubject: { subjectId: string; label: string; avg: number | null }[]; general: number | null }> {
  if (periodIds.length === 0) return { bySubject: [], general: null };
  const evals = await tx.evaluation.findMany({
    where: { classId, periodId: { in: periodIds } },
    select: {
      subjectId: true,
      subject: { select: { label: true, labelAr: true } },
      maxValue: true,
      weight: true,
      optional: true,
      optionalMode: true,
      grades: { where: { studentId }, select: { value: true } },
    },
  });
  const bySubj = new Map<string, { label: string; items: AverageItem[] }>();
  for (const ev of evals) {
    const entry = bySubj.get(ev.subjectId) ?? { label: ev.subject?.label ?? '—', items: [] };
    for (const g of ev.grades) {
      if (g.value === null) continue;
      entry.items.push({
        n20: (g.value / ev.maxValue) * 20,
        weight: ev.weight,
        optional: ev.optional,
        mode: ev.optionalMode as 'BONUS' | 'NOTE',
      });
    }
    bySubj.set(ev.subjectId, entry);
  }
  const bySubject = [...bySubj.entries()]
    .map(([subjectId, v]) => ({ subjectId, label: v.label, avg: v.items.length ? computeAverage20(v.items) : null }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const present = bySubject.map((s) => s.avg).filter((v): v is number => v !== null);
  const general = present.length ? present.reduce((s, x) => s + x, 0) / present.length : null;
  return { bySubject, general };
}

/** Classe + périodes de l'élève (année active) — pour lister ses bulletins. */
export async function loadStudentPeriods(
  tx: Tx,
  studentId: string,
): Promise<{ className: string | null; periods: { id: string; label: string }[] }> {
  const ctx = await studentContext(tx, studentId);
  return { className: ctx?.className ?? null, periods: ctx?.periods ?? [] };
}

export type StudentDashboard = {
  firstName: string;
  lastName: string;
  className: string | null;
  attendanceRate: number | null;
  counts: Record<AttendanceCategory, number>;
  generalAverage: number | null;
  subjects: { label: string; avg: number | null }[];
  carnetUnread: number;
  recentCarnet: { id: string; type: string; content: string; occurredAt: string; authorName: string }[];
  recentAbsences: { id: string; date: string; cat: AttendanceCategory; className: string }[];
};

/** Données d'accueil du portail élève. À appeler dans un `withTenant`. */
export async function loadStudentDashboard(tx: Tx, studentId: string): Promise<StudentDashboard | null> {
  const person = await tx.person.findUnique({
    where: { id: studentId },
    select: { firstName: true, lastName: true },
  });
  if (!person) return null;
  const ctx = await studentContext(tx, studentId);

  const records = ctx
    ? await tx.attendanceRecord.findMany({
        where: {
          studentId,
          session: { finalizedAt: { not: null }, date: { gte: ctx.startDate, lte: ctx.endDate } },
        },
        include: { session: { include: { class: { select: { name: true, nameAr: true } } } } },
        orderBy: { session: { date: 'desc' } },
      })
    : [];
  const att = tallyAttendance(records);
  const recentAbsences = records
    .map((r) => ({ r, cat: categoryOf(r) }))
    .filter(({ cat }) => cat !== 'PRESENT')
    .slice(0, 6)
    .map(({ r, cat }) => ({
      id: r.id,
      date: r.session.date.toISOString(),
      cat,
      className: r.session.class.name,
    }));

  const avgs =
    ctx?.classId && ctx.periods.length
      ? await subjectAverages(tx, studentId, ctx.classId, ctx.periods.map((p) => p.id))
      : { bySubject: [] as { subjectId: string; label: string; avg: number | null }[], general: null };

  const carnet = await loadStudentCarnet(tx, studentId, { forParents: true });
  const recentCarnet = carnet.entries.slice(0, 5).map((e) => ({
    id: e.id,
    type: e.type,
    content: e.content,
    occurredAt: e.occurredAt.toISOString(),
    authorName: e.authorName,
  }));
  const carnetUnread = carnet.entries.filter((e) => e.parentReadAt === null).length;

  return {
    firstName: person.firstName,
    lastName: person.lastName,
    className: ctx?.className ?? null,
    attendanceRate: att.rate,
    counts: att.counts,
    generalAverage: avgs.general,
    subjects: avgs.bySubject.map((s) => ({ label: s.label, avg: s.avg })),
    carnetUnread,
    recentCarnet,
    recentAbsences,
  };
}

export type StudentNotes = {
  className: string | null;
  generalAverage: number | null;
  periods: { id: string; label: string }[];
  subjects: {
    subjectId: string;
    label: string;
    avg: number | null;
    evals: { id: string; label: string; date: string; period: string; max: number; value: number | null; classAvg: number | null }[];
  }[];
};

/** Relevé de notes de l'élève (par matière) sur l'année active. */
export async function loadStudentNotes(tx: Tx, studentId: string): Promise<StudentNotes> {
  const ctx = await studentContext(tx, studentId);
  if (!ctx?.classId || ctx.periods.length === 0) {
    return { className: ctx?.className ?? null, generalAverage: null, periods: ctx?.periods ?? [], subjects: [] };
  }
  const periodIds = ctx.periods.map((p) => p.id);
  const periodLabel = new Map(ctx.periods.map((p) => [p.id, p.label]));

  const evals = await tx.evaluation.findMany({
    where: { classId: ctx.classId, periodId: { in: periodIds } },
    orderBy: { date: 'desc' },
    select: {
      id: true,
      label: true,
      date: true,
      maxValue: true,
      weight: true,
      optional: true,
      optionalMode: true,
      periodId: true,
      subjectId: true,
      subject: { select: { label: true, labelAr: true } },
      grades: { select: { studentId: true, value: true } },
    },
  });

  const bySubj = new Map<
    string,
    { label: string; items: AverageItem[]; evals: StudentNotes['subjects'][number]['evals'] }
  >();
  for (const ev of evals) {
    const entry = bySubj.get(ev.subjectId) ?? { label: ev.subject?.label ?? '—', items: [], evals: [] };
    const mine = ev.grades.find((g) => g.studentId === studentId)?.value ?? null;
    const vals = ev.grades.map((g) => g.value).filter((v): v is number => v !== null);
    const classAvg = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null;
    if (mine !== null) {
      entry.items.push({
        n20: (mine / ev.maxValue) * 20,
        weight: ev.weight,
        optional: ev.optional,
        mode: ev.optionalMode as 'BONUS' | 'NOTE',
      });
    }
    entry.evals.push({
      id: ev.id,
      label: ev.label,
      date: ev.date.toISOString(),
      period: periodLabel.get(ev.periodId) ?? '',
      max: ev.maxValue,
      value: mine,
      classAvg,
    });
    bySubj.set(ev.subjectId, entry);
  }

  const subjects = [...bySubj.entries()]
    .map(([subjectId, v]) => ({
      subjectId,
      label: v.label,
      avg: v.items.length ? computeAverage20(v.items) : null,
      evals: v.evals,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const present = subjects.map((s) => s.avg).filter((v): v is number => v !== null);
  const generalAverage = present.length ? present.reduce((s, x) => s + x, 0) / present.length : null;

  return { className: ctx.className, generalAverage, periods: ctx.periods, subjects };
}
