'use client';

import { createContext, useContext, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createOvertimeAction,
  updateOvertimeAction,
  generateFromSubstitutionsAction,
  advanceOvertimeAction,
  deleteOvertimeAction,
} from './actions';
import { OVERTIME_REASON_GROUPS, hoursBetween, isReplacementReason } from '@/lib/overtime-hse';

type Opt = { id: string; label: string };
export type SlotOpt = { startTime: string; endTime: string };

/** Listes du formulaire, partagées par l'en-tête (création) et les lignes (modification). */
export type OvertimeOptions = { teachers: Opt[]; staff: Opt[]; classes: Opt[]; slots: SlotOpt[] };
const OptionsContext = createContext<OvertimeOptions>({ teachers: [], staff: [], classes: [], slots: [] });

export function OvertimeOptionsProvider({ value, children }: { value: OvertimeOptions; children: React.ReactNode }) {
  return <OptionsContext.Provider value={value}>{children}</OptionsContext.Provider>;
}

/** Valeurs d'une déclaration existante, pour la modifier. */
export type DeclarationInitial = {
  personId: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  classId: string | null;
  replacedPersonId: string | null;
};

// Mêmes champs que les filtres de la page Élèves : un formulaire de saisie
// n'a pas de raison de se présenter autrement d'un écran à l'autre.
const fieldCls =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';
const labelCls = 'block text-xs font-medium text-slate-600';

const hhmm = (s: string) => s.replace(':', 'h');
const fmtHours = (h: number) => {
  const whole = Math.floor(h);
  const min = Math.round((h - whole) * 60);
  return `${whole}h${String(min).padStart(2, '0')}`;
};

/**
 * En-tête de la page et formulaire de déclaration.
 *
 * Le formulaire est masqué par défaut : la page sert d'abord à valider. Il
 * s'ouvre sur « Nouvelle déclaration », sous l'en-tête.
 */
