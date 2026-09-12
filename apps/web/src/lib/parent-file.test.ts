import { describe, it, expect } from 'vitest';
import {
  isReachable,
  missingContacts,
  familyFinancialStatus,
  financialLabel,
  parentKpis,
  type FamilyInstallment,
  type FamilyRow,
} from './parent-file';

describe('isReachable / missingContacts', () => {
  it('un numéro suffit à joindre la famille', () => {
    expect(isReachable({ phone: '0600000000' })).toBe(true);
    expect(isReachable({ whatsapp: '0600000000' })).toBe(true);
  });

  it('un e-mail seul ne remplace pas un numéro en urgence', () => {
    expect(isReachable({ email: 'a@b.ma' })).toBe(false);
  });

  it('ignore un champ rempli d’espaces', () => {
    expect(isReachable({ phone: '   ' })).toBe(false);
  });

  it('rend joignable false sans contacts du tout', () => {
    expect(isReachable(null)).toBe(false);
    expect(missingContacts(null)).toEqual(['Téléphone', 'E-mail']);
  });

  it('ne réclame que ce qui manque', () => {
    expect(missingContacts({ phone: '06', email: 'a@b.ma' })).toEqual([]);
    expect(missingContacts({ phone: '06' })).toEqual(['E-mail']);
  });
});

describe('familyFinancialStatus', () => {
  const now = new Date('2026-09-12T00:00:00Z');
  const inst = (o: Partial<FamilyInstallment> = {}): FamilyInstallment => ({
    amount: 1000,
    paid: 1000,
    dueDate: new Date('2026-09-05T00:00:00Z'),
    ...o,
  });

  it('déclare à jour une famille qui a tout réglé', () => {
    expect(familyFinancialStatus([inst()], now)).toMatchObject({ state: 'UP_TO_DATE' });
  });

  it('compte les échéances échues non soldées', () => {
    const r = familyFinancialStatus([inst({ paid: 0 }), inst({ paid: 400 })], now);
    expect(r).toMatchObject({ state: 'LATE', overdueCount: 2, overdueAmount: 1600 });
  });

  it('ne compte pas une échéance à venir', () => {
    // Une échéance de décembre non payée en septembre n'est pas un retard.
    const r = familyFinancialStatus(
      [inst({ paid: 0, dueDate: new Date('2026-12-05T00:00:00Z') })],
      now,
    );
    expect(r).toMatchObject({ state: 'UP_TO_DATE', overdueCount: 0 });
  });

  it('absorbe les arrondis de paiement fractionné', () => {
    expect(familyFinancialStatus([inst({ amount: 1000, paid: 999.996 })], now).state).toBe(
      'UP_TO_DATE',
    );
  });

  it('distingue « aucun frais » de « à jour »', () => {
    expect(familyFinancialStatus([], now)).toMatchObject({ state: 'NO_FEES' });
  });
});

describe('financialLabel', () => {
  it('accorde le nombre d’échéances', () => {
    expect(financialLabel({ state: 'LATE', overdueCount: 1, overdueAmount: 10 })).toBe(
      'Retard (1 éch.)',
    );
    expect(financialLabel({ state: 'LATE', overdueCount: 3, overdueAmount: 10 })).toBe(
      'Retard (3 éch.)',
    );
  });

  it('nomme les deux autres états', () => {
    expect(financialLabel({ state: 'UP_TO_DATE', overdueCount: 0, overdueAmount: 0 })).toBe(
      'À jour',
    );
    expect(financialLabel({ state: 'NO_FEES', overdueCount: 0, overdueAmount: 0 })).toBe(
      'Aucun frais',
    );
  });
});

describe('parentKpis', () => {
  const row = (o: Partial<FamilyRow> = {}): FamilyRow => ({
    hasPortal: true,
    reachable: true,
    financial: 'UP_TO_DATE',
    ...o,
  });

  it('calcule les trois taux sur le même dénominateur', () => {
    const k = parentKpis([row(), row({ hasPortal: false }), row({ reachable: false })]);
    expect(k.families).toBe(3);
    expect(k.portalRate).toBe(66.7);
    expect(k.contactRate).toBe(66.7);
    expect(k.toComplete).toBe(1);
  });

  it('écarte du taux de règlement les familles sans frais', () => {
    // 1 à jour, 1 en retard, 1 sans frais → 50 %, pas 33 %.
    const k = parentKpis([
      row(),
      row({ financial: 'LATE' }),
      row({ financial: 'NO_FEES' }),
    ]);
    expect(k.settlementRate).toBe(50);
    expect(k.lateFamilies).toBe(1);
  });

  it('ne divise pas par zéro', () => {
    const k = parentKpis([]);
    expect(k.portalRate).toBeNull();
    expect(k.settlementRate).toBeNull();
  });

  it('rend null le taux de règlement si personne n’est facturé', () => {
    expect(parentKpis([row({ financial: 'NO_FEES' })]).settlementRate).toBeNull();
  });
});
