import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import type { Prisma } from '@/lib/db';
import { Pagination } from '@/components/pagination';

const PAGE_SIZE = 20;
const VALID_TYPES = ['STUDENT', 'TEACHER', 'STAFF', 'PARENT'] as const;
type PersonTypeLiteral = (typeof VALID_TYPES)[number];

function isPersonType(value: string | undefined): value is PersonTypeLiteral {
  return !!value && (VALID_TYPES as readonly string[]).includes(value);
}

export default async function PersonsListPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    type?: string;
    search?: string;
    page?: string;
    archived?: string;
    service?: string;
    cycle?: string;
    level?: string;
    classId?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const session = (await auth())!;
  const tenantId = session.user.tenantId;
  const t = await getTranslations('admin.persons');
  const tForm = await getTranslations('admin.persons.form');

  const typeFilter = isPersonType(sp.type) ? sp.type : undefined;
  const search = sp.search?.trim() ?? '';
  const showArchived = sp.archived === '1';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const isTeacherView = typeFilter === 'TEACHER';
  const isStudentView = typeFilter === 'STUDENT';
  // Le filtre service ne s'applique qu'au personnel (STAFF) ; valeur = serviceId.
  const requestedService = typeFilter === 'STAFF' ? (sp.service ?? '') : '';
  // Filtres scolarité (vue Élèves) : cycle / niveau / classe.
  const cycleFilter = isStudentView ? sp.cycle || '' : '';
  const levelFilter = isStudentView ? sp.level || '' : '';
  const classFilter = isStudentView ? sp.classId || '' : '';

  type StudentRow = {
    className: string | null;
    mainTeacher: string | null;
    father: string | null;
    mother: string | null;
  };
  const {
    persons,
    total,
    teacherExtras,
    studentExtras,
    services,
    serviceFilter,
    cycles,
    levels,
    classOptions,
  } = await withTenant(
    tenantId,
    async (tx) => {
      const services = await tx.service.findMany({
        where: { active: true },
        orderBy: [{ order: 'asc' }, { labelFr: 'asc' }],
        select: { id: true, labelFr: true, labelAr: true },
      });
      const serviceFilter = services.some((s) => s.id === requestedService)
        ? requestedService
        : undefined;

      const where: Prisma.PersonWhereInput = {
        deletedAt: showArchived ? { not: null } : null,
        ...(typeFilter ? { type: typeFilter } : {}),
        ...(serviceFilter ? { serviceId: serviceFilter } : {}),
        // Le menu Élèves ne montre que les élèves réellement inscrits (affectés
        // à une classe). Les candidats encore dans le pipeline d'admission sont
        // masqués ici — ils vivent dans /admin/enrollments.
        ...(typeFilter === 'STUDENT' && !showArchived
          ? {
              studentClasses: {
                some: {
                  unenrolledAt: null,
                  class: {
                    ...(classFilter ? { id: classFilter } : {}),
                    ...(levelFilter ? { levelId: levelFilter } : {}),
                    ...(cycleFilter ? { level: { cycleId: cycleFilter } } : {}),
                  },
                },
              },
            }
          : {}),
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { cin: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };

      const [persons, total] = await Promise.all([
        tx.person.findMany({
          where,
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          include: { serviceRef: { select: { labelFr: true, labelAr: true } } },
        }),
        tx.person.count({ where }),
      ]);

    // Vue Enseignants : spécialités, classes d'affectation (année active).
    const teacherExtras = new Map<string, { specialties: string[]; classes: string[] }>();
    if (isTeacherView && persons.length > 0) {
      const ids = persons.map((p) => p.id);
      const activeYear = await tx.academicYear.findFirst({
        where: { active: true },
        select: { id: true },
      });
      // Classes = union des affectations ET de l'EDT généré (ce dernier survit
      // à une réinitialisation des affectations) → cohérent avec le portail prof.
      const [specs, asgs, entries] = await Promise.all([
        tx.teacherSpecialty.findMany({
          where: { teacherId: { in: ids } },
          select: { teacherId: true, subject: { select: { label: true } } },
        }),
        activeYear
          ? tx.teacherAssignment.findMany({
              where: { teacherId: { in: ids }, academicYearId: activeYear.id },
              select: { teacherId: true, class: { select: { name: true } } },
            })
          : Promise.resolve([]),
        activeYear
          ? tx.timetableEntry.findMany({
              where: { teacherId: { in: ids }, academicYearId: activeYear.id },
              select: { teacherId: true, class: { select: { name: true } } },
            })
          : Promise.resolve([]),
      ]);
      const specByT = new Map<string, Set<string>>();
      for (const s of specs) {
        if (!specByT.has(s.teacherId)) specByT.set(s.teacherId, new Set());
        specByT.get(s.teacherId)!.add(s.subject.label);
      }
      const clsByT = new Map<string, Set<string>>();
      for (const a of [...asgs, ...entries]) {
        if (a.teacherId === null) continue;
        if (!clsByT.has(a.teacherId)) clsByT.set(a.teacherId, new Set());
        clsByT.get(a.teacherId)!.add(a.class.name);
      }
      for (const p of persons) {
        teacherExtras.set(p.id, {
          specialties: [...(specByT.get(p.id) ?? [])].sort((a, b) => a.localeCompare(b)),
          classes: [...(clsByT.get(p.id) ?? [])].sort((a, b) => a.localeCompare(b)),
        });
      }
    }

      // Vue Élèves : classe + prof principal (année active) + contacts parents.
      const studentExtras = new Map<string, StudentRow>();
      if (isStudentView && persons.length > 0) {
        const ids = persons.map((p) => p.id);
        const activeYear = await tx.academicYear.findFirst({
          where: { active: true },
          select: { id: true },
        });
        const [enr, rel] = await Promise.all([
          tx.studentClass.findMany({
            where: {
              studentId: { in: ids },
              unenrolledAt: null,
              ...(activeYear ? { class: { academicYearId: activeYear.id } } : {}),
            },
            select: {
              studentId: true,
              class: {
                select: { name: true, mainTeacher: { select: { firstName: true, lastName: true } } },
              },
            },
          }),
          tx.personRelation.findMany({
            where: { childId: { in: ids } },
            select: {
              childId: true,
              type: true,
              parent: { select: { firstName: true, lastName: true, contacts: true } },
            },
          }),
        ]);
        for (const id of ids)
          studentExtras.set(id, { className: null, mainTeacher: null, father: null, mother: null });
        for (const e of enr) {
          const s = studentExtras.get(e.studentId);
          if (!s) continue;
          s.className = e.class.name;
          s.mainTeacher = e.class.mainTeacher
            ? `${e.class.mainTeacher.lastName} ${e.class.mainTeacher.firstName}`
            : null;
        }
        for (const r of rel) {
          const s = studentExtras.get(r.childId);
          if (!s) continue;
          const c = r.parent.contacts as { phone?: string; email?: string } | null;
          const contact = c?.phone ?? c?.email ?? null;
          const label = `${r.parent.lastName} ${r.parent.firstName}${contact ? ` · ${contact}` : ''}`;
          if (r.type === 'FATHER' && !s.father) s.father = label;
          else if (r.type === 'MOTHER' && !s.mother) s.mother = label;
        }
      }

      // Options des filtres scolarité (vue Élèves).
      let cycles: { id: string; label: string }[] = [];
      let levels: { id: string; cycleId: string; label: string }[] = [];
      let classOptions: { id: string; levelId: string; name: string }[] = [];
      if (typeFilter === 'STUDENT') {
        const activeYear = await tx.academicYear.findFirst({
          where: { active: true },
          select: { id: true },
        });
        const [cyc, lvl, cls] = await Promise.all([
          tx.cycle.findMany({ orderBy: { order: 'asc' }, select: { id: true, label: true } }),
          tx.level.findMany({
            orderBy: { order: 'asc' },
            select: { id: true, cycleId: true, label: true },
          }),
          tx.class.findMany({
            where: { deletedAt: null, ...(activeYear ? { academicYearId: activeYear.id } : {}) },
            orderBy: { name: 'asc' },
            select: { id: true, levelId: true, name: true },
          }),
        ]);
        cycles = cyc;
        levels = lvl;
        classOptions = cls;
      }

      return {
        persons,
        total,
        teacherExtras,
        studentExtras,
        services,
        serviceFilter,
        cycles,
        levels,
        classOptions,
      };
    },
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const baseHref = `/${locale}/admin/persons`;
  const qs = (overrides: Record<string, string | undefined>) => {
    const usp = new URLSearchParams();
    if (typeFilter && overrides.type === undefined) usp.set('type', typeFilter);
    if (overrides.type) usp.set('type', overrides.type);
    if (serviceFilter && overrides.service === undefined) usp.set('service', serviceFilter);
    if (overrides.service) usp.set('service', overrides.service);
    if (search && overrides.search === undefined) usp.set('search', search);
    if (overrides.search) usp.set('search', overrides.search);
    if (showArchived && overrides.archived === undefined) usp.set('archived', '1');
    if (overrides.archived) usp.set('archived', overrides.archived);
    if (cycleFilter && overrides.cycle === undefined) usp.set('cycle', cycleFilter);
    if (overrides.cycle) usp.set('cycle', overrides.cycle);
    if (levelFilter && overrides.level === undefined) usp.set('level', levelFilter);
    if (overrides.level) usp.set('level', overrides.level);
    if (classFilter && overrides.classId === undefined) usp.set('classId', classFilter);
    if (overrides.classId) usp.set('classId', overrides.classId);
    if (overrides.page) usp.set('page', overrides.page);
    const s = usp.toString();
    return s ? `${baseHref}?${s}` : baseHref;
  };

  const title = typeFilter ? t(`title.${typeFilter}`) : t('title.ALL');
  const newKey = typeFilter
    ? { STUDENT: 'newStudent', TEACHER: 'newTeacher', STAFF: 'newStaff', PARENT: 'newParent' }[
        typeFilter
      ]
    : 'new';
  const newLabel = t(`actions.${newKey}` as never);

  return (
    <div className="px-3 py-3">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-3xl bg-gradient-to-r from-brand-100 to-brand-50 px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{title}</h1>
          <p className="mt-0.5 text-sm text-slate-600">{t('count', { count: total })}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`${baseHref}/import`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t('actions.import')}
          </Link>
          {/* Les élèves entrent par l'inscription (menu Inscriptions), pas par
              une création directe. La création directe reste possible via
              l'import CSV pour les reprises de données. */}
          {!isStudentView && (
            <Link
              href={`${baseHref}/new${typeFilter ? `?type=${typeFilter}` : ''}`}
              className="bg-brand-600 hover:bg-brand-700 rounded-lg px-4 py-2 text-sm font-medium text-white shadow"
            >
              {newLabel}
            </Link>
          )}
        </div>
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        {typeFilter && <input type="hidden" name="type" value={typeFilter} />}
        {showArchived && <input type="hidden" name="archived" value="1" />}
        <div className="min-w-[200px] flex-1">
          <label htmlFor="search" className="block text-xs font-medium text-slate-600">
            {t('filters.search')}
          </label>
          <input
            type="search"
            id="search"
            name="search"
            defaultValue={search}
            placeholder={t('filters.searchPlaceholder')}
            className="focus:border-brand-500 focus:ring-brand-500 mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1"
          />
        </div>
        {typeFilter === 'STAFF' && (
          <div className="min-w-[180px]">
            <label htmlFor="service" className="block text-xs font-medium text-slate-600">
              {tForm('service')}
            </label>
            <select
              id="service"
              name="service"
              defaultValue={serviceFilter ?? ''}
              className="focus:border-brand-500 focus:ring-brand-500 mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1"
            >
              <option value="">{t('filters.allServices')}</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {locale === 'ar' ? s.labelAr : s.labelFr}
                </option>
              ))}
            </select>
          </div>
        )}
        {isStudentView && (
          <>
            <div className="min-w-[140px]">
              <label className="block text-xs font-medium text-slate-600">{t('filters.cycle')}</label>
              <select
                name="cycle"
                defaultValue={cycleFilter}
                className="focus:border-brand-500 focus:ring-brand-500 mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1"
              >
                <option value="">{t('filters.allCycles')}</option>
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[140px]">
              <label className="block text-xs font-medium text-slate-600">{t('filters.level')}</label>
              <select
                name="level"
                defaultValue={levelFilter}
                className="focus:border-brand-500 focus:ring-brand-500 mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1"
              >
                <option value="">{t('filters.allLevels')}</option>
                {levels
                  .filter((l) => !cycleFilter || l.cycleId === cycleFilter)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
              </select>
            </div>
            <div className="min-w-[140px]">
              <label className="block text-xs font-medium text-slate-600">{t('filters.class')}</label>
              <select
                name="classId"
                defaultValue={classFilter}
                className="focus:border-brand-500 focus:ring-brand-500 mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1"
              >
                <option value="">{t('filters.allClasses')}</option>
                {classOptions
                  .filter((c) => !levelFilter || c.levelId === levelFilter)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          </>
        )}
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          {t('filters.apply')}
        </button>
        <Link
          href={qs({ search: '', archived: showArchived ? '0' : '1' })}
          className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
        >
          {showArchived ? t('filters.showActive') : t('filters.showArchived')}
        </Link>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {isStudentView && <th className="px-4 py-3 text-start">{t('table.photo')}</th>}
              <th className="px-4 py-3 text-start">{t('table.name')}</th>
              {isStudentView ? (
                <>
                  <th className="px-4 py-3 text-start">{t('table.contact')}</th>
                  <th className="px-4 py-3 text-start">{t('table.studentClass')}</th>
                  <th className="px-4 py-3 text-start">{t('table.mainTeacher')}</th>
                </>
              ) : isTeacherView ? (
                <>
                  <th className="px-4 py-3 text-start">{t('table.specialties')}</th>
                  <th className="px-4 py-3 text-end">{t('table.weeklyHours')}</th>
                  <th className="px-4 py-3 text-start">{t('table.classes')}</th>
                </>
              ) : (
                <>
                  <th className="px-4 py-3 text-start">{t('table.type')}</th>
                  <th className="px-4 py-3 text-start">{t('table.contact')}</th>
                  <th className="px-4 py-3 text-start">{t('table.birthDate')}</th>
                </>
              )}
              <th className="px-4 py-3 text-end">{t('table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {persons.map((p) => {
              const contacts = (p.contacts ?? {}) as { email?: string; phone?: string };
              return (
                <tr key={p.id} className={p.deletedAt ? 'bg-slate-50/60 text-slate-500' : ''}>
                  {isStudentView && (
                    <td className="px-4 py-3">
                      {p.photoFileId ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/admin/persons/${p.id}/photo`}
                          alt=""
                          className="h-9 w-9 rounded-full object-cover"
                        />
                      ) : (
                        <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                          {(p.lastName?.[0] ?? '').toUpperCase()}
                          {(p.firstName?.[0] ?? '').toUpperCase()}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <Link
                      href={`${baseHref}/${p.id}`}
                      className="hover:text-brand-700 font-medium text-slate-900 hover:underline"
                    >
                      {p.lastName} {p.firstName}
                    </Link>
                    {p.deletedAt && (
                      <span className="ms-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
                        {t('archived')}
                      </span>
                    )}
                  </td>
                  {isStudentView ? (
                    (() => {
                      const s = studentExtras.get(p.id);
                      return (
                        <>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            <div>
                              {t('table.father')} : {s?.father ?? '—'}
                            </div>
                            <div>
                              {t('table.mother')} : {s?.mother ?? '—'}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">{s?.className ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {s?.mainTeacher ?? '—'}
                          </td>
                        </>
                      );
                    })()
                  ) : isTeacherView ? (
                    (() => {
                      const extra = teacherExtras.get(p.id);
                      return (
                        <>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {extra && extra.specialties.length > 0
                              ? extra.specialties.join(', ')
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-end text-xs tabular-nums text-slate-600">
                            {p.contractualHoursPerWeek ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {extra && extra.classes.length > 0 ? extra.classes.join(' - ') : ''}
                          </td>
                        </>
                      );
                    })()
                  ) : (
                    <>
                      <td className="px-4 py-3">
                        <TypeBadge type={p.type} />
                        {p.type === 'STAFF' && p.serviceRef && (
                          <span className="ms-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                            {locale === 'ar' ? p.serviceRef.labelAr : p.serviceRef.labelFr}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {contacts.email ?? contacts.phone ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {p.birthDate ? new Date(p.birthDate).toLocaleDateString(locale) : '—'}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3 text-end">
                    <Link
                      href={`${baseHref}/${p.id}`}
                      className="hover:text-brand-700 text-xs text-slate-500"
                    >
                      {t('actions.view')}
                    </Link>
                  </td>
                </tr>
              );
            })}
            {persons.length === 0 && (
              <tr>
                <td colSpan={isStudentView ? 6 : 5} className="px-4 py-10 text-center text-slate-500">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} hrefFor={(p) => qs({ page: String(p) })} />
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    STUDENT: 'bg-blue-100 text-blue-700',
    TEACHER: 'bg-purple-100 text-purple-700',
    STAFF: 'bg-amber-100 text-amber-700',
    PARENT: 'bg-emerald-100 text-emerald-700',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${styles[type] ?? 'bg-slate-100'}`}>
      {type}
    </span>
  );
}
