'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requireRoleCode } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { loadActiveFramework } from '@/lib/competences';
import { computeReports } from '@/lib/competency-report';
import { sendNotifications, parentRecipient, emailRecipient, type NotifyItem } from '@/lib/notify';
import { renderTemplate } from '@/lib/notify-templates';
import { sendDirectMessage } from '@/lib/inapp-message';

type Result = { ok: true; frozen?: number } | { ok: false; error: string };

/**
 * Fige le bilan de compétences d'une classe pour une période.
 *
 * Sans ce gel, le bulletin d'un trimestre changerait rétroactivement dès qu'un
 * enseignant saisit une évaluation plus tard dans l'année. Le snapshot rend le
 * document remis aux familles reproductible.
 */
export async function freezeClassReportsAction(classId: string, periodId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requireRoleCode(['tenant_admin', 'direction']);
  const tenantId = session.user.tenantId;

  try {
    const frozen = await withTenant(tenantId, async (tx) => {
      const framework = await loadActiveFramework(tx);
      if (!framework) throw new Error('Aucun référentiel actif.');

      const klass = await tx.class.findUnique({ where: { id: classId }, select: { levelId: true } });
      const scs = await tx.studentClass.findMany({
        where: { classId, unenrolledAt: null, student: { deletedAt: null, enrollments: { some: { status: 'ACTIVE' } } } },
        select: { studentId: true },
      });
      const studentIds = scs.map((s) => s.studentId);
      if (studentIds.length === 0) throw new Error('Aucun élève dans cette classe.');

      const reports = await computeReports(tx, {
        frameworkId: framework.id,
        periodId,
        studentIds,
        levelId: klass?.levelId ?? null,
      });

      let count = 0;
      for (const [studentId, r] of reports) {
        await tx.competencyReport.upsert({
          where: { studentId_periodId: { studentId, periodId } },
          create: {
            tenantId,
            studentId,
            periodId,
            frameworkId: framework.id,
            data: r as unknown as object,
            disciplinaryRate: r.disciplinaryRate,
            transversalRate: r.transversalRate,
            generatedByUserId: session.user.id,
          },
          update: {
            data: r as unknown as object,
            disciplinaryRate: r.disciplinaryRate,
            transversalRate: r.transversalRate,
            generatedByUserId: session.user.id,
            generatedAt: new Date(),
          },
        });
        count++;
      }

      // Notification aux familles — au gel uniquement, pas à chaque évaluation.
      const period = await tx.period.findUnique({ where: { id: periodId }, select: { label: true } });
      const locale = (await tx.tenant.findFirst({ select: { localeDefault: true } }))?.localeDefault ?? 'fr';
      const students = await tx.person.findMany({
        where: { id: { in: studentIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          relationsAsChild: {
            select: {
              parent: {
                select: {
                  id: true,
                  contacts: true,
                  userPersons: { select: { userId: true, user: { select: { email: true } } } },
                },
              },
            },
          },
        },
      });
      const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r)} %`);
      const items: NotifyItem[] = [];
      for (const st of students) {
        const r = reports.get(st.id);
        if (!r) continue;
        const data = {
          child: `${st.firstName} ${st.lastName}`,
          period: period?.label ?? '',
          disciplinary: pct(r.disciplinaryRate),
          transversal: pct(r.transversalRate),
        };
        const body = renderTemplate('competency.report', data, locale);
        const subject = `Bilan de compétences — ${data.period}`;
        const seen = new Set<string>();
        for (const rel of st.relationsAsChild) {
          if (seen.has(rel.parent.id)) continue;
          seen.add(rel.parent.id);
          const up = rel.parent.userPersons[0];
          if (up?.userId) {
            await sendDirectMessage(tx, { tenantId, fromUserId: session.user.id, toUserId: up.userId, subject, body });
          }
          items.push({
            channel: 'EMAIL',
            recipient: emailRecipient(rel.parent.contacts, up?.user?.email),
            template: 'competency.report',
            data,
            studentId: st.id,
            relatedType: 'CompetencyReport',
            relatedId: periodId,
          });
          items.push({
            recipient: parentRecipient(rel.parent.contacts),
            template: 'competency.report',
            data,
            studentId: st.id,
            relatedType: 'CompetencyReport',
            relatedId: periodId,
          });
        }
      }
      await sendNotifications(tx, tenantId, locale, items);

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'freeze',
        entityType: 'CompetencyReport',
        entityId: classId,
        after: { periodId, students: count, notified: items.length },
      });
      return count;
    });

    revalidatePath('/admin/competences/bilan');
    return { ok: true, frozen };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
