import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getStudentPersonId } from '@/lib/student';
import { loadStudentCarnet } from '@/lib/carnet';
import { CarnetView } from '@/components/carnet/carnet-view';

export default async function StudentCarnetPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('eleve');
  const session = (await auth())!;

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const studentId = await getStudentPersonId(tx, session.user.id);
    if (!studentId) return null;
    const carnet = await loadStudentCarnet(tx, studentId, { forParents: true });
    return { studentId, carnet };
  });

  if (!data) return <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-slate-500">{t('noProfile')}</div>;

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden rounded-3xl bg-gradient-to-r from-[#e8edff] to-[#eef0ff] px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('carnetTitle')}</h1>
      </header>
      <CarnetView
        studentId={data.studentId}
        entries={data.carnet.entries.map((e) => ({
          id: e.id,
          type: e.type,
          content: e.content,
          occurredAt: e.occurredAt.toISOString(),
          authorName: e.authorName,
          authorRole: e.authorRole,
          className: e.className,
          subjectLabel: e.subjectLabel,
        }))}
        events={data.carnet.events.map((ev) => ({
          id: ev.id,
          date: ev.date.toISOString(),
          category: ev.category,
          className: ev.className,
          justifStatus: ev.justifStatus,
        }))}
        allowedTypes={[]}
        canDelete={false}
        locale={locale}
      />
    </div>
  );
}
