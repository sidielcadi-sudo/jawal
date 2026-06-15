import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getStudentPersonId, loadStudentPeriods } from '@/lib/student';

export default async function StudentBulletinsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('eleve.bulletins');
  const session = (await auth())!;

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const studentId = await getStudentPersonId(tx, session.user.id);
    if (!studentId) return null;
    return loadStudentPeriods(tx, studentId);
  });

  if (!data) return <div className="mx-auto max-w-3xl px-6 py-8 text-sm text-slate-500">{t('empty')}</div>;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
        {data.className && <p className="mt-0.5 text-sm text-slate-500">{data.className}</p>}
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        {data.periods.length === 0 ? (
          <p className="text-sm text-slate-500">{t('empty')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.periods.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-800">{p.label}</span>
                <a
                  href={`/api/eleve/bulletin.pdf?period=${p.id}`}
                  target="_blank"
                  rel="noopener"
                  className="rounded-lg border border-brand-600 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 shadow-sm hover:bg-brand-50"
                >
                  {t('view')}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
