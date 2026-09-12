import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export type TeacherDetail = {
  id: string;
  name: string;
  matricule: string | null;
  birthDate: Date | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  photo: boolean;
  employmentStatus: string | null;
  hiredAt: Date | null;
  cycles: string[];
  specialties: string[];
  /** Niveaux réellement enseignés cette année, déduits des classes tenues. */
  levels: string[];
  classes: string[];
  /** Pointage du mois en cours. */
  attendance: {
    monthLabel: string;
    present: number;
    absent: number;
    late: number;
    leave: number;
    lateMinutes: number;
    recorded: number;
  };
};

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  SUSPENDED: 'bg-amber-100 text-amber-800',
  RESIGNED: 'bg-slate-200 text-slate-700',
  CONTRACT_END: 'bg-red-100 text-red-800',
};

/**
 * Fiche synthétique de l'enseignant sélectionné, à côté de la liste.
 *
 * Même parti pris que la fiche élève : lecture seule, et pas d'onglets. On y
 * répond aux questions qu'on se pose devant une liste — qui est-ce, qu'est-ce
 * qu'il enseigne et à quels niveaux, est-il assidu ce mois-ci — puis on bascule
 * sur la fiche complète pour modifier quoi que ce soit.
 */
export async function TeacherDetailPanel({
  detail,
  locale,
  baseHref,
}: {
  detail: TeacherDetail;
  locale: string;
  baseHref: string;
}) {
  const t = await getTranslations('admin.persons.teacherPanel');
  const tStatus = await getTranslations('admin.persons.form.employmentStatus');

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
            {detail.matricule && (
              <p className="mt-0.5 text-xs text-slate-600">
                {t('matricule')} : {detail.matricule}
              </p>
            )}
            {detail.cycles.length > 0 && (
              <p className="mt-0.5 text-xs text-slate-600">{detail.cycles.join(' · ')}</p>
            )}
          </div>
        </header>

        <div className="space-y-4 p-4">
          <Block title={t('personal')}>
            <Field label={t('birthDate')} value={detail.birthDate?.toLocaleDateString(locale)} />
            <Field
              label={t('gender')}
              value={detail.gender ? t(`genders.${detail.gender}` as never) : null}
            />
            <Field label={t('phone')} value={detail.phone} />
            <Field label={t('email')} value={detail.email} />
            <Field label={t('hiredAt')} value={detail.hiredAt?.toLocaleDateString(locale)} />
            <Field label={t('address')} value={detail.address} full />
          </Block>

          <Block title={t('specialties')}>
            <Chips items={detail.specialties} empty={t('noSpecialty')} tone="sky" />
          </Block>

          <Block title={t('levels')}>
            {/* Niveaux, puis classes : le niveau dit ce qu'on enseigne, la
                classe où. Les deux sont utiles et ne se déduisent pas l'un de
                l'autre quand un professeur tient deux cycles. */}
            <Chips items={detail.levels} empty={t('noLevel')} tone="violet" />
            {detail.classes.length > 0 && (
              <p className="col-span-2 mt-1 text-[11px] text-slate-600">
                {t('classesLine', { classes: detail.classes.join(', ') })}
              </p>
            )}
          </Block>

          <Block
            title={t('attendance')}
            badge={
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                {detail.attendance.monthLabel}
              </span>
            }
          >
            {detail.attendance.recorded === 0 ? (
              <p className="col-span-2 text-xs text-slate-500">{t('noAttendance')}</p>
            ) : (
              <>
                <Stat label={t('present')} value={detail.attendance.present} tone="text-emerald-700" />
                <Stat label={t('absent')} value={detail.attendance.absent} tone="text-red-700" />
                <Stat label={t('late')} value={detail.attendance.late} tone="text-amber-700" />
                <Stat label={t('leave')} value={detail.attendance.leave} tone="text-sky-700" />
                {detail.attendance.lateMinutes > 0 && (
                  <p className="col-span-2 text-[11px] text-slate-600">
                    {t('lateMinutes', { count: detail.attendance.lateMinutes })}
                  </p>
                )}
              </>
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

function Chips({ items, empty, tone }: { items: string[]; empty: string; tone: 'sky' | 'violet' }) {
  const cls = tone === 'sky' ? 'bg-sky-100 text-sky-800' : 'bg-violet-100 text-violet-800';
  if (items.length === 0) return <p className="col-span-2 text-xs text-slate-500">{empty}</p>;
  return (
    <div className="col-span-2 flex flex-wrap gap-1.5">
      {items.map((s) => (
        <span key={s} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
          {s}
        </span>
      ))}
    </div>
  );
}

/** Message affiché tant qu'aucun enseignant n'est sélectionné. */
export async function TeacherDetailEmpty() {
  const t = await getTranslations('admin.persons.teacherPanel');
  return (
    <aside className="w-full shrink-0 xl:w-[380px]">
      <div className="rounded-2xl border border-dashed border-brand-200 title-band p-8 text-center">
        <p className="text-sm text-slate-600">{t('empty')}</p>
      </div>
    </aside>
  );
}
