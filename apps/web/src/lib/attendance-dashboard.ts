/**
 * Calculs du tableau de bord « Absences et présences ».
 *
 * Tout ce qui se calcule sans base de données vit ici : la page reste un
 * assemblage de requêtes et de JSX, et les règles (seuils de couleur, séries
 * du graphe, déclenchement des alertes) sont testables sans monter un tenant.
 */

/* ── Taux de présence ────────────────────────────────────────────────────── */

export type Tone = 'good' | 'medium' | 'weak';

export type Counts = {
  present: number;
  absent: number;
  late: number;
  excused: number;
};

/** Effectif réellement pointé. Un élève non pointé ne compte dans aucun taux. */
export function countedTotal(c: Counts): number {
  return c.present + c.absent + c.late + c.excused;
}

/**
 * Taux de présence en %, ou `null` si l'appel n'a pas été fait.
 *
 * Les retards comptent comme présents : l'élève est là. Les mélanger aux
 * absents ferait chuter le taux d'une classe ponctuellement embouteillée, ce
 * qui ne décrit pas la réalité qu'on cherche à surveiller.
 */
export function presenceRate(c: Counts): number | null {
  const total = countedTotal(c);
  if (total === 0) return null;
  return Math.round(((c.present + c.late + c.excused) / total) * 1000) / 10;
}

/** Seuils de la légende : Bon ≥ 90 %, Moyen 75-89 %, Faible < 75 %. */
export function rateTone(rate: number | null): Tone | null {
  if (rate === null) return null;
  if (rate >= 90) return 'good';
  if (rate >= 75) return 'medium';
  return 'weak';
}

/* ── Anneau de répartition ───────────────────────────────────────────────── */

export type DonutSegment = {
  key: 'present' | 'absent' | 'late';
  count: number;
  pct: number;
  /** `stroke-dasharray` du segment. */
  dash: string;
  /** `stroke-dashoffset` positionnant le segment à la suite du précédent. */
  offset: number;
};

/**
 * Découpe l'anneau en trois arcs posés bout à bout.
 *
 * Chaque arc est un cercle SVG complet dont on ne peint qu'une fraction,
 * décalé du cumul des précédents : pas de trigonométrie, pas de librairie de
 * graphes à charger pour trois valeurs.
 */
export function donutSegments(c: Counts, circumference: number): DonutSegment[] {
  const total = c.present + c.absent + c.late;
  const parts: Array<{ key: DonutSegment['key']; count: number }> = [
    { key: 'present', count: c.present },
    { key: 'absent', count: c.absent },
    { key: 'late', count: c.late },
  ];
  let cumulated = 0;
  return parts.map((p) => {
    const share = total > 0 ? p.count / total : 0;
    const length = share * circumference;
    const seg: DonutSegment = {
      key: p.key,
      count: p.count,
      pct: total > 0 ? Math.round(share * 1000) / 10 : 0,
      dash: `${length} ${circumference - length}`,
      offset: -cumulated,
    };
    cumulated += length;
    return seg;
  });
}

/* ── Courbe de tendance ──────────────────────────────────────────────────── */

export type TrendDay = { date: string } & Counts;
export type TrendPoint = { date: string; presencePct: number; absencePct: number };

/**
 * Série des N derniers jours **ayant donné lieu à un appel**.
 *
 * Les jours sans appel sont écartés plutôt que tracés à zéro : un dimanche à
 * 0 % de présence ferait plonger la courbe et donnerait l'illusion d'un
 * décrochage.
 */
export function buildTrend(days: TrendDay[], limit = 7): TrendPoint[] {
  return days
    .filter((d) => countedTotal(d) > 0)
    .slice(-limit)
    .map((d) => {
      const total = countedTotal(d);
      const presencePct = Math.round(((d.present + d.late + d.excused) / total) * 1000) / 10;
      return {
        date: d.date,
        presencePct,
        absencePct: Math.round((100 - presencePct) * 10) / 10,
      };
    });
}

/**
 * Points d'une polyligne SVG pour une série en pourcentage (0-100).
 *
 * Un point isolé est doublé pour rester visible : un `<polyline>` d'un seul
 * point ne dessine rien.
 */
export function polylinePoints(
  values: number[],
  opts: { width: number; height: number; padX?: number; padY?: number },
): string {
  const { width, height, padX = 0, padY = 0 } = opts;
  if (values.length === 0) return '';
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const step = values.length > 1 ? innerW / (values.length - 1) : 0;
  const pts = values.map((v, i) => {
    const x = padX + (values.length > 1 ? i * step : innerW / 2);
    const y = padY + innerH - (Math.max(0, Math.min(100, v)) / 100) * innerH;
    return `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`;
  });
  return pts.length === 1 ? `${pts[0]} ${pts[0]}` : pts.join(' ');
}

