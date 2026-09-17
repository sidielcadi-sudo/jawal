'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { setAppelCountsAsPresenceAction } from './presence-actions';

/** Paramètre : l'appel fait par l'enseignant vaut-il pointage de présence ? */
export function AppelPresenceToggle({ enabled }: { enabled: boolean }) {
  const t = useTranslations('admin.settings.attendanceReasons.appelPresence');
  const [value, setValue] = useState(enabled);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function change(next: boolean) {
    const previous = value;
    setValue(next);
    setMessage(null);
    start(async () => {
      const r = await setAppelCountsAsPresenceAction(next);
      if (!r.ok) {
        setValue(previous);
        setMessage({ ok: false, text: r.error });
        return;
      }
      setMessage({ ok: true, text: t('saved') });
    });
  }

  return (
    <section className="rounded-2xl border border-brand-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">{t('title')}</h3>
      <p className="mt-1 text-xs text-slate-500">{t('hint')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name="appelPresence"
            checked={value}
            disabled={pending}
            onChange={() => change(true)}
          />
          {t('yes')}
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name="appelPresence"
            checked={!value}
            disabled={pending}
            onChange={() => change(false)}
          />
          {t('no')}
        </label>
        {message && (
          <span className={`text-xs ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>{message.text}</span>
        )}
      </div>
    </section>
  );
}
