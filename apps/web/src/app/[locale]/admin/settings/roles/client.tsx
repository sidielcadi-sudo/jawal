'use client';

import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createRoleAction,
  deleteRoleAction,
  updateRoleAction,
  createServiceAction,
  deleteServiceAction,
  updateServiceAction,
} from './actions';

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

export type ServiceOption = { id: string; labelFr: string };

type RoleData = {
  appliesTo: 'TEACHER' | 'STAFF';
  code: string;
  labelFr: string;
  labelAr: string;
  serviceId: string | null;
  order: number;
  active: boolean;
};

type Group = 'TEACHER' | 'STAFF' | 'SERVICE';

export function GroupTabs({ locale, current }: { locale: string; current: Group }) {
  const t = useTranslations('admin.settings.roles');
  const base = `/${locale}/admin/settings/roles`;
  const tabs: Array<{ value: Group; href: string; label: string }> = [
    { value: 'TEACHER', href: `${base}?group=TEACHER`, label: t('tabs.TEACHER') },
    { value: 'STAFF', href: `${base}?group=STAFF`, label: t('tabs.STAFF') },
    { value: 'SERVICE', href: `${base}?group=SERVICE`, label: t('tabs.SERVICE') },
  ];
  return (
    <div className="flex gap-2 border-b border-slate-200">
      {tabs.map((tab) => {
        const active = current === tab.value;
        return (
          <Link
            key={tab.value}
            href={tab.href}
            className={[
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            ].join(' ')}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

function ServiceField({
  appliesTo,
  services,
  defaultValue,
}: {
  appliesTo: 'TEACHER' | 'STAFF';
  services: ServiceOption[];
  defaultValue?: string | null;
}) {
  const t = useTranslations('admin.settings.roles.form');
  if (appliesTo === 'TEACHER') {
    // Service forcé côté serveur → simple information.
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        {t('serviceAutoTeacher')}
      </p>
    );
  }
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700">{t('service')}</label>
      <select name="serviceId" defaultValue={defaultValue ?? ''} className={inputCls}>
        <option value="">{t('serviceNone')}</option>
        {services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.labelFr}
          </option>
        ))}
      </select>
    </div>
  );
}

export function RoleCreateForm({
  appliesTo,
  services,
}: {
  appliesTo: 'TEACHER' | 'STAFF';
  services: ServiceOption[];
}) {
  const t = useTranslations('admin.settings.roles.form');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const ref = useRef<HTMLFormElement>(null);

  function onSubmit(formData: FormData) {
    setError('');
    startTransition(async () => {
      const r = await createRoleAction(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      ref.current?.reset();
      router.refresh();
    });
  }

  return (
    <form ref={ref} action={onSubmit} className="space-y-3">
      <input type="hidden" name="appliesTo" value={appliesTo} />
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('code')}</label>
        <input
          type="text"
          name="code"
          required
          placeholder="MAIN_TEACHER"
          className={`${inputCls} font-mono uppercase`}
          onInput={(e) => {
            const el = e.currentTarget;
            el.value = el.value.toUpperCase().replace(/[^A-Z0-9_]/g, '');
          }}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('labelFr')}</label>
        <input type="text" name="labelFr" required placeholder="Professeur principal" className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('labelAr')}</label>
        <input
          type="text"
          name="labelAr"
          required
          placeholder="أستاذ رئيسي"
          dir="rtl"
          className={inputCls}
        />
      </div>
      <ServiceField appliesTo={appliesTo} services={services} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('order')}</label>
          <input type="number" name="order" defaultValue={0} min={0} max={9999} className={inputCls} />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="active" defaultChecked className="h-4 w-4" />
            {t('active')}
          </label>
        </div>
      </div>
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? t('creating') : t('create')}
      </button>
    </form>
  );
}

