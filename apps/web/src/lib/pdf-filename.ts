/**
 * Normalise une chaîne en segment de nom de fichier sûr : retire les
 * diacritiques, remplace tout caractère non alphanumérique par un tiret,
 * et compacte les tirets. Sert pour le `filename=` ASCII du Content-Disposition
 * (la version UTF-8 complète passe par `filename*`).
 */
export function pdfFilename(raw: string): string {
  return (
    raw
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'bulletin'
  );
}
