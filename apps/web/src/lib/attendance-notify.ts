import 'server-only';
import { withTenant } from '@/lib/db';
import { safeSendEmail } from '@/lib/email';

/** Trace posée dans `notification_logs` pour tout avis d'absence. */
const RELATED_TYPE = 'AttendanceRecord';
const TEMPLATE = 'attendance.absence';

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
          include: { student: { include: { relationsAsChild: { include: { parent: true } } } } },
        },
      },
    });
    if (!sessionRow) return null;
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
    return { sessionRow, tenant };
  });
  if (!data || !data.sessionRow) return;

  const { sessionRow, tenant } = data;
  await Promise.all(
    sessionRow.records.map((rec) =>
      sendAbsenceNotice({
        tenantId,
        tenantName: tenant?.name ?? 'LeadSchool',
        className: sessionRow.class.name,
        date: sessionRow.date,
        record: rec,
      }),
    ),
  );
}

/**
 * Prévient les contacts d'un seul élève absent ou en retard.
 *
 * Utilisé par le bouton « Prévenir » du tableau de bord Absences, quand l'avis
 * automatique n'est pas parti (adresse manquante au moment de l'appel, absence
 * saisie après coup, parent qui redemande l'information).
 */
export async function notifyOneAbsence(
  tenantId: string,
  recordId: string,
): Promise<{ ok: boolean; reason?: 'not-found' | 'no-recipient' | 'send-failed' }> {
  const data = await withTenant(tenantId, async (tx) => {
    const record = await tx.attendanceRecord.findUnique({
      where: { id: recordId },
      include: {
        student: { include: { relationsAsChild: { include: { parent: true } } } },
        session: { include: { class: true } },
      },
    });
    if (!record) return null;
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
    return { record, tenant };
  });
  if (!data) return { ok: false, reason: 'not-found' };

  return sendAbsenceNotice({
    tenantId,
    tenantName: data.tenant?.name ?? 'LeadSchool',
    className: data.record.session.class.name,
    date: data.record.session.date,
    record: data.record,
  });
}

/**
 * Adresses à prévenir pour une absence, parents d'abord.
 *
 * L'avis visait jusqu'ici la seule adresse portée par la fiche de l'élève.
 * C'est celle du mineur, pas celle de sa famille : sur ce jeu de données, 249
 * élèves ont une adresse contre 415 parents, et la colonne « Parent informé »
 * du tableau de bord aurait affirmé une chose fausse. On écrit donc aux
 * responsables, et l'adresse de l'élève ne sert plus que de repli quand aucun
 * responsable n'est joignable.
 */
function absenceRecipients(student: {
  contacts: unknown;
  relationsAsChild: Array<{ parent: { contacts: unknown } }>;
}): string[] {
  const emailOf = (c: unknown) => ((c ?? {}) as { email?: string }).email?.trim();
  const parents = student.relationsAsChild
    .map((r) => emailOf(r.parent.contacts))
    .filter((e): e is string => Boolean(e));
  if (parents.length > 0) return [...new Set(parents)];
  const own = emailOf(student.contacts);
  return own ? [own] : [];
}

/**
 * Envoi + journalisation d'un avis.
 *
 * La trace en base n'est pas décorative : c'est elle qui alimente la colonne
 * « Parent informé » du tableau de bord. Sans elle, un envoi réussi et un envoi
 * jamais tenté sont indiscernables — on avait donc jusqu'ici une information
 * que personne ne pouvait vérifier. Les cas « pas d'adresse » et « échec du
 * fournisseur » sont journalisés eux aussi, en SKIPPED et FAILED, pour qu'un
 * silence puisse être expliqué.
 */
async function sendAbsenceNotice(args: {
  tenantId: string;
  tenantName: string;
  className: string;
  date: Date;
  record: {
    id: string;
    status: string;
    student: {
      id: string;
      firstName: string;
      lastName: string;
      contacts: unknown;
      relationsAsChild: Array<{ parent: { contacts: unknown } }>;
    };
  };
}): Promise<{ ok: boolean; reason?: 'no-recipient' | 'send-failed' }> {
  const { tenantId, tenantName, className, date, record } = args;
  const dateStr = date.toLocaleDateString('fr-FR');
  const student = `${record.student.firstName} ${record.student.lastName}`;
  const late = record.status === 'LATE';
  const what = late ? 'en retard' : 'absent(e)';

  const recipients = absenceRecipients(record.student);
  const email = recipients.join(', ');

  const log = (status: 'SENT' | 'FAILED' | 'SKIPPED', error?: string) =>
    withTenant(tenantId, (tx) =>
      tx.notificationLog.create({
        data: {
          tenantId,
          channel: 'EMAIL',
          recipient: email,
          recipientName: student,
          studentId: record.student.id,
          template: TEMPLATE,
          body: `${student} — ${what} le ${dateStr} (${className})`,
          status,
          error,
          relatedType: RELATED_TYPE,
          relatedId: record.id,
          sentAt: status === 'SENT' ? new Date() : null,
        },
      }),
    );

  if (recipients.length === 0) {
    await log('SKIPPED', 'aucune adresse de contact');
    return { ok: false, reason: 'no-recipient' };
  }

  const res = await safeSendEmail({
    to: recipients.join(', '),
    subject: `[${tenantName}] ${late ? 'Retard' : 'Absence'} de ${student} — ${dateStr}`,
    html: `
      <p>Bonjour,</p>
      <p>Nous vous informons que <strong>${student}</strong>
      a été enregistré(e) <strong>${what}</strong> au cours du <strong>${dateStr}</strong>
      pour la classe <strong>${className}</strong>.</p>
      <p>Si cette ${late ? 'arrivée tardive' : 'absence'} est justifiée, merci de nous transmettre
      un document (certificat médical, attestation parentale) via votre espace parent ou
      directement à l'administration.</p>
      <p>Cordialement,<br/>${tenantName}</p>
      <hr/>
      <p style="font-size:11px;color:#888">Notification automatique — ne pas répondre à cet email.</p>
    `,
    text: `${student} a été ${what} le ${dateStr} (${className}). Merci de justifier si besoin.`,
  });

  await log(res.ok ? 'SENT' : 'FAILED', res.ok ? undefined : res.error);
  return res.ok ? { ok: true } : { ok: false, reason: 'send-failed' };
}
