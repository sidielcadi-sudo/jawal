import 'server-only';
import { withTenant } from '@/lib/db';
import { safeSendEmail } from '@/lib/email';

/**
 * Envoie un e-mail aux contacts des élèves absents d'une session d'appel.
 * Best-effort : on collecte les échecs mais on ne fait pas échouer l'appelant.
 * Partagé entre l'appel admin et l'appel enseignant.
 */
export async function notifyAbsentees(tenantId: string, sessionId: string): Promise<void> {
  const data = await withTenant(tenantId, async (tx) => {
    const sessionRow = await tx.attendanceSession.findUnique({
      where: { id: sessionId },
      include: {
        class: true,
        records: {
          where: { status: 'ABSENT' },
          include: { student: true },
        },
      },
    });
    if (!sessionRow) return null;
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
    return { sessionRow, tenant };
  });
  if (!data || !data.sessionRow) return;

  const { sessionRow, tenant } = data;
  const dateStr = sessionRow.date.toLocaleDateString('fr-FR');
  const tenantName = tenant?.name ?? 'Jawal';
  const className = sessionRow.class.name;

  await Promise.all(
    sessionRow.records.map(async (rec) => {
      const contacts = (rec.student.contacts ?? {}) as { email?: string };
      const email = contacts.email;
      if (!email) return;

      await safeSendEmail({
        to: email,
        subject: `[${tenantName}] Absence de ${rec.student.firstName} ${rec.student.lastName} — ${dateStr}`,
        html: `
          <p>Bonjour,</p>
          <p>Nous vous informons que <strong>${rec.student.firstName} ${rec.student.lastName}</strong>
          a été enregistré(e) <strong>absent(e)</strong> au cours du <strong>${dateStr}</strong>
          pour la classe <strong>${className}</strong>.</p>
          <p>Si cette absence est justifiée, merci de nous transmettre un document
          (certificat médical, attestation parentale) via votre espace parent ou
          directement à l'administration.</p>
          <p>Cordialement,<br/>${tenantName}</p>
          <hr/>
          <p style="font-size:11px;color:#888">Notification automatique — ne pas répondre à cet email.</p>
        `,
        text: `${rec.student.firstName} ${rec.student.lastName} a été absent(e) le ${dateStr} (${className}). Merci de justifier si besoin.`,
      });
    }),
  );
}
