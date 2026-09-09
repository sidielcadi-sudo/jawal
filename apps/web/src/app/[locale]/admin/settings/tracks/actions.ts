'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { areWeightsValid, type Weights } from '@/lib/exam-grading';
import {
  CERTIFYING_SUBJECTS,
  PRESET_BLUEPRINTS,
  PRESET_CYCLE,
  PRESET_LEVELS,
  PRESET_SUBJECTS,
  PRESET_TRACK_CURRICULUM,
  PRESET_TRACKS,
} from '@/lib/morocco-tracks';

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/**
 * Importe le référentiel du lycée marocain : cycle Lycée, niveaux TC/1BAC/2BAC,
 * matières manquantes, filières et leurs coefficients, plus les pondérations
 * réglementaires pour l'année scolaire active.
 *
 * **Idempotent** : tout est en upsert par code. Relancer l'import ne duplique
 * rien et remet les coefficients officiels — c'est aussi la façon de revenir
 * au référentiel après des ajustements locaux.
 */
export async function importMoroccoPresetAction(): Promise<
  Result<{
    levels: number;
    subjects: number;
    tracks: number;
    coefficients: number;
    rules: number;
    blueprints: number;
    curriculum: number;
  }>
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = session.user.tenantId;

  try {
    const counts = await withTenant(tenantId, async (tx) => {
      let levels = 0;
      let subjects = 0;
      let tracks = 0;
      let coefficients = 0;
      let rules = 0;
      let blueprints = 0;
      let curriculum = 0;

      // 1) Cycle lycée
      const cycle = await tx.cycle.upsert({
        where: { tenantId_code: { tenantId, code: PRESET_CYCLE.code } },
        update: { label: PRESET_CYCLE.label, labelAr: PRESET_CYCLE.labelAr },
        create: {
          tenantId,
          code: PRESET_CYCLE.code,
          label: PRESET_CYCLE.label,
          labelAr: PRESET_CYCLE.labelAr,
          order: PRESET_CYCLE.order,
        },
      });

      // 2) Niveaux
      const levelByCode = new Map<string, string>();
      for (const l of PRESET_LEVELS) {
        const row = await tx.level.upsert({
          where: { tenantId_code: { tenantId, code: l.code } },
          update: { label: l.label, labelAr: l.labelAr, cycleId: cycle.id },
          create: {
            tenantId,
            cycleId: cycle.id,
            code: l.code,
            label: l.label,
            labelAr: l.labelAr,
            order: l.order,
          },
        });
        levelByCode.set(l.code, row.id);
        levels += 1;
      }

      // 3) Matières — on ne touche pas au libellé d'une matière existante :
      //    l'établissement a pu la renommer, et le code suffit à l'identifier.
      const subjectByCode = new Map<string, string>();
      for (const s of PRESET_SUBJECTS) {
        const existing = await tx.subject.findUnique({
          where: { tenantId_code: { tenantId, code: s.code } },
          select: { id: true },
        });
        if (existing) {
          subjectByCode.set(s.code, existing.id);
          continue;
        }
        const created = await tx.subject.create({
          data: { tenantId, code: s.code, label: s.label, labelAr: s.labelAr },
        });
        subjectByCode.set(s.code, created.id);
        subjects += 1;
      }

      // 4) Filières + coefficients
      for (const t of PRESET_TRACKS) {
        const levelId = levelByCode.get(t.levelCode);
        if (!levelId) continue;
        const track = await tx.track.upsert({
          where: { tenantId_code: { tenantId, code: t.code } },
          update: { label: t.label, labelAr: t.labelAr, levelId, order: t.order },
          create: {
            tenantId,
            levelId,
            code: t.code,
            label: t.label,
            labelAr: t.labelAr,
            order: t.order,
          },
        });
        tracks += 1;

        const certifying = new Set(CERTIFYING_SUBJECTS[t.code] ?? []);
        for (const [subjectCode, coefficient] of Object.entries(t.coefficients)) {
          const subjectId = subjectByCode.get(subjectCode);
          if (!subjectId) continue;
          await tx.trackSubjectCoefficient.upsert({
            where: { trackId_subjectId: { trackId: track.id, subjectId } },
            update: { coefficient, certifying: certifying.has(subjectCode) },
            create: {
              tenantId,
              trackId: track.id,
              subjectId,
              coefficient,
              certifying: certifying.has(subjectCode),
            },
          });
          coefficients += 1;
        }
      }

      // 5) Programme par filière : volume horaire + coefficient de contrôle
      //    continu. Distinct du coefficient d'examen déjà posé en (4) — on
      //    ne touche donc pas au champ .
      const trackIdByCodeCur = new Map(
        (await tx.track.findMany({ select: { id: true, code: true } })).map((x) => [x.code, x.id]),
      );
      for (const c of PRESET_TRACK_CURRICULUM) {
        const trackId = trackIdByCodeCur.get(c.trackCode);
        if (!trackId) continue;
        for (const r of c.rows) {
          const subjectId = subjectByCode.get(r.subjectCode);
          if (!subjectId) continue;
          await tx.trackSubjectCoefficient.upsert({
            where: { trackId_subjectId: { trackId, subjectId } },
            update: { weeklyHours: r.hours, ccCoefficient: r.cc },
            create: {
              tenantId,
              trackId,
              subjectId,
              // Pas de coefficient d'examen connu pour cette matière : 1 par
              // défaut, l'établissement ajuste si elle entre au Bac.
              coefficient: 1,
              weeklyHours: r.hours,
              ccCoefficient: r.cc,
            },
          });
          curriculum += 1;
        }
      }

      // 6) Maquette des épreuves du Bac national (durée, type, sujet partagé)
      const trackIdByCode = new Map(
        (await tx.track.findMany({ select: { id: true, code: true } })).map((x) => [x.code, x.id]),
      );
      for (const b of PRESET_BLUEPRINTS) {
        const trackId = trackIdByCode.get(b.trackCode);
        const subjectId = subjectByCode.get(b.subjectCode);
        if (!trackId || !subjectId) continue;
        await tx.examBlueprint.upsert({
          where: { trackId_subjectId: { trackId, subjectId } },
          update: { durationMin: b.durationMin, type: b.type, paperGroup: b.paperGroup },
          create: {
            tenantId,
            trackId,
            subjectId,
            durationMin: b.durationMin,
            type: b.type,
            paperGroup: b.paperGroup,
          },
        });
        blueprints += 1;
      }

      // 7) Pondérations réglementaires sur l'année active
      const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
      if (year) {
        for (const l of PRESET_LEVELS) {
          const levelId = levelByCode.get(l.code);
          if (!levelId) continue;
          // Règle de niveau (trackId null) : Postgres traite les NULL comme
          // distincts, l'unicité ne peut pas s'appuyer sur @@unique — on
          // cherche puis on met à jour.
          const existing = await tx.gradingRule.findFirst({
            where: { academicYearId: year.id, levelId, trackId: null },
            select: { id: true, locked: true },
          });
          const data = {
            ccWeight: l.weights.cc,
            semesterWeight: l.weights.semester,
            regionalWeight: l.weights.regional,
            nationalWeight: l.weights.national,
          };
          if (existing) {
            // Une règle verrouillée (session clôturée) n'est pas réécrite.
            if (!existing.locked) {
              await tx.gradingRule.update({ where: { id: existing.id }, data });
              rules += 1;
            }
          } else {
            await tx.gradingRule.create({
              data: { tenantId, academicYearId: year.id, levelId, trackId: null, ...data },
            });
            rules += 1;
          }
        }
      }

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'import',
        entityType: 'Track',
        entityId: tenantId,
        after: { preset: 'morocco', levels, subjects, tracks, coefficients, rules, blueprints, curriculum },
      });

      return { levels, subjects, tracks, coefficients, rules, blueprints, curriculum };
    });

    revalidatePath('/admin/settings/tracks');
    return { ok: true, data: counts };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Met à jour les coefficients d'une filière, matière par matière. */
