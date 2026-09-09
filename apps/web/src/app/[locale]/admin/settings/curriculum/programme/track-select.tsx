'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export type TrackOption = { id: string; label: string };
export type TrackGroup = { levelId: string; levelLabel: string; tracks: TrackOption[] };

/**
 * Sélecteur de filière du lycée, groupé par niveau.
 *
 * Une liste de boutons devenait illisible à 26 filières, et l'ordre global
 * entrelaçait TC, 1BAC et 2BAC (leurs `order` se recouvrent : 10, 20, 30 dans
 * chaque niveau). Le regroupement par niveau règle les deux problèmes d'un
 * coup — chaque groupe est trié alphabétiquement.
 */
export function TrackSelect({
  groups,
  currentTrackId,
  cycleId,
  locale,
}: {
  groups: TrackGroup[];
  currentTrackId: string | null;
  cycleId: string;
  locale: string;
}) {
  const t = useTranslations('admin.settings.programme');
  const router = useRouter();
  const total = groups.reduce((s, g) => s + g.tracks.length, 0);

  return (
    <label className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-slate-600">{t('trackSelect')}</span>
      <select
        value={currentTrackId ?? ''}
        onChange={(e) =>
          router.push(
            `/${locale}/admin/settings/curriculum/programme?cycle=${cycleId}&track=${e.target.value}`,
          )
        }
        className="min-w-[22rem] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        {groups.map((g) => (
          <optgroup key={g.levelId} label={g.levelLabel}>
            {g.tracks.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <span className="text-xs text-slate-400">{t('trackCount', { count: total })}</span>
    </label>
  );
}
