'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createFeeScheduleAction,
  deleteFeeScheduleAction,
  updateFeeScheduleAction,
  createDiscountRuleAction,
  updateDiscountRuleAction,
  deleteDiscountRuleAction,
  saveRefundableCategoriesAction,
} from './actions';

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

const FEE_CATEGORIES = ['TUITION', 'INSCRIPTION', 'TRANSPORT', 'CANTEEN', 'DAYCARE', 'OTHER'] as const;
type FeeCategoryKey = (typeof FEE_CATEGORIES)[number];

export function FeeCreateForm({
  kind,
  years,
  levels,
  currency,
}: {
  kind: 'ANNUAL' | 'EXCEPTIONAL';
  years: { id: string; label: string; active: boolean }[];
  levels: { id: string; label: string }[];
  currency: string;
}) {
  const t = useTranslations('admin.settings.fees.form');
  const tc = useTranslations('admin.settings.fees.form.categories');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [category, setCategory] = useState<FeeCategoryKey>(kind === 'ANNUAL' ? 'TUITION' : 'OTHER');
  const ref = useRef<HTMLFormElement>(null);

  function onSubmit(formData: FormData) {
    setError('');
    startTransition(async () => {
      const r = await createFeeScheduleAction(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      ref.current?.reset();
      // `reset()` ne touche pas l'état React de la catégorie.
      setCategory(kind === 'ANNUAL' ? 'TUITION' : 'OTHER');
      router.refresh();
    });
  }

  // L'année active est celle sur laquelle on paramètre au quotidien : elle
  // s'impose par défaut, les autres restent accessibles dans la liste.
  const defaultYearId = years.find((y) => y.active)?.id ?? years[0]?.id;

  return (
    <form ref={ref} action={onSubmit} className="space-y-3">
      <input type="hidden" name="kind" value={kind} />
      {/* Le libellé n'est plus saisi : il découle de la catégorie choisie, ce
          qui évite deux noms différents pour un même type de frais. */}
      <input type="hidden" name="label" value={tc(category)} />
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('year')}</label>
        <select name="academicYearId" required defaultValue={defaultYearId} className={inputCls}>
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label}
              {y.active ? ' (actif)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('level')}</label>
        <select name="levelId" required defaultValue="" className={inputCls}>
          <option value="" disabled>
            —
          </option>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('category')}</label>
        <select
          name="category"
          value={category}
          onChange={(e) => setCategory(e.target.value as FeeCategoryKey)}
          className={inputCls}
        >
          {FEE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {tc(c)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-700">
            {t('totalAmount')} ({currency})
          </label>
          <input
            type="number"
            name="totalAmount"
            required
            min={1}
            step="0.01"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('installmentCount')}</label>
          <input
            type="number"
            name="installmentCount"
            defaultValue={9}
            min={1}
            max={24}
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('firstDueMonth')}</label>
        <select name="firstDueMonth" defaultValue={9} className={inputCls}>
          {Array.from({ length: 12 }).map((_, i) => (
            <option key={i + 1} value={i + 1}>
              {new Date(2000, i, 1).toLocaleString('fr', { month: 'long' })}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="installmentLocked" className="h-4 w-4 rounded border-slate-300" />
        {t('installmentLocked')}
      </label>
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

type FeeData = {
  label: string;
  category: 'TUITION' | 'INSCRIPTION' | 'TRANSPORT' | 'CANTEEN' | 'DAYCARE' | 'OTHER';
  totalAmount: number;
  installmentCount: number;
  installmentLocked: boolean;
  firstDueMonth: number;
};

export function FeeRowActions({
  id,
  initial,
  currency,
}: {
  id: string;
  initial: FeeData;
  currency: string;
}) {
  const t = useTranslations('admin.settings.fees');
  const tForm = useTranslations('admin.settings.fees.form');
  const tc = useTranslations('admin.settings.fees.form.categories');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  function del() {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      const r = await deleteFeeScheduleAction(id);
      if (r.ok) router.refresh();
      else alert(r.error);
    });
  }

  function onSave(formData: FormData) {
    setError('');
    startTransition(async () => {
      const r = await updateFeeScheduleAction(id, formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="flex justify-end gap-3">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs text-slate-500 hover:text-brand-700"
      >
        {t('actions.edit')}
      </button>
      <button
        type="button"
        onClick={del}
        disabled={isPending}
        className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
      >
        {t('actions.delete')}
      </button>

      {editing && (
        <div
          className="fixed inset-0 z-20 grid place-items-center bg-slate-900/40 p-4"
          onClick={() => setEditing(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-start shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">{t('actions.edit')}</h3>
            <form action={onSave} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">{tForm('label')}</label>
                <input type="text" name="label" required defaultValue={initial.label} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">{tForm('category')}</label>
                <select name="category" defaultValue={initial.category} className={inputCls}>
                  {FEE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {tc(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700">
                    {tForm('totalAmount')} ({currency})
                  </label>
                  <input
                    type="number"
                    name="totalAmount"
                    required
                    min={1}
                    step="0.01"
                    defaultValue={initial.totalAmount}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">{tForm('installmentCount')}</label>
                  <input
                    type="number"
                    name="installmentCount"
                    min={1}
                    max={24}
                    defaultValue={initial.installmentCount}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">{tForm('firstDueMonth')}</label>
                <select name="firstDueMonth" defaultValue={initial.firstDueMonth} className={inputCls}>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(2000, i, 1).toLocaleString('fr', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="installmentLocked"
                  defaultChecked={initial.installmentLocked}
                  className="h-4 w-4 rounded border-slate-300"
                />
                {tForm('installmentLocked')}
              </label>
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
      )}
    </div>
  );
}

// ─── Réductions paramétrables (#1/#5) ─────────────────────────────────────

type DiscountData = {
  label: string;
  pct: number;
  active: boolean;
  order: number;
  /** Frais couverts. Vide = tous les frais. */
  feeIds: string[];
};
type FeeOption = { id: string; label: string };

/**
 * Choix des frais couverts par une réduction : aucun coché = tous les frais,
 * sinon la sélection exacte. Une réduction « fratrie » porte souvent sur la
 * scolarité et la cantine mais pas sur l'inscription — d'où le besoin de
 * cocher plusieurs frais sans les tous prendre.
 */
function FeeScopePicker({
  fees,
  selected,
  onChange,
  label,
  allLabel,
}: {
  fees: FeeOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  label: string;
  allLabel: string;
}) {
  const all = selected.length === 0;
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((f) => f !== id) : [...selected, id]);

  return (
    <div>
      <label className="block text-xs font-medium text-slate-700">{label}</label>
      {/* Les cases cochées partent en `feeIds` répétés dans le FormData. */}
      {selected.map((id) => (
        <input key={id} type="hidden" name="feeIds" value={id} />
      ))}
      <div className="mt-1 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-300 p-2">
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={all}
            onChange={() => onChange([])}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span className={all ? 'font-medium' : ''}>{allLabel}</span>
        </label>
        <div className="my-1 border-t border-slate-100" />
        {fees.map((f) => (
          <label key={f.id} className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={selected.includes(f.id)}
              onChange={() => toggle(f.id)}
              className="h-4 w-4 rounded border-slate-300"
            />
            {f.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export function DiscountCreateForm({ fees }: { fees: FeeOption[] }) {
  const t = useTranslations('admin.settings.fees.discounts');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [feeIds, setFeeIds] = useState<string[]>([]);
  const ref = useRef<HTMLFormElement>(null);

  function onSubmit(formData: FormData) {
    setError('');
    startTransition(async () => {
      const r = await createDiscountRuleAction(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      ref.current?.reset();
      setFeeIds([]);
      router.refresh();
    });
  }

  return (
    <form ref={ref} action={onSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-700">{t('label')}</label>
        <input type="text" name="label" required placeholder={t('labelPlaceholder')} className={inputCls} />
      </div>
      <FeeScopePicker
        fees={fees}
        selected={feeIds}
        onChange={setFeeIds}
        label={t('feeScope')}
        allLabel={t('allFees')}
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('pct')} (%)</label>
          <input type="number" name="pct" required min={0} max={100} step="0.01" defaultValue={10} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">{t('order')}</label>
          <input type="number" name="order" min={0} max={999} defaultValue={0} className={inputCls} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="active" defaultChecked className="h-4 w-4 rounded border-slate-300" />
        {t('active')}
      </label>
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

export function DiscountRowActions({
  id,
  initial,
  fees,
}: {
  id: string;
  initial: DiscountData;
  fees: FeeOption[];
}) {
  const t = useTranslations('admin.settings.fees.discounts');
  const tFees = useTranslations('admin.settings.fees');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [feeIds, setFeeIds] = useState<string[]>(initial.feeIds);

  function del() {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      const r = await deleteDiscountRuleAction(id);
      if (r.ok) router.refresh();
      else alert(r.error);
    });
  }

  function onSave(formData: FormData) {
    setError('');
    startTransition(async () => {
      const r = await updateDiscountRuleAction(id, formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="flex justify-end gap-3">
      <button type="button" onClick={() => setEditing(true)} className="text-xs text-slate-500 hover:text-brand-700">
        {tFees('actions.edit')}
      </button>
      <button
        type="button"
        onClick={del}
        disabled={isPending}
        className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
      >
        {tFees('actions.delete')}
      </button>

      {editing && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-slate-900/40 p-4" onClick={() => setEditing(false)}>
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-start shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">{tFees('actions.edit')}</h3>
            <form action={onSave} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">{t('label')}</label>
                <input type="text" name="label" required defaultValue={initial.label} className={inputCls} />
              </div>
              <FeeScopePicker
                fees={fees}
                selected={feeIds}
                onChange={setFeeIds}
                label={t('feeScope')}
                allLabel={t('allFees')}
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">{t('pct')} (%)</label>
                  <input type="number" name="pct" required min={0} max={100} step="0.01" defaultValue={initial.pct} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">{t('order')}</label>
                  <input type="number" name="order" min={0} max={999} defaultValue={initial.order} className={inputCls} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="active" defaultChecked={initial.active} className="h-4 w-4 rounded border-slate-300" />
                {t('active')}
              </label>
              {error && (
                <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
              )}
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
                >
                  {isPending ? t('saving') : t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/** Réglage : remboursabilité par catégorie (calcul remboursement radiation). */
export function RefundableConfig({ initial }: { initial: Record<string, boolean> }) {
  const t = useTranslations('admin.settings.fees.refundable');
  const tc = useTranslations('admin.settings.fees.form.categories');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [map, setMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(FEE_CATEGORIES.map((c) => [c, initial[c] !== false])),
  );
  const [msg, setMsg] = useState('');

  function save() {
    setMsg('');
    start(async () => {
      const r = await saveRefundableCategoriesAction(map);
      if (!r.ok) return setMsg(r.error ?? 'Erreur');
      setMsg(t('saved'));
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">{t('title')}</h2>
      <p className="mt-1 text-xs text-slate-500">{t('hint')}</p>
      <div className="mt-4 space-y-2">
        {FEE_CATEGORIES.map((c) => (
          <label key={c} className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={map[c] !== false}
              onChange={(e) => setMap((m) => ({ ...m, [c]: e.target.checked }))}
            />
            {tc(c)}
          </label>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {t('save')}
        </button>
        {msg && <span className="text-xs text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}
