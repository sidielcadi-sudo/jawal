#!/usr/bin/env bash
# Déploiement / mise à jour de Jawal sur le VPS.
#
#   bash infra/prod/scripts/deploy.sh            # build + migrations + redémarrage
#   bash infra/prod/scripts/deploy.sh --pull     # git pull d'abord
#   bash infra/prod/scripts/deploy.sh --seed     # + jeu de démonstration (base vidée !)
#
# Les migrations tournent AVANT le basculement des conteneurs applicatifs :
# une migration qui échoue laisse la version précédente en service.
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE=(docker compose -f "$RACINE/infra/prod/docker-compose.prod.yml" --env-file "$RACINE/.env.prod")

info() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }

[[ -f "$RACINE/.env.prod" ]] || { echo "✖ .env.prod manquant (voir infra/prod/.env.prod.example)."; exit 1; }
set -a; . "$RACINE/.env.prod"; set +a

AVEC_PULL=0; AVEC_SEED=0
for arg in "$@"; do
  case "$arg" in
    --pull) AVEC_PULL=1 ;;
    --seed) AVEC_SEED=1 ;;
    *) echo "Option inconnue : $arg"; exit 1 ;;
  esac
done

if [[ $AVEC_PULL -eq 1 ]]; then
  info "Récupération du code"
  git -C "$RACINE" pull --ff-only
fi

info "Construction des images"
"${COMPOSE[@]}" build

info "Démarrage des services d'infrastructure"
"${COMPOSE[@]}" up -d postgres redis garage garage-init

info "Attente de Postgres"
until "${COMPOSE[@]}" exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
  sleep 2
done

info "Migrations Prisma"
# Conteneur jetable : les migrations ne dépendent pas de l'application en
# service, et un échec n'arrête pas la version déjà déployée.
"${COMPOSE[@]}" run --rm --no-deps web pnpm --filter @jawal/db exec prisma migrate deploy

info "Rôle applicatif et politiques RLS"
"${COMPOSE[@]}" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  < "$RACINE/packages/db/prisma/rls.sql" > /dev/null
# rls.sql crée `jawal_app` avec un mot de passe de développement : on le
# remplace par celui de .env.prod, qui est aussi dans DATABASE_URL_APP.
"${COMPOSE[@]}" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "ALTER ROLE jawal_app WITH PASSWORD '${APP_DB_PASSWORD}';" > /dev/null

info "Rôles système"
"${COMPOSE[@]}" run --rm --no-deps web pnpm --filter @jawal/db sync:roles

if [[ $AVEC_SEED -eq 1 ]]; then
  info "Jeu de démonstration (la base est VIDÉE avant)"
  read -r -p "   Confirmer la perte des données existantes ? [oui/non] " reponse
  [[ "$reponse" == "oui" ]] || { echo "   Abandon du seed."; exit 1; }
  "${COMPOSE[@]}" run --rm --no-deps web pnpm --filter @jawal/db seed
fi

info "Bascule des services applicatifs"
"${COMPOSE[@]}" up -d solver web cron nginx

info "Vérification"
for _ in $(seq 1 30); do
  if curl -fsS --max-time 5 http://127.0.0.1/api/health >/dev/null; then
    echo "   ✔ $(curl -s http://127.0.0.1/api/health)"
    break
  fi
  sleep 2
done

info "Nettoyage des images orphelines"
docker image prune -f >/dev/null

"${COMPOSE[@]}" ps
printf '\n✔ Déploiement terminé — %s\n\n' "${APP_URL}"
