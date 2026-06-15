'use client';

import { useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

type Student = { id: string; name: string; className: string | null };

/**
 * Recherche d'élève avec autocomplétion : dès la saisie, les noms correspondants
 * s'affichent ; la sélection recharge la page avec `?student=<id>` (la grille se
 * recalcule pour cet élève).
 */
export function StudentSearch({
  students,
  date,
  classId,
  currentId,
  currentName,
}: {
  students: Student[];
  date: string;
  classId: string | null;
  currentId: string | null;
  currentName: string | null;
}) {
  const t = useTranslations('admin.vieScolaire.board');
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(currentName ?? '');
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return students.slice(0, 12);
    return students.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 12);
  }, [query, students]);

  function go(studentId: string | null) {
    const p = new URLSearchParams();
    p.set('date', date);
    if (classId) p.set('class', classId);
    if (studentId) p.set('student', studentId);
    router.push(`${pathname}?${p.toString()}`);
    setOpen(false);
  }

  return (
    <div className="relative">
      <div className="flex items-center">
        <input
          type="text"
          value={query}
          placeholder={t('searchStudent')}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 150);
          }}
          className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        {currentId && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              go(null);
            }}
            className="ms-1 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-500 hover:bg-slate-50"
            aria-label={t('clear')}
          >
            ✕
          </button>
        )}
      </div>

      {open && matches.length > 0 && (
        <ul
          className="absolute z-20 mt-1 max-h-72 w-72 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          onMouseDown={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {matches.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  setQuery(s.name);
                  go(s.id);
                }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-start text-sm hover:bg-brand-50 ${
                  s.id === currentId ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-700'
                }`}
              >
                <span className="truncate">{s.name}</span>
                {s.className && <span className="shrink-0 text-xs text-slate-400">{s.className}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
