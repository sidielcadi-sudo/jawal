import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant, prisma } from '@/lib/db';

// Le layout a déjà vérifié l'auth et redirigé les super-admin.
// Ici on peut directement consommer la session.
export default async function AdminDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const tenantId = session.user.tenantId;
  const t = await getTranslations('admin.dashboard');

  // Démonstration RLS bout-en-bout (cf. commit S0).
  const { studentCount, teacherCount, classCount, year } = await withTenant(tenantId, async (tx) => {
    const [studentCount, teacherCount, classCount, year] = await Promise.all([
      tx.person.count({ where: { type: 'STUDENT', deletedAt: null } }),
      tx.person.count({ where: { type: 'TEACHER', deletedAt: null } }),
      tx.class.count(),
      tx.academicYear.findFirst({ where: { active: true } }),
    ]);
    return { studentCount, teacherCount, classCount, year: year?.label ?? '—' };
  });

  const unscopedStudentCount = await prisma.person.count({ where: { type: 'STUDENT' } });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('welcome', { name: session.user.email ?? '' })}</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t('kpi.students')} value={studentCount} />
        <Kpi label={t('kpi.teachers')} value={teacherCount} />
        <Kpi label={t('kpi.classes')} value={classCount} />
        <Kpi label={t('kpi.activeYear')} value={year} />
      </div>

      <section className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-base font-semibold text-emerald-900">{t('rls.title')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-emerald-800">
          {t('rls.explanation', { tenantId })}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-emerald-300 bg-white p-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-emerald-700">Avec withTenant()</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {studentCount}{' '}
              <span className="text-sm font-normal text-slate-500">élèves visibles</span>
            </div>
          </div>
          <div className="rounded-lg border border-emerald-300 bg-white p-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-emerald-700">
              Sans withTenant() — RLS bloque
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {unscopedStudentCount}{' '}
              <span className="text-sm font-normal text-slate-500">élève(s) visibles</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}
