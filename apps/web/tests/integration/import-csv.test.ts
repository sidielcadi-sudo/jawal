import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testAdmin } from './setup';
import { createTestTenant, mockNextEnv } from './helpers';

describe('CSV Import Server Action', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>;

  beforeEach(async () => {
    vi.resetModules();
    tenant = await createTestTenant();
    mockNextEnv({ userId: tenant.userId, tenantId: tenant.tenantId, email: tenant.email });
  });

  describe('previewCsvAction', () => {
    it('valide un CSV correct et retourne les lignes parsées', async () => {
      const { previewCsvAction } = await import(
        '@/app/[locale]/admin/persons/import/actions'
      );
      const csv = `type,firstName,lastName,birthDate,email
STUDENT,Karim,Berrada,2012-03-14,
STUDENT,Lina,Tahiri,2012-09-02,parent@test.ma`;

      const r = await previewCsvAction(csv);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.total).toBe(2);
        expect(r.rows.every((row) => !row.error)).toBe(true);
        expect(r.rows[0]!.parsed?.firstName).toBe('Karim');
      }
    });

    it('rejette un CSV sans colonnes obligatoires', async () => {
      const { previewCsvAction } = await import(
        '@/app/[locale]/admin/persons/import/actions'
      );
      const csv = `type,email
STUDENT,a@b.c`;
      const r = await previewCsvAction(csv);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/firstName.*lastName/i);
    });

    it('signale les lignes invalides ligne par ligne', async () => {
      const { previewCsvAction } = await import(
        '@/app/[locale]/admin/persons/import/actions'
      );
      const csv = `type,firstName,lastName,email
STUDENT,Valid,Person,
STUDENT,,NoFirstName,
STUDENT,Bad,Email,pas-un-email`;

      const r = await previewCsvAction(csv);
      expect(r.ok).toBe(true);
      if (r.ok) {
        const valid = r.rows.filter((row) => !row.error);
        const invalid = r.rows.filter((row) => row.error);
        expect(valid).toHaveLength(1);
        expect(invalid).toHaveLength(2);
      }
    });

    it('accepte les headers FR (Prénom/Nom)', async () => {
      const { previewCsvAction } = await import(
        '@/app/[locale]/admin/persons/import/actions'
      );
      const csv = `Prénom,Nom,Email
Karim,Berrada,k@test.ma`;
      const r = await previewCsvAction(csv);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.rows[0]!.parsed?.firstName).toBe('Karim');
        expect(r.rows[0]!.parsed?.email).toBe('k@test.ma');
      }
    });
  });

  describe('commitCsvAction', () => {
    it('insère les lignes valides dans une transaction + 1 audit log', async () => {
      const { commitCsvAction } = await import(
        '@/app/[locale]/admin/persons/import/actions'
      );
      const csv = `type,firstName,lastName,birthDate
STUDENT,A,B,2012-01-01
STUDENT,C,D,2012-02-02
STUDENT,E,F,2012-03-03`;

      const r = await commitCsvAction(csv);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.created).toBe(3);
        expect(r.total).toBe(3);
      }

      const persons = await testAdmin.person.findMany({ where: { tenantId: tenant.tenantId } });
      expect(persons).toHaveLength(3);

      const audits = await testAdmin.auditLog.findMany({
        where: { tenantId: tenant.tenantId, action: 'import_csv' },
      });
      expect(audits).toHaveLength(1);
      expect((audits[0]!.after as { count?: number })?.count).toBe(3);
    });

    it('saute les lignes invalides mais commit les valides', async () => {
      const { commitCsvAction } = await import(
        '@/app/[locale]/admin/persons/import/actions'
      );
      const csv = `type,firstName,lastName,email
STUDENT,Valid1,Ok,
STUDENT,,NoName,
STUDENT,Valid2,Ok,
STUDENT,Bad,Email,not-an-email`;

      const r = await commitCsvAction(csv);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.created).toBe(2);
        expect(r.total).toBe(4);
        const errors = r.results.filter((row) => row.status === 'error');
        expect(errors).toHaveLength(2);
      }

      const persons = await testAdmin.person.findMany({ where: { tenantId: tenant.tenantId } });
      expect(persons).toHaveLength(2);
      expect(persons.map((p) => p.firstName).sort()).toEqual(['Valid1', 'Valid2']);
    });

    it('respecte le tenant courant — pas de fuite cross-tenant', async () => {
      const other = await createTestTenant({ slug: 'other-tenant' });
      await testAdmin.person.create({
        data: { tenantId: other.tenantId, type: 'STUDENT', firstName: 'OtherTenant', lastName: 'X' },
      });

      const { commitCsvAction } = await import(
        '@/app/[locale]/admin/persons/import/actions'
      );
      const csv = `type,firstName,lastName
STUDENT,Local,Person`;
      await commitCsvAction(csv);

      const here = await testAdmin.person.findMany({ where: { tenantId: tenant.tenantId } });
      expect(here).toHaveLength(1);
      expect(here[0]!.firstName).toBe('Local');

      // L'autre tenant a toujours sa donnée intacte
      const there = await testAdmin.person.findMany({ where: { tenantId: other.tenantId } });
      expect(there).toHaveLength(1);
      expect(there[0]!.firstName).toBe('OtherTenant');
    });
  });
});
