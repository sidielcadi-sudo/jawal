'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

type Opt = { id: string; name: string };

/**
 * Filtres du carnet : niveau → classe → élève, plus une période facultative.
 *
 * La navigation se fait au changement (pas de bouton « Filtrer »), et chaque
 * cran remet à zéro les crans plus fins : changer de niveau invalide la classe
 * choisie, changer de classe invalide l'élève. Les bornes de date, elles, sont
 * conservées — on veut pouvoir balayer plusieurs classes sur la même période.
 */
export function CarnetFilters({
  levels,
  classes,
  students,
  levelId = null,
  classId,
  studentId,
  from = '',
  to = '',
}: {
  /** Absent = pas de filtre niveau ni de période (carnet du portail prof). */
  levels?: Opt[];
  classes: Opt[];
  students: Opt[];
  levelId?: string | null;
  classId: string | null;
  studentId: string | null;
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('carnet.filters');

  const go = (patch: Record<string, string>) => {
    const q = new URLSearchParams({
      level: levelId ?? '',
      class: classId ?? '',
      student: studentId ?? '',
      from,
      to,
      ...patch,
    });
    for (const [k, v] of [...q]) if (!v) q.delete(k);
    router.push(`${pathname}?${q.toString()}`);
  };

  const sel = 'rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm';

  return (
    <div className="mt-4 flex flex-wrap items-end gap-3">
      {levels && (
        <Field label={t('level')}>
          <select
            value={levelId ?? ''}
            onChange={(e) => go({ level: e.target.value, class: '', student: '' })}
            className={sel}
          >
            <option value="">{t('allLevels')}</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label={t('class')}>
        <select
          value={classId ?? ''}
          onChange={(e) => go({ class: e.target.value, student: '' })}
          className={sel}
        >
          <option value="">{t('allClasses')}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t('student')}>
        <select
          value={studentId ?? ''}
          onChange={(e) => go({ student: e.target.value })}
          className={`${sel} min-w-[14rem]`}
        >
          <option value="">{t('allStudents')}</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>

      {levels && (
        <>
          <Field label={t('from')}>
            <input
              type="date"
              value={from}
              onChange={(e) => go({ from: e.target.value })}
              className={sel}
            />
          </Field>

          <Field label={t('to')}>
            <input
              type="date"
              value={to}
              onChange={(e) => go({ to: e.target.value })}
              className={sel}
            />
          </Field>
          {(from || to) && (
            <button
              type="button"
              onClick={() => go({ from: '', to: '' })}
              className="rounded-lg px-2 py-2 text-xs text-slate-500 hover:text-slate-700"
            >
              {t('clearDates')}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
