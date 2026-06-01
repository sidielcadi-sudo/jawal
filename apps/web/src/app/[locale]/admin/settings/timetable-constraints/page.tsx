import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import {
  TIMETABLE_CONSTRAINT_DEFAULTS,
  type TimetableConstraintKindInput,
} from '@jawal/shared';
import { ConstraintsForm, type ConstraintRow, type SubjectOpt } from './client';

const KINDS: TimetableConstraintKindInput[] = [
  'MAX_SAME_SUBJECT_PER_DAY',
  'NO_GAPS',
  'REQUIRES_CONSECUTIVE_SUBJECTS',
  'MAX_HOURS_PER_DAY_TEACHER',
];

export default async function TimetableConstraintsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.timetableConstraints');

  const { constraints, subjects } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const [rows, subs] = await Promise.all([
        tx.timetableConstraint.findMany(),
        tx.subject.findMany({ orderBy: { label: 'asc' } }),
      ]);
      return { constraints: rows, subjects: subs };
    },
  );

  const byKind = new Map(constraints.map((c) => [c.kind, c]));
  const rows: ConstraintRow[] = KINDS.map((kind) => {
    const existing = byKind.get(kind);
    return {
      kind,
      enabled: existing?.enabled ?? false,
      config:
        (existing?.config as Record<string, unknown> | null) ??
        (TIMETABLE_CONSTRAINT_DEFAULTS[kind] as Record<string, unknown>),
    };
  });

  const subjectOpts: SubjectOpt[] = subjects.map((s) => ({
    id: s.id,
    label: s.label,
  }));

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </header>

      <ConstraintsForm locale={locale} rows={rows} subjects={subjectOpts} />
    </div>
  );
}
