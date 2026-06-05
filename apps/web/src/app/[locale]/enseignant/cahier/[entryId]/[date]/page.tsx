import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { getSessionForTeacher, toDateStr } from '@/lib/lesson-book';
import { LessonForm } from './lesson-form';
import { ResourcesPanel } from './resources-panel';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function FillLessonPage({
  params,
}: {
  params: Promise<{ locale: string; entryId: string; date: string }>;
}) {
  const { locale, entryId, date } = await params;
  setRequestLocale(locale);
  if (!ISO_DATE.test(date)) notFound();

  const session = (await auth())!;
  const t = await getTranslations('enseignant.cahier');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, session.user.id);
    if (!teacherId) return null;
    return getSessionForTeacher(tx, teacherId, entryId, date);
  });
  if (!data) notFound();

  const { entry, lesson } = data;
  const base = `/${locale}/enseignant/cahier`;
  const fmtDate = new Date(`${date}T00:00:00.000Z`).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={`${base}?week=${date}`} className="hover:text-brand-700">
          {t('title')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{entry.subject?.label ?? '—'}</span>
      </nav>

      {/* Bloc 1 — Infos de séance (auto, depuis l'EDT) */}
      <header className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <h1 className="text-xl font-semibold text-slate-900">{entry.subject?.label ?? '—'}</h1>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          <Info label={t('info.class')} value={entry.class.name} />
          <Info label={t('info.date')} value={fmtDate} cap />
          <Info label={t('info.time')} value={`${entry.slot.startTime}–${entry.slot.endTime}`} />
          <Info label={t('info.room')} value={entry.room?.code ?? '—'} />
          <Info
            label={t('info.teacher')}
            value={entry.teacher ? `${entry.teacher.firstName} ${entry.teacher.lastName}` : '—'}
          />
        </dl>
      </header>

      <LessonForm
        locale={locale}
        entryId={entryId}
        date={date}
        initial={{
          title: lesson?.title ?? '',
          summary: lesson?.summary ?? '',
          activities: lesson?.activities ?? '',
          competencies: lesson?.competencies ?? '',
          visibleToStudents: lesson?.visibleToStudents ?? true,
          visibleToParents: lesson?.visibleToParents ?? true,
          publishAt: lesson?.publishAt ? lesson.publishAt.toISOString().slice(0, 16) : '',
          homeworks: (lesson?.homeworks ?? []).map((h) => ({
            description: h.description,
            dueDate: h.dueDate ? toDateStr(h.dueDate) : undefined,
            type: h.type,
            difficulty: h.difficulty ?? undefined,
          })),
        }}
      />

      {/* Bloc 4 — Ressources : disponible une fois le cahier enregistré. */}
      {lesson ? (
        <div className="mt-6 border-t border-slate-200 pt-6">
          <ResourcesPanel
            lessonEntryId={lesson.id}
            entryId={entryId}
            date={date}
            resources={lesson.resources.map((r) => ({
              id: r.id,
              kind: r.kind,
              url: r.url,
              label: r.label,
            }))}
          />
        </div>
      ) : (
        <p className="mt-6 border-t border-slate-200 pt-6 text-xs text-slate-400">
          {t('resources.saveFirst')}
        </p>
      )}
    </div>
  );
}

function Info({ label, value, cap }: { label: string; value: string; cap?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`text-slate-800 ${cap ? 'capitalize' : ''}`}>{value}</dd>
    </div>
  );
}
