import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { hrFileLabel, type HrFileStatus } from '@/lib/hr-file';

export type StaffDetail = {
  id: string;
  name: string;
  photo: boolean;
  employmentStatus: string | null;
  roleLabel: string | null;
  serviceLabel: string | null;
  /* Coordonnées */
  cin: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  birthDate: Date | null;
  hireDate: Date | null;
  contractLabel: string;
  contractUrgent: boolean;
  hrFile: HrFileStatus;
  /** Pointage du mois en cours. */
  month: {
    label: string;
    present: number;
    absent: number;
    late: number;
    leave: number;
    lateMinutes: number;
    recorded: number;
  };
  /** Absences du mois, dans l'ordre chronologique. */
  absences: Array<{ date: Date; status: string; reason: string | null }>;
};

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  SUSPENDED: 'bg-amber-100 text-amber-800',
  RESIGNED: 'bg-slate-200 text-slate-700',
  CONTRACT_END: 'bg-red-100 text-red-800',
};

const ABSENCE_TONE: Record<string, string> = {
  ABSENT: 'bg-red-100 text-red-800',
  LATE: 'bg-amber-100 text-amber-800',
  LEAVE: 'bg-sky-100 text-sky-800',
  EXCUSED: 'bg-slate-200 text-slate-700',
};

/**
 * Fiche synthétique de l'agent sélectionné, à côté de la liste.
 *
 * Même parti pris que les fiches élève et enseignant : lecture seule, et ce
 * qu'on cherche devant une liste — qui appeler, a-t-il été là ce mois-ci, son
 * dossier tient-il la paie. Les modifications passent par la fiche complète.
 */
export async function StaffDetailPanel({
  detail,
  locale,
  baseHref,
}: {
  detail: StaffDetail;
  locale: string;
  baseHref: string;
}) {
  const t = await getTranslations('admin.persons.staffPanel');
  const tStatus = await getTranslations('admin.persons.form.employmentStatus');
  const tAtt = await getTranslations('admin.persons.staffPanel.day');

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
              {detail.employmentStatus && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    STATUS_TONE[detail.employmentStatus] ?? 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {tStatus(detail.employmentStatus as never)}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-600">
              {[detail.roleLabel, detail.serviceLabel].filter(Boolean).join(' · ') || '—'}
            </p>
            <p className="text-xs text-slate-600">
              <span className={detail.contractUrgent ? 'font-medium text-red-700' : ''}>
                {detail.contractLabel}
              </span>
            </p>
          </div>
        </header>

        <div className="space-y-4 p-4">
          <Block title={t('contact')}>
            <Field label={t('cin')} value={detail.cin} />
            <Field label={t('phone')} value={detail.phone} />
            <Field label={t('email')} value={detail.email} full />
            <Field label={t('birthDate')} value={detail.birthDate?.toLocaleDateString(locale)} />
            <Field label={t('hireDate')} value={detail.hireDate?.toLocaleDateString(locale)} />
            <Field label={t('address')} value={detail.address} full />
          </Block>

          <Block
            title={t('hrFile')}
            badge={
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  detail.hrFile.complete
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {hrFileLabel(detail.hrFile)}
              </span>
            }
          >
            {detail.hrFile.complete ? (
              <p className="col-span-2 text-xs text-slate-600">{t('hrComplete')}</p>
            ) : (
              <ul className="col-span-2 list-inside list-disc text-xs text-amber-900">
                {detail.hrFile.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </Block>

          <Block
            title={t('month')}
            badge={
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                {detail.month.label}
              </span>
            }
          >
            {detail.month.recorded === 0 ? (
              <p className="col-span-2 text-xs text-slate-500">{t('noRecord')}</p>
            ) : (
              <>
                <Stat label={tAtt('PRESENT')} value={detail.month.present} tone="text-emerald-700" />
                <Stat label={tAtt('ABSENT')} value={detail.month.absent} tone="text-red-700" />
                <Stat label={tAtt('LATE')} value={detail.month.late} tone="text-amber-700" />
                <Stat label={tAtt('LEAVE')} value={detail.month.leave} tone="text-sky-700" />
                {detail.month.lateMinutes > 0 && (
                  <p className="col-span-2 text-[11px] text-slate-600">
                    {t('lateMinutes', { count: detail.month.lateMinutes })}
                  </p>
                )}
              </>
            )}
          </Block>

          <Block title={t('absences')}>
            {detail.absences.length === 0 ? (
              <p className="col-span-2 text-xs text-slate-500">{t('noAbsence')}</p>
            ) : (
              <ul className="col-span-2 space-y-1">
                {detail.absences.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-700">{a.date.toLocaleDateString(locale)}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
                      {a.reason ?? ''}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        ABSENCE_TONE[a.status] ?? 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {tAtt(a.status as never)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={`/${locale}/admin/staff-attendance`}
              className="col-span-2 mt-1 block rounded-lg border border-white/70 bg-white/70 px-3 py-2 text-center text-xs font-medium text-slate-700 hover:bg-white"
            >
              {t('seeAttendance')}
            </Link>
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

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className={`text-lg font-bold tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}

/** Message affiché tant qu'aucun agent n'est sélectionné. */
export async function StaffDetailEmpty() {
  const t = await getTranslations('admin.persons.staffPanel');
  return (
    <aside className="w-full shrink-0 xl:w-[380px]">
      <div className="rounded-2xl border border-dashed border-brand-200 title-band p-8 text-center">
        <p className="text-sm text-slate-600">{t('empty')}</p>
      </div>
    </aside>
  );
}
