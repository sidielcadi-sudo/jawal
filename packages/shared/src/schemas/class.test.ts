import { describe, it, expect } from 'vitest';
import { classCreateSchema } from './class';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('classCreateSchema', () => {
  it('accepte une classe valide', () => {
    const r = classCreateSchema.safeParse({
      name: '1AC-A',
      academicYearId: UUID,
      levelId: UUID,
      capacity: 30,
    });
    expect(r.success).toBe(true);
  });

  it('refuse un nom vide', () => {
    const r = classCreateSchema.safeParse({
      name: '',
      academicYearId: UUID,
      levelId: UUID,
    });
    expect(r.success).toBe(false);
  });

  it('refuse un UUID invalide', () => {
    const r = classCreateSchema.safeParse({
      name: 'A',
      academicYearId: 'pas-un-uuid',
      levelId: UUID,
    });
    expect(r.success).toBe(false);
  });

  it('capacity par défaut = 30 quand omise', () => {
    const r = classCreateSchema.safeParse({
      name: 'A',
      academicYearId: UUID,
      levelId: UUID,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.capacity).toBe(30);
  });

  it('coerce capacity string en nombre', () => {
    const r = classCreateSchema.safeParse({
      name: 'A',
      academicYearId: UUID,
      levelId: UUID,
      capacity: '25',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.capacity).toBe(25);
  });

  it('refuse capacity hors plage', () => {
    expect(classCreateSchema.safeParse({
      name: 'A',
      academicYearId: UUID,
      levelId: UUID,
      capacity: 0,
    }).success).toBe(false);
    expect(classCreateSchema.safeParse({
      name: 'A',
      academicYearId: UUID,
      levelId: UUID,
      capacity: 999,
    }).success).toBe(false);
  });

  it('mainTeacherId vide est traité comme absent (preprocess)', () => {
    const r = classCreateSchema.safeParse({
      name: 'A',
      academicYearId: UUID,
      levelId: UUID,
      mainTeacherId: '',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.mainTeacherId).toBeUndefined();
  });

  it('mainTeacherId valide est conservé', () => {
    const r = classCreateSchema.safeParse({
      name: 'A',
      academicYearId: UUID,
      levelId: UUID,
      mainTeacherId: UUID,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.mainTeacherId).toBe(UUID);
  });
});
