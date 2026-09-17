import 'server-only';
import type { Prisma } from '@/lib/db';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';
import { yearInstallmentEnd } from '@/lib/school-year';
import type { StudentDetail } from '@/app/[locale]/admin/persons/student-detail';


/**
 * Fiche de l'élève ouvert dans le panneau latéral.
 *
 * Requête séparée et volontairement large : elle ne concerne qu'UN élève, on
 * peut donc se permettre d'aller chercher les parents, la situation financière
 * et les derniers appels sans peser sur la liste.
 */
export async function loadStudentDetail(
  tx: Prisma.TransactionClient,
  id: string,
  locale: string,
  activeYear: { id: string; label: string; startDate: Date; endDate: Date } | null,
): Promise<StudentDetail | null> {
  const person = await tx.person.findFirst({
    where: { id, type: 'STUDENT' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      firstNameAr: true,
      lastNameAr: true,
      massarId: true,
      birthDate: true,
      birthPlace: true,
      gender: true,
      address: true,
      photoFileId: true,
      relationsAsChild: {
        select: {
          type: true,
          parent: {
            select: {
              firstName: true,
              lastName: true,
              firstNameAr: true,
              lastNameAr: true,
              contacts: true,
            },
          },
        },
      },
    },
  });
  if (!person) return null;

  const [sc, enrollment, installments, attendance, tenant] = await Promise.all([
    activeYear
      ? tx.studentClass.findFirst({
          where: { studentId: id, unenrolledAt: null, class: { academicYearId: activeYear.id } },
          select: {
            class: {
              select: {
                name: true,
                nameAr: true,
                level: {
                  select: {
                    label: true,
                    labelAr: true,
                    cycle: { select: { label: true, labelAr: true } },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve(null),
    activeYear
      ? tx.enrollment.findFirst({
          where: { studentId: id, academicYearId: activeYear.id },
          select: { status: true },
        })
      : Promise.resolve(null),
    // Situation financière de l'ANNÉE ACTIVE seulement. Cumuler les exercices
    // faisait apparaître en « reste dû » des créances d'années closes, qui se
    // traitent dans Finances → Gestion des impayés et n'ont rien à faire dans
    // une fiche censée dire où en est l'élève cette année.
    tx.installment.findMany({
      where: {
        studentId: id,
        status: { not: 'CANCELLED' },
        ...(activeYear
          ? { dueDate: { gte: activeYear.startDate, lt: yearInstallmentEnd(activeYear) } }
          : {}),
      },
      select: { amount: true, dueDate: true, payments: { select: { amount: true, paidAt: true } } },
      orderBy: { dueDate: 'asc' },
    }),
    // Même borne pour l'assiduité : les quatre derniers appels de l'an dernier
    // ne disent rien de l'élève d'aujourd'hui.
    tx.attendanceRecord.findMany({
      where: {
        studentId: id,
        ...(activeYear
          ? { session: { class: { academicYearId: activeYear.id } } }
          : {}),
      },
      orderBy: { session: { date: 'desc' } },
      take: 4,
      select: { status: true, session: { select: { date: true } } },
    }),
    tx.tenant.findFirst({ select: { currency: true } }),
  ]);

  let remaining = 0;
  let lastPaymentAt: Date | null = null;
  let nextDueDate: Date | null = null;
  let nextDueAmount = 0;
  const today = new Date();
  for (const i of installments) {
    const paid = i.payments.reduce((acc, x) => acc + Number(x.amount), 0);
    remaining += Math.max(0, Number(i.amount) - paid);
    for (const x of i.payments) {
      if (!lastPaymentAt || x.paidAt > lastPaymentAt) lastPaymentAt = x.paidAt;
    }
    if (!nextDueDate && i.dueDate >= today && Number(i.amount) - paid > 0.01) {
      nextDueDate = i.dueDate;
      nextDueAmount = Number(i.amount) - paid;
    }
  }

  const addr = (person.address ?? {}) as { street?: string; city?: string };

  return {
    id: person.id,
    name: personDisplayName(locale, person),
    massarId: person.massarId,
    birthDate: person.birthDate,
    birthPlace: person.birthPlace,
    gender: person.gender,
    address: [addr.street, addr.city].filter(Boolean).join(', ') || null,
    photo: Boolean(person.photoFileId),
    className: sc ? localizedLabel(locale, sc.class.name, sc.class.nameAr) : null,
    levelLabel: sc ? localizedLabel(locale, sc.class.level.label, sc.class.level.labelAr) : null,
    cycleLabel: sc
      ? localizedLabel(locale, sc.class.level.cycle.label, sc.class.level.cycle.labelAr)
      : null,
    yearLabel: activeYear?.label ?? null,
    status: enrollment?.status ?? null,
    parents: person.relationsAsChild.map((r) => {
      const c = (r.parent.contacts ?? {}) as { phone?: string; email?: string };
      return {
        role: r.type,
        name: personDisplayName(locale, r.parent),
        phone: c.phone ?? null,
        email: c.email ?? null,
      };
    }),
    finance: {
      remaining: Math.round(remaining * 100) / 100,
      lastPaymentAt,
      nextDueDate,
      nextDueAmount: Math.round(nextDueAmount * 100) / 100,
      currency: tenant?.currency ?? 'MAD',
    },
    attendance: attendance.map((a) => ({ date: a.session.date, status: a.status })),
  };
}
