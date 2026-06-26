'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createOvertimeAction,
  generateFromSubstitutionsAction,
  advanceOvertimeAction,
  deleteOvertimeAction,
} from './actions';

type Opt = { id: string; label: string };
const SOURCES = ['SUBSTITUTION', 'PARASCOLAIRE', 'AFTER_HOURS', 'EXAM_SUPERVISION', 'SPECIAL_EVENT', 'TEACHING_OVER_QUOTA'] as const;
const input = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';

export function GenerateButton() {
  const t = useTranslations('admin.overtime');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  return (
    <span className="flex items-center gap-2">
      <button
        onClick={() => start(async () => { const r = await generateFromSubstitutionsAction(); setMsg('created' in r ? t('generated', { n: r.created }) : ''); router.refresh(); })}
        disabled={pending}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {t('generate')}
      </button>
      {msg && <span className="text-xs text-emerald-600">{msg}</span>}
    </span>
  );
}

export function CreateOvertimeForm({ staff }: { staff: Opt[] }) {
  const t = useTranslations('admin.overtime');
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setErr('');
        start(async () => {
          const r = await createOvertimeAction(fd);
          if (!r.ok) return setErr('error' in r ? r.error : 'Erreur');
          ref.current?.reset();
          router.refresh();
        });
      }}
      className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-5"
    >
      <select name="personId" required defaultValue="" className={input}>
        <option value="" disabled>{t('employee')}</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <select name="source" required defaultValue="" className={input}>
        <option value="" disabled>{t('sourceLabel')}</option>
        {SOURCES.map((s) => <option key={s} value={s}>{t(`source.${s}`)}</option>)}
      </select>
      <input name="date" type="date" required className={input} />
      <input name="hours" type="number" step="0.5" min="0.5" required placeholder={t('hours')} className={input} />
      <input name="note" placeholder={t('note')} className={input} />
      <div className="lg:col-span-5">
        <button disabled={pending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">{t('add')}</button>
        {err && <span className="ms-2 text-xs text-red-700">{err}</span>}
      </div>
    </form>
  );
}

export function WorkflowButtons({ id, status }: { id: string; status: string }) {
  const t = useTranslations('admin.overtime');
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (action: 'validate' | 'approve' | 'process' | 'reject') =>
    start(async () => { await advanceOvertimeAction(id, action); router.refresh(); });
  const del = () => start(async () => { await deleteOvertimeAction(id); router.refresh(); });

  const next =
    status === 'DECLARED' ? { action: 'validate' as const, label: t('validateRh'), cls: 'bg-sky-600 hover:bg-sky-700' }
    : status === 'RH_VALIDATED' ? { action: 'approve' as const, label: t('approveDir'), cls: 'bg-indigo-600 hover:bg-indigo-700' }
    : status === 'DIRECTION_APPROVED' ? { action: 'process' as const, label: t('processAcc'), cls: 'bg-emerald-600 hover:bg-emerald-700' }
    : null;

  return (
    <span className="flex items-center justify-end gap-1.5">
      {next && (
        <button onClick={() => act(next.action)} disabled={pending} className={`rounded-lg px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50 ${next.cls}`}>{next.label}</button>
      )}
      {status !== 'PROCESSED' && status !== 'REJECTED' && (
        <button onClick={() => act('reject')} disabled={pending} className="rounded-lg border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50">{t('reject')}</button>
      )}
      {(status === 'PROCESSED' || status === 'REJECTED') && (
        <button onClick={del} disabled={pending} className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50">✕</button>
      )}
    </span>
  );
}

export function ExportCsvButton({ rows }: { rows: (string | number)[][] }) {
  const t = useTranslations('admin.overtime');
  function download() {
    const header = ['Employe', 'Date', 'Heures', 'Source', 'Statut'];
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `heures-sup-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button onClick={download} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
      {t('exportCsv')}
    </button>
  );
}
