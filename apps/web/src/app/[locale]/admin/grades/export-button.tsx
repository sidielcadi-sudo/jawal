'use client';

/**
 * Export des notes affichées, en CSV lisible par Excel (point-virgule, BOM).
 *
 * Format provisoire : l'établissement précisera les formats attendus (MASSAR,
 * bulletin officiel…). D'ici là, on exporte ce que l'écran montre.
 */
export function ExportNotesButton({
  header,
  rows,
  filename,
  label,
  emptyLabel,
}: {
  header: string[];
  rows: string[][];
  filename: string;
  label: string;
  emptyLabel: string;
}) {
  const empty = rows.length === 0;

  function download() {
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename.replace(/[\\/:*?"<>|]+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={empty}
      title={empty ? emptyLabel : undefined}
      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}
