import { z } from 'zod';
import { withTenant } from '@/lib/db';
import { verifyMobileTeacher, unauthorized } from '@/lib/mobile-teacher';
import { getTeacherPersonId, teacherTeachesClassSubject } from '@/lib/teacher';
import { logAudit } from '@/lib/audit';
import { pickPeriodId } from '@/lib/periods';
import { personDisplayName } from '@/lib/localized-name';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ classId: string; subjectId: string }> };

/**
 * GET /api/mobile/teacher/notes/[classId]/[subjectId]?period=…
 * → devoirs de la période et notes déjà saisies, élève par élève.
 */
export async function GET(req: Request, ctx: Ctx) {
  const principal = await verifyMobileTeacher(req);
  if (!principal) return unauthorized();
  const { classId, subjectId } = await ctx.params;
  const periodParam = new URL(req.url).searchParams.get('period') ?? undefined;

  const data = await withTenant(principal.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, principal.userId);
    if (!teacherId) return null;
    if (!(await teacherTeachesClassSubject(tx, teacherId, classId, subjectId))) return null;

    const year = await tx.academicYear.findFirst({
      where: { active: true },
      include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    if (!year) return null;
    const periodId = pickPeriodId(year.periods, periodParam);
    if (!periodId) return null;

    const students = await tx.studentClass.findMany({
      where: { classId, unenrolledAt: null },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true },
        },
      },
      orderBy: { student: { lastName: 'asc' } },
    });
    const devoirs = await tx.evaluation.findMany({
      where: { classId, subjectId, periodId },
      orderBy: { date: 'desc' },
      include: { grades: { select: { studentId: true, value: true } } },
    });

    return {
      periods: year.periods.map((p) => ({ id: p.id, label: p.label })),
      periodId,
      students: students.map((s) => ({
        id: s.student.id,
        name: personDisplayName('fr', s.student),
      })),
      devoirs: devoirs.map((d) => ({
        id: d.id,
        label: d.label,
        date: d.date.toISOString().slice(0, 10),
        maxValue: d.maxValue,
        weight: d.weight,
        grades: Object.fromEntries(d.grades.map((g) => [g.studentId, g.value] as const)) as Record<
          string,
          number | null
        >,
      })),
    };
  });

  if (!data) return Response.json({ error: 'Classe ou matière non autorisée.' }, { status: 403 });
  return Response.json(data);
}

const cellsSchema = z.object({
  cells: z
    .array(
      z.object({
        evaluationId: z.string().uuid(),
        studentId: z.string().uuid(),
        value: z.number().min(0).max(100).nullable(),
      }),
    )
    .min(1)
    .max(500),
});

/**
 * POST /api/mobile/teacher/notes/[classId]/[subjectId]
 * Body : { cells: [{ evaluationId, studentId, value }] }
 * → enregistre les notes saisies sur le téléphone. Mêmes garde-fous que le
 *   web : appartenance du service, devoirs de la classe/matière, barème.
 */
export async function POST(req: Request, ctx: Ctx) {
  const principal = await verifyMobileTeacher(req);
  if (!principal) return unauthorized();
  const { classId, subjectId } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }
  const parsed = cellsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides.' }, { status: 400 });
  }

  try {
    await withTenant(principal.tenantId, async (tx) => {
      const teacherId = await getTeacherPersonId(tx, principal.userId);
      if (!teacherId) throw new Error('Profil enseignant introuvable.');
      if (!(await teacherTeachesClassSubject(tx, teacherId, classId, subjectId)))
        throw new Error('Matière/classe non autorisée.');

      const evalIds = [...new Set(parsed.data.cells.map((c) => c.evaluationId))];
      const evals = await tx.evaluation.findMany({
        where: { id: { in: evalIds }, classId, subjectId },
        select: { id: true, maxValue: true },
      });
      const maxById = new Map(evals.map((e) => [e.id, e.maxValue]));

      for (const c of parsed.data.cells) {
        const max = maxById.get(c.evaluationId);
        if (max === undefined) throw new Error('Devoir non autorisé.');
        if (c.value !== null && c.value > max) throw new Error(`Note ${c.value} > barème ${max}.`);
        await tx.grade.upsert({
          where: { evaluationId_studentId: { evaluationId: c.evaluationId, studentId: c.studentId } },
          update: { value: c.value, enteredByUserId: principal.userId },
          create: {
            tenantId: principal.tenantId,
            evaluationId: c.evaluationId,
            studentId: c.studentId,
            value: c.value,
            enteredByUserId: principal.userId,
          },
        });
      }
      await logAudit(tx, {
        tenantId: principal.tenantId,
        userId: principal.userId,
        action: 'save',
        entityType: 'EvaluationGrades',
        entityId: classId,
        after: { source: 'mobile-teacher', cells: parsed.data.cells.length },
      });
    });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 400 });
  }
}
