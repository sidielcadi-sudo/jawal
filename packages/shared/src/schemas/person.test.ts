import { describe, it, expect } from 'vitest';
import { personCreateSchema } from './person';

describe('personCreateSchema', () => {
  it('accepte un élève minimal', () => {
    const r = personCreateSchema.safeParse({
      type: 'STUDENT',
      firstName: 'Karim',
      lastName: 'Berrada',
    });
    expect(r.success).toBe(true);
  });

  it('refuse sans type', () => {
    const r = personCreateSchema.safeParse({ firstName: 'a', lastName: 'b' });
    expect(r.success).toBe(false);
  });

  it('refuse un type invalide', () => {
    const r = personCreateSchema.safeParse({
      type: 'ALIEN',
      firstName: 'a',
      lastName: 'b',
    });
    expect(r.success).toBe(false);
  });

  it('refuse un firstName vide', () => {
    const r = personCreateSchema.safeParse({
      type: 'STUDENT',
      firstName: '',
      lastName: 'Berrada',
    });
    expect(r.success).toBe(false);
  });

  it('coerce la date de naissance string en Date', () => {
    const r = personCreateSchema.safeParse({
      type: 'STUDENT',
      firstName: 'a',
      lastName: 'b',
      birthDate: '2012-05-12',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.birthDate).toBeInstanceOf(Date);
      expect(r.data.birthDate?.getFullYear()).toBe(2012);
    }
  });

  it('refuse un email invalide dans contacts', () => {
    const r = personCreateSchema.safeParse({
      type: 'STUDENT',
      firstName: 'a',
      lastName: 'b',
      contacts: { email: 'pas-un-email' },
    });
    expect(r.success).toBe(false);
  });

  it('accepte un email valide', () => {
    const r = personCreateSchema.safeParse({
      type: 'STUDENT',
      firstName: 'a',
      lastName: 'b',
      contacts: { email: 'parent@exemple.ma' },
    });
    expect(r.success).toBe(true);
  });

  it('accepte les 3 genres', () => {
    for (const g of ['M', 'F', 'X'] as const) {
      const r = personCreateSchema.safeParse({
        type: 'STUDENT',
        firstName: 'a',
        lastName: 'b',
        gender: g,
      });
      expect(r.success, `gender=${g}`).toBe(true);
    }
  });

  it('limite la longueur des noms', () => {
    const r = personCreateSchema.safeParse({
      type: 'STUDENT',
      firstName: 'a'.repeat(200),
      lastName: 'b',
    });
    expect(r.success).toBe(false);
  });
});
