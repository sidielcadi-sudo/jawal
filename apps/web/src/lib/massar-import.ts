/**
 * Import d'un export MASSAR (CSV) : élèves + parents + classes + inscriptions.
 *
 * Cœur métier, sans authentification ni `use server` : les server actions
 * n'en sont qu'une enveloppe (auth + permission), ce qui rend cette logique
 * testable directement par script (cf. `smoke-test-import-massar.ts`).
 *
 * Règles retenues :
 *  - `StudentID` (code MASSAR) est la clé de rapprochement → import rejouable :
 *    une deuxième passe met à jour au lieu de dupliquer.
 *  - `CurrentSchoolCode` doit correspondre au code MASSAR du tenant ; les
 *    autres lignes sont ignorées (le fichier peut être multi-établissements).
 *  - `Level` (« 4A ») porte le niveau ET la lettre de classe : le niveau est
 *    le nombre en tête, rapproché du `Level.order` du tenant.
 *  - Le nom de classe est repris **tel quel** du fichier (« Quatrième A »).
 *  - Les inscriptions sont créées en `DRAFT` (validation manuelle ensuite).
 *  - Un père et une mère par élève, sans dédoublonnage entre élèves ; le nom
 *    de famille du parent est celui de l'élève.
 *  - Phone1 → père, Phone2 → mère ; les deux restent aussi sur l'élève, qui
 *    doit rester joignable seul. Les parents héritent de l'adresse de l'élève.
 */
import { prismaAdmin, withTenant, type Prisma } from '@/lib/db';
import { parseCSV } from '@/lib/csv';

type Tx = Prisma.TransactionClient;

/**
 * Un champ JSON Prisma peut valoir `null`, un scalaire ou un tableau : on ne
 * fusionne que s'il s'agit bien d'un objet. Évite d'écraser au rejeu les
 * données saisies à la main (email, WhatsApp, CNE…) restées hors du CSV.
 */
function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const REQUIRED_HEADERS = [
  'StudentID',
  'LastNameFr',
  'FirstNameFr',
  'Level',
  'ClassNameFr',
  'CurrentSchoolCode',
] as const;

export type MassarRowStatus = 'create' | 'update' | 'skipped' | 'error';

export type MassarPreviewRow = {
  row: number;
  status: MassarRowStatus;
  massarId: string;
  name: string;
  nameAr: string;
  gender: string;
  birthDate: string;
  levelLabel: string;
  className: string;
  classExists: boolean;
  schoolCode: string;
  error?: string;
};

export type MassarPreview = {
  yearId: string;
  yearLabel: string;
  tenantMassarCode: string | null;
  counts: { create: number; update: number; skipped: number; error: number };
  classesToCreate: string[];
  rows: MassarPreviewRow[];
};

export type MassarImportStats = {
  students: number;
  parents: number;
  classes: number;
  enrollments: number;
  skipped: number;
  errors: number;
};

type ParsedRow = {
  row: number;
  massarId: string;
  lastName: string;
  firstName: string;
  lastNameAr: string;
  firstNameAr: string;
  gender: 'M' | 'F' | null;
  birthDate: Date | null;
  levelOrder: number;
  className: string;
  classNameAr: string;
  schoolCode: string;
  fatherName: string;
  motherName: string;
  phone1: string;
  phone2: string;
  addressFr: string;
  cityFr: string;
  addressAr: string;
  cityAr: string;
};

type AnalyzeResult =
  | { ok: true; preview: MassarPreview; parsed: ParsedRow[] }
  | { ok: false; error: string };

