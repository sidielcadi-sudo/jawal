import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import {
  getSessionForTeacher,
  getTeacherWeekSessions,
  mondayOf,
  toDateStr,
  type TeacherSession,
} from '@/lib/lesson-book';
import { CahierFrame } from '../../cahier-frame';
import { LessonForm } from './lesson-form';
import { ResourcesPanel } from './resources-panel';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';

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
  const monday = mondayOf(date);

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, session.user.id);
    if (!teacherId) return null;
    const detail = await getSessionForTeacher(tx, teacherId, entryId, date);
    if (!detail) return null;
    const week = await getTeacherWeekSessions(tx, teacherId, monday);
    return { detail, week };
  });
  if (!data) notFound();

  const { entry, lesson } = data.detail;
  const week = data.week as { days: { date: string; dow: string }[]; sessions: TeacherSession[] };
  const fmtDate = new Date(`${date}T00:00:00.000Z`).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <CahierFrame
      locale={locale}
      monday={monday}
      days={week.days}
      sessions={week.sessions}
      activeKey={`${entryId}|${date}`}
    >
      {/* Bloc 1 — Infos de séance (auto, depuis l'EDT) */}
      <header className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <h1 className="text-xl font-semibold text-slate-900">{entry.subject?.label ?? '—'}</h1>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          <Info label={t('info.class')} value={localizedLabel(locale, entry.class.name, entry.class.nameAr)} />
          <Info label={t('info.date')} value={fmtDate} cap />
          <Info label={t('info.time')} value={`${entry.slot.startTime}–${entry.slot.endTime}`} />
          <Info label={t('info.room')} value={entry.room?.code ?? '—'} />
          <Info
            label={t('info.teacher')}
            value={entry.teacher ? personDisplayName(locale, entry.teacher, 'first-last') : '—'}
          />
        </dl>
      </header>

      <LessonForm
        locale={locale}
        entryId={entryId}
        date={date}
        hasLesson={!!lesson}
        initial={{
          title: lesson?.title ?? '',
          summary: lesson?.summary ?? '',
          activities: lesson?.activities ?? '',
          competencies: lesson?.competencies ?? '',
          theme: lesson?.theme ?? '',
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

      {/* Bloc 4 — Ressources d'une séance déjà enregistrée (gérer/supprimer).
          À la création, le dépôt se fait directement dans le formulaire ci-dessus. */}
      {lesson && (
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
      )}
    </CahierFrame>
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
