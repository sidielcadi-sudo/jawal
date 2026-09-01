'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * Couverture d'un livre : vignette cliquable qui déclenche le téléversement.
 *
 * L'envoi se fait après création du livre (il lui faut un id), comme pour la
 * photo d'une personne. Le catalogue affiche donc un emplacement vide tant
 * qu'aucune image n'a été déposée.
 */
export function BookPhoto({ bookId, hasPhoto }: { bookId: string; hasPhoto: boolean }) {
  const t = useTranslations('admin.bourse');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ver, setVer] = useState(0);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch(`/api/admin/bourse/book/${bookId}/photo`, { method: 'POST', body: fd });
    setBusy(false);
    if (!r.ok) {
      setErr(await r.text());
      return;
    }
    setVer((v) => v + 1);
    router.refresh();
  }

  const src = hasPhoto || ver > 0 ? `/api/admin/bourse/book/${bookId}/photo?v=${ver}` : null;

  return (
    <label
      className="group relative block h-12 w-9 shrink-0 cursor-pointer overflow-hidden rounded border border-slate-200 bg-slate-50"
      title={err || t('bookPhoto')}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="grid h-full w-full place-items-center text-sm text-slate-300">📖</span>
      )}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={onChange}
        disabled={busy}
        className="hidden"
      />
      {busy && <span className="absolute inset-0 grid place-items-center bg-white/70 text-[9px]">…</span>}
    </label>
  );
}
