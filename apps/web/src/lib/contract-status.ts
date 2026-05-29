/**
 * Statut d'un contrat de salarié.
 * Utilisé pour les badges UI et la détection des alertes d'expiration.
 */

export type ContractStatus =
  | 'NO_CONTRACT'        // aucune date d'entrée renseignée
  | 'NOT_STARTED'        // hireDate > aujourd'hui
  | 'ACTIVE'             // en poste, contrat sans fin ou loin
  | 'EXPIRES_30'         // expire dans ≤ 30 jours
  | 'EXPIRES_7'          // expire dans ≤ 7 jours
  | 'EXPIRED';           // contractEndDate < aujourd'hui

export const ALERT_THRESHOLDS_DAYS = [30, 7] as const;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function daysBetween(a: Date, b: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS);
}

export function computeContractStatus(
  person: { hireDate: Date | null; contractEndDate: Date | null },
  now: Date = new Date(),
): { status: ContractStatus; daysToEnd: number | null } {
  if (!person.hireDate) return { status: 'NO_CONTRACT', daysToEnd: null };

  const today = startOfDay(now);
  const hire = startOfDay(person.hireDate);
  if (hire.getTime() > today.getTime()) {
    return { status: 'NOT_STARTED', daysToEnd: null };
  }

  if (!person.contractEndDate) return { status: 'ACTIVE', daysToEnd: null };

  const end = startOfDay(person.contractEndDate);
  const days = daysBetween(today, end);

  if (days < 0) return { status: 'EXPIRED', daysToEnd: days };
  if (days <= 7) return { status: 'EXPIRES_7', daysToEnd: days };
  if (days <= 30) return { status: 'EXPIRES_30', daysToEnd: days };
  return { status: 'ACTIVE', daysToEnd: days };
}

/// Couleur Tailwind associée — utilisée par les badges UI.
export function contractStatusBadgeClass(status: ContractStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-100 text-emerald-700';
    case 'EXPIRES_30':
      return 'bg-amber-100 text-amber-800';
    case 'EXPIRES_7':
      return 'bg-orange-100 text-orange-800';
    case 'EXPIRED':
      return 'bg-red-100 text-red-700';
    case 'NOT_STARTED':
      return 'bg-blue-100 text-blue-700';
    case 'NO_CONTRACT':
    default:
      return 'bg-slate-100 text-slate-600';
  }
}
