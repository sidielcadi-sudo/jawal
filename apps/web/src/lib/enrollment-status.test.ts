import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ENROLLMENT_BADGE } from './enrollment-status';

/**
 * Non-régression du plantage « MISSING_MESSAGE …status.DOSSIER_COMPLET » :
 * la fiche élève restreignait le statut d'inscription à 4 valeurs par un
 * `as`, alors que l'enum en compte 10. Ni les couleurs ni les libellés des
 * 6 autres n'existaient, et afficher un dossier « Dossier complet » cassait
 * le rendu.
 *
 * On lit les valeurs **dans le schéma Prisma**, source de vérité : ajouter un
 * statut sans lui donner de pastille ni de libellé fait échouer ce test.
 */

const ROOT = path.resolve(__dirname, '../../../..');

function enumValues(name: string): string[] {
  const schema = readFileSync(path.join(ROOT, 'packages/db/prisma/schema.prisma'), 'utf8');
  const block = new RegExp(`enum ${name}\\s*\\{([^}]*)\\}`).exec(schema);
  if (!block) throw new Error(`enum ${name} introuvable dans schema.prisma`);
  return block[1]!
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter((l) => l.length > 0 && /^[A-Z_]+$/.test(l));
}

function messages(locale: 'fr' | 'ar'): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(__dirname, `../../messages/${locale}.json`), 'utf8'));
}

function at(obj: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown>)?.[k], obj);
}

describe('statuts d’inscription', () => {
  const statuses = enumValues('EnrollmentStatus');

  it('le schéma expose bien les 10 statuts attendus', () => {
    expect(statuses).toHaveLength(10);
    expect(statuses).toContain('DOSSIER_COMPLET');
  });

  it('chaque statut a une pastille, sans clé en trop', () => {
    expect(Object.keys(ENROLLMENT_BADGE).sort()).toEqual([...statuses].sort());
  });

  it.each(['fr', 'ar'] as const)('chaque statut a un libellé en %s', (locale) => {
    const map = at(messages(locale), 'admin.persons.detail.enrollmentHistory.status') as Record<
      string,
      string
    >;
    expect(map).toBeTruthy();
    for (const s of statuses) {
      expect(map[s], `libellé manquant pour ${s} en ${locale}`).toBeTruthy();
    }
  });

  it.each(['fr', 'ar'] as const)(
    'la liste des inscriptions couvre aussi les 10 statuts en %s',
    (locale) => {
      const map = at(messages(locale), 'admin.enrollments.status') as Record<string, string>;
      for (const s of statuses) {
        expect(map[s], `libellé manquant pour ${s} en ${locale}`).toBeTruthy();
      }
    },
  );
});