export async function saveTrackCoefficientsAction(
  trackId: string,
  rows: { subjectId: string; coefficient: number; certifying: boolean }[],
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = session.user.tenantId;

  for (const r of rows) {
    if (!Number.isFinite(r.coefficient) || r.coefficient < 0 || r.coefficient > 20) {
      return { ok: false, error: 'Chaque coefficient doit être compris entre 0 et 20.' };
    }
  }

  try {
    await withTenant(tenantId, async (tx) => {
      const track = await tx.track.findUnique({ where: { id: trackId }, select: { id: true } });
      if (!track) throw new Error('Filière introuvable.');
      for (const r of rows) {
        if (r.coefficient <= 0) {
          // Coefficient à 0 = la matière n'est pas au programme de la filière :
          // on retire la ligne pour que la cascade reprenne la main.
          await tx.trackSubjectCoefficient.deleteMany({
            where: { trackId, subjectId: r.subjectId },
          });
          continue;
        }
        await tx.trackSubjectCoefficient.upsert({
          where: { trackId_subjectId: { trackId, subjectId: r.subjectId } },
          update: { coefficient: r.coefficient, certifying: r.certifying },
          create: {
            tenantId,
            trackId,
            subjectId: r.subjectId,
            coefficient: r.coefficient,
            certifying: r.certifying,
          },
        });
      }
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'Track',
        entityId: trackId,
        after: { coefficients: rows.length },
      });
    });
    revalidatePath('/admin/settings/tracks');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Enregistre la pondération CC / semestriel / régional / national d'un niveau
 * (ou d'une filière). La somme doit faire 100 : une moyenne calculée sur un
 * barème qui ne boucle pas est fausse, autant refuser à la saisie.
 */
export async function saveGradingRuleAction(
  academicYearId: string,
  levelId: string,
  trackId: string | null,
  weights: Weights,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  if (!areWeightsValid(weights)) {
    return { ok: false, error: 'La somme des pondérations doit faire exactement 100 %.' };
  }
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const existing = await tx.gradingRule.findFirst({
        where: { academicYearId, levelId, trackId },
        select: { id: true, locked: true },
      });
      const data = {
        ccWeight: weights.cc,
        semesterWeight: weights.semester,
        regionalWeight: weights.regional,
        nationalWeight: weights.national,
      };
      if (existing) {
        if (existing.locked) throw new Error('Barème verrouillé : la session est clôturée.');
        await tx.gradingRule.update({ where: { id: existing.id }, data });
      } else {
        await tx.gradingRule.create({
          data: { tenantId, academicYearId, levelId, trackId, ...data },
        });
      }
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'GradingRule',
        entityId: existing?.id ?? levelId,
        after: { levelId, trackId, ...data },
      });
    });
    revalidatePath('/admin/settings/tracks');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Verrouille ou déverrouille la saisie des notes pour un barème (RF-01.3). */
