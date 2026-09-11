import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { csvResponse, toCSV } from '@/lib/csv-export';

const STATUS_LABEL: Record<string, string> = {
  PRESENT: 'Présent',
  ABSENT: 'Absent',
  LATE: 'Retard',
  EXCUSED: 'Excusé',
};

const NOTICE_LABEL: Record<string, string> = {
  SENT: 'Oui',
  FAILED: 'Échec',
  SKIPPED: 'Pas de contact',
};

/**
 * Export du tableau de bord Absences pour un jour donné.
 *
 * Exporte le pointage complet — présents inclus — et non les seules absences :
 * une ligne « présent » manquante ne se distinguerait pas d'un élève jamais
 * pointé, et c'est précisément ce que le destinataire du rapport vérifie.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const dateParam = url.searchParams.get('date') ?? '';
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : new Date().toISOString().slice(0, 10);
  const classId = url.searchParams.get('class');
  const date = new Date(`${dateStr}T00:00:00.000Z`);

  const rows = await withTenant(session.user.tenantId, async (tx) => {
    const sessions = await tx.attendanceSession.findMany({
      where: { date, ...(classId ? { classId } : {}) },
      select: {
        periodLabel: true,
        finalizedAt: true,
        class: { select: { name: true, level: { select: { label: true } } } },
        records: {
          select: {
            id: true,
            status: true,
            lateMinutes: true,
            note: true,
            lateReason: { select: { label: true } },
            justification: { select: { status: true, reason: true } },
            student: { select: { firstName: true, lastName: true, massarId: true } },
          },
        },
      },
      orderBy: { class: { name: 'asc' } },
    });

    const recordIds = sessions.flatMap((s) => s.records.map((r) => r.id));
    const notices = recordIds.length
      ? await tx.notificationLog.findMany({
          where: { relatedType: 'AttendanceRecord', relatedId: { in: recordIds } },
          select: { relatedId: true, status: true },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const noticeBy = new Map(notices.map((n) => [n.relatedId ?? '', n.status]));

    return sessions.flatMap((s) =>
      s.records.map((r) => ({
        date: dateStr,
        className: s.class.name,
        level: s.class.level.label,
        period: s.periodLabel ?? '',
        massarId: r.student.massarId ?? '',
        lastName: r.student.lastName,
        firstName: r.student.firstName,
        status: STATUS_LABEL[r.status] ?? r.status,
        lateMinutes: r.lateMinutes ?? '',
        reason: r.lateReason?.label ?? r.justification?.reason ?? r.note ?? '',
        justification: r.justification?.status ?? '',
        notified: NOTICE_LABEL[noticeBy.get(r.id) ?? ''] ?? 'Non',
        finalized: s.finalizedAt ? 'Oui' : 'Non',
      })),
    );
  });

  const csv = toCSV(rows, [
    { key: 'date', label: 'Date' },
    { key: 'className', label: 'Classe' },
    { key: 'level', label: 'Niveau' },
    { key: 'period', label: 'Créneau' },
    { key: 'massarId', label: 'MASSAR' },
    { key: 'lastName', label: 'Nom' },
    { key: 'firstName', label: 'Prénom' },
    { key: 'status', label: 'Statut' },
    { key: 'lateMinutes', label: 'Minutes de retard' },
    { key: 'reason', label: 'Motif' },
    { key: 'justification', label: 'Justification' },
    { key: 'notified', label: 'Parent informé' },
    { key: 'finalized', label: 'Appel validé' },
  ]);

  return csvResponse(csv, `absences-${dateStr}.csv`);
}
