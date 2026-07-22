/**
 * Génération d'un calendrier iCalendar (RFC 5545) à partir d'un EDT.
 *
 * Pour chaque entry de la semaine type, on génère un événement récurrent
 * hebdomadaire (RRULE) couvrant la période de l'année scolaire, avec
 * éventuellement EXDATE pour les overrides CANCELLED et événements
 * isolés pour les SUBSTITUTION.
 */

import type { DayKey } from './timetable-conflicts';

const DAY_TO_ICS: Record<DayKey, string> = {
  MON: 'MO',
  TUE: 'TU',
  WED: 'WE',
  THU: 'TH',
  FRI: 'FR',
  SAT: 'SA',
  SUN: 'SU',
};

export type IcsEntry = {
  id: string;
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  dayOfWeek: DayKey;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
};

export type IcsOverride = {
  entryId: string;
  date: string; // YYYY-MM-DD
  kind: 'CANCELLED' | 'SUBSTITUTION';
  summary?: string; // pour SUBSTITUTION
  description?: string;
  location?: string;
  startTime: string;
  endTime: string;
};

export type IcsBuildInput = {
  calName: string;
  yearStart: Date; // début de l'année scolaire
  yearEnd: Date; // fin
  entries: IcsEntry[];
  overrides: IcsOverride[];
  tzid?: string; // ex Africa/Casablanca, default UTC
};

/** Encodage texte ICS : escape virgules, points-virgules, retours ligne. */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** YYYYMMDD */
function fmtDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

/** YYYYMMDDTHHmmss (local au TZ, sans Z) */
function fmtDateTime(d: Date, hour: number, minute: number): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(hour)}${pad(minute)}00`;
}

/** Retourne la prochaine date >= yearStart pour le jour de la semaine donné. */
function firstOccurrence(yearStart: Date, day: DayKey): Date {
  // ICS DAY ordering : MO=1, TU=2, …, SU=7 → JS Date getUTCDay : SUN=0
  const target = { MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 0 }[day];
  const d = new Date(yearStart);
  while (d.getUTCDay() !== target) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

function parseHHMM(s: string): { h: number; m: number } {
  const [h, m] = s.split(':').map(Number);
  return { h: h ?? 0, m: m ?? 0 };
}

export function buildIcs(input: IcsBuildInput): string {
  const tzid = input.tzid ?? 'UTC';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LeadSchool//Timetable//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(input.calName)}`,
  ];

  // Index overrides par entryId
  const overridesByEntry = new Map<string, IcsOverride[]>();
  for (const o of input.overrides) {
    const arr = overridesByEntry.get(o.entryId) ?? [];
    arr.push(o);
    overridesByEntry.set(o.entryId, arr);
  }

  // Année cible : fin = dernière 23:59 de yearEnd
  const yearEndStr = fmtDate(input.yearEnd) + 'T235959';

  for (const entry of input.entries) {
    const firstDate = firstOccurrence(input.yearStart, entry.dayOfWeek);
    const { h: sh, m: sm } = parseHHMM(entry.startTime);
    const { h: eh, m: em } = parseHHMM(entry.endTime);
    const dtstart = fmtDateTime(firstDate, sh, sm);
    const dtend = fmtDateTime(firstDate, eh, em);

    const overrides = overridesByEntry.get(entry.id) ?? [];
    const exdates = overrides
      .filter((o) => o.kind === 'CANCELLED' || o.kind === 'SUBSTITUTION')
      .map((o) => {
        const d = new Date(o.date);
        return fmtDateTime(d, sh, sm);
      });

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${entry.uid}`);
    lines.push(`DTSTAMP:${fmtDate(new Date())}T000000Z`);
    lines.push(`DTSTART;TZID=${tzid}:${dtstart}`);
    lines.push(`DTEND;TZID=${tzid}:${dtend}`);
    lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${DAY_TO_ICS[entry.dayOfWeek]};UNTIL=${yearEndStr}`);
    if (exdates.length > 0) {
      lines.push(`EXDATE;TZID=${tzid}:${exdates.join(',')}`);
    }
    lines.push(`SUMMARY:${escapeText(entry.summary)}`);
    if (entry.description) lines.push(`DESCRIPTION:${escapeText(entry.description)}`);
    if (entry.location) lines.push(`LOCATION:${escapeText(entry.location)}`);
    lines.push('END:VEVENT');

    // Événements isolés pour SUBSTITUTION
    for (const sub of overrides.filter((o) => o.kind === 'SUBSTITUTION')) {
      const subDate = new Date(sub.date);
      const { h: subSh, m: subSm } = parseHHMM(sub.startTime);
      const { h: subEh, m: subEm } = parseHHMM(sub.endTime);
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${entry.uid}-${sub.date}-sub`);
      lines.push(`DTSTAMP:${fmtDate(new Date())}T000000Z`);
      lines.push(`DTSTART;TZID=${tzid}:${fmtDateTime(subDate, subSh, subSm)}`);
      lines.push(`DTEND;TZID=${tzid}:${fmtDateTime(subDate, subEh, subEm)}`);
      lines.push(`SUMMARY:${escapeText(sub.summary ?? entry.summary)}`);
      if (sub.description) lines.push(`DESCRIPTION:${escapeText(sub.description)}`);
      if (sub.location) lines.push(`LOCATION:${escapeText(sub.location)}`);
      lines.push('END:VEVENT');
    }
  }

  lines.push('END:VCALENDAR');
  // RFC 5545 : CRLF
  return lines.join('\r\n');
}
