#!/usr/bin/env bash
# Restauration d'un dump Postgres dans la production.
#
#   bash infra/prod/scripts/restore-db.sh chemin/vers/base.dump
#
# ÉCRASE la base en service. Une sauvegarde de sécurité est prise avant toute
# destruction, dans /var/backups/jawal, et son chemin est affiché.
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DUMP="${1:?Usage : restore-db.sh <fichier.dump>}"
[[ -f "$DUMP" ]] || { echo "✖ Fichier introuvable : $DUMP"; exit 1; }

COMPOSE=(docker compose -f "$RACINE/infra/prod/docker-compose.prod.yml" --env-file "$RACINE/.env.prod")
set -a; . "$RACINE/.env.prod"; set +a

echo "Base cible : $POSTGRES_DB sur jawal-prod-postgres"
read -r -p "Écraser son contenu par $DUMP ? [oui/non] " reponse
[[ "$reponse" == "oui" ]] || { echo "Abandon."; exit 1; }

FILET="/var/backups/jawal/avant-restore-$(date -u '+%Y%m%d-%H%M%S').dump"
mkdir -p "$(dirname "$FILET")"
echo "▶ Filet de sécurité : $FILET"
"${COMPOSE[@]}" exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z6 > "$FILET"

echo "▶ Arrêt de l'application (aucune écriture pendant la restauration)"
"${COMPOSE[@]}" stop web cron >/dev/null

echo "▶ Recréation du schéma"
"${COMPOSE[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE);" \
  -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\";" >/dev/null

echo "▶ Restauration"
# --no-owner / --no-privileges : le dump peut venir d'une machine où les rôles
# s'appellent autrement (poste de développement).
"${COMPOSE[@]}" exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges < "$DUMP"

echo "▶ Rôle applicatif et RLS"
"${COMPOSE[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  < "$RACINE/packages/db/prisma/rls.sql" >/dev/null
"${COMPOSE[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "ALTER ROLE jawal_app WITH PASSWORD '${APP_DB_PASSWORD}';" >/dev/null

echo "▶ Migrations manquantes éventuelles"
"${COMPOSE[@]}" run --rm --no-deps web pnpm --filter @jawal/db exec prisma migrate deploy

echo "▶ Redémarrage"
"${COMPOSE[@]}" up -d web cron

echo "✔ Restauration terminée. Filet conservé : $FILET"
echo "  Les fichiers (photos, pièces jointes) ne sont PAS dans ce dump :"
echo "  copier aussi les objets Garage si la base vient d'une autre machine."
