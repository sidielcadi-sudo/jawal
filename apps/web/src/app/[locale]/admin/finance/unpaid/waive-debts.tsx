'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { waiveInstallmentDebtsAction } from '@/app/[locale]/admin/persons/[id]/finance/actions';

export type WaiveItem = {
  id: string;
  label: string;
  dueDate: string;
  amount: number;
  paid: number;
  remaining: number;
};

export type WaiveYear = {
  yearId: string | null;
  yearLabel: string;
  previous: boolean;
  unpaid: number;
  items: WaiveItem[];
};

/**
 * Effacement de créances depuis l'écran de recouvrement : ouvre le détail des
 * échéances non soldées de l'élève, **groupées par année scolaire**, chacune
 * cochable. Un seul motif couvre la sélection — un arbitrage de dette porte sur
 * une situation, pas sur une ligne d'échéancier, et faire ressaisir le motif
 * quarante fois n'ajouterait aucune information.
 *
 * La remise gracieuse reste tracée (montant, motif, auteur) et donne lieu à une
 * écriture OD, d'où le motif obligatoire.
 */
export function WaiveDebtsButton({
  studentName,
  years,
  currency,
  canWaive,
  canWaivePrevious,
  closedHint,
}: {
  studentName: string;
  years: WaiveYear[];
  currency: string;
  /** Créances de l'année active : faux hors de la fenêtre de fin d'année. */
  canWaive: boolean;
  /** Créances des exercices antérieurs : ouvertes indépendamment de la fenêtre. */
  canWaivePrevious: boolean;
  closedHint: string;
}) {
  const t = useTranslations('admin.finance.unpaid');
  const tw = useTranslations('admin.studentFinance.waive');
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  /** Échéances cochées, par identifiant. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');

  const fmt = (n: number) =>
    n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /** Une année est-elle effaçable ? Les antérieures suivent leur propre porte. */
  const yearOpen = (y: WaiveYear) => (y.previous ? canWaivePrevious : canWaive);

  const selectable = useMemo(
    () => new Map(years.filter(yearOpen).flatMap((y) => y.items.map((it) => [it.id, it] as const))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [years, canWaive, canWaivePrevious],
  );

  const selectedTotal = useMemo(
    () => [...selected].reduce((s2, id) => s2 + (selectable.get(id)?.remaining ?? 0), 0),
    [selected, selectable],
  );

  function toggle(id: string) {
    setError('');
    setNotice('');
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Coche / décoche toutes les lignes effaçables d'une année. */
  function toggleYear(y: WaiveYear) {
    const ids = y.items.map((it) => it.id);
    const allOn = ids.every((id) => selected.has(id));
    setError('');
    setNotice('');
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    setError('');
    setNotice('');
    setSelected(new Set(selectable.keys()));
  }

  function confirmWaive() {
    setError('');
    setNotice('');
    if (selected.size === 0) {
      setError(tw('selectionRequired'));
      return;
    }
    if (!reason.trim()) {
      setError(tw('reasonRequired'));
      return;
    }
    start(async () => {
      const r = await waiveInstallmentDebtsAction([...selected], reason);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Lot partiellement appliqué : on le dit plutôt que de laisser croire à
      // un effacement complet.
      const skipped = r.data?.skipped ?? [];
      if (skipped.length > 0) {
        setNotice(
          tw('partial', {
            waived: r.data?.waived ?? 0,
            skipped: skipped.length,
            first: skipped[0]!.reason,
          }),
        );
      }
      setSelected(new Set());
      setReason('');
      router.refresh();
    });
  }

  function close() {
    setOpen(false);
    setSelected(new Set());
    setReason('');
    setError('');
    setNotice('');
  }

  // Antérieures d'abord : c'est la dette reportée que cet écran sert à solder.
  const previousYears = years.filter((y) => y.previous);
  const currentYears = years.filter((y) => !y.previous);
  const previousTotal = previousYears.reduce((s2, y) => s2 + y.unpaid, 0);

  const renderYear = (y: WaiveYear) => {
    const openYear = yearOpen(y);
    const ids = y.items.map((it) => it.id);
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id));

    return (
      <div key={y.yearId ?? 'none'} className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
              y.previous ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {y.yearLabel}
            {y.previous ? ` · ${t('previousTag')}` : ''}
          </span>
          <span className="text-xs tabular-nums text-red-700">
            {fmt(y.unpaid)} {currency}
          </span>
          {openYear ? (
            <button
              type="button"
              onClick={() => toggleYear(y)}
              className="rounded-md border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
            >
              {allOn ? tw('unselectYear') : tw('selectYear')}
            </button>
          ) : (
            // L'année en cours hors fenêtre : on montre les lignes, on n'ouvre
            // pas les cases. Le motif est rappelé plus haut dans la modale.
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
              {tw('lockedYear')}
            </span>
          )}
        </div>
        <table className="mt-1.5 w-full text-xs">
          <thead className="text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-8 px-2 py-1" />
              <th className="px-2 py-1 text-start">{t('installment')}</th>
              <th className="px-2 py-1 text-start">{t('dueOn')}</th>
              <th className="px-2 py-1 text-end">{t('due')}</th>
              <th className="px-2 py-1 text-end">{t('paid')}</th>
              <th className="px-2 py-1 text-end">{t('remaining')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {y.items.map((it) => (
              <tr key={it.id} className={selected.has(it.id) ? 'bg-amber-50' : undefined}>
                <td className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={selected.has(it.id)}
                    disabled={!openYear || pending}
                    onChange={() => toggle(it.id)}
                    aria-label={it.label}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500 disabled:opacity-40"
                  />
                </td>
                <td className="px-2 py-1.5 text-slate-800">{it.label}</td>
                <td className="px-2 py-1.5 text-slate-500">
                  {new Date(it.dueDate).toLocaleDateString(locale)}
                </td>
                <td className="px-2 py-1.5 text-end tabular-nums text-slate-700">
                  {fmt(it.amount)}
                </td>
                <td className="px-2 py-1.5 text-end tabular-nums text-emerald-700">
                  {fmt(it.paid)}
                </td>
                <td className="px-2 py-1.5 text-end font-semibold tabular-nums text-red-700">
                  {fmt(it.remaining)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ms-1 inline-flex items-center rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
      >
        {tw('action')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={close}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white text-start shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="overflow-y-auto p-5 pb-2">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">
                  {tw('title')} — <span className="text-slate-600">{studentName}</span>
                </h3>
                <button
                  type="button"
                  onClick={close}
                  className="text-slate-400 hover:text-slate-700"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-amber-700">{tw('hint')}</p>

              {/* La fermeture ne concerne que l'année en cours : si l'élève a de
                  la dette reportée, elle reste effaçable et il faut le dire. */}
              {!canWaive && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {closedHint}
                  {previousYears.length > 0 && canWaivePrevious && (
                    <span className="block pt-1 text-slate-500">{tw('previousStillOpen')}</span>
                  )}
                </div>
              )}

              {/* Les créances des exercices antérieurs d'abord, dans leur propre
                  bloc avec sous-total : c'est la dette reportée, celle qu'on
                  vient solder ou effacer ici. L'année en cours suit. */}
              {previousYears.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50/60 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-amber-900">
                      ⚠ {t('previousSection')}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-red-700">
                      {fmt(previousTotal)} {currency}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-amber-800">{t('previousSectionHint')}</p>
                </div>
              )}

              {previousYears.map(renderYear)}

              {previousYears.length > 0 && currentYears.length > 0 && (
                <div className="mt-5 border-t border-slate-200 pt-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t('currentSection')}
                  </span>
                </div>
              )}

              {currentYears.map(renderYear)}
            </div>

            {/* Barre d'action collée en bas : la sélection se fait en haut, la
                décision se prend ici — elle doit rester visible en défilant. */}
            <div className="border-t border-slate-200 bg-slate-50/80 px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-600">
                  {tw('selectedCount', { count: selected.size })}
                  {selected.size > 0 && (
                    <strong className="ms-2 tabular-nums text-red-700">
                      {fmt(selectedTotal)} {currency}
                    </strong>
                  )}
                </span>
                {selectable.size > 0 && (
                  <button
                    type="button"
                    onClick={selectAll}
                    disabled={pending}
                    className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                  >
                    {tw('selectAll')}
                  </button>
                )}
              </div>

              <label className="mt-2 block text-xs font-medium text-slate-700">{tw('reason')}</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder={tw('reasonPlaceholder')}
                disabled={selected.size === 0 || pending}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              />
              {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
              {notice && <p className="mt-1 text-xs text-amber-800">{notice}</p>}

              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  disabled={pending || selected.size === 0}
                  onClick={confirmWaive}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-40"
                >
                  {pending
                    ? tw('waiving')
                    : tw('confirmSelection', { count: selected.size })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
