#!/usr/bin/env node
/**
 * Rétablit les redirections `adb reverse` nécessaires au débogage USB.
 *
 * Sur le téléphone, `localhost` désigne le téléphone. Sans ces deux règles,
 * l'app se charge (Metro, 8081) mais tout appel à l'API (3000) part dans le
 * vide — d'où le message « connexion au serveur impossible ».
 *
 * Les règles sont perdues à chaque débranchement du câble, au redémarrage du
 * téléphone et à chaque relance du serveur adb : on les repose donc avant
 * chaque `expo start`.
 *
 * Best-effort : sans appareil branché (émulateur, Expo Go en Wi-Fi), on
 * n'échoue pas — on affiche seulement ce qui manque.
 */
import { execFileSync } from 'node:child_process';

const PORTS = [3000, 8081];

function adb(args) {
  return execFileSync('adb', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

try {
  const devices = adb(['devices'])
    .split('\n')
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l.endsWith('\tdevice'));

  if (devices.length === 0) {
    console.log('[adb-reverse] Aucun appareil USB — ignoré (mode Wi-Fi ou émulateur).');
    process.exit(0);
  }

  for (const port of PORTS) adb(['reverse', `tcp:${port}`, `tcp:${port}`]);
  console.log(`[adb-reverse] OK — ports ${PORTS.join(', ')} redirigés vers le PC.`);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.warn(
    `[adb-reverse] Non appliqué (${msg.split('\n')[0]}).\n` +
      "  Si l'app affiche « connexion au serveur impossible », lancez à la main :\n" +
      PORTS.map((p) => `    adb reverse tcp:${p} tcp:${p}`).join('\n'),
  );
}
