#!/bin/sh
# Travaux quotidiens de Jawal, appelés par crond (02h15, heure du conteneur).
#
# Chaque route est idempotente : relancer la série ne renvoie pas deux fois le
# même rappel. On continue après un échec, pour qu'un service indisponible
# n'empêche pas les autres rappels de partir.
set -u

BASE="${WEB_URL:-http://web:3000}"
SECRET="${CRON_SECRET:?CRON_SECRET manquant}"

TACHES="payment-reminders appel-reminders cahier-reminders contract-alerts exam-reminders"

for tache in $TACHES; do
  horo="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  code="$(curl -s -o /tmp/cron-out -w '%{http_code}' --max-time 300 \
    -X POST -H "X-Cron-Secret: ${SECRET}" "${BASE}/api/cron/${tache}")"
  if [ "$code" = "200" ]; then
    echo "${horo} cron ${tache} : ok — $(head -c 300 /tmp/cron-out)"
  else
    echo "${horo} cron ${tache} : ÉCHEC (HTTP ${code}) — $(head -c 300 /tmp/cron-out)" >&2
  fi
done
