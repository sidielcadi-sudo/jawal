'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { saveSupportAttendanceAction, updateSupportSessionTopicAction } from './actions';

/** Édition du thème/contenu d'une séance (utile s'il a été oublié). */
export function SessionTopicEditor({ sessionId, topic }: { sessionId: string; topic: string | null }) {
  const t = useTranslations('admin.soutien');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(topic ?? '');
  const [saved, setSaved] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={value}
        onChange={(e) => { setValue(e.target.value); setSaved(false); }}
        placeholder={t('session.topicPlaceholder')}
        className="min-w-[16rem] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm"
      />
      <button
        type="button"
        disabled={pending || value.trim() === (topic ?? '')}
        onClick={() => start(async () => { await updateSupportSessionTopicAction(sessionId, value); setSaved(true); router.refresh(); })}
        className="rounded-lg border border-brand-300 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
      >
        {t('session.saveTopic')}
      </button>
      {saved && <span className="text-xs text-emerald-700">✓</span>}
    </div>
  );
}

type Row = { studentId: string; name: string; present: boolean; appreciation: string };

export function AttendanceForm({
  sessionId,
  initial,
}: {
  sessionId: string;
  initial: Row[];
}) {
  const t = useTranslations('admin.soutien');
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');

  const set = (i: number, patch: Partial<Row>) => setRows((p) => p.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-4 py-3 text-start">{t('col.student')}</th>
              <th className="px-4 py-3 text-center">{t('session.present')}</th>
              <th className="px-4 py-3 text-start">{t('session.appreciation')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={r.studentId} className={r.present ? '' : 'bg-red-50/40'}>
                <td className="px-4 py-2 font-medium text-slate-800">{r.name}</td>
                <td className="px-4 py-2 text-center">
                  <input type="checkbox" checked={r.present} onChange={(e) => set(i, { present: e.target.checked })} className="h-4 w-4" />
                </td>
                <td className="px-4 py-2">
                  <input
                    value={r.appreciation}
                    onChange={(e) => set(i, { appreciation: e.target.value })}
                    placeholder={t('session.appreciationPlaceholder')}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500">{t('noStudents')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={pending || rows.length === 0}
          onClick={() =>
            start(async () => {
              setMsg('');
              const r = await saveSupportAttendanceAction(
                sessionId,
                rows.map((x) => ({ studentId: x.studentId, present: x.present, appreciation: x.appreciation })),
              );
              if (!r.ok) setMsg(r.error);
              else { setMsg(t('session.saved')); router.refresh(); }
            })
          }
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {t('session.save')}
        </button>
        {msg && <span className="text-xs text-emerald-700">{msg}</span>}
      </div>
    </div>
  );
}
