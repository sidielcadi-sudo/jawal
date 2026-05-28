'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createPersonAction, updatePersonAction } from './actions';

type PersonInitial = {
  id?: string;
  type?: 'STUDENT' | 'TEACHER' | 'STAFF' | 'PARENT';
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  gender?: 'M' | 'F' | 'X';
  nationality?: string;
  cin?: string;
  contacts?: { email?: string; phone?: string; whatsapp?: string };
  address?: { line1?: string; city?: string; postalCode?: string; country?: string };
};

export function PersonForm({
  mode,
  initial,
  locale,
}: {
  mode: 'create' | 'edit';
  initial?: PersonInitial;
  locale: string;
}) {
  const t = useTranslations('admin.persons.form');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function onSubmit(formData: FormData) {
    setError('');
    setFieldErrors({});
    startTransition(async () => {
      const result =
        mode === 'create'
          ? await createPersonAction(formData)
          : await updatePersonAction(initial!.id!, formData);

      if (!result.ok) {
        setError(result.error);
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        return;
      }

      const id = mode === 'create' ? (result.data as { id: string }).id : initial!.id!;
      router.push(`/${locale}/admin/persons/${id}`);
      router.refresh();
    });
  }

  const inputCls =
    'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

  return (
    <form action={onSubmit} className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold text-slate-700">{t('section.identity')}</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('type')} error={fieldErrors.type}>
            <select
              name="type"
              required
              defaultValue={initial?.type ?? 'STUDENT'}
              className={inputCls}
              disabled={mode === 'edit'}
            >
              <option value="STUDENT">{t('types.STUDENT')}</option>
              <option value="TEACHER">{t('types.TEACHER')}</option>
              <option value="STAFF">{t('types.STAFF')}</option>
              <option value="PARENT">{t('types.PARENT')}</option>
            </select>
          </Field>
          <Field label={t('gender')} error={fieldErrors.gender}>
            <select name="gender" defaultValue={initial?.gender ?? ''} className={inputCls}>
              <option value="">—</option>
              <option value="M">{t('genders.M')}</option>
              <option value="F">{t('genders.F')}</option>
              <option value="X">{t('genders.X')}</option>
            </select>
          </Field>
          <Field label={t('lastName')} error={fieldErrors.lastName}>
            <input
              type="text"
              name="lastName"
              required
              defaultValue={initial?.lastName ?? ''}
              className={inputCls}
            />
          </Field>
          <Field label={t('firstName')} error={fieldErrors.firstName}>
            <input
              type="text"
              name="firstName"
              required
              defaultValue={initial?.firstName ?? ''}
              className={inputCls}
            />
          </Field>
          <Field label={t('birthDate')} error={fieldErrors.birthDate}>
            <input
              type="date"
              name="birthDate"
              defaultValue={initial?.birthDate ?? ''}
              className={inputCls}
            />
          </Field>
          <Field label={t('nationality')}>
            <input
              type="text"
              name="nationality"
              defaultValue={initial?.nationality ?? ''}
              placeholder="Marocaine"
              className={inputCls}
            />
          </Field>
          <Field label={t('cin')}>
            <input
              type="text"
              name="cin"
              defaultValue={initial?.cin ?? ''}
              placeholder="AB123456"
              className={inputCls}
            />
          </Field>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-700">{t('section.contact')}</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('contactEmail')}>
            <input
              type="email"
              name="contactEmail"
              defaultValue={initial?.contacts?.email ?? ''}
              className={inputCls}
            />
          </Field>
          <Field label={t('contactPhone')}>
            <input
              type="tel"
              name="contactPhone"
              defaultValue={initial?.contacts?.phone ?? ''}
              placeholder="06 12 34 56 78"
              className={inputCls}
            />
          </Field>
          <Field label={t('contactWhatsapp')}>
            <input
              type="tel"
              name="contactWhatsapp"
              defaultValue={initial?.contacts?.whatsapp ?? ''}
              className={inputCls}
            />
          </Field>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-700">{t('section.address')}</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('addressLine1')}>
            <input
              type="text"
              name="addressLine1"
              defaultValue={initial?.address?.line1 ?? ''}
              className={inputCls}
            />
          </Field>
          <Field label={t('addressCity')}>
            <input
              type="text"
              name="addressCity"
              defaultValue={initial?.address?.city ?? ''}
              className={inputCls}
            />
          </Field>
          <Field label={t('addressPostalCode')}>
            <input
              type="text"
              name="addressPostalCode"
              defaultValue={initial?.address?.postalCode ?? ''}
              className={inputCls}
            />
          </Field>
          <Field label={t('addressCountry')}>
            <input
              type="text"
              name="addressCountry"
              defaultValue={initial?.address?.country ?? 'Maroc'}
              className={inputCls}
            />
          </Field>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          {t('actions.cancel')}
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? t('actions.saving') : t('actions.save')}
        </button>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  // <label> englobant : associe automatiquement le contrôle imbriqué (a11y + Playwright getByLabel).
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700">{label}</span>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </label>
  );
}
