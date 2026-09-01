'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type JustificationLabels = { view: string; add: string; replace: string };

/**
 * Justificatif d'une demande de congé ou d'absence, sur une demande déjà créée.
 *
 * Le dépôt n'est proposé que sur une demande encore en attente : une fois la
 * décision prise, la pièce fait partie du dossier examiné et ne doit plus
 * changer. La consultation, elle, reste toujours possible.
 *
 * Les libellés arrivent en props : le composant sert aussi bien la liste admin
 * (`admin.leave`) que le portail enseignant (`enseignant.leave`).
 */
export function JustificationUpload({
  requestId,
  hasFile,
  editable,
  labels,
}: {
  requestId: string;
  hasFile: boolean;
  editable: boolean;
  labels: JustificationLabels;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const url = `/api/admin/leave/${requestId}/justification`;

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch(url, { method: 'POST', body: fd });
    setBusy(false);
    if (!r.ok) {
      setErr(await r.text());
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {hasFile && (
        <a
          href={url}
          target="_blank"
          rel="noopener"
          className="text-xs font-medium text-brand-600 hover:underline"
          title={labels.view}
        >
          📎
        </a>
      )}
      {editable && (
        <label className="cursor-pointer text-xs text-slate-500 hover:text-brand-700">
          {busy ? '…' : hasFile ? labels.replace : labels.add}
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={onUpload}
            disabled={busy}
            className="hidden"
          />
        </label>
      )}
      {err && <span className="text-[10px] text-red-600">{err}</span>}
    </span>
  );
}

/**
 * Champ « joindre un justificatif » d'un formulaire de création : la demande
 * n'existe pas encore, on garde donc le fichier côté client et on l'envoie
 * après création, via `uploadJustification`.
 */
export async function uploadJustification(requestId: string, file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch(`/api/admin/leave/${requestId}/justification`, { method: 'POST', body: fd });
  return r.ok ? null : await r.text();
}
