'use client';

import { useState, type ReactNode } from 'react';

/**
 * Onglets de la page d'édition d'un élève : « Fiche » (formulaire) et
 * « Santé & sécurité ». Les deux panneaux restent montés (display:none) pour
 * préserver l'état du formulaire en changeant d'onglet.
 */
export function EditTabs({
  ficheLabel,
  santeLabel,
  fiche,
  sante,
}: {
  ficheLabel: string;
  santeLabel: string;
  fiche: ReactNode;
  sante: ReactNode | null;
}) {
  const [tab, setTab] = useState<'fiche' | 'sante'>('fiche');
  if (!sante) return <>{fiche}</>;

  const btn = (k: 'fiche' | 'sante', label: string) => (
    <button
      type="button"
      onClick={() => setTab(k)}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="mt-6 flex gap-2 border-b border-slate-200">
        {btn('fiche', ficheLabel)}
        {btn('sante', santeLabel)}
      </div>
      <div className={tab === 'fiche' ? '' : 'hidden'}>{fiche}</div>
      <div className={tab === 'sante' ? '' : 'hidden'}>{sante}</div>
    </div>
  );
}
