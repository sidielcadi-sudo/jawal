/**
 * Garde-fou lancé avant `next dev`.
 *
 * Deux causes, toujours les mêmes, derrière les « Internal Server Error »
 * du serveur de développement :
 *
 *  1. **Deux serveurs sur le même dossier.** Une seconde instance de `next dev`
 *     écrit dans le même `.next` que la première : les manifestes sont écrits à
 *     quatre mains et finissent tronqués (« Unexpected non-whitespace character
 *     after JSON »). On tue donc tout ce qui écoute déjà le port avant de
 *     démarrer.
 *  2. **Un arrêt brutal pendant une écriture** (Ctrl+C au mauvais moment,
 *     coupure de courant, mise en veille) : un manifeste reste à moitié écrit.
 *     On relit donc tous les JSON de `.next` et, si l'un d'eux est illisible,
 *     on efface le dossier — Next le reconstruit au démarrage.
 *
 * Le coût est nul quand tout va bien (quelques dizaines de millisecondes de
 * lecture), et une recompilation complète dans le cas contraire.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nextDir = path.join(root, '.next');
const port = Number(process.env.PORT ?? 3000);

/** PID des processus qui écoutent déjà le port (hors processus courant). */
function listeners() {
  const pids = new Set();
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano -p tcp`, { encoding: 'utf8' });
      for (const line of out.split('\n')) {
        if (!line.includes('LISTENING')) continue;
        const cols = line.trim().split(/\s+/);
        const local = cols[1] ?? '';
        if (!local.endsWith(`:${port}`)) continue;
        const pid = Number(cols[cols.length - 1]);
        if (pid > 0) pids.add(pid);
      }
    } else {
      const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8' });
      for (const l of out.split('\n')) {
        const pid = Number(l.trim());
        if (pid > 0) pids.add(pid);
      }
    }
  } catch {
    // Aucun processus sur le port : netstat/lsof sortent en erreur, c'est normal.
  }
  pids.delete(process.pid);
  return [...pids];
}

function kill(pid) {
  try {
    if (process.platform === 'win32') execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    else process.kill(pid, 'SIGKILL');
    return true;
  } catch {
    return false;
  }
}

/** Premier fichier JSON illisible de `.next`, ou null. */
function corruptJson(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    // Le cache webpack est binaire et volumineux : Next le régénère seul.
    if (e.isDirectory()) {
      if (e.name === 'cache') continue;
      const found = corruptJson(full);
      if (found) return found;
      continue;
    }
    if (!e.name.endsWith('.json')) continue;
    try {
      const raw = fs.readFileSync(full, 'utf8');
      if (raw.trim() === '') continue;
      JSON.parse(raw);
    } catch {
      return full;
    }
  }
  return null;
}

const busy = listeners();
for (const pid of busy) {
  const done = kill(pid);
  console.log(
    done
      ? `[dev-guard] serveur déjà présent sur le port ${port} (PID ${pid}) : arrêté.`
      : `[dev-guard] impossible d'arrêter le PID ${pid} sur le port ${port} — arrêtez-le à la main.`,
  );
}

const broken = corruptJson(nextDir);
if (broken) {
  console.log(`[dev-guard] cache corrompu (${path.relative(root, broken)}) : .next effacé, reconstruction.`);
  fs.rmSync(nextDir, { recursive: true, force: true });
}
