import { describe, it, expect } from 'vitest';
import {
  presenceRate,
  countedTotal,
  rateTone,
  donutSegments,
  buildTrend,
  polylinePoints,
  buildAlerts,
  type AlertInput,
} from './attendance-dashboard';

const counts = (present: number, absent: number, late = 0, excused = 0) => ({
  present,
  absent,
  late,
  excused,
});

describe('presenceRate', () => {
  it('compte les retards et les excusés comme présents', () => {
    // 8 présents + 1 retard + 1 excusé sur 10 pointés = 100 % de présence
    expect(presenceRate(counts(8, 0, 1, 1))).toBe(100);
  });

  it('exclut les élèves non pointés du dénominateur', () => {
    // 27 pointés sur une classe de 30 : le taux porte sur les 27.
    expect(presenceRate(counts(24, 3))).toBe(88.9);
  });

  it("rend null quand l'appel n'a pas été fait", () => {
    expect(presenceRate(counts(0, 0))).toBeNull();
    expect(countedTotal(counts(0, 0))).toBe(0);
  });
});

describe('rateTone', () => {
  it('applique les seuils de la légende', () => {
    expect(rateTone(90)).toBe('good');
    expect(rateTone(89.9)).toBe('medium');
    expect(rateTone(75)).toBe('medium');
    expect(rateTone(74.9)).toBe('weak');
  });

  it('ne colore pas une classe non pointée', () => {
    expect(rateTone(null)).toBeNull();
  });
});

describe('donutSegments', () => {
  it('pose les arcs bout à bout sans trou ni recouvrement', () => {
    const segs = donutSegments(counts(50, 30, 20), 100);
    expect(segs.map((s) => s.pct)).toEqual([50, 30, 20]);
    expect(segs.map((s) => s.offset)).toEqual([-0, -50, -80]);
    expect(segs[0]!.dash).toBe('50 50');
    expect(segs[2]!.dash).toBe('20 80');
  });

  it('ignore les excusés, absents du graphe de la maquette', () => {
    const segs = donutSegments(counts(1, 0, 0, 99), 100);
    expect(segs[0]!.pct).toBe(100);
  });

  it('ne divise pas par zéro sur une journée vide', () => {
    const segs = donutSegments(counts(0, 0, 0), 100);
    expect(segs.every((s) => s.pct === 0)).toBe(true);
    expect(segs.every((s) => s.dash === '0 100')).toBe(true);
  });
});

describe('buildTrend', () => {
  it('écarte les jours sans appel plutôt que de les tracer à zéro', () => {
    const pts = buildTrend([
      { date: '2026-05-18', ...counts(90, 10) },
      { date: '2026-05-19', ...counts(0, 0) }, // dimanche : aucun appel
      { date: '2026-05-20', ...counts(80, 20) },
    ]);
    expect(pts.map((p) => p.date)).toEqual(['2026-05-18', '2026-05-20']);
  });

  it('garde les N derniers jours', () => {
    const days = Array.from({ length: 12 }, (_, i) => ({
      date: `2026-05-${String(i + 1).padStart(2, '0')}`,
      ...counts(9, 1),
    }));
    expect(buildTrend(days, 7)).toHaveLength(7);
    expect(buildTrend(days, 7)[0]!.date).toBe('2026-05-06');
  });

  it('donne deux séries complémentaires', () => {
    const [p] = buildTrend([{ date: '2026-05-18', ...counts(82, 18) }]);
    expect(p!.presencePct).toBe(82);
    expect(p!.absencePct).toBe(18);
  });
});

describe('polylinePoints', () => {
  it('place 0 % en bas et 100 % en haut', () => {
    expect(polylinePoints([0, 100], { width: 100, height: 50 })).toBe('0,50 100,0');
  });

  it('double un point isolé pour qu il reste visible', () => {
    expect(polylinePoints([50], { width: 100, height: 100 })).toBe('50,50 50,50');
  });

  it('ne rend rien sans données', () => {
    expect(polylinePoints([], { width: 100, height: 50 })).toBe('');
  });
});

/* ── Alertes ─────────────────────────────────────────────────────────────── */

