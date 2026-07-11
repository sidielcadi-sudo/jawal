'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createPersonAction, updatePersonAction } from './actions';
import { createAdmissionEnrollmentAction } from '../enrollments/admission-actions';
import {
  MultiPicker,
  DiplomasField,
  AvailabilityField,
  BenefitsField,
  DeductionsField,
  PAYROLL_METHODS,
} from './hr-sections';

type PersonType = 'STUDENT' | 'TEACHER' | 'STAFF' | 'PARENT';
type RelationType = 'FATHER' | 'MOTHER' | 'LEGAL_GUARDIAN' | 'GUARDIAN';

type RoleOption = {
  id: string;
  appliesTo: 'STUDENT' | 'TEACHER' | 'STAFF' | 'PARENT';
  labelFr: string;
  labelAr: string;
};

type ParentAddress = { line1?: string; city?: string; postalCode?: string; country?: string } | null;
type ParentChild = { firstName: string; lastName: string; className: string | null };
type ParentOption = {
  id: string;
  firstName: string;
  lastName: string;
  address?: ParentAddress;
  children?: ParentChild[];
};

type ParentLink = { parentId: string; type: RelationType };

type ContractType = 'CDI' | 'CDD' | 'VACATAIRE' | 'STAGIAIRE' | 'AUTRE';
type PayrollMethod = 'BANK_TRANSFER' | 'CHECK' | 'CASH' | 'OTHER';
type Diploma = { title: string; institution?: string; year?: number };
type Benefit = { label: string; amount: number };
type Deduction = { label: string; amount: number; date?: string };
type Availability = Record<
  'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN',
  Array<{ from: string; to: string }>
>;

type ContractFile = { id: string; filename: string; sizeBytes: number } | null;

type PersonInitial = {
  id?: string;
  type?: PersonType;
  roleId?: string;
  service?: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  gender?: 'M' | 'F' | 'X';
  nationality?: string;
  cin?: string;
  regime?: 'EXTERNE' | 'DEMI_PENSIONNAIRE' | 'INTERNE';
  usesTransport?: boolean;
  cne?: string;
  codeMassar?: string;
  imageRights?: boolean;
  exitRights?: number;
  dietInfo?: string;
  originSchool?: string;
  repeating?: boolean;
  contacts?: { email?: string; phone?: string; whatsapp?: string };
  address?: { line1?: string; city?: string; postalCode?: string; country?: string };
  parents?: ParentLink[];
  hireDate?: string;
  contractEndDate?: string;
  contractType?: ContractType;
  cnssNumber?: string;
  amoNumber?: string;
  employmentStatus?: string;
  cinScanFileId?: string | null;
  cnssAttestationFileId?: string | null;
  contractualHoursPerWeek?: number;
  homeRoomId?: string | null;
  photoFileId?: string | null;
  contractFile?: ContractFile;
  specialtySubjectIds?: string[];
  cycleIds?: string[];
  priorityClassIds?: string[];
  experienceYears?: number;
  diplomas?: Diploma[];
  availability?: Availability;
  rib?: string;
  bankName?: string;
  payrollMethod?: PayrollMethod;
  grossSalary?: number;
  netSalary?: number;
  benefits?: Benefit[];
  deductions?: Deduction[];
};

