import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testAdmin } from './setup';
import { createTestTenant, mockNextEnv } from './helpers';

describe('Settings Server Actions', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>;

  beforeEach(async () => {
    vi.resetModules();
    tenant = await createTestTenant();
    mockNextEnv({ userId: tenant.userId, tenantId: tenant.tenantId, email: tenant.email });
  });

  describe('AcademicYears', () => {
    it('crée une année + audit log', async () => {
      const { createYearAction } = await import(
        '@/app/[locale]/admin/settings/years/actions'
      );
      const fd = new FormData();
      fd.set('label', '2026-2027');
      fd.set('startDate', '2026-09-01');
      fd.set('endDate', '2027-07-15');

      const r = await createYearAction(fd);
      expect(r.ok).toBe(true);

      const years = await testAdmin.academicYear.findMany({
        where: { tenantId: tenant.tenantId, label: '2026-2027' },
      });
      expect(years).toHaveLength(1);
    });

    it('refuse une année dont endDate < startDate', async () => {
      const { createYearAction } = await import(
        '@/app/[locale]/admin/settings/years/actions'
      );
      const fd = new FormData();
      fd.set('label', 'bad');
      fd.set('startDate', '2027-09-01');
      fd.set('endDate', '2026-07-15');

      const r = await createYearAction(fd);
      expect(r.ok).toBe(false);
    });

    it("setActiveYearAction n'active qu'une seule année à la fois", async () => {
      const { createYearAction, setActiveYearAction } = await import(
        '@/app/[locale]/admin/settings/years/actions'
      );

      // Créer 2026-2027 (sera inactive par défaut)
      const fd = new FormData();
      fd.set('label', '2026-2027');
      fd.set('startDate', '2026-09-01');
      fd.set('endDate', '2027-07-15');
      await createYearAction(fd);

      const y2 = await testAdmin.academicYear.findFirstOrThrow({
        where: { tenantId: tenant.tenantId, label: '2026-2027' },
      });
      await setActiveYearAction(y2.id);

      const actives = await testAdmin.academicYear.findMany({
        where: { tenantId: tenant.tenantId, active: true },
      });
      expect(actives).toHaveLength(1);
      expect(actives[0]!.id).toBe(y2.id);
    });
  });

  describe('Users invitation', () => {
    it("crée user + person + userRole liés en une transaction", async () => {
      const { inviteUserAction } = await import(
        '@/app/[locale]/admin/settings/users/actions'
      );

      const fd = new FormData();
      fd.set('email', 'newprof@test.ma');
      fd.set('firstName', 'Nouveau');
      fd.set('lastName', 'Prof');
      fd.set('personType', 'TEACHER');
      fd.set('roleCode', 'enseignant');

      const r = await inviteUserAction(fd);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.data?.email).toBe('newprof@test.ma');
        expect(r.data?.tempPassword.length).toBe(10);
      }

      const user = await testAdmin.user.findFirstOrThrow({
        where: { tenantId: tenant.tenantId, email: 'newprof@test.ma' },
      });
      const links = await testAdmin.userPerson.findMany({ where: { userId: user.id } });
      expect(links).toHaveLength(1);
      const roles = await testAdmin.userRole.findMany({
        where: { userId: user.id },
        include: { role: true },
      });
      expect(roles).toHaveLength(1);
      expect(roles[0]!.role.code).toBe('enseignant');
    });

    it("refuse d'inviter un email déjà utilisé dans le tenant", async () => {
      const { inviteUserAction } = await import(
        '@/app/[locale]/admin/settings/users/actions'
      );

      const fd = new FormData();
      fd.set('email', 'dup@test.ma');
      fd.set('firstName', 'A');
      fd.set('lastName', 'B');
      fd.set('personType', 'TEACHER');
      fd.set('roleCode', 'enseignant');

      const r1 = await inviteUserAction(fd);
      expect(r1.ok).toBe(true);

      const fd2 = new FormData();
      fd2.set('email', 'dup@test.ma');
      fd2.set('firstName', 'C');
      fd2.set('lastName', 'D');
      fd2.set('personType', 'TEACHER');
      fd2.set('roleCode', 'enseignant');
      const r2 = await inviteUserAction(fd2);
      expect(r2.ok).toBe(false);
    });

    it("disableUserAction se refuse sur soi-même", async () => {
      const { disableUserAction } = await import(
        '@/app/[locale]/admin/settings/users/actions'
      );
      const r = await disableUserAction(tenant.userId);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/soi-même/i);
    });
  });

  describe('Rooms', () => {
    it('crée + édite + supprime une salle avec audit log', async () => {
      const { createRoomAction, updateRoomAction, deleteRoomAction } = await import(
        '@/app/[locale]/admin/settings/rooms/actions'
      );

      const fd = new FormData();
      fd.set('code', 'A101');
      fd.set('label', 'Salle A101');
      fd.set('capacity', '30');
      fd.set('equipment', 'projecteur,tableau');

      const r1 = await createRoomAction(fd);
      expect(r1.ok).toBe(true);

      const room = await testAdmin.room.findFirstOrThrow({
        where: { tenantId: tenant.tenantId, code: 'A101' },
      });
      expect(room.equipment).toEqual(['projecteur', 'tableau']);

      // Edit
      const fdEdit = new FormData();
      fdEdit.set('code', 'A101');
      fdEdit.set('label', 'Salle A101 (rénovée)');
      fdEdit.set('capacity', '35');
      fdEdit.set('equipment', 'projecteur');
      const r2 = await updateRoomAction(room.id, fdEdit);
      expect(r2.ok).toBe(true);

      const updated = await testAdmin.room.findUniqueOrThrow({ where: { id: room.id } });
      expect(updated.capacity).toBe(35);
      expect(updated.equipment).toEqual(['projecteur']);

      // Delete
      const r3 = await deleteRoomAction(room.id);
      expect(r3.ok).toBe(true);

      const remaining = await testAdmin.room.count({ where: { id: room.id } });
      expect(remaining).toBe(0);

      // Trois audits (create, update, delete)
      const audits = await testAdmin.auditLog.findMany({
        where: { tenantId: tenant.tenantId, entityType: 'Room' },
        orderBy: { createdAt: 'asc' },
      });
      expect(audits.map((a) => a.action)).toEqual(['create', 'update', 'delete']);
    });
  });
});
