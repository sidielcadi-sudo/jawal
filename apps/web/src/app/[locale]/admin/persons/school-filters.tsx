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
  initial,
}: {
  cycles: CycleOpt[];
  levels: LevelOpt[];
  classes: ClassOpt[];
  statuses: StatusOpt[];
  /** Vue Élèves : les filtres scolarité n'ont de sens que là. */
  showSchool: boolean;
  initial: { cycle: string[]; level: string[]; classId: string[]; status: string[] };
}) {
  const t = useTranslations('admin.persons');
  const [status, setStatus] = useState(initial.status);
  const [cycle, setCycle] = useState(initial.cycle);
  const [level, setLevel] = useState(initial.level);
  const [classId, setClassId] = useState(initial.classId);

  const visibleLevels = levels.filter((l) => cycle.length === 0 || cycle.includes(l.cycleId));
  // La classe suit le niveau s'il est choisi, sinon le cycle : filtrer sur le
  // seul niveau laisserait toutes les classes visibles dès qu'on s'arrête au
  // cycle, ce qui vide le bénéfice de la cascade.
  const visibleClasses = classes.filter(
    (c) =>
      (level.length === 0 || level.includes(c.levelId)) &&
      (cycle.length === 0 || cycle.includes(c.cycleId)),
  );

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
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-slate-600">{t('filters.cycle')}</label>
            <CheckboxDropdown
              name="cycle"
              options={cycles}
              selected={cycle}
              onChange={(next) => {
                setCycle(next);
                setLevel([]);
                setClassId([]);
              }}
              allLabel={t('filters.allCycles')}
              clearLabel={labels.clear}
              selectAllLabel={labels.selectAll}
              searchPlaceholder={labels.search}
            />
          </div>

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
