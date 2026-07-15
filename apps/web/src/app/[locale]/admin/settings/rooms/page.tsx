import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { RoomCreateForm, RoomActions } from './client';

export default async function RoomsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.settings.rooms');

  const session = (await auth())!;
  const rooms = await withTenant(session.user.tenantId, (tx) =>
    tx.room.findMany({ orderBy: { code: 'asc' } }),
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className="lg:col-span-2">
        <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
              <tr>
                <th className="px-4 py-3 text-start">{t('table.code')}</th>
                <th className="px-4 py-3 text-start">{t('table.label')}</th>
                <th className="px-4 py-3 text-end">{t('table.capacity')}</th>
                <th className="px-4 py-3 text-start">{t('table.equipment')}</th>
                <th className="px-4 py-3 text-end">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rooms.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-mono text-xs">{r.code}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{r.label}</td>
                  <td className="px-4 py-3 text-end tabular-nums">{r.capacity}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {r.equipment.length > 0 ? r.equipment.join(', ') : '—'}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <Link
                      href={`/${locale}/admin/settings/rooms/${r.id}/timetable`}
                      className="me-3 text-xs text-brand-700 hover:underline"
                    >
                      {t('viewTimetable')}
                    </Link>
                    <RoomActions
                      id={r.id}
                      initial={{
                        code: r.code,
                        label: r.label,
                        capacity: r.capacity,
                        equipment: r.equipment.join(', '),
                      }}
                    />
                  </td>
                </tr>
              ))}
              {rooms.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    {t('empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <aside>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">{t('create')}</h2>
          <p className="mt-1 text-xs text-slate-500">{t('createHint')}</p>
          <div className="mt-4">
            <RoomCreateForm />
          </div>
        </div>
      </aside>
    </div>
  );
}
