import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { financialLabel, type FinancialStatus } from '@/lib/parent-file';

export type ParentDetail = {
  id: string;
  name: string;
  photo: boolean;
  /** Lien de parenté le plus fréquent parmi ses enfants (père, mère, tuteur). */
  relation: string | null;
  cin: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  profession: string | null;
  portal: { active: boolean; email: string | null; lastLoginAt: Date | null };
  children: Array<{
    id: string;
    name: string;
    className: string | null;
    levelLabel: string | null;
  }>;
  financial: FinancialStatus;
  currency: string;
  /** Ce qui manque à la fiche de contact. */
  missing: string[];
};

/**
 * Fiche synthétique du parent sélectionné, à côté de la liste.
 *
 * Mêmes principes que les fiches élève, enseignant et personnel : lecture
 * seule, et les quatre questions qu'on se pose devant une liste de parents —
 * de quels élèves s'agit-il, comment le joindre, a-t-il le portail, doit-il de
 * l'argent.
 */
export async function ParentDetailPanel({
  detail,
  locale,
  baseHref,
}: {
  detail: ParentDetail;
  locale: string;
  baseHref: string;
}) {
  const t = await getTranslations('admin.persons.parentPanel');

  const fin = detail.financial;
  const finTone =
    fin.state === 'LATE'
      ? 'bg-red-100 text-red-800'
      : fin.state === 'UP_TO_DATE'
        ? 'bg-emerald-100 text-emerald-800'
        : 'bg-slate-200 text-slate-700';

  return (
    <aside className="w-full shrink-0 space-y-4 xl:w-[380px]">
      <section className="overflow-hidden rounded-2xl border border-brand-200 title-band">
        <header className="flex items-center gap-3 border-b border-white/60 px-4 py-4">
          {detail.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/admin/persons/${detail.id}/photo`}
              alt=""
              className="h-16 w-16 rounded-xl object-cover"
            />
          ) : (
            <span className="grid h-16 w-16 place-items-center rounded-xl bg-white/70 text-lg font-semibold text-slate-500">
              {detail.name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold text-slate-900">{detail.name}</h2>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${finTone}`}>
                {financialLabel(fin)}
              </span>
            </div>
            {detail.relation && <p className="mt-0.5 text-xs text-slate-600">{detail.relation}</p>}
            <p className="text-xs text-slate-600">
              {t('childCount', { count: detail.children.length })}
            </p>
          </div>
        </header>

        <div className="space-y-4 p-4">
          <Block
            title={t('contact')}
            badge={
              detail.missing.length > 0 ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                  {t('toComplete')}
                </span>
              ) : undefined
            }
          >
            <Field label={t('phone')} value={detail.phone} />
            <Field label={t('whatsapp')} value={detail.whatsapp} />
            <Field label={t('email')} value={detail.email} full />
            <Field label={t('cin')} value={detail.cin} />
            <Field label={t('profession')} value={detail.profession} />
            <Field label={t('address')} value={detail.address} full />
            {detail.missing.length > 0 && (
              <p className="col-span-2 text-[11px] text-amber-800">
                {t('missing', { fields: detail.missing.join(', ') })}
              </p>
            )}
          </Block>

          <Block title={t('children')}>
            {detail.children.length === 0 ? (
              <p className="col-span-2 text-xs text-slate-500">{t('noChild')}</p>
            ) : (
              <ul className="col-span-2 space-y-1.5">
                {detail.children.map((c) => (
                  <li key={c.id} className="rounded-lg bg-white/80 px-3 py-2">
                    <Link
                      href={`${baseHref}/${c.id}`}
                      className="text-sm font-medium text-slate-800 hover:text-brand-700 hover:underline"
                    >
                      {c.name}
                    </Link>
                    <div className="text-[11px] text-slate-500">
                      {[c.className, c.levelLabel].filter(Boolean).join(' · ') || t('noClass')}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block
            title={t('portal')}
            badge={
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  detail.portal.active
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {detail.portal.active ? t('portalActive') : t('portalInactive')}
              </span>
            }
          >
            <Field label={t('portalEmail')} value={detail.portal.email} full />
            <Field
              label={t('lastLogin')}
              value={detail.portal.lastLoginAt?.toLocaleDateString(locale) ?? t('neverLogged')}
              full
            />
          </Block>

          <Block title={t('finance')}>
            <Field label={t('status')} value={financialLabel(fin)} />
            <Field
              label={t('overdue')}
              value={
                fin.overdueAmount > 0
                  ? `${fin.overdueAmount.toLocaleString(locale, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })} ${detail.currency}`
                  : '—'
              }
            />
            {detail.children.length > 0 && (
              <Link
                href={`${baseHref}/${detail.children[0]!.id}/finance`}
                className="col-span-2 mt-1 block rounded-lg border border-white/70 bg-white/70 px-3 py-2 text-center text-xs font-medium text-slate-700 hover:bg-white"
              >
                {t('seeFinance')}
              </Link>
            )}
          </Block>

          <Link
            href={`${baseHref}/${detail.id}`}
            className="block rounded-lg bg-brand-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-brand-700"
          >
            {t('openFile')}
          </Link>
        </div>
      </section>
    </aside>
  );
}

function Block({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/70 bg-white/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {badge}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">{children}</dl>
    </div>
  );
}

function Field({ label, value, full = false }: { label: string; value?: string | null; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : undefined}>
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className="truncate text-sm text-slate-800">{value || '—'}</dd>
    </div>
  );
}

/** Message affiché tant qu'aucun parent n'est sélectionné. */
export async function ParentDetailEmpty() {
  const t = await getTranslations('admin.persons.parentPanel');
  return (
    <aside className="w-full shrink-0 xl:w-[380px]">
      <div className="rounded-2xl border border-dashed border-brand-200 title-band p-8 text-center">
        <p className="text-sm text-slate-600">{t('empty')}</p>
      </div>
    </aside>
  );
}
