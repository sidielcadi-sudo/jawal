'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { seedPayrollConfigAction, updatePayrollConfigAction, upsertEmployeeProfileAction } from './actions';

const input = 'w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm';

export function SeedConfigButton() {
  const t = useTranslations('admin.payroll');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(async () => { await seedPayrollConfigAction(); router.refresh(); })}
      disabled={pending}
      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
    >
      {t('seedConfig')}
    </button>
  );
}

type Config = {
  id: string;
  cnssEmployeeRate: number; cnssCeiling: number; amoEmployeeRate: number;
  cnssEmployerRate: number; familyAllowanceRate: number; amoEmployerRate: number; trainingTaxRate: number;
  professionalExpenseRate: number; professionalExpenseCeilingMonthly: number;
  familyDeductionPerDependentMonthly: number; maxDependents: number;
  irBrackets: unknown;
};

export function ConfigEditForm({ config }: { config: Config }) {
  const t = useTranslations('admin.payroll');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fields: [keyof Config, string][] = [
    ['cnssEmployeeRate', t('cfg.cnssEmployee')], ['cnssCeiling', t('cfg.cnssCeiling')], ['amoEmployeeRate', t('cfg.amoEmployee')],
    ['cnssEmployerRate', t('cfg.cnssEmployer')], ['familyAllowanceRate', t('cfg.familyAllowance')], ['amoEmployerRate', t('cfg.amoEmployer')], ['trainingTaxRate', t('cfg.trainingTax')],
    ['professionalExpenseRate', t('cfg.proRate')], ['professionalExpenseCeilingMonthly', t('cfg.proCeiling')],
    ['familyDeductionPerDependentMonthly', t('cfg.familyDeduction')], ['maxDependents', t('cfg.maxDependents')],
  ];

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMsg(null);
    start(async () => {
      const r = await updatePayrollConfigAction(fd);
      setMsg(r.ok ? { ok: true, text: t('saved') } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input type="hidden" name="id" value={config.id} />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {fields.map(([k, label]) => (
          <label key={k} className="block text-[11px] font-medium text-slate-600">
            <span className="mb-0.5 block">{label}</span>
            <input name={k} type="number" step="any" defaultValue={String(config[k])} className={input} />
          </label>
        ))}
      </div>
      <label className="block text-[11px] font-medium text-slate-600">
        <span className="mb-0.5 block">{t('cfg.irBrackets')}</span>
        <textarea name="irBrackets" rows={6} defaultValue={JSON.stringify(config.irBrackets, null, 2)} className={`${input} font-mono text-xs`} />
      </label>
      <div className="flex items-center gap-2">
        <button disabled={pending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">{t('save')}</button>
        {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-red-700'}`}>{msg.text}</span>}
      </div>
    </form>
  );
}

type Profile = {
  cnssNumber: string | null; baseSalary: number; transportAllowance: number; housingAllowance: number;
  benefitsInKind: number; cimrEnabled: boolean; cimrEmployeeRate: number | null; numberOfDependents: number;
} | null;

export function EmployeeProfileForm({ personId, name, profile }: { personId: string; name: string; profile: Profile }) {
  const t = useTranslations('admin.payroll');
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => { await upsertEmployeeProfileAction(fd); setOpen(false); router.refresh(); });
  }

  return (
    <>
      <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen((o) => !o)}>
        <td className="px-3 py-2 font-medium text-slate-800">{name}</td>
        <td className="px-3 py-2 text-end tabular-nums text-slate-700">{profile ? profile.baseSalary.toLocaleString() : '—'}</td>
        <td className="px-3 py-2 text-end tabular-nums text-slate-500">{profile ? profile.transportAllowance + profile.housingAllowance : '—'}</td>
        <td className="px-3 py-2 text-center text-xs text-slate-500">{profile?.numberOfDependents ?? '—'}</td>
        <td className="px-3 py-2 text-end text-xs text-brand-600">{open ? '▲' : t('edit')}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="bg-slate-50 px-3 py-3">
            <form ref={ref} onSubmit={submit} className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <input type="hidden" name="personId" value={personId} />
              <Field label={t('p.baseSalary')}><input name="baseSalary" type="number" step="any" defaultValue={profile?.baseSalary ?? 0} className={input} /></Field>
              <Field label={t('p.transport')}><input name="transportAllowance" type="number" step="any" defaultValue={profile?.transportAllowance ?? 0} className={input} /></Field>
              <Field label={t('p.housing')}><input name="housingAllowance" type="number" step="any" defaultValue={profile?.housingAllowance ?? 0} className={input} /></Field>
              <Field label={t('p.benefits')}><input name="benefitsInKind" type="number" step="any" defaultValue={profile?.benefitsInKind ?? 0} className={input} /></Field>
              <Field label={t('p.cnssNumber')}><input name="cnssNumber" defaultValue={profile?.cnssNumber ?? ''} className={input} /></Field>
              <Field label={t('p.dependents')}><input name="numberOfDependents" type="number" min="0" defaultValue={profile?.numberOfDependents ?? 0} className={input} /></Field>
              <Field label={t('p.cimrRate')}><input name="cimrEmployeeRate" type="number" step="any" defaultValue={profile?.cimrEmployeeRate ?? ''} className={input} /></Field>
              <label className="flex items-center gap-2 pt-5 text-sm text-slate-700">
                <input type="checkbox" name="cimrEnabled" defaultChecked={profile?.cimrEnabled} className="h-4 w-4 rounded border-slate-300" />
                {t('p.cimr')}
              </label>
              <div className="col-span-2 md:col-span-4">
                <button disabled={pending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">{t('save')}</button>
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-medium text-slate-600">
      <span className="mb-0.5 block">{label}</span>
      {children}
    </label>
  );
}
