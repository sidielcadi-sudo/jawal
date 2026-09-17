/**
 * Pointage des enseignants par l'appel.
 *
 * L'enseignant fait l'appel dès son arrivée en classe : enregistrer la feuille
 * prouve qu'il est là. Quand l'établissement l'active (Paramétrage), le premier
 * appel du jour vaut donc pointage de présence — une saisie de moins pour la
 * vie scolaire.
 *
 * Règle de prudence : on ne remplace jamais un pointage déjà saisi. Une
 * absence posée par l'administration reste une décision humaine ; l'appel se
 * contente d'ajouter l'heure d'arrivée quand elle manque.
 */
import type { Prisma } from '@jawal/db';

type Tx = Prisma.TransactionClient;

export type StaffAttendanceSettings = { appelCountsAsPresence: boolean };

/** Lit le réglage dans `Tenant.settings`. Désactivé par défaut. */
export function readStaffAttendanceSettings(raw: unknown): StaffAttendanceSettings {
  const block =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>).staffAttendance : undefined;
  const enabled =
    block && typeof block === 'object'
      ? (block as Record<string, unknown>).appelCountsAsPresence === true
      : false;
  return { appelCountsAsPresence: enabled };
}

/**
 * Ce que l'appel doit faire du pointage existant :
 * - `create` : aucun pointage ce jour-là → présent ;
 * - `check-in` : présent ou en retard, sans heure d'arrivée, et l'appel est du
 *   jour même → on renseigne l'heure ;
 * - `skip` : tout le reste (absence, congé, heure déjà connue, appel rattrapé
 *   un autre jour).
 */
export function presenceFromAppel(
  existing: { status: string; checkIn: Date | null } | null,
  isToday: boolean,
): 'create' | 'check-in' | 'skip' {
  if (!existing) return 'create';
  if (isToday && !existing.checkIn && (existing.status === 'PRESENT' || existing.status === 'LATE')) {
    return 'check-in';
  }
  return 'skip';
}

/** À appeler dans la transaction d'enregistrement de l'appel. */
export async function recordPresenceFromAppel(
  tx: Tx,
  input: { tenantId: string; personId: string; date: string; userId: string; now?: Date },
): Promise<'create' | 'check-in' | 'skip' | 'disabled'> {
  const tenant = await tx.tenant.findUnique({
    where: { id: input.tenantId },
    select: { settings: true },
  });
  if (!readStaffAttendanceSettings(tenant?.settings).appelCountsAsPresence) return 'disabled';

  const now = input.now ?? new Date();
  const dateOnly = new Date(`${input.date}T00:00:00.000Z`);
  const isToday = now.toISOString().slice(0, 10) === input.date;
  const existing = await tx.staffAttendance.findUnique({
    where: { personId_date: { personId: input.personId, date: dateOnly } },
    select: { id: true, status: true, checkIn: true },
  });

  const decision = presenceFromAppel(existing, isToday);
  if (decision === 'create') {
    await tx.staffAttendance.create({
      data: {
        tenantId: input.tenantId,
        personId: input.personId,
        date: dateOnly,
        status: 'PRESENT',
        // Un appel rattrapé un autre jour prouve la présence, pas l'heure.
        checkIn: isToday ? now : null,
        note: 'Pointage automatique (appel)',
        recordedByUserId: input.userId,
      },
    });
  } else if (decision === 'check-in' && existing) {
    await tx.staffAttendance.update({ where: { id: existing.id }, data: { checkIn: now } });
  }
  return decision;
}