export async function toggleGradingRuleLockAction(ruleId: string, locked: boolean): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      await tx.gradingRule.update({ where: { id: ruleId }, data: { locked } });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'GradingRule',
        entityId: ruleId,
        after: { locked },
      });
    });
    revalidatePath('/admin/settings/tracks');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Une ligne de maquette d'épreuve, telle que saisie à l'écran. */
export type BlueprintRow = {
  subjectId: string;
  /** 0 = la matière n'est pas évaluée à l'examen de cette filière. */
  durationMin: number;
  type: 'SPECIALITY' | 'SECONDARY' | 'LITERARY';
  /** Vide = sujet propre à la filière. */
  paperGroup: string;
};

/**
 * Enregistre la maquette d'épreuve d'une filière : durée, type et groupe de
 * sujet partagé, matière par matière.
 *
 * Le groupe est la donnée sensible : deux filières qui partagent le même code
 * sur la même matière composeront sur **le même sujet** et ne donneront qu'une
 * seule épreuve à organiser. Le laisser vide isole la filière, même à durée
 * identique.
 */
export async function saveTrackBlueprintsAction(
  trackId: string,
  rows: BlueprintRow[],
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const tenantId = session.user.tenantId;

  for (const r of rows) {
    if (!Number.isFinite(r.durationMin) || r.durationMin < 0 || r.durationMin > 480) {
      return { ok: false, error: 'La durée doit être comprise entre 0 et 480 minutes.' };
    }
    if (r.durationMin > 0 && r.durationMin < 15) {
      return { ok: false, error: 'Une épreuve dure au minimum 15 minutes.' };
    }
    if (r.paperGroup && !/^[a-z0-9-]{2,40}$/i.test(r.paperGroup.trim())) {
      return {
        ok: false,
        error: 'Le code de groupe ne peut contenir que lettres, chiffres et tirets (2 à 40 caractères).',
      };
    }
  }

  try {
    await withTenant(tenantId, async (tx) => {
      const track = await tx.track.findUnique({ where: { id: trackId }, select: { id: true } });
      if (!track) throw new Error('Filière introuvable.');
      for (const r of rows) {
        if (r.durationMin <= 0) {
          // Durée à 0 = matière hors examen pour cette filière : on retire la
          // ligne plutôt que de garder une maquette fantôme.
          await tx.examBlueprint.deleteMany({ where: { trackId, subjectId: r.subjectId } });
          continue;
        }
        const paperGroup = r.paperGroup.trim() || null;
        await tx.examBlueprint.upsert({
          where: { trackId_subjectId: { trackId, subjectId: r.subjectId } },
          update: { durationMin: r.durationMin, type: r.type, paperGroup },
          create: {
            tenantId,
            trackId,
            subjectId: r.subjectId,
            durationMin: r.durationMin,
            type: r.type,
            paperGroup,
          },
        });
      }
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'ExamBlueprint',
        entityId: trackId,
        after: { rows: rows.filter((r) => r.durationMin > 0).length },
      });
    });
    revalidatePath('/admin/settings/tracks');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/**
 * Applique un même code de groupe à une matière sur plusieurs filières — le
 * geste qui mutualise réellement une épreuve. Sans lui, il faudrait saisir le
 * même code filière par filière, avec le risque de faute de frappe qui casse
 * silencieusement le regroupement.
 */
