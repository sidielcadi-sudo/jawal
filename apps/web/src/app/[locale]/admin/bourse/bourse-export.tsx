'use client';

import { useTranslations } from 'next-intl';

export function BourseExportButton({ rows, filename }: { rows: (string | number)[][]; filename: string }) {
  const t = useTranslations('admin.bourse.finance');
  function download() {
    const header = ['Date', 'Type', 'Code', 'Titre', 'Montant', 'Mode'];
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button onClick={download} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
      {t('export')}
    </button>
  );
}
