'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  attendanceBulkSaveSchema,
  attendanceSessionCreateSchema,
  type AttendanceStatusInput,
} from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { safeSendEmail } from '@/lib/email';

type Result<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function flatten<T>(parsed: z.SafeParseError<T>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Récupère la session du jour pour une classe (date par défaut = aujourd'hui)
 * ou la crée si elle n'existe pas. Si elle existe et a déjà des records, on
 * les retourne tels quels ; sinon on initialise les records à PRESENT pour
 * chaque élève inscrit.
 *
 * Idempotent : appeler 2x avec les mêmes paramètres retourne la même session.
 */
export async function getOrCreateAttendanceSessionAction(
  input: { classId: string; date?: string; periodLabel?: string },
): Promise<
  Result<{
    sessionId: string;
    finalizedAt: Date | null;
    date: string;
    periodLabel: string | null;
    records: Array<{
      studentId: string;
      firstName: string;
      lastName: string;
      status: AttendanceStatusInput;
      lateMinutes: number | null;
      note: string | null;
    }>;
  }>
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('attendance.write');

  const parsed = attendanceSessionCreateSchema.safeParse({
    classId: input.classId,
    date: input.date ?? new Date().toISOString().slice(0, 10),
    periodLabel: input.periodLabel,
  });
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: flatten(parsed) };
  }

  const tenantId = session.user.tenantId;
  const dateOnly = new Date(parsed.data.date);
  dateOnly.setUTCHours(0, 0, 0, 0);

  const result = await withTenant(tenantId, async (tx) => {
    // 1. Récupère la classe avec les élèves inscrits actifs
    const cls = await tx.class.findUnique({
      where: { id: parsed.data.classId },
      include: {
        students: {
          where: { unenrolledAt: null },
          include: { student: true },
          orderBy: { student: { lastName: 'asc' } },
        },
      },
    });
    if (!cls) throw new Error('Classe introuvable');
    if (cls.deletedAt) throw new Error('Classe archivée');

    // 2. upsert session (unique sur classId+date+periodLabel)
    const periodLabelKey = parsed.data.periodLabel ?? null;
    const existing = await tx.attendanceSession.findFirst({
      where: {
        classId: parsed.data.classId,
        date: dateOnly,
        periodLabel: periodLabelKey,
      },
    });

    const attSession =
      existing ??
      (await tx.attendanceSession.create({
        data: {
          tenantId,
          classId: parsed.data.classId,
          date: dateOnly,
          periodLabel: parsed.data.periodLabel,
        },
      }));

    if (!existing) {
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'AttendanceSession',
        entityId: attSession.id,
        after: { classId: parsed.data.classId, date: parsed.data.date },
      });

      // 3. Initialise un record PRESENT par élève inscrit
      if (cls.students.length > 0) {
        await tx.attendanceRecord.createMany({
          data: cls.students.map((sc) => ({
            tenantId,
            sessionId: attSession.id,
            studentId: sc.studentId,
            status: 'PRESENT' as const,
          })),
        });
      }
    }

    // 4. Lecture des records actuels (avec les noms d'élèves)
    const records = await tx.attendanceRecord.findMany({
      where: { sessionId: attSession.id },
      include: { student: { select: { firstName: true, lastName: true } } },
      orderBy: { student: { lastName: 'asc' } },
    });

    return {
      sessionId: attSession.id,
      finalizedAt: attSession.finalizedAt,
      date: attSession.date.toISOString().slice(0, 10),
      periodLabel: attSession.periodLabel,
      records: records.map((r) => ({
        studentId: r.studentId,
        firstName: r.student.firstName,
        lastName: r.student.lastName,
        status: r.status as AttendanceStatusInput,
        lateMinutes: r.lateMinutes,
        note: r.note,
      })),
    };
  });

  return { ok: true, data: result };
}

