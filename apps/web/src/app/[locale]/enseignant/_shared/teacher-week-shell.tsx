import Link from 'next/link';
import type { ReactNode } from 'react';
import { addDays, type TeacherSession } from '@/lib/lesson-book';
import { WeekGrid } from '../cahier/week-grid';

type Day = { date: string; dow: string };

/**
 * Cadre commun des vues hebdomadaires enseignant façon Pronote (cahier de texte
 * et appel) : en-tête avec navigation par semaine, puis deux blocs — l'EDT à
 * gauche (`WeekGrid`), le contenu de droite en `children`. Le `variant` pilote
 * la couleur des étiquettes de séance (rempli/fait vs à faire).
 */
export function TeacherWeekShell({
  base,
  title,
  subtitle,
  navLabels,
  locale,
  monday,
  days,
  sessions,
  emptyLabel,
  variant = 'lesson',
  activeKey,
  banner,
  children,
}: {
  base: string;
  title: string;
  subtitle: string;
  navLabels: { prev: string; current: string; next: string };
  locale: string;
  monday: string;
  days: Day[];
  sessions: TeacherSession[];
  emptyLabel: string;
  variant?: 'lesson' | 'appel';
  activeKey?: string;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const prevWeek = addDays(monday, -7);
  const nextWeek = addDays(monday, 7);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href={`${base}?week=${prevWeek}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            ‹ {navLabels.prev}
          </Link>
          <Link
            href={base}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            {navLabels.current}
          </Link>
          <Link
            href={`${base}?week=${nextWeek}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            {navLabels.next} ›
          </Link>
        </div>
      </header>

      {banner}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,620px)_1fr]">
        <div>
          {sessions.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              {emptyLabel}
            </p>
          ) : (
            <WeekGrid
              days={days}
              sessions={sessions}
              base={base}
              monday={monday}
              activeKey={activeKey}
              locale={locale}
              variant={variant}
            />
          )}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
