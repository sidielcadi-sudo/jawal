import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';
import { computeContractStatus } from '@/lib/contract-status';
import { PersonActions } from './person-actions';

/**
 * Largeur commune à tous les écrans d'une personne — celle de la fiche.
 *
 * La bande d'en-tête déborde de son conteneur (`-mx-3`) pour aller au bord :
 * elle prend donc la largeur de la page qui la rend. Avec quatre largeurs
 * différentes, le même bandeau paraissait changer de taille à chaque onglet.
 */
export const PERSON_PAGE_SHELL = 'px-3 py-3';

/** Onglet actif de la fiche — pilote la mise en évidence du bouton. */
export type PersonTab = 'fiche' | 'dashboard' | 'timetable' | 'edit' | 'finance';

const BADGE: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  EXPIRES_30: 'bg-amber-100 text-amber-800',
  EXPIRES_7: 'bg-orange-100 text-orange-800',
  EXPIRED: 'bg-red-100 text-red-800',
  NO_CONTRACT: 'bg-slate-100 text-slate-600',
};

/**
 * Bande d'en-tête commune à la fiche d'une personne et à ses écrans annexes
 * (tableau de bord, emploi du temps, modification).
 *
 * Elle est rendue par chaque écran plutôt que par un layout : le sous-arbre
 * `[id]/` contient aussi des pages d'impression, qui ne doivent porter ni
 * bandeau ni navigation.
 *
 * Les boutons de navigation se comportent en onglets : celui de l'écran
 * courant passe en plein bleu, les autres restent en bouton secondaire.
 */
export async function PersonHeader({
  personId,
  locale,
  active,
}: {
  personId: string;
  locale: string;
  active: PersonTab;
}) {
  const session = (await auth())!;
  const t = await getTranslations('admin.persons');
  const tForm = await getTranslations('admin.persons.form');
  const tDetail = await getTranslations('admin.persons.detail');

  const person = await withTenant(session.user.tenantId, (tx) =>
    tx.person.findUnique({
      where: { id: personId },
      select: {
        id: true,
        type: true,
        firstName: true,
        lastName: true,
        firstNameAr: true,
        lastNameAr: true,
        birthDate: true,
        photoFileId: true,
        deletedAt: true,
        hireDate: true,
        contractEndDate: true,
        role: { select: { labelFr: true, labelAr: true } },
        serviceRef: { select: { labelFr: true, labelAr: true } },
        // Classe et niveau de l'année active : c'est la première chose qu'on
        // cherche sur la fiche d'un élève, et elle obligeait jusqu'ici à
        // descendre dans l'onglet Scolarité.
        studentClasses: {
          where: { unenrolledAt: null, class: { academicYear: { active: true } } },
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
    }),
  );
  if (!person) return null;

  const label = (x: { labelFr: string; labelAr: string } | null) =>
    x ? (locale === 'ar' ? x.labelAr : x.labelFr) : null;
  const roleLabel = label(person.role);
  const serviceLabel = label(person.serviceRef);
  const contract = computeContractStatus(person, new Date());
  const name = personDisplayName(locale, person);
  const enrolled = person.studentClasses[0]?.class ?? null;
  const schooling = enrolled
    ? `${localizedLabel(locale, enrolled.name, enrolled.nameAr)} · ${localizedLabel(
        locale,
        enrolled.level.label,
        enrolled.level.labelAr,
      )}`
    : null;

  const base = `/${locale}/admin/persons/${person.id}`;
  const backHref = `/${locale}/admin/persons?type=${person.type}`;
  const backLabel = t(`title.${person.type}` as never);

  const tabCls = (isActive: boolean) =>
    isActive
      ? 'rounded-lg border border-brand-600 bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm'
      : 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50';

  return (
    <div className="mb-6 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-3">
      <nav className="mb-2 text-xs text-slate-500">
        <Link href={backHref} className="hover:text-brand-700">
          {backLabel}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{name}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {person.photoFileId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/admin/persons/${person.id}/photo`}
              alt=""
              className="h-16 w-16 rounded-xl object-cover"
            />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-xl bg-slate-200 text-2xl font-semibold text-slate-600">
              {(person.firstName[0] ?? '') + (person.lastName[0] ?? '')}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {name}
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
              {schooling && ` · ${schooling}`}
            </p>
            {contract && contract.status !== 'NO_CONTRACT' && (
              <p className="mt-2">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${BADGE[contract.status] ?? BADGE.NO_CONTRACT}`}
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
          {/* « Fiche » ouvre la navigation : sans lui, on ne saurait pas
              revenir au dossier depuis un onglet annexe. */}
          <Link href={base} className={tabCls(active === 'fiche')}>
            {tDetail('tabs.fiche')}
          </Link>
          {person.type === 'STUDENT' && (
            <Link href={`${base}/finance`} className={tabCls(active === 'finance')}>
              {tDetail('finance')}
            </Link>
          )}
          {person.type === 'TEACHER' && (
            <>
              <Link href={`${base}/dashboard`} className={tabCls(active === 'dashboard')}>
                📊 {tDetail('dashboard')}
              </Link>
              <Link href={`${base}/timetable`} className={tabCls(active === 'timetable')}>
                {tDetail('timetable')}
              </Link>
            </>
          )}
          <Link href={`${base}/edit`} className={tabCls(active === 'edit')}>
            {t('actions.edit')}
          </Link>
          <PersonActions personId={person.id} isArchived={!!person.deletedAt} />
        </div>
      </header>
    </div>
  );
}
