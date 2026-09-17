import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import type { Prisma } from '@/lib/db';
import { Pagination } from '@/components/pagination';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';
import { yearInstallmentEnd } from '@/lib/school-year';
import { SchoolFilters } from './school-filters';
import {
  TeacherDetailPanel,
  TeacherDetailEmpty,
  type TeacherDetail,
} from './teacher-detail';
import { StaffDetailPanel, StaffDetailEmpty, type StaffDetail } from './staff-detail';
import { hrFileStatus, hrFileLabel, dayStatus, contractLabel } from '@/lib/hr-file';
import { ParentDetailPanel, ParentDetailEmpty, type ParentDetail } from './parent-detail';
import {
  isReachable,
  missingContacts,
  familyFinancialStatus,
  financialLabel,
  parentKpis,
  type FinancialStatus,
} from '@/lib/parent-file';
import {
  StudentDetailPanel,
  StudentDetailEmpty,
  type StudentDetail,
} from './student-detail';
import { loadStudentDetail } from '@/lib/student-detail';
import { KpiCard } from '@/components/kpi-card';

const PAGE_SIZE = 20;
const VALID_TYPES = ['STUDENT', 'TEACHER', 'STAFF', 'PARENT'] as const;
// Statuts d'inscription pour lesquels on dispose d'un libellé dédié (colonne Statut).
const STUDENT_STATUSES = ['ACTIVE', 'WITHDRAWN', 'AFFECTE', 'INSCRIPTION_VALIDEE', 'GRADUATED'];
/** Statuts d'emploi (TEACHER/STAFF) — colonne `Person.employmentStatus`. */
const EMPLOYMENT_STATUSES = ['ACTIVE', 'SUSPENDED', 'RESIGNED', 'CONTRACT_END'] as const;
const EMPLOYMENT_BADGE: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  SUSPENDED: 'bg-amber-100 text-amber-800',
  RESIGNED: 'bg-slate-200 text-slate-700',
  CONTRACT_END: 'bg-red-100 text-red-800',
};

/**
 * Statut du jour d'un agent.
 *
 * « Non pointé » se distingue de « absent » : sur un établissement qui pointe
 * en fin de matinée, tout le monde serait déclaré absent au réveil.
 */
function DayBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const tone: Record<string, string> = {
    PRESENT: 'bg-emerald-100 text-emerald-800',
    ABSENT: 'bg-red-100 text-red-800',
    LATE: 'bg-amber-100 text-amber-800',
    LEAVE: 'bg-sky-100 text-sky-800',
    EXCUSED: 'bg-slate-200 text-slate-700',
    NOT_RECORDED: 'bg-slate-100 text-slate-500',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone[status] ?? tone.NOT_RECORDED}`}>
      {t(status)}
    </span>
  );
}

/** Onglet de filtrage rapide (cycle, statut) au-dessus du tableau. */
function CycleTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-brand-600 text-white'
          : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {label}
    </Link>
  );
}

function EmploymentBadge({ status, label }: { status: string | null; label: string }) {
  if (!status) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${EMPLOYMENT_BADGE[status] ?? 'bg-slate-100 text-slate-700'}`}>
      {label}
    </span>
  );
}
type PersonTypeLiteral = (typeof VALID_TYPES)[number];

function isPersonType(value: string | undefined): value is PersonTypeLiteral {
  return !!value && (VALID_TYPES as readonly string[]).includes(value);
}

/**
 * Fiche de l'enseignant ouvert dans le panneau latéral.
 *
 * Requête large mais sur UN professeur : on peut se permettre d'aller chercher
 * les spécialités, les classes de l'année et le pointage du mois sans peser
 * sur la liste.
 */
