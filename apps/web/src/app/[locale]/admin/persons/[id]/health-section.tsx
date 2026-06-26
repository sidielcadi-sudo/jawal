'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { updateStudentHealthAction } from './health-actions';

export type Health = {
  allergies?: string | null;
  chronicConditions?: string | null;
  treatments?: string | null;
  pai?: boolean;
  paiNote?: string | null;
  vaccinations?: string | null;
  doctorName?: string | null;
  doctorPhone?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  medAuthorization?: boolean;
  outingAuthorization?: boolean;
};

const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';

export function HealthSection({ studentId, health }: { studentId: string; health: Health }) {
  const t = useTranslations('admin.persons.health');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErr('');
    start(async () => {
      const r = await updateStudentHealthAction(studentId, fd);
      if (!r.ok) return setErr(r.error);
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">🩺 {t('title')}</h2>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
            {t('edit')}
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={submit} className="space-y-3">
          <Field label={t('allergies')}><textarea name="allergies" rows={2} defaultValue={health.allergies ?? ''} className={input} /></Field>
          <Field label={t('chronicConditions')}><textarea name="chronicConditions" rows={2} defaultValue={health.chronicConditions ?? ''} className={input} /></Field>
          <Field label={t('treatments')}><textarea name="treatments" rows={2} defaultValue={health.treatments ?? ''} className={input} /></Field>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label={t('vaccinations')}><input name="vaccinations" defaultValue={health.vaccinations ?? ''} className={input} /></Field>
            <Field label={t('paiNote')}><input name="paiNote" defaultValue={health.paiNote ?? ''} className={input} /></Field>
            <Field label={t('doctorName')}><input name="doctorName" defaultValue={health.doctorName ?? ''} className={input} /></Field>
            <Field label={t('doctorPhone')}><input name="doctorPhone" defaultValue={health.doctorPhone ?? ''} className={input} /></Field>
            <Field label={t('emergencyContactName')}><input name="emergencyContactName" defaultValue={health.emergencyContactName ?? ''} className={input} /></Field>
            <Field label={t('emergencyContactPhone')}><input name="emergencyContactPhone" defaultValue={health.emergencyContactPhone ?? ''} className={input} /></Field>
          </div>
          <div className="space-y-1.5">
            <Check name="pai" label={t('pai')} defaultChecked={health.pai} />
            <Check name="medAuthorization" label={t('medAuthorization')} defaultChecked={health.medAuthorization} />
            <Check name="outingAuthorization" label={t('outingAuthorization')} defaultChecked={health.outingAuthorization} />
          </div>
          {err && <p className="text-xs text-red-700">{err}</p>}
          <div className="flex gap-2">
            <button disabled={pending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">{t('save')}</button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600">{t('cancel')}</button>
          </div>
        </form>
      ) : (
        <dl className="space-y-2 text-sm">
          <Show label={t('allergies')} value={health.allergies} />
          <Show label={t('chronicConditions')} value={health.chronicConditions} />
          <Show label={t('treatments')} value={health.treatments} />
          <Show label={t('vaccinations')} value={health.vaccinations} />
          <Show label={t('pai')} value={health.pai ? (health.paiNote || t('yes')) : undefined} />
          <Show label={t('doctor')} value={[health.doctorName, health.doctorPhone].filter(Boolean).join(' · ') || undefined} />
          <Show label={t('emergencyContact')} value={[health.emergencyContactName, health.emergencyContactPhone].filter(Boolean).join(' · ') || undefined} />
          <Show label={t('medAuthorization')} value={health.medAuthorization ? t('yes') : undefined} />
          <Show label={t('outingAuthorization')} value={health.outingAuthorization ? t('yes') : undefined} />
          {!hasAny(health) && <p className="text-xs text-slate-400">{t('empty')}</p>}
        </dl>
      )}
    </section>
  );
}

function hasAny(h: Health) {
  return Boolean(
    h.allergies || h.chronicConditions || h.treatments || h.vaccinations || h.pai ||
    h.doctorName || h.doctorPhone || h.emergencyContactName || h.emergencyContactPhone ||
    h.medAuthorization || h.outingAuthorization,
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4 rounded border-slate-300" />
      {label}
    </label>
  );
}
function Show({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-end font-medium text-slate-800">{value}</dd>
    </div>
  );
}