export async function applyPaperGroupAction(
  trackIds: string[],
  subjectId: string,
  paperGroup: string,
  durationMin: number,
): Promise<Result<{ applied: number }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');
  const code = paperGroup.trim();
  if (!/^[a-z0-9-]{2,40}$/i.test(code)) {
    return { ok: false, error: 'Code de groupe invalide (lettres, chiffres et tirets).' };
  }
  if (trackIds.length < 2) {
    return { ok: false, error: 'Sélectionnez au moins deux filières à mutualiser.' };
  }
  if (!Number.isFinite(durationMin) || durationMin < 15 || durationMin > 480) {
    return { ok: false, error: 'Durée invalide.' };
  }
  const tenantId = session.user.tenantId;
  try {
    const applied = await withTenant(tenantId, async (tx) => {
      let n = 0;
      for (const trackId of trackIds) {
        await tx.examBlueprint.upsert({
          where: { trackId_subjectId: { trackId, subjectId } },
          // La durée est alignée sur tout le groupe : un sujet identique ne
          // peut pas durer 2 h ici et 3 h là.
          update: { paperGroup: code, durationMin },
          create: {
            tenantId,
            trackId,
            subjectId,
            durationMin,
            type: 'LITERARY',
            paperGroup: code,
          },
        });
        n += 1;
      }
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'ExamBlueprint',
        entityId: subjectId,
        after: { paperGroup: code, tracks: trackIds.length, durationMin },
      });
      return n;
    });
    revalidatePath('/admin/settings/tracks');
    return { ok: true, data: { applied } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