async function loadTeacherDetail(
  tx: Prisma.TransactionClient,
  id: string,
  locale: string,
  activeYearId: string | null,
): Promise<TeacherDetail | null> {
  const person = await tx.person.findFirst({
    where: { id, type: 'TEACHER' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      firstNameAr: true,
      lastNameAr: true,
      massarId: true,
      birthDate: true,
      gender: true,
      address: true,
      contacts: true,
      photoFileId: true,
      employmentStatus: true,
      hireDate: true,
      teacherCycles: { select: { cycle: { select: { label: true, labelAr: true } } } },
      teacherSpecialties: { select: { subject: { select: { label: true, labelAr: true } } } },
    },
  });
  if (!person) return null;

  // Le mois en cours : c'est la fenêtre sur laquelle on juge l'assiduité d'un
  // agent. Un cumul annuel dirait autre chose et se lit ailleurs.
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [assignments, entries, attendance] = await Promise.all([
    activeYearId
      ? tx.teacherAssignment.findMany({
          where: { teacherId: id, academicYearId: activeYearId },
          select: {
            class: {
              select: {
                name: true,
                nameAr: true,
                level: { select: { label: true, labelAr: true, order: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    // L'emploi du temps généré survit à une réinitialisation des affectations :
    // sans lui, un professeur en poste apparaîtrait sans aucun niveau.
    activeYearId
      ? tx.timetableEntry.findMany({
          where: { teacherId: id, academicYearId: activeYearId },
          select: {
            class: {
              select: {
                name: true,
                nameAr: true,
                level: { select: { label: true, labelAr: true, order: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    tx.staffAttendance.findMany({
      where: { personId: id, date: { gte: monthStart, lt: monthEnd } },
      select: { status: true, lateMinutes: true },
    }),
  ]);

  const levels = new Map<string, number>();
  const classes = new Set<string>();
  for (const a of [...assignments, ...entries]) {
    classes.add(localizedLabel(locale, a.class.name, a.class.nameAr));
    levels.set(
      localizedLabel(locale, a.class.level.label, a.class.level.labelAr),
      a.class.level.order,
    );
  }

  const contacts = (person.contacts ?? {}) as { phone?: string; email?: string };
  const addr = (person.address ?? {}) as { street?: string; city?: string };

  const count = (st: string) => attendance.filter((a) => a.status === st).length;

  return {
    id: person.id,
    name: personDisplayName(locale, person),
    matricule: person.massarId,
    birthDate: person.birthDate,
    gender: person.gender,
    phone: contacts.phone ?? null,
    email: contacts.email ?? null,
    address: [addr.street, addr.city].filter(Boolean).join(', ') || null,
    photo: Boolean(person.photoFileId),
    employmentStatus: person.employmentStatus,
    hiredAt: person.hireDate,
    cycles: person.teacherCycles.map((c) =>
      localizedLabel(locale, c.cycle.label, c.cycle.labelAr),
    ),
    specialties: person.teacherSpecialties
      .map((sp) => localizedLabel(locale, sp.subject.label, sp.subject.labelAr))
      .sort((a, b) => a.localeCompare(b, locale)),
    levels: [...levels.entries()].sort((a, b) => a[1] - b[1]).map(([label]) => label),
    classes: [...classes].sort((a, b) => a.localeCompare(b, locale)),
    attendance: {
      monthLabel: monthStart.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
      present: count('PRESENT'),
      absent: count('ABSENT'),
      late: count('LATE'),
      leave: count('LEAVE'),
      lateMinutes: attendance.reduce((n, a) => n + (a.lateMinutes ?? 0), 0),
      recorded: attendance.length,
    },
  };
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
    /** Élève ouvert dans le panneau de détail (vue Élèves). */
    selected?: string;
    archived?: string;
    service?: string;
    // Filtres multi-valeurs : le formulaire émet une occurrence par case
    // cochée, Next les remonte donc en tableau dès la deuxième.
    cycle?: string | string[];
    level?: string | string[];
    status?: string | string[];
    classId?: string | string[];
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
  /** Élève ouvert dans le panneau latéral (vue Élèves). */
  const selected = sp.selected ?? '';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const isTeacherView = typeFilter === 'TEACHER';
  const isStudentView = typeFilter === 'STUDENT';
  // Le filtre service ne s'applique qu'au personnel (STAFF) ; valeur = serviceId.
  const requestedService = typeFilter === 'STAFF' ? (sp.service ?? '') : '';
  /** Un paramètre peut arriver seul ou répété : on ramène tout à un tableau. */
  const asList = (v: string | string[] | undefined): string[] =>
    v === undefined ? [] : Array.isArray(v) ? v.filter(Boolean) : v ? [v] : [];

  // Filtres scolarité (vue Élèves) : cycle / niveau / classe.
  // Le cycle filtre les élèves par leur classe, les enseignants par leur
  // rattachement (TeacherCycle) : deux chemins différents vers la même idée.
  const cycleFilter = isStudentView || isTeacherView ? asList(sp.cycle) : [];
  const levelFilter = isStudentView ? asList(sp.level) : [];
  const classFilter = isStudentView ? asList(sp.classId) : [];
  // Statut : dossier d'inscription côté élève, statut d'emploi côté personnel.
  const statusFilter = isStudentView ? [] : asList(sp.status);
  const isStaffView = isTeacherView || typeFilter === 'STAFF';
  /** Vue « Personnel » seule : colonnes RH et fiche latérale propres. */
  const isStaffOnly = typeFilter === 'STAFF';
  /** Vue « Parents » : colonnes famille et fiche latérale propres. */
  const isParentView = typeFilter === 'PARENT';

  type StudentRow = {
    className: string | null;
    /** Niveau de la classe — colonne distincte de la classe dans la liste. */
    levelLabel: string | null;
    mainTeacher: string | null;
    father: string | null;
    mother: string | null;
    /** Parent affiché en colonne : le père, à défaut la mère. */
    parentName: string | null;
    parentPhone: string | null;
    /** Statut d'inscription de l'année active (ACTIVE, WITHDRAWN…) ou null. */
    status: string | null;
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
    kpis,
    detail,
    teacherDetail,
    staffDetail,
    staffKpis,
    staffExtras,
    parentDetail,
    parentKpiData,
    parentExtras,
  } = await withTenant(
    tenantId,
    async (tx) => {
      // Année active : elle borne AUSSI le filtrage, pas seulement l'affichage.
      // Un élève garde une ligne StudentClass par année scolaire ; sans cette
      // borne, filtrer sur « 2AC » ramène ceux qui y étaient l'an dernier et
      // que la liste affiche, à juste titre, en 3AC.
      const activeYear = await tx.academicYear.findFirst({
        where: { active: true },
        select: { id: true, label: true, startDate: true, endDate: true },
      });

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
                    ...(activeYear ? { academicYearId: activeYear.id } : {}),
                    ...(classFilter.length ? { id: { in: classFilter } } : {}),
                    ...(levelFilter.length ? { levelId: { in: levelFilter } } : {}),
                    ...(cycleFilter.length ? { level: { cycleId: { in: cycleFilter } } } : {}),
                  },
                },
              },
            }
          : {}),
        // Enseignant : rattachement de cycle, saisi dans sa fiche. C'est lui
        // qui dit « ce professeur est du lycée », indépendamment des classes
        // qu'il tient cette année — une réinitialisation des affectations ne
        // doit pas le faire disparaître des listes.
        ...(isTeacherView && cycleFilter.length
          ? { teacherCycles: { some: { cycleId: { in: cycleFilter } } } }
          : {}),
        // Élève : statut du dossier de l'année active. Personnel : colonne
        // dédiée `employmentStatus`.
        ...(statusFilter.length && isStudentView
          ? {
              enrollments: {
                some: { academicYear: { active: true }, status: { in: statusFilter as never[] } },
              },
            }
          : {}),
        ...(statusFilter.length && isStaffView
          ? { employmentStatus: { in: statusFilter as never[] } }
          : {}),
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { cin: { contains: search, mode: 'insensitive' } },
                // Noms arabes et code MASSAR : colonnes dédiées, donc
                // réellement filtrables (contrairement aux champs restés en
                // `metadata`, invisibles de la recherche).
                { firstNameAr: { contains: search, mode: 'insensitive' } },
                { lastNameAr: { contains: search, mode: 'insensitive' } },
                { massarId: { contains: search, mode: 'insensitive' } },
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
          select: { teacherId: true, subject: { select: { label: true, labelAr: true } } },
        }),
        activeYear
          ? tx.teacherAssignment.findMany({
              where: { teacherId: { in: ids }, academicYearId: activeYear.id },
              select: { teacherId: true, class: { select: { name: true, nameAr: true } } },
            })
          : Promise.resolve([]),
        activeYear
          ? tx.timetableEntry.findMany({
              where: { teacherId: { in: ids }, academicYearId: activeYear.id },
              select: { teacherId: true, class: { select: { name: true, nameAr: true } } },
            })
          : Promise.resolve([]),
      ]);
      const specByT = new Map<string, Set<string>>();
      for (const s of specs) {
        if (!specByT.has(s.teacherId)) specByT.set(s.teacherId, new Set());
        specByT.get(s.teacherId)!.add(localizedLabel(locale, s.subject.label, s.subject.labelAr));
      }
      const clsByT = new Map<string, Set<string>>();
      for (const a of [...asgs, ...entries]) {
        if (a.teacherId === null) continue;
        if (!clsByT.has(a.teacherId)) clsByT.set(a.teacherId, new Set());
        clsByT.get(a.teacherId)!.add(localizedLabel(locale, a.class.name, a.class.nameAr));
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
        const [enr, rel, enrollments] = await Promise.all([
          tx.studentClass.findMany({
            where: {
              studentId: { in: ids },
              unenrolledAt: null,
              ...(activeYear ? { class: { academicYearId: activeYear.id } } : {}),
            },
            select: {
              studentId: true,
              class: {
                select: {
                  name: true,
                  nameAr: true,
                  level: { select: { label: true, labelAr: true } },
                  mainTeacher: {
                    select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true },
                  },
                },
              },
            },
          }),
          tx.personRelation.findMany({
            where: { childId: { in: ids } },
            select: {
              childId: true,
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
          }),
          // Statut d'inscription de l'année active (Actif / Retiré…).
          activeYear
            ? tx.enrollment.findMany({
                where: { studentId: { in: ids }, academicYearId: activeYear.id },
                select: { studentId: true, status: true },
              })
            : Promise.resolve([]),
        ]);
        for (const id of ids)
          studentExtras.set(id, {
            className: null,
            levelLabel: null,
            mainTeacher: null,
            father: null,
            mother: null,
            parentName: null,
            parentPhone: null,
            status: null,
          });
        for (const e of enrollments) {
          const s = studentExtras.get(e.studentId);
          if (s) s.status = e.status;
        }
        for (const e of enr) {
          const s = studentExtras.get(e.studentId);
          if (!s) continue;
          s.className = localizedLabel(locale, e.class.name, e.class.nameAr);
          s.levelLabel = localizedLabel(locale, e.class.level.label, e.class.level.labelAr);
          s.mainTeacher = e.class.mainTeacher
            ? personDisplayName(locale, e.class.mainTeacher)
            : null;
        }
        for (const r of rel) {
          const s = studentExtras.get(r.childId);
          if (!s) continue;
          const c = r.parent.contacts as { phone?: string; email?: string } | null;
          const contact = c?.phone ?? c?.email ?? null;
          const label = `${personDisplayName(locale, r.parent)}${contact ? ` · ${contact}` : ''}`;
          if (r.type === 'FATHER' && !s.father) s.father = label;
          else if (r.type === 'MOTHER' && !s.mother) s.mother = label;
          // Colonne « Parent » de la liste : un seul contact, le père par
          // convention, la mère si le père n'est pas rattaché.
          const name = personDisplayName(locale, r.parent);
          if (r.type === 'FATHER' || (!s.parentName && r.type === 'MOTHER')) {
            s.parentName = name;
            s.parentPhone = c?.phone ?? null;
          }
        }
      }

      // Options des filtres scolarité (vue Élèves).
      let cycles: { id: string; label: string }[] = [];
      let levels: { id: string; cycleId: string; label: string }[] = [];
      let classOptions: { id: string; levelId: string; cycleId: string; name: string }[] = [];
      if (typeFilter === 'TEACHER') {
        // Seuls les cycles servent ici : les boutons Primaire / Collège /
        // Lycée. Niveaux et classes restent propres à la vue Élèves.
        cycles = await tx.cycle.findMany({
          orderBy: { order: 'asc' },
          select: { id: true, label: true },
        });
      }
      if (typeFilter === 'STUDENT') {
        const [cyc, lvl, cls] = await Promise.all([
          tx.cycle.findMany({ orderBy: { order: 'asc' }, select: { id: true, label: true } }),
          tx.level.findMany({
            orderBy: { order: 'asc' },
            select: { id: true, cycleId: true, label: true, labelAr: true },
          }),
          tx.class.findMany({
            where: { deletedAt: null, ...(activeYear ? { academicYearId: activeYear.id } : {}) },
            orderBy: { name: 'asc' },
            select: { id: true, levelId: true, name: true, nameAr: true, level: { select: { cycleId: true } } },
          }),
        ]);
        cycles = cyc;
        levels = lvl.map((l) => ({
          id: l.id,
          cycleId: l.cycleId,
          label: localizedLabel(locale, l.label, l.labelAr),
        }));
        classOptions = cls.map((c) => ({
          id: c.id,
          levelId: c.levelId,
          cycleId: c.level.cycleId,
          name: localizedLabel(locale, c.name, c.nameAr),
        }));
      }

      // ── Indicateurs de tête (vue Élèves) ────────────────────────────
      //
      // Comptés sur TOUT l'effectif, pas sur la page ni sur les filtres : un
      // tableau de bord qui change de total quand on filtre ne mesure plus
      // rien. Seule l'année active est prise en compte.
      let kpis: {
        total: number;
        newThisYear: number;
        active: number;
        alerts: number;
      } | null = null;
      let detail: StudentDetail | null = null;
      let teacherDetail: TeacherDetail | null = null;
      let staffDetail: StaffDetail | null = null;
      let parentDetail: ParentDetail | null = null;
      let parentKpiData: ReturnType<typeof parentKpis> | null = null;
      const parentExtras = new Map<
        string,
        {
          children: Array<{ id: string; name: string; className: string | null }>;
          contacts: { phone?: string; email?: string; whatsapp?: string };
          portal: { active: boolean; email: string } | null;
          financial: FinancialStatus;
        }
      >();
      let staffKpis: {
        total: number;
        presentToday: number;
        absentToday: number;
        contractsEnding: number;
        incompleteFiles: number;
      } | null = null;
      const staffExtras = new Map<
        string,
        {
          day: ReturnType<typeof dayStatus>;
          contract: ReturnType<typeof contractLabel>;
          hrFile: ReturnType<typeof hrFileStatus>;
        }
      >();

      // Mêmes indicateurs RH pour le personnel et pour les enseignants.
      if (isStaffOnly || isTeacherView) {
        const hrType = isStaffOnly ? ('STAFF' as const) : ('TEACHER' as const);
        const ids = persons.map((x) => x.id);
        const today = new Date();
        const dayStart = new Date(
          Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
        );
        const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
        const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));

        const todayRows = ids.length
          ? await tx.staffAttendance.findMany({
              where: { personId: { in: ids }, date: dayStart },
              select: { personId: true, status: true },
            })
          : [];
        const byPerson = new Map(todayRows.map((r) => [r.personId, r]));
        for (const x of persons) {
          staffExtras.set(x.id, {
            day: dayStatus(byPerson.get(x.id)),
            contract: contractLabel(
              { contractType: x.contractType, contractEndDate: x.contractEndDate },
              today,
            ),
            hrFile: hrFileStatus({
              cin: x.cin,
              hireDate: x.hireDate,
              contractType: x.contractType,
              rib: x.rib,
              bankName: x.bankName,
            }),
          });
        }

        // Indicateurs de tête : comptés sur TOUT le personnel, pas sur la page
        // ni sur les filtres — un total qui bouge quand on filtre ne mesure
        // plus rien.
        const allStaff = await tx.person.findMany({
          where: { type: hrType, deletedAt: null },
          select: {
            id: true,
            cin: true,
            hireDate: true,
            contractType: true,
            contractEndDate: true,
            rib: true,
            bankName: true,
          },
        });
        const [presentToday, absentToday] = await Promise.all([
          tx.staffAttendance.count({
            where: { date: dayStart, status: 'PRESENT', person: { type: hrType, deletedAt: null } },
          }),
          tx.staffAttendance.count({
            where: { date: dayStart, status: 'ABSENT', person: { type: hrType, deletedAt: null } },
          }),
        ]);
        staffKpis = {
          total: allStaff.length,
          presentToday,
          absentToday,
          // Échéances à surveiller : un contrat qui se termine dans le mois,
          // ou déjà expiré sans que personne ne l'ait vu.
          contractsEnding: allStaff.filter((x) => {
            const c = contractLabel(x, today);
            return c.endsInDays !== null && c.endsInDays <= 30;
          }).length,
          incompleteFiles: allStaff.filter((x) => !hrFileStatus(x).complete).length,
        };

        if (isStaffOnly && sp.selected) {
          const person = await tx.person.findFirst({
            where: { id: sp.selected, type: 'STAFF' },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              firstNameAr: true,
              lastNameAr: true,
              photoFileId: true,
              employmentStatus: true,
              cin: true,
              contacts: true,
              address: true,
              birthDate: true,
              hireDate: true,
              contractType: true,
              contractEndDate: true,
              rib: true,
              bankName: true,
              role: { select: { labelFr: true, labelAr: true } },
              serviceRef: { select: { labelFr: true, labelAr: true } },
            },
          });
          if (person) {
            const month = await tx.staffAttendance.findMany({
              where: { personId: person.id, date: { gte: monthStart, lt: monthEnd } },
              orderBy: { date: 'asc' },
              select: {
                date: true,
                status: true,
                lateMinutes: true,
                absenceReason: { select: { label: true, labelAr: true } },
              },
            });
            const count = (st: string) => month.filter((m) => m.status === st).length;
            const c = (x: { labelFr: string; labelAr: string } | null) =>
              x ? (locale === 'ar' ? x.labelAr : x.labelFr) : null;
            const contacts = (person.contacts ?? {}) as { phone?: string; email?: string };
            const addr = (person.address ?? {}) as { line1?: string; city?: string };
            const contract = contractLabel(person, today);
            staffDetail = {
              id: person.id,
              name: personDisplayName(locale, person),
              photo: Boolean(person.photoFileId),
              employmentStatus: person.employmentStatus,
              roleLabel: c(person.role),
              serviceLabel: c(person.serviceRef),
              cin: person.cin,
              phone: contacts.phone ?? null,
              email: contacts.email ?? null,
              address: [addr.line1, addr.city].filter(Boolean).join(', ') || null,
              birthDate: person.birthDate,
              hireDate: person.hireDate,
              contractLabel: contract.label,
              contractUrgent: contract.urgent,
              hrFile: hrFileStatus(person),
              month: {
                label: monthStart.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
                present: count('PRESENT'),
                absent: count('ABSENT'),
                late: count('LATE'),
                leave: count('LEAVE'),
                lateMinutes: month.reduce((n, m) => n + (m.lateMinutes ?? 0), 0),
                recorded: month.length,
              },
              absences: month
                .filter((m) => m.status !== 'PRESENT')
                .map((m) => ({
                  date: m.date,
                  status: m.status,
                  reason: m.absenceReason
                    ? localizedLabel(locale, m.absenceReason.label, m.absenceReason.labelAr)
                    : null,
                })),
            };
          }
        }
      }

      if (isParentView) {
        // Une « famille » = un parent rattaché à au moins un élève inscrit sur
        // l'année active. C'est le dénominateur commun des trois taux : les
        // comparer suppose qu'ils portent sur la même population.
        const relations = await tx.personRelation.findMany({
          where: activeYear
            ? {
                child: {
                  type: 'STUDENT',
                  deletedAt: null,
                  studentClasses: {
                    some: { unenrolledAt: null, class: { academicYearId: activeYear.id } },
                  },
                },
              }
            : { child: { type: 'STUDENT', deletedAt: null } },
          select: {
            parentId: true,
            type: true,
            child: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                firstNameAr: true,
                lastNameAr: true,
                studentClasses: {
                  where: {
                    unenrolledAt: null,
                    ...(activeYear ? { class: { academicYearId: activeYear.id } } : {}),
                  },
                  take: 1,
                  select: {
                    class: {
                      select: {
                        name: true,
                        nameAr: true,
                        level: { select: { label: true, labelAr: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        });

        const childrenByParent = new Map<string, typeof relations>();
        for (const r of relations) {
          const arr = childrenByParent.get(r.parentId) ?? [];
          arr.push(r);
          childrenByParent.set(r.parentId, arr);
        }

        // Échéances des enfants, regroupées par famille.
        const childIds = [...new Set(relations.map((r) => r.child.id))];
        const installments = childIds.length
          ? await tx.installment.findMany({
              where: {
                studentId: { in: childIds },
                status: { not: 'CANCELLED' },
                ...(activeYear
                  ? { dueDate: { gte: activeYear.startDate, lt: yearInstallmentEnd(activeYear) } }
                  : {}),
              },
              select: { studentId: true, amount: true, dueDate: true, payments: { select: { amount: true } } },
            })
          : [];
        const instByChild = new Map<string, Array<{ amount: number; paid: number; dueDate: Date }>>();
        for (const i of installments) {
          const arr = instByChild.get(i.studentId) ?? [];
          arr.push({
            amount: Number(i.amount),
            paid: i.payments.reduce((n, x) => n + Number(x.amount), 0),
            dueDate: i.dueDate,
          });
          instByChild.set(i.studentId, arr);
        }

        // Comptes portail des parents.
        const parentIds = [...childrenByParent.keys()];
        const links = parentIds.length
          ? await tx.userPerson.findMany({
              where: { personId: { in: parentIds } },
              select: {
                personId: true,
                user: { select: { email: true, lastLoginAt: true, disabledAt: true } },
              },
            })
          : [];
        // Un compte désactivé ne donne plus accès au portail : on le compte
        // comme absent plutôt que comme actif.
        const portalByParent = new Map(
          links.map((l) => [
            l.personId,
            { email: l.user.email, lastLoginAt: l.user.lastLoginAt, isActive: !l.user.disabledAt },
          ]),
        );

        const contactsOf = (x: { contacts: unknown }) =>
          (x.contacts ?? {}) as { phone?: string; email?: string; whatsapp?: string };

        const statusOf = (parentId: string): FinancialStatus => {
          const kids = childrenByParent.get(parentId) ?? [];
          const lines = kids.flatMap((k) => instByChild.get(k.child.id) ?? []);
          return familyFinancialStatus(lines);
        };

        // Lignes du tableau, pour les parents affichés.
        for (const x of persons) {
          const kids = childrenByParent.get(x.id) ?? [];
          const portal = portalByParent.get(x.id);
          parentExtras.set(x.id, {
            children: kids.map((k) => ({
              id: k.child.id,
              name: personDisplayName(locale, k.child),
              className: k.child.studentClasses[0]
                ? localizedLabel(
                    locale,
                    k.child.studentClasses[0].class.name,
                    k.child.studentClasses[0].class.nameAr,
                  )
                : null,
            })),
            contacts: contactsOf(x),
            portal: portal ? { active: portal.isActive, email: portal.email } : null,
            financial: statusOf(x.id),
          });
        }

        // Indicateurs : sur TOUTES les familles, pas sur la page affichée.
        const allParents = await tx.person.findMany({
          where: { type: 'PARENT', deletedAt: null, id: { in: parentIds } },
          select: { id: true, contacts: true },
        });
        parentKpiData = parentKpis(
          allParents.map((x) => ({
            hasPortal: Boolean(portalByParent.get(x.id)?.isActive),
            reachable: isReachable(contactsOf(x)),
            financial: statusOf(x.id).state,
          })),
        );

        if (sp.selected) {
          const person = await tx.person.findFirst({
            where: { id: sp.selected, type: 'PARENT' },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              firstNameAr: true,
              lastNameAr: true,
              photoFileId: true,
              cin: true,
              contacts: true,
              address: true,
              metadata: true,
            },
          });
          if (person) {
            const kids = childrenByParent.get(person.id) ?? [];
            const c = contactsOf(person);
            const addr = (person.address ?? {}) as { line1?: string; city?: string };
            const meta = (person.metadata ?? {}) as { profession?: string };
            const portal = portalByParent.get(person.id);
            const tenant = await tx.tenant.findFirst({ select: { currency: true } });
            parentDetail = {
              id: person.id,
              name: personDisplayName(locale, person),
              photo: Boolean(person.photoFileId),
              relation: kids[0] ? tForm(`relations.${kids[0].type}` as never) : null,
              cin: person.cin,
              phone: c.phone ?? null,
              whatsapp: c.whatsapp ?? null,
              email: c.email ?? null,
              address: [addr.line1, addr.city].filter(Boolean).join(', ') || null,
              profession: meta.profession ?? null,
              portal: {
                active: Boolean(portal?.isActive),
                email: portal?.email ?? null,
                lastLoginAt: portal?.lastLoginAt ?? null,
              },
              children: kids.map((k) => ({
                id: k.child.id,
                name: personDisplayName(locale, k.child),
                className: k.child.studentClasses[0]
                  ? localizedLabel(
                      locale,
                      k.child.studentClasses[0].class.name,
                      k.child.studentClasses[0].class.nameAr,
                    )
                  : null,
                levelLabel: k.child.studentClasses[0]
                  ? localizedLabel(
                      locale,
                      k.child.studentClasses[0].class.level.label,
                      k.child.studentClasses[0].class.level.labelAr,
                    )
                  : null,
              })),
              financial: statusOf(person.id),
              currency: tenant?.currency ?? 'MAD',
              missing: missingContacts(c),
            };
          }
        }
      }

      if (isTeacherView && sp.selected) {
        teacherDetail = await loadTeacherDetail(tx, sp.selected, locale, activeYear?.id ?? null);
      }

      if (isStudentView) {
        const enrolled = {
          type: 'STUDENT' as const,
          deletedAt: null,
          ...(activeYear
            ? {
                studentClasses: {
                  some: { unenrolledAt: null, class: { academicYearId: activeYear.id } },
                },
              }
            : {}),
        };
        const [totalCount, activeCount, newCount, noClassCount] = await Promise.all([
          tx.person.count({ where: enrolled }),
          activeYear
            ? tx.person.count({
                where: {
                  ...enrolled,
                  enrollments: { some: { academicYearId: activeYear.id, status: 'ACTIVE' } },
                },
              })
            : Promise.resolve(0),
          // « Nouveaux » = dossier ouvert sur l'année active sans dossier
          // antérieur : une réinscription n'est pas une nouvelle inscription.
          activeYear
            ? tx.person.count({
                where: {
                  ...enrolled,
                  enrollments: { some: { academicYearId: activeYear.id } },
                  NOT: { enrollments: { some: { academicYearId: { not: activeYear.id } } } },
                },
              })
            : Promise.resolve(0),
          // Alerte : un dossier sur l'année active mais aucune classe — l'élève
          // n'apparaît à aucun appel et personne ne s'en aperçoit.
          activeYear
            ? tx.person.count({
                where: {
                  type: 'STUDENT',
                  deletedAt: null,
                  enrollments: { some: { academicYearId: activeYear.id } },
                  studentClasses: {
                    none: { unenrolledAt: null, class: { academicYearId: activeYear.id } },
                  },
                },
              })
            : Promise.resolve(0),
        ]);
        kpis = {
          total: totalCount,
          active: activeCount,
          newThisYear: newCount,
          alerts: noClassCount,
        };

        if (sp.selected) {
          detail = await loadStudentDetail(tx, sp.selected, locale, activeYear);
        }
      }

      return {
        persons,
        total,
        kpis,
        detail,
        teacherDetail,
        staffDetail,
        staffKpis,
        staffExtras,
        parentDetail,
        parentKpiData,
        parentExtras,
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
    // Filtres multi-valeurs : une occurrence du paramètre par valeur cochée,
    // pour que la pagination et le tri conservent la sélection complète.
    if (overrides.cycle === undefined) for (const v of cycleFilter) usp.append('cycle', v);
    if (overrides.cycle) usp.set('cycle', overrides.cycle);
    if (overrides.level === undefined) for (const v of levelFilter) usp.append('level', v);
    if (overrides.level) usp.set('level', overrides.level);
    if (overrides.classId === undefined) for (const v of classFilter) usp.append('classId', v);
    if (overrides.classId) usp.set('classId', overrides.classId);
    if (overrides.status === undefined) for (const v of statusFilter) usp.append('status', v);
    if (overrides.status) usp.set('status', overrides.status);
    // L'élève ouvert dans le panneau suit la navigation : changer de page ou
    // de filtre ne doit pas refermer la fiche qu'on est en train de lire.
    if (selected && overrides.selected === undefined) usp.set('selected', selected);
    if (overrides.selected) usp.set('selected', overrides.selected);
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

  // Options de statut : dossier d'inscription côté élève, statut d'emploi
  // côté personnel — deux référentiels distincts sous un même libellé.
  const tStaff = await getTranslations('admin.persons.staffPanel.day');
  // Vue Élèves : pas de filtre Statut (la liste ne montre que les inscrits).
  const statusOptions = isStudentView
    ? []
    : isStaffView
      ? EMPLOYMENT_STATUSES.map((st) => ({
          id: st,
          label: tForm(`employmentStatus.${st}` as never),
        }))
      : [];

  return (
    <div className="px-3 py-3">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
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

      {/* Indicateurs : comptés sur l'effectif entier, pas sur les filtres —
          un total qui bouge quand on filtre ne mesure plus rien. */}
      {kpis && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon="👥"
            tone="sky"
            label={t('kpi.total')}
            value={kpis.total}
            hint={t('kpi.totalHint')}
          />
          <KpiCard
            icon="🆕"
            tone="emerald"
            label={t('kpi.new')}
            value={kpis.newThisYear}
            hint={t('kpi.newHint')}
          />
          <KpiCard
            icon="✅"
            tone="violet"
            label={t('kpi.active')}
            value={kpis.active}
            hint={
              kpis.total > 0
                ? t('kpi.activeHint', { pct: Math.round((kpis.active / kpis.total) * 100) })
                : undefined
            }
          />
          <KpiCard
            icon="⚠"
            tone={kpis.alerts > 0 ? 'red' : 'slate'}
            alert={kpis.alerts > 0}
            label={t('kpi.alerts')}
            value={kpis.alerts}
            hint={t('kpi.alertsHint')}
          />
        </div>
      )}

      {/* Indicateurs des familles. Le dénominateur est partout le même —
          les parents rattachés à au moins un élève inscrit — pour que les
          trois taux se comparent entre eux. */}
      {parentKpiData && (
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <KpiCard
            icon="💻"
            tone="emerald"
            label={t('kpi.portal')}
            value={parentKpiData.portalRate ?? 0}
            suffix="%"
            hint={t('kpi.portalHint', {
              active: parentKpiData.withPortal,
              total: parentKpiData.families,
            })}
          />
          <KpiCard
            icon="📞"
            tone="sky"
            label={t('kpi.emergency')}
            value={parentKpiData.contactRate ?? 0}
            suffix="%"
            hint={t('kpi.emergencyHint', { count: parentKpiData.toComplete })}
          />
          <KpiCard
            icon="💳"
            tone={parentKpiData.lateFamilies > 0 ? 'red' : 'emerald'}
            label={t('kpi.settlement')}
            value={parentKpiData.settlementRate ?? 0}
            suffix="%"
            hint={t('kpi.settlementHint', { count: parentKpiData.lateFamilies })}
          />
          {/* Aucun registre des parents délégués n'existe en base : on le dit
              plutôt que d'afficher un zéro qui passerait pour une mesure. */}
          <KpiCard
            icon="🏛"
            tone="slate"
            label={t('kpi.delegates')}
            value={null}
            hint={t('kpi.delegatesHint')}
          />
        </div>
      )}

      {/* Indicateurs du personnel. Faute de la maquette, ils reprennent les
          quatre questions que posent les colonnes demandées : combien
          d'agents, qui est là aujourd'hui, quels contrats arrivent à terme,
          quels dossiers ne tiendront pas la paie. */}
      {staffKpis && (
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <KpiCard
            icon={isTeacherView ? '🧑‍🏫' : '🧑‍💼'}
            tone="sky"
            label={isTeacherView ? t('kpi.teacherTotal') : t('kpi.staffTotal')}
            value={staffKpis.total}
          />
          {/* Présents et absents pointés du jour : le second chiffre dit
              ce que le premier tait quand l'effectif n'est pas complet. */}
          <KpiCard
            icon="✅"
            tone="emerald"
            label={t('kpi.staffPresence')}
            value={`${staffKpis.presentToday} / ${staffKpis.absentToday}`}
            hint={
              staffKpis.total > 0
                ? t('kpi.staffPresentHint', {
                    pct: Math.round((staffKpis.presentToday / staffKpis.total) * 100),
                  })
                : undefined
            }
          />
          <KpiCard
            icon="📄"
            tone={staffKpis.contractsEnding > 0 ? 'red' : 'slate'}
            alert={staffKpis.contractsEnding > 0}
            label={t('kpi.staffContracts')}
            value={staffKpis.contractsEnding}
            hint={t('kpi.staffContractsHint')}
          />
          <KpiCard
            icon="⚠"
            tone={staffKpis.incompleteFiles > 0 ? 'red' : 'slate'}
            alert={staffKpis.incompleteFiles > 0}
            label={t('kpi.staffFiles')}
            value={staffKpis.incompleteFiles}
            hint={t('kpi.staffFilesHint')}
          />
        </div>
      )}

      {/* Onglets de cycle : le raccourci le plus fréquent, au-dessus des
          filtres détaillés qui restent disponibles en dessous. */}
      {isStudentView && cycles.length > 0 && (
        <nav className="mb-3 flex flex-wrap items-center gap-2">
          <CycleTab href={qs({ cycle: '', page: '1' })} label={t('tabs.all')} active={cycleFilter.length === 0} />
          {cycles.map((c) => (
            <CycleTab
              key={c.id}
              href={qs({ cycle: c.id, page: '1' })}
              label={c.label}
              active={cycleFilter.length === 1 && cycleFilter[0] === c.id}
            />
          ))}
        </nav>
      )}

      {/* Primaire · Collège · Lycée : le tri le plus fréquent devant une
          liste de professeurs, avant même la recherche par nom. */}
      {isTeacherView && cycles.length > 0 && (
        <nav className="mb-3 flex flex-wrap items-center gap-2">
          <CycleTab
            href={qs({ cycle: '', page: '1', selected: '' })}
            label={t('tabs.all')}
            active={cycleFilter.length === 0}
          />
          {cycles.map((c) => (
            <CycleTab
              key={c.id}
              href={qs({ cycle: c.id, page: '1', selected: '' })}
              label={c.label}
              active={cycleFilter.length === 1 && cycleFilter[0] === c.id}
            />
          ))}
        </nav>
      )}

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
        {(isStudentView || isStaffView) && (
          <SchoolFilters
            cycles={cycles}
            levels={levels}
            classes={classOptions}
            statuses={statusOptions}
            showSchool={isStudentView}
            cycleScope={cycleFilter}
            initial={{
              cycle: cycleFilter,
              level: levelFilter,
              classId: classFilter,
              status: statusFilter,
            }}
          />
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

      <div
        className={
          isStudentView || isTeacherView || isStaffOnly || isParentView
            ? 'flex flex-col gap-4 xl:flex-row xl:items-start'
            : undefined
        }
      >
      <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-brand-200 bg-white">
        {/* Défilement horizontal : à côté de la fiche latérale, la dernière
            colonne (Action) était rognée. */}
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
            <tr>
              {isStudentView && <th className="px-4 py-3 text-start">{t('table.photo')}</th>}
              {isStudentView && <th className="px-4 py-3 text-start">{t('table.massar')}</th>}
              <th className="px-4 py-3 text-start">{t('table.name')}</th>
              {isStudentView ? (
                <>
                  <th className="px-4 py-3 text-start">{t('table.studentClass')}</th>
                  <th className="px-4 py-3 text-start">{t('table.level')}</th>
                  <th className="px-4 py-3 text-start">{t('table.parent')}</th>
                  <th className="px-4 py-3 text-start">{t('table.phone')}</th>
                  <th className="px-4 py-3 text-start">{t('table.status')}</th>
                </>
              ) : isTeacherView ? (
                <>
                  <th className="px-4 py-3 text-start">{t('table.specialties')}</th>
                  <th className="px-4 py-3 text-end">{t('table.weeklyHours')}</th>
                  <th className="px-4 py-3 text-start">{t('table.classes')}</th>
                  <th className="px-4 py-3 text-start">{t('table.status')}</th>
                </>
              ) : isParentView ? (
                <>
                  <th className="px-4 py-3 text-start">{t('table.children')}</th>
                  <th className="px-4 py-3 text-start">{t('table.directContact')}</th>
                  <th className="px-4 py-3 text-start">{t('table.portal')}</th>
                  <th className="px-4 py-3 text-start">{t('table.financial')}</th>
                </>
              ) : isStaffOnly ? (
                <>
                  <th className="px-2 py-3 text-start">{t('table.type')}</th>
                  <th className="px-2 py-3 text-start">{t('table.contact')}</th>
                  <th className="px-2 py-3 text-start">{t('table.dayStatus')}</th>
                  <th className="px-2 py-3 text-start">{t('table.contract')}</th>
                  <th className="px-2 py-3 text-start">{t('table.hrFile')}</th>
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
                <tr
                  key={p.id}
                  className={
                    p.deletedAt
                      ? 'bg-slate-50/60 text-slate-500'
                      : detail?.id === p.id
                        ? 'bg-brand-50'
                        : ''
                  }
                >
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
                  {isStudentView && (
                    <td className="px-4 py-3 text-xs tabular-nums text-slate-500">
                      {p.massarId ?? '—'}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    {/* En vue Élèves, le nom ouvre la fiche latérale plutôt que
                        de quitter la liste : on consulte bien plus souvent
                        qu'on ne modifie. Le panneau garde un lien vers la fiche
                        complète. */}
                    <Link
                      href={
                        isStudentView || isTeacherView || isStaffOnly || isParentView
                          ? qs({ selected: p.id })
                          : `${baseHref}/${p.id}`
                      }
                      className="hover:text-brand-700 font-medium text-slate-900 hover:underline"
                    >
                      {personDisplayName(locale, p)}
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
                          <td className="px-4 py-3 text-xs text-slate-600">{s?.className ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-600">{s?.levelLabel ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-600">{s?.parentName ?? '—'}</td>
                          <td className="px-4 py-3 text-xs tabular-nums text-slate-600">
                            {s?.parentPhone ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            <StudentStatusBadge
                              status={s?.status ?? null}
                              label={
                                s?.status && STUDENT_STATUSES.includes(s.status)
                                  ? t(`studentStatus.${s.status}` as never)
                                  : t('studentStatus.unknown')
                              }
                            />
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
                          <td className="px-4 py-3">
                            <EmploymentBadge
                              status={p.employmentStatus}
                              label={
                                p.employmentStatus
                                  ? tForm(`employmentStatus.${p.employmentStatus}` as never)
                                  : '—'
                              }
                            />
                          </td>
                        </>
                      );
                    })()
                  ) : isParentView ? (
                    (() => {
                      const x = parentExtras.get(p.id);
                      const fin = x?.financial;
                      return (
                        <>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {x && x.children.length > 0
                              ? x.children
                                  .map((k) => (k.className ? `${k.name} (${k.className})` : k.name))
                                  .join(', ')
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            <div className="tabular-nums">
                              {x?.contacts.phone ?? x?.contacts.whatsapp ?? '—'}
                            </div>
                            <div className="truncate text-[11px] text-slate-400">
                              {x?.contacts.email ?? ''}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                x?.portal?.active
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {x?.portal?.active ? t('portal.active') : t('portal.inactive')}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {fin ? (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                  fin.state === 'LATE'
                                    ? 'bg-red-100 text-red-800'
                                    : fin.state === 'UP_TO_DATE'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                {financialLabel(fin)}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        </>
                      );
                    })()
                  ) : isStaffOnly ? (
                    (() => {
                      const x = staffExtras.get(p.id);
                      return (
                        <>
                          {/* Le type « STAFF » n'apprend rien ici : seul le service
                              distingue un agent d'un autre. */}
                          <td className="px-2 py-3 text-xs font-medium text-amber-700">
                            {p.serviceRef
                              ? locale === 'ar'
                                ? p.serviceRef.labelAr
                                : p.serviceRef.labelFr
                              : '—'}
                          </td>
                          <td className="max-w-[12rem] truncate px-2 py-3 text-xs text-slate-600">
                            {contacts.email ?? contacts.phone ?? '—'}
                          </td>
                          <td className="px-2 py-3">
                            <DayBadge status={x?.day ?? 'NOT_RECORDED'} t={tStaff} />
                          </td>
                          <td className="px-2 py-3 text-xs">
                            <span className={x?.contract.urgent ? 'font-medium text-red-700' : 'text-slate-600'}>
                              {x?.contract.label ?? '—'}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-xs">
                            {x ? (
                              <span
                                className={`rounded px-1.5 py-0.5 font-medium ${
                                  x.hrFile.complete
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-amber-50 text-amber-800'
                                }`}
                              >
                                {hrFileLabel(x.hrFile)}
                              </span>
                            ) : (
                              '—'
                            )}
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
                      className="inline-flex whitespace-nowrap rounded-lg border border-brand-300 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
                    >
                      {t('actions.view')}
                    </Link>
                  </td>
                </tr>
              );
            })}
            {persons.length === 0 && (
              <tr>
                <td colSpan={isStudentView ? 7 : 5} className="px-4 py-10 text-center text-slate-500">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
        <Pagination page={page} totalPages={totalPages} hrefFor={(p) => qs({ page: String(p) })} />
      </div>

      {/* Fiche de l'élève sélectionné. Elle reste à droite de la liste : on
          consulte en parcourant, sans perdre sa place ni ses filtres. */}
      {isStudentView &&
        (detail ? (
          <StudentDetailPanel detail={detail} locale={locale} baseHref={baseHref} />
        ) : (
          <StudentDetailEmpty />
        ))}

      {/* Même disposition que pour les élèves : la fiche accompagne la liste
          au lieu de la remplacer. */}
      {isTeacherView &&
        (teacherDetail ? (
          <TeacherDetailPanel detail={teacherDetail} locale={locale} baseHref={baseHref} />
        ) : (
          <TeacherDetailEmpty />
        ))}

      {isParentView &&
        (parentDetail ? (
          <ParentDetailPanel detail={parentDetail} locale={locale} baseHref={baseHref} />
        ) : (
          <ParentDetailEmpty />
        ))}

      {/* Même disposition que pour les élèves et les enseignants. */}
      {isStaffOnly &&
        (staffDetail ? (
          <StaffDetailPanel detail={staffDetail} locale={locale} baseHref={baseHref} />
        ) : (
          <StaffDetailEmpty />
        ))}
      </div>
    </div>
  );
}

function StudentStatusBadge({ status, label }: { status: string | null; label: string }) {
  const tone =
    status === 'ACTIVE'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'WITHDRAWN'
        ? 'bg-red-100 text-red-700'
        : status
          ? 'bg-amber-100 text-amber-700'
          : 'bg-slate-100 text-slate-500';
  return (
    <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${tone}`}>
      {label}
    </span>
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
