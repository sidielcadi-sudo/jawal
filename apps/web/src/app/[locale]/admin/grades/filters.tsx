'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

type Opt = { id: string; label: string };

/**
 * Sélecteurs classe / matière / période.
 *
 * La navigation passe par l'URL plutôt que par un état local : le carnet
 * affiché reste partageable — « regarde les maths de 2BAC-SM au 3ᵉ trimestre »
 * doit tenir dans un lien — et survit à un rechargement.
 *
 * Changer de classe remet la matière à zéro : les matières dépendent de la
 * filière, celle d'une autre classe n'aurait aucun sens ici. Changer d'année
 * remet tout à zéro, pour la même raison : classes, matières et périodes
 * appartiennent à un exercice donné.
 */
export function GradeFilters({
  base,
  years,
  classes,
  subjects,
  periods,
  selected,
}: {
  base: string;
  years: Opt[];
  classes: Opt[];
  subjects: Opt[];
  periods: Opt[];
  selected: { yearId: string; classId: string; subjectId: string; periodId: string };
}) {
  const t = useTranslations('admin.gradesOverview');
  const router = useRouter();

  const go = (patch: Partial<typeof selected>) => {
    const next = { ...selected, ...patch };
    const qs = new URLSearchParams({ year: next.yearId });
    if (patch.yearId !== undefined) {
      // Nouvelle année : la page choisit elle-même la première classe et la
      // période courante. Reporter les anciens identifiants ne donnerait rien.
      router.push(`${base}?${qs.toString()}`);
      return;
    }
    qs.set('class', next.classId);
    if (patch.classId === undefined && next.subjectId) qs.set('subject', next.subjectId);
    if (next.periodId) qs.set('period', next.periodId);
    router.push(`${base}?${qs.toString()}`);
  };

  const cls =
    'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800';

  return (
    <div className="grid grid-cols-1 gap-3 rounded-2xl border border-brand-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="block text-xs font-medium text-slate-600">
        {t('year')}
        <select value={selected.yearId} onChange={(e) => go({ yearId: e.target.value })} className={cls}>
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-medium text-slate-600">
        {t('class')}
        <select value={selected.classId} onChange={(e) => go({ classId: e.target.value })} className={cls}>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-medium text-slate-600">
        {t('subject')}
        <select
          value={selected.subjectId}
          onChange={(e) => go({ subjectId: e.target.value })}
          disabled={subjects.length === 0}
          className={cls}
        >
          {subjects.length === 0 && <option value="">{t('noSubject')}</option>}
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-medium text-slate-600">
        {t('period')}
        <select
          value={selected.periodId}
          onChange={(e) => go({ periodId: e.target.value })}
          className={cls}
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
