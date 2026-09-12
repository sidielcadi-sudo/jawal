import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { personDisplayName } from '@/lib/localized-name';

export type StudentDetail = {
  id: string;
  name: string;
  massarId: string | null;
  birthDate: Date | null;
  birthPlace: string | null;
  gender: string | null;
  address: string | null;
  photo: boolean;
  className: string | null;
  levelLabel: string | null;
  cycleLabel: string | null;
  yearLabel: string | null;
  status: string | null;
  parents: Array<{ role: string; name: string; phone: string | null; email: string | null }>;
  finance: {
    /** Reste dû, tous exercices confondus. */
    remaining: number;
    lastPaymentAt: Date | null;
    nextDueDate: Date | null;
    nextDueAmount: number;
    currency: string;
  } | null;
  attendance: Array<{ date: Date; status: string }>;
};

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  AFFECTE: 'bg-sky-100 text-sky-800',
  INSCRIPTION_VALIDEE: 'bg-indigo-100 text-indigo-800',
  WITHDRAWN: 'bg-slate-200 text-slate-700',
  GRADUATED: 'bg-violet-100 text-violet-800',
};

const ATTENDANCE_TONE: Record<string, string> = {
  PRESENT: 'bg-emerald-100 text-emerald-800',
  ABSENT: 'bg-red-100 text-red-800',
  LATE: 'bg-amber-100 text-amber-800',
  EXCUSED: 'bg-sky-100 text-sky-800',
};

/**
 * Fiche synthétique de l'élève sélectionné, à droite de la liste.
 *
 * Volontairement en **lecture seule** et sans onglets : la fiche complète
 * existe déjà, avec ses écrans dédiés (scolarité, notes, absences, finances).
 * Dupliquer ici la saisie créerait deux endroits où modifier la même donnée.
 * Ce panneau sert à décider — reconnaître l'élève, voir qui appeler, savoir
 * s'il doit de l'argent — puis à basculer sur l'écran qui convient.
 */
export async function StudentDetailPanel({
  detail,
  locale,
  baseHref,
}: {
  detail: StudentDetail;
  locale: string;
  baseHref: string;
}) {
  const t = await getTranslations('admin.persons.detailPanel');
  const tStatus = await getTranslations('admin.persons.studentStatus');
  const tAtt = await getTranslations('admin.attendance.status');

  const age =
    detail.birthDate != null
      ? Math.floor((Date.now() - detail.birthDate.getTime()) / 31_557_600_000)
      : null;

  const fmt = (n: number) =>
    n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <aside className="w-full shrink-0 space-y-4 xl:w-[380px]">
      {/* Même bordure et même fond que la bande de titre : la fiche se lit
          comme une extension de l'en-tête, pas comme un bloc rapporté. Les
          sous-blocs restent sur un blanc translucide pour que le texte garde
          son contraste sur le dégradé. */}
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
            <span className="grid h-16 w-16 place-items-center rounded-xl bg-slate-100 text-lg font-semibold text-slate-500">
              {detail.name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold text-slate-900">{detail.name}</h2>
              {detail.status && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    STATUS_TONE[detail.status] ?? 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {tStatus(detail.status as never)}
                </span>
              )}
            </div>
            {detail.massarId && (
              <p className="mt-0.5 text-xs text-slate-500">
                {t('massar')} : {detail.massarId}
              </p>
            )}
            {detail.birthDate && (
              <p className="text-xs text-slate-500">
                {t('bornOn', { date: detail.birthDate.toLocaleDateString(locale) })}
                {age !== null ? ` (${t('age', { age })})` : ''}
              </p>
            )}
            <p className="mt-0.5 text-xs text-slate-500">
              {[detail.className, detail.cycleLabel, detail.yearLabel].filter(Boolean).join(' · ')}
            </p>
          </div>
        </header>

        <div className="space-y-4 p-4">
          <Block title={t('personal')}>
            <Field label={t('birthDate')} value={detail.birthDate?.toLocaleDateString(locale)} />
            <Field label={t('birthPlace')} value={detail.birthPlace} />
            <Field label={t('gender')} value={detail.gender ? t(`genders.${detail.gender}` as never) : null} />
            <Field label={t('level')} value={detail.levelLabel} />
            <Field label={t('address')} value={detail.address} full />
          </Block>

          <Block title={t('parents')}>
            {detail.parents.length === 0 ? (
              <p className="col-span-2 text-xs text-slate-400">{t('noParent')}</p>
            ) : (
              detail.parents.map((p) => (
                <div key={p.name + p.role} className="col-span-2 rounded-lg bg-white/80 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800">{p.name}</span>
                    <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                      {t(`relation.${p.role}` as never)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{p.phone ?? '—'}</div>
                  {p.email && <div className="text-xs text-slate-500">{p.email}</div>}
                </div>
              ))
            )}
          </Block>

          {detail.finance && (
            <Block
              title={t('payments')}
              badge={
                detail.finance.remaining > 0.01 ? (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800">
                    {t('due', { amount: `${fmt(detail.finance.remaining)} ${detail.finance.currency}` })}
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                    {t('upToDate')}
                  </span>
                )
              }
            >
              <Field
                label={t('lastPayment')}
                value={detail.finance.lastPaymentAt?.toLocaleDateString(locale)}
              />
              <Field
                label={t('nextDue')}
                value={
                  detail.finance.nextDueDate
                    ? `${detail.finance.nextDueDate.toLocaleDateString(locale)} · ${fmt(
                        detail.finance.nextDueAmount,
                      )} ${detail.finance.currency}`
                    : null
                }
              />
              <Link
                href={`${baseHref}/${detail.id}/finance`}
                className="col-span-2 mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {t('seePayments')}
              </Link>
            </Block>
          )}

          <Block title={t('attendance')}>
            {detail.attendance.length === 0 ? (
              <p className="col-span-2 text-xs text-slate-400">{t('noAttendance')}</p>
            ) : (
              <ul className="col-span-2 space-y-1">
                {detail.attendance.map((a, i) => (
                  <li key={i} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">
                      {t('on', { date: a.date.toLocaleDateString(locale) })}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        ATTENDANCE_TONE[a.status] ?? 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {/* Les statuts sont stockés en majuscules, les clés
                          i18n en minuscules. */}
                      {tAtt(a.status.toLowerCase() as never)}
                    </span>
                  </li>
                ))}
              </ul>
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

function Field({
  label,
  value,
  full = false,
}: {
  label: string;
  value?: string | null;
  full?: boolean;
}) {
  return (
    <div className={full ? 'col-span-2' : undefined}>
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800">{value || '—'}</dd>
    </div>
  );
}

/** Message affiché tant qu'aucun élève n'est sélectionné. */
export async function StudentDetailEmpty() {
  const t = await getTranslations('admin.persons.detailPanel');
  return (
    <aside className="w-full shrink-0 xl:w-[380px]">
      <div className="rounded-2xl border border-dashed border-brand-200 title-band p-8 text-center">
        <p className="text-sm text-slate-400">{t('empty')}</p>
      </div>
    </aside>
  );
}

export { personDisplayName };
