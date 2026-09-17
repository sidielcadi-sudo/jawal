import Link from 'next/link';
import type { BoardCol, MissingAppelRow, SlotDetailRow } from '@/lib/vie-scolaire-board';
import { RaCheckbox, MotifPicker, NotifyAppelButton, type Reason } from './row-actions';

/**
 * Pièces du tableau de bord journalier partagées par deux écrans : l'onglet
 * Présence/Absences du tableau de bord, et l'onglet « Par créneau » de la page
 * Absences et Justif. Même lecture, deux orientations — les colonnes, leurs
 * libellés et les panneaux de détail ne doivent exister qu'une fois.
 */

// Colonnes du tableau, dans l'ordre Pronote. `data` = alimentée ; `placeholder`
// = grisée (modèle à venir) ; `convocations` = compteur niveau jour.
export type ColDef =
  | { key: BoardCol; kind: 'data'; clickable: boolean }
  | { key: string; kind: 'placeholder' }
  | { key: 'convocations'; kind: 'convocations' };

export const COLUMNS: ColDef[] = [
  { key: 'absRA', kind: 'data', clickable: true },
  { key: 'absNonRA', kind: 'data', clickable: true },
  { key: 'retards', kind: 'data', clickable: true },
  // Exclusions : comptées depuis le carnet, sans détail d'appel à ouvrir.
  { key: 'exclCours', kind: 'data', clickable: false },
  { key: 'incidents', kind: 'data', clickable: true },
  { key: 'punitionsProg', kind: 'placeholder' },
  { key: 'convocations', kind: 'convocations' },
  { key: 'exclEtab', kind: 'placeholder' },
  { key: 'exclClasse', kind: 'placeholder' },
  { key: 'infirmerie', kind: 'data', clickable: true },
  { key: 'ensMaison', kind: 'placeholder' },
  { key: 'presents', kind: 'data', clickable: true },
  { key: 'elevesSansCours', kind: 'placeholder' },
  { key: 'appelsNonFaits', kind: 'data', clickable: true },
];

// Colonnes masquées pour gagner de la place (demande Vie scolaire).
const HIDDEN = new Set(['exclClasse', 'ensMaison', 'infirmerie']);
export const VISIBLE = COLUMNS.filter((c) => !HIDDEN.has(c.key));
// Colonnes hors groupe « Absences » (rendu en-tête sur 2 lignes).
export const SINGLE = VISIBLE.filter((c) => c.key !== 'absRA' && c.key !== 'absNonRA');

const slotFmt = (s: string) => s.replace(':', 'h');
export function slotLabel(periodLabel: string): string {
  const [a, b] = periodLabel.split('-');
  return `${slotFmt(a ?? '')} - ${slotFmt(b ?? '')}`;
}

export type Tr = (k: string, v?: Record<string, string | number>) => string;

