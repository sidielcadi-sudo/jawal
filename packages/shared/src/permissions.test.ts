import { describe, it, expect } from 'vitest';
import { hasPermission } from './permissions';

describe('hasPermission', () => {
  it('match exact', () => {
    expect(hasPermission(['notes.write'], 'notes.write')).toBe(true);
  });

  it('refuse une permission non accordée', () => {
    expect(hasPermission(['notes.read'], 'notes.write')).toBe(false);
  });

  it('wildcard global * autorise tout', () => {
    expect(hasPermission(['*'], 'anything.you.want')).toBe(true);
    expect(hasPermission(['*'], 'notes.write')).toBe(true);
  });

  it('wildcard module module.* autorise toutes les actions de ce module', () => {
    expect(hasPermission(['notes.*'], 'notes.write')).toBe(true);
    expect(hasPermission(['notes.*'], 'notes.read')).toBe(true);
    expect(hasPermission(['notes.*'], 'notes.publish')).toBe(true);
  });

  it('wildcard module ne déborde pas sur les autres modules', () => {
    expect(hasPermission(['notes.*'], 'grades.write')).toBe(false);
  });

  it('liste vide refuse tout', () => {
    expect(hasPermission([], 'anything')).toBe(false);
  });

  it('combine plusieurs permissions', () => {
    const granted = ['students.read', 'students.write', 'classes.*'];
    expect(hasPermission(granted, 'students.read')).toBe(true);
    expect(hasPermission(granted, 'classes.delete')).toBe(true);
    expect(hasPermission(granted, 'notes.write')).toBe(false);
  });

  it('permission insensible à l’absence du namespace (edge case)', () => {
    // Si on demande "open" et qu'on a accordé "open", ça matche
    expect(hasPermission(['open'], 'open')).toBe(true);
    // Mais pas une permission différente
    expect(hasPermission(['open'], 'close')).toBe(false);
  });
});
