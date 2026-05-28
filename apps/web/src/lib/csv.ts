/**
 * Parser CSV minimal sans dépendance. Gère :
 *  - séparateurs `,` ou `;` (auto-détecté sur la première ligne)
 *  - champs entre guillemets avec virgules à l'intérieur
 *  - guillemets échappés (`""` → `"`)
 *  - BOM UTF-8 en début de fichier
 *  - fins de ligne LF et CRLF
 *
 * Suffisant pour les exports scolaires standards. Pour des cas plus complexes
 * (Excel multi-feuille, etc.), introduire papaparse.
 */
export function parseCSV(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  if (!text.trim()) return [];

  // Détecter le séparateur sur la première ligne non vide
  const firstLine = text.split(/\r?\n/).find((l) => l.length > 0) ?? '';
  const sep = (firstLine.match(/;/g) ?? []).length > (firstLine.match(/,/g) ?? []).length ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i]!;

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (c === sep) {
      row.push(cell);
      cell = '';
      i++;
      continue;
    }

    if (c === '\n' || c === '\r') {
      // Fin de ligne : on commit la cellule et la row, et on saute les \r\n
      row.push(cell);
      // Ligne entièrement vide → ignorée
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      cell = '';
      if (c === '\r' && text[i + 1] === '\n') i += 2;
      else i++;
      continue;
    }

    cell += c;
    i++;
  }

  // Dernière cellule / row si pas de newline final
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }

  return rows;
}
