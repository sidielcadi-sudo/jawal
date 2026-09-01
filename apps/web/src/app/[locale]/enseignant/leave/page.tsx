import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { CreateOwnRequestForm, CancelOwnRequest } from './client';
import { JustificationUpload } from '@/components/leave/justification-upload';

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

export default async function TeacherLeavePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/login`);
  const t = await getTranslations('enseignant.leave');
  const typeLabel = (fr: string, ar: string) => (locale === 'ar' ? ar : fr);
  const justifLabels = {
    view: t('justificationView'),
    add: t('justificationAdd'),
    replace: t('justificationReplace'),
  };

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const personId = await getTeacherPersonId(tx, session.user.id);
    const types = await tx.leaveType.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
      select: { id: true, labelFr: true, labelAr: true },
    });
    const requests = personId
      ? await tx.leaveRequest.findMany({
          where: { personId },
          orderBy: { createdAt: 'desc' },
          include: { leaveType: { select: { labelFr: true, labelAr: true } } },
        })
      : [];
    return { hasTeacher: !!personId, types, requests };
  });

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
      </header>

      {!data.hasTeacher ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {t('noTeacher')}
        </p>
      ) : (
        <>
          <section className="mb-5 rounded-2xl border border-brand-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('newTitle')}</h2>
            <CreateOwnRequestForm
              types={data.types.map((ty) => ({ id: ty.id, label: typeLabel(ty.labelFr, ty.labelAr) }))}
            />
            <p className="mt-2 text-xs text-slate-400">{t('alertNote')}</p>
          </section>

          <section className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="px-3 py-2.5 text-start">{t('type')}</th>
                  <th className="px-3 py-2.5 text-start">{t('period')}</th>
                  <th className="px-3 py-2.5 text-end">{t('days')}</th>
                  <th className="px-3 py-2.5 text-center">{t('status')}</th>
                  <th className="px-3 py-2.5 text-center">{t('justification')}</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.requests.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {typeLabel(r.leaveType.labelFr, r.leaveType.labelAr)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">
                      {new Date(r.startDate).toLocaleDateString(locale)} →{' '}
                      {new Date(r.endDate).toLocaleDateString(locale)}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums text-slate-600">{r.days}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.status]}`}
                      >
                        {t(`statusLabel.${r.status}`)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <JustificationUpload
                        requestId={r.id}
                        hasFile={!!r.justificationFileId}
                        editable={r.status === 'PENDING'}
                        labels={justifLabels}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-end">
                      {r.status === 'PENDING' && <CancelOwnRequest id={r.id} />}
                    </td>
                  </tr>
                ))}
                {data.requests.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
                      {t('empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