const row = (o: Partial<AlertInput> & Pick<AlertInput, 'studentId' | 'date' | 'status'>): AlertInput => ({
  studentName: 'Élève ' + o.studentId,
  classId: 'c1',
  className: '2B',
  justified: false,
  pending: false,
  hasAttachment: false,
  ...o,
});

/** Calendrier d'appel : du lundi 18 au vendredi 22, puis lundi 25. */
const week = ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-22', '2026-05-25'];
const opts = { today: '2026-05-24', weekStart: '2026-05-18', callDays: { c1: week } };

describe('buildAlerts', () => {
  it('signale une absence prolongée sur les jours pointés', () => {
    const alerts = buildAlerts(
      [
        row({ studentId: 's1', date: '2026-05-20', status: 'ABSENT' }),
        row({ studentId: 's1', date: '2026-05-21', status: 'ABSENT' }),
        row({ studentId: 's1', date: '2026-05-22', status: 'ABSENT' }),
      ],
      opts,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.kind).toBe('PROLONGED');
    expect(alerts[0]!.count).toBe(3);
  });

  it('ne rompt pas la série sur un week-end non pointé', () => {
    const alerts = buildAlerts(
      [
        row({ studentId: 's1', date: '2026-05-21', status: 'ABSENT' }),
        row({ studentId: 's1', date: '2026-05-22', status: 'ABSENT' }),
        // pas d'appel les 23 et 24
        row({ studentId: 's1', date: '2026-05-25', status: 'ABSENT' }),
      ],
      { ...opts, today: '2026-05-25' },
    );
    expect(alerts[0]!.kind).toBe('PROLONGED');
    expect(alerts[0]!.count).toBe(3);
  });

  it('rompt la série sur un jour appelé où l élève n était pas absent', () => {
    // Onze absences éparpillées sur le mois ne font pas onze jours consécutifs :
    // les jours d'appel intercalés valent présence.
    const alerts = buildAlerts(
      [
        row({ studentId: 's1', date: '2026-05-18', status: 'ABSENT' }),
        row({ studentId: 's1', date: '2026-05-20', status: 'ABSENT' }),
        row({ studentId: 's1', date: '2026-05-22', status: 'ABSENT' }),
      ],
      opts,
    );
    expect(alerts.every((a) => a.kind !== 'PROLONGED')).toBe(true);
  });

  it('ne remonte pas la série au-delà du jour consulté', () => {
    // L'absence du 25 est postérieure à la date consultée : elle ne doit pas
    // rallonger la série affichée le 22.
    const alerts = buildAlerts(
      [
        row({ studentId: 's1', date: '2026-05-20', status: 'ABSENT' }),
        row({ studentId: 's1', date: '2026-05-21', status: 'ABSENT' }),
        row({ studentId: 's1', date: '2026-05-22', status: 'ABSENT' }),
        row({ studentId: 's1', date: '2026-05-25', status: 'ABSENT' }),
      ],
      { ...opts, today: '2026-05-22' },
    );
    expect(alerts[0]!.count).toBe(3);
  });

  it('ne signale rien sans calendrier d appel pour la classe', () => {
    const alerts = buildAlerts(
      [
        row({ studentId: 's1', classId: 'inconnue', date: '2026-05-20', status: 'ABSENT' }),
        row({ studentId: 's1', classId: 'inconnue', date: '2026-05-21', status: 'ABSENT' }),
        row({ studentId: 's1', classId: 'inconnue', date: '2026-05-22', status: 'ABSENT' }),
      ],
      opts,
    );
    expect(alerts.every((a) => a.kind !== 'PROLONGED')).toBe(true);
  });

  it('rompt la série sur un jour de présence', () => {
    const alerts = buildAlerts(
      [
        row({ studentId: 's1', date: '2026-05-20', status: 'ABSENT' }),
        row({ studentId: 's1', date: '2026-05-21', status: 'PRESENT' }),
        row({ studentId: 's1', date: '2026-05-22', status: 'ABSENT' }),
      ],
      opts,
    );
    expect(alerts.every((a) => a.kind !== 'PROLONGED')).toBe(true);
  });

  it('compte la série sur les jours d appel, pas sur les jours calendaires', () => {
    const alerts = buildAlerts(
      [
        row({ studentId: 's1', date: '2026-05-20', status: 'ABSENT' }),
        row({ studentId: 's1', date: '2026-05-21', status: 'ABSENT' }),
        row({ studentId: 's1', date: '2026-05-22', status: 'ABSENT' }),
      ],
      { ...opts, today: '2026-05-22' },
    );
    expect(alerts[0]!.count).toBe(3);
  });

  it("signale l'absence du jour tant qu'aucune justification n'est déposée", () => {
    const alerts = buildAlerts(
      [row({ studentId: 's1', date: '2026-05-24', status: 'ABSENT' })],
      opts,
    );
    expect(alerts[0]!.kind).toBe('UNJUSTIFIED');
  });

  it('se tait dès que la justification est déposée, même non traitée', () => {
    const alerts = buildAlerts(
      [row({ studentId: 's1', date: '2026-05-24', status: 'ABSENT', pending: true, hasAttachment: true })],
      opts,
    );
    expect(alerts.every((a) => a.kind !== 'UNJUSTIFIED')).toBe(true);
  });

  it('signale trois retards dans la semaine', () => {
    const alerts = buildAlerts(
      [
        row({ studentId: 's1', date: '2026-05-19', status: 'LATE' }),
        row({ studentId: 's1', date: '2026-05-21', status: 'LATE' }),
        row({ studentId: 's1', date: '2026-05-22', status: 'LATE' }),
      ],
      opts,
    );
    expect(alerts[0]!.kind).toBe('FREQUENT_LATE');
    expect(alerts[0]!.count).toBe(3);
  });

  it('ne compte pas les retards des semaines précédentes', () => {
    const alerts = buildAlerts(
      [
        row({ studentId: 's1', date: '2026-05-11', status: 'LATE' }),
        row({ studentId: 's1', date: '2026-05-12', status: 'LATE' }),
        row({ studentId: 's1', date: '2026-05-19', status: 'LATE' }),
      ],
      opts,
    );
    expect(alerts).toHaveLength(0);
  });

  it('réclame la pièce jointe manquante', () => {
    const alerts = buildAlerts(
      [row({ studentId: 's1', date: '2026-05-22', status: 'ABSENT', pending: true })],
      opts,
    );
    expect(alerts[0]!.kind).toBe('MISSING_DOC');
    expect(alerts[0]!.date).toBe('2026-05-22');
  });

  it("ne retient qu'une alerte par élève, la plus grave", () => {
    // Absent les trois derniers jours d'appel : les règles « prolongée » et
    // « non justifiée » se déclenchent toutes deux, une seule doit sortir.
    const alerts = buildAlerts(
      [
        row({ studentId: 's1', date: '2026-05-20', status: 'ABSENT' }),
        row({ studentId: 's1', date: '2026-05-21', status: 'ABSENT' }),
        row({ studentId: 's1', date: '2026-05-22', status: 'ABSENT' }),
      ],
      { ...opts, today: '2026-05-22' },
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.kind).toBe('PROLONGED');
  });

  it('classe les alertes par gravité', () => {
    const alerts = buildAlerts(
      [
        row({ studentId: 's1', date: '2026-05-24', status: 'ABSENT' }),
        row({ studentId: 's2', date: '2026-05-20', status: 'ABSENT' }),
        row({ studentId: 's2', date: '2026-05-21', status: 'ABSENT' }),
        row({ studentId: 's2', date: '2026-05-22', status: 'ABSENT' }),
      ],
      opts,
    );
    expect(alerts.map((a) => a.kind)).toEqual(['PROLONGED', 'UNJUSTIFIED']);
  });

  it('plafonne la liste', () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      row({ studentId: `s${i}`, date: '2026-05-24', status: 'ABSENT' }),
    );
    expect(buildAlerts(rows, { ...opts, limit: 4 })).toHaveLength(4);
  });

  it('ne signale rien sur une journée sans incident', () => {
    const alerts = buildAlerts(
      [row({ studentId: 's1', date: '2026-05-24', status: 'PRESENT' })],
      opts,
    );
    expect(alerts).toEqual([]);
  });
});
