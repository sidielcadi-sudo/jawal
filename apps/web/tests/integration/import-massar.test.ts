import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testAdmin } from './setup';
import { createTestTenant, mockNextEnv } from './helpers';

/**
 * Import MASSAR — tests de non-régression sur les règles qui portent le
 * module : filtre établissement, résolution du niveau, idempotence par code
 * MASSAR, et fusion (et non écrasement) des champs JSON au rejeu.
 */

const HEADERS =
  'StudentID,LastNameFr,FirstNameFr,LastNameAr,FirstNameAr,Gender,BirthDate,Level,ClassNameFr,ClassNameAr,CurrentSchoolCode,FatherNameFr,MotherNameFr,Phone1,Phone2,AddressFr,CityFr,AddressAr,CityAr';

/** Construit une ligne CSV, les champs non fournis prenant un défaut valide. */
function row(o: Partial<Record<string, string>> & { id: string }): string {
  return [
    o.id,
    o.lastName ?? 'El Amrani',
    o.firstName ?? 'Yassine',
    o.lastNameAr ?? 'العمري',
    o.firstNameAr ?? 'ياسين',
    o.gender ?? 'M',
    o.birthDate ?? '2010-05-12',
    o.level ?? '4A',
    o.className ?? 'Quatrième A',
    o.classNameAr ?? 'الرابعة أ',
    o.schoolCode ?? 'CASA001',
    o.father ?? 'Mohamed',
    o.mother ?? 'Latifa',
    o.phone1 ?? '0612345678',
    o.phone2 ?? '0623456789',
    o.address ?? '12 Rue Hassan II',
    o.city ?? 'Casablanca',
    o.addressAr ?? 'شارع الحسن الثاني 12',
    o.cityAr ?? 'الدار البيضاء',
  ].join(',');
}

const csv = (...rows: string[]) => [HEADERS, ...rows].join('\n');

