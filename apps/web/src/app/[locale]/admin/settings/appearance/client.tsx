'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { saveThemeAction } from './actions';

const DEFAULT = '#1A56DB';
const PRESETS = ['#1A56DB', '#0F766E', '#7C3AED', '#DB2777', '#EA580C', '#059669', '#0EA5E9', '#4F46E5'];
const HEX_RE = /^#([0-9a-fA-F]{6})$/;

export function AppearanceForm({ initialPrimary }: { initialPrimary: string | null }) {
  const t = useTranslations('admin.settings.appearance');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [color, setColor] = useState(initialPrimary ?? DEFAULT);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const valid = HEX_RE.test(color);

  function save(value: string) {
    setErr(''); setMsg('');
    start(async () => {
      const r = await saveThemeAction(value);
      if (!r.ok) return setErr(r.error);
      setMsg(t('saved'));
      router.refresh();
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">{t('title')}</h2>
        <p className="mt-1 text-xs text-slate-500">{t('hint')}</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="color"
            value={valid ? color : DEFAULT}
            onChange={(e) => setColor(e.target.value.toUpperCase())}
            className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
            aria-label={t('pick')}
          />
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#1A56DB"
            className={`w-32 rounded-lg border px-3 py-2 font-mono text-sm ${valid ? 'border-slate-300' : 'border-red-300'}`}
          />
          <span className="text-xs text-slate-500">{t('primary')}</span>
        </div>

        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium text-slate-600">{t('presets')}</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                title={c}
                className={`h-7 w-7 rounded-full ring-2 ring-offset-2 transition ${color.toUpperCase() === c ? 'ring-slate-700' : 'ring-transparent hover:ring-slate-300'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Aperçu (couleurs en ligne — reflète la couleur choisie avant enregistrement) */}
        <div className="mt-5 rounded-xl border border-slate-200 p-4">
          <p className="mb-2 text-xs font-medium text-slate-600">{t('preview')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="rounded-lg px-4 py-2 text-sm font-medium text-white shadow" style={{ backgroundColor: valid ? color : DEFAULT }}>
              {t('sampleButton')}
            </button>
            <span className="rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: valid ? `${color}22` : '#eef', color: valid ? color : DEFAULT }}>
              {t('sampleBadge')}
            </span>
            <div className="h-10 w-24 rounded-lg" style={{ background: valid ? `linear-gradient(135deg, ${color}, ${color}bb)` : '#ccc' }} />
          </div>
        </div>

        {err && <p className="mt-3 text-xs text-red-700">{err}</p>}
        {msg && <p className="mt-3 text-xs text-emerald-700">{msg}</p>}

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            disabled={pending || !valid}
            onClick={() => save(color)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {pending ? t('saving') : t('save')}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => { setColor(DEFAULT); save(''); }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {t('reset')}
          </button>
        </div>
      </div>
    </div>
  );
}
