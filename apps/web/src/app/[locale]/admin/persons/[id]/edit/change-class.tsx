'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { changeStudentClassAction } from '../../actions';

/**
 * Réaffectation de la classe d'un élève depuis la fiche « Modifier ». Ouvert à
 * la vie scolaire, la direction et l'admin (action dédiée, hors `students.write`).
 */
export function ChangeStudentClass({
  studentId,
  classes,
  currentClassId,
}: {
  studentId: string;
  classes: { id: string; name: string }[];
  currentClassId: string | null;
}) {
  const t = useTranslations('admin.persons');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [classId, setClassId] = useState(currentClassId ?? '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = classId !== (currentClassId ?? '');

  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-5">
      <h2 className="-mx-5 -mt-5 mb-4 border-b border-slate-200 table-head px-5 py-3 text-sm font-semibold text-slate-700">
        {t('classSection')}
      </h2>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          <span className="block text-xs text-slate-500">{t('classLabel')}</span>
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">{t('classNone')}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={pending || !dirty || !classId}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const r = await changeStudentClassAction(studentId, classId);
              if (!r.ok) setMsg({ ok: false, text: r.error });
              else {
                setMsg({ ok: true, text: t('classChanged') });
                router.refresh();
              }
            })
          }
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {t('classChange')}
        </button>
        {msg && (
          <span className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}
