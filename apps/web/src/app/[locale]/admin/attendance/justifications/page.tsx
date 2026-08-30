import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { reviewJustificationFormAction } from './actions';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';

export default async function JustificationsQueuePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.justifications');

  const filterStatus = (sp.status ?? 'PENDING') as 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';

  const items = await withTenant(session.user.tenantId, async (tx) => {
    const rows = await tx.absenceJustification.findMany({
      where: filterStatus === 'ALL' ? {} : { status: filterStatus },
      include: {
        attendanceRecord: {
          include: {
            student: {
              select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true },
            },
            session: {
              include: {
                class: { select: { id: true, name: true, nameAr: true } },
              },
            },
          },
        },
      },
      orderBy: [{ status: 'asc' }, { submittedAt: 'desc' }],
      take: 200,
    });
    return rows;
  });

  const counts = await withTenant(session.user.tenantId, async (tx) => ({
    pending: await tx.absenceJustification.count({ where: { status: 'PENDING' } }),
    approved: await tx.absenceJustification.count({ where: { status: 'APPROVED' } }),
    rejected: await tx.absenceJustification.count({ where: { status: 'REJECTED' } }),
  }));

  return (
    <div className="px-3 py-3">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/attendance`} className="hover:text-brand-700">
          {t('breadcrumb.attendance')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('breadcrumb.justifications')}</span>
      </nav>
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-1 text-xs">
        <FilterPill
          href={`/${locale}/admin/attendance/justifications?status=PENDING`}
          active={filterStatus === 'PENDING'}
          label={t('filter.pending')}
          count={counts.pending}
          color="amber"
        />
        <FilterPill
          href={`/${locale}/admin/attendance/justifications?status=APPROVED`}
          active={filterStatus === 'APPROVED'}
          label={t('filter.approved')}
          count={counts.approved}
          color="emerald"
        />
        <FilterPill
          href={`/${locale}/admin/attendance/justifications?status=REJECTED`}
          active={filterStatus === 'REJECTED'}
          label={t('filter.rejected')}
          count={counts.rejected}
          color="red"
        />
        <FilterPill
          href={`/${locale}/admin/attendance/justifications?status=ALL`}
          active={filterStatus === 'ALL'}
          label={t('filter.all')}
          count={counts.pending + counts.approved + counts.rejected}
        />
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
          {filterStatus === 'PENDING' ? '✅ ' : ''}
          {t('empty')}
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((j) => {
            const student = j.attendanceRecord.student;
            const cls = j.attendanceRecord.session.class;
            const date = j.attendanceRecord.session.date;
            const status = j.attendanceRecord.status;
            const isPending = j.status === 'PENDING';

            return (
              <li
                key={j.id}
                className="rounded-2xl border border-slate-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/${locale}/admin/persons/${student.id}`}
                        className="font-semibold text-slate-900 hover:text-brand-700 hover:underline"
                      >
                        {personDisplayName(locale, student)}
                      </Link>
                      <RecordStatusBadge status={status} t={t} />
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      <Link
                        href={`/${locale}/admin/classes/${cls.id}`}
                        className="hover:text-brand-700"
                      >
                        {localizedLabel(locale, cls.name, cls.nameAr)}
                      </Link>
                      {' · '}
                      {new Date(date).toLocaleDateString(locale, {
                        weekday: 'short',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                      {' · '}
                      {t('submittedAt', {
                        date: new Date(j.submittedAt).toLocaleString(locale),
                      })}
                    </div>
                  </div>
                  <JustificationStatusBadge status={j.status} t={t} />
                </div>

                <div className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {j.reason}
                </div>

                {j.attachmentUrl && (
                  <a
                    href={
                      /^https?:\/\//.test(j.attachmentUrl)
                        ? j.attachmentUrl
                        : `/api/justifications/${j.id}/attachment`
                    }
                    target="_blank"
                    rel="noopener"
                    className="mt-2 inline-block text-xs text-brand-700 hover:underline"
                  >
                    📎 {t('attachment')}
                  </a>
                )}

                {j.status !== 'PENDING' && j.reviewNote && (
                  <p className="mt-2 text-xs text-slate-500">
                    <strong>{t('reviewNote')} :</strong> {j.reviewNote}
                  </p>
                )}

                {isPending && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <form action={reviewJustificationFormAction}>
                      <input type="hidden" name="justificationId" value={j.id} />
                      <input type="hidden" name="decision" value="APPROVED" />
                      <button
                        type="submit"
                        className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                      >
                        ✓ {t('approve')}
                      </button>
                    </form>

                    <form action={reviewJustificationFormAction} className="flex items-center gap-2">
                      <input type="hidden" name="justificationId" value={j.id} />
                      <input type="hidden" name="decision" value="REJECTED" />
                      <input
                        type="text"
                        name="reviewNote"
                        placeholder={t('rejectNotePlaceholder')}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-64"
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                      >
                        ✕ {t('reject')}
                      </button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FilterPill({
  href,
  active,
  label,
  count,
  color,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  color?: 'amber' | 'emerald' | 'red';
}) {
  const dot =
    color === 'amber'
      ? 'bg-amber-500'
      : color === 'emerald'
        ? 'bg-emerald-500'
        : color === 'red'
          ? 'bg-red-500'
          : 'bg-slate-400';
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${
        active
          ? 'border-brand-300 bg-brand-50 text-brand-700'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {color && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      <span>{label}</span>
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600">
        {count}
      </span>
    </Link>
  );
}

function RecordStatusBadge({
  status,
  t,
}: {
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
  t: (k: string) => string;
}) {
  const map = {
    PRESENT: 'bg-emerald-100 text-emerald-700',
    ABSENT: 'bg-red-100 text-red-700',
    LATE: 'bg-amber-100 text-amber-700',
    EXCUSED: 'bg-blue-100 text-blue-700',
  } as const;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${map[status]}`}>
      {t(`record.${status}`)}
    </span>
  );
}

function JustificationStatusBadge({
  status,
  t,
}: {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  t: (k: string) => string;
}) {
  const map = {
    PENDING: 'bg-amber-100 text-amber-700',
    APPROVED: 'bg-emerald-100 text-emerald-700',
    REJECTED: 'bg-red-100 text-red-700',
  } as const;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>
      {t(`status.${status}`)}
    </span>
  );
}
