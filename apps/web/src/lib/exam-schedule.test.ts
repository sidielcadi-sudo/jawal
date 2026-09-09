import { describe, expect, it } from 'vitest';
import { intervalsOverlap, minutesOfTime, timeOfMinutes } from './exam-schedule';

describe('minutesOfTime', () => {
  it('convertit une heure valide', () => {
    expect(minutesOfTime('08:30')).toBe(510);
    expect(minutesOfTime('8:05')).toBe(485);
    expect(minutesOfTime('00:00')).toBe(0);
    expect(minutesOfTime('23:59')).toBe(1439);
  });

  it('rejette un format ou une valeur invalide', () => {
    expect(minutesOfTime('8h30')).toBeNull();
    expect(minutesOfTime('24:00')).toBeNull();
    expect(minutesOfTime('10:60')).toBeNull();
    expect(minutesOfTime('')).toBeNull();
  });

  it('fait l’aller-retour avec timeOfMinutes', () => {
    expect(timeOfMinutes(minutesOfTime('14:15')!)).toBe('14:15');
  });
});

describe('intervalsOverlap', () => {
  it('détecte un chevauchement partiel', () => {
    // 08:00-10:00 et 09:00-11:00
    expect(intervalsOverlap(480, 120, 540, 120)).toBe(true);
  });

  it('détecte un englobement', () => {
    // 08:00-12:00 contient 09:00-10:00
    expect(intervalsOverlap(480, 240, 540, 60)).toBe(true);
  });

  it('ne signale rien pour deux épreuves qui se suivent', () => {
    // 08:00-10:00 puis 10:00-12:00 : la fin est exclue, pas de conflit.
    expect(intervalsOverlap(480, 120, 600, 120)).toBe(false);
  });

  it('ne signale rien pour deux épreuves disjointes', () => {
    expect(intervalsOverlap(480, 60, 600, 60)).toBe(false);
  });

  it('est symétrique', () => {
    expect(intervalsOverlap(540, 120, 480, 120)).toBe(
      intervalsOverlap(480, 120, 540, 120),
    );
  });
});
