import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { PersonForm } from '../person-form';
import { localizedLabel } from '@/lib/localized-name';

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
            // État civil arabe : repris tel quel dans l'onglet « Données en
            // arabe », un parent rattaché en français l'étant aussi en arabe.
            firstNameAr: true,
            lastNameAr: true,
            address: true,
            relationsAsParent: {
              // Fratrie = tous les élèves rattachés, quel que soit leur statut :
              // le statut est affiché en face de chacun (actif, retiré…), ce qui
              // vaut mieux que de masquer silencieusement un frère radié.
              where: { child: { type: 'STUDENT', deletedAt: null } },
              select: {
                child: {
                  select: {
                    firstName: true,
                    lastName: true,
                    studentClasses: {
                      where: { unenrolledAt: null },
                      select: { class: { select: { name: true, nameAr: true } } },
                      take: 1,
                    },
                    // Dossier le plus récent = statut courant de l'élève.
                    enrollments: {
                      orderBy: { academicYear: { startDate: 'desc' } },
                      select: { status: true },
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
          select: { id: true, name: true, nameAr: true },
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
          firstNameAr: p.firstNameAr,
          lastNameAr: p.lastNameAr,
          address: (p.address ?? null) as {
            line1?: string;
            city?: string;
            postalCode?: string;
            country?: string;
          } | null,
          children: p.relationsAsParent.map((r) => ({
            firstName: r.child.firstName,
            lastName: r.child.lastName,
            className: localizedLabel(locale, r.child.studentClasses[0]?.class.name, r.child.studentClasses[0]?.class.nameAr) ?? null,
            status: r.child.enrollments[0]?.status ?? null,
          })),
        })),
        allSubjects,
        allCycles,
        allClasses: classes,
        rooms: roomList.map((r) => ({ id: r.id, label: `${r.code} — ${r.label}` })),
        activeYearId: activeYear?.id ?? years.find((y) => y.active)?.id ?? years[0]?.id ?? null,
        // labelAr : c'est ce libellé qui part vers MASAR, affiché tel quel
        // dans l'onglet « Données en arabe ».
        levels: levels.map((l) => ({
          id: l.id,
          label: `${localizedLabel(locale, l.cycle.label, l.cycle.labelAr)} — ${localizedLabel(locale, l.label, l.labelAr)}`,
          labelAr: l.labelAr,
        })),
        years: years.map((y) => ({ id: y.id, label: y.label })),
      };
    },
  );
  const isAdmission = sp.admission === '1' && defaultType === 'STUDENT';
  const tNav = await getTranslations('admin.nav');

  // Fil d'Ariane : une inscription vient du menu « Inscriptions », pas de « Élèves ».
  const backHref = isAdmission
    ? `/${locale}/admin/enrollments`
    : `/${locale}/admin/persons?type=${defaultType}`;
  const backLabel = isAdmission ? tNav('enrollments') : t(`title.${defaultType}` as never);
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

      <div className="mb-4 -mx-6 overflow-hidden rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-3">
        <h1 className="text-2xl font-semibold text-slate-900">{newLabel}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('newSubtitle')}</p>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <PersonForm
          mode="create"
          locale={locale}
          lockType
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
          allClasses={allClasses.map((c) => ({ id: c.id, label: localizedLabel(locale, c.name, c.nameAr) }))}
          rooms={rooms}
        />
      </div>
    </div>
  );
}