export function OvertimeHeader({ exportHeader, exportRows }: { exportHeader: string[]; exportRows: string[][] }) {
  const t = useTranslations('admin.overtime');
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-3">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportPayrollButton header={exportHeader} rows={exportRows} />
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            + {t('newDeclaration')}
          </button>
        </div>
      </header>

      {open && (
        <div className="mb-4">
          <DeclarationForm onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}

function DeclarationForm({
  onClose,
  entryId,
  initial,
}: {
  onClose: () => void;
  /** Renseigné : modification de cette déclaration. */
  entryId?: string;
  initial?: DeclarationInitial;
}) {
  const t = useTranslations('admin.overtime');
  const { teachers, staff, classes, slots } = useContext(OptionsContext);
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');

  const initialSlot = (() => {
    if (initial?.startTime && initial.endTime) {
      const key = `${initial.startTime}-${initial.endTime}`;
      return slots.some((s) => `${s.startTime}-${s.endTime}` === key) ? key : 'custom';
    }
    return slots[0] ? `${slots[0].startTime}-${slots[0].endTime}` : 'custom';
  })();
  const [slot, setSlot] = useState(initialSlot);
  const [reason, setReason] = useState(initial?.reason ?? '');
  const custom = slot === 'custom';

  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (!custom) {
          const [a, b] = slot.split('-');
          fd.set('startTime', a ?? '');
          fd.set('endTime', b ?? '');
        }
        setErr('');
        start(async () => {
          const r = entryId ? await updateOvertimeAction(entryId, fd) : await createOvertimeAction(fd);
          if (!r.ok) return setErr('error' in r ? r.error : 'Erreur');
          ref.current?.reset();
          onClose();
          router.refresh();
        });
      }}
      className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-start shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <h2 className="text-sm font-bold text-blue-900">✎ {entryId ? t('editTitle') : t('formTitle')}</h2>
        <span className="text-xs text-slate-500">{t('formHint')}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{t('form.teacher')} *</span>
          <select name="personId" required defaultValue={initial?.personId ?? ''} className={fieldCls}>
            <option value="">{t('form.select')}</option>
            <optgroup label={t('form.teachersGroup')}>
              {teachers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </optgroup>
            {staff.length > 0 && (
              <optgroup label={t('form.staffGroup')}>
                {staff.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{t('form.date')} *</span>
          <input
            type="date"
            name="date"
            required
            defaultValue={initial?.date ?? new Date().toISOString().slice(0, 10)}
            className={fieldCls}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className={labelCls}>{t('form.slot')} *</span>
          <select value={slot} onChange={(e) => setSlot(e.target.value)} className={fieldCls}>
            {slots.map((s) => {
              const h = hoursBetween(s.startTime, s.endTime) ?? 0;
              return (
                <option key={`${s.startTime}-${s.endTime}`} value={`${s.startTime}-${s.endTime}`}>
                  {fmtHours(h)} ({hhmm(s.startTime)} - {hhmm(s.endTime)})
                </option>
              );
            })}
            <option value="custom">{t('form.customSlot')}</option>
          </select>
          {custom && (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="time"
                name="startTime"
                required
                defaultValue={initial?.startTime ?? ''}
                aria-label={t('form.start')}
                className={fieldCls}
              />
              <input
                type="time"
                name="endTime"
                required
                defaultValue={initial?.endTime ?? ''}
                aria-label={t('form.end')}
                className={fieldCls}
              />
            </div>
          )}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{t('form.reason')} *</span>
          <select
            name="reason"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={fieldCls}
          >
            <option value="">{t('form.reasonPlaceholder')}</option>
            {OVERTIME_REASON_GROUPS.map((g) => (
              <optgroup key={g.key} label={t(`reasonGroups.${g.key}`)}>
                {g.reasons.map((r) => (
                  <option key={r} value={r}>
                    {t(`reasons.${r}`)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{t('form.class')}</span>
          <select name="classId" defaultValue={initial?.classId ?? ''} className={fieldCls}>
            <option value="">{t('form.select')}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{t('form.replaced')}</span>
          {/* Réservé aux remplacements : un soutien ou une surveillance ne
              remplace personne. */}
          <select
            name="replacedPersonId"
            defaultValue={initial?.replacedPersonId ?? ''}
            disabled={!isReplacementReason(reason)}
            className={`${fieldCls} disabled:opacity-50`}
          >
            <option value="">{t('form.select')}</option>
            {teachers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {err && <span className="me-auto text-xs text-red-700">{err}</span>}
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {t('form.cancel')}
        </button>
        <button
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? t('form.saving') : entryId ? t('form.update') : t('form.submit')}
        </button>
      </div>
    </form>
  );
}

export function GenerateButton() {
  const t = useTranslations('admin.overtime');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  return (
    <span className="flex items-center gap-2">
      {msg && <span className="text-xs text-emerald-600">{msg}</span>}
      <button
        type="button"
        onClick={() =>
          start(async () => {
            const r = await generateFromSubstitutionsAction();
            setMsg('created' in r ? t('generated', { n: r.created }) : '');
            router.refresh();
          })
        }
        disabled={pending}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {t('generate')}
      </button>
    </span>
  );
}

/**
 * Actions d'une ligne : ✎ modifie une déclaration encore non validée, ✓ la fait
 * passer à l'étape suivante du circuit (RH → Direction → Comptabilité), ✗ la
 * rejette. L'étape visée s'affiche au survol.
 */
export function WorkflowButtons({ id, status, edit }: { id: string; status: string; edit?: DeclarationInitial }) {
  const t = useTranslations('admin.overtime');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const act = (action: 'validate' | 'approve' | 'process' | 'reject') =>
    start(async () => {
      await advanceOvertimeAction(id, action);
      router.refresh();
    });
  const del = () =>
    start(async () => {
      await deleteOvertimeAction(id);
      router.refresh();
    });

  const next =
    status === 'DECLARED'
      ? { action: 'validate' as const, label: t('validateRh') }
      : status === 'RH_VALIDATED'
        ? { action: 'approve' as const, label: t('approveDir') }
        : status === 'DIRECTION_APPROVED'
          ? { action: 'process' as const, label: t('processAcc') }
          : null;

  if (status === 'PROCESSED' || status === 'REJECTED') {
    return (
      <span className="flex items-center gap-2 text-xs text-slate-500">
        {status === 'PROCESSED' ? t('done') : t('statusLabel.REJECTED')}
        <button
          type="button"
          onClick={del}
          disabled={pending}
          title={t('delete')}
          className="text-slate-400 hover:text-red-600 disabled:opacity-50"
        >
          ✕
        </button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      {status === 'DECLARED' && edit && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title={t('edit')}
          aria-label={t('edit')}
          className="grid h-7 w-8 place-items-center rounded-md border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50"
        >
          ✎
        </button>
      )}
      {next && (
        <button
          type="button"
          onClick={() => act(next.action)}
          disabled={pending}
          title={next.label}
          aria-label={next.label}
          className="grid h-7 w-8 place-items-center rounded-md bg-emerald-500 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          ✓
        </button>
      )}
      <button
        type="button"
        onClick={() => act('reject')}
        disabled={pending}
        title={t('reject')}
        aria-label={t('reject')}
        className="grid h-7 w-8 place-items-center rounded-md bg-red-500 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50"
      >
        ✕
      </button>

      {editing && edit && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"
          onClick={() => setEditing(false)}
        >
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <DeclarationForm entryId={id} initial={edit} onClose={() => setEditing(false)} />
          </div>
        </div>
      )}
    </span>
  );
}

/** Export des heures validées, à transmettre à la paie (CSV lisible par Excel). */
export function ExportPayrollButton({ header, rows }: { header: string[]; rows: string[][] }) {
  const t = useTranslations('admin.overtime');
  function download() {
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `heures-sup-paie-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button
      type="button"
      onClick={download}
      disabled={rows.length === 0}
      title={rows.length === 0 ? t('exportEmpty') : undefined}
      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      ⭳ {t('exportPayroll')}
    </button>
  );
}
