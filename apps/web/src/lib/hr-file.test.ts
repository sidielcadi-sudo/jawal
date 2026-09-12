import { describe, it, expect } from 'vitest';
import { hrFileStatus, hrFileLabel, dayStatus, contractLabel, type HrPerson } from './hr-file';

const full = (o: Partial<HrPerson> = {}): HrPerson => ({
  cin: 'AB1234',
  hireDate: new Date('2024-09-01'),
  contractType: 'CDI',
  rib: '0123456789',
  bankName: 'Attijariwafa',
  ...o,
});

describe('hrFileStatus', () => {
  it('déclare complet un dossier renseigné', () => {
    expect(hrFileStatus(full())).toEqual({ complete: true, missing: [] });
  });

  it('nomme le champ manquant', () => {
    expect(hrFileStatus(full({ rib: null }))).toEqual({ complete: false, missing: ['RIB'] });
  });

  it('traite un champ rempli d’espaces comme absent', () => {
    // Un blanc passe la saisie mais ne sert à personne au moment de la paie.
    expect(hrFileStatus(full({ rib: '   ' })).missing).toEqual(['RIB']);
  });

  it('liste les manques dans l’ordre du dossier', () => {
    expect(hrFileStatus(full({ cin: null, rib: null, bankName: null })).missing).toEqual([
      'CIN',
      'RIB',
      'Banque',
    ]);
  });
});

describe('hrFileLabel', () => {
  it('nomme un manque isolé', () => {
    expect(hrFileLabel(hrFileStatus(full({ rib: null })))).toBe('RIB manquant');
  });

  it('compte au-delà d’un manque', () => {
    expect(hrFileLabel(hrFileStatus(full({ rib: null, cin: null })))).toBe('2 champs manquants');
  });

  it('dit « Complet » quand tout est là', () => {
    expect(hrFileLabel(hrFileStatus(full()))).toBe('Complet');
  });
});

describe('dayStatus', () => {
  it('distingue « pas pointé » de « absent »', () => {
    expect(dayStatus(null)).toBe('NOT_RECORDED');
    expect(dayStatus({ status: 'ABSENT' })).toBe('ABSENT');
  });

  it('reconnaît les statuts du pointage', () => {
    for (const st of ['PRESENT', 'LATE', 'LEAVE', 'EXCUSED']) {
      expect(dayStatus({ status: st })).toBe(st);
    }
  });

  it('ne laisse pas passer un statut inconnu', () => {
    expect(dayStatus({ status: 'BIZARRE' })).toBe('NOT_RECORDED');
  });
});

describe('contractLabel', () => {
  const now = new Date('2026-09-12T00:00:00Z');

  it('affiche le type seul quand aucune fin n’est prévue', () => {
    expect(contractLabel({ contractType: 'CDI', contractEndDate: null }, now)).toEqual({
      label: 'CDI',
      endsInDays: null,
      urgent: false,
    });
  });

  it('annonce l’échéance proche', () => {
    const r = contractLabel(
      { contractType: 'CDD', contractEndDate: new Date('2026-09-27T00:00:00Z') },
      now,
    );
    expect(r.label).toBe('CDD (fin dans 15 j)');
    expect(r.urgent).toBe(true);
  });

  it('reste discret sur une échéance lointaine', () => {
    const r = contractLabel(
      { contractType: 'CDD', contractEndDate: new Date('2027-06-30T00:00:00Z') },
      now,
    );
    expect(r.label).toBe('CDD');
    expect(r.urgent).toBe(false);
  });

  it('signale sans urgence une échéance à un mois', () => {
    const r = contractLabel(
      { contractType: 'CDD', contractEndDate: new Date('2026-10-10T00:00:00Z') },
      now,
    );
    expect(r.label).toBe('CDD (fin dans 28 j)');
    expect(r.urgent).toBe(false);
  });

  it('marque un contrat expiré', () => {
    const r = contractLabel(
      { contractType: 'CDD', contractEndDate: new Date('2026-08-31T00:00:00Z') },
      now,
    );
    expect(r.label).toBe('CDD (expiré)');
    expect(r.urgent).toBe(true);
  });

  it('gère un type de contrat absent', () => {
    expect(contractLabel({ contractType: null, contractEndDate: null }, now).label).toBe('—');
  });
});
