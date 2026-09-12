'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckboxDropdown } from '@/components/checkbox-dropdown';

export type CycleOpt = { id: string; label: string };
export type LevelOpt = { id: string; cycleId: string; label: string };
export type ClassOpt = { id: string; levelId: string; cycleId: string; name: string };
export type StatusOpt = { id: string; label: string };

/**
 * Filtres de la liste des personnes : statut, puis cycle → niveau → classe.
 *
 * Deux comportements que le rendu serveur seul ne pouvait pas offrir :
 *
 *  - **la cascade est immédiate** — choisir « Lycée » restreint aussitôt la
 *    liste des niveaux, sans attendre le clic sur « Appliquer » ;
 *  - **chaque filtre accepte plusieurs valeurs**, cochées dans un menu. Un
 *    changement de parent remet les enfants à zéro : garder une classe de
 *    collège sous un cycle Lycée ne renverrait aucun résultat.
 *
 * Convention partagée : rien de coché = aucun filtre.
 */
export function SchoolFilters({
  cycles,
  levels,
  classes,
  statuses,
  showSchool,
  cycleScope,
  initial,
}: {
  cycles: CycleOpt[];
  levels: LevelOpt[];
  classes: ClassOpt[];
  statuses: StatusOpt[];
  /** Vue Élèves : les filtres scolarité n'ont de sens que là. */
  showSchool: boolean;
  /**
   * Cycle(s) retenus par les onglets au-dessus de la liste.
   *
   * Le menu déroulant « Cycle » a disparu : il faisait doublon avec les onglets
   * Primaire / Collège / Lycée, et les deux pouvaient se contredire — onglet
   * Collège, menu Lycée, aucun résultat et rien pour l'expliquer. L'onglet est
   * désormais la seule source, et il commande la cascade niveau → classe.
   */
  cycleScope: string[];
  initial: { cycle: string[]; level: string[]; classId: string[]; status: string[] };
}) {
  const t = useTranslations('admin.persons');
  const [status, setStatus] = useState(initial.status);
  const [level, setLevel] = useState(initial.level);
  const [classId, setClassId] = useState(initial.classId);

  const inScope = (cycleId: string) => cycleScope.length === 0 || cycleScope.includes(cycleId);
  const visibleLevels = levels.filter((l) => inScope(l.cycleId));
  // La classe suit le niveau s'il est choisi, sinon le cycle de l'onglet :
  // filtrer sur le seul niveau laisserait toutes les classes visibles dès
  // qu'on s'arrête au cycle, ce qui vide le bénéfice de la cascade.
  const visibleClasses = classes.filter(
    (c) => inScope(c.cycleId) && (level.length === 0 || level.includes(c.levelId)),
  );

  void cycles; // le cycle vient des onglets, plus d'un menu ici
  const labels = {
    clear: t('filters.clearAll'),
    selectAll: t('filters.selectAll'),
    search: t('filters.searchOption'),
  };

  return (
    <>
      {statuses.length > 0 && (
        <div className="min-w-[160px]">
          <label className="block text-xs font-medium text-slate-600">{t('filters.status')}</label>
          <CheckboxDropdown
            name="status"
            options={statuses}
            selected={status}
            onChange={setStatus}
            allLabel={t('filters.allStatuses')}
            clearLabel={labels.clear}
            selectAllLabel={labels.selectAll}
            searchPlaceholder={labels.search}
          />
        </div>
      )}

      {showSchool && (
        <>
          {/* Le cycle choisi par l'onglet doit survivre à la soumission du
              formulaire de filtres, sinon appliquer une recherche renvoie sur
              « Tous les cycles » sans qu'on ait rien demandé. */}
          {cycleScope.map((id) => (
            <input key={id} type="hidden" name="cycle" value={id} />
          ))}

          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-slate-600">{t('filters.level')}</label>
            <CheckboxDropdown
              name="level"
              options={visibleLevels}
              selected={level}
              onChange={(next) => {
                setLevel(next);
                setClassId([]);
              }}
              allLabel={t('filters.allLevels')}
              clearLabel={labels.clear}
              selectAllLabel={labels.selectAll}
              searchPlaceholder={labels.search}
            />
          </div>

          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-slate-600">{t('filters.class')}</label>
            <CheckboxDropdown
              name="classId"
              options={visibleClasses.map((c) => ({ id: c.id, label: c.name }))}
              selected={classId}
              onChange={setClassId}
              allLabel={t('filters.allClasses')}
              clearLabel={labels.clear}
              selectAllLabel={labels.selectAll}
              searchPlaceholder={labels.search}
            />
          </div>
        </>
      )}
    </>
  );
}
