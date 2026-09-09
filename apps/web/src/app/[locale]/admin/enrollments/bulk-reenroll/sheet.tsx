'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { bulkCancelReenrollAction, bulkReenrollAction } from '../actions';
import { personDisplayName } from '@/lib/localized-name';
import { CheckboxDropdown } from '@/components/checkbox-dropdown';

export type YearOpt = { id: string; label: string; active: boolean };
export type LevelOpt = {
  id: string;
  label: string;
  cycleId: string;
  cycleLabel: string;
  order: number;
  cycle: { id: string; order: number };
};
/** Classe de l'année cible, proposée dans la colonne « Classe affectée ». */
export type ClassOpt = {
  id: string;
  label: string;
  levelId: string;
  capacity: number;
  /** Effectif déjà inscrit (StudentClass non sortis). */
  enrolled: number;
};
export type Row = {
  sourceEnrollmentId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  firstNameAr: string | null;
  lastNameAr: string | null;
  currentLevelId: string;
  currentLevelLabel: string;
  currentClassName: string | null;
  currentStatus: 'ACTIVE' | 'DRAFT' | 'GRADUATED';
  suggestedNextLevelId: string | null;
  suggestedNextLevelLabel: string | null;
  /** Reste dû par l'élève, toutes échéances confondues. */
  balance: number;
  existingTargetStatus: 'DRAFT' | 'ACTIVE' | 'WITHDRAWN' | 'GRADUATED' | null;
};

type Decision = 'REENROLL' | 'REPEAT' | 'GRADUATE' | 'SKIP';

/** Catégories dont le lot sait générer l'échéancier, dans l'ordre d'usage. */
const FEE_CATEGORIES = ['INSCRIPTION', 'TUITION', 'CANTEEN', 'TRANSPORT'] as const;
type FeeCategoryKey = (typeof FEE_CATEGORIES)[number];

/** Statut donné aux dossiers créés. '' = pas encore choisi (refusé). */
type TargetStatus = '' | 'DRAFT' | 'INSCRIPTION_VALIDEE' | 'AFFECTE' | 'ACTIVE';

type ItemState = {
  decision: Decision;
  targetLevelId: string;
  /** '' = aucune classe choisie (ou aucune classe ouverte sur ce niveau). */
  targetClassId: string;
};

