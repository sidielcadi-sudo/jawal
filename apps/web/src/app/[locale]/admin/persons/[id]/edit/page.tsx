import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { PersonForm } from '../../person-form';

export default async function EditPersonPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.persons');

  const { person, roles, availableParents, allSubjects, allCycles, allClasses } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const activeYear = await tx.academicYear.findFirst({
        where: { active: true },
        select: { id: true },
      });
      const [person, roles, availableParents, allSubjects, allCycles, classes] = await Promise.all([
        tx.person.findUnique({
          where: { id },
          include: {
            relationsAsChild: true,
            contractFile: true,
            teacherSpecialties: true,
            teacherCycles: true,
            teacherPriorityClasses: true,
            diplomas: { orderBy: { order: 'asc' } },
          },
        }),
        tx.personRole.findMany({
          where: { active: true },
          orderBy: [{ appliesTo: 'asc' }, { order: 'asc' }, { labelFr: 'asc' }],
        }),
        tx.person.findMany({
          where: { type: 'PARENT', deletedAt: null, id: { not: id } },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          select: { id: true, firstName: true, lastName: true },
        }),
        tx.subject.findMany({ orderBy: [{ order: 'asc' }, { label: 'asc' }] }),
        tx.cycle.findMany({ orderBy: { order: 'asc' } }),
        tx.class.findMany({
          where: { deletedAt: null, ...(activeYear ? { academicYearId: activeYear.id } : {}) },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        }),
      ]);
      return { person, roles, availableParents, allSubjects, allCycles, allClasses: classes };
    },
  );
  if (!person) notFound();

  const contacts = (person.contacts ?? {}) as { email?: string; phone?: string; whatsapp?: string };
  const address = (person.address ?? {}) as {
    line1?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };

  const backHref = `/${locale}/admin/persons?type=${person.type}`;
  const backLabel = t(`title.${person.type}` as never);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={backHref} className="hover:text-brand-700">
          {backLabel}
        </Link>
        <span className="mx-1.5">›</span>
        <Link href={`/${locale}/admin/persons/${id}`} className="hover:text-brand-700">
          {person.lastName} {person.firstName}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('actions.edit')}</span>
      </nav>

      <h1 className="text-2xl font-semibold text-slate-900">
        {t('actions.edit')} — {person.lastName} {person.firstName}
      </h1>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <PersonForm
          mode="edit"
          locale={locale}
          initial={{
            id: person.id,
            type: person.type,
            roleId: person.roleId ?? undefined,
            service: person.service ?? undefined,
            firstName: person.firstName,
            lastName: person.lastName,
            birthDate: person.birthDate ? person.birthDate.toISOString().slice(0, 10) : undefined,
            gender: person.gender ?? undefined,
            nationality: person.nationality ?? undefined,
            cin: person.cin ?? undefined,
            contacts,
            address,
            parents: person.relationsAsChild.map((r) => ({
              parentId: r.parentId,
              type: r.type,
            })),
            hireDate: person.hireDate ? person.hireDate.toISOString().slice(0, 10) : undefined,
            contractEndDate: person.contractEndDate
              ? person.contractEndDate.toISOString().slice(0, 10)
              : undefined,
            contractType: person.contractType ?? undefined,
            contractualHoursPerWeek: person.contractualHoursPerWeek ?? undefined,
            contractFile: person.contractFile
              ? {
                  id: person.contractFile.id,
                  filename: person.contractFile.filename,
                  sizeBytes: person.contractFile.sizeBytes,
                }
              : null,
            specialtySubjectIds: person.teacherSpecialties.map((s) => s.subjectId),
            cycleIds: person.teacherCycles.map((c) => c.cycleId),
            priorityClassIds: person.teacherPriorityClasses.map((p) => p.classId),
            experienceYears: person.experienceYears ?? undefined,
            diplomas: person.diplomas.map((d) => ({
              title: d.title,
              institution: d.institution ?? undefined,
              year: d.year ?? undefined,
            })),
            availability:
              (person.availability as Record<
                'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN',
                Array<{ from: string; to: string }>
              >) ?? ({ MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [], SUN: [] } as never),
            rib: person.rib ?? undefined,
            bankName: person.bankName ?? undefined,
            payrollMethod: person.payrollMethod ?? undefined,
            grossSalary: person.grossSalary !== null ? Number(person.grossSalary) : undefined,
            netSalary: person.netSalary !== null ? Number(person.netSalary) : undefined,
            benefits: Array.isArray(person.benefits)
              ? (person.benefits as Array<{ label: string; amount: number }>)
              : [],
            deductions: Array.isArray(person.deductions)
              ? (person.deductions as Array<{ label: string; amount: number; date?: string }>)
              : [],
          }}
          roles={roles.map((r) => ({
            id: r.id,
            appliesTo: r.appliesTo,
            labelFr: r.labelFr,
            labelAr: r.labelAr,
          }))}
          availableParents={availableParents}
          allSubjects={allSubjects.map((s) => ({ id: s.id, label: s.label }))}
          allCycles={allCycles.map((c) => ({ id: c.id, label: c.label }))}
          allClasses={allClasses.map((c) => ({ id: c.id, label: c.name }))}
        />
      </div>
    </div>
  );
}
