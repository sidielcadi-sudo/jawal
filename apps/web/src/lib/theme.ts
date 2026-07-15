import 'server-only';

/**
 * Thème « brand » configurable par établissement. La couleur primaire (600)
 * pilote une échelle 50→900 (variables CSS injectées par tenant). Défauts dans
 * globals.css ; ici on génère l'échelle à partir de la couleur choisie.
 */

export const DEFAULT_PRIMARY = '#1A56DB';

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export type BrandScale = Record<(typeof SHADES)[number], string>; // "r g b"

const HEX_RE = /^#([0-9a-fA-F]{6})$/;
export function isValidHex(hex: string): boolean {
  return HEX_RE.test(hex.trim());
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToChannels(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return `${Math.round((r + m) * 255)} ${Math.round((g + m) * 255)} ${Math.round((b + m) * 255)}`;
}

// Cibles de luminosité (clairs) / facteurs (foncés) autour du primaire (600).
const LIGHT_L: Record<number, number> = { 50: 0.965, 100: 0.925, 200: 0.855, 300: 0.76, 400: 0.66, 500: 0.6 };
const DARK_F: Record<number, number> = { 700: 0.8, 800: 0.66, 900: 0.5 };

/** Génère l'échelle 50→900 (canaux RGB) depuis la couleur primaire. */
export function generateBrandScale(primaryHex: string): BrandScale {
  const [r, g, b] = hexToRgb(primaryHex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const scale = {} as BrandScale;
  for (const k of SHADES) {
    if (k === 600) scale[k] = `${r} ${g} ${b}`;
    else if (k < 600) scale[k] = hslToChannels(h, Math.min(s, 0.95), LIGHT_L[k]!);
    else scale[k] = hslToChannels(h, s, Math.max(0.12, l * DARK_F[k]!));
  }
  return scale;
}

/** Contenu CSS `:root{…}` à injecter pour surcharger la palette d'un tenant. */
export function brandScaleCss(scale: BrandScale): string {
  const vars = SHADES.map((k) => `--brand-${k}:${scale[k]}`).join(';');
  return `:root{${vars}}`;
}

/** Couleur primaire du tenant (settings.theme.primary) ou null si non défini/invalide. */
export function tenantPrimaryColor(settings: unknown): string | null {
  const p = (settings as { theme?: { primary?: string } } | null)?.theme?.primary;
  return typeof p === 'string' && isValidHex(p) ? p : null;
}

/** Hex #RRGGBB → canaux « r g b » (format des variables CSS). */
export function hexToChannels(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

function themeColor(settings: unknown, key: 'band' | 'tableHeader'): string | null {
  const v = (settings as { theme?: Record<string, unknown> } | null)?.theme?.[key];
  return typeof v === 'string' && isValidHex(v) ? v : null;
}

/** Couleur des bandes de titre (settings.theme.band) ou null → suit brand-100. */
export function tenantBandColor(settings: unknown): string | null {
  return themeColor(settings, 'band');
}

/** Couleur des en-têtes de tableau (settings.theme.tableHeader) ou null → défaut. */
export function tenantTableHeaderColor(settings: unknown): string | null {
  return themeColor(settings, 'tableHeader');
}

/**
 * CSS des couleurs additionnelles configurables (bande de titre / en-tête de
 * tableau). Chaîne vide si aucune n'est définie (on garde alors les défauts).
 */
export function extraColorsCss(band: string | null, tableHeader: string | null): string {
  const vars = [
    band ? `--band:${hexToChannels(band)}` : null,
    tableHeader ? `--table-header:${hexToChannels(tableHeader)}` : null,
  ]
    .filter(Boolean)
    .join(';');
  return vars ? `:root{${vars}}` : '';
}
