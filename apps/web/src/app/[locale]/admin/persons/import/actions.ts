'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { parseCSV } from '@/lib/csv';

type RowResult =
  | { row: number; status: 'ok'; id: string; firstName: string; lastName: string }
  | { row: number; status: 'error'; reason: string; firstName?: string; lastName?: string };

type Result =
  | { ok: true; created: number; total: number; results: RowResult[] }
  | { ok: false; error: string };

const ROW_SCHEMA = z.object({
  type: z.enum(['STUDENT', 'TEACHER', 'STAFF', 'PARENT']).default('STUDENT'),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  birthDate: z
    .preprocess((v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined), z.string().optional())
    .optional(),
  gender: z
    .preprocess((v) => (typeof v === 'string' && v.trim() !== '' ? v.trim().toUpperCase() : undefined),
      z.enum(['M', 'F', 'X']).optional())
    .optional(),
  email: z
    .preprocess((v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined), z.string().email().optional())
    .optional(),
  phone: z
    .preprocess((v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined), z.string().optional())
    .optional(),
  cin: z
    .preprocess((v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined), z.string().optional())
    .optional(),
});

export type ImportPreviewRow = {
  row: number;
  raw: Record<string, string>;
  parsed?: z.infer<typeof ROW_SCHEMA>;
  error?: string;
};

const EXPECTED_HEADERS = ['type', 'firstName', 'lastName', 'birthDate', 'gender', 'email', 'phone', 'cin'];

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace('prénom', 'firstname')
    .replace('prenom', 'firstname')
    .replace('nom', 'lastname')
    .replace('email', 'email')
    .replace('téléphone', 'phone')
    .replace('telephone', 'phone')
    .replace('genre', 'gender')
    .replace('sexe', 'gender')
    .replace('naissance', 'birthdate')
    .replace('datedenaissance', 'birthdate')
    .replace('type', 'type')
    .replace('cin', 'cin');
}

const HEADER_MAP: Record<string, keyof z.infer<typeof ROW_SCHEMA>> = {
  type: 'type',
  firstname: 'firstName',
  lastname: 'lastName',
  birthdate: 'birthDate',
  gender: 'gender',
  email: 'email',
  phone: 'phone',
  cin: 'cin',
};

export async function previewCsvAction(csvText: string): Promise<
  | { ok: true; headers: string[]; rows: ImportPreviewRow[]; total: number }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('students.write');

  const parsed = parseCSV(csvText);
  if (parsed.length < 2) return { ok: false, error: 'CSV vide ou sans données.' };

  const rawHeaders = parsed[0]!;
  const headers = rawHeaders.map(normalizeHeader);
  const mappedHeaders = headers.map((h) => HEADER_MAP[h]);

  if (!mappedHeaders.includes('firstName') || !mappedHeaders.includes('lastName')) {
    return {
      ok: false,
      error: `Colonnes manquantes. Attendu au minimum : firstName, lastName. Trouvé : ${rawHeaders.join(', ')}`,
    };
  }

  const rows: ImportPreviewRow[] = [];
  for (let i = 1; i < parsed.length; i++) {
    const cells = parsed[i]!;
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const key = mappedHeaders[j];
      if (key) obj[key] = cells[j] ?? '';
    }
    const validated = ROW_SCHEMA.safeParse(obj);
    rows.push({
      row: i + 1,
      raw: obj,
      parsed: validated.success ? validated.data : undefined,
      error: validated.success
        ? undefined
        : validated.error.issues.map((iss) => `${iss.path.join('.')}: ${iss.message}`).join(' · '),
    });
  }

  return { ok: true, headers: EXPECTED_HEADERS, rows, total: rows.length };
}

export async function commitCsvAction(csvText: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('students.write');

  const preview = await previewCsvAction(csvText);
  if (!preview.ok) return preview;

  const tenantId = session.user.tenantId;
  const results: RowResult[] = [];

  // Une transaction par lot — on bloque tout en cas d'erreur applicative
  // (sécurité forte) ; les erreurs de validation ligne par ligne sont
  // remontées sans bloquer les autres.
  const validRows = preview.rows.filter((r) => r.parsed);

  if (validRows.length === 0) {
    return {
      ok: true,
      created: 0,
      total: preview.rows.length,
      results: preview.rows.map((r) => ({
        row: r.row,
        status: 'error' as const,
        reason: r.error ?? 'invalide',
      })),
    };
  }

  await withTenant(tenantId, async (tx) => {
    for (const r of preview.rows) {
      if (!r.parsed) {
        results.push({ row: r.row, status: 'error', reason: r.error ?? 'invalide' });
        continue;
      }
      try {
        const person = await tx.person.create({
          data: {
            tenantId,
            type: r.parsed.type,
            firstName: r.parsed.firstName,
            lastName: r.parsed.lastName,
            birthDate: r.parsed.birthDate ? new Date(r.parsed.birthDate) : null,
            gender: r.parsed.gender,
            cin: r.parsed.cin,
            contacts: {
              email: r.parsed.email,
              phone: r.parsed.phone,
            },
          },
        });
        results.push({
          row: r.row,
          status: 'ok',
          id: person.id,
          firstName: person.firstName,
          lastName: person.lastName,
        });
      } catch (e: unknown) {
        results.push({
          row: r.row,
          status: 'error',
          reason: e instanceof Error ? e.message : 'Insert failed',
          firstName: r.parsed.firstName,
          lastName: r.parsed.lastName,
        });
      }
    }

    const okCount = results.filter((r) => r.status === 'ok').length;
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'import_csv',
      entityType: 'Person',
      after: { count: okCount, total: preview.rows.length },
    });
  });

  revalidatePath('/admin/persons');
  return {
    ok: true,
    created: results.filter((r) => r.status === 'ok').length,
    total: preview.rows.length,
    results,
  };
}