export function PersonForm({
  mode,
  initial,
  locale,
  roles,
  availableParents,
  allSubjects,
  allCycles,
  allClasses,
  rooms,
  lockType = false,
  admission,
}: {
  mode: 'create' | 'edit';
  initial?: PersonInitial;
  locale: string;
  roles: RoleOption[];
  availableParents: ParentOption[];
  allSubjects: { id: string; label: string }[];
  allCycles: { id: string; label: string }[];
  allClasses: { id: string; label: string }[];
  rooms: { id: string; label: string }[];
  /** Verrouille (et masque) le type — ex. création d'un élève. */
  lockType?: boolean;
  /** Mode « Nouvelle inscription » : ouvre un dossier d'admission après création. */
  admission?: {
    years: { id: string; label: string }[];
    defaultYearId: string;
    levels: { id: string; label: string }[];
  };
}) {
  const t = useTranslations('admin.persons.form');
  const tRel = useTranslations('admin.persons.detail.relations');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [type, setType] = useState<PersonType>(initial?.type ?? 'STUDENT');
  const [regime, setRegime] = useState<string>(initial?.regime ?? '');
  const [parents, setParents] = useState<ParentLink[]>(initial?.parents ?? []);
  const [address, setAddress] = useState({
    line1: initial?.address?.line1 ?? '',
    city: initial?.address?.city ?? '',
    postalCode: initial?.address?.postalCode ?? '',
    country: initial?.address?.country ?? 'Maroc',
  });
  const [stagedPhoto, setStagedPhoto] = useState<File | null>(null);
  const [stagedPhotoUrl, setStagedPhotoUrl] = useState<string | null>(null);

  function onStagePhoto(file: File | null) {
    setStagedPhoto(file);
    setStagedPhotoUrl(file ? URL.createObjectURL(file) : null);
  }

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
      // Création : on envoie la photo mise en attente une fois l'id obtenu.
      if (stagedPhoto) {
        const fd = new FormData();
        fd.append('file', stagedPhoto);
        await fetch(`/api/admin/persons/${id}/photo/upload`, { method: 'POST', body: fd }).catch(
          () => {},
        );
      }
      // Mode inscription : ouvre le dossier d'admission et y redirige.
      if (admission && mode === 'create') {
        const levelId = String(formData.get('admissionLevelId') ?? '');
        const yearId = String(formData.get('admissionYearId') ?? admission.defaultYearId);
        const notes = String(formData.get('admissionNotes') ?? '');
        const r = await createAdmissionEnrollmentAction(id, yearId, levelId, notes);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        router.push(`/${locale}/admin/enrollments/${r.id}`);
        router.refresh();
        return;
      }
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
    const next = parents.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    setParents(next);
    // #2 — Adresse par défaut = celle du père (modifiable). On ne pré-remplit
    // que si l'adresse élève est encore vide, pour ne pas écraser une saisie.
    const link = next[idx];
    if (!link?.parentId) return;
    const parent = availableParents.find((ap) => ap.id === link.parentId);
    const padr = parent?.address;
    const isFather = link.type === 'FATHER';
    const addressEmpty = !address.line1.trim() && !address.city.trim();
    if (isFather && padr && addressEmpty) {
      setAddress({
        line1: padr.line1 ?? '',
        city: padr.city ?? '',
        postalCode: padr.postalCode ?? '',
        country: padr.country ?? 'Maroc',
      });
    }
  }

  return (
    <form action={onSubmit} className="space-y-6">
      {admission && (
        <SectionCard title={t('section.admission')} bodyClass="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('admissionYear')}>
            <select
              name="admissionYearId"
              defaultValue={admission.defaultYearId}
              className={inputCls}
            >
              {admission.years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('admissionLevel')}>
            <select name="admissionLevelId" required defaultValue="" className={inputCls}>
              <option value="" disabled>
                —
              </option>
              {admission.levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('originSchool')}>
            <input
              type="text"
              name="originSchool"
              defaultValue={initial?.originSchool ?? ''}
              placeholder={t('originSchoolHint')}
              className={inputCls}
            />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="repeating"
              defaultChecked={initial?.repeating ?? false}
              className="h-4 w-4 rounded border-slate-300"
            />
            {t('repeating')}
          </label>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700">{t('admissionNotes')}</label>
            <textarea name="admissionNotes" rows={2} className={inputCls} />
          </div>
        </SectionCard>
      )}
      <SectionCard title={t('section.identity')}>
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
          {lockType ? (
            <input type="hidden" name="type" value={type} />
          ) : (
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
          )}

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

          {(type === 'STAFF' || type === 'TEACHER') && (
            <p className="text-xs text-slate-500">{t('serviceDerivedHint')}</p>
          )}

          <Field label={t('gender')} error={fieldErrors.gender}>
            <select name="gender" defaultValue={initial?.gender ?? ''} className={inputCls}>
              <option value="">—</option>
              <option value="M">{t('genders.M')}</option>
              <option value="F">{t('genders.F')}</option>
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
          {showContractField && mode === 'edit' && initial?.id && (
            <div className="sm:col-span-2">
              <DocUpload personId={initial.id} kind="cinScan" hasFile={!!initial.cinScanFileId} label={t('cinScan')} />
            </div>
          )}
          {type === 'STUDENT' && (
            <Field label={t('cne')}>
              <input type="text" name="cne" defaultValue={initial?.cne ?? ''} placeholder="CNE" className={inputCls} />
            </Field>
          )}
          {type === 'STUDENT' && (
            <Field label={t('codeMassar')}>
              <input type="text" name="codeMassar" defaultValue={initial?.codeMassar ?? ''} placeholder="Massar" className={inputCls} />
            </Field>
          )}
          {type === 'STUDENT' && (
            <Field label={t('regime.label')}>
              <select
                name="regime"
                value={regime}
                onChange={(e) => setRegime(e.target.value)}
                disabled={mode === 'edit'}
                className={`${inputCls} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-70`}
              >
                <option value="">{t('regime.none')}</option>
                <option value="EXTERNE">{t('regime.EXTERNE')}</option>
                <option value="DEMI_PENSIONNAIRE">{t('regime.DEMI_PENSIONNAIRE')}</option>
                <option value="INTERNE">{t('regime.INTERNE')}</option>
              </select>
              {mode === 'edit' && (
                <p className="mt-1 text-[11px] text-amber-600">{t('lockedViaEnrollment')}</p>
              )}
            </Field>
          )}
          {type === 'STUDENT' && (
            <Field label={t('exitRights')}>
              <input
                type="number"
                name="exitRights"
                min={0}
                max={9}
                defaultValue={initial?.exitRights ?? ''}
                className={inputCls}
              />
            </Field>
          )}
          {type === 'STUDENT' && (
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="imageRights"
                defaultChecked={initial?.imageRights ?? false}
                className="h-4 w-4 rounded border-slate-300"
              />
              {t('imageRights')}
            </label>
          )}
          {type === 'STUDENT' && (
            <label
              className={`flex items-center gap-2 self-end pb-2 text-sm ${
                mode === 'edit' ? 'text-slate-400' : 'text-slate-700'
              }`}
              title={mode === 'edit' ? t('lockedViaEnrollment') : undefined}
            >
              <input
                type="checkbox"
                name="usesTransport"
                defaultChecked={initial?.usesTransport ?? false}
                disabled={mode === 'edit'}
                className="h-4 w-4 rounded border-slate-300 disabled:cursor-not-allowed"
              />
              {t('usesTransport')}
              {mode === 'edit' && <span className="text-[11px] text-amber-600">🔒</span>}
            </label>
          )}
          {type === 'STUDENT' && (regime === 'DEMI_PENSIONNAIRE' || regime === 'INTERNE') && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700">{t('dietInfo')}</label>
              <textarea
                name="dietInfo"
                rows={2}
                defaultValue={initial?.dietInfo ?? ''}
                placeholder={t('dietInfoHint')}
                className={inputCls}
              />
            </div>
          )}
          </div>
          <PhotoBox
            personId={initial?.id}
            hasPhoto={!!initial?.photoFileId}
            onStage={onStagePhoto}
            stagedUrl={stagedPhotoUrl}
          />
        </div>
      </SectionCard>

      {/* #2 — Bloc Parent/Tuteur juste après l'identité */}
      {showParentsField && (
        <SectionCard title={t('section.parents')}>
          <p className="text-xs text-slate-500">{t('parentsHint')}</p>
          <div className="mt-3 space-y-2">
            {parents.map((p, idx) => {
              const selected = availableParents.find((ap) => ap.id === p.parentId);
              const siblings = selected?.children ?? [];
              return (
                <div key={idx} className="rounded-lg border border-slate-200 p-2">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[200px] flex-1">
                      <label className="block text-xs font-medium text-slate-700">
                        {t('parentLabel')}
                      </label>
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
                      <label className="block text-xs font-medium text-slate-700">
                        {t('relationLabel')}
                      </label>
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
                  {/* #9 — Sous-bloc fratrie : enfants déjà rattachés à ce parent */}
                  {selected && (
                    <div className="mt-2 border-t border-slate-100 pt-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        {tRel('siblingsTitle')}
                      </p>
                      {siblings.length === 0 ? (
                        <p className="mt-1 text-xs text-slate-400">{tRel('siblingsNone')}</p>
                      ) : (
                        <ul className="mt-1 flex flex-wrap gap-1.5">
                          {siblings.map((s, i) => (
                            <li
                              key={i}
                              className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
                            >
                              {s.firstName} {s.lastName}
                              {s.className ? ` · ${s.className}` : ` · ${tRel('siblingsNoClass')}`}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
        </SectionCard>
      )}

      <SectionCard title={t('section.contact')} bodyClass="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
      </SectionCard>

      <SectionCard title={t('section.address')} bodyClass="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {showParentsField &&
            (() => {
              const linked = parents
                .map((p) => availableParents.find((ap) => ap.id === p.parentId))
                .filter(
                  (ap): ap is ParentOption => !!ap && !!(ap.address?.line1 || ap.address?.city),
                );
              if (linked.length === 0) return null;
              return (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 sm:col-span-2">
                  <span className="text-xs text-slate-500">{t('addressFromParent')}</span>
                  {linked.map((ap) => (
                    <button
                      key={ap.id}
                      type="button"
                      onClick={() =>
                        setAddress({
                          line1: ap.address?.line1 ?? '',
                          city: ap.address?.city ?? '',
                          postalCode: ap.address?.postalCode ?? '',
                          country: ap.address?.country ?? 'Maroc',
                        })
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      {ap.firstName} {ap.lastName}
                    </button>
                  ))}
                </div>
              );
            })()}
          <Field label={t('addressLine1')}>
            <input
              type="text"
              name="addressLine1"
              value={address.line1}
              onChange={(e) => setAddress((a) => ({ ...a, line1: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Field label={t('addressCity')}>
            <input
              type="text"
              name="addressCity"
              value={address.city}
              onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Field label={t('addressPostalCode')}>
            <input
              type="text"
              name="addressPostalCode"
              value={address.postalCode}
              onChange={(e) => setAddress((a) => ({ ...a, postalCode: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Field label={t('addressCountry')}>
            <input
              type="text"
              name="addressCountry"
              value={address.country}
              onChange={(e) => setAddress((a) => ({ ...a, country: e.target.value }))}
              className={inputCls}
            />
          </Field>
      </SectionCard>

      {type === 'STUDENT' && mode === 'create' && (
        <SectionCard title={t('health.title')}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('health.allergies')}><textarea name="health_allergies" rows={2} className={inputCls} /></Field>
            <Field label={t('health.chronicConditions')}><textarea name="health_chronicConditions" rows={2} className={inputCls} /></Field>
            <Field label={t('health.treatments')}><textarea name="health_treatments" rows={2} className={inputCls} /></Field>
            <Field label={t('health.vaccinations')}><input type="text" name="health_vaccinations" className={inputCls} /></Field>
            <Field label={t('health.doctorName')}><input type="text" name="health_doctorName" className={inputCls} /></Field>
            <Field label={t('health.doctorPhone')}><input type="text" name="health_doctorPhone" className={inputCls} /></Field>
            <Field label={t('health.emergencyContactName')}><input type="text" name="health_emergencyContactName" className={inputCls} /></Field>
            <Field label={t('health.emergencyContactPhone')}><input type="text" name="health_emergencyContactPhone" className={inputCls} /></Field>
            <Field label={t('health.paiNote')}><input type="text" name="health_paiNote" className={inputCls} /></Field>
          </div>
          <div className="mt-3 space-y-1.5">
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="health_pai" className="h-4 w-4 rounded border-slate-300" /> {t('health.pai')}</label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="health_medAuthorization" className="h-4 w-4 rounded border-slate-300" /> {t('health.medAuthorization')}</label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="health_outingAuthorization" className="h-4 w-4 rounded border-slate-300" /> {t('health.outingAuthorization')}</label>
          </div>
        </SectionCard>
      )}

      {showContractField && (
        <SectionCard title={t('section.contract')}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
            <Field label={t('employmentStatus.label')}>
              <select name="employmentStatus" defaultValue={initial?.employmentStatus ?? 'ACTIVE'} className={inputCls}>
                <option value="ACTIVE">{t('employmentStatus.ACTIVE')}</option>
                <option value="SUSPENDED">{t('employmentStatus.SUSPENDED')}</option>
                <option value="RESIGNED">{t('employmentStatus.RESIGNED')}</option>
                <option value="CONTRACT_END">{t('employmentStatus.CONTRACT_END')}</option>
              </select>
            </Field>
            <Field label={t('cnssNumber')}>
              <input type="text" name="cnssNumber" defaultValue={initial?.cnssNumber ?? ''} placeholder="N° CNSS" className={inputCls} />
            </Field>
            <Field label={t('amoNumber')}>
              <input type="text" name="amoNumber" defaultValue={initial?.amoNumber ?? ''} placeholder="N° AMO" className={inputCls} />
            </Field>
            {type === 'TEACHER' && (
              <Field label={t('contractualHoursPerWeek')}>
                <input
                  type="number"
                  name="contractualHoursPerWeek"
                  min={0}
                  max={60}
                  defaultValue={initial?.contractualHoursPerWeek ?? ''}
                  placeholder={t('contractualHoursPerWeekPlaceholder')}
                  className={inputCls}
                />
                <p className="mt-1 text-xs text-slate-500">{t('contractualHoursPerWeekHint')}</p>
              </Field>
            )}
            {type === 'TEACHER' && (
              <Field label={t('homeRoom')}>
                <select
                  name="homeRoomId"
                  defaultValue={initial?.homeRoomId ?? ''}
                  className={inputCls}
                >
                  <option value="">{t('noRoom')}</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">{t('homeRoomHint')}</p>
              </Field>
            )}
          </div>
          {mode === 'edit' && initial?.id && (
            <ContractUpload personId={initial.id} current={initial.contractFile ?? null} />
          )}
          {mode === 'edit' && initial?.id && (
            <div className="mt-3">
              <DocUpload personId={initial.id} kind="cnssAttestation" hasFile={!!initial.cnssAttestationFileId} label={t('cnssAttestation')} />
            </div>
          )}
          {mode === 'create' && (
            <p className="mt-2 text-xs text-slate-500">{t('contractUploadAfterCreate')}</p>
          )}
        </SectionCard>
      )}

      {type === 'TEACHER' && (
        <SectionCard title={t('section.skills')} bodyClass="space-y-4">
          <MultiPicker
            name="specialtySubjectIds"
            label={t('specialties')}
            hint={t('specialtiesHint')}
            options={allSubjects}
            initial={initial?.specialtySubjectIds ?? []}
          />
          <MultiPicker
            name="cycleIds"
            label={t('cyclesTaught')}
            hint={t('cyclesTaughtHint')}
            options={allCycles}
            initial={initial?.cycleIds ?? []}
          />
          <MultiPicker
            name="priorityClassIds"
            label={t('priorityClasses')}
            hint={t('priorityClassesHint')}
            options={allClasses}
            initial={initial?.priorityClassIds ?? []}
          />
        </SectionCard>
      )}

      {showContractField && (
        <SectionCard title={t('section.hr')} bodyClass="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('experienceYears')}>
              <input
                type="number"
                name="experienceYears"
                min={0}
                max={80}
                defaultValue={initial?.experienceYears ?? ''}
                className={inputCls}
              />
            </Field>
            <Field label={t('seniority')}>
              <input
                type="text"
                disabled
                value={
                  initial?.hireDate
                    ? `${Math.floor((Date.now() - new Date(initial.hireDate).getTime()) / (365.25 * 86400e3))} ${t('yearsSuffix')}`
                    : '—'
                }
                className={`${inputCls} bg-slate-50 text-slate-500`}
              />
            </Field>
          </div>
          <DiplomasField initial={initial?.diplomas ?? []} />
          {type === 'TEACHER' && (
            <AvailabilityField initial={initial?.availability ?? ({} as Availability)} />
          )}
        </SectionCard>
      )}

      {showContractField && (
        <SectionCard title={t('section.financial')} bodyClass="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('bankName')}>
              <input
                type="text"
                name="bankName"
                defaultValue={initial?.bankName ?? ''}
                placeholder="ATTIJARI"
                className={inputCls}
              />
            </Field>
            <Field label={t('rib')}>
              <input
                type="text"
                name="rib"
                defaultValue={initial?.rib ?? ''}
                placeholder="007 780 0001234567890123 45"
                className={`${inputCls} font-mono`}
              />
            </Field>
            <Field label={t('payrollMethod')}>
              <select
                name="payrollMethod"
                defaultValue={initial?.payrollMethod ?? ''}
                className={inputCls}
              >
                <option value="">—</option>
                {PAYROLL_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`payrollMethods.${m}` as never)}
                  </option>
                ))}
              </select>
            </Field>
            <div />
            <Field label={t('grossSalary')}>
              <input
                type="number"
                name="grossSalary"
                step="any"
                min={0}
                defaultValue={initial?.grossSalary ?? ''}
                className={inputCls}
              />
            </Field>
            <Field label={t('netSalary')}>
              <input
                type="number"
                name="netSalary"
                step="any"
                min={0}
                defaultValue={initial?.netSalary ?? ''}
                className={inputCls}
              />
            </Field>
          </div>
          <BenefitsField initial={initial?.benefits ?? []} />
          <DeductionsField initial={initial?.deductions ?? []} />
        </SectionCard>
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
          className="bg-brand-600 hover:bg-brand-700 rounded-lg px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-50"
        >
          {isPending ? t('actions.saving') : t('actions.save')}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700">{label}</span>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </label>
  );
}

function SectionCard({
  title,
  bodyClass,
  children,
}: {
  title: string;
  bodyClass?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-[#E6E6FA] px-5 py-3">
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
      </div>
      <div className={`p-5 ${bodyClass ?? ''}`}>{children}</div>
    </section>
  );
}

function PhotoBox({
  personId,
  hasPhoto,
  onStage,
  stagedUrl,
}: {
  personId?: string;
  hasPhoto: boolean;
  /** Création : la photo est mise en attente et envoyée après l'enregistrement. */
  onStage?: (file: File | null) => void;
  stagedUrl?: string | null;
}) {
  const t = useTranslations('admin.persons.form');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ver, setVer] = useState(0);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setErr('');
    if (!personId) {
      // Mode création : on stocke le fichier, envoi après création.
      onStage?.(file);
      return;
    }
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch(`/api/admin/persons/${personId}/photo/upload`, {
      method: 'POST',
      body: fd,
    });
    setBusy(false);
    if (!r.ok) {
      setErr(await r.text());
      return;
    }
    setVer((v) => v + 1);
    router.refresh();
  }

  const src =
    stagedUrl ??
    (personId && (hasPhoto || ver > 0) ? `/api/admin/persons/${personId}/photo?v=${ver}` : null);

  return (
    <div className="flex w-40 shrink-0 flex-col items-center gap-2">
      <div className="grid h-36 w-36 place-items-center overflow-hidden rounded-2xl border border-blue-100 bg-blue-50">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-16 w-16 text-slate-300"
            aria-hidden="true"
          >
            <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6Z" />
          </svg>
        )}
      </div>
      <label className="cursor-pointer rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
        📷 {t('addPhoto')}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onChange}
          disabled={busy}
          className="hidden"
        />
      </label>
      {err && <p className="text-center text-[11px] text-red-600">{err}</p>}
    </div>
  );
}

function DocUpload({ personId, kind, hasFile, label }: { personId: string; kind: string; hasFile: boolean; label: string }) {
  const t = useTranslations('admin.persons.form');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const endpoint = `/api/admin/persons/${personId}/document/${kind}`;

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    if (file.size > 10 * 1024 * 1024) { setErr(t('contractFileTooLarge')); return; }
    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch(endpoint, { method: 'POST', body: fd });
    setBusy(false);
    if (!r.ok) { setErr(await r.text()); return; }
    router.refresh();
  }
  async function onDelete() {
    if (!confirm(t('contractFileConfirmDelete'))) return;
    setBusy(true);
    await fetch(endpoint, { method: 'DELETE' });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-medium text-slate-700">{label}</div>
      {hasFile ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <a href={`${endpoint}/download`} target="_blank" rel="noopener" className="rounded-lg border border-brand-300 bg-white px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50">📄 {t('view')}</a>
          <button type="button" onClick={onDelete} disabled={busy} className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50">{t('contractFileDelete')}</button>
          <label className="ms-auto cursor-pointer text-xs text-slate-600 hover:text-brand-700">{t('contractFileReplace')}<input type="file" accept="application/pdf,image/*" onChange={onUpload} disabled={busy} className="hidden" /></label>
        </div>
      ) : (
        <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          ⬆ {t('docUpload')}
          <input type="file" accept="application/pdf,image/*" onChange={onUpload} disabled={busy} className="hidden" />
        </label>
      )}
      {err && <p className="mt-1 text-xs text-red-700">{err}</p>}
    </div>
  );
}

function ContractUpload({ personId, current }: { personId: string; current: ContractFile }) {
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
            className="border-brand-300 text-brand-700 hover:bg-brand-50 rounded-lg border bg-white px-3 py-1.5 text-sm font-medium"
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
          <label className="hover:text-brand-700 ms-auto cursor-pointer text-xs text-slate-600">
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
