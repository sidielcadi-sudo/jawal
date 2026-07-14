import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { SeedConfigButton, ConfigEditForm, EmployeeProfileForm } from './payroll-client';

export default async function PayrollPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.payroll');

  const { config, employees } = await withTenant(session.user.tenantId, async (tx) => {
    const [config, employees] = await Promise.all([
      tx.payrollConfig.findFirst({ orderBy: { effectiveFrom: 'desc' } }),
      tx.person.findMany({
        where: { type: { in: ['STAFF', 'TEACHER'] }, deletedAt: null },
        orderBy: [{ lastName: 'asc' }],
        select: { id: true, firstName: true, lastName: true, payrollProfile: true },
      }),
    ]);
    return { config, employees };
  });

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-100 to-brand-50 shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">💼 {t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
        </div>
        <a href={`/${locale}/admin/payroll/runs`} className="shrink-0 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          {t('run.cta')}
        </a>
      </header>

      {/* Paramétrage légal */}
      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">{t('configTitle')}</h2>
          {config && <span className="text-xs text-slate-400">{config.label} · {t('effectiveFrom')} {new Date(config.effectiveFrom).toLocaleDateString(locale)}</span>}
        </div>
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">⚠ {t('referenceWarning')}</p>
        {config ? (
          <ConfigEditForm
            config={{
              id: config.id,
              cnssEmployeeRate: config.cnssEmployeeRate, cnssCeiling: config.cnssCeiling, amoEmployeeRate: config.amoEmployeeRate,
              cnssEmployerRate: config.cnssEmployerRate, familyAllowanceRate: config.familyAllowanceRate, amoEmployerRate: config.amoEmployerRate, trainingTaxRate: config.trainingTaxRate,
              professionalExpenseRate: config.professionalExpenseRate, professionalExpenseCeilingMonthly: config.professionalExpenseCeilingMonthly,
              familyDeductionPerDependentMonthly: config.familyDeductionPerDependentMonthly, maxDependents: config.maxDependents,
              irBrackets: config.irBrackets,
            }}
          />
        ) : (
          <div className="py-4 text-center">
            <p className="mb-3 text-sm text-slate-600">{t('noConfig')}</p>
            <SeedConfigButton />
          </div>
        )}
      </section>

      {/* Profils de paie employés */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">{t('employees')}</h2>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-[#A9EAFE] text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-3 py-2.5 text-start">{t('employee')}</th>
              <th className="px-3 py-2.5 text-end">{t('p.baseSalary')}</th>
              <th className="px-3 py-2.5 text-end">{t('p.allowances')}</th>
              <th className="px-3 py-2.5 text-center">{t('p.dependents')}</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map((e) => (
              <EmployeeProfileForm
                key={e.id}
                personId={e.id}
                name={`${e.lastName} ${e.firstName}`}
                profile={
                  e.payrollProfile
                    ? {
                        cnssNumber: e.payrollProfile.cnssNumber,
                        baseSalary: e.payrollProfile.baseSalary,
                        transportAllowance: e.payrollProfile.transportAllowance,
                        housingAllowance: e.payrollProfile.housingAllowance,
                        benefitsInKind: e.payrollProfile.benefitsInKind,
                        cimrEnabled: e.payrollProfile.cimrEnabled,
                        cimrEmployeeRate: e.payrollProfile.cimrEmployeeRate,
                        numberOfDependents: e.payrollProfile.numberOfDependents,
                      }
                    : null
                }
              />
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
