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
/**
 * Séance déclarée en groupes, pour la matière affichée.
 *
 * `groupId` null = **simultané** (tous les groupes sur ce créneau, il faut
 * autant de professeurs) ; renseigné = **successif** (ce créneau n'est qu'à ce
 * groupe, et le même professeur peut enchaîner les deux moitiés).
 */
export type SplitSlot = { day: string; slotId: string; groupId: string | null };
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
  closedCells,
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
  /** Cases `jour|créneau` où la classe n'a pas cours. */
  closedCells: string[];
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
  // ...mais seulement s'il y a vraiment simultanéité. Dès que chaque séance
  // déclarée est réservée à un groupe, les moitiés s'enchaînent et le même
  // professeur les assure toutes les deux — c'est le fonctionnement attendu des
  // travaux pratiques. Sans déclaration, on retombe sur « tout en parallèle »,
  // et l'avertissement reste justifié.
  const needsParallel = useMemo(
    () => splitSlots.length === 0 || splitSlots.some((sl) => sl.groupId === null),
    [splitSlots],
  );

  const teacherClash = useMemo(() => {
    if (groups.length < 2 || !needsParallel) return false;
    const seen = new Set<string>();
    for (const g of groups) {
      const key = g.teacherId ?? '__enseignant-de-la-matiere__';
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  }, [groups, needsParallel]);

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
              closedCells={closedCells}
              groups={groups.map((g) => ({ id: g.id, name: g.name }))}
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
        needsParallel &&
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
/**
 * Déclaration des séances en groupes : une grille jour × créneau à cocher.
 *
 * Deux façons de faire cours en groupes, et l'écran doit les distinguer, parce
 * que le générateur ne les traite pas pareil :
 *
 *  - **Simultané** — les deux moitiés travaillent à la même heure. Il faut
 *    alors deux professeurs : personne n'est à deux endroits à la fois.
 *  - **Successif** — chaque groupe a son propre créneau, l'un après l'autre.
 *    C'est le cas des travaux pratiques, et **un seul professeur suffit**.
 *
 * D'où la barre de cibles au-dessus de la grille : on choisit à qui appartient
 * la case avant de cliquer. Un simple « coché / décoché » ne pourrait pas
 * exprimer la différence, et le générateur choisirait à la place de
 * l'établissement.
 */
function SplitSlots({
  classId,
  subjectId,
  programHours,
  slots,
  days,
  current,
  closedCells,
  groups,
  subjectLabel,
}: {
  classId: string;
  subjectId: string;
  programHours: number;
  slots: SlotRow[];
  days: string[];
  current: SplitSlot[];
  closedCells: string[];
  groups: Array<{ id: string; name: string }>;
  subjectLabel: string;
}) {
  const t = useTranslations('admin.classes.groups');
  const tDay = useTranslations('admin.timetable.days');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<SplitSlot[]>(current);
  /** Cible du prochain clic : null = simultané, sinon l'identifiant du groupe. */
  const [target, setTarget] = useState<string | null>(null);

  const cellKey = (day: string, slotId: string) => `${day}|${slotId}`;
  // Une case fermée ne se déclare pas : le générateur y verrouillerait une
  // séance à une heure où la classe n'a pas cours, et FET rejette alors le
  // fichier ENTIER — plus aucun emploi du temps de l'établissement ne sort.
  const closed = useMemo(() => new Set(closedCells), [closedCells]);
  const byCell = useMemo(() => {
    const m = new Map<string, SplitSlot[]>();
    for (const p of picked) {
      const k = cellKey(p.day, p.slotId);
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  }, [picked]);

  const nameOf = (id: string | null) =>
    id === null ? t('splitSlots.allGroups') : (groups.find((g) => g.id === id)?.name ?? '?');

  // Volume vu par UN élève : les séances simultanées, plus celles de son
  // groupe. Sommer tous les groupes compterait deux fois la même heure.
  const parallelCount = picked.filter((p) => p.groupId === null).length;
  const perGroup = groups.map((g) => picked.filter((p) => p.groupId === g.id).length);
  const studentHours = parallelCount + Math.max(0, ...perGroup, 0);
  // Charge à placer : ce que le générateur doit caser, séances de groupe
  // comprises — c'est plus que ce que voit l'élève.
  const load =
    Math.max(0, programHours - studentHours) +
    parallelCount * Math.max(1, groups.length) +
    perGroup.reduce((a, b) => a + b, 0);

  function save(next: SplitSlot[]) {
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

  function toggle(day: string, slotId: string) {
    const k = cellKey(day, slotId);
    const here = byCell.get(k) ?? [];
    if (closed.has(k)) {
      // On n'y déclare plus rien, mais il faut pouvoir retirer ce qui s'y
      // trouve déjà : une déclaration devenue illégale — le mercredi est passé
      // en demi-journée depuis — bloque toute la génération, et c'est ici qu'on
      // la supprime.
      if (here.length > 0) save(picked.filter((x) => cellKey(x.day, x.slotId) !== k));
      return;
    }
    const already = here.some((x) => x.groupId === target);
    if (already) {
      save(picked.filter((p) => !(cellKey(p.day, p.slotId) === k && p.groupId === target)));
      return;
    }
    // « Tous les groupes » occupe la classe entière : il chasse les
    // déclarations par groupe sur la même case, qui n'auraient plus de place.
    const cleaned =
      target === null ? picked.filter((p) => cellKey(p.day, p.slotId) !== k) : picked;
    save([...cleaned, { day, slotId, groupId: target }]);
  }

  if (slots.length === 0) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        {t('splitSlots.noSlots')}
      </section>
    );
  }

  const chipCls = (active: boolean) =>
    `rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
      active
        ? 'bg-brand-600 text-white shadow'
        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
    }`;

  return (
    <section className="rounded-2xl border border-brand-200 bg-white px-4 py-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">
          {t('splitSlots.title', { subject: subjectLabel })}
        </h3>
        <span className="text-[11px] text-slate-500">
          {t('splitSlots.count', { count: studentHours, total: programHours })}
          {groups.length > 1 && ` · ${t('split.load', { load, groups: groups.length })}`}
        </span>
      </div>

      {/* À qui appartient la prochaine case cochée. */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium text-slate-500">{t('splitSlots.target')}</span>
        <button type="button" onClick={() => setTarget(null)} className={chipCls(target === null)}>
          {t('splitSlots.allGroups')}
        </button>
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setTarget(g.id)}
            className={chipCls(target === g.id)}
          >
            {g.name}
          </button>
        ))}
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
                  const shut = closed.has(cellKey(d, sl.id));
                  const here = byCell.get(cellKey(d, sl.id)) ?? [];
                  const parallel = here.some((x) => x.groupId === null);
                  const owners = here.filter((x) => x.groupId !== null);
                  const on = here.length > 0;
                  const stale = shut && here.length > 0;
                  const label = shut && here.length === 0
                    ? '×'
                    : parallel
                      ? t('splitSlots.on')
                      : owners.length > 0
                        ? owners.map((o) => nameOf(o.groupId)).join(' / ')
                        : '·';
                  return (
                    <td key={sl.id} className="px-1 py-1">
                      <button
                        type="button"
                        disabled={pending || (shut && here.length === 0)}
                        onClick={() => toggle(d, sl.id)}
                        aria-pressed={on}
                        title={`${tDay(d as never)} ${sl.label} — ${
                          stale
                            ? t('splitSlots.closedDeclared')
                            : shut
                              ? t('splitSlots.closed')
                              : on
                                ? label
                                : t('splitSlots.assignTo', { target: nameOf(target) })
                        }`}
                        className={`h-7 w-full min-w-[62px] truncate rounded-md border px-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                          stale
                            ? 'border-red-400 bg-red-100 text-red-800'
                            : shut
                              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300'
                              : parallel
                                ? 'border-brand-600 bg-brand-600 text-white'
                                : owners.length > 0
                                  ? 'border-violet-400 bg-violet-100 text-violet-800'
                                  : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50'
                        }`}
                      >
                        {label}
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
      <p className="mt-0.5 text-[11px] text-slate-500">{t('splitSlots.modesHint')}</p>
      {closed.size > 0 && (
        <p className="mt-0.5 text-[11px] text-slate-500">{t('splitSlots.closedHint')}</p>
      )}
      {picked.some((x) => closed.has(cellKey(x.day, x.slotId))) && (
        <p className="mt-1 rounded-lg bg-red-50 px-2 py-1 text-[11px] font-medium text-red-800">
          {t('splitSlots.closedDeclaredWarn')}
        </p>
      )}
      {studentHours > programHours && programHours > 0 && (
        <p className="mt-1 text-[11px] font-medium text-amber-700">
          {t('splitSlots.overflow', { count: studentHours, total: programHours })}
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
