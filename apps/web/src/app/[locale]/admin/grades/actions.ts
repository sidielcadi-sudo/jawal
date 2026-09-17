'use server';

import { auth } from '@/lib/auth';
import { requireRoleCode } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { createStaffAlerts } from '@/lib/staff-alerts';
import type { TrackingSource } from '@/lib/grades-tracking';

type Result = { ok: true; notified: number } | { ok: false; error: string };

const fmt = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');

/**
 * « Relancer » : alerte l'enseignant dont la saisie des notes est en retard.
 *
 * Pour une évaluation de classe, ce sont les enseignants affectés à la matière
 * dans la classe ; pour une épreuve d'examen, ses correcteurs. L'alerte arrive
 * dans la cloche de l'enseignant — il faut donc qu'il ait un compte.
 */
export async function remindGradeEntryAction(source: TrackingSource, id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requireRoleCode(['tenant_admin', 'direction', 'scolarite']);
  const tenantId = session.user.tenantId;

  try {
    const notified = await withTenant(tenantId, async (tx) => {
      let teacherIds: string[] = [];
      let body = '';
      let relatedType = '';

      if (source === 'EVALUATION') {
        const ev = await tx.evaluation.findUnique({
          where: { id },
          select: {
            label: true,
            date: true,
            classId: true,
            subjectId: true,
            class: { select: { name: true, academicYearId: true } },
            subject: { select: { label: true } },
            grades: { select: { value: true } },
          },
        });
        if (!ev) throw new Error('Évaluation introuvable.');
        const [assignments, expected] = await Promise.all([
          tx.teacherAssignment.findMany({
            where: { classId: ev.classId, subjectId: ev.subjectId, academicYearId: ev.class.academicYearId },
            select: { teacherId: true },
          }),
          tx.studentClass.count({ where: { classId: ev.classId, unenrolledAt: null } }),
        ]);
        teacherIds = assignments.map((a) => a.teacherId);
        const entered = ev.grades.filter((g) => g.value !== null).length;
        body = `${ev.label} — ${ev.class.name} · ${ev.subject.label}, du ${fmt(ev.date)} : ${entered}/${expected} copies saisies.`;
        relatedType = 'Evaluation';
      } else {
        const paper = await tx.examPaper.findUnique({
          where: { id },
          select: {
            date: true,
            session: { select: { label: true } },
            subject: { select: { label: true } },
            graders: { select: { teacherId: true } },
            marks: { select: { value: true, absent: true } },
          },
        });
        if (!paper) throw new Error('Épreuve introuvable.');
        teacherIds = paper.graders.map((g) => g.teacherId);
        const entered = paper.marks.filter((m) => m.value !== null || m.absent).length;
        body = `${paper.session.label} — ${paper.subject.label}, du ${fmt(paper.date)} : ${entered} copie(s) saisie(s).`;
        relatedType = 'ExamPaper';
      }

      if (teacherIds.length === 0) {
        throw new Error(
          source === 'EXAM'
            ? 'Aucun correcteur n’est désigné pour cette épreuve.'
            : 'Aucun enseignant n’est affecté à cette matière dans la classe.',
        );
      }
      const accounts = await tx.userPerson.findMany({
        where: { personId: { in: teacherIds } },
        select: { userId: true },
      });
      const userIds = [...new Set(accounts.map((a) => a.userId))];
      if (userIds.length === 0) {
        throw new Error('L’enseignant n’a pas de compte : la relance ne peut pas lui parvenir.');
      }

      await createStaffAlerts(tx, tenantId, userIds, {
        type: 'GRADE_ENTRY_REMINDER',
        title: 'Relance : saisie des notes en retard',
        body,
        link: '/enseignant/notes',
        relatedType,
        relatedId: id,
      });
      return userIds.length;
    });
    return { ok: true, notified };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
