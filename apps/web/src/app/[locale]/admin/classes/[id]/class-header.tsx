import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { localizedLabel, personDisplayName } from '@/lib/localized-name';
import { ClassCrumb } from './class-crumb';
import { ClassNav } from './class-nav';
import { ClassActions } from './class-actions';

/** Largeur commune à toutes les pages de la classe (celle du carnet). */
export const CLASS_PAGE_SHELL = 'mx-auto max-w-7xl px-4 py-8 sm:px-6';

export type ClassHeaderData = {
  id: string;
  name: string;
  nameAr: string | null;
  deletedAt?: Date | null;
  level: {
    label: string;
    labelAr: string | null;
    /** Absent sur les pages qui ne chargent pas le cycle : le sous-titre s'y adapte. */
    cycle?: { label: string; labelAr: string | null } | null;
  };
  academicYear: { label: string };
  mainTeacher?: {
    firstName: string;
    lastName: string;
    firstNameAr: string | null;
    lastNameAr: string | null;
  } | null;
};

/**
 * En-tête commun à **toutes** les pages d'une classe.
 *
 * Chaque page avait sa propre bande de titre : largeurs différentes, sous-titre
 * parfois absent, boutons tantôt dedans tantôt dehors. On changeait d'onglet et
 * la page semblait changer d'application. Un seul composant, une seule largeur.
 *
 * Les boutons sont **sous** la bande et non dedans : la bande porte l'identité
 * de la classe, la barre d'actions porte la navigation. Mélanger les deux
 * obligeait à serrer huit boutons contre le titre.
 */
export async function ClassHeader({
  cls,
  locale,
  current,
  kpis,
}: {
  cls: ClassHeaderData;
  locale: string;
  /** Libellé de l'onglet ouvert, pour le fil d'Ariane. */
  current?: string;
  /** Cartes d'indicateurs, insérées entre la bande et les boutons. */
  kpis?: ReactNode;
}) {
  const t = await getTranslations('admin.classes');
  const tDetail = await getTranslations('admin.classes.detail');
  const className = localizedLabel(locale, cls.name, cls.nameAr);

  return (
    <>
      <ClassCrumb locale={locale} classId={cls.id} className={className} current={current} />

      <header className="-mx-4 overflow-hidden rounded-2xl border border-brand-200 title-band px-4 py-3 shadow-sm sm:-mx-6">
        <h1 className="text-xl font-semibold text-slate-900">
          {className}
          {cls.deletedAt && (
            <span className="ms-3 rounded bg-slate-200 px-2 py-0.5 align-middle text-xs text-slate-600">
              {t('archived')}
            </span>
          )}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {cls.level.cycle
            ? `${localizedLabel(locale, cls.level.cycle.label, cls.level.cycle.labelAr)} — `
            : ''}
          {localizedLabel(locale, cls.level.label, cls.level.labelAr)} · {cls.academicYear.label}
          {cls.mainTeacher
            ? ` · ${tDetail('mainTeacher')} : ${personDisplayName(locale, cls.mainTeacher)}`
            : ''}
        </p>
      </header>

      {kpis}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ClassNav classId={cls.id} locale={locale} isArchived={!!cls.deletedAt} />
        <ClassActions classId={cls.id} isArchived={!!cls.deletedAt} locale={locale} />
      </div>
    </>
  );
}

/** Champs à sélectionner pour alimenter `ClassHeader`. */
export const CLASS_HEADER_SELECT = {
  id: true,
  name: true,
  nameAr: true,
  deletedAt: true,
  level: {
    select: {
      label: true,
      labelAr: true,
      cycle: { select: { label: true, labelAr: true } },
    },
  },
  academicYear: { select: { label: true } },
  mainTeacher: {
    select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true },
  },
} as const;
