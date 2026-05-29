'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export function GradesExportForm({
  classes,
  periods,
}: {
  classes: { id: string; name: string }[];
  periods: { id: string; label: string }[];
}) {
  const t = useTranslations('admin.exports.grades');
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [periodId, setPeriodId] = useState(periods[0]?.id ?? '');

  const href =
    classId && periodId
      ? `/api/admin/exports/grades.csv?classId=${classId}&periodId=${periodId}`
      : '#';

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('class')}</label>
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm"
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('period')}</label>
        <select
          value={periodId}
          onChange={(e) => setPeriodId(e.target.value)}
          className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm"
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <a
        href={href}
        download
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-brand-700"
      >
        📥 {t('download')}
      </a>
    </div>
  );
}
