'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { seedChartAction, createManualEntryAction, deleteEntryAction, reverseEntryAction } from './actions';

type ActResult = { ok: boolean; error?: string };
type Account = { code: string; name: string };
const input = 'rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm';

export function SeedChartButton() {
  const t = useTranslations('admin.comptabilite');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button onClick={() => start(async () => { await seedChartAction(); router.refresh(); })} disabled={pending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
      {t('seedChart')}
    </button>
  );
}

export function CreateForm({ action, className, children }: { action: (fd: FormData) => Promise<ActResult>; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [, start] = useTransition();
  const [err, setErr] = useState('');
  return (
    <form ref={ref} onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); setErr(''); start(async () => { const r = await action(fd); if (!r.ok) return setErr(r.error ?? 'Erreur'); ref.current?.reset(); router.refresh(); }); }} className={className}>
      {children}
      {err && <p className="mt-1 text-xs text-red-700">{err}</p>}
    </form>
  );
}

export function DeleteEntryButton({ id }: { id: string }) {
  const t = useTranslations('admin.comptabilite');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  return (
    <span className="flex items-center gap-1">
      {err && <span className="text-[10px] text-red-600" title={err}>!</span>}
      <button type="button" disabled={pending} onClick={() => { if (!confirm(t('deleteConfirm'))) return; start(async () => { const r = await deleteEntryAction(id); if (!r.ok) setErr(r.error ?? ''); router.refresh(); }); }} className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50">✕</button>
    </span>
  );
}

export function ReverseEntryButton({ id }: { id: string }) {
  const t = useTranslations('admin.comptabilite');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  return (
    <span className="flex items-center gap-1">
      {err && <span className="text-[10px] text-red-600" title={err}>!</span>}
      <button type="button" disabled={pending} onClick={() => { if (!confirm(t('reverseConfirm'))) return; start(async () => { const r = await reverseEntryAction(id); if (!r.ok) setErr(r.error); router.refresh(); }); }} className="text-[11px] text-slate-400 hover:text-brand-600 disabled:opacity-50">{t('reverse')}</button>
    </span>
  );
}

type Line = { accountCode: string; debit: string; credit: string; label: string };
const JOURNALS = ['OD', 'BQ', 'CA', 'VE', 'AC'] as const;

export function ManualEntryForm({ accounts }: { accounts: Account[] }) {
  const t = useTranslations('admin.comptabilite');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [journal, setJournal] = useState<string>('OD');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [label, setLabel] = useState('');
  const [lines, setLines] = useState<Line[]>([{ accountCode: '', debit: '', credit: '', label: '' }, { accountCode: '', debit: '', credit: '', label: '' }]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const totD = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totC = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(totD - totC) < 0.01 && totD > 0;

  function setLine(i: number, patch: Partial<Line>) { setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l))); }

  function submit() {
    setMsg(null);
    start(async () => {
      const r = await createManualEntryAction({
        journal: journal as 'OD',
        date,
        label,
        lines: lines.map((l) => ({ accountCode: l.accountCode, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, label: l.label || undefined })),
      });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: t('saved') });
      setLines([{ accountCode: '', debit: '', credit: '', label: '' }, { accountCode: '', debit: '', credit: '', label: '' }]);
      setLabel('');
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <label className="text-[11px] font-medium text-slate-600"><span className="mb-0.5 block">{t('journal')}</span>
          <select value={journal} onChange={(e) => setJournal(e.target.value)} className={`w-full ${input}`}>
            {JOURNALS.map((j) => <option key={j} value={j}>{t(`journals.${j}`)}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-medium text-slate-600"><span className="mb-0.5 block">{t('date')}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`w-full ${input}`} />
        </label>
        <label className="text-[11px] font-medium text-slate-600"><span className="mb-0.5 block">{t('label')}</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('labelHint')} className={`w-full ${input}`} />
        </label>
      </div>

      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr><th className="py-1 text-start">{t('account')}</th><th className="py-1 text-end">{t('debit')}</th><th className="py-1 text-end">{t('credit')}</th><th /></tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="py-1 pe-2">
                <select value={l.accountCode} onChange={(e) => setLine(i, { accountCode: e.target.value })} className={`w-full ${input}`}>
                  <option value="">—</option>
                  {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
                </select>
              </td>
              <td className="py-1 px-1"><input type="number" step="0.01" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: '' })} className={`w-24 text-end ${input}`} /></td>
              <td className="py-1 px-1"><input type="number" step="0.01" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: '' })} className={`w-24 text-end ${input}`} /></td>
              <td className="py-1 ps-1">{lines.length > 2 && <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="text-xs text-slate-400 hover:text-red-600">✕</button>}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-slate-200 font-semibold">
          <tr><td className="py-1">{t('total')}</td><td className="py-1 text-end tabular-nums">{totD.toFixed(2)}</td><td className="py-1 text-end tabular-nums">{totC.toFixed(2)}</td><td /></tr>
        </tfoot>
      </table>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setLines((ls) => [...ls, { accountCode: '', debit: '', credit: '', label: '' }])} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">+ {t('addLine')}</button>
        <span className={`text-xs ${balanced ? 'text-emerald-600' : 'text-amber-600'}`}>{balanced ? t('balanced') : t('unbalanced')}</span>
        <button type="button" onClick={submit} disabled={pending || !balanced} className="ms-auto rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">{t('post')}</button>
        {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-red-700'}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

export function ExportButton({ rows, header, filename, label }: { rows: (string | number)[][]; header: string[]; filename: string; label: string }) {
  function download() {
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${filename}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
  return <button onClick={download} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">{label}</button>;
}
