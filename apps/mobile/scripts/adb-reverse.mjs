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
 * Metro n'est pas toujours sur 8081 : si un autre projet React Native occupe
 * déjà ce port, Expo bascule sur le suivant et la redirection posée ici tombe
 * à côté. On suit donc RCT_METRO_PORT, la variable qu'Expo/React Native lit
 * pour choisir son port (`$env:RCT_METRO_PORT = "8082"; npm start`).
 *
 * Best-effort : sans appareil branché (émulateur, Expo Go en Wi-Fi), on
 * n'échoue pas — on affiche seulement ce qui manque.
 */
import { execFileSync } from 'node:child_process';

const METRO_PORT = Number(process.env.RCT_METRO_PORT) || 8081;
// 9000 = Garage (S3) : les photos (élèves, professeurs) sont servies par des URL
// signées pointant sur 127.0.0.1:9000. Sans cette règle elles restent vides.
const PORTS = [3000, 9000, METRO_PORT];

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
