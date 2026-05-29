'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createPersonAction, updatePersonAction } from './actions';

type PersonType = 'STUDENT' | 'TEACHER' | 'STAFF' | 'PARENT';
type RelationType = 'FATHER' | 'MOTHER' | 'LEGAL_GUARDIAN' | 'GUARDIAN';

type RoleOption = {
  id: string;
  appliesTo: 'STUDENT' | 'TEACHER' | 'STAFF' | 'PARENT';
  labelFr: string;
  labelAr: string;
};

type ParentOption = { id: string; firstName: string; lastName: string };

type ParentLink = { parentId: string; type: RelationType };

type PersonInitial = {
  id?: string;
  type?: PersonType;
  roleId?: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  gender?: 'M' | 'F' | 'X';
  nationality?: string;
  cin?: string;
  contacts?: { email?: string; phone?: string; whatsapp?: string };
  address?: { line1?: string; city?: string; postalCode?: string; country?: string };
  parents?: ParentLink[];
};

export function PersonForm({
  mode,
  initial,
  locale,
  roles,
  availableParents,
}: {
  mode: 'create' | 'edit';
  initial?: PersonInitial;
  locale: string;
  roles: RoleOption[];
  availableParents: ParentOption[];
}) {
  const t = useTranslations('admin.persons.form');
  const tRel = useTranslations('admin.persons.detail.relations');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [type, setType] = useState<PersonType>(initial?.type ?? 'STUDENT');
  const [parents, setParents] = useState<ParentLink[]>(initial?.parents ?? []);

  function onSubmit(formData: FormData) {
    setError('');
    setFieldErrors({});
    formData.set('parents', JSON.stringify(parents));
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

  const filteredRoles = roles.filter((r) => r.appliesTo === type);
  const showRoleField = type === 'TEACHER' || type === 'STAFF';
  const showParentsField = type === 'STUDENT';

  function addParent() {
    setParents([...parents, { parentId: '', type: 'FATHER' }]);
  }
  function removeParent(idx: number) {
    setParents(parents.filter((_, i) => i !== idx));
  }
  function setParent(idx: number, patch: Partial<ParentLink>) {
    setParents(parents.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  return (
    <form action={onSubmit} className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold text-slate-700">{t('section.identity')}</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('type')} error={fieldErrors.type}>
            <select
              name="type"
              required
              value={type}
              onChange={(e) => setType(e.target.value as PersonType)}
              className={inputCls}
              disabled={mode === 'edit'}
            >
              <option value="STUDENT">{t('types.STUDENT')}</option>
              <option value="TEACHER">{t('types.TEACHER')}</option>
              <option value="STAFF">{t('types.STAFF')}</option>
              <option value="PARENT">{t('types.PARENT')}</option>
            </select>
          </Field>

          {showRoleField && (
            <Field
              label={type === 'TEACHER' ? t('roleTeacher') : t('roleStaff')}
              error={fieldErrors.roleId}
            >
              <select name="roleId" defaultValue={initial?.roleId ?? ''} className={inputCls}>
                <option value="">— {t('noRole')} —</option>
                {filteredRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {locale === 'ar' ? r.labelAr : r.labelFr}
                  </option>
                ))}
              </select>
            </Field>
          )}

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

      {showParentsField && (
        <section>
          <h2 className="text-sm font-semibold text-slate-700">{t('section.parents')}</h2>
          <p className="mt-1 text-xs text-slate-500">{t('parentsHint')}</p>
          <div className="mt-3 space-y-2">
            {parents.map((p, idx) => (
              <div key={idx} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-2">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-slate-700">{t('parentLabel')}</label>
                  <select
                    value={p.parentId}
                    onChange={(e) => setParent(idx, { parentId: e.target.value })}
                    className={inputCls}
                    required
                  >
                    <option value="">— {t('selectParent')} —</option>
                    {availableParents.map((ap) => (
                      <option key={ap.id} value={ap.id}>
                        {ap.lastName} {ap.firstName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">{t('relationLabel')}</label>
                  <select
                    value={p.type}
                    onChange={(e) => setParent(idx, { type: e.target.value as RelationType })}
                    className={inputCls}
                  >
                    <option value="FATHER">{tRel('FATHER')}</option>
                    <option value="MOTHER">{tRel('MOTHER')}</option>
                    <option value="LEGAL_GUARDIAN">{tRel('LEGAL_GUARDIAN')}</option>
                    <option value="GUARDIAN">{tRel('GUARDIAN')}</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => removeParent(idx)}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 hover:bg-red-100"
                >
                  {t('removeParent')}
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addParent}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              + {t('addParent')}
            </button>
            {availableParents.length === 0 && (
              <p className="text-xs text-amber-700">{t('noParentAvailable')}</p>
            )}
          </div>
        </section>
      )}

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
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700">{label}</span>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </label>
  );
}
