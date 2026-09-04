/**
 * Génère le PDF du manuel utilisateur à partir des sources Markdown.
 *
 *   node docs/guide/build-pdf.mjs                  → manuel complet
 *   node docs/guide/build-pdf.mjs 00-prise-en-main → un seul chapitre
 *
 * Chaîne : Markdown → HTML (markdown-it) → PDF (Edge/Chrome en mode headless).
 * Aucun téléchargement de navigateur : on réutilise celui déjà installé.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';

const GUIDE_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(GUIDE_DIR, '..', '..', 'build', 'manuel');

/** Ordre d'assemblage du manuel complet (cf. docs/guide/README.md, § 2). */
const CHAPTERS = [
  '00-prise-en-main.md',
  '10-scolarite.md',
  '20-vie-scolaire.md',
  '30-pedagogie.md',
  '40-finance.md',
  '50-comptabilite.md',
  '60-rh-paie.md',
  '70-modules.md',
  '80-communication.md',
  '90-parametrage.md',
  'espaces/enseignant.md',
  'espaces/parent.md',
  'espaces/eleve.md',
  'espaces/super-admin.md',
  'annexes/roles-permissions.md',
  'annexes/faq-depannage.md',
];

/** Navigateurs Chromium candidats, dans l'ordre de préférence. */
const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

function findBrowser() {
  const found = BROWSERS.find((p) => existsSync(p));
  if (!found) {
    console.error(
      'Aucun navigateur Chromium trouvé. Installer Edge ou Chrome, ou définir\n' +
        'la variable CHROME_PATH sur le chemin de l\'exécutable.',
    );
    process.exit(1);
  }
  return found;
}

/** Retire l'en-tête YAML et en extrait le titre. */
function stripFrontMatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return { body: md, title: null };
  const title = m[1].match(/^title:\s*"?([^"\n]+)"?/m)?.[1] ?? null;
  return { body: md.slice(m[0].length), title };
}

const md = new MarkdownIt({ html: true, linkify: false, typographer: false });

function render(files) {
  let docTitle = 'LeadSchool — Manuel utilisateur';
  const parts = files.map((rel, i) => {
    const abs = join(GUIDE_DIR, rel);
    if (!existsSync(abs)) {
      console.error(`Fichier introuvable : ${rel}`);
      process.exit(1);
    }
    const { body, title } = stripFrontMatter(readFileSync(abs, 'utf8'));
    if (i === 0 && title) docTitle = title;
    // `\newpage` (syntaxe pandoc) → saut de page CSS pour l'impression.
    // `[ \t]*` et non `\s*` : `\s` engloutirait la ligne vide suivante, et le
    // bloc HTML avalerait alors le titre qui suit (les `##` ne seraient plus
    // interprétés).
    const withBreaks = body.replace(/^\\newpage[ \t]*$/gm, '<div class="page-break"></div>');
    return md.render(withBreaks);
  });

  // Chaque chapitre commence sur une page neuve.
  const content = parts.join('\n<div class="page-break"></div>\n');
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${docTitle}</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  body { font: 10.5pt/1.55 "Segoe UI", "Helvetica Neue", Arial, sans-serif;
         color: #1a2230; margin: 0; }
  h1 { font-size: 20pt; color: #14355c; border-bottom: 2px solid #14355c;
       padding-bottom: 6px; margin: 0 0 18px; page-break-after: avoid; }
  h2 { font-size: 14pt; color: #14355c; margin: 22px 0 8px; page-break-after: avoid; }
  h3 { font-size: 11.5pt; color: #29456e; margin: 16px 0 6px; page-break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0 16px;
          font-size: 9.5pt; page-break-inside: auto; }
  th, td { border: 1px solid #c8d2e0; padding: 5px 8px; text-align: start;
           vertical-align: top; }
  th { background: #eef2f8; color: #14355c; font-weight: 600; }
  tr { page-break-inside: avoid; }
  blockquote { margin: 12px 0; padding: 8px 14px; background: #f6f8fc;
               border-inline-start: 3px solid #14355c; page-break-inside: avoid; }
  blockquote p { margin: 4px 0; }
  code { background: #f1f3f7; padding: 1px 4px; border-radius: 3px; font-size: 9.5pt; }
  pre { background: #f6f8fc; border: 1px solid #dde3ee; border-radius: 4px;
        padding: 10px 12px; overflow-wrap: anywhere; white-space: pre-wrap;
        page-break-inside: avoid; }
  pre code { background: none; padding: 0; }
  hr { border: 0; border-top: 1px solid #dde3ee; margin: 20px 0; }
  .page-break { page-break-after: always; break-after: page; height: 0; }
</style></head><body>
${content}
</body></html>`;
}

// ── Exécution ────────────────────────────────────────────────────────────
const arg = process.argv[2];
const files = arg
  ? [arg.endsWith('.md') ? arg : `${arg}.md`]
  : CHAPTERS.filter((f) => existsSync(join(GUIDE_DIR, f)));

mkdirSync(OUT_DIR, { recursive: true });
const base = arg ? arg.replace(/\.md$/, '').replace(/[\\/]/g, '-') : 'manuel-leadschool';
const htmlPath = join(OUT_DIR, `${base}.html`);
const pdfPath = join(OUT_DIR, `${base}.pdf`);

writeFileSync(htmlPath, render(files), 'utf8');

const browser = findBrowser();
execFileSync(browser, [
  '--headless=new',
  '--disable-gpu',
  '--no-pdf-header-footer',
  `--print-to-pdf=${pdfPath}`,
  `file:///${resolve(htmlPath).replace(/\\/g, '/')}`,
], { stdio: 'inherit' });

console.log(`PDF généré : ${pdfPath}`);
console.log(`(HTML intermédiaire : ${htmlPath})`);
