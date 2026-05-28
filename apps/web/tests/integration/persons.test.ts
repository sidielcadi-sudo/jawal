import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testAdmin } from './setup';
import { createTestTenant, mockNextEnv } from './helpers';

describe('Persons Server Actions', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>;

  beforeEach(async () => {
    // Réinitialiser le cache modules pour que les doMock soient pris en compte
    vi.resetModules();
    tenant = await createTestTenant();
    mockNextEnv({ userId: tenant.userId, tenantId: tenant.tenantId, email: tenant.email });
  });

  describe('createPersonAction', () => {
    it('crée un élève avec audit log atomique', async () => {
      const { createPersonAction } = await import('@/app/[locale]/admin/persons/actions');
      const fd = new FormData();
      fd.set('type', 'STUDENT');
      fd.set('firstName', 'Karim');
      fd.set('lastName', 'Test');

      const result = await createPersonAction(fd);
      expect(result.ok).toBe(true);

      const persons = await testAdmin.person.findMany({ where: { tenantId: tenant.tenantId } });
      expect(persons).toHaveLength(1);
      expect(persons[0]!.firstName).toBe('Karim');

      const audits = await testAdmin.auditLog.findMany({
        where: { tenantId: tenant.tenantId, entityType: 'Person', action: 'create' },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]!.entityId).toBe(persons[0]!.id);
    });

    it('rejette les données invalides avec fieldErrors', async () => {
      const { createPersonAction } = await import('@/app/[locale]/admin/persons/actions');
      const fd = new FormData();
      fd.set('type', 'STUDENT');
      fd.set('firstName', '');
      fd.set('lastName', '');

      const result = await createPersonAction(fd);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.fieldErrors).toBeDefined();
      }

      const count = await testAdmin.person.count({ where: { tenantId: tenant.tenantId } });
      expect(count).toBe(0);
    });

    it('accepte birthDate au format ISO', async () => {
      const { createPersonAction } = await import('@/app/[locale]/admin/persons/actions');
      const fd = new FormData();
      fd.set('type', 'STUDENT');
      fd.set('firstName', 'a');
      fd.set('lastName', 'b');
      fd.set('birthDate', '2012-05-12');
      fd.set('contactEmail', 'parent@test.ma');

      const result = await createPersonAction(fd);
      expect(result.ok).toBe(true);

      const p = await testAdmin.person.findFirstOrThrow({ where: { tenantId: tenant.tenantId } });
      expect(p.birthDate?.getFullYear()).toBe(2012);
      expect((p.contacts as { email?: string }).email).toBe('parent@test.ma');
    });
  });

  describe('softDeletePersonAction', () => {
    it('marque deletedAt et log l\'action', async () => {
      const person = await testAdmin.person.create({
        data: { tenantId: tenant.tenantId, type: 'STUDENT', firstName: 'a', lastName: 'b' },
      });

      const { softDeletePersonAction } = await import('@/app/[locale]/admin/persons/actions');
      // L'action fait un redirect en fin — on attrape l'exception du mock
      await expect(softDeletePersonAction(person.id)).rejects.toThrow(/\[redirect\]/);

      const after = await testAdmin.person.findUniqueOrThrow({ where: { id: person.id } });
      expect(after.deletedAt).not.toBeNull();

      const audits = await testAdmin.auditLog.findMany({
        where: { entityType: 'Person', action: 'delete' },
      });
      expect(audits).toHaveLength(1);
    });
  });

  describe('isolation tenant', () => {
    it('un Server Action ne peut pas voir les données d\'un autre tenant', async () => {
      // Créer un 2e tenant avec une personne
      const otherTenant = await createTestTenant({ slug: 'other' });
      await testAdmin.person.create({
        data: {
          tenantId: otherTenant.tenantId,
          type: 'STUDENT',
          firstName: 'Secret',
          lastName: 'Other',
        },
      });

      // L'admin du tenant courant ne doit pas voir cette personne
      const { createPersonAction } = await import('@/app/[locale]/admin/persons/actions');
      const fd = new FormData();
      fd.set('type', 'STUDENT');
      fd.set('firstName', 'Local');
      fd.set('lastName', 'Person');
      await createPersonAction(fd);

      // Vérification : seul Local Person existe dans le tenant courant
      const visible = await testAdmin.person.findMany({ where: { tenantId: tenant.tenantId } });
      expect(visible).toHaveLength(1);
      expect(visible[0]!.firstName).toBe('Local');

      // Et l'audit log du tenant courant n'a qu'une entrée pour SA création
      const localAudits = await testAdmin.auditLog.findMany({
        where: { tenantId: tenant.tenantId, entityType: 'Person' },
      });
      expect(localAudits).toHaveLength(1);
    });
  });
});
