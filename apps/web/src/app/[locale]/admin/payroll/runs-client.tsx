'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { generatePayrollRunAction, advancePayrollRunAction, deletePayrollRunAction } from './run-actions';

export function GeneratePayrollForm() {
  const t = useTranslations('admin.payroll.run');
  const router = useRouter();
  const [pending, start] = useTransition();
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const sel = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';

  function go() {
    setMsg(null);
    start(async () => {
      const r = await generatePayrollRunAction(year, month);
      setMsg(r.ok ? { ok: true, text: r.message ?? 'OK' } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={sel}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{t(`months.${m}`)}</option>)}
      </select>
      <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className={`${sel} w-24`} />
      <button onClick={go} disabled={pending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
        {pending ? '…' : t('generate')}
      </button>
      {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-red-700'}`}>{msg.text}</span>}
    </div>
  );
}

export function RunWorkflowButtons({ runId, status }: { runId: string; status: string }) {
  const t = useTranslations('admin.payroll.run');
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (a: 'validate' | 'approve' | 'close' | 'reopen') => start(async () => { await advancePayrollRunAction(runId, a); router.refresh(); });

  const next =
    status === 'CALCULATED' ? { a: 'validate' as const, l: t('validateRh'), c: 'bg-sky-600 hover:bg-sky-700' }
    : status === 'RH_VALIDATED' ? { a: 'approve' as const, l: t('approveDir'), c: 'bg-indigo-600 hover:bg-indigo-700' }
    : status === 'DIRECTION_APPROVED' ? { a: 'close' as const, l: t('close'), c: 'bg-emerald-600 hover:bg-emerald-700' }
    : null;

  return (
    <span className="flex items-center gap-1.5">
      {next && <button onClick={() => act(next.a)} disabled={pending} className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${next.c}`}>{next.l}</button>}
      {(status === 'RH_VALIDATED' || status === 'DIRECTION_APPROVED') && (
        <button onClick={() => act('reopen')} disabled={pending} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">{t('reopen')}</button>
      )}
    </span>
  );
}

export function DeleteRunButton({ runId }: { runId: string }) {
  const t = useTranslations('admin.payroll.run');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => { if (window.confirm(t('deleteConfirm'))) start(async () => { await deletePayrollRunAction(runId); router.refresh(); }); }}
      disabled={pending}
      className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
    >
      ✕
    </button>
  );
}
