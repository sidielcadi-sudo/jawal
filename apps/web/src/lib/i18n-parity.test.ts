import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Garde-fou i18n : les deux catalogues doivent porter exactement les mêmes
 * clés. Une clé présente d'un seul côté ne se voit pas au typecheck et ne
 * casse qu'à l'exécution, dans la langue oubliée — c'est exactement ce qui
 * s'est produit avec `admin.vieScolaire.board.cols.ensMaison` (absente en FR)
 * et avec les statuts d'inscription.
 */

const DIR = path.resolve(__dirname, '../../messages');

function load(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(DIR, `${locale}.json`), 'utf8'));
}

/** Chemins pointés de toutes les feuilles de l'arbre de messages. */
function leafKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    leafKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe('catalogues de messages', () => {
  const fr = new Set(leafKeys(load('fr')));
  const ar = new Set(leafKeys(load('ar')));

  it('aucune clé française absente de l’arabe', () => {
    expect([...fr].filter((k) => !ar.has(k))).toEqual([]);
  });

  it('aucune clé arabe absente du français', () => {
    expect([...ar].filter((k) => !fr.has(k))).toEqual([]);
  });

  /**
   * Une chaîne vide peut être volontaire — en-tête de colonne « actions »
   * qu'on ne veut pas afficher. Ce qui trahit un oubli, c'est qu'elle ne le
   * soit que d'un côté : le libellé existe alors dans une langue et manque
   * dans l'autre.
   */
  it('aucune traduction vide d’un seul côté', () => {
    const frMsgs = load('fr');
    const arMsgs = load('ar');
    const at = (o: unknown, k: string) =>
      k.split('.').reduce<unknown>((a, x) => (a as Record<string, unknown>)?.[x], o);
    const isBlank = (v: unknown) => typeof v === 'string' && v.trim() === '';

    const asymmetric = [...fr].filter((k) => isBlank(at(frMsgs, k)) !== isBlank(at(arMsgs, k)));
    expect(asymmetric).toEqual([]);
  });
});
