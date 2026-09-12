import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { PersonForm } from '../../person-form';
import { HealthSection, type Health } from '../health-section';
import { EditTabs } from './edit-tabs';
import { ChangeStudentClass } from './change-class';
import { localizedLabel } from '@/lib/localized-name';
import { PersonHeader, PERSON_PAGE_SHELL } from '../person-header';

export default async function EditPersonPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.persons');

  const { person, roles, availableParents, allSubjects, allCycles, allClasses, rooms } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const activeYear = await tx.academicYear.findFirst({
        where: { active: true },
        select: { id: true },
      });
      const [person, roles, availableParents, allSubjects, allCycles, classes, roomList] = await Promise.all([
        tx.person.findUnique({
          where: { id },
          include: {
            // Les fiches parent sont incluses : les prénoms du père et de la
            // mère affichés sur la fiche élève en sont issus, plutôt que
            // d'être ressaisis à la main.
            relationsAsChild: { include: { parent: true } },
            contractFile: true,
            teacherSpecialties: true,
            teacherCycles: true,
            teacherPriorityClasses: true,
            diplomas: { orderBy: { order: 'asc' } },
            studentClasses: { where: { unenrolledAt: null }, select: { classId: true }, take: 1 },
          },
        }),
        tx.personRole.findMany({
          where: { active: true },
          orderBy: [{ appliesTo: 'asc' }, { order: 'asc' }, { labelFr: 'asc' }],
        }),
        tx.person.findMany({
          where: { type: 'PARENT', deletedAt: null, id: { not: id } },
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
      return {
        person,
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
      };
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

  return (
    <div className={PERSON_PAGE_SHELL}>
      <PersonHeader personId={id} locale={locale} active="edit" />

      {person.type === 'STUDENT' && (
        <div className="mb-4">
          <ChangeStudentClass
            studentId={person.id}
            classes={allClasses.map((c) => ({
              id: c.id,
              name: localizedLabel(locale, c.name, c.nameAr),
            }))}
            currentClassId={person.studentClasses[0]?.classId ?? null}
          />
        </div>
      )}

      <EditTabs
        ficheLabel={t('editTabs.fiche')}
        santeLabel={t('editTabs.health')}
        sante={person.type === 'STUDENT' ? (
          <div className="mt-4">
            <HealthSection studentId={person.id} health={((person.metadata ?? {}) as { health?: Health }).health ?? {}} />
          </div>
        ) : null}
        fiche={
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
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
            // État civil bilingue.
            firstNameAr: person.firstNameAr ?? undefined,
            lastNameAr: person.lastNameAr ?? undefined,
            birthPlace: person.birthPlace ?? undefined,
            birthPlaceAr: person.birthPlaceAr ?? undefined,
            nationalityAr: person.nationalityAr ?? undefined,
            addressAr: person.addressAr ?? undefined,
            cityAr: person.cityAr ?? undefined,
            massarId: person.massarId ?? undefined,
            regime: person.regime ?? undefined,
            usesTransport: person.usesTransport,
            ...(() => {
              const m = (person.metadata ?? {}) as Record<string, unknown>;
              return {
                cne: typeof m.cne === 'string' ? m.cne : undefined,
                imageRights: typeof m.imageRights === 'boolean' ? m.imageRights : undefined,
                exitRights: typeof m.exitRights === 'number' ? m.exitRights : undefined,
                dietInfo: typeof m.dietInfo === 'string' ? m.dietInfo : undefined,
                originSchool: typeof m.originSchool === 'string' ? m.originSchool : undefined,
                originSchoolAr:
                  typeof m.originSchoolAr === 'string' ? m.originSchoolAr : undefined,
                repeating: typeof m.repeating === 'boolean' ? m.repeating : undefined,
                cnssNumber: typeof m.cnssNumber === 'string' ? m.cnssNumber : undefined,
                amoNumber: typeof m.amoNumber === 'string' ? m.amoNumber : undefined,
                employmentStatus: typeof m.employmentStatus === 'string' ? m.employmentStatus : undefined,
                cinScanFileId: typeof m.cinScanFileId === 'string' ? m.cinScanFileId : null,
                cnssAttestationFileId: typeof m.cnssAttestationFileId === 'string' ? m.cnssAttestationFileId : null,
                cvFileId: typeof m.cvFileId === 'string' ? m.cvFileId : null,
              };
            })(),
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
            homeRoomId: (person.metadata as { homeRoomId?: string } | null)?.homeRoomId ?? null,
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
          allClasses={allClasses.map((c) => ({ id: c.id, label: localizedLabel(locale, c.name, c.nameAr) }))}
          rooms={rooms}
        />
      </div>
        }
      />
    </div>
  );
}
