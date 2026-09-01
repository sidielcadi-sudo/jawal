import { setRequestLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { loadParentChildContext } from '@/lib/parent';
import { getClassLessonBook, getClassUpcomingHomeworks } from '@/lib/lesson-book';
import { ChildTabs } from '../tabs';
import { SinceFilter } from '../since-filter';
import { personDisplayName } from '@/lib/localized-name';

const HW_BADGE: Record<string, string> = {
  EXERCICE: 'bg-blue-50 text-blue-700',
  LECTURE: 'bg-violet-50 text-violet-700',
  REVISION: 'bg-amber-50 text-amber-700',
  PROJET: 'bg-emerald-50 text-emerald-700',
  AUTRE: 'bg-slate-100 text-slate-600',
};

export default async function ParentChildCahierPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; childId: string }>;
  searchParams: Promise<{ tab?: string; since?: string }>;
}) {
  const { locale, childId } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('parent.child');
  const tab = sp.tab === 'travail' ? 'travail' : 'contenu';

  // Par défaut, on remonte à 1 mois avant aujourd'hui.
  const defaultSince = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const since = sp.since ?? defaultSince;

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const ctx = await loadParentChildContext(tx, session.user.id, childId);
    if (!ctx) return null;
    if (!ctx.classId) return { ctx, lessons: [], homeworks: [] };
    const lessons =
      tab === 'contenu' ? await getClassLessonBook(tx, ctx.classId, 30, since) : [];
    const homeworks =
      tab === 'travail' ? await getClassUpcomingHomeworks(tx, ctx.classId, since) : [];
    return { ctx, lessons, homeworks };
  });
  if (!data) notFound();

  // Couleur de matière dérivée du libellé : stable, et sans table à tenir.
  const SUBJECT_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7', '#0ea5e9', '#84cc16'];
  const subjectColor = (label: string) => {
    let h = 0;
    for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
    return SUBJECT_COLORS[h % SUBJECT_COLORS.length]!;
  };
  const shortDate = (d: Date | string) =>
    new Date(typeof d === 'string' ? `${d}T00:00:00.000Z` : d).toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'UTC',
    });
  /** « Mathématiques — ELIDRISSI · Séance du 21/07 » */
  const sessionTitle = (
    subject: string | null,
    teacher: { firstName: string; lastName: string; firstNameAr: string | null; lastNameAr: string | null } | null,
    date: Date | string,
  ) =>
    [subject ?? '—', teacher ? personDisplayName(locale, teacher) : null]
      .filter(Boolean)
      .join(' — ') + ` · ${t('cahier.session')} ${shortDate(date)}`;

  const base = `/${locale}/parent/children/${childId}/cahier`;
  const q = `&since=${since}`;
  const fmt = (d: Date | string) =>
    new Date(typeof d === 'string' ? `${d}T00:00:00.000Z` : d).toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });

  // Une carte par séance : sans ce regroupement, deux devoirs d'un même cours
  // produisaient deux lignes portant le même en-tête.
  const groupedHomeworks = (() => {
    const byLesson = new Map<
      string,
      {
        lessonEntryId: string;
        subject: string | null;
        title: string;
        dueDate: Date | null;
        items: (typeof data.homeworks)[number][];
      }
    >();
    for (const h of data.homeworks) {
      const le = h.lessonEntry;
      const cur = byLesson.get(le.id) ?? {
        lessonEntryId: le.id,
        subject: le.entry.subject?.label ?? null,
        title: sessionTitle(le.entry.subject?.label ?? null, le.entry.teacher, le.date),
        dueDate: h.dueDate,
        items: [],
      };
      // La carte porte l'échéance la plus proche des devoirs qu'elle regroupe.
      if (h.dueDate && (!cur.dueDate || h.dueDate < cur.dueDate)) cur.dueDate = h.dueDate;
      cur.items.push(h);
      byLesson.set(le.id, cur);
    }
    return [...byLesson.values()];
  })();

  return (
    <>
      <ChildTabs
        current={tab}
        tabs={[
          { key: 'contenu', label: t('cahier.tabContent'), href: `${base}?tab=contenu${q}` },
          { key: 'travail', label: t('cahier.tabHomework'), href: `${base}?tab=travail${q}` },
        ]}
      />

      <SinceFilter label={t('since')} value={since} basePath={base} tab={tab} />

      {!data.ctx.classId ? (
        <p className="mt-4 rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-500">
          {t('noClass')}
        </p>
      ) : tab === 'contenu' ? (
        <section className="mt-4">
          {data.lessons.length === 0 ? (
            <p className="rounded-2xl border border-slate-100 bg-white p-5 text-sm text-slate-400 shadow-sm">
              {t('cahier.noLesson')}
            </p>
          ) : (
            <ul className="space-y-3">
              {data.lessons.map((l) => (
                <li
                  key={l.id}
                  className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 ps-6 shadow-sm"
                >
                  {/* Filet coloré : repère la matière d'un coup d'œil. */}
                  <span
                    aria-hidden
                    className="absolute inset-y-0 start-0 w-1.5"
                    style={{ backgroundColor: subjectColor(l.entry.subject?.label ?? '—') }}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {sessionTitle(l.entry.subject?.label ?? null, l.entry.teacher, l.date)}
                    </span>
                    <span className="text-xs capitalize text-slate-400">{fmt(l.date)}</span>
                  </div>
                  {l.title && <p className="mt-0.5 text-sm text-slate-700">{l.title}</p>}
                  {l.theme && (
                    <p className="mt-1 text-xs font-medium text-brand-700">
                      {t('cahier.theme')} : {l.theme}
                    </p>
                  )}
                  {l.summary && (
                    <p className="mt-1.5 whitespace-pre-line text-sm text-slate-600">{l.summary}</p>
                  )}
                  {l.resources.length > 0 && (
                    <div className="mt-2 border-t border-slate-100 pt-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        {t('cahier.resources')}
                      </p>
                      <ul className="mt-1 flex flex-wrap gap-2">
                        {l.resources.map((r) => (
                          <li key={r.id}>
                            <a
                              href={r.kind === 'FILE' ? `/api/cahier/resource/${r.id}` : (r.url ?? '#')}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1 text-xs text-brand-700 hover:bg-slate-100"
                            >
                              {r.kind === 'FILE' ? '📎' : '🔗'} {r.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="mt-4">
          {data.homeworks.length === 0 ? (
            <p className="rounded-2xl border border-slate-100 bg-white p-5 text-sm text-slate-400 shadow-sm">
              {t('cahier.noHomework')}
            </p>
          ) : (
            <ul className="space-y-3">
              {groupedHomeworks.map((g) => (
                <li
                  key={g.lessonEntryId}
                  className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 ps-6 shadow-sm"
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-0 start-0 w-1.5"
                    style={{ backgroundColor: subjectColor(g.subject ?? '—') }}
                  />
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{g.title}</span>
                    {g.dueDate && (
                      <span className="text-sm font-semibold capitalize text-brand-700">
                        {t('cahier.due')} {fmt(g.dueDate)}
                      </span>
                    )}
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {g.items.map((h) => (
                      <li key={h.id} className="flex items-start gap-2 text-sm">
                        <span
                          className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${HW_BADGE[h.type]}`}
                        >
                          {t(`cahier.homeworkTypes.${h.type}`)}
                        </span>
                        <span className="whitespace-pre-line text-slate-600">{h.description}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
