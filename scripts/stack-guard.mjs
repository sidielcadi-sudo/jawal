/**
 * Garde-fou des commandes `infra:*`.
 *
 * Le fichier `infra/docker-compose.yml` fixe le nom de projet (`jawal-dev`) et
 * des `container_name` en dur : Docker ne voit donc **qu'une seule pile**, quel
 * que soit le dossier d'où on la lance. Un dépôt miroir (leadSchool) contient
 * le même fichier ; le lancer depuis là repose la pile sur la copie de ce
 * dossier — config et image du solveur comprises — qui peut être périmée.
 *
 * On refuse donc de piloter la pile depuis un clone dont le `origin` n'est pas
 * le dépôt de référence. `JAWAL_STACK_FORCE=1` lève le garde-fou pour les cas
 * légitimes (dépôt fraîchement cloné sans remote, CI).
 */
import { execFileSync } from 'node:child_process';

/** Dépôt autorisé à piloter la pile `jawal-dev`. */
const REFERENCE_REPO = 'jawal';

function originUrl() {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

if (process.env.JAWAL_STACK_FORCE === '1') process.exit(0);

const origin = originUrl();
// Nom du dépôt distant, sans l'extension `.git` ni le chemin du propriétaire.
const repo = origin.replace(/\.git$/, '').split(/[/\\:]/).pop() ?? '';

if (repo.toLowerCase() !== REFERENCE_REPO) {
  console.error(
    [
      '',
      `✖ Pile Docker « jawal-dev » : pilotage refusé depuis ce dépôt (origin : ${origin || 'aucun'}).`,
      '',
      `  La pile est unique et appartient au dépôt de référence « ${REFERENCE_REPO} » :`,
      '  la lancer d\'ailleurs la reposerait sur une copie potentiellement périmée',
      '  (compose, contexte de build du solveur), avec les mêmes volumes et la même base.',
      '',
      `  → Placez-vous dans le dépôt ${REFERENCE_REPO} et relancez la commande.`,
      '  → Cas légitime (clone sans remote, CI) : JAWAL_STACK_FORCE=1 <commande>.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}
