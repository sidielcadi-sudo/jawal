import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';

export default async function TransportIncidentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.transport');

  const since = new Date();
  since.setDate(since.getDate() - 60);

  const incidents = await withTenant(session.user.tenantId, (tx) =>
    tx.transportAttendanceRecord.findMany({
      where: { status: 'INCIDENT', recordedAt: { gte: since } },
      include: {
        student: { select: { firstName: true, lastName: true } },
        session: { include: { line: { select: { name: true } } } },
      },
      orderBy: { recordedAt: 'desc' },
      take: 100,
    }),
  );

  return (
    <div className="mx-auto max-w-4xl px-3 py-3">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/transport`} className="hover:text-brand-700">🚍 {t('title')}</Link>
        <span className="mx-1.5">›</span>
        <span>{t('incidents.title')}</span>
      </nav>

      <h1 className="mb-4 text-base font-bold text-slate-900">⚠ {t('incidents.title')}</h1>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 text-start">{t('incidents.when')}</th>
              <th className="px-4 py-2.5 text-start">{t('lines.title')}</th>
              <th className="px-4 py-2.5 text-start">{t('students.student')}</th>
              <th className="px-4 py-2.5 text-start">{t('incidents.note')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {incidents.map((i) => (
              <tr key={i.id} className="bg-purple-50/30">
                <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">
                  {new Date(i.recordedAt).toLocaleString(locale)}
                  <span className="ms-1 text-slate-400">
                    · {t(`appel.${i.session.direction === 'MORNING' ? 'morning' : 'evening'}`)}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-600">{i.session.line.name}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{i.student.lastName} {i.student.firstName}</td>
                <td className="px-4 py-2.5 text-slate-700">{i.note ?? '—'}</td>
              </tr>
            ))}
            {incidents.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">{t('incidents.empty')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