export function BulkReenrollSheet({
  locale,
  years,
  levels,
  classes,
  currency,
  sourceYearId,
  targetYearId,
  rows,
}: {
  locale: string;
  years: YearOpt[];
  levels: LevelOpt[];
  classes: ClassOpt[];
  currency: string;
  sourceYearId: string;
  targetYearId: string;
  rows: Row[];
}) {
  const t = useTranslations('admin.enrollments.bulk');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | null
    | {
        ok: true;
        created: number;
        graduated: number;
        skipped: number;
        blockedByDebt: number;
        rejectedNoSeat: number;
        rejectedNoClass: number;
        activated: number;
        feesGenerated: number;
        errors: string[];
      }
    | { ok: false; error: string }
  >(null);

  // Classes ouvertes sur l'année cible, indexées par niveau : la colonne
  // « Classe affectée » ne propose que les classes du niveau choisi.
  const classesByLevel = useMemo(() => {
    const m = new Map<string, ClassOpt[]>();
    for (const c of classes) {
      const arr = m.get(c.levelId) ?? [];
      arr.push(c);
      m.set(c.levelId, arr);
    }
    return m;
  }, [classes]);

  /** Première classe non pleine du niveau — proposition par défaut. */
  const defaultClassFor = (levelId: string) => {
    const opts = classesByLevel.get(levelId) ?? [];
    return (opts.find((c) => c.enrolled < c.capacity) ?? opts[0])?.id ?? '';
  };

  /** Un impayé bloque la réinscription tant qu'il n'est pas soldé ou effacé. */
  const isBlocked = (r: Row) => r.balance > 0;

  // État local : pour chaque row, sa décision + niveau cible + classe affectée
  const [items, setItems] = useState<Record<string, ItemState>>(() =>
    buildInitialItems(rows, classes),
  );

  /**
   * Changer d'année source recharge la page côté serveur, mais React conserve
   * l'instance du composant : `items` gardait alors les clés de l'ancienne
   * promotion et chaque ligne de la nouvelle tombait sur `undefined`.
   *
   * On resynchronise pendant le rendu (motif documenté par React pour ajuster
   * un état lorsqu'une prop change) plutôt que dans un effet — sinon le premier
   * rendu se ferait avec l'état périmé, c'est-à-dire avec le plantage.
   */
  const rowsSignature = `${sourceYearId}|${targetYearId}|${rows.length}|${rows[0]?.sourceEnrollmentId ?? ''}`;
  const [prevSignature, setPrevSignature] = useState(rowsSignature);
  if (rowsSignature !== prevSignature) {
    setPrevSignature(rowsSignature);
    setItems(buildInitialItems(rows, classes));
  }

  // Filtres de confort : ils ne portent que sur l'affichage et sur la portée
  // des boutons « appliquer à tous ». Les décisions des lignes masquées sont
  // conservées et partent quand même à l'enregistrement.
  // Filtres multi-valeurs : sur une promotion entière, isoler « 3AC-A et
  // 3AC-C » d'un seul geste évite de repasser trois fois par l'écran.
  const [classFilter, setClassFilter] = useState<string[]>([]);
  const [levelFilter, setLevelFilter] = useState<string[]>([]);
  /**
   * Les élèves qui ont déjà un dossier sur l'année cible sont masqués.
   *
   * Le lot ne peut rien en faire — il les ignore — et sur une promotion
   * entière ils noient les lignes réellement à traiter. On les compte et on
   * laisse la possibilité de les revoir, plutôt que de les faire disparaître
   * sans explication.
   */
  const [showDone, setShowDone] = useState(false);
  /**
   * Dossiers déjà créés sur l'année cible, cochés pour être défaits.
   *
   * Une erreur de niveau ou de classe sur 150 dossiers ne se rattrape pas
   * ligne par ligne : c'est ici, en face du lot qui les a créés, qu'on doit
   * pouvoir revenir en arrière.
   */
  const [cancelSel, setCancelSel] = useState<Set<string>>(new Set());
  const [cancelReason, setCancelReason] = useState('');
  const [cancelResult, setCancelResult] = useState<string>('');
  const [cancelPending, startCancel] = useTransition();

  // Échéanciers à générer pendant le lot. Aucune case cochée = comportement
  // historique : les dossiers naissent en brouillon, sans échéance.
  const [feeCategories, setFeeCategories] = useState<FeeCategoryKey[]>([]);

  // Statut cible : sans choix explicite, le lot est refusé. Réinscrire des
  // centaines d'élèves dans le mauvais statut se rattrape très mal.
  const [targetStatus, setTargetStatus] = useState<TargetStatus>('');
  const toggleCategory = (c: FeeCategoryKey) =>
    setFeeCategories((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  const classOptions = useMemo(
    () =>
      [...new Set(rows.map((r) => r.currentClassName).filter((c): c is string => !!c))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [rows],
  );
  const levelOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (!seen.has(r.currentLevelId)) seen.set(r.currentLevelId, r.currentLevelLabel);
    return [...seen].map(([id, label]) => ({ id, label }));
  }, [rows]);

  /** Élèves déjà réinscrits sur l'année cible : rien à décider pour eux. */
  const doneCount = useMemo(() => rows.filter((r) => r.existingTargetStatus).length, [rows]);

  const visibleRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          (showDone || !r.existingTargetStatus) &&
          (classFilter.length === 0 ||
            (r.currentClassName !== null && classFilter.includes(r.currentClassName))) &&
          (levelFilter.length === 0 || levelFilter.includes(r.currentLevelId)),
      ),
    [rows, classFilter, levelFilter, showDone],
  );
  const filtered = visibleRows.length !== rows.length;

  const counts = useMemo(() => {
    let reenroll = 0;
    let repeat = 0;
    let graduate = 0;
    let skip = 0;
    for (const it of Object.values(items)) {
      if (it.decision === 'REENROLL') reenroll += 1;
      else if (it.decision === 'REPEAT') repeat += 1;
      else if (it.decision === 'GRADUATE') graduate += 1;
      else skip += 1;
    }
    return { reenroll, repeat, graduate, skip };
  }, [items]);

  const doneRows = useMemo(() => rows.filter((r) => r.existingTargetStatus), [rows]);

  function toggleCancel(studentId: string) {
    setCancelResult('');
    setCancelSel((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function runCancel(mode: 'DELETE' | 'WITHDRAW') {
    setCancelResult('');
    if (cancelSel.size === 0) return;
    if (mode === 'WITHDRAW' && !cancelReason.trim()) {
      setCancelResult(t('cancelBatch.reasonRequired'));
      return;
    }
    startCancel(async () => {
      const fd = new FormData();
      fd.set(
        'payload',
        JSON.stringify({
          targetYearId,
          mode,
          studentIds: [...cancelSel],
          reason: cancelReason.trim() || undefined,
        }),
      );
      const r = await bulkCancelReenrollAction(fd);
      if (!r.ok) {
        setCancelResult(r.error);
        return;
      }
      const d = r.data!;
      setCancelResult(
        t('cancelBatch.result', { deleted: d.deleted, withdrawn: d.withdrawn, skipped: d.skipped.length }) +
          (d.skipped.length > 0 ? ' — ' + d.skipped.map((x) => `${x.name} (${x.reason})`).join(' ; ') : ''),
      );
      setCancelSel(new Set());
      setCancelReason('');
      router.refresh();
    });
  }

  /** Élèves écartés du traitement tant que leur créance n'est pas réglée. */
  const blockedCount = useMemo(() => rows.filter(isBlocked).length, [rows]);
  const blockedAmount = useMemo(
    () => rows.filter(isBlocked).reduce((s, r) => s + r.balance, 0),
    [rows],
  );

  const update = (id: string, patch: Partial<ItemState>) =>
    setItems((prev) => {
      const cur = prev[id];
      if (!cur) return prev; // ligne d'une promotion déjà remplacée
      const next = { ...cur, ...patch };
      // Changer de niveau invalide la classe : on repropose la première classe
      // du nouveau niveau plutôt que de laisser une classe d'un autre niveau.
      if (patch.targetLevelId && patch.targetLevelId !== cur.targetLevelId) {
        next.targetClassId = defaultClassFor(patch.targetLevelId);
      }
      return { ...prev, [id]: next };
    });

  const applyAll = (decision: Decision) => {
    // Les lignes bloquées par une créance restent hors du lot : « appliquer à
    // tous » ne doit pas les réarmer silencieusement.
    const scope = new Set(
      visibleRows.filter((r) => !isBlocked(r)).map((r) => r.sourceEnrollmentId),
    );
    setItems((prev) => {
      const next: Record<string, ItemState> = {};
      for (const id of Object.keys(prev)) {
        next[id] = scope.has(id) ? { ...prev[id]!, decision } : prev[id]!;
      }
      return next;
    });
  };

  const submit = () => {
    setResult(null);
    if (!targetYearId) {
      setResult({ ok: false, error: t('selectTargetYear') });
      return;
    }
    if (!targetStatus) {
      setResult({ ok: false, error: t('status.required') });
      return;
    }
    const payload = {
      sourceYearId,
      targetYearId,
      items: Object.entries(items).map(([sourceEnrollmentId, it]) => {
        const reenrolling = it.decision === 'REENROLL' || it.decision === 'REPEAT';
        return {
          sourceEnrollmentId,
          decision: it.decision,
          targetLevelId: reenrolling ? it.targetLevelId : undefined,
          targetClassId: reenrolling && it.targetClassId ? it.targetClassId : undefined,
        };
      }),
      targetStatus,
      feeCategories,
    };
    const fd = new FormData();
    fd.append('payload', JSON.stringify(payload));
    startTransition(async () => {
      const res = await bulkReenrollAction(fd);
      if (!res.ok) {
        setResult({ ok: false, error: res.error });
      } else if (res.data) {
        setResult({ ok: true, ...res.data });
        router.refresh();
      }
    });
  };

  const onChangeYear = (kind: 'source' | 'target', value: string) => {
    const params = new URLSearchParams();
    params.set('source', kind === 'source' ? value : sourceYearId);
    if ((kind === 'target' ? value : targetYearId) !== '') {
      params.set('target', kind === 'target' ? value : targetYearId);
    }
    router.push(`/${locale}/admin/enrollments/bulk-reenroll?${params.toString()}`);
  };

  return (
    <div className="mt-6">
      {/* Sélecteurs année */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('sourceYear')}>
          <select
            value={sourceYearId}
            onChange={(e) => onChangeYear('source', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
                {y.active ? ' ★' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('targetYear')}>
          <select
            value={targetYearId}
            onChange={(e) => onChangeYear('target', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{t('targetYearPlaceholder')}</option>
            {years
              .filter((y) => y.id !== sourceYearId)
              .map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                  {y.active ? ' ★' : ''}
                </option>
              ))}
          </select>
        </Field>
      </div>

      {/* Sans année cible, aucune classe ne peut être proposée : on le dit une
          fois, en haut, plutôt que de répéter « aucune classe » sur chaque
          ligne — le message laissait croire à un défaut de paramétrage des
          classes alors que c'est l'année d'arrivée qui manque. */}
      {!targetYearId && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>⚠ {t('noTargetYear.title')}</strong> {t('noTargetYear.hint')}{' '}
          <a
            href={`/${locale}/admin/settings/years`}
            className="font-medium text-amber-800 underline hover:text-amber-900"
          >
            {t('noTargetYear.createYear')} →
          </a>
        </div>
      )}

      {/* Année cible choisie mais aucune classe créée dedans : le lot pourra
          s'exécuter, mais les élèves sortiront sans classe. */}
      {targetYearId && classes.length === 0 && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>⚠ {t('noClasses.title')}</strong> {t('noClasses.hint')}{' '}
          <a
            href={`/${locale}/admin/classes`}
            className="font-medium text-amber-800 underline hover:text-amber-900"
          >
            {t('noClasses.createClasses')} →
          </a>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          {t('noSourceEnrollments')}
        </div>
      ) : (
        <>
          {/* Récap décisions */}
          <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <KpiBox label={t('counter.reenroll')} value={counts.reenroll} color="emerald" />
            <KpiBox label={t('counter.repeat')} value={counts.repeat} color="amber" />
            <KpiBox label={t('counter.graduate')} value={counts.graduate} color="blue" />
            <KpiBox label={t('counter.skip')} value={counts.skip} color="slate" />
          </div>

          {/* Créances : les lignes concernées sont hors lot tant que le solde
              n'est pas réglé ou effacé. On l'annonce en haut, pas seulement
              ligne par ligne — sinon l'écart entre le nombre traité et le
              nombre attendu reste inexpliqué. */}
          {blockedCount > 0 && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              <span className="font-semibold">⛔ {t('blocked.title')}</span>{' '}
              {t('blocked.hint', {
                count: blockedCount,
                amount: `${blockedAmount.toLocaleString(locale, { minimumFractionDigits: 2 })} ${currency}`,
              })}
            </div>
          )}

          {/* Filtres à choix multiple : rien de sélectionné = tout afficher.
              C'est la convention la plus lisible ici — l'inverse obligerait à
              tout cocher avant de voir quoi que ce soit. */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('filter.currentClass')}>
              <CheckboxDropdown
                options={classOptions.map((c) => ({ id: c, label: c }))}
                selected={classFilter}
                onChange={setClassFilter}
                allLabel={t('filter.allClasses')}
                clearLabel={t('filter.clear')}
                selectAllLabel={t('filter.selectAll')}
              />
            </Field>
            <Field label={t('filter.currentLevel')}>
              <CheckboxDropdown
                options={levelOptions}
                selected={levelFilter}
                onChange={setLevelFilter}
                allLabel={t('filter.allLevels')}
                clearLabel={t('filter.clear')}
                selectAllLabel={t('filter.selectAll')}
              />
            </Field>
          </div>

          {filtered && (
            <p className="mt-2 text-xs text-amber-700">
              {t('filter.active', { shown: visibleRows.length, total: rows.length })}
            </p>
          )}

          {/* Statut cible — encadré rouge : c'est la décision structurante du
              lot, elle doit sauter aux yeux avant de lancer l'exécution. */}
          <div className="mt-4">
            <label className="block text-xs font-medium uppercase text-slate-500">
              {t('status.label')}
            </label>
            <select
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value as TargetStatus)}
              className="mt-1 w-full rounded-lg border-2 border-red-500 px-3 py-2 text-sm focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-500 sm:max-w-sm"
            >
              <option value="">{t('status.none')}</option>
              <option value="DRAFT">{t('status.DRAFT')}</option>
              <option value="INSCRIPTION_VALIDEE">{t('status.INSCRIPTION_VALIDEE')}</option>
              <option value="AFFECTE">{t('status.AFFECTE')}</option>
              <option value="ACTIVE">{t('status.ACTIVE')}</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">{t('status.hint')}</p>
            {/* « Actif » écrit vers l'extérieur : la famille et l'élève
                reçoivent leurs accès. On prévient avant, pas après. */}
            {targetStatus === 'ACTIVE' && (
              <p className="mt-1 text-xs font-medium text-amber-800">{t('status.activeWarning')}</p>
            )}
            {targetStatus === 'INSCRIPTION_VALIDEE' && (
              <p className="mt-1 text-xs text-amber-700">{t('status.classPromotes')}</p>
            )}
          </div>

          {/* Génération d'échéancier — le lot devient une décision : cocher une
              catégorie fait naître les échéances (réduction fratrie comprise)
              et passe les dossiers en « Inscription validée ». */}
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">{t('fees.title')}</h3>
            <p className="mt-1 text-xs text-slate-500">{t('fees.hint')}</p>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              {FEE_CATEGORIES.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={feeCategories.includes(c)}
                    onChange={() => toggleCategory(c)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {t(`fees.categories.${c}`)}
                </label>
              ))}
            </div>
            {feeCategories.length > 0 && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {t('fees.warning')}
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">{t('applyAll')} :</span>
            <button
              type="button"
              onClick={() => applyAll('REENROLL')}
              className="rounded-md border border-emerald-200 bg-white px-2 py-1 text-emerald-700 hover:bg-emerald-50"
            >
              ✓ {t('decision.REENROLL')}
            </button>
            <button
              type="button"
              onClick={() => applyAll('REPEAT')}
              className="rounded-md border border-amber-200 bg-white px-2 py-1 text-amber-700 hover:bg-amber-50"
            >
              ↻ {t('decision.REPEAT')}
            </button>
            <button
              type="button"
              onClick={() => applyAll('GRADUATE')}
              className="rounded-md border border-blue-200 bg-white px-2 py-1 text-blue-700 hover:bg-blue-50"
            >
              🎓 {t('decision.GRADUATE')}
            </button>
            <button
              type="button"
              onClick={() => applyAll('SKIP')}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50"
            >
              ⊘ {t('decision.SKIP')}
            </button>
          </div>

          {doneCount > 0 && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{t('done.hidden', { count: doneCount })}</span>
                <button
                  type="button"
                  onClick={() => setShowDone((v) => !v)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-100"
                >
                  {showDone ? t('done.hide') : t('done.show')}
                </button>
              </div>

              {/* Défaire le lot : visible seulement quand on regarde les
                  dossiers concernés, pour qu'on voie ce qu'on s'apprête à
                  annuler. */}
              {showDone && (
                <div className="mt-2 border-t border-slate-200 pt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCancelSel(new Set(doneRows.map((r) => r.studentId)))}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-100"
                    >
                      {t('cancelBatch.selectAll')}
                    </button>
                    {cancelSel.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setCancelSel(new Set())}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-600 hover:bg-slate-100"
                      >
                        {t('cancelBatch.clear')}
                      </button>
                    )}
                    <span className="font-medium text-slate-700">
                      {t('cancelBatch.selected', { count: cancelSel.size })}
                    </span>
                  </div>

                  {cancelSel.size > 0 && (
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <label className="flex-1 text-[11px] font-medium text-slate-600">
                        {t('cancelBatch.reason')}
                        <input
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder={t('cancelBatch.reasonPlaceholder')}
                          className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={cancelPending}
                        onClick={() => runCancel('DELETE')}
                        className="rounded-md border border-red-300 bg-white px-2.5 py-1.5 font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
                      >
                        {t('cancelBatch.delete')}
                      </button>
                      <button
                        type="button"
                        disabled={cancelPending}
                        onClick={() => runCancel('WITHDRAW')}
                        className="rounded-md border border-amber-300 bg-white px-2.5 py-1.5 font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-40"
                      >
                        {t('cancelBatch.withdraw')}
                      </button>
                    </div>
                  )}
                  <p className="mt-1 text-[11px] text-slate-500">{t('cancelBatch.hint')}</p>
                  {cancelResult && (
                    <p className="mt-1 text-[11px] font-medium text-slate-800">{cancelResult}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tableau */}
          <div className="mt-3 overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="px-3 py-3 text-start">{t('table.student')}</th>
                  <th className="px-3 py-3 text-start">{t('table.current')}</th>
                  <th className="px-3 py-3 text-end">{t('table.balance')}</th>
                  <th className="px-3 py-3 text-start">{t('table.decision')}</th>
                  <th className="px-3 py-3 text-start">{t('table.targetLevel')}</th>
                  <th className="px-3 py-3 text-start">{t('table.targetClass')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((r) => {
                  // Filet de sécurité : si l'état n'a pas encore rattrapé une
                  // nouvelle promotion, on rend une ligne neutre plutôt que de
                  // planter tout l'écran.
                  const state =
                    items[r.sourceEnrollmentId] ??
                    ({ decision: 'SKIP', targetLevelId: r.currentLevelId, targetClassId: '' } as ItemState);
                  const blocked = isBlocked(r);
                  const disabled = !!r.existingTargetStatus || blocked;
                  // Le niveau qui commande la liste des classes : le niveau
                  // courant pour un redoublement, le niveau cible sinon.
                  const effectiveLevelId =
                    state.decision === 'REPEAT' ? r.currentLevelId : state.targetLevelId;
                  const classChoices = classesByLevel.get(effectiveLevelId) ?? [];
                  return (
                    <tr
                      key={r.sourceEnrollmentId}
                      className={
                        blocked
                          ? 'bg-red-50/60'
                          : disabled
                            ? 'bg-slate-50/60 opacity-60'
                            : ''
                      }
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">
                          {personDisplayName(locale, r)}
                        </div>
                        {r.existingTargetStatus && showDone && (
                          <label className="me-2 inline-flex items-center gap-1 align-middle">
                            <input
                              type="checkbox"
                              checked={cancelSel.has(r.studentId)}
                              onChange={() => toggleCancel(r.studentId)}
                              disabled={cancelPending}
                              className="h-3.5 w-3.5 rounded border-slate-300"
                            />
                            <span className="text-[11px] text-slate-500">
                              {t('cancelBatch.pick')}
                            </span>
                          </label>
                        )}
                        {r.existingTargetStatus && (
                          <div className="mt-0.5 text-[10px] text-amber-700">
                            {t('alreadyExistsOnTarget', { status: r.existingTargetStatus })}
                          </div>
                        )}
                        {blocked && (
                          <div className="mt-0.5 text-[10px] font-medium text-red-700">
                            ⛔ {t('blocked.rowBadge')}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        <div>{r.currentLevelLabel}</div>
                        <div className="text-[11px] text-slate-400">
                          {r.currentClassName ?? '—'} · {r.currentStatus}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-end text-xs tabular-nums">
                        <span className={r.balance > 0 ? 'font-semibold text-red-700' : 'text-slate-400'}>
                          {r.balance.toLocaleString(locale, { minimumFractionDigits: 2 })} {currency}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          disabled={disabled}
                          value={state.decision}
                          onChange={(e) => {
                            const decision = e.target.value as Decision;
                            // Le redoublement bascule sur le niveau courant :
                            // la classe proposée doit suivre.
                            const lvl =
                              decision === 'REPEAT' ? r.currentLevelId : state.targetLevelId;
                            update(r.sourceEnrollmentId, {
                              decision,
                              targetClassId: defaultClassFor(lvl),
                            });
                          }}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                        >
                          <option value="REENROLL">✓ {t('decision.REENROLL')}</option>
                          <option value="REPEAT">↻ {t('decision.REPEAT')}</option>
                          <option value="GRADUATE">🎓 {t('decision.GRADUATE')}</option>
                          <option value="SKIP">⊘ {t('decision.SKIP')}</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        {state.decision === 'REENROLL' ? (
                          <select
                            disabled={disabled}
                            value={state.targetLevelId}
                            onChange={(e) =>
                              update(r.sourceEnrollmentId, { targetLevelId: e.target.value })
                            }
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                          >
                            {levels.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.cycleLabel} · {l.label}
                                {l.id === r.suggestedNextLevelId ? ' ★' : ''}
                              </option>
                            ))}
                          </select>
                        ) : state.decision === 'REPEAT' ? (
                          <span className="text-xs text-slate-500">
                            {r.currentLevelLabel}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      {/* Classe affectée — proposée parmi les classes du niveau
                          cible de l'année d'arrivée. L'élève sort du lot avec
                          une classe, quel que soit le statut du dossier. */}
                      <td className="px-3 py-2">
                        {state.decision === 'REENROLL' || state.decision === 'REPEAT' ? (
                          classChoices.length > 0 ? (
                            <select
                              disabled={disabled}
                              value={state.targetClassId}
                              onChange={(e) =>
                                update(r.sourceEnrollmentId, { targetClassId: e.target.value })
                              }
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                            >
                              <option value="">{t('table.noClass')}</option>
                              {classChoices.map((c) => {
                                const full = c.enrolled >= c.capacity;
                                return (
                                  <option key={c.id} value={c.id} disabled={full}>
                                    {c.label} ({c.enrolled}/{c.capacity})
                                    {full ? ` — ${t('table.classFull')}` : ''}
                                  </option>
                                );
                              })}
                            </select>
                          ) : (
                            <span className="text-[11px] text-amber-700">
                              {targetYearId
                                ? t('table.noClassForLevel')
                                : t('table.noTargetYearShort')}
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">{t('execHint')}</p>
            <button
              type="button"
              disabled={pending || !targetYearId}
              onClick={submit}
              className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {pending ? t('executing') : t('execute')}
            </button>
          </div>

          {result && (
            <div
              className={`mt-4 rounded-2xl border px-5 py-4 text-sm ${
                result.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-red-200 bg-red-50 text-red-900'
              }`}
            >
              {result.ok ? (
                <>
                  <strong>{t('resultOk')}</strong>{' '}
                  {t('resultDetails', {
                    created: result.created,
                    graduated: result.graduated,
                    skipped: result.skipped,
                  })}
                  {result.blockedByDebt > 0 && (
                    <div className="mt-1 font-medium text-red-800">
                      {t('blocked.result', { count: result.blockedByDebt })}
                    </div>
                  )}
                  {/* Rejet pour classe pleine : l'élève n'a PAS été réinscrit,
                      il faut le redire clairement — le détail nominatif suit
                      dans la liste des erreurs. */}
                  {result.rejectedNoSeat > 0 && (
                    <div className="mt-1 font-medium text-amber-800">
                      {t('noSeat.result', { count: result.rejectedNoSeat })}
                    </div>
                  )}
                  {result.rejectedNoClass > 0 && (
                    <div className="mt-1 font-medium text-amber-800">
                      {t('noClass.result', { count: result.rejectedNoClass })}
                    </div>
                  )}
                  {result.activated > 0 && (
                    <div className="mt-1 text-emerald-800">
                      {t('status.activatedResult', { count: result.activated })}
                    </div>
                  )}
                  {result.feesGenerated > 0 && (
                    <div className="mt-1">
                      {t('fees.resultDetails', { fees: result.feesGenerated })}
                    </div>
                  )}
                  {result.errors.length > 0 && (
                    <ul className="mt-2 list-disc ps-5 text-xs">
                      {result.errors.slice(0, 10).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <>
                  <strong>{t('resultErr')}</strong> {result.error}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium uppercase text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function KpiBox({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'emerald' | 'amber' | 'blue' | 'slate';
}) {
  const map = {
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    blue: 'text-blue-700',
    slate: 'text-slate-600',
  } as const;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
      <div className={`text-2xl font-semibold tabular-nums ${map[color]}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

/**
 * Décisions par défaut d'une promotion : réinscription au niveau suivant,
 * sortie s'il n'y en a pas, et « ignorer » dès qu'un dossier existe déjà sur
 * l'année cible ou qu'une créance reste à solder.
 */
function buildInitialItems(rows: Row[], classes: ClassOpt[]): Record<string, ItemState> {
  const byLevel = new Map<string, ClassOpt[]>();
  for (const c of classes) {
    const arr = byLevel.get(c.levelId) ?? [];
    arr.push(c);
    byLevel.set(c.levelId, arr);
  }
  const firstClass = (levelId: string) => {
    const opts = byLevel.get(levelId) ?? [];
    return (opts.find((c) => c.enrolled < c.capacity) ?? opts[0])?.id ?? '';
  };
  const initial: Record<string, ItemState> = {};
  for (const r of rows) {
    const defaultDecision: Decision =
      r.existingTargetStatus || r.balance > 0
        ? 'SKIP'
        : r.suggestedNextLevelId
          ? 'REENROLL'
          : 'GRADUATE';
    const targetLevelId = r.suggestedNextLevelId ?? r.currentLevelId;
    initial[r.sourceEnrollmentId] = {
      decision: defaultDecision,
      targetLevelId,
      targetClassId: firstClass(targetLevelId),
    };
  }
  return initial;
}
