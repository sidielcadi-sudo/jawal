import 'server-only';
import { withTenant } from '@/lib/db';
import { safeSendEmail } from '@/lib/email';

const TYPE_LABELS: Record<string, string> = {
  OBSERVATION: 'Observation',
  ENCOURAGEMENT: 'Encouragement',
  FELICITATION: 'Félicitations',
  REMARQUE_DISCIPLINAIRE: 'Remarque',
  DEFAUT_CARNET: 'Défaut de carnet',
  AVERTISSEMENT: 'Avertissement',
  MESSAGE_DIRECTION: 'Message de la direction',
  CONVOCATION: 'Convocation',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Notifie par e-mail les parents des nouvelles entrées de carnet visibles, en
 * regroupant par enfant (un seul e-mail récapitulant ses nouvelles entrées).
 * Best-effort : ne lève jamais. À appeler HORS transaction.
 */
export async function notifyCarnetEntries(tenantId: string, entryIds: string[]): Promise<void> {
  if (entryIds.length === 0) return;
  try {
    const ctx = await withTenant(tenantId, async (tx) => {
      const entries = await tx.carnetEntry.findMany({
        where: { id: { in: entryIds }, visibleToParents: true },
        select: { id: true, studentId: true, type: true, content: true, occurredAt: true },
      });
      if (entries.length === 0) return null;

      const studentIds = [...new Set(entries.map((e) => e.studentId))];
      const students = await tx.person.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, firstName: true, lastName: true },
      });
      const relations = await tx.personRelation.findMany({
        where: { childId: { in: studentIds } },
        select: { childId: true, parent: { select: { type: true, contacts: true } } },
      });
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
      return { entries, students, relations, tenantName: tenant?.name ?? 'Jawal' };
    });
    if (!ctx) return;

    const byStudent = new Map<string, typeof ctx.entries>();
    for (const e of ctx.entries) {
      const arr = byStudent.get(e.studentId) ?? [];
      arr.push(e);
      byStudent.set(e.studentId, arr);
    }
    const studentName = new Map(
      ctx.students.map((s) => [s.id, `${s.firstName} ${s.lastName}`] as const),
    );
    const emailsByStudent = new Map<string, string[]>();
    for (const r of ctx.relations) {
      if (!r.parent || r.parent.type !== 'PARENT') continue;
      const email = ((r.parent.contacts ?? {}) as { email?: string }).email;
      if (!email) continue;
      const arr = emailsByStudent.get(r.childId) ?? [];
      arr.push(email);
      emailsByStudent.set(r.childId, arr);
    }

    const baseUrl = process.env.APP_URL ?? 'http://localhost:3000';
    for (const [studentId, entries] of byStudent) {
      const emails = emailsByStudent.get(studentId);
      if (!emails || emails.length === 0) continue;
      const name = studentName.get(studentId) ?? 'votre enfant';
      const lines = entries
        .map(
          (e) =>
            `<li><strong>${esc(TYPE_LABELS[e.type] ?? e.type)}</strong> (${e.occurredAt.toLocaleDateString('fr-FR')}) : ${esc(e.content)}</li>`,
        )
        .join('');
      const textLines = entries
        .map((e) => `- ${TYPE_LABELS[e.type] ?? e.type} (${e.occurredAt.toLocaleDateString('fr-FR')}) : ${e.content}`)
        .join('\n');

      await Promise.all(
        [...new Set(emails)].map((to) =>
          safeSendEmail({
            to,
            subject: `[${ctx.tenantName}] Carnet de correspondance — ${name}`,
            html:
              `<p>Bonjour,</p>` +
              `<p>De nouvelles informations concernant <strong>${esc(name)}</strong> sont disponibles dans le carnet de correspondance :</p>` +
              `<ul>${lines}</ul>` +
              `<p><a href="${esc(baseUrl)}/fr/parent">Consulter l'Espace Parents</a></p>` +
              `<hr/><p style="font-size:11px;color:#888">Notification automatique — ne pas répondre à cet e-mail.</p>`,
            text:
              `De nouvelles informations concernant ${name} sont disponibles dans le carnet :\n\n${textLines}\n\n` +
              `Espace Parents : ${baseUrl}/fr/parent`,
          }),
        ),
      );
    }
  } catch (e) {
    console.error('[carnet-notify] échec', e);
  }
}
