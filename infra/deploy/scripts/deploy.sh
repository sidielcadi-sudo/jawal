#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# LeadSchool — déploiement VPS, production et recette.
#
#   deploy.sh prod --init                 prépare /srv/leadschool/prod (clone + .env)
#   deploy.sh prod                        build + migrations + RLS + démarrage
#   deploy.sh prod --pull                 met à jour le code d'abord
#   deploy.sh recette --import f.dump     restaure une base avant de démarrer
#   deploy.sh recette --seed              jeu de démonstration (base vidée)
#   deploy.sh prod --status | --logs | --stop
#
# PostgreSQL est installé sur l'hôte (bases et rôles déjà créés) ; le reste
# tourne en conteneurs. Les deux environnements sont deux piles Docker
# distinctes, deux dossiers, deux bases — et deux ports :
#
#   production : /srv/leadschool/prod      port 80     base leadschool_production_db
#   recette    : /srv/leadschool/recette   port 8080   base leadschool_recette_db
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/srv/leadschool}"
DEPOT_GIT="${DEPOT_GIT:-git@github.com:sidielcadi-sudo/jawal.git}"
# Hôte Postgres vu DEPUIS les conteneurs (la passerelle Docker), et depuis
# l'hôte lui-même pour psql/pg_restore.
PG_HOTE_CONTENEUR="${PG_HOTE_CONTENEUR:-host.docker.internal}"
PG_HOTE_LOCAL="${PG_HOTE_LOCAL:-127.0.0.1}"
PG_PORT="${PG_PORT:-5436}"
# Image client utilisée pour tester la route depuis un conteneur : doit être
# d'une version >= au serveur (ici PostgreSQL 18).
PG_IMAGE="${PG_IMAGE:-postgres:18-alpine}"

bleu() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
vert() { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
jaune() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }
rouge() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; }
mourir() { rouge "$*"; exit 1; }

# ── Environnement demandé ────────────────────────────────────────────────────
ENVIRONNEMENT="${1:-}"
shift || true
case "$ENVIRONNEMENT" in
  prod)
    DOSSIER="$PROJECT_ROOT/prod"
    STACK_NAME="leadschool-prod"
    HTTP_PORT="${HTTP_PORT:-80}"
    DB_NAME="${DB_PROD_NAME:-leadschool_production_db}"
    DB_USER="${DB_PROD_USER:-leadschool_production_user}"
    DB_PASS="${DB_PROD_PASS:-}"
    BRANCHE="${BRANCHE:-main}"
    AVEC_CRONS=1
    ;;
  recette)
    DOSSIER="$PROJECT_ROOT/recette"
    STACK_NAME="leadschool-recette"
    HTTP_PORT="${HTTP_PORT:-8080}"
    DB_NAME="${DB_REC_NAME:-leadschool_recette_db}"
    DB_USER="${DB_REC_USER:-leadschool_recette_user}"
    DB_PASS="${DB_REC_PASS:-}"
    BRANCHE="${BRANCHE:-main}"
    # Une recette n'écrit pas aux familles : pas de rappels automatiques.
    AVEC_CRONS=0
    ;;
  *)
    sed -n '3,20p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac

# ── Options ──────────────────────────────────────────────────────────────────
INIT=0 PULL=0 SEED=0 IMPORT="" SANS_BUILD=0 ACTION="deploy"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --init) INIT=1 ;;
    --pull) PULL=1 ;;
    --seed) SEED=1 ;;
    --import) IMPORT="${2:?--import attend un fichier .dump}"; shift ;;
    --no-build) SANS_BUILD=1 ;;
    --status) ACTION="status" ;;
    --logs) ACTION="logs" ;;
    --stop) ACTION="stop" ;;
    *) mourir "Option inconnue : $1" ;;
  esac
  shift
done

