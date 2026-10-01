#!/usr/bin/env bash
# Sauvegarde d'un environnement : base Postgres (hôte) + fichiers Garage.
#
#   backup.sh prod       →  /srv/leadschool/backups/prod-<horodatage>.{dump,tar.gz}
#   backup.sh recette
#
# À planifier sur l'hôte :
#   15 3 * * * bash /srv/leadschool/prod/infra/deploy/scripts/backup.sh prod >> /srv/leadschool/logs/backup.log 2>&1
#
# Une sauvegarde jamais restaurée n'est pas une sauvegarde : testez une
# restauration en recette avant d'en avoir besoin en production.
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/srv/leadschool}"
PG_HOTE_LOCAL="${PG_HOTE_LOCAL:-127.0.0.1}"
PG_PORT="${PG_PORT:-5432}"
RETENTION_JOURS="${RETENTION_JOURS:-14}"

ENVIRONNEMENT="${1:?Usage : backup.sh <prod|recette>}"
case "$ENVIRONNEMENT" in
  prod) DOSSIER="$PROJECT_ROOT/prod"; STACK_NAME="leadschool-prod" ;;
  recette) DOSSIER="$PROJECT_ROOT/recette"; STACK_NAME="leadschool-recette" ;;
  *) echo "Environnement inconnu : $ENVIRONNEMENT"; exit 1 ;;
esac

FICHIER_ENV="$DOSSIER/.env.$ENVIRONNEMENT"
[[ -f "$FICHIER_ENV" ]] || { echo "✖ $FICHIER_ENV manquant"; exit 1; }
set -a; . "$FICHIER_ENV"; set +a

# Identifiants extraits de DATABASE_URL : une seule source de vérité.
DB_USER="$(sed -E 's|.*://([^:]+):.*|\1|' <<<"$DATABASE_URL")"
DB_PASS="$(sed -E 's|.*://[^:]+:([^@]+)@.*|\1|' <<<"$DATABASE_URL")"
DB_NAME="$(sed -E 's|.*/([^/?]+)\?.*|\1|' <<<"$DATABASE_URL")"

DEST="$PROJECT_ROOT/backups"
HORO="$(date -u '+%Y%m%d-%H%M%S')"
mkdir -p "$DEST"

echo "▶ Base $DB_NAME"
PGPASSWORD="$DB_PASS" pg_dump -h "$PG_HOTE_LOCAL" -p "$PG_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -Fc -Z6 -f "$DEST/${ENVIRONNEMENT}-$HORO.dump"

echo "▶ Fichiers (volumes Garage de $STACK_NAME)"
# Conteneur jetable en lecture seule : Garage n'a pas besoin d'être arrêté,
# ses objets sont immuables une fois écrits.
docker run --rm \
  -v "${STACK_NAME}_garage_data:/data:ro" \
  -v "${STACK_NAME}_garage_meta:/meta:ro" \
  -v "$DEST:/sauvegarde" \
  alpine:3.21 \
  tar czf "/sauvegarde/${ENVIRONNEMENT}-fichiers-$HORO.tar.gz" -C / data meta

echo "▶ Purge au-delà de $RETENTION_JOURS jours"
find "$DEST" -name "${ENVIRONNEMENT}-*.dump" -mtime "+$RETENTION_JOURS" -delete
find "$DEST" -name "${ENVIRONNEMENT}-fichiers-*.tar.gz" -mtime "+$RETENTION_JOURS" -delete

ls -lh "$DEST" | grep "$ENVIRONNEMENT" | tail -4
echo "✔ Sauvegarde $ENVIRONNEMENT $HORO terminée"
echo "  Rappel : ces fichiers sont sur le MÊME disque que la production."
echo "  Copiez-les hors du VPS (rsync, stockage objet distant)."
