import { describe, it, expect } from 'vitest';
import { feeTab, feeTone } from './parent-fees';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const today = d('2026-10-15');

describe('couleur d’une échéance', () => {
  it('vert quand elle est payée, quelle que soit sa date', () => {
    expect(feeTone(0, d('2026-09-05'), today)).toBe('paid');
  });

  it('rouge quand elle est échue et non payée', () => {
    expect(feeTone(500, d('2026-10-14'), today)).toBe('overdue');
  });

  it('orange quand elle tombe dans les 30 jours (aujourd’hui compris)', () => {
    expect(feeTone(500, d('2026-10-15'), today)).toBe('soon');
    expect(feeTone(500, d('2026-11-14'), today)).toBe('soon');
  });

  it('neutre au-delà', () => {
    expect(feeTone(500, d('2026-12-05'), today)).toBe('upcoming');
  });
});

describe('onglet d’une échéance', () => {
  const years = [
    { id: 'y1', startDate: d('2025-09-01'), endDate: d('2026-07-15') },
    { id: 'y2', startDate: d('2026-09-01'), endDate: d('2027-07-15') },
  ];
  const active = years[1]!;

  it('range les échéances de l’année active dans son onglet', () => {
    expect(feeTab({ dueDate: d('2026-10-05'), declaredYearId: null }, years, active)).toBe('current');
  });

  it('range les échéances d’une année passée dans « Créances antérieures »', () => {
    expect(feeTab({ dueDate: d('2026-03-05'), declaredYearId: null }, years, active)).toBe('previous');
  });

  it('suit l’année déclarée d’un frais exceptionnel plutôt que sa date', () => {
    // Sortie de l'année 2026-2027 facturée fin août, avant la rentrée.
    expect(feeTab({ dueDate: d('2026-08-28'), declaredYearId: 'y2' }, years, active)).toBe('current');
  });
});
