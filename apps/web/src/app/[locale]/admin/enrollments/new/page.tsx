import Link from 'next/link';
import { redirect } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { createEnrollmentAction } from '../actions';

export default async function NewEnrollmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ year?: string; studentId?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.enrollments');

  const { students, years, levels } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const [students, years, levels] = await Promise.all([
        tx.person.findMany({
          where: { type: 'STUDENT', deletedAt: null },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          select: { id: true, firstName: true, lastName: true },
        }),
        tx.academicYear.findMany({
          orderBy: { startDate: 'desc' },
          select: { id: true, label: true, active: true },
        }),
        tx.level.findMany({
          orderBy: { order: 'asc' },
          select: { id: true, label: true },
        }),
      ]);
      return { students, years, levels };
    },
  );

  const defaultYearId = sp.year ?? years.find((y) => y.active)?.id ?? years[0]?.id ?? '';
  const defaultStudentId = sp.studentId ?? '';

  async function submit(formData: FormData) {
    'use server';
    const res = await createEnrollmentAction(formData);
    if (res.ok && res.data) {
      redirect(`/${locale}/admin/enrollments/${res.data.id}`);
    }
    // Erreur : on retombe sur la page (Next gère la redirection auto)
    throw new Error(res.ok ? 'OK' : res.error);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/enrollments`} className="hover:text-brand-700">
          {t('title')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('new.title')}</span>
      </nav>
      <h1 className="text-2xl font-semibold text-slate-900">{t('new.title')}</h1>
      <p className="mt-1 text-sm text-slate-500">{t('new.subtitle')}</p>

      <form action={submit} className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
        <Field label={t('new.student')}>
          <select
            name="studentId"
            required
            defaultValue={defaultStudentId}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{t('new.studentPlaceholder')}</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.lastName} {s.firstName}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('new.year')}>
          <select
            name="academicYearId"
            required
            defaultValue={defaultYearId}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
                {y.active ? ' ★' : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('new.level')}>
          <select
            name="levelId"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{t('new.levelPlaceholder')}</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('new.notes')}>
          <textarea
            name="notes"
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder={t('new.notesPlaceholder')}
          />
        </Field>

        <p className="text-xs text-slate-500">{t('new.draftHint')}</p>

        <div className="flex items-center justify-end gap-2">
          <Link
            href={`/${locale}/admin/enrollments`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t('new.cancel')}
          </Link>
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {t('new.create')}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium uppercase text-slate-500">{label}</span>
      {children}
    </label>
  );
}
