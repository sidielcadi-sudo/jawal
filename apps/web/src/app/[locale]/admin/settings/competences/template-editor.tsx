'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createTemplateNodeAction,
  deleteTemplateNodeAction,
  ensureTemplateAction,
  updateTemplateNodeAction,
} from './actions';

export type SubjectOption = { id: string; label: string };

export type EditableNode = {
  id: string;
  labelFr: string;
  labelAr: string | null;
  descriptor: string | null;
  subjectId: string | null;
  isLeaf: boolean;
  childCount: number;
};

const inputCls =
  'w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

/** Crée le référentiel modèle, amorcé par le dernier référentiel d'année. */
export function CreateTemplateButton() {
  const t = useTranslations('admin.competences.template');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  return (
    <div className="mx-auto mt-5 max-w-xl rounded-2xl border border-brand-200 bg-white p-5 text-start">
      <h3 className="text-sm font-semibold text-slate-900">{t('createTitle')}</h3>
      <p className="mt-1 text-xs text-slate-500">{t('createHint')}</p>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await ensureTemplateAction();
            if (!r.ok) return setError(r.error);
            router.refresh();
          })
        }
        className="mt-3 w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? t('creating') : t('createAction')}
      </button>
    </div>
  );
}

/**
 * Ajout d'un nœud sous un parent donné (ou d'un domaine si `parentId` est nul).
 *
 * Le formulaire s'ouvre en place plutôt que dans une fenêtre : construire un
 * référentiel est un travail de saisie répétitive, et rouvrir une modale à
 * chaque ligne serait épuisant.
 */
export function AddNodeButton({
  parentId,
  kind,
  subjects,
  variant,
}: {
  parentId: string | null;
  kind: 'DISCIPLINARY' | 'TRANSVERSAL';
  subjects: SubjectOption[];
  /** `leaf` propose la matière et le descripteur ; `branch` non. */
  variant: 'domain' | 'branch' | 'leaf';
}) {
  const t = useTranslations('admin.competences.template');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [labelFr, setLabelFr] = useState('');
  const [labelAr, setLabelAr] = useState('');
  const [descriptor, setDescriptor] = useState('');
  const [subjectId, setSubjectId] = useState('');

  const isLeaf = variant === 'leaf';

  function submit() {
    setError('');
    start(async () => {
      const r = await createTemplateNodeAction({
        parentId,
        kind,
        labelFr,
        labelAr,
        descriptor: isLeaf ? descriptor : undefined,
        subjectId: isLeaf ? subjectId || null : null,
        isLeaf,
      });
      if (!r.ok) return setError(r.error);
      setLabelFr('');
      setLabelAr('');
      setDescriptor('');
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-dashed border-brand-300 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
      >
        + {t(`add.${variant}`)}
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-brand-200 bg-brand-50/40 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-700">
          {t('field.labelFr')}
          <input
            autoFocus
            value={labelFr}
            onChange={(e) => setLabelFr(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          {t('field.labelAr')}
          <input value={labelAr} onChange={(e) => setLabelAr(e.target.value)} dir="rtl" className={inputCls} />
        </label>
        {isLeaf && (
          <>
            <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
              {t('field.descriptor')}
              <input
                value={descriptor}
                onChange={(e) => setDescriptor(e.target.value)}
                placeholder={t('field.descriptorHint')}
                className={inputCls}
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              {t('field.subject')}
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className={inputCls}
              >
                <option value="">{t('field.noSubject')}</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          disabled={pending || !labelFr.trim()}
          onClick={submit}
          className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          {pending ? t('saving') : t('addAction')}
        </button>
      </div>
    </div>
  );
}

/** Modification et suppression d'un nœud du modèle. */
export function NodeActions({
  node,
  subjects,
  showSubject,
}: {
  node: EditableNode;
  subjects: SubjectOption[];
  showSubject: boolean;
}) {
  const t = useTranslations('admin.competences.template');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [labelFr, setLabelFr] = useState(node.labelFr);
  const [labelAr, setLabelAr] = useState(node.labelAr ?? '');
  const [descriptor, setDescriptor] = useState(node.descriptor ?? '');
  const [subjectId, setSubjectId] = useState(node.subjectId ?? '');

  function save() {
    setError('');
    start(async () => {
      const r = await updateTemplateNodeAction(node.id, {
        labelFr,
        labelAr,
        descriptor,
        subjectId: showSubject ? subjectId || null : undefined,
      });
      if (!r.ok) return setError(r.error);
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    setError('');
    start(async () => {
      const r = await deleteTemplateNodeAction(node.id);
      if (!r.ok) return setError(r.error);
      setConfirm(false);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="w-full rounded-xl border border-brand-200 bg-brand-50/40 p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-700">
            {t('field.labelFr')}
            <input value={labelFr} onChange={(e) => setLabelFr(e.target.value)} className={inputCls} />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            {t('field.labelAr')}
            <input value={labelAr} onChange={(e) => setLabelAr(e.target.value)} dir="rtl" className={inputCls} />
          </label>
          {showSubject && (
            <>
              <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
                {t('field.descriptor')}
                <input
                  value={descriptor}
                  onChange={(e) => setDescriptor(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                {t('field.subject')}
                <select
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">{t('field.noSubject')}</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            disabled={pending || !labelFr.trim()}
            onClick={save}
            className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
          >
            {t('save')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        title={t('edit')}
      >
        ✎
      </button>
      {confirm ? (
        <>
          {/* La descendance part avec le nœud : on le dit avant, pas après. */}
          <span className="text-[11px] text-red-700">
            {node.childCount > 0 ? t('deleteWithChildren', { count: node.childCount }) : t('deleteOne')}
          </span>
          <button
            type="button"
            onClick={() => setConfirm(false)}
            className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-700"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-medium text-white disabled:opacity-50"
          >
            {t('confirmDelete')}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-red-50 hover:text-red-700"
          title={t('delete')}
        >
          ✕
        </button>
      )}
      {error && <span className="text-[11px] text-red-700">{error}</span>}
    </span>
  );
}
