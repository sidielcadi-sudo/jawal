import 'server-only';
import type { Prisma } from '@/lib/db';
import { alertRole } from '@/lib/staff-alerts';

/** Rôles prévenus (cloche in-app) quand un enseignant déclare une absence. */
const ABSENCE_ALERT_ROLES = ['cpe', 'scolarite', 'direction', 'tenant_admin'];

/**
 * Alerte la vie scolaire et la direction qu'un enseignant est absent, avec un
 * lien direct vers l'écran de remplacement (étape 1 du workflow de remplacement).
 * À appeler dans la même transaction que la création du congé.
 */
export async function alertTeacherAbsence(
  tx: Prisma.TransactionClient,
  tenantId: string,
  args: { leaveId: string; teacherName: string; typeLabel: string; start: Date; end: Date },
): Promise<void> {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  await alertRole(tx, tenantId, ABSENCE_ALERT_ROLES, {
    type: 'TEACHER_ABSENCE',
    title: `Absence enseignant — ${args.teacherName}`,
    body: `${args.typeLabel} · ${fmt(args.start)} → ${fmt(args.end)}. Organiser le remplacement.`,
    link: `/admin/leave/${args.leaveId}/remplacements`,
    relatedType: 'LeaveRequest',
    relatedId: args.leaveId,
  });
}
