'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { saveThemeAction } from './actions';

const DEFAULT = '#1A56DB';
/** Défauts alignés sur globals.css : bande = brand-100 par défaut, en-tête = #A9EAFE. */
const DEFAULT_BAND = '#DBEAFE';
const DEFAULT_HEADER = '#A9EAFE';
const PRESETS = ['#1A56DB', '#0F766E', '#7C3AED', '#DB2777', '#EA580C', '#059669', '#0EA5E9', '#4F46E5'];
const HEX_RE = /^#([0-9a-fA-F]{6})$/;

function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (v: string) => void;
}) {
  const valid = HEX_RE.test(value);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="color"
        value={valid ? value : fallback}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
        aria-label={label}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={fallback}
        className={`w-32 rounded-lg border px-3 py-2 font-mono text-sm ${valid ? 'border-slate-300' : 'border-red-300'}`}
      />
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

export function AppearanceForm({
  initialPrimary,
  initialBand,
  initialTableHeader,
}: {
  initialPrimary: string | null;
  initialBand: string | null;
  initialTableHeader: string | null;
}) {
  const t = useTranslations('admin.settings.appearance');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [color, setColor] = useState(initialPrimary ?? DEFAULT);
  const [band, setBand] = useState(initialBand ?? DEFAULT_BAND);
  const [header, setHeader] = useState(initialTableHeader ?? DEFAULT_HEADER);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const valid = HEX_RE.test(color) && HEX_RE.test(band) && HEX_RE.test(header);

  function save(p: string, b: string, h: string) {
    setErr('');
    setMsg('');
    start(async () => {
      const r = await saveThemeAction(p, b, h);
      if (!r.ok) return setErr(r.error);
      setMsg(t('saved'));
      router.refresh();
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-2xl border border-brand-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">{t('title')}</h2>
        <p className="mt-1 text-xs text-slate-500">{t('hint')}</p>

        <div className="mt-4 space-y-3">
          <ColorField label={t('primary')} value={color} fallback={DEFAULT} onChange={setColor} />
          <ColorField label={t('band')} value={band} fallback={DEFAULT_BAND} onChange={setBand} />
          <ColorField
            label={t('tableHeader')}
            value={header}
            fallback={DEFAULT_HEADER}
            onChange={setHeader}
          />
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

        {/* Aperçu (couleurs en ligne — reflète les choix avant enregistrement) */}
        <div className="mt-5 rounded-xl border border-slate-200 p-4">
          <p className="mb-2 text-xs font-medium text-slate-600">{t('preview')}</p>

          {/* Bande de titre */}
          <div
            className="rounded-2xl border px-4 py-2.5"
            style={{
              borderColor: HEX_RE.test(color) ? `${color}55` : '#cbd5e1',
              backgroundImage: HEX_RE.test(band)
                ? `linear-gradient(to right, ${band}, ${band}73)`
                : undefined,
            }}
          >
            <div className="text-sm font-bold text-slate-900">{t('sampleBandTitle')}</div>
          </div>

          {/* Tableau avec en-tête */}
          <div className="mt-3 overflow-hidden rounded-xl border" style={{ borderColor: HEX_RE.test(color) ? `${color}55` : '#cbd5e1' }}>
            <table className="w-full text-xs">
              <thead style={{ backgroundColor: HEX_RE.test(header) ? header : undefined }}>
                <tr className="uppercase tracking-wide text-slate-700">
                  <th className="px-3 py-2 text-start font-medium">{t('sampleCol1')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('sampleCol2')}</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                <tr className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-700">—</td>
                  <td className="px-3 py-2 text-end tabular-nums text-slate-700">—</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm font-medium text-white shadow"
              style={{ backgroundColor: HEX_RE.test(color) ? color : DEFAULT }}
            >
              {t('sampleButton')}
            </button>
            <span
              className="rounded-full px-3 py-1 text-xs font-medium"
              style={{
                backgroundColor: HEX_RE.test(color) ? `${color}22` : '#eef',
                color: HEX_RE.test(color) ? color : DEFAULT,
              }}
            >
              {t('sampleBadge')}
            </span>
          </div>
        </div>

        {err && <p className="mt-3 text-xs text-red-700">{err}</p>}
        {msg && <p className="mt-3 text-xs text-emerald-700">{msg}</p>}

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            disabled={pending || !valid}
            onClick={() => save(color, band, header)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {pending ? t('saving') : t('save')}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setColor(DEFAULT);
              setBand(DEFAULT_BAND);
              setHeader(DEFAULT_HEADER);
              save('', '', '');
            }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {t('reset')}
          </button>
        </div>
      </div>
    </div>
  );
}