export function MissingAppelPanel({
  missing,
  date,
  t,
  slotFmtLabel,
}: {
  missing: { rows: MissingAppelRow[]; periodLabel: string };
  date: string;
  t: Tr;
  slotFmtLabel: string;
}) {
  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-brand-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
        {t('appel.title', { slot: slotFmtLabel })}
        <span className="ms-2 text-xs font-normal text-slate-400">
          {t('appel.count', { count: missing.rows.length })}
        </span>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-slate-100 table-head text-xs uppercase tracking-wide text-slate-700">
          <tr>
            <th className="px-4 py-2 text-start">{t('appel.teacher')}</th>
            <th className="px-4 py-2 text-start">{t('col.class')}</th>
            <th className="px-4 py-2 text-start">{t('col.subject')}</th>
            <th className="px-4 py-2 text-end">{t('col.action')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {missing.rows.map((r) => (
            <tr key={r.entryId}>
              <td className="px-4 py-2 font-medium text-slate-800">{r.teacherName ?? t('appel.noTeacher')}</td>
              <td className="px-4 py-2 text-xs text-slate-600">{r.className}</td>
              <td className="px-4 py-2 text-xs text-slate-600">{r.subject ?? '—'}</td>
              <td className="px-4 py-2 text-end">
                <NotifyAppelButton
                  teacherUserId={r.teacherUserId}
                  classId={r.classId}
                  periodLabel={missing.periodLabel}
                  date={date}
                />
              </td>
            </tr>
          ))}
          {missing.rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-xs text-slate-400">
                {t('appel.empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

const CAT_TONE: Record<string, string> = {
  ABSENT: 'bg-red-100 text-red-700',
  EXCLUSION: 'bg-orange-100 text-orange-700',
  LATE: 'bg-amber-100 text-amber-800',
  INFIRMARY: 'bg-sky-100 text-sky-700',
  PUNISHMENT: 'bg-purple-100 text-purple-700',
  EXCUSED: 'bg-slate-100 text-slate-600',
  PRESENT: 'bg-emerald-100 text-emerald-700',
};

function CategoryBadge({ category, t }: { category: string; t: Tr }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${CAT_TONE[category] ?? 'bg-slate-100 text-slate-700'}`}>
      {t(`cat.${category}`)}
    </span>
  );
}

function JustifBadge({ status, t }: { status: 'PENDING' | 'APPROVED' | 'REJECTED' | null; t: Tr }) {
  if (!status) return <span className="text-slate-400">—</span>;
  const tone =
    status === 'APPROVED' ? 'text-emerald-700' : status === 'REJECTED' ? 'text-red-700' : 'text-amber-700';
  return <span className={tone}>{t(`justif.${status}`)}</span>;
}

export function SlotDetailPanel({
  detail,
  reasons,
  locale,
  t,
  slotFmtLabel,
}: {
  detail: { rows: SlotDetailRow[]; periodLabel: string; col: BoardCol };
  reasons: Reason[];
  locale: string;
  t: Tr;
  slotFmtLabel: string;
}) {
  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-brand-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
        {t('detailTitle', { slot: slotFmtLabel, col: t(`cols.${detail.col}`) })}
        <span className="ms-2 text-xs font-normal text-slate-400">
          {t('detailCount', { count: detail.rows.length })}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 table-head text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-4 py-2 text-start">{t('col.student')}</th>
              <th className="px-4 py-2 text-start">{t('col.class')}</th>
              <th className="px-4 py-2 text-start">{t('col.category')}</th>
              <th className="px-4 py-2 text-start">{t('col.subject')}</th>
              <th className="px-4 py-2 text-start">{t('col.motif')}</th>
              <th className="px-4 py-2 text-start">{t('col.justif')}</th>
              <th className="px-2 py-2 text-center">{t('col.ra')}</th>
              <th className="px-2 py-2 text-center">{t('col.action')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {detail.rows.map((r) => {
              const absenceLike = r.category === 'ABSENT' || r.category === 'EXCLUSION';
              const motif = r.reasonLabel ?? (absenceLike ? t('sansExcuses') : r.note ?? '—');
              return (
                <tr key={r.recordId}>
                  <td className="px-4 py-2">
                    <Link
                      href={`/${locale}/admin/persons/${r.studentId}`}
                      className="font-medium text-slate-800 hover:text-brand-700 hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">{r.className}</td>
                  <td className="px-4 py-2">
                    <CategoryBadge category={r.category} t={t} />
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">
                    {r.subject ?? '—'}
                    {r.teacher && <span className="ms-1 text-slate-400">· {r.teacher}</span>}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-700">{motif}</td>
                  <td className="px-4 py-2 text-xs">
                    <JustifBadge status={r.justifStatus} t={t} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    {r.category !== 'PRESENT' ? (
                      <RaCheckbox recordId={r.recordId} checked={r.isRA} />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    {r.category !== 'PRESENT' ? (
                      <MotifPicker recordId={r.recordId} reasons={reasons} currentReasonId={r.reasonId} />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {detail.rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-xs text-slate-400">
                  {t('noEvent')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
