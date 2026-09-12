'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  autoSplitAction,
  createGroupAction,
  deleteGroupAction,
  renameGroupAction,
  setGroupMembersAction,
  setGroupTeacherAction,
  setSplitSlotsAction,
} from './actions';

export type StudentRow = { id: string; name: string };
/** Un créneau de la grille horaire (les pauses sont écartées en amont). */
export type SlotRow = { id: string; label: string };
/** Séance déclarée en groupes, pour la matière affichée. */
export type SplitSlot = { day: string; slotId: string };
export type SubjectRow = { id: string; label: string; weeklyHours: number };
export type GroupRow = {
  id: string;
  name: string;
  memberIds: string[];
  /** Séances d'emploi du temps accrochées au groupe. */
  entryCount: number;
  /** Heures dédoublées déclarées. Null = tout le volume. */
  splitHours: number | null;
  /** Enseignant du groupe. Null = celui de la matière. */
  teacherId: string | null;
};

export type TeacherRow = { id: string; label: string };

/**
 * Composition des groupes d'une classe pour une matière.
 *
 * Chaque élève est une puce cliquable au sein du groupe ouvert. La liste des
 * non affectés reste visible en permanence : c'est l'erreur qui coûte le plus
 * cher — un élève oublié n'a simplement pas cours, et rien ne le signale au
 * moment de l'appel.
 */
