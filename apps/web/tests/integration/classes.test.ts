import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testAdmin } from './setup';
import { createTestTenant, mockNextEnv } from './helpers';

describe('Classes Server Actions', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>;

  beforeEach(async () => {
    vi.resetModules();
    tenant = await createTestTenant();
    mockNextEnv({ userId: tenant.userId, tenantId: tenant.tenantId, email: tenant.email });
  });

  async function createClass(name = '1AC-A', capacity = 30) {
    const { createClassAction } = await import('@/app/[locale]/admin/classes/actions');
    const fd = new FormData();
    fd.set('name', name);
    fd.set('academicYearId', tenant.yearId);
    fd.set('levelId', tenant.levelId);
    fd.set('capacity', String(capacity));
    const r = await createClassAction(fd);
    if (!r.ok) throw new Error(r.error);
    return r.data!.id;
  }

  async function createStudent(suffix = 'a') {
    return testAdmin.person.create({
      data: {
        tenantId: tenant.tenantId,
        type: 'STUDENT',
        firstName: `S${suffix}`,
        lastName: `L${suffix}`,
      },
    });
  }

  describe('createClassAction', () => {
    it('crée une classe + audit log', async () => {
      const id = await createClass('1AC-A');
      const cls = await testAdmin.class.findUnique({ where: { id } });
      expect(cls?.name).toBe('1AC-A');

      const audits = await testAdmin.auditLog.findMany({
        where: { entityType: 'Class', action: 'create' },
      });
      expect(audits).toHaveLength(1);
    });

    it('rejette une classe avec un nom dupliqué pour la même année', async () => {
      await createClass('1AC-A');
      const { createClassAction } = await import('@/app/[locale]/admin/classes/actions');
      const fd = new FormData();
      fd.set('name', '1AC-A');
      fd.set('academicYearId', tenant.yearId);
      fd.set('levelId', tenant.levelId);
      fd.set('capacity', '30');

      const r = await createClassAction(fd);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/existe déjà/i);
    });
  });

  describe('enrollStudentAction', () => {
    it('inscrit un élève dans une classe', async () => {
      const classId = await createClass('1AC-A', 30);
      const student = await createStudent('1');

      const { enrollStudentAction } = await import('@/app/[locale]/admin/classes/actions');
      const fd = new FormData();
      fd.set('studentId', student.id);
      const r = await enrollStudentAction(classId, fd);
      expect(r.ok).toBe(true);

      const enrollments = await testAdmin.studentClass.findMany({ where: { classId } });
      expect(enrollments).toHaveLength(1);
      expect(enrollments[0]!.studentId).toBe(student.id);
      expect(enrollments[0]!.unenrolledAt).toBeNull();
    });

    it('refuse une inscription qui dépasse la capacité', async () => {
      const classId = await createClass('mini', 2);
      const s1 = await createStudent('1');
      const s2 = await createStudent('2');
      const s3 = await createStudent('3');

      const { enrollStudentAction } = await import('@/app/[locale]/admin/classes/actions');

      for (const s of [s1, s2]) {
        const fd = new FormData();
        fd.set('studentId', s.id);
        const r = await enrollStudentAction(classId, fd);
        expect(r.ok).toBe(true);
      }

      const fd3 = new FormData();
      fd3.set('studentId', s3.id);
      const r3 = await enrollStudentAction(classId, fd3);
      expect(r3.ok).toBe(false);
      if (!r3.ok) expect(r3.error).toMatch(/capacité/i);
    });

    it('refuse une double inscription du même élève', async () => {
      const classId = await createClass('1AC-A', 30);
      const student = await createStudent('1');

      const { enrollStudentAction } = await import('@/app/[locale]/admin/classes/actions');
      const fd = new FormData();
      fd.set('studentId', student.id);
      const first = await enrollStudentAction(classId, fd);
      expect(first.ok).toBe(true);

      const fd2 = new FormData();
      fd2.set('studentId', student.id);
      const second = await enrollStudentAction(classId, fd2);
      expect(second.ok).toBe(false);
    });

    it('réactive une inscription précédemment annulée (idempotence)', async () => {
      const classId = await createClass('1AC-A', 30);
      const student = await createStudent('1');

      const { enrollStudentAction, unenrollStudentAction } = await import(
        '@/app/[locale]/admin/classes/actions'
      );

      // Inscrire → désinscrire → ré-inscrire
      const fd = new FormData();
      fd.set('studentId', student.id);
      await enrollStudentAction(classId, fd);
      await unenrollStudentAction(classId, student.id);
      const sc = await testAdmin.studentClass.findFirstOrThrow({
        where: { classId, studentId: student.id },
      });
      expect(sc.unenrolledAt).not.toBeNull();

      // Re-enroll : doit RÉACTIVER la même row, pas en créer une nouvelle
      const fd2 = new FormData();
      fd2.set('studentId', student.id);
      const r = await enrollStudentAction(classId, fd2);
      expect(r.ok).toBe(true);

      const allEnrollments = await testAdmin.studentClass.findMany({
        where: { classId, studentId: student.id },
      });
      expect(allEnrollments).toHaveLength(1);
      expect(allEnrollments[0]!.unenrolledAt).toBeNull();
    });
  });

  describe('unenrollStudentAction', () => {
    it('marque unenrolledAt sans supprimer la ligne', async () => {
      const classId = await createClass('1AC-A', 30);
      const student = await createStudent('1');

      const { enrollStudentAction, unenrollStudentAction } = await import(
        '@/app/[locale]/admin/classes/actions'
      );
      const fd = new FormData();
      fd.set('studentId', student.id);
      await enrollStudentAction(classId, fd);

      const r = await unenrollStudentAction(classId, student.id);
      expect(r.ok).toBe(true);

      const sc = await testAdmin.studentClass.findFirstOrThrow({
        where: { classId, studentId: student.id },
      });
      expect(sc.unenrolledAt).not.toBeNull();

      const audits = await testAdmin.auditLog.findMany({
        where: { entityType: 'StudentClass', action: 'unenroll' },
      });
      expect(audits).toHaveLength(1);
    });
  });
});