/** Analyse le CSV et le confronte à la base. Aucune écriture. */
export async function analyzeMassarCsv(
  tenantId: string,
  csvText: string,
  yearId: string,
): Promise<AnalyzeResult> {
  const grid = parseCSV(csvText);
  if (grid.length < 2) return { ok: false, error: 'CSV vide ou sans ligne de données.' };

  const headers = grid[0]!.map((h) => h.trim());
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Colonnes manquantes : ${missing.join(', ')}. Colonnes trouvées : ${headers.join(', ')}`,
    };
  }
  const cell = (cells: string[], name: string) => {
    const i = headers.indexOf(name);
    return i < 0 ? '' : (cells[i] ?? '').trim();
  };

  const tenant = await prismaAdmin.tenant.findUnique({
    where: { id: tenantId },
    select: { massarCode: true },
  });

  return await withTenant(tenantId, async (tx): Promise<AnalyzeResult> => {
    const year = await tx.academicYear.findFirst({
      where: { id: yearId },
      select: { id: true, label: true },
    });
    if (!year) return { ok: false, error: 'Année scolaire introuvable.' };

    const levels = await tx.level.findMany({
      select: { id: true, label: true, order: true },
      orderBy: { order: 'asc' },
    });
    const levelByOrder = new Map(levels.map((l) => [l.order, l]));

    const classes = await tx.class.findMany({
      where: { academicYearId: year.id, deletedAt: null },
      select: { id: true, name: true },
    });
    const classNames = new Set(classes.map((c) => c.name.trim().toLowerCase()));

    const rows: MassarPreviewRow[] = [];
    const parsed: ParsedRow[] = [];
    const classesToCreate = new Set<string>();
    const seenMassarIds = new Set<string>();

    for (let i = 1; i < grid.length; i++) {
      const cells = grid[i]!;
      const rowNo = i + 1; // la 1re ligne de données est la ligne 2 du fichier
      const massarId = cell(cells, 'StudentID');
      const lastName = cell(cells, 'LastNameFr');
      const firstName = cell(cells, 'FirstNameFr');
      const lastNameAr = cell(cells, 'LastNameAr');
      const firstNameAr = cell(cells, 'FirstNameAr');
      const genderRaw = cell(cells, 'Gender').toUpperCase();
      const birthRaw = cell(cells, 'BirthDate');
      const levelRaw = cell(cells, 'Level');
      const className = cell(cells, 'ClassNameFr');
      const classNameAr = cell(cells, 'ClassNameAr');
      const schoolCode = cell(cells, 'CurrentSchoolCode');

      const base = {
        row: rowNo,
        massarId,
        name: `${lastName} ${firstName}`.trim(),
        nameAr: `${lastNameAr} ${firstNameAr}`.trim(),
        gender: genderRaw,
        birthDate: birthRaw,
        levelLabel: '',
        className,
        classExists: false,
        schoolCode,
      };
      const fail = (error: string) => rows.push({ ...base, status: 'error' as const, error });

      // Établissement hors périmètre → ignorée, ce n'est pas une erreur.
      if (tenant?.massarCode && schoolCode !== tenant.massarCode) {
        rows.push({ ...base, status: 'skipped' });
        continue;
      }
      if (!massarId) {
        fail('StudentID (code MASSAR) manquant — obligatoire pour un import rejouable.');
        continue;
      }
      if (seenMassarIds.has(massarId)) {
        fail(`StudentID « ${massarId} » en double dans le fichier.`);
        continue;
      }
      seenMassarIds.add(massarId);
      if (!lastName || !firstName) {
        fail('Nom ou prénom manquant.');
        continue;
      }

      let gender: 'M' | 'F' | null = null;
      if (genderRaw === 'M' || genderRaw === 'F') gender = genderRaw;
      else if (genderRaw !== '') {
        fail(`Genre « ${genderRaw} » non reconnu (attendu M ou F).`);
        continue;
      }

      let birthDate: Date | null = null;
      if (birthRaw !== '') {
        const d = new Date(birthRaw);
        if (Number.isNaN(d.getTime())) {
          fail(`Date de naissance « ${birthRaw} » illisible (attendu AAAA-MM-JJ).`);
          continue;
        }
        birthDate = d;
      }

      // « 4A » → niveau 4 ; la lettre ne sert pas, le nom de classe vient du fichier.
      const m = levelRaw.match(/^(\d+)/);
      if (!m) {
        fail(`Niveau « ${levelRaw} » illisible (attendu un nombre en tête, ex. « 4A »).`);
        continue;
      }
      const levelOrder = Number(m[1]);
      const level = levelByOrder.get(levelOrder);
      if (!level) {
        fail(
          `Niveau ${levelOrder} inexistant dans l'établissement (niveaux disponibles : ${
            levels.map((l) => l.order).join(', ') || 'aucun'
          }). Créez-le dans Paramétrage → Cursus.`,
        );
        continue;
      }
      if (!className) {
        fail('ClassNameFr manquant.');
        continue;
      }

      const classExists = classNames.has(className.toLowerCase());
      if (!classExists) classesToCreate.add(className);

      const existingStudent = await tx.person.findFirst({
        where: { massarId, type: 'STUDENT' },
        select: { id: true },
      });

      rows.push({
        ...base,
        status: existingStudent ? 'update' : 'create',
        levelLabel: level.label,
        classExists,
      });
      parsed.push({
        row: rowNo,
        massarId,
        lastName,
        firstName,
        lastNameAr,
        firstNameAr,
        gender,
        birthDate,
        levelOrder,
        className,
        classNameAr,
        schoolCode,
        fatherName: cell(cells, 'FatherNameFr'),
        motherName: cell(cells, 'MotherNameFr'),
        phone1: cell(cells, 'Phone1'),
        phone2: cell(cells, 'Phone2'),
        addressFr: cell(cells, 'AddressFr'),
        cityFr: cell(cells, 'CityFr'),
        addressAr: cell(cells, 'AddressAr'),
        cityAr: cell(cells, 'CityAr'),
      });
    }

    return {
      ok: true,
      preview: {
        yearId: year.id,
        yearLabel: year.label,
        tenantMassarCode: tenant?.massarCode ?? null,
        counts: {
          create: rows.filter((r) => r.status === 'create').length,
          update: rows.filter((r) => r.status === 'update').length,
          skipped: rows.filter((r) => r.status === 'skipped').length,
          error: rows.filter((r) => r.status === 'error').length,
        },
        classesToCreate: [...classesToCreate].sort(),
        rows,
      },
      parsed,
    };
  });
}

/**
 * Analyse puis écrit. Tout ou rien : une seule transaction.
 *
 * `onAudit` est appelé **dans** la transaction : la journalisation vit dans
 * `@/lib/audit`, qui importe `server-only` et ne peut donc pas être tiré ici
 * sans rendre ce module inutilisable hors runtime Next (scripts, tests).
 */
export async function runMassarImport(
  tenantId: string,
  userId: string | null,
  csvText: string,
  yearId: string,
  onAudit?: (tx: Tx, summary: MassarImportStats & { year: string }) => Promise<void>,
): Promise<{ ok: true; stats: MassarImportStats } | { ok: false; error: string }> {
  const res = await analyzeMassarCsv(tenantId, csvText, yearId);
  if (!res.ok) return res;
  const { preview, parsed } = res;
  if (parsed.length === 0) return { ok: false, error: 'Aucune ligne exploitable : rien à importer.' };

  const stats: MassarImportStats = {
    students: 0,
    parents: 0,
    classes: 0,
    enrollments: 0,
    skipped: preview.counts.skipped,
    errors: preview.counts.error,
  };

  await withTenant(tenantId, async (tx) => {
    const levels = await tx.level.findMany({ select: { id: true, order: true } });
    const levelByOrder = new Map(levels.map((l) => [l.order, l.id]));

    // Cache des classes de l'année cible, alimenté au fil des créations.
    const existingClasses = await tx.class.findMany({
      where: { academicYearId: yearId, deletedAt: null },
      select: { id: true, name: true },
    });
    const classByName = new Map(existingClasses.map((c) => [c.name.trim().toLowerCase(), c.id]));

    for (const r of parsed) {
      const levelId = levelByOrder.get(r.levelOrder)!;

      // ── Classe (créée à la volée, nom repris du fichier) ────────────────
      let classId = classByName.get(r.className.toLowerCase());
      if (!classId) {
        const created = await tx.class.create({
          data: {
            tenantId,
            academicYearId: yearId,
            levelId,
            name: r.className,
            nameAr: r.classNameAr || null,
            capacity: 30,
          },
          select: { id: true },
        });
        classId = created.id;
        classByName.set(r.className.toLowerCase(), classId);
        stats.classes++;
      }

      // ── Élève (clé = code MASSAR) ───────────────────────────────────────
      // Adresse partagée par l'élève et ses parents (même foyer dans MASSAR).
      const address = {
        line1: r.addressFr || undefined,
        city: r.cityFr || undefined,
        line1Ar: r.addressAr || undefined,
        cityAr: r.cityAr || undefined,
        country: 'Maroc',
      };
      const existing = await tx.person.findFirst({
        where: { massarId: r.massarId, type: 'STUDENT' },
        select: { id: true, contacts: true, address: true, metadata: true },
      });
      const studentData = {
        firstName: r.firstName,
        lastName: r.lastName,
        firstNameAr: r.firstNameAr || null,
        lastNameAr: r.lastNameAr || null,
        birthDate: r.birthDate,
        gender: r.gender,
        contacts: {
          ...asObject(existing?.contacts),
          phone: r.phone1 || undefined,
          phone2: r.phone2 || undefined,
        },
        address: { ...asObject(existing?.address), ...address },
        // Le code MASSAR lui-même vit dans la colonne `massarId` : rien à
        // dupliquer ici. On ne garde que le code établissement d'origine.
        metadata: {
          ...asObject(existing?.metadata),
          massarSchoolCode: r.schoolCode || undefined,
        },
      };
      const student = existing
        ? await tx.person.update({ where: { id: existing.id }, data: studentData })
        : await tx.person.create({
            data: { tenantId, type: 'STUDENT', massarId: r.massarId, ...studentData },
          });
      stats.students++;

      // ── Parents (un père / une mère par élève, nom = celui de l'élève) ──
      // Phone1 revient au père, Phone2 à la mère ; tous deux partagent
      // l'adresse de l'élève.
      for (const [type, parentFirstName, parentPhone] of [
        ['FATHER', r.fatherName, r.phone1],
        ['MOTHER', r.motherName, r.phone2],
      ] as const) {
        if (!parentFirstName) continue;
        // Idempotence : on réutilise le parent déjà rattaché à cet élève pour
        // ce rôle plutôt que d'en créer un second à chaque import.
        const relation = await tx.personRelation.findFirst({
          where: { childId: student.id, type },
          select: { parentId: true },
        });
        const current = relation
          ? await tx.person.findUnique({
              where: { id: relation.parentId },
              select: { contacts: true, address: true },
            })
          : null;
        const parentData = {
          firstName: parentFirstName,
          lastName: r.lastName,
          contacts: { ...asObject(current?.contacts), phone: parentPhone || undefined },
          address: { ...asObject(current?.address), ...address },
        };
        if (relation) {
          await tx.person.update({ where: { id: relation.parentId }, data: parentData });
          continue;
        }
        const parent = await tx.person.create({
          data: { tenantId, type: 'PARENT', ...parentData },
          select: { id: true },
        });
        await tx.personRelation.create({
          data: { tenantId, childId: student.id, parentId: parent.id, type },
        });
        stats.parents++;
      }

      // ── Inscription (DRAFT) ─────────────────────────────────────────────
      const enrollment = await tx.enrollment.findUnique({
        where: { studentId_academicYearId: { studentId: student.id, academicYearId: yearId } },
        select: { id: true },
      });
      if (enrollment) {
        await tx.enrollment.update({ where: { id: enrollment.id }, data: { levelId, classId } });
      } else {
        await tx.enrollment.create({
          data: {
            tenantId,
            studentId: student.id,
            academicYearId: yearId,
            levelId,
            classId,
            status: 'DRAFT',
            createdByUserId: userId,
          },
        });
        stats.enrollments++;
      }

      // ── Affectation de classe (appel, carnet, notes…) ───────────────────
      const membership = await tx.studentClass.findUnique({
        where: { studentId_classId: { studentId: student.id, classId } },
        select: { id: true, unenrolledAt: true },
      });
      if (!membership) {
        await tx.studentClass.create({ data: { tenantId, studentId: student.id, classId } });
      } else if (membership.unenrolledAt) {
        await tx.studentClass.update({ where: { id: membership.id }, data: { unenrolledAt: null } });
      }
    }

    if (onAudit) await onAudit(tx, { ...stats, year: preview.yearLabel });
  });

  return { ok: true, stats };
}