export function RoleRowActions({
  id,
  initial,
  services,
}: {
  id: string;
  initial: RoleData;
  services: ServiceOption[];
}) {
  const t = useTranslations('admin.settings.roles');
  const tForm = useTranslations('admin.settings.roles.form');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  function onSave(formData: FormData) {
    setError('');
    startTransition(async () => {
      const r = await updateRoleAction(id, formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      const r = await deleteRoleAction(id);
      if (!r.ok) {
        alert(r.error);
        return;
      }
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-slate-500 hover:text-brand-700"
        >
          {t('actions.edit')}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isPending}
          className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
        >
          {t('actions.delete')}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-slate-900/40 p-4" onClick={() => setEditing(false)}>
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-900">{t('actions.edit')}</h3>
        <form action={onSave} className="mt-4 space-y-3">
          <input type="hidden" name="appliesTo" value={initial.appliesTo} />
          <div>
            <label className="block text-xs font-medium text-slate-700">{tForm('code')}</label>
            <input
              type="text"
              name="code"
              required
              defaultValue={initial.code}
              className={`${inputCls} font-mono uppercase`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{tForm('labelFr')}</label>
            <input type="text" name="labelFr" required defaultValue={initial.labelFr} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{tForm('labelAr')}</label>
            <input
              type="text"
              name="labelAr"
              required
              defaultValue={initial.labelAr}
              dir="rtl"
              className={inputCls}
            />
          </div>
          <ServiceField
            appliesTo={initial.appliesTo}
            services={services}
            defaultValue={initial.serviceId}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">{tForm('order')}</label>
              <input
                type="number"
                name="order"
                defaultValue={initial.order}
                min={0}
                max={9999}
                className={inputCls}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={initial.active}
                  className="h-4 w-4"
                />
                {tForm('active')}
              </label>
            </div>
          </div>
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {tForm('cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
            >
              {isPending ? tForm('saving') : tForm('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Services (départements) ───────────────────────────────────

type ServiceData = { code: string; labelFr: string; labelAr: string; order: number; active: boolean };

export function ServiceCreateForm() {
  const t = useTranslations('admin.settings.roles.form');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const ref = useRef<HTMLFormElement>(null);

  function onSubmit(formData: FormData) {
    setError('');
    startTransition(async () => {
      const r = await createServiceAction(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      ref.current?.reset();
      router.refresh();
    });
  }

  return (
    <form ref={ref} action={onSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('code')}</label>
        <input
          type="text"
          name="code"
          required
          placeholder="ORIENTATION"
          className={`${inputCls} font-mono uppercase`}
          onInput={(e) => {
            const el = e.currentTarget;
            el.value = el.value.toUpperCase().replace(/[^A-Z0-9_]/g, '');
          }}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('labelFr')}</label>
        <input type="text" name="labelFr" required placeholder="Orientation" className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('labelAr')}</label>
        <input type="text" name="labelAr" required placeholder="التوجيه" dir="rtl" className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('order')}</label>
          <input type="number" name="order" defaultValue={0} min={0} max={9999} className={inputCls} />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="active" defaultChecked className="h-4 w-4" />
            {t('active')}
          </label>
        </div>
      </div>
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? t('creating') : t('create')}
      </button>
    </form>
  );
}

export function ServiceRowActions({ id, initial }: { id: string; initial: ServiceData }) {
  const t = useTranslations('admin.settings.roles');
  const tForm = useTranslations('admin.settings.roles.form');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  function onSave(formData: FormData) {
    setError('');
    startTransition(async () => {
      const r = await updateServiceAction(id, formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      const r = await deleteServiceAction(id);
      if (!r.ok) {
        alert(r.error);
        return;
      }
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-slate-500 hover:text-brand-700"
        >
          {t('actions.edit')}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isPending}
          className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
        >
          {t('actions.delete')}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-slate-900/40 p-4" onClick={() => setEditing(false)}>
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-900">{t('actions.edit')}</h3>
        <form action={onSave} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">{tForm('code')}</label>
            <input
              type="text"
              name="code"
              required
              defaultValue={initial.code}
              className={`${inputCls} font-mono uppercase`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{tForm('labelFr')}</label>
            <input type="text" name="labelFr" required defaultValue={initial.labelFr} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{tForm('labelAr')}</label>
            <input type="text" name="labelAr" required defaultValue={initial.labelAr} dir="rtl" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">{tForm('order')}</label>
              <input type="number" name="order" defaultValue={initial.order} min={0} max={9999} className={inputCls} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="active" defaultChecked={initial.active} className="h-4 w-4" />
                {tForm('active')}
              </label>
            </div>
          </div>
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {tForm('cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
            >
              {isPending ? tForm('saving') : tForm('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