describe('Import MASSAR', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>;

  beforeEach(async () => {
    vi.resetModules();
    tenant = await createTestTenant();
    // Code établissement + niveaux 1→6 (le CSV désigne le niveau par le
    // nombre en tête de `Level`, rapproché de `Level.order`).
    await testAdmin.tenant.update({
      where: { id: tenant.tenantId },
      data: { massarCode: 'CASA001' },
    });
    for (const order of [2, 3, 4, 5, 6]) {
      await testAdmin.level.create({
        data: {
          tenantId: tenant.tenantId,
          cycleId: tenant.cycleId,
          code: `${order}ap`,
          label: `${order}e année`,
          order,
        },
      });
    }
    mockNextEnv({ userId: tenant.userId, tenantId: tenant.tenantId, email: tenant.email });
  });

  const load = () => import('@/lib/massar-import');

  describe('analyse', () => {
    it('refuse un CSV auquel il manque une colonne obligatoire', async () => {
      const { analyzeMassarCsv } = await load();
      const r = await analyzeMassarCsv(tenant.tenantId, 'StudentID,LastNameFr\n1,X', tenant.yearId);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/Colonnes manquantes/);
    });

    it('ignore les lignes d’un autre établissement sans les compter en erreur', async () => {
      const { analyzeMassarCsv } = await load();
      const r = await analyzeMassarCsv(
        tenant.tenantId,
        csv(row({ id: 'A1' }), row({ id: 'A2', schoolCode: 'RBT002' })),
        tenant.yearId,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.preview.counts.create).toBe(1);
      expect(r.preview.counts.skipped).toBe(1);
      expect(r.preview.counts.error).toBe(0);
    });

    it('met en erreur un niveau absent de l’établissement', async () => {
      const { analyzeMassarCsv } = await load();
      const r = await analyzeMassarCsv(tenant.tenantId, csv(row({ id: 'A1', level: '9Z' })), tenant.yearId);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.preview.counts.error).toBe(1);
      expect(r.preview.rows[0]!.error).toMatch(/Niveau 9 inexistant/);
    });

    it('refuse un StudentID vide et signale les doublons internes au fichier', async () => {
      const { analyzeMassarCsv } = await load();
      const r = await analyzeMassarCsv(
        tenant.tenantId,
        csv(row({ id: '' }), row({ id: 'D1' }), row({ id: 'D1' })),
        tenant.yearId,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.preview.counts.error).toBe(2);
      expect(r.preview.rows[0]!.error).toMatch(/StudentID/);
      expect(r.preview.rows[2]!.error).toMatch(/en double/);
    });

    it('annonce les classes à créer', async () => {
      const { analyzeMassarCsv } = await load();
      const r = await analyzeMassarCsv(
        tenant.tenantId,
        csv(row({ id: 'A1' }), row({ id: 'A2', level: '3C', className: 'Troisième C' })),
        tenant.yearId,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.preview.classesToCreate).toEqual(['Quatrième A', 'Troisième C']);
    });
  });

  describe('écriture', () => {
    it('crée élève, parents, classe, inscription DRAFT et affectation', async () => {
      const { runMassarImport } = await load();
      const r = await runMassarImport(tenant.tenantId, tenant.userId, csv(row({ id: 'M1' })), tenant.yearId);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.stats).toMatchObject({ students: 1, parents: 2, classes: 1, enrollments: 1 });

      const student = await testAdmin.person.findFirst({
        where: { tenantId: tenant.tenantId, massarId: 'M1' },
        include: {
          enrollments: { include: { class: true } },
          relationsAsChild: { include: { parent: true } },
          studentClasses: true,
        },
      });
      expect(student).toBeTruthy();
      expect(student!.firstNameAr).toBe('ياسين');
      expect(student!.gender).toBe('M');
      expect(student!.enrollments[0]!.status).toBe('DRAFT');
      expect(student!.enrollments[0]!.class!.name).toBe('Quatrième A');
      expect(student!.enrollments[0]!.class!.nameAr).toBe('الرابعة أ');
      expect(student!.studentClasses).toHaveLength(1);

      // Phone1 → père, Phone2 → mère, adresse partagée.
      const father = student!.relationsAsChild.find((x) => x.type === 'FATHER')!.parent;
      const mother = student!.relationsAsChild.find((x) => x.type === 'MOTHER')!.parent;
      expect(father.lastName).toBe('El Amrani');
      expect((father.contacts as { phone?: string }).phone).toBe('0612345678');
      expect((mother.contacts as { phone?: string }).phone).toBe('0623456789');
      expect((father.address as { city?: string }).city).toBe('Casablanca');
    });

    it('est rejouable : la seconde passe met à jour sans dupliquer', async () => {
      const { runMassarImport } = await load();
      const text = csv(row({ id: 'M1' }), row({ id: 'M2', firstName: 'Sara', gender: 'F' }));

      const first = await runMassarImport(tenant.tenantId, tenant.userId, text, tenant.yearId);
      expect(first.ok && first.stats.enrollments).toBe(2);

      const second = await runMassarImport(tenant.tenantId, tenant.userId, text, tenant.yearId);
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      // Rien de neuf : ni inscription, ni classe, ni parent.
      expect(second.stats).toMatchObject({ enrollments: 0, classes: 0, parents: 0, students: 2 });

      const where = { tenantId: tenant.tenantId };
      expect(await testAdmin.person.count({ where: { ...where, type: 'STUDENT' } })).toBe(2);
      expect(await testAdmin.person.count({ where: { ...where, type: 'PARENT' } })).toBe(4);
      expect(await testAdmin.enrollment.count({ where })).toBe(2);
      expect(await testAdmin.class.count({ where })).toBe(1);
      expect(await testAdmin.studentClass.count({ where })).toBe(2);
    });

    it('fusionne les champs JSON au lieu de les écraser au rejeu', async () => {
      const { runMassarImport } = await load();
      const text = csv(row({ id: 'M1' }));
      await runMassarImport(tenant.tenantId, tenant.userId, text, tenant.yearId);

      // Saisies manuelles postérieures à l'import, absentes du CSV.
      const before = await testAdmin.person.findFirstOrThrow({
        where: { tenantId: tenant.tenantId, massarId: 'M1' },
      });
      await testAdmin.person.update({
        where: { id: before.id },
        data: {
          contacts: { ...(before.contacts as object), email: 'saisi@main.ma' },
          metadata: { ...(before.metadata as object), cne: 'CNE-123' },
        },
      });

      await runMassarImport(tenant.tenantId, tenant.userId, text, tenant.yearId);

      const after = await testAdmin.person.findFirstOrThrow({
        where: { tenantId: tenant.tenantId, massarId: 'M1' },
      });
      // Ce que le CSV ne porte pas doit survivre au rejeu.
      expect((after.contacts as { email?: string }).email).toBe('saisi@main.ma');
      expect((after.metadata as { cne?: string }).cne).toBe('CNE-123');
      // Ce qu'il porte reste à jour.
      expect((after.contacts as { phone?: string }).phone).toBe('0612345678');
    });

    it('n’écrit rien pour un autre établissement', async () => {
      const other = await createTestTenant({ slug: 'autre-etab' });
      const { runMassarImport } = await load();
      await runMassarImport(tenant.tenantId, tenant.userId, csv(row({ id: 'M1' })), tenant.yearId);

      expect(await testAdmin.person.count({ where: { tenantId: other.tenantId } })).toBe(0);
      expect(await testAdmin.class.count({ where: { tenantId: other.tenantId } })).toBe(0);
    });

    it('échoue proprement quand aucune ligne n’est exploitable', async () => {
      const { runMassarImport } = await load();
      const r = await runMassarImport(
        tenant.tenantId,
        tenant.userId,
        csv(row({ id: 'X1', schoolCode: 'RBT002' })),
        tenant.yearId,
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/Aucune ligne exploitable/);
    });
  });
});
