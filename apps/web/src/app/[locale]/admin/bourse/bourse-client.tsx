'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { seedBookConfigAction, updateBookConfigAction, setCampaignStatusAction, createBookAction } from './actions';

type ActResult = { ok: boolean; error?: string; id?: string };

export function CreateForm({ action, className, children }: { action: (fd: FormData) => Promise<ActResult>; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [, start] = useTransition();
  const [err, setErr] = useState('');
  return (
    <form
      ref={ref}
      onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); setErr(''); start(async () => { const r = await action(fd); if (!r.ok) return setErr(r.error ?? 'Erreur'); ref.current?.reset(); router.refresh(); }); }}
      className={className}
    >
      {children}
      {err && <p className="mt-1 text-xs text-red-700">{err}</p>}
    </form>
  );
}

export function CreateBookForm({ className, children }: { className?: string; children: React.ReactNode }) {
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
        const cover = fd.get('cover');
        fd.delete('cover');
        setErr('');
        start(async () => {
          const r = await createBookAction(fd);
          if (!r.ok) return setErr(r.error ?? 'Erreur');
          if (cover instanceof File && cover.size > 0 && r.id) {
            const up = new FormData();
            up.append('file', cover);
            const res = await fetch(`/api/admin/bourse/book/${r.id}/photo`, { method: 'POST', body: up });
            if (!res.ok) setErr(await res.text());
          }
          ref.current?.reset();
          router.refresh();
        });
      }}
      className={className}
      aria-busy={pending}
    >
      {children}
      {err && <p className="mt-1 text-xs text-red-700">{err}</p>}
    </form>
  );
}

export function DeleteButton({ onDelete, confirmText = 'Supprimer ?' }: { onDelete: () => Promise<ActResult>; confirmText?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  return (
    <span className="flex items-center gap-1">
      {err && <span className="text-[10px] text-red-600" title={err}>!</span>}
      <button type="button" disabled={pending} onClick={() => { if (!confirm(confirmText)) return; start(async () => { const r = await onDelete(); if (!r.ok) setErr(r.error ?? ''); router.refresh(); }); }} className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50">✕</button>
    </span>
  );
}

export function SeedConfigButton() {
  const t = useTranslations('admin.bourse');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button onClick={() => start(async () => { await seedBookConfigAction(); router.refresh(); })} disabled={pending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
      {t('seedConfig')}
    </button>
  );
}

type Config = { id: string; commissionMode: string; commissionValue: number; labelPrefix: string; pricingByCondition: Record<string, number> };

export function ConfigForm({ config }: { config: Config }) {
  const t = useTranslations('admin.bourse');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const input = 'rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm';
  const p = config.pricingByCondition ?? {};
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); setMsg(''); start(async () => { const r = await updateBookConfigAction(fd); setMsg(r.ok ? t('saved') : r.error ?? ''); if (r.ok) router.refresh(); }); }}
      className="space-y-3"
    >
      <input type="hidden" name="id" value={config.id} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <label className="block text-[11px] font-medium text-slate-600"><span className="mb-0.5 block">{t('commissionMode')}</span>
          <select name="commissionMode" defaultValue={config.commissionMode} className={input}>
            <option value="PERCENT">{t('percent')}</option>
            <option value="FIXED">{t('fixed')}</option>
          </select>
        </label>
        <label className="block text-[11px] font-medium text-slate-600"><span className="mb-0.5 block">{t('commissionValue')}</span>
          <input name="commissionValue" type="number" step="any" defaultValue={config.commissionValue} className={input} />
        </label>
        <label className="block text-[11px] font-medium text-slate-600"><span className="mb-0.5 block">{t('labelPrefix')}</span>
          <input name="labelPrefix" defaultValue={config.labelPrefix} className={input} />
        </label>
      </div>
      <div>
        <div className="mb-1 text-[11px] font-medium text-slate-600">{t('pricingTitle')}</div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {(['NEW', 'VERY_GOOD', 'GOOD', 'FAIR'] as const).map((c) => (
            <label key={c} className="block text-[11px] text-slate-500"><span className="mb-0.5 block">{t(`condition.${c}`)}</span>
              <input name={`p_${c}`} type="number" step="0.05" min="0" max="1" defaultValue={p[c] ?? ''} className={input} />
            </label>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-slate-400">{t('pricingHint')}</p>
      </div>
      <div className="flex items-center gap-2">
        <button disabled={pending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">{t('save')}</button>
        {msg && <span className="text-xs text-emerald-600">{msg}</span>}
      </div>
    </form>
  );
}

export function CampaignStatusButton({ id, status }: { id: string; status: string }) {
  const t = useTranslations('admin.bourse');
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = status === 'OPEN' ? 'CLOSED' : 'OPEN';
  return (
    <button onClick={() => start(async () => { await setCampaignStatusAction(id, next as 'OPEN' | 'CLOSED'); router.refresh(); })} disabled={pending} className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50">
      {status === 'OPEN' ? t('close') : t('reopen')}
    </button>
  );
}
