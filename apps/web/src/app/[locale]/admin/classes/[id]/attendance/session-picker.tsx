'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ClassDaySession } from '@/lib/teacher-attendance';

/**
 * Choix de la séance sur laquelle porte l'appel : la date, puis le créneau —
 * qui apporte avec lui la matière et le professeur.
 *
 * Sans ce choix, l'appel administratif se posait sur « la classe, ce jour »,
 * une clé que le portail prof n'utilise jamais : les deux feuilles pouvaient
 * décrire la même heure de cours sans jamais se rejoindre. En passant par une
 * case d'emploi du temps, l'administration écrit dans la même séance que le
 * professeur.
 */
export function SessionPicker({
  basePath,
  date,
  sessions,
  selectedEntryId,
}: {
  basePath: string;
  date: string;
  sessions: ClassDaySession[];
  selectedEntryId: string | null;
}) {
  const t = useTranslations('admin.attendance.session');
  const router = useRouter();

  const go = (nextDate: string, entry: string | null) =>
    router.push(`${basePath}?date=${nextDate}${entry ? `&entry=${entry}` : ''}`);

  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-xs font-medium text-slate-700">
          <span className="mb-1 block">{t('date')}</span>
          <input
            type="date"
            value={date}
            // Changer de jour change les séances : on repart sans créneau.
            onChange={(e) => e.target.value && go(e.target.value, null)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </label>

        <label className="min-w-[18rem] flex-1 text-xs font-medium text-slate-700">
          <span className="mb-1 block">{t('slot')}</span>
          <select
            value={selectedEntryId ?? ''}
            onChange={(e) => go(date, e.target.value || null)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">{t('wholeDay')}</option>
            {sessions.map((s) => (
              <option key={s.entryId} value={s.entryId}>
                {`${s.slotStart}–${s.slotEnd} · ${s.subject ?? t('noSubject')} · ${
                  s.teacherName ?? t('noTeacher')
                }${s.done ? ` — ${t('done')}` : s.draft ? ` — ${t('draft')}` : ''}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {sessions.length === 0 ? t('noSessions') : t('hint')}
      </p>
    </div>
  );
}
