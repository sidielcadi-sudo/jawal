import Link from 'next/link';
import type { DailyBoard } from '@/lib/vie-scolaire-board';
import { VISIBLE, slotLabel, type ColDef } from '../vie-scolaire/journee/board-parts';

/**
 * Tableau journalier « Par créneau », transposé : les créneaux horaires en
 * colonnes, les types d'absence en lignes.
 *
 * Le tableau de bord le lit verticalement (un créneau par ligne) ; ici, une
 * journée tient en largeur et chaque type se suit d'un coup d'œil d'un bout à
 * l'autre de la journée. Mêmes chiffres, mêmes cases cliquables.
 */
export function SlotGrid({
  board,
  hrefFor,
  rowLabel,
  headerLabel,
  totalLabel,
  emptyLabel,
  activeSlot,
  activeCol,
}: {
  board: DailyBoard;
  hrefFor: (slot: string, col: string) => string;
  rowLabel: (key: string) => string;
  headerLabel: string;
  totalLabel: string;
  emptyLabel: string;
  activeSlot?: string;
  activeCol?: string;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <th className="sticky start-0 z-10 bg-slate-50 px-3 py-2 text-start font-semibold">{headerLabel}</th>
            {board.rows.map((r) => (
              <th key={r.periodLabel} className="whitespace-nowrap px-2 py-2 text-center font-semibold">
                {slotLabel(r.periodLabel)}
                {r.label && (
                  <div className="text-[10px] font-normal normal-case tracking-normal text-slate-400">{r.label}</div>
                )}
              </th>
            ))}
            <th className="border-s border-slate-200 px-3 py-2 text-center font-semibold">{totalLabel}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {board.rows.length === 0 ? (
            <tr>
              <td colSpan={2} className="px-4 py-8 text-center text-sm text-slate-400">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            VISIBLE.map((col) => (
              <tr key={col.key} className="hover:bg-slate-50/60">
                <th
                  scope="row"
                  className={`sticky start-0 z-10 whitespace-nowrap bg-white px-3 py-2 text-start text-xs font-medium ${
                    col.kind === 'placeholder' ? 'text-slate-300' : 'text-slate-700'
                  }`}
                >
                  {rowLabel(col.key)}
                </th>
                {board.rows.map((row) => (
                  <Cell
                    key={row.periodLabel}
                    col={col}
                    value={col.kind === 'data' ? row.counts[col.key] : 0}
                    href={hrefFor(row.periodLabel, col.key)}
                    active={activeSlot === row.periodLabel && activeCol === col.key}
                  />
                ))}
                <td className="border-s border-slate-200 bg-slate-50 px-3 py-2 text-center font-semibold tabular-nums text-slate-700">
                  {col.kind === 'data' ? (
                    board.totals[col.key] || <span className="text-slate-300">—</span>
                  ) : col.kind === 'convocations' ? (
                    // Les convocations se comptent à la journée, sans créneau.
                    board.convocations || <span className="text-slate-300">—</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ col, value, href, active }: { col: ColDef; value: number; href: string; active: boolean }) {
  if (col.kind !== 'data') {
    return (
      <td className="px-2 py-2 text-center text-slate-300">
        <span aria-hidden>—</span>
      </td>
    );
  }
  const base = 'block rounded px-2 py-1 text-center tabular-nums';
  if (value === 0) {
    return (
      <td className="px-1 py-1 text-center text-slate-300">
        <span className={base}>0</span>
      </td>
    );
  }
  const tone =
    col.key === 'presents' ? 'text-emerald-700' : col.key === 'absNonRA' ? 'text-red-700' : 'text-slate-800';
  if (!col.clickable) {
    return (
      <td className="px-1 py-1">
        <span className={`${base} font-semibold ${tone}`}>{value}</span>
      </td>
    );
  }
  return (
    <td className="px-1 py-1">
      <Link
        href={href}
        className={`${base} font-semibold ${tone} hover:bg-brand-50 ${active ? 'ring-2 ring-brand-400' : ''}`}
      >
        {value}
      </Link>
    </td>
  );
}
