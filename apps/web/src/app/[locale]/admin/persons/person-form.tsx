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

type ContractType = 'CDI' | 'CDD' | 'VACATAIRE' | 'STAGIAIRE' | 'AUTRE';

type ContractFile = { id: string; filename: string; sizeBytes: number } | null;

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
  hireDate?: string;
  contractEndDate?: string;
  contractType?: ContractType;
  contractFile?: ContractFile;
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
  const showContractField = type === 'TEACHER' || type === 'STAFF';

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

      {showContractField && (
        <section>
          <h2 className="text-sm font-semibold text-slate-700">{t('section.contract')}</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label={t('contractType')}>
              <select
                name="contractType"
                defaultValue={initial?.contractType ?? ''}
                className={inputCls}
              >
                <option value="">—</option>
                <option value="CDI">{t('contractTypes.CDI')}</option>
                <option value="CDD">{t('contractTypes.CDD')}</option>
                <option value="VACATAIRE">{t('contractTypes.VACATAIRE')}</option>
                <option value="STAGIAIRE">{t('contractTypes.STAGIAIRE')}</option>
                <option value="AUTRE">{t('contractTypes.AUTRE')}</option>
              </select>
            </Field>
            <Field label={t('hireDate')}>
              <input
                type="date"
                name="hireDate"
                defaultValue={initial?.hireDate ?? ''}
                className={inputCls}
              />
            </Field>
            <Field label={t('contractEndDate')}>
              <input
                type="date"
                name="contractEndDate"
                defaultValue={initial?.contractEndDate ?? ''}
                className={inputCls}
              />
            </Field>
          </div>
          {mode === 'edit' && initial?.id && (
            <ContractUpload personId={initial.id} current={initial.contractFile ?? null} />
          )}
          {mode === 'create' && (
            <p className="mt-2 text-xs text-slate-500">{t('contractUploadAfterCreate')}</p>
          )}
        </section>
      )}

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

function ContractUpload({
  personId,
  current,
}: {
  personId: string;
  current: ContractFile;
}) {
  const t = useTranslations('admin.persons.form');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    if (!file.type.includes('pdf')) {
      setErr(t('contractFileMustBePdf'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErr(t('contractFileTooLarge'));
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch(`/api/admin/persons/${personId}/contract/upload`, {
      method: 'POST',
      body: fd,
    });
    setBusy(false);
    if (!r.ok) {
      setErr(await r.text());
      return;
    }
    router.refresh();
  }

  async function onDelete() {
    if (!confirm(t('contractFileConfirmDelete'))) return;
    setBusy(true);
    setErr('');
    await fetch(`/api/admin/persons/${personId}/contract/upload`, { method: 'DELETE' });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-medium text-slate-700">{t('contractFile')}</div>
      {current ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <a
            href={`/api/admin/persons/${personId}/contract/download`}
            target="_blank"
            rel="noopener"
            className="rounded-lg border border-brand-300 bg-white px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            📄 {current.filename}
          </a>
          <span className="text-xs text-slate-500">
            ({(current.sizeBytes / 1024).toFixed(0)} Ko)
          </span>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
          >
            {t('contractFileDelete')}
          </button>
          <label className="ms-auto cursor-pointer text-xs text-slate-600 hover:text-brand-700">
            {t('contractFileReplace')}
            <input
              type="file"
              accept="application/pdf"
              onChange={onUpload}
              disabled={busy}
              className="hidden"
            />
          </label>
        </div>
      ) : (
        <div className="mt-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            📎 {t('contractFileUpload')}
            <input
              type="file"
              accept="application/pdf"
              onChange={onUpload}
              disabled={busy}
              className="hidden"
            />
          </label>
          <p className="mt-1 text-xs text-slate-500">{t('contractFileHint')}</p>
        </div>
      )}
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </div>
  );
}
