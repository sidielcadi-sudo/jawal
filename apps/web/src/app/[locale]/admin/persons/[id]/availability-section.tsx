import { getTranslations } from 'next-intl/server';
import type { AvailabilityMap } from '@/lib/kpi-edt';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
type Day = (typeof DAYS)[number];

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Total hebdomadaire, en heures — la capacité que voit le solveur d'EDT. */
function weeklyHours(av: AvailabilityMap): number {
  let total = 0;
  for (const day of DAYS) {
    for (const s of av[day] ?? []) total += Math.max(0, minutes(s.to) - minutes(s.from));
  }
  return Math.round((total / 60) * 10) / 10;
}

/**
 * Disponibilités hebdomadaires d'un enseignant, en lecture.
 *
 * Les jours fermés restent affichés, grisés : une semaine amputée de ses jours
 * vides se lit mal — on ne sait plus si le samedi est fermé ou simplement
 * absent de la saisie. C'est exactement la distinction dont le solveur d'EDT
 * dépend.
 */
export async function AvailabilitySection({
  availability,
  editHref,
}: {
  availability: unknown;
  editHref: string;
}) {
  const t = await getTranslations('admin.persons.detail.availability');
  const tDay = await getTranslations('admin.persons.form.hr.day');

  const av = (availability as AvailabilityMap | null) ?? {};
  const total = weeklyHours(av);
  const empty = DAYS.every((d) => (av[d] ?? []).length === 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-brand-200 bg-white p-5">
      <h2 className="-mx-5 -mt-5 mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 table-head px-5 py-3 text-sm font-semibold text-slate-700">
        <span>{t('title')}</span>
        {!empty && (
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800">
            {t('weekly', { hours: total })}
          </span>
        )}
      </h2>

      {empty ? (
        <p className="text-sm text-slate-400">
          {t('none')}{' '}
          <a href={editHref} className="text-brand-700 hover:underline">
            {t('define')}
          </a>
        </p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {DAYS.map((day) => {
            const slots = av[day] ?? [];
            return (
              <li key={day} className="flex items-baseline gap-3">
                <span
                  className={`w-24 shrink-0 text-xs font-medium ${
                    slots.length === 0 ? 'text-slate-400' : 'text-slate-700'
                  }`}
                >
                  {tDay(day)}
                </span>
                {slots.length === 0 ? (
                  <span className="text-xs text-slate-400">{t('closed')}</span>
                ) : (
                  <span className="flex flex-wrap gap-1.5">
                    {slots.map((s, i) => (
                      <span
                        key={i}
                        className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium tabular-nums text-emerald-800"
                      >
                        {s.from} – {s.to}
                      </span>
                    ))}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