export function GroupsClient({
  classId,
  subjectId,
  subjectLabel,
  students,
  groups,
  uncoveredIds,
  programHours,
  slots,
  days,
  splitSlots,
  teachers,
}: {
  classId: string;
  subjectId: string | null;
  subjectLabel: string;
  students: StudentRow[];
  groups: GroupRow[];
  uncoveredIds: string[];
  /** Volume hebdomadaire de la matière au programme. */
  programHours: number;
  /** Grille horaire de l'établissement, pauses exclues. */
  slots: SlotRow[];
  /** Jours ouvrés affichés en lignes. */
  days: string[];
  /** Séances déjà déclarées en groupes pour la matière affichée. */
  splitSlots: SplitSlot[];
  teachers: TeacherRow[];
}) {
  const t = useTranslations('admin.classes.groups');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [newName, setNewName] = useState('');
  const [splitCount, setSplitCount] = useState(2);
  /** Groupe dont on compose l'effectif. */
  const [openId, setOpenId] = useState<string | null>(groups[0]?.id ?? null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const nameById = useMemo(() => new Map(students.map((s) => [s.id, s.name])), [students]);
  const uncovered = useMemo(() => new Set(uncoveredIds), [uncoveredIds]);

  // Deux groupes simultanés exigent deux professeurs : personne n'est à deux
  // endroits à la fois. Un groupe sans enseignant propre reprend celui de la
  // matière — si les deux font ce repli, ils désignent la même personne.
  //
  // Ce n'est pas un détail de confort : le générateur d'emploi du temps rejette
  // alors le fichier ENTIER (« Cannot precompute - data is wrong ») sans nommer
  // le coupable, et l'établissement complet devient ingénérable. Le dire ici,
  // là où on peut corriger, vaut mieux que de le découvrir à la génération.
  const teacherClash = useMemo(() => {
    if (groups.length < 2) return false;
    const seen = new Set<string>();
    for (const g of groups) {
      const key = g.teacherId ?? '__enseignant-de-la-matiere__';
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  }, [groups]);

  /** Groupe (autre que celui ouvert) qui contient déjà cet élève. */
  const takenBy = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) for (const id of g.memberIds) m.set(id, g.name);
    return m;
  }, [groups]);

  const open = groups.find((g) => g.id === openId) ?? null;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) {
    setError('');
    setNotice('');
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error ?? 'Erreur');
        return;
      }
      if (ok) setNotice(ok);
      router.refresh();
    });
  }

  /** Ajoute ou retire un élève du groupe ouvert, en un aller-retour serveur. */
  function toggleMember(studentId: string) {
    if (!open) return;
    const next = open.memberIds.includes(studentId)
      ? open.memberIds.filter((x) => x !== studentId)
      : [...open.memberIds, studentId];
    run(() => setGroupMembersAction(open.id, next));
  }

  return (
    <div className="space-y-4">
      {/* Mise en place : créer à la main, ou répartir d'un coup. */}
      <section className="rounded-2xl border border-brand-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-slate-700">
            {t('newGroup')}
            <div className="mt-1 flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('newGroupPlaceholder')}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
              />
              <button
                type="button"
                disabled={pending || !newName.trim()}
                onClick={() =>
                  run(async () => {
                    const r = await createGroupAction({ classId, subjectId, name: newName });
                    if (r.ok) setNewName('');
                    return r;
                  })
                }
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
              >
                {t('add')}
              </button>
            </div>
          </label>

          <div className="ms-auto flex items-end gap-2">
            <label className="text-xs font-medium text-slate-700">
              {t('autoSplit')}
              <select
                value={splitCount}
                onChange={(e) => setSplitCount(Number(e.target.value))}
                className="mt-1 block rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
              >
                {[2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {t('splitOption', { count: n })}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await autoSplitAction({ classId, subjectId, count: splitCount });
                  return r.ok
                    ? (setNotice(t('splitDone', { groups: r.data!.groups, students: r.data!.students })), r)
                    : r;
                })
              }
              className="rounded-lg border border-brand-300 bg-white px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40"
            >
              {t('splitAction')}
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">{t('autoSplitHint', { subject: subjectLabel })}</p>
        {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}
        {notice && <p className="mt-2 text-xs font-medium text-emerald-700">{notice}</p>}
      </section>

      {groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
          {t('empty', { subject: subjectLabel })}
        </p>
      ) : (
        <>
          {teacherClash && (
            <p className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
              {t('teacherClash')}
            </p>
          )}

          {/* Onglets des groupes + effectif. */}
          <div className="flex flex-wrap items-center gap-2">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setOpenId(g.id)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium ${
                  g.id === openId
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {g.name}
                <span
                  className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                    g.id === openId ? 'bg-white/25' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {g.memberIds.length}
                </span>
              </button>
            ))}
          </div>

          {/* Un dédoublement n'est pas toujours permanent : sur 3 h de
              français, une seule peut se faire en demi-groupes. Sans cette
              précision, la charge annoncée au tableau de bord multiplierait
              tout le volume. */}
          {subjectId && (
            <SplitSlots
              classId={classId}
              subjectId={subjectId}
              programHours={programHours}
              slots={slots}
              days={days}
              current={splitSlots}
              groupCount={groups.length}
              subjectLabel={subjectLabel}
            />
          )}

          {open && (
            <section className="rounded-2xl border border-brand-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                {renaming === open.id ? (
                  <span className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          const r = await renameGroupAction(open.id, { name: renameValue });
                          if (r.ok) setRenaming(null);
                          return r;
                        })
                      }
                      className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white"
                    >
                      {t('save')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenaming(null)}
                      className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700"
                    >
                      {t('cancel')}
                    </button>
                  </span>
                ) : (
                  <h2 className="text-sm font-semibold text-slate-900">
                    {open.name}
                    <span className="ms-2 text-xs font-normal text-slate-500">
                      {t('members', { count: open.memberIds.length })}
                    </span>
                  </h2>
                )}

                <span className="flex flex-wrap items-center gap-2">
                  {/* Deux moitiés simultanées exigent deux professeurs : sans
                      ça le solveur ne peut placer ni l'une ni l'autre. */}
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    {t('teacher')}
                    <select
                      value={open.teacherId ?? ''}
                      disabled={pending}
                      onChange={(e) =>
                        run(() => setGroupTeacherAction(open.id, e.target.value || null))
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      <option value="">{t('teacherInherited')}</option>
                      {teachers.map((tt) => (
                        <option key={tt.id} value={tt.id}>
                          {tt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {renaming !== open.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setRenaming(open.id);
                        setRenameValue(open.name);
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      {t('rename')}
                    </button>
                  )}
                  <DeleteGroup
                    group={open}
                    pending={pending}
                    onConfirm={() =>
                      run(async () => {
                        const r = await deleteGroupAction(open.id);
                        if (r.ok) setOpenId(null);
                        return r;
                      })
                    }
                  />
                </span>
              </div>

              {/* L'effectif complet : on coche pour composer. Un élève pris par
                  un autre groupe de la même matière est marqué — l'ajouter ici
                  serait refusé par le serveur, autant le montrer avant. */}
              <ul className="flex flex-wrap gap-1.5">
                {students.map((s) => {
                  const mine = open.memberIds.includes(s.id);
                  const other = !mine ? takenBy.get(s.id) : undefined;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        disabled={pending || !!other}
                        onClick={() => toggleMember(s.id)}
                        title={other ? t('takenBy', { group: other }) : undefined}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                          mine
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                            : other
                              ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                              : 'border-slate-300 bg-white text-slate-700 hover:bg-brand-50'
                        }`}
                      >
                        {mine && '✓ '}
                        {s.name}
                        {other && <span className="ms-1 text-[10px]">({other})</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      {/* Deux groupes qui partagent un professeur ne peuvent pas se tenir en
          parallèle. Le solveur les écarterait sans rien produire ; on le dit
          ici, au moment de la saisie. */}
      {groups.length > 1 &&
        (() => {
          const seen = new Map<string, string[]>();
          for (const g of groups) {
            const k = g.teacherId ?? '__inherited__';
            const arr = seen.get(k) ?? [];
            arr.push(g.name);
            seen.set(k, arr);
          }
          const clashes = [...seen.values()].filter((v) => v.length > 1);
          if (clashes.length === 0) return null;
          return (
            <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">
                ⚠ {t('teacherClash', { groups: clashes[0]!.join(' + ') })}
              </p>
              <p className="mt-0.5 text-[11px] text-amber-800">{t('teacherClashHint')}</p>
            </section>
          );
        })()}

      {/* Le contrôle qui compte : personne ne doit rester sur le carreau. */}
      {groups.length > 0 && (
        <section
          className={`rounded-2xl border p-4 ${
            uncovered.size > 0 ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50'
          }`}
        >
          {uncovered.size === 0 ? (
            <p className="text-sm font-medium text-emerald-800">✓ {t('coverageOk')}</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-amber-900">
                ⚠ {t('coverageKo', { count: uncovered.size })}
              </p>
              <p className="mt-0.5 text-[11px] text-amber-800">{t('coverageKoHint')}</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {[...uncovered].map((id) => (
                  <li
                    key={id}
                    className="rounded-lg border border-amber-300 bg-white px-2 py-0.5 text-xs text-amber-900"
                  >
                    {nameById.get(id) ?? id}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * Part du volume réellement dédoublée.
 *
 * Écrite sur tous les groupes de la matière en un geste : la valeur appartient
 * au couple (classe, matière), pas au groupe. « Toutes » rétablit le défaut.
 */
/**
 * Déclaration des séances dédoublées : une grille jour × créneau à cocher.
 *
 * C'est la règle de fond d'un emploi du temps cohérent : on ne dit pas
 * « 1 h de français en demi-groupes », on dit « le lundi de 10 h à 12 h ».
 * Un simple nombre d'heures laissait le solveur choisir la case ; l'appel,
 * les notes et la salle se rattachaient alors à une séance que personne
 * n'avait décidée, et un regroupement ultérieur cassait tout.
 *
 * Cocher écrit immédiatement : la grille est l'état voulu, pas un brouillon à
 * valider — un bouton « Enregistrer » de plus laisserait la moitié des
 * déclarations en attente sans que rien ne le signale.
 */
function SplitSlots({
  classId,
  subjectId,
  programHours,
  slots,
  days,
  current,
  groupCount,
  subjectLabel,
}: {
  classId: string;
  subjectId: string;
  programHours: number;
  slots: SlotRow[];
  days: string[];
  current: SplitSlot[];
  groupCount: number;
  subjectLabel: string;
}) {
  const t = useTranslations('admin.classes.groups');
  const tDay = useTranslations('admin.timetable.days');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<SplitSlot[]>(current);

  const key = (day: string, slotId: string) => `${day}|${slotId}`;
  const chosen = useMemo(() => new Set(picked.map((p) => key(p.day, p.slotId))), [picked]);

  // Charge réelle : les heures non dédoublées, plus les dédoublées comptées
  // une fois par groupe. C'est ce que le solveur devra placer.
  const split = picked.length;
  const load = Math.max(0, programHours - split) + split * Math.max(1, groupCount);

  function toggle(day: string, slotId: string) {
    const k = key(day, slotId);
    const next = chosen.has(k)
      ? picked.filter((p) => key(p.day, p.slotId) !== k)
      : [...picked, { day, slotId }];
    setPicked(next);
    setError('');
    start(async () => {
      const r = await setSplitSlotsAction({ classId, subjectId, slots: next });
      if (!r.ok) {
        setError(r.error);
        setPicked(picked); // on revient à l'état connu du serveur
        return;
      }
      router.refresh();
    });
  }

  if (slots.length === 0) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        {t('splitSlots.noSlots')}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-brand-200 bg-white px-4 py-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">
          {t('splitSlots.title', { subject: subjectLabel })}
        </h3>
        <span className="text-[11px] text-slate-500">
          {t('splitSlots.count', { count: split, total: programHours })}
          {groupCount > 1 && ` · ${t('split.load', { load, groups: groupCount })}`}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="px-2 py-1 text-start font-medium text-slate-500" />
              {slots.map((sl) => (
                <th key={sl.id} className="px-1 py-1 font-medium text-slate-500">
                  {sl.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d}>
                <td className="px-2 py-1 font-medium text-slate-600">{tDay(d as never)}</td>
                {slots.map((sl) => {
                  const on = chosen.has(key(d, sl.id));
                  return (
                    <td key={sl.id} className="px-1 py-1">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => toggle(d, sl.id)}
                        aria-pressed={on}
                        title={`${tDay(d as never)} ${sl.label}`}
                        className={`h-7 w-full min-w-[52px] rounded-md border text-[11px] font-medium transition-colors disabled:opacity-50 ${
                          on
                            ? 'border-brand-600 bg-brand-600 text-white'
                            : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50'
                        }`}
                      >
                        {on ? t('splitSlots.on') : '·'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-slate-500">{t('splitSlots.hint')}</p>
      {split > programHours && programHours > 0 && (
        <p className="mt-1 text-[11px] font-medium text-amber-700">
          {t('splitSlots.overflow', { count: split, total: programHours })}
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </section>
  );
}

/** Suppression : la descendance en séances d'EDT part avec, on l'annonce. */
function DeleteGroup({
  group,
  pending,
  onConfirm,
}: {
  group: GroupRow;
  pending: boolean;
  onConfirm: () => void;
}) {
  const t = useTranslations('admin.classes.groups');
  const [confirm, setConfirm] = useState(false);

  if (!confirm) {
    return (
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
      >
        {t('delete')}
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <span className="text-[11px] text-red-700">
        {group.entryCount > 0 ? t('deleteWithEntries', { count: group.entryCount }) : t('deleteOne')}
      </span>
      <button
        type="button"
        onClick={() => setConfirm(false)}
        className="rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700"
      >
        {t('cancel')}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={onConfirm}
        className="rounded-lg bg-red-600 px-2 py-0.5 text-[11px] font-medium text-white disabled:opacity-50"
      >
        {t('confirmDelete')}
      </button>
    </span>
  );
}
