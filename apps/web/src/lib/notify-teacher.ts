import 'server-only';
import type { Prisma } from '@/lib/db';
import { dowOf, toDateStr } from '@/lib/lesson-book';

type Tx = Prisma.TransactionClient;

/**
 * Résout le compte utilisateur de l'enseignant d'une séance d'appel, via
 * l'entrée d'EDT correspondante (classe × jour × créneau). null si introuvable
 * ou si l'enseignant n'a pas de compte.
 */
export async function resolveSessionTeacherUserId(
  tx: Tx,
  args: { classId: string; date: Date; periodLabel: string | null },
): Promise<string | null> {
  if (!args.periodLabel) return null;
  const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
  if (!year) return null;
  const entries = await tx.timetableEntry.findMany({
    where: { academicYearId: year.id, classId: args.classId, dayOfWeek: dowOf(toDateStr(args.date)) },
    select: { teacherId: true, slot: { select: { startTime: true, endTime: true } } },
  });
  const match = entries.find((e) => `${e.slot.startTime}-${e.slot.endTime}` === args.periodLabel);
  if (!match?.teacherId) return null;
  const up = await tx.userPerson.findFirst({
    where: { personId: match.teacherId },
    select: { userId: true },
  });
  return up?.userId ?? null;
}

/**
 * Crée un message interne (conversation + message) du fromUser vers l'enseignant.
 * Retourne l'e-mail de l'enseignant + l'id de conversation (pour e-mail
 * best-effort hors transaction), ou null si pas de destinataire valide.
 */
export async function createTeacherMessage(
  tx: Tx,
  args: { tenantId: string; fromUserId: string; teacherUserId: string; subject: string; body: string },
): Promise<{ email: string | null; conversationId: string } | null> {
  const teacher = await tx.user.findFirst({
    where: { id: args.teacherUserId, disabledAt: null },
    select: { id: true, email: true },
  });
  if (!teacher) return null;
  const conv = await tx.conversation.create({
    data: { tenantId: args.tenantId, subject: args.subject, createdBy: args.fromUserId },
  });
  await tx.conversationParticipant.createMany({
    data: [...new Set([args.fromUserId, args.teacherUserId])].map((uid) => ({
      tenantId: args.tenantId,
      conversationId: conv.id,
      userId: uid,
    })),
  });
  await tx.message.create({
    data: {
      tenantId: args.tenantId,
      conversationId: conv.id,
      senderUserId: args.fromUserId,
      body: args.body,
    },
  });
  return { email: teacher.email, conversationId: conv.id };
}
