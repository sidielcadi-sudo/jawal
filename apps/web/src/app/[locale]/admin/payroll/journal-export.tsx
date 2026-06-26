'use client';

import { useTranslations } from 'next-intl';

export function JournalExportButton({ rows, filename }: { rows: (string | number)[][]; filename: string }) {
  const t = useTranslations('admin.payroll.run');
  function download() {
    const header = ['Compte', 'Libelle', 'Debit', 'Credit'];
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
    <button onClick={download} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
      {t('exportJournal')}
    </button>
  );
}
