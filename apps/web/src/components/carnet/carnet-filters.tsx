'use client';

import { useRouter, usePathname } from 'next/navigation';

type Opt = { id: string; name: string };

/**
 * Filtres classe + élève du carnet, déclenchés automatiquement au changement
 * (pas de bouton « Filtrer »). Changer la classe réinitialise l'élève (le serveur
 * sélectionne alors le premier de la nouvelle classe).
 */
export function CarnetFilters({
  classes,
  students,
  classId,
  studentId,
}: {
  classes: Opt[];
  students: Opt[];
  classId: string | null;
  studentId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const onClass = (e: React.ChangeEvent<HTMLSelectElement>) =>
    router.push(`${pathname}?class=${e.target.value}`);
  const onStudent = (e: React.ChangeEvent<HTMLSelectElement>) =>
    router.push(`${pathname}?class=${classId ?? ''}&student=${e.target.value}`);

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <select
        value={classId ?? ''}
        onChange={onClass}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
      >
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        value={studentId ?? ''}
        onChange={onStudent}
        className="min-w-[14rem] rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
      >
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