# ── Initialisation : arborescence, clone, fichier d'environnement ────────────
if [[ $INIT -eq 1 ]]; then
  bleu "Arborescence sous $PROJECT_ROOT"
  mkdir -p "$PROJECT_ROOT"/{prod,recette,dumps,backups,logs}
  chmod 750 "$PROJECT_ROOT"
  ls -ld "$PROJECT_ROOT"/* | sed 's/^/   /'

  if [[ -d "$DOSSIER/.git" ]]; then
    jaune "$DOSSIER contient déjà un dépôt : clone ignoré."
  else
    bleu "Clone du dépôt dans $DOSSIER (branche $BRANCHE)"
    git clone --branch "$BRANCHE" "$DEPOT_GIT" "$DOSSIER"
  fi
fi

[[ -d "$DOSSIER/.git" ]] || mourir "$DOSSIER n'est pas un clone du dépôt. Lancez d'abord : $0 $ENVIRONNEMENT --init"

FICHIER_ENV="$DOSSIER/.env.$ENVIRONNEMENT"
COMPOSE_FILE="$DOSSIER/infra/deploy/docker-compose.stack.yml"

if [[ ! -f "$FICHIER_ENV" ]]; then
  bleu "Création de $FICHIER_ENV"
  [[ -n "$DB_PASS" ]] || mourir "Mot de passe de base absent. Relancez avec :
   DB_PROD_PASS='…' DB_REC_PASS='…' $0 $ENVIRONNEMENT --init
   (les mots de passe ne sont pas écrits dans le dépôt Git)"

  secret() { openssl rand -base64 32 | tr -d '\n='; }
  hexa() { openssl rand -hex 32; }
  ip_pub="$(curl -fsS --max-time 5 https://api.ipify.org || echo '127.0.0.1')"
  port_url=""
  [[ "$HTTP_PORT" != "80" ]] && port_url=":$HTTP_PORT"

  umask 077
  cat > "$FICHIER_ENV" <<FIN
# ${ENVIRONNEMENT^^} — généré le $(date -u '+%Y-%m-%d %H:%M UTC') par deploy.sh.
# Contient des secrets : jamais versionné, permissions 600.

STACK_NAME=$STACK_NAME
HTTP_PORT=$HTTP_PORT

APP_URL=http://${ip_pub}${port_url}
APP_NAME=LeadSchool
ROOT_DOMAIN=

AUTH_SECRET=$(secret)
CRON_SECRET=$(secret)

# Base hôte : les conteneurs passent par la passerelle Docker.
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@${PG_HOTE_CONTENEUR}:${PG_PORT}/${DB_NAME}?schema=public
# Rôle applicatif soumis au Row-Level Security (créé par ce script).
DATABASE_URL_APP=postgresql://${DB_NAME}_app:$(hexa | cut -c1-24)@${PG_HOTE_CONTENEUR}:${PG_PORT}/${DB_NAME}?schema=public

GARAGE_RPC_SECRET=$(hexa)
GARAGE_ADMIN_TOKEN=$(hexa)
S3_ACCESS_KEY=GK$(openssl rand -hex 12)
S3_SECRET_KEY=$(hexa)
S3_BUCKET=leadschool-${ENVIRONNEMENT}
S3_REGION=garage

# Aucun courriel ne part tant que NOTIFY_DRIVER vaut « log ».
NOTIFY_DRIVER=log
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM="LeadSchool <no-reply@exemple.ma>"

CMI_MERCHANT_ID=
CMI_STORE_KEY=
CMI_GATEWAY_URL=https://testpayment.cmi.co.ma/fim/est3Dgate

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_SMS_FROM=
TWILIO_WHATSAPP_FROM=
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
FIN
  chmod 600 "$FICHIER_ENV"
  vert "$FICHIER_ENV créé — vérifiez APP_URL avant d'ouvrir l'accès."
fi

set -a; . "$FICHIER_ENV"; set +a
export STACK_NAME HTTP_PORT

COMPOSE=(docker compose -f "$COMPOSE_FILE" --env-file "$FICHIER_ENV" --project-directory "$DOSSIER/infra/deploy")

# Mot de passe du rôle applicatif, relu depuis DATABASE_URL_APP : le fichier
# d'environnement reste la seule source de vérité.
ROLE_APP="$(sed -E 's|.*://([^:]+):.*|\1|' <<<"$DATABASE_URL_APP")"
PASS_APP="$(sed -E 's|.*://[^:]+:([^@]+)@.*|\1|' <<<"$DATABASE_URL_APP")"
DB_PASS="${DB_PASS:-$(sed -E 's|.*://[^:]+:([^@]+)@.*|\1|' <<<"$DATABASE_URL")}"

psql_proprio() {
  PGPASSWORD="$DB_PASS" psql -w -h "$PG_HOTE_LOCAL" -p "$PG_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 "$@"
}

# ── Actions courtes ──────────────────────────────────────────────────────────
case "$ACTION" in
  status) "${COMPOSE[@]}" ps; exit 0 ;;
  logs)   "${COMPOSE[@]}" logs -f --tail=100; exit 0 ;;
  stop)   "${COMPOSE[@]}" down; vert "Pile $STACK_NAME arrêtée"; exit 0 ;;
esac

# ── Mise à jour du code ──────────────────────────────────────────────────────
if [[ $PULL -eq 1 ]]; then
  bleu "Mise à jour du code ($BRANCHE)"
  git -C "$DOSSIER" pull --ff-only origin "$BRANCHE"
  git -C "$DOSSIER" log --oneline -1 | sed 's/^/   /'
fi

# ── Contrôles préalables ─────────────────────────────────────────────────────
bleu "Contrôles préalables"
command -v docker >/dev/null || mourir "Docker absent. Installez-le (voir README)."
command -v psql >/dev/null || mourir "Client psql absent : apt-get install -y postgresql-client"
psql_proprio -c 'SELECT 1' >/dev/null || mourir "Connexion impossible à $DB_NAME avec $DB_USER. Vérifiez le mot de passe et pg_hba.conf."
vert "Base $DB_NAME accessible"

# Les conteneurs joignent Postgres par la passerelle Docker : si l'écoute est
# limitée à localhost, l'application démarrera mais ne verra aucune donnée.
if ! timeout 90 docker run --rm --add-host=host.docker.internal:host-gateway "$PG_IMAGE" \
     sh -c "PGPASSWORD='$DB_PASS' psql -w -h $PG_HOTE_CONTENEUR -p $PG_PORT -U '$DB_USER' -d '$DB_NAME' -c 'SELECT 1' -o /dev/null" 2>/dev/null; then
  rouge "Postgres n'est pas joignable DEPUIS un conteneur."
  VERSION_PG="$(psql_proprio -tAc 'SHOW server_version' 2>/dev/null | cut -d. -f1 || echo 18)"
  cat <<AIDE
   Corrigez côté hôte, puis relancez :
     1. /etc/postgresql/${VERSION_PG}/main/postgresql.conf
          listen_addresses = '*'        (le port doit rester ${PG_PORT})
     2. /etc/postgresql/${VERSION_PG}/main/pg_hba.conf
          host all all 172.16.0.0/12 scram-sha-256
     3. systemctl restart postgresql@${VERSION_PG}-main || systemctl restart postgresql
AIDE
  exit 1
fi
vert "Postgres joignable depuis les conteneurs"

# ── Rôle applicatif (RLS) ────────────────────────────────────────────────────
# Le schéma force le Row-Level Security sur toutes les tables, propriétaire
# compris : sans BYPASSRLS, les migrations, le seed et l'espace super-admin ne
# verraient plus rien. Le rôle applicatif, lui, doit rester soumis aux
# politiques — c'est tout l'intérêt de l'isolation par tenant.
bleu "Rôle applicatif $ROLE_APP"
SQL_PRIVILEGE="
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$ROLE_APP') THEN
    CREATE ROLE $ROLE_APP LOGIN;
  END IF;
END \$\$;
ALTER ROLE $ROLE_APP WITH LOGIN PASSWORD '$PASS_APP' NOBYPASSRLS;
ALTER ROLE $DB_USER WITH BYPASSRLS;
GRANT CONNECT ON DATABASE $DB_NAME TO $ROLE_APP;
"
if sudo -n -u postgres psql -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" -c "$SQL_PRIVILEGE" >/dev/null
  vert "Rôle $ROLE_APP prêt, $DB_USER en BYPASSRLS"
else
  jaune "Pas d'accès superutilisateur : exécutez ceci une fois, puis relancez."
  printf '\n   sudo -u postgres psql -d %s <<SQL\n%s\nSQL\n\n' "$DB_NAME" "$SQL_PRIVILEGE"
  exit 1
fi

# ── Construction des images ──────────────────────────────────────────────────
if [[ $SANS_BUILD -eq 0 ]]; then
  bleu "Construction des images ($STACK_NAME)"
  "${COMPOSE[@]}" build
fi

bleu "Démarrage du stockage et du cache"
"${COMPOSE[@]}" up -d redis garage garage-init

# ── Import d'une base existante ──────────────────────────────────────────────
if [[ -n "$IMPORT" ]]; then
  [[ -f "$IMPORT" ]] || mourir "Fichier introuvable : $IMPORT"
  bleu "Import de $IMPORT dans $DB_NAME"
  read -r -p "   Le contenu actuel de $DB_NAME sera PERDU. Confirmer ? [oui/non] " rep
  [[ "$rep" == "oui" ]] || mourir "Import annulé."

  filet="$PROJECT_ROOT/backups/${ENVIRONNEMENT}-avant-import-$(date -u '+%Y%m%d-%H%M%S').dump"
  mkdir -p "$PROJECT_ROOT/backups"
  PGPASSWORD="$DB_PASS" pg_dump -h "$PG_HOTE_LOCAL" -p "$PG_PORT" -U "$DB_USER" -d "$DB_NAME" -Fc -Z6 -f "$filet"
  vert "Filet de sécurité : $filet"

  "${COMPOSE[@]}" rm -sf web cron >/dev/null 2>&1 || true
  # On vide le schéma plutôt que la base : le propriétaire n'a pas forcément le
  # droit de supprimer puis recréer une base dont il n'est pas superutilisateur.
  psql_proprio -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;' >/dev/null
  psql_proprio -c "GRANT ALL ON SCHEMA public TO $DB_USER; GRANT USAGE ON SCHEMA public TO $ROLE_APP;" >/dev/null
  PGPASSWORD="$DB_PASS" pg_restore -h "$PG_HOTE_LOCAL" -p "$PG_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --no-owner --no-privileges "$IMPORT" || jaune "pg_restore a signalé des avertissements (souvent des GRANT absents) — vérifiez ci-dessus."
  vert "Base importée"
fi

# ── Migrations et sécurité ───────────────────────────────────────────────────
bleu "Migrations Prisma"
"${COMPOSE[@]}" run --rm --no-deps web pnpm --filter @jawal/db exec prisma migrate deploy

bleu "Politiques RLS, index d'unicité et droits"
# rls.sql crée aussi le rôle `jawal_app` (hérité du développement) : inoffensif,
# l'application n'utilise que $ROLE_APP.
psql_proprio -f "$DOSSIER/packages/db/prisma/rls.sql" >/dev/null
psql_proprio -c "
GRANT USAGE ON SCHEMA public TO $ROLE_APP;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $ROLE_APP;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO $ROLE_APP;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO $ROLE_APP;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO $ROLE_APP;
" >/dev/null
vert "RLS en place pour $ROLE_APP"

bleu "Rôles système de l'application"
"${COMPOSE[@]}" run --rm --no-deps web pnpm --filter @jawal/db sync:roles

# ── Jeu de démonstration ─────────────────────────────────────────────────────
if [[ $SEED -eq 1 ]]; then
  bleu "Jeu de démonstration"
  read -r -p "   Le seed VIDE la base $DB_NAME. Confirmer ? [oui/non] " rep
  [[ "$rep" == "oui" ]] || mourir "Seed annulé."
  "${COMPOSE[@]}" run --rm --no-deps web pnpm --filter @jawal/db seed
fi

# ── Bascule applicative ──────────────────────────────────────────────────────
bleu "Démarrage de l'application"
if [[ $AVEC_CRONS -eq 1 ]]; then
  "${COMPOSE[@]}" --profile crons up -d solver web cron nginx
else
  "${COMPOSE[@]}" up -d solver web nginx
fi

bleu "Vérification"
sante=""
for _ in $(seq 1 45); do
  sante="$(curl -fsS --max-time 5 "http://127.0.0.1:${HTTP_PORT}/api/health" 2>/dev/null || true)"
  [[ -n "$sante" ]] && break
  sleep 2
done
[[ -n "$sante" ]] || { "${COMPOSE[@]}" logs --tail=40 web; mourir "L'application ne répond pas sur le port $HTTP_PORT."; }
vert "Santé : $sante"

docker image prune -f >/dev/null
"${COMPOSE[@]}" ps
printf '\n'
vert "$ENVIRONNEMENT déployé — ${APP_URL}"
[[ $AVEC_CRONS -eq 0 ]] && jaune "Recette : rappels automatiques désactivés (aucun message aux familles)."
exit 0
