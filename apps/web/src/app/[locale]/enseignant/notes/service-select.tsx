'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type ServiceOpt = { classId: string; className: string; subjectId: string; subjectLabel: string };

/**
 * Classe puis matière, liées : changer de classe met aussitôt à jour la liste
 * des matières. Le formulaire d'origine envoyait les deux listes telles
 * quelles, et la liste des matières restait celle de la classe précédente
 * jusqu'au rechargement — d'où des couples classe × matière incohérents.
 */
export function ServiceSelect({
  services,
  classId,
  subjectId,
  title,
  applyLabel,
}: {
  services: ServiceOpt[];
  classId: string | null;
  subjectId: string | null;
  title: string;
  applyLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const classes = [...new Map(services.map((s) => [s.classId, s.className])).entries()];
  const [cls, setCls] = useState(classId ?? classes[0]?.[0] ?? '');
  const subjects = services.filter((s) => s.classId === cls);
  const [subj, setSubj] = useState(
    subjects.some((s) => s.subjectId === subjectId) ? (subjectId ?? '') : (subjects[0]?.subjectId ?? ''),
  );

  function submit() {
    const q = new URLSearchParams(search?.toString() ?? '');
    if (cls) q.set('class', cls);
    else q.delete('class');
    if (subj) q.set('subject', subj);
    else q.delete('subject');
    router.push(`${pathname}?${q.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-slate-700">{title}</span>
      <select
        value={cls}
        onChange={(e) => {
          setCls(e.target.value);
          setSubj(services.find((s) => s.classId === e.target.value)?.subjectId ?? '');
        }}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
      >
        {classes.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      <select
        value={subj}
        onChange={(e) => setSubj(e.target.value)}
        className="min-w-[16rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
      >
        {subjects.map((s) => (
          <option key={s.subjectId} value={s.subjectId}>
            {s.subjectLabel} — {s.className}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={submit}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
      >
        {applyLabel}
      </button>
    </div>
  );
}
