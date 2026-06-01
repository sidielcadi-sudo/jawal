import { z } from 'zod';

/**
 * Paramètres établissement pour la génération d'EDT, stockés dans
 * `Tenant.settings.timetable` (JSON). Singleton par tenant.
 *
 * Si absent ou partiel, on retombe sur des défauts raisonnables :
 *  - tous les jours en FULL (MON–SAT)
 *  - pause déjeuner désactivée
 *  - heure fin matin par défaut = 13:00
 */

export const dayModeSchema = z.enum([
  'FULL',
  'MORNING_ONLY',
  'AFTERNOON_ONLY',
  'OFF',
]);
export type DayMode = z.infer<typeof dayModeSchema>;

// On réutilise le DayKey existant dans person.ts pour cohérence,
// mais on redéfinit le schéma local pour les valeurs avec SUN.
const localDayKeySchema = z.enum([
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
  'SUN',
]);
export type DayKey = z.infer<typeof localDayKeySchema>;

const timeHHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format HH:MM 24h attendu');

export const timetableSettingsSchema = z.object({
  /** Mode de chaque jour de la semaine. */
  days: z.record(localDayKeySchema, dayModeSchema).default({}),
  /**
   * Heure de fin du matin (pour MORNING_ONLY). Tout slot dont startTime
   * est < morningEndsAt compte comme « matin ».
   */
  morningEndsAt: timeHHMM.default('13:00'),
  /**
   * Heure de début de l'après-midi (pour AFTERNOON_ONLY). Tout slot dont
   * startTime est ≥ afternoonStartsAt compte comme « après-midi ».
   */
  afternoonStartsAt: timeHHMM.default('14:00'),
  /**
   * Pause déjeuner globale. Si activée, aucun cours ne peut être placé
   * dans la plage [from, to[ quel que soit le jour.
   */
  lunchBreak: z
    .object({
      enabled: z.boolean().default(false),
      from: timeHHMM.default('12:00'),
      to: timeHHMM.default('14:00'),
    })
    .default({ enabled: false, from: '12:00', to: '14:00' }),
});
export type TimetableSettings = z.infer<typeof timetableSettingsSchema>;

/** Défauts d'écriture / lecture. */
export const TIMETABLE_SETTINGS_DEFAULTS: TimetableSettings = {
  days: {
    MON: 'FULL',
    TUE: 'FULL',
    WED: 'FULL',
    THU: 'FULL',
    FRI: 'FULL',
    SAT: 'FULL',
    SUN: 'OFF',
  },
  morningEndsAt: '13:00',
  afternoonStartsAt: '14:00',
  lunchBreak: { enabled: false, from: '12:00', to: '14:00' },
};

/** Lit les settings depuis le JSON brut du tenant.settings, fallback défauts. */
export function readTimetableSettings(raw: unknown): TimetableSettings {
  if (!raw || typeof raw !== 'object') return TIMETABLE_SETTINGS_DEFAULTS;
  const tt = (raw as Record<string, unknown>).timetable;
  if (!tt || typeof tt !== 'object') return TIMETABLE_SETTINGS_DEFAULTS;
  const parsed = timetableSettingsSchema.safeParse(tt);
  if (!parsed.success) return TIMETABLE_SETTINGS_DEFAULTS;
  // Compléter avec les défauts pour les champs manquants
  return {
    days: { ...TIMETABLE_SETTINGS_DEFAULTS.days, ...parsed.data.days },
    morningEndsAt: parsed.data.morningEndsAt,
    afternoonStartsAt: parsed.data.afternoonStartsAt,
    lunchBreak: parsed.data.lunchBreak,
  };
}

/** Helpers pour le solveur : pour un jour donné, est-ce que ce slot est autorisé ? */
export function isSlotAllowedOnDay(
  day: DayKey,
  slotStart: string,
  slotEnd: string,
  settings: TimetableSettings,
): boolean {
  const mode = settings.days[day] ?? 'FULL';
  if (mode === 'OFF') return false;

  // Pause déjeuner : on interdit si le slot chevauche la plage
  if (settings.lunchBreak.enabled) {
    const { from, to } = settings.lunchBreak;
    // Overlap = (slotStart < to) && (slotEnd > from)
    if (slotStart < to && slotEnd > from) return false;
  }

  if (mode === 'MORNING_ONLY') {
    // Slot doit finir AVANT morningEndsAt
    return slotEnd <= settings.morningEndsAt;
  }
  if (mode === 'AFTERNOON_ONLY') {
    // Slot doit commencer APRÈS afternoonStartsAt
    return slotStart >= settings.afternoonStartsAt;
  }
  // FULL : tout est autorisé sauf pause déjeuner déjà filtrée
  return true;
}
