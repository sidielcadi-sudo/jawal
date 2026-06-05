import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { PersonActions } from './person-actions';
import { ParentAccess } from './parent-access';
import { TeacherAccess } from './teacher-access';
import { DocumentsPanel } from '@/components/documents-panel';
import { computeContractStatus, contractStatusBadgeClass } from '@/lib/contract-status';

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const tenantId = session.user.tenantId;
  const t = await getTranslations('admin.persons');
  const tDetail = await getTranslations('admin.persons.detail');
  const tForm = await getTranslations('admin.persons.form');

  const person = await withTenant(tenantId, async (tx) =>
    tx.person.findUnique({
      where: { id },
      include: {
        role: true,
        contractFile: true,
        studentClasses: {
          include: {
            class: { include: { level: true, academicYear: true } },
          },
        },
        relationsAsChild: {
          include: { parent: true },
        },
        relationsAsParent: {
          include: { child: true },
        },
        teacherAssignments: {
          include: {
            subject: true,
            class: { include: { academicYear: true } },
            academicYear: true,
          },
          orderBy: [{ academicYear: { startDate: 'desc' } }, { subject: { label: 'asc' } }],
        },
        teacherSpecialties: { include: { subject: true } },
        teacherCycles: { include: { cycle: true } },
        teacherPriorityClasses: { include: { class: true } },
        diplomas: { orderBy: { order: 'asc' } },
      },
    }),
  );

  if (!person) notFound();

  // Récap pointage du mois courant (TEACHER/STAFF uniquement).
  type AttendanceSummary = {
    present: number;
    absent: number;
    late: number;
    excused: number;
    leave: number;
    deduction: number;
    monthLabel: string;
    monthParam: string;
  };
  let attendanceSummary: AttendanceSummary | null = null;
  if (person.type === 'TEACHER' || person.type === 'STAFF') {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1));
    const monthParam = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = now.toLocaleDateString(locale, { month: 'long', year: 'numeric' });

    attendanceSummary = await withTenant(tenantId, async (tx) => {
      const rows = await tx.staffAttendance.findMany({
        where: { personId: id, date: { gte: monthStart, lt: monthEnd } },
        select: { status: true, deductionAmount: true },
      });
      return rows.reduce<AttendanceSummary>(
        (acc, r) => {
          if (r.status === 'PRESENT') acc.present += 1;
          if (r.status === 'ABSENT') acc.absent += 1;
          if (r.status === 'LATE') acc.late += 1;
          if (r.status === 'EXCUSED') acc.excused += 1;
          if (r.status === 'LEAVE') acc.leave += 1;
          acc.deduction += Number(r.deductionAmount);
          return acc;
        },
        {
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          leave: 0,
          deduction: 0,
          monthLabel,
          monthParam,
        },
      );
    });
  }

  // Dossiers d'inscription (toutes années) — élève uniquement
  let enrollmentHistory: Array<{
    id: string;
    yearLabel: string;
    levelLabel: string;
    className: string | null;
    classId: string | null;
    status: 'DRAFT' | 'ACTIVE' | 'WITHDRAWN' | 'GRADUATED';
    siblingRank: number | null;
    discountPct: number | null;
    enrolledAt: Date;
  }> = [];
  if (person.type === 'STUDENT') {
    enrollmentHistory = await withTenant(tenantId, async (tx) => {
      const rows = await tx.enrollment.findMany({
        where: { studentId: id },
        include: {
          academicYear: { select: { label: true } },
          level: { select: { label: true } },
          class: { select: { id: true, name: true } },
        },
        orderBy: { academicYear: { startDate: 'desc' } },
      });
      return rows.map((r) => ({
        id: r.id,
        yearLabel: r.academicYear.label,
        levelLabel: r.level.label,
        className: r.class?.name ?? null,
        classId: r.class?.id ?? null,
        status: r.status as 'DRAFT' | 'ACTIVE' | 'WITHDRAWN' | 'GRADUATED',
        siblingRank: r.siblingRank,
        discountPct: r.discountPct !== null ? Number(r.discountPct) : null,
        enrolledAt: r.enrolledAt,
      }));
    });
  }

  // Récap présences élève (TOUTE l'année active : présent/absent/retard/excusé).
  type StudentAttSummary = {
    total: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    rate: number | null;
    recentAbsences: Array<{
      id: string;
      date: Date;
      status: 'ABSENT' | 'LATE' | 'EXCUSED';
      className: string;
      justificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
    }>;
  };
  let studentAttendance: StudentAttSummary | null = null;
  if (person.type === 'STUDENT') {
    studentAttendance = await withTenant(tenantId, async (tx) => {
      const activeYear = await tx.academicYear.findFirst({ where: { active: true } });
      if (!activeYear) {
        return {
          total: 0,
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          rate: null,
          recentAbsences: [],
        };
      }

      const records = await tx.attendanceRecord.findMany({
        where: {
          studentId: id,
          session: {
            date: { gte: activeYear.startDate, lte: activeYear.endDate },
          },
        },
        include: {
          session: { include: { class: { select: { name: true } } } },
          justification: { select: { status: true } },
        },
        orderBy: { session: { date: 'desc' } },
      });

      const counts = records.reduce(
        (acc, r) => {
          acc.total += 1;
          if (r.status === 'PRESENT') acc.present += 1;
          if (r.status === 'ABSENT') acc.absent += 1;
          if (r.status === 'LATE') acc.late += 1;
          if (r.status === 'EXCUSED') acc.excused += 1;
          return acc;
        },
        { total: 0, present: 0, absent: 0, late: 0, excused: 0 },
      );

      const rate = counts.total > 0 ? (counts.present / counts.total) * 100 : null;

      const recentAbsences = records
        .filter((r) => r.status !== 'PRESENT')
        .slice(0, 5)
        .map((r) => ({
          id: r.id,
          date: r.session.date,
          status: r.status as 'ABSENT' | 'LATE' | 'EXCUSED',
          className: r.session.class.name,
          justificationStatus:
            (r.justification?.status as 'PENDING' | 'APPROVED' | 'REJECTED' | undefined) ?? null,
        }));

      return { ...counts, rate, recentAbsences };
    });
  }

  // Vue famille — pour les parents : pour chaque enfant rattaché, agréger
  // classe actuelle, taux de présence et reste dû sur les échéances de l'année.
  type FamilyChild = {
    id: string;
    firstName: string;
    lastName: string;
    relation: string;
    className: string | null;
    classId: string | null;
    attendanceRate: number | null;
    absences: number;
    installmentsDue: number;
    installmentsPaid: number;
    installmentsRemaining: number;
  };
  let familyOverview: FamilyChild[] = [];
  if (person.type === 'PARENT' && person.relationsAsParent.length > 0) {
    familyOverview = await withTenant(tenantId, async (tx) => {
      const activeYear = await tx.academicYear.findFirst({ where: { active: true } });
      const out: FamilyChild[] = [];
      for (const r of person.relationsAsParent) {
        const child = r.child;
        const sc = await tx.studentClass.findFirst({
          where: {
            studentId: child.id,
            unenrolledAt: null,
            ...(activeYear ? { class: { academicYearId: activeYear.id } } : {}),
          },
          include: { class: { select: { id: true, name: true } } },
        });

        let attendanceRate: number | null = null;
        let absences = 0;
        if (activeYear) {
          const att = await tx.attendanceRecord.findMany({
            where: {
              studentId: child.id,
              session: { date: { gte: activeYear.startDate, lte: activeYear.endDate } },
            },
            select: { status: true },
          });
          if (att.length > 0) {
            const present = att.filter((a) => a.status === 'PRESENT').length;
            attendanceRate = (present / att.length) * 100;
            absences = att.filter((a) => a.status === 'ABSENT' || a.status === 'LATE').length;
          }
        }

        const installments = await tx.installment.findMany({
          where: { studentId: child.id, status: { not: 'CANCELLED' } },
          include: { payments: true },
        });
        const due = installments.reduce((s, i) => s + Number(i.amount), 0);
        const paid = installments.reduce(
          (s, i) => s + i.payments.reduce((ps, p) => ps + Number(p.amount), 0),
          0,
        );

        out.push({
          id: child.id,
          firstName: child.firstName,
          lastName: child.lastName,
          relation: r.type,
          className: sc?.class.name ?? null,
          classId: sc?.class.id ?? null,
          attendanceRate,
          absences,
          installmentsDue: due,
          installmentsPaid: paid,
          installmentsRemaining: Math.max(0, due - paid),
        });
      }
      return out;
    });
  }

  // Accès portail parent : email du compte rattaché s'il existe déjà.
  let parentUserEmail: string | null = null;
  if (person.type === 'PARENT') {
    parentUserEmail = await withTenant(tenantId, async (tx) => {
      const up = await tx.userPerson.findFirst({
        where: { personId: id },
        include: { user: { select: { email: true } } },
      });
      return up?.user.email ?? null;
    });
  }

  // Accès portail enseignant : email du compte rattaché s'il existe déjà.
  let teacherUserEmail: string | null = null;
  if (person.type === 'TEACHER') {
    teacherUserEmail = await withTenant(tenantId, async (tx) => {
      const up = await tx.userPerson.findFirst({
        where: { personId: id },
        include: { user: { select: { email: true } } },
      });
      return up?.user.email ?? null;
    });
  }

  // Fratrie déduite : autres élèves ayant au moins un parent en commun.
  let siblings: { id: string; firstName: string; lastName: string }[] = [];
  if (person.type === 'STUDENT' && person.relationsAsChild.length > 0) {
    const parentIds = person.relationsAsChild.map((r) => r.parentId);
    siblings = await withTenant(tenantId, async (tx) => {
      const rels = await tx.personRelation.findMany({
        where: {
          parentId: { in: parentIds },
          childId: { not: person.id },
        },
        include: { child: true },
        distinct: ['childId'],
      });
      return rels.map((r) => ({
        id: r.child.id,
        firstName: r.child.firstName,
        lastName: r.child.lastName,
      }));
    });
  }

  // Documents officiels (élève) : années + périodes de l'année active.
  let documentYears: { id: string; label: string }[] = [];
  let documentPeriods: { id: string; label: string }[] = [];
  if (person.type === 'STUDENT') {
    const dd = await withTenant(tenantId, async (tx) => {
      const years = await tx.academicYear.findMany({ orderBy: { startDate: 'desc' } });
      const active = years.find((y) => y.active) ?? years[0];
      const periods = active
        ? await tx.period.findMany({
            where: { academicYearId: active.id },
            orderBy: { startDate: 'asc' },
          })
        : [];
      return {
        years: years.map((y) => ({ id: y.id, label: y.label })),
        periods: periods.map((p) => ({ id: p.id, label: p.label })),
      };
    });
    documentYears = dd.years;
    documentPeriods = dd.periods;
  }

  const contacts = (person.contacts ?? {}) as { email?: string; phone?: string; whatsapp?: string };
  const address = (person.address ?? {}) as {
    line1?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };

  // Breadcrumb dynamique : renvoie vers la liste filtrée selon le type.
  const backHref = `/${locale}/admin/persons?type=${person.type}`;
  const backLabel = t(`title.${person.type}` as never);

  const roleLabel = person.role
    ? locale === 'ar'
      ? person.role.labelAr
      : person.role.labelFr
    : null;

  const serviceLabel =
    person.type === 'STAFF' && person.service ? tForm(`services.${person.service}` as never) : null;

  const isEmployee = person.type === 'TEACHER' || person.type === 'STAFF';
  const contract = isEmployee
    ? computeContractStatus({
        hireDate: person.hireDate,
        contractEndDate: person.contractEndDate,
      })
    : null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={backHref} className="hover:text-brand-700">
          {backLabel}
        </Link>
        <span className="mx-1.5">›</span>
        <span>
          {person.lastName} {person.firstName}
        </span>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-xl bg-slate-200 text-2xl font-semibold text-slate-600">
            {(person.firstName[0] ?? '') + (person.lastName[0] ?? '')}
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {person.lastName} {person.firstName}
              {person.deletedAt && (
                <span className="ms-3 rounded bg-slate-200 px-2 py-0.5 align-middle text-xs text-slate-600">
                  {t('archived')}
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {tForm(`types.${person.type}` as never)}
              {roleLabel && ` · ${roleLabel}`}
              {serviceLabel && ` · ${serviceLabel}`}
              {person.birthDate &&
                ` · ${tDetail('bornOn', { date: new Date(person.birthDate).toLocaleDateString(locale) })}`}
            </p>
            {contract && contract.status !== 'NO_CONTRACT' && (
              <p className="mt-2">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${contractStatusBadgeClass(contract.status)}`}
                >
                  {tDetail(`contractStatus.${contract.status}` as never)}
                  {contract.daysToEnd !== null &&
                  contract.status !== 'EXPIRED' &&
                  contract.status !== 'ACTIVE'
                    ? ` (${tDetail('inDays', { days: contract.daysToEnd })})`
                    : ''}
                  {contract.status === 'EXPIRED' && contract.daysToEnd !== null
                    ? ` (${tDetail('daysAgo', { days: -contract.daysToEnd })})`
                    : ''}
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {person.type === 'STUDENT' && (
            <Link
              href={`/${locale}/admin/persons/${person.id}/finance`}
              className="border-brand-300 text-brand-700 hover:bg-brand-50 rounded-lg border bg-white px-3 py-1.5 text-sm font-medium"
            >
              {tDetail('finance')}
            </Link>
          )}
          {person.type === 'TEACHER' && (
            <>
              <Link
                href={`/${locale}/admin/persons/${person.id}/dashboard`}
                className="border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100 rounded-lg border px-3 py-1.5 text-sm font-medium"
              >
                📊 {tDetail('dashboard')}
              </Link>
              <Link
                href={`/${locale}/admin/persons/${person.id}/timetable`}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                {tDetail('timetable')}
              </Link>
            </>
          )}
          <PersonActions personId={person.id} isArchived={!!person.deletedAt} locale={locale} />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 md:col-span-2">
          <h2 className="text-sm font-semibold text-slate-700">{tDetail('contact')}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Email" value={contacts.email} />
            <Row label={tDetail('phone')} value={contacts.phone} />
            <Row label="WhatsApp" value={contacts.whatsapp} />
            <Row
              label={tDetail('address')}
              value={
                [address.line1, address.postalCode, address.city, address.country]
                  .filter(Boolean)
                  .join(', ') || undefined
              }
            />
            <Row label={tDetail('cin')} value={person.cin ?? undefined} />
            <Row label={tDetail('nationality')} value={person.nationality ?? undefined} />
          </dl>
        </section>

        <aside className="space-y-4">
          {person.type === 'STUDENT' && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">{tDetail('documents')}</h2>
              <DocumentsPanel
                hrefBase={`/api/admin/persons/${person.id}/document.pdf`}
                years={documentYears}
                periods={documentPeriods}
              />
            </section>
          )}

          {person.type === 'TEACHER' && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">
                {tDetail('portalAccessTeacher')}
              </h2>
              <TeacherAccess
                personId={person.id}
                defaultEmail={contacts.email ?? ''}
                existingEmail={teacherUserEmail}
              />
            </section>
          )}

          {isEmployee && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700">{tDetail('contract')}</h2>
              <dl className="mt-3 space-y-2 text-sm">
                {person.type === 'STAFF' && (
                  <Row
                    label={tForm('service')}
                    value={
                      person.service ? tForm(`services.${person.service}` as never) : undefined
                    }
                  />
                )}
                <Row
                  label={tDetail('contractType')}
                  value={
                    person.contractType
                      ? tForm(`contractTypes.${person.contractType}` as never)
                      : undefined
                  }
                />
                {person.type === 'TEACHER' && (
                  <Row
                    label={tDetail('contractualHoursPerWeek')}
                    value={
                      person.contractualHoursPerWeek !== null
                        ? `${person.contractualHoursPerWeek} h / sem`
                        : undefined
                    }
                  />
                )}
                <Row
                  label={tDetail('hireDate')}
                  value={
                    person.hireDate
                      ? new Date(person.hireDate).toLocaleDateString(locale)
                      : undefined
                  }
                />
                <Row
                  label={tDetail('contractEndDate')}
                  value={
                    person.contractEndDate
                      ? new Date(person.contractEndDate).toLocaleDateString(locale)
                      : undefined
                  }
                />
              </dl>
              {person.contractFile && (
                <a
                  href={`/api/admin/persons/${person.id}/contract/download`}
                  target="_blank"
                  rel="noopener"
                  className="border-brand-300 text-brand-700 hover:bg-brand-50 mt-3 inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-sm font-medium"
                >
                  📄 {person.contractFile.filename}
                </a>
              )}
            </section>
          )}

          {person.type === 'TEACHER' && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700">{tDetail('assignments')}</h2>
              {person.teacherAssignments.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">{tDetail('noAssignment')}</p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-sm">
                  {person.teacherAssignments.map((a) => (
                    <li key={a.id} className="rounded-lg border border-slate-100 px-3 py-1.5">
                      <span className="font-medium text-slate-900">{a.subject.label}</span>
                      <span className="ms-1.5 text-xs text-slate-500">
                        · {a.class.name} · {a.academicYear.label}
                        {a.hoursPerWeek ? ` · ${a.hoursPerWeek}h/sem` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href={`/${locale}/admin/persons/${person.id}/assignments`}
                className="text-brand-700 mt-3 inline-block text-xs font-medium hover:underline"
              >
                {tDetail('manageAssignments')} →
              </Link>
            </section>
          )}

          {person.type === 'TEACHER' && person.teacherSpecialties.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700">{tDetail('specialties')}</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {person.teacherSpecialties.map((s) => (
                  <span
                    key={s.id}
                    className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
                  >
                    {s.subject.label}
                  </span>
                ))}
              </div>
            </section>
          )}

          {person.type === 'TEACHER' && person.teacherCycles.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700">{tDetail('cyclesTaught')}</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {person.teacherCycles.map((c) => (
                  <span
                    key={c.id}
                    className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
                  >
                    {c.cycle.label}
                  </span>
                ))}
              </div>
            </section>
          )}

          {person.type === 'TEACHER' && person.teacherPriorityClasses.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700">{tDetail('priorityClasses')}</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {person.teacherPriorityClasses.map((p) => (
                  <span
                    key={p.id}
                    className="bg-brand-100 text-brand-700 rounded px-2 py-0.5 text-xs font-medium"
                  >
                    {p.class.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          {isEmployee && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700">{tDetail('hr')}</h2>
              <dl className="mt-3 space-y-2 text-sm">
                {person.hireDate && (
                  <Row
                    label={tDetail('seniority')}
                    value={`${Math.floor((Date.now() - new Date(person.hireDate).getTime()) / (365.25 * 86400e3))} ${tDetail('yearsSuffix')}`}
                  />
                )}
                <Row
                  label={tDetail('experienceYears')}
                  value={
                    person.experienceYears !== null
                      ? `${person.experienceYears} ${tDetail('yearsSuffix')}`
                      : undefined
                  }
                />
              </dl>
              {person.diplomas.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <span className="text-xs font-medium text-slate-700">{tDetail('diplomas')}</span>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {person.diplomas.map((d) => (
                      <li key={d.id}>
                        <span className="font-medium">{d.title}</span>
                        {d.institution && <span> · {d.institution}</span>}
                        {d.year && <span className="text-slate-400"> ({d.year})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {isEmployee && (person.rib || person.grossSalary !== null || person.payrollMethod) && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700">{tDetail('financial')}</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label={tDetail('bankName')} value={person.bankName ?? undefined} />
                <Row label={tDetail('rib')} value={person.rib ?? undefined} mono />
                <Row
                  label={tDetail('payrollMethod')}
                  value={
                    person.payrollMethod
                      ? tForm(`payrollMethods.${person.payrollMethod}` as never)
                      : undefined
                  }
                />
                <Row
                  label={tDetail('grossSalary')}
                  value={
                    person.grossSalary !== null
                      ? `${Number(person.grossSalary).toLocaleString(locale)} MAD`
                      : undefined
                  }
                />
                <Row
                  label={tDetail('netSalary')}
                  value={
                    person.netSalary !== null
                      ? `${Number(person.netSalary).toLocaleString(locale)} MAD`
                      : undefined
                  }
                />
              </dl>
              {Array.isArray(person.benefits) && person.benefits.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <span className="text-xs font-medium text-slate-700">{tDetail('benefits')}</span>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {(person.benefits as Array<{ label: string; amount: number }>).map((b, i) => (
                      <li key={i} className="flex justify-between">
                        <span>{b.label}</span>
                        <span className="font-medium">+{b.amount} MAD</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(person.deductions) && person.deductions.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <span className="text-xs font-medium text-slate-700">
                    {tDetail('deductions')}
                  </span>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {(
                      person.deductions as Array<{ label: string; amount: number; date?: string }>
                    ).map((d, i) => (
                      <li key={i} className="flex justify-between">
                        <span>
                          {d.label}
                          {d.date && <span className="text-slate-400"> · {d.date}</span>}
                        </span>
                        <span className="font-medium text-red-600">−{d.amount} MAD</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {attendanceSummary && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">
                  {tDetail('attendanceSummary')} —{' '}
                  <span className="text-slate-500 first-letter:uppercase">
                    {attendanceSummary.monthLabel}
                  </span>
                </h2>
                <Link
                  href={`/${locale}/admin/staff-attendance/${person.id}/monthly?month=${attendanceSummary.monthParam}`}
                  className="text-brand-700 text-xs font-medium hover:underline"
                >
                  {tDetail('viewMonth')} →
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                <MiniStat
                  label={tDetail('attendance.present')}
                  value={attendanceSummary.present}
                  color="emerald"
                />
                <MiniStat
                  label={tDetail('attendance.absent')}
                  value={attendanceSummary.absent}
                  color="red"
                />
                <MiniStat
                  label={tDetail('attendance.late')}
                  value={attendanceSummary.late}
                  color="amber"
                />
                <MiniStat
                  label={tDetail('attendance.excused')}
                  value={attendanceSummary.excused}
                  color="blue"
                />
                <MiniStat
                  label={tDetail('attendance.leave')}
                  value={attendanceSummary.leave}
                  color="slate"
                />
              </div>
              {attendanceSummary.deduction > 0 && (
                <div className="mt-3 flex items-center justify-between rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm">
                  <span className="text-red-800">{tDetail('autoDeductionLabel')}</span>
                  <span className="font-semibold tabular-nums text-red-700">
                    − {attendanceSummary.deduction.toFixed(2)} MAD
                  </span>
                </div>
              )}
            </section>
          )}

          {person.type === 'STUDENT' && enrollmentHistory.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">
                  {tDetail('enrollmentHistory.title')}
                </h2>
                <Link
                  href={`/${locale}/admin/enrollments/new?studentId=${person.id}`}
                  className="text-brand-700 text-xs font-medium hover:underline"
                >
                  + {tDetail('enrollmentHistory.newAction')}
                </Link>
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                {enrollmentHistory.map((e) => (
                  <li key={e.id} className="rounded-lg border border-slate-100 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={`/${locale}/admin/enrollments/${e.id}`}
                        className="hover:text-brand-700 font-medium text-slate-900 hover:underline"
                      >
                        {e.yearLabel}
                      </Link>
                      <EnrollmentBadge status={e.status} t={tDetail} />
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {e.levelLabel}
                      {e.className && e.classId && (
                        <>
                          {' · '}
                          <Link
                            href={`/${locale}/admin/classes/${e.classId}`}
                            className="hover:text-brand-700"
                          >
                            {e.className}
                          </Link>
                        </>
                      )}
                      {e.siblingRank && (
                        <>
                          {' · '}
                          {tDetail('enrollmentHistory.rank', { rank: e.siblingRank })}
                        </>
                      )}
                      {e.discountPct !== null && (
                        <>
                          {' · '}
                          <span className="text-emerald-700">−{e.discountPct}%</span>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {person.type === 'STUDENT' && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700">{tDetail('classes')}</h2>
              {person.studentClasses.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">{tDetail('noClass')}</p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-sm">
                  {person.studentClasses.map((sc) => (
                    <li key={sc.id} className="rounded-lg border border-slate-100 px-3 py-1.5">
                      <span className="font-medium text-slate-900">{sc.class.name}</span>
                      <span className="ms-1.5 text-xs text-slate-500">
                        ({sc.class.academicYear.label})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {person.type === 'STUDENT' && studentAttendance && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700">
                {tDetail('studentAttendance.title')}
              </h2>
              {studentAttendance.total === 0 ? (
                <p className="mt-2 text-xs text-slate-500">{tDetail('studentAttendance.empty')}</p>
              ) : (
                <>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      {tDetail('studentAttendance.rate')}
                    </span>
                    <span
                      className={`text-lg font-semibold tabular-nums ${
                        studentAttendance.rate !== null && studentAttendance.rate < 90
                          ? 'text-red-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {studentAttendance.rate !== null
                        ? `${studentAttendance.rate.toFixed(1)}%`
                        : '—'}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-1.5 text-xs">
                    <MiniStat
                      label={tDetail('attendance.present')}
                      value={studentAttendance.present}
                      color="emerald"
                    />
                    <MiniStat
                      label={tDetail('attendance.absent')}
                      value={studentAttendance.absent}
                      color="red"
                    />
                    <MiniStat
                      label={tDetail('attendance.late')}
                      value={studentAttendance.late}
                      color="amber"
                    />
                    <MiniStat
                      label={tDetail('attendance.excused')}
                      value={studentAttendance.excused}
                      color="blue"
                    />
                  </div>

                  {studentAttendance.recentAbsences.length > 0 && (
                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <span className="text-xs font-medium text-slate-700">
                        {tDetail('studentAttendance.recentAbsences')}
                      </span>
                      <ul className="mt-2 space-y-1.5 text-xs">
                        {studentAttendance.recentAbsences.map((a) => (
                          <li
                            key={a.id}
                            className="flex items-center justify-between rounded-lg border border-slate-100 px-2 py-1.5"
                          >
                            <span className="text-slate-700">
                              {new Date(a.date).toLocaleDateString(locale, {
                                day: '2-digit',
                                month: '2-digit',
                              })}{' '}
                              · <span className="text-slate-500">{a.className}</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                              <StudentAttBadge status={a.status} t={tDetail} />
                              {a.justificationStatus && (
                                <JustifBadge status={a.justificationStatus} t={tDetail} />
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {person.type === 'STUDENT' && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700">{tDetail('parents')}</h2>
              {person.relationsAsChild.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">{tDetail('noParent')}</p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-sm">
                  {person.relationsAsChild.map((r) => (
                    <li key={r.id} className="rounded-lg border border-slate-100 px-3 py-1.5">
                      <Link
                        href={`/${locale}/admin/persons/${r.parent.id}`}
                        className="hover:text-brand-700 font-medium text-slate-900"
                      >
                        {r.parent.lastName} {r.parent.firstName}
                      </Link>
                      <span className="ms-1.5 text-xs text-slate-500">
                        ({tDetail(`relations.${r.type}` as never)})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {person.type === 'STUDENT' && siblings.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700">{tDetail('siblings')}</h2>
              <ul className="mt-2 space-y-1.5 text-sm">
                {siblings.map((s) => (
                  <li key={s.id} className="rounded-lg border border-slate-100 px-3 py-1.5">
                    <Link
                      href={`/${locale}/admin/persons/${s.id}`}
                      className="hover:text-brand-700 font-medium text-slate-900"
                    >
                      {s.lastName} {s.firstName}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-slate-400">{tDetail('siblingsHint')}</p>
            </section>
          )}

          {person.type === 'PARENT' && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">
                {tDetail('portalAccess')}
              </h2>
              <ParentAccess
                personId={person.id}
                defaultEmail={contacts.email ?? ''}
                existingEmail={parentUserEmail}
              />
            </section>
          )}

          {person.type === 'PARENT' && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700">{tDetail('family.title')}</h2>
              {familyOverview.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">{tDetail('noChild')}</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {familyOverview.map((child) => (
                    <li key={child.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <Link
                            href={`/${locale}/admin/persons/${child.id}`}
                            className="hover:text-brand-700 font-medium text-slate-900 hover:underline"
                          >
                            {child.lastName} {child.firstName}
                          </Link>
                          <span className="ms-1.5 text-[10px] uppercase text-slate-400">
                            {tDetail(`relations.${child.relation}` as never)}
                          </span>
                        </div>
                        {child.className && child.classId && (
                          <Link
                            href={`/${locale}/admin/classes/${child.classId}`}
                            className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-200"
                          >
                            {child.className}
                          </Link>
                        )}
                      </div>

                      <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
                        <div className="rounded-lg border border-slate-100 px-2 py-1.5 text-center">
                          <div
                            className={`text-sm font-semibold tabular-nums ${
                              child.attendanceRate !== null && child.attendanceRate < 90
                                ? 'text-red-700'
                                : 'text-emerald-700'
                            }`}
                          >
                            {child.attendanceRate !== null
                              ? `${child.attendanceRate.toFixed(0)}%`
                              : '—'}
                          </div>
                          <div className="text-[10px] uppercase text-slate-500">
                            {tDetail('family.attendance')}
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-100 px-2 py-1.5 text-center">
                          <div
                            className={`text-sm font-semibold tabular-nums ${
                              child.absences > 0 ? 'text-red-700' : 'text-slate-600'
                            }`}
                          >
                            {child.absences}
                          </div>
                          <div className="text-[10px] uppercase text-slate-500">
                            {tDetail('family.absencesCount')}
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-100 px-2 py-1.5 text-center">
                          <div
                            className={`text-sm font-semibold tabular-nums ${
                              child.installmentsRemaining > 0
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                            }`}
                          >
                            {child.installmentsRemaining > 0
                              ? `${child.installmentsRemaining.toFixed(0)}`
                              : '✓'}
                          </div>
                          <div className="text-[10px] uppercase text-slate-500">
                            {child.installmentsRemaining > 0
                              ? tDetail('family.remaining')
                              : tDetail('family.upToDate')}
                          </div>
                        </div>
                      </div>

                      {child.installmentsDue > 0 && (
                        <div className="mt-2 text-[10px] text-slate-500">
                          {tDetail('family.paidOf', {
                            paid: child.installmentsPaid.toFixed(0),
                            due: child.installmentsDue.toFixed(0),
                          })}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-700">{tDetail('meta')}</h2>
            <dl className="mt-3 space-y-2 text-xs text-slate-600">
              <Row label="ID" value={person.id} mono />
              <Row
                label={tDetail('createdAt')}
                value={new Date(person.createdAt).toLocaleString(locale)}
              />
              <Row
                label={tDetail('updatedAt')}
                value={new Date(person.updatedAt).toLocaleString(locale)}
              />
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="flex gap-3">
      <dt className="w-32 shrink-0 text-slate-500">{label}</dt>
      <dd className={`flex-1 ${mono ? 'font-mono text-xs' : ''} text-slate-900`}>
        {value ?? <span className="text-slate-400">—</span>}
      </dd>
    </div>
  );
}

function EnrollmentBadge({
  status,
  t,
}: {
  status: 'DRAFT' | 'ACTIVE' | 'WITHDRAWN' | 'GRADUATED';
  t: (k: string) => string;
}) {
  const map = {
    DRAFT: 'bg-amber-100 text-amber-700',
    ACTIVE: 'bg-emerald-100 text-emerald-700',
    WITHDRAWN: 'bg-red-100 text-red-700',
    GRADUATED: 'bg-blue-100 text-blue-700',
  } as const;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${map[status]}`}>
      {t(`enrollmentHistory.status.${status}`)}
    </span>
  );
}

function StudentAttBadge({
  status,
  t,
}: {
  status: 'ABSENT' | 'LATE' | 'EXCUSED';
  t: (k: string) => string;
}) {
  const map = {
    ABSENT: 'bg-red-100 text-red-700',
    LATE: 'bg-amber-100 text-amber-700',
    EXCUSED: 'bg-blue-100 text-blue-700',
  } as const;
  const labelMap = {
    ABSENT: 'attendance.absent',
    LATE: 'attendance.late',
    EXCUSED: 'attendance.excused',
  } as const;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${map[status]}`}>
      {t(labelMap[status])}
    </span>
  );
}

function JustifBadge({
  status,
  t,
}: {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  t: (k: string) => string;
}) {
  const map = {
    PENDING: 'bg-amber-100 text-amber-800 border-amber-300',
    APPROVED: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    REJECTED: 'bg-red-100 text-red-800 border-red-300',
  } as const;
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${map[status]}`}
      title={t(`studentAttendance.justif.${status}`)}
    >
      {status === 'PENDING' ? '?' : status === 'APPROVED' ? '✓' : '✕'}
    </span>
  );
}

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'emerald' | 'red' | 'amber' | 'blue' | 'slate';
}) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-700',
    red: 'text-red-700',
    amber: 'text-amber-700',
    blue: 'text-blue-700',
    slate: 'text-slate-600',
  };
  return (
    <div className="rounded-lg border border-slate-100 px-2 py-1.5 text-center">
      <div className={`text-lg font-semibold tabular-nums ${colors[color]}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
