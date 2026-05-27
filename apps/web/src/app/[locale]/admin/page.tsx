import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { withTenant, prisma } from '@/lib/db';
import { SignOutButton } from './sign-out-button';

export default async function AdminDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) {
    redirect(`/${locale}/login`);
  }
  if (session.user.isSuperAdmin) {
    redirect(`/${locale}/super-admin/tenants`);
  }

  const tenantId = session.user.tenantId;
  const t = await getTranslations('admin.dashboard');
  const tAdmin = await getTranslations('admin');

  // === Démonstration RLS bout-en-bout ===
  // Toutes les requêtes ci-dessous passent par le rôle PostgreSQL `jawal_app`
  // qui n'a PAS le privilège BYPASSRLS. Sans `withTenant()`, les compteurs
  // retourneraient 0 car la politique d'isolation tenant masque toutes les
  // lignes. Avec `withTenant()`, on positionne `app.current_tenant_id` dans
  // la session PostgreSQL et seules les lignes du tenant courant sont visibles.
  const { studentCount, teacherCount, classCount, year, tenantName } = await withTenant(
    tenantId,
    async (tx) => {
      const [studentCount, teacherCount, classCount, year, tenant] = await Promise.all([
        tx.person.count({ where: { type: 'STUDENT' } }),
        tx.person.count({ where: { type: 'TEACHER' } }),
        tx.class.count(),
        tx.academicYear.findFirst({ where: { active: true } }),
        tx.tenant.findUnique({ where: { id: tenantId } }),
      ]);
      return {
        studentCount,
        teacherCount,
        classCount,
        year: year?.label ?? '—',
        tenantName: tenant?.name ?? '',
      };
    },
  );

  // Contrôle : la même requête HORS withTenant retournerait 0 (preuve RLS active).
  const unscopedStudentCount = await prisma.person.count({ where: { type: 'STUDENT' } });

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <div className="text-sm text-slate-500">{tenantName}</div>
            <h1 className="text-lg font-semibold text-slate-900">{t('title')}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">{session.user.email}</span>
            <SignOutButton label={tAdmin('signOut')} locale={locale} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <p className="mb-6 text-slate-600">
          {t('welcome', { name: session.user.email ?? '' })}
        </p>

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
                {studentCount} <span className="text-sm font-normal text-slate-500">élèves visibles</span>
              </div>
            </div>
            <div className="rounded-lg border border-emerald-300 bg-white p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-emerald-700">Sans withTenant() — RLS bloque</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {unscopedStudentCount}{' '}
                <span className="text-sm font-normal text-slate-500">élève(s) visibles</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
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