/* ── Alertes ─────────────────────────────────────────────────────────────── */

export type AlertKind = 'PROLONGED' | 'UNJUSTIFIED' | 'FREQUENT_LATE' | 'MISSING_DOC';

export type AlertInput = {
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  /** Jour de l'événement, au format YYYY-MM-DD. */
  date: string;
  status: 'ABSENT' | 'LATE' | 'PRESENT' | 'EXCUSED';
  /** Justification acceptée. */
  justified: boolean;
  /** Justification déposée mais encore à traiter. */
  pending: boolean;
  /** Pièce jointe fournie avec la justification. */
  hasAttachment: boolean;
};

export type Alert = {
  kind: AlertKind;
  studentId: string;
  studentName: string;
  className: string;
  /** Valeur affichée dans le libellé (nombre de jours, de retards…). */
  count: number;
  date: string;
};

/**
 * Signaux qui méritent qu'on décroche le téléphone.
 *
 * Une seule alerte par élève : la plus grave. Un élève absent depuis trois
 * jours déclencherait sinon les quatre règles à la fois et noierait la liste.
 */
export function buildAlerts(
  rows: AlertInput[],
  opts: {
    today: string;
    weekStart: string;
    /**
     * Jours où chaque classe a été appelée, triés croissant.
     *
     * Indispensable au calcul des absences prolongées : sans le calendrier des
     * appels, on ne voit que les jours d'incident, et onze absences éparpillées
     * sur le mois se lisent comme onze jours consécutifs.
     */
    callDays: Record<string, string[]>;
    limit?: number;
  },
): Alert[] {
  const { today, weekStart, callDays, limit = 6 } = opts;
  const byStudent = new Map<string, AlertInput[]>();
  for (const r of rows) {
    const list = byStudent.get(r.studentId);
    if (list) list.push(r);
    else byStudent.set(r.studentId, [r]);
  }

  const out: Alert[] = [];
  for (const [studentId, list] of byStudent) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1]!;
    const base = {
      studentId,
      studentName: last.studentName,
      className: last.className,
      date: last.date,
    };

    // Absence prolongée : jours d'appel consécutifs terminés par une absence.
    // On compte les jours pointés, pas les jours calendaires — un week-end au
    // milieu ne rompt pas la série.
    const absentOn = new Set(sorted.filter((r) => r.status === 'ABSENT').map((r) => r.date));
    const calendar = (callDays[last.classId] ?? []).filter((d) => d <= today);
    const streak = trailingStreak(calendar, absentOn);
    if (streak >= 3) {
      out.push({ kind: 'PROLONGED', ...base, count: streak });
      continue;
    }

    const unjustifiedToday = sorted.some(
      (r) => r.date === today && r.status === 'ABSENT' && !r.justified && !r.pending,
    );
    if (unjustifiedToday) {
      out.push({ kind: 'UNJUSTIFIED', ...base, count: 1, date: today });
      continue;
    }

    const lates = sorted.filter(
      (r) => r.status === 'LATE' && r.date >= weekStart && r.date <= today,
    ).length;
    if (lates >= 3) {
      out.push({ kind: 'FREQUENT_LATE', ...base, count: lates });
      continue;
    }

    const missingDoc = sorted.filter((r) => r.pending && !r.hasAttachment);
    if (missingDoc.length > 0) {
      const m = missingDoc[missingDoc.length - 1]!;
      out.push({ kind: 'MISSING_DOC', ...base, count: 1, date: m.date });
    }
  }

  const rank: Record<AlertKind, number> = {
    PROLONGED: 0,
    UNJUSTIFIED: 1,
    FREQUENT_LATE: 2,
    MISSING_DOC: 3,
  };
  return out
    .sort((a, b) => rank[a.kind] - rank[b.kind] || b.date.localeCompare(a.date))
    .slice(0, limit);
}

/**
 * Longueur de la série d'absences qui se termine au dernier jour d'appel.
 *
 * `days` est le calendrier des appels de la classe, trié croissant : un jour
 * qui s'y trouve sans absence rompt la série (l'élève était là), un jour
 * absent du calendrier ne la rompt pas (week-end, férié, classe non appelée).
 */
function trailingStreak(days: string[], absentOn: Set<string>): number {
  let n = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (!absentOn.has(days[i]!)) break;
    n++;
  }
  return n;
}
