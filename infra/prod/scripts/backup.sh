#!/usr/bin/env bash
# Sauvegarde de la production : base Postgres + fichiers Garage.
#
#   bash infra/prod/scripts/backup.sh [dossier]      # défaut : /var/backups/jawal
#
# À mettre en cron sur l'hôte, par exemple tous les jours à 3 h :
#   15 3 * * * bash /opt/jawal/infra/prod/scripts/backup.sh >> /var/log/jawal-backup.log 2>&1
#
# Une sauvegarde qui n'a jamais été restaurée n'est pas une sauvegarde :
# testez une restauration sur une machine jetable avant d'en avoir besoin.
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DEST="${1:-/var/backups/jawal}"
HORO="$(date -u '+%Y%m%d-%H%M%S')"
RETENTION_JOURS=14

COMPOSE=(docker compose -f "$RACINE/infra/prod/docker-compose.prod.yml" --env-file "$RACINE/.env.prod")
set -a; . "$RACINE/.env.prod"; set +a

mkdir -p "$DEST"

echo "▶ Base de données"
"${COMPOSE[@]}" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z6 \
  > "$DEST/db-$HORO.dump"

echo "▶ Fichiers (volume Garage)"
# Lecture du volume par un conteneur jetable : pas besoin d'arrêter Garage,
# les données sont immuables une fois écrites (objets adressés par contenu).
docker run --rm \
  -v jawal-prod_garage_data:/data:ro \
  -v jawal-prod_garage_meta:/meta:ro \
  -v "$DEST":/sauvegarde \
  alpine:3.21 \
  tar czf "/sauvegarde/fichiers-$HORO.tar.gz" -C / data meta

echo "▶ Purge au-delà de $RETENTION_JOURS jours"
find "$DEST" -name 'db-*.dump' -mtime "+$RETENTION_JOURS" -delete
find "$DEST" -name 'fichiers-*.tar.gz' -mtime "+$RETENTION_JOURS" -delete

ls -lh "$DEST" | tail -5
echo "✔ Sauvegarde $HORO terminée dans $DEST"
