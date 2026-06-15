import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { PersonForm } from '../person-form';

export default async function NewPersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ type?: string; admission?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations('admin.persons');

  const defaultType = (['STUDENT', 'TEACHER', 'STAFF', 'PARENT'] as const).includes(
    sp.type as never,
  )
    ? (sp.type as 'STUDENT' | 'TEACHER' | 'STAFF' | 'PARENT')
    : 'STUDENT';

  const session = (await auth())!;
  const {
    roles,
    availableParents,
    allSubjects,
    allCycles,
    allClasses,
    rooms,
    activeYearId,
    levels,
    years,
  } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const activeYear = await tx.academicYear.findFirst({
        where: { active: true },
        select: { id: true },
      });
      const [roles, availableParents, allSubjects, allCycles, classes, roomList] = await Promise.all([
        tx.personRole.findMany({
          where: { active: true },
          orderBy: [{ appliesTo: 'asc' }, { order: 'asc' }, { labelFr: 'asc' }],
        }),
        tx.person.findMany({
          where: { type: 'PARENT', deletedAt: null },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          select: {
            id: true,
            firstName: true,
            lastName: true,
            address: true,
            relationsAsParent: {
              select: {
                child: {
                  select: {
                    firstName: true,
                    lastName: true,
                    studentClasses: {
                      where: { unenrolledAt: null },
                      select: { class: { select: { name: true } } },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        }),
        tx.subject.findMany({ orderBy: [{ order: 'asc' }, { label: 'asc' }] }),
        tx.cycle.findMany({ orderBy: { order: 'asc' } }),
        tx.class.findMany({
          where: { deletedAt: null, ...(activeYear ? { academicYearId: activeYear.id } : {}) },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        }),
        tx.room.findMany({ orderBy: { code: 'asc' } }),
      ]);
      const [levels, years] = await Promise.all([
        tx.level.findMany({
          include: { cycle: true },
          orderBy: [{ cycle: { order: 'asc' } }, { order: 'asc' }],
        }),
        tx.academicYear.findMany({ orderBy: [{ active: 'desc' }, { startDate: 'desc' }] }),
      ]);
      return {
        roles,
        availableParents: availableParents.map((p) => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          address: (p.address ?? null) as {
            line1?: string;
            city?: string;
            postalCode?: string;
            country?: string;
          } | null,
          children: p.relationsAsParent.map((r) => ({
            firstName: r.child.firstName,
            lastName: r.child.lastName,
            className: r.child.studentClasses[0]?.class.name ?? null,
          })),
        })),
        allSubjects,
        allCycles,
        allClasses: classes,
        rooms: roomList.map((r) => ({ id: r.id, label: `${r.code} — ${r.label}` })),
        activeYearId: activeYear?.id ?? years.find((y) => y.active)?.id ?? years[0]?.id ?? null,
        levels: levels.map((l) => ({ id: l.id, label: `${l.cycle.label} — ${l.label}` })),
        years: years.map((y) => ({ id: y.id, label: y.label })),
      };
    },
  );
  const isAdmission = sp.admission === '1' && defaultType === 'STUDENT';

  const backHref = `/${locale}/admin/persons?type=${defaultType}`;
  const backLabel = t(`title.${defaultType}` as never);
  const newKey = {
    STUDENT: 'newStudent',
    TEACHER: 'newTeacher',
    STAFF: 'newStaff',
    PARENT: 'newParent',
  }[defaultType];
  const newLabel = isAdmission ? t('actions.newAdmission') : t(`actions.${newKey}` as never);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={backHref} className="hover:text-brand-700">
          {backLabel}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{newLabel}</span>
      </nav>

      <h1 className="text-2xl font-semibold text-slate-900">{newLabel}</h1>
      <p className="mt-1 text-sm text-slate-500">{t('newSubtitle')}</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <PersonForm
          mode="create"
          locale={locale}
          lockType={defaultType === 'STUDENT'}
          admission={
            isAdmission && activeYearId
              ? { years, defaultYearId: activeYearId, levels }
              : undefined
          }
          initial={{ type: defaultType }}
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
          rooms={rooms}
        />
      </div>
    </div>
  );
}