export async function saveAttendanceAction(formData: FormData): Promise<Result> {
  const sessionAuth = await auth();
  if (!sessionAuth?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('attendance.write');

  // Le client envoie un payload JSON dans un champ `payload`
  const raw = formData.get('payload');
  if (typeof raw !== 'string') return { ok: false, error: 'Payload manquant' };
  let parsedJson;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'JSON invalide' };
  }

  const parsed = attendanceBulkSaveSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: flatten(parsed) };
  }

  const tenantId = sessionAuth.user.tenantId;

  await withTenant(tenantId, async (tx) => {
    const session = await tx.attendanceSession.findUnique({
      where: { id: parsed.data.sessionId },
    });
    if (!session) throw new Error('Session introuvable');
    if (session.finalizedAt) throw new Error('Session déjà validée — déverrouiller pour modifier');

    // Upsert de chaque record (sur unique sessionId+studentId)
    for (const rec of parsed.data.records) {
      await tx.attendanceRecord.upsert({
        where: {
          sessionId_studentId: {
            sessionId: parsed.data.sessionId,
            studentId: rec.studentId,
          },
        },
        update: {
          status: rec.status,
          lateMinutes: rec.status === 'LATE' ? (rec.lateMinutes ?? null) : null,
          note: rec.note ?? null,
        },
        create: {
          tenantId,
          sessionId: parsed.data.sessionId,
          studentId: rec.studentId,
          status: rec.status,
          lateMinutes: rec.status === 'LATE' ? (rec.lateMinutes ?? null) : null,
          note: rec.note ?? null,
        },
      });
    }

    if (parsed.data.finalize) {
      await tx.attendanceSession.update({
        where: { id: parsed.data.sessionId },
        data: { finalizedAt: new Date() },
      });
    }

    await logAudit(tx, {
      tenantId,
      userId: sessionAuth.user.id,
      action: parsed.data.finalize ? 'finalize' : 'save',
      entityType: 'AttendanceSession',
      entityId: parsed.data.sessionId,
      after: {
        recordsCount: parsed.data.records.length,
        summary: {
          present: parsed.data.records.filter((r) => r.status === 'PRESENT').length,
          absent: parsed.data.records.filter((r) => r.status === 'ABSENT').length,
          late: parsed.data.records.filter((r) => r.status === 'LATE').length,
          excused: parsed.data.records.filter((r) => r.status === 'EXCUSED').length,
        },
      },
    });
  });

  // Hors transaction : envoyer les notifications aux contacts des absents
  // si on vient de finaliser la session. Erreurs email loguées, ne bloquent pas.
  if (parsed.data.finalize) {
    await notifyAbsentees(tenantId, parsed.data.sessionId);
  }

  revalidatePath(`/admin/classes/${parsed.data.sessionId}`);
  return { ok: true };
}

/**
 * Envoie un email aux contacts des élèves absents pour une session donnée.
 * Best-effort : on collecte les échecs mais on ne fait pas échouer l'action.
 */
async function notifyAbsentees(tenantId: string, sessionId: string): Promise<void> {
  const data = await withTenant(tenantId, async (tx) => {
    const sessionRow = await tx.attendanceSession.findUnique({
      where: { id: sessionId },
      include: {
        class: true,
        records: {
          where: { status: 'ABSENT' },
          include: { student: true },
        },
      },
    });
    if (!sessionRow) return null;
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
    return { sessionRow, tenant };
  });
  if (!data || !data.sessionRow) return;

  const { sessionRow, tenant } = data;
  const dateStr = sessionRow.date.toLocaleDateString('fr-FR');
  const tenantName = tenant?.name ?? 'Jawal';
  const className = sessionRow.class.name;

  await Promise.all(
    sessionRow.records.map(async (rec) => {
      const contacts = (rec.student.contacts ?? {}) as { email?: string };
      const email = contacts.email;
      if (!email) return;

      await safeSendEmail({
        to: email,
        subject: `[${tenantName}] Absence de ${rec.student.firstName} ${rec.student.lastName} — ${dateStr}`,
        html: `
          <p>Bonjour,</p>
          <p>Nous vous informons que <strong>${rec.student.firstName} ${rec.student.lastName}</strong>
          a été enregistré(e) <strong>absent(e)</strong> au cours du <strong>${dateStr}</strong>
          pour la classe <strong>${className}</strong>.</p>
          <p>Si cette absence est justifiée, merci de nous transmettre un document
          (certificat médical, attestation parentale) via votre espace parent ou
          directement à l'administration.</p>
          <p>Cordialement,<br/>${tenantName}</p>
          <hr/>
          <p style="font-size:11px;color:#888">Notification automatique — ne pas répondre à cet email.</p>
        `,
        text: `${rec.student.firstName} ${rec.student.lastName} a été absent(e) le ${dateStr} (${className}). Merci de justifier si besoin.`,
      });
    }),
  );
}

export async function reopenSessionAction(sessionId: string): Promise<Result> {
  const sessionAuth = await auth();
  if (!sessionAuth?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('attendance.write');

  const tenantId = sessionAuth.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    await tx.attendanceSession.update({
      where: { id: sessionId },
      data: { finalizedAt: null },
    });
    await logAudit(tx, {
      tenantId,
      userId: sessionAuth.user.id,
      action: 'reopen',
      entityType: 'AttendanceSession',
      entityId: sessionId,
    });
  });
  return { ok: true };
}
