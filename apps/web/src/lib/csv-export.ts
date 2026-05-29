import 'server-only';

/**
 * Sérialise un tableau d'objets en CSV (séparateur , quotation auto).
 * En-tête = clés du premier objet, ou liste explicite via `columns`.
 */
export function toCSV<T extends Record<string, unknown>>(
  rows: T[],
  columns?: Array<{ key: keyof T & string; label: string }>,
): string {
  if (rows.length === 0 && !columns) return '';
  const cols = columns
    ? columns
    : (Object.keys(rows[0]!) as Array<keyof T & string>).map((k) => ({ key: k, label: k }));

  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    // Quote si virgule, guillemet, retour ligne
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines: string[] = [];
  lines.push(cols.map((c) => escape(c.label)).join(','));
  for (const row of rows) {
    lines.push(cols.map((c) => escape(row[c.key])).join(','));
  }
  return lines.join('\n');
}

/**
 * Réponse Next.js avec téléchargement de fichier CSV. BOM UTF-8 pour Excel.
 */
export function csvResponse(content: string, filename: string): Response {
  const bom = '﻿';
  return new Response(bom + content, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
