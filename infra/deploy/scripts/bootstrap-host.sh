#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# LeadSchool — socle d'un VPS vierge (Ubuntu 22.04 / 24.04).
#
#   bootstrap-host.sh                 prépare tout, puis affiche le récapitulatif
#   bootstrap-host.sh --status        état du socle, sans rien modifier
#   bootstrap-host.sh --db-only       recrée seulement bases et rôles
#
# Ce script s'arrête AVANT l'application : il installe les paquets, crée
# l'arborescence, lance le serveur PostgreSQL et prépare les deux bases avec
# leur propriétaire. Le déploiement applicatif est le travail de deploy.sh.
#
# Il est idempotent : le relancer ne casse rien et ne régénère aucun mot de
# passe déjà écrit.
#
# Tout ce qui est réglable passe par l'environnement :
#   PROJECT_ROOT   /srv/leadschool      racine des environnements
#   PG_VERSION     18                   version majeure de PostgreSQL
#   PG_PORT        5436                 port publié sur 127.0.0.1
#   HTTP_PROD      8003                 port HTTP de la production
#   HTTP_RECETTE   8080                 port HTTP de la recette
#   DB_PROD_PASS / DB_REC_PASS          imposés, sinon tirés au hasard
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/srv/leadschool}"
PG_VERSION="${PG_VERSION:-18}"
PG_PORT="${PG_PORT:-5436}"
PG_CONTAINER="${PG_CONTAINER:-leadschool-postgres}"
PG_NETWORK="${PG_NETWORK:-leadschool-db}"
PG_VOLUME="${PG_VOLUME:-leadschool_pg_data}"
PG_SUPERUSER="${PG_SUPERUSER:-postgres}"
HTTP_PROD="${HTTP_PROD:-8003}"
HTTP_RECETTE="${HTTP_RECETTE:-8080}"

DB_PROD_NAME="${DB_PROD_NAME:-leadschool_production_db}"
DB_PROD_USER="${DB_PROD_USER:-leadschool_production_user}"
DB_REC_NAME="${DB_REC_NAME:-leadschool_recette_db}"
DB_REC_USER="${DB_REC_USER:-leadschool_recette_user}"

ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_PG="$ICI/../docker-compose.postgres.yml"
ENV_PG="$PROJECT_ROOT/.postgres.env"
ENV_DB="$PROJECT_ROOT/.db-credentials"

bleu() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
vert() { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
jaune() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }
rouge() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; }
mourir() { rouge "$*"; exit 1; }

MODE="complet"
case "${1:-}" in
  --status) MODE="status" ;;
  --db-only) MODE="db" ;;
  '') ;;
  *) sed -n '4,10p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac

[[ $EUID -eq 0 ]] || mourir "À lancer en root : sudo -E bash $0 ${1:-}"

# ── État du socle ────────────────────────────────────────────────────────────
if [[ "$MODE" == "status" ]]; then
  bleu "Socle $PROJECT_ROOT"
  [[ -d "$PROJECT_ROOT" ]] && ls -ld "$PROJECT_ROOT"/* | sed 's/^/   /' || jaune "absent"
  bleu "Serveur PostgreSQL"
  docker ps --filter "name=$PG_CONTAINER" --format '   {{.Names}} · {{.Status}} · {{.Ports}}' || true
  if docker exec "$PG_CONTAINER" pg_isready -U "$PG_SUPERUSER" -d postgres >/dev/null 2>&1; then
    docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d postgres -tAc \
      "SELECT d.datname || ' → ' || pg_get_userbyid(d.datdba) || ' · ' || pg_size_pretty(pg_database_size(d.datname))
       FROM pg_database d WHERE NOT d.datistemplate AND d.datname <> 'postgres' ORDER BY 1" | sed 's/^/   /'
  else
    jaune "serveur injoignable"
  fi
  bleu "Secrets"
  for f in "$ENV_PG" "$ENV_DB"; do
    [[ -f "$f" ]] && printf '   %s (%s)\n' "$f" "$(stat -c %a "$f")" || jaune "   $f absent"
  done
  exit 0
fi

# ── 1. Paquets ───────────────────────────────────────────────────────────────
if [[ "$MODE" == "complet" ]]; then
  bleu "Paquets système"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  # Le client psql est indispensable à deploy.sh (migrations, RLS, dumps), et
  # sa version doit être >= au serveur, sinon pg_dump refuse de travailler.
  apt-get install -y -qq ca-certificates curl git ufw openssl gnupg jq >/dev/null
  if ! command -v psql >/dev/null || [[ "$(psql --version | grep -oE '[0-9]+' | head -1)" -lt "$PG_VERSION" ]]; then
    install -d -m 0755 /usr/share/postgresql-common/pgdg
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
http://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo "$VERSION_CODENAME")-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list
    apt-get update -qq
    apt-get install -y -qq "postgresql-client-$PG_VERSION" >/dev/null
  fi
  vert "psql $(psql --version | awk '{print $3}')"

  if ! command -v docker >/dev/null; then
    bleu "Docker"
    curl -fsSL https://get.docker.com | sh >/dev/null
    systemctl enable --now docker
  fi
  docker compose version >/dev/null 2>&1 || mourir "Le greffon « docker compose » manque. Réinstallez Docker depuis get.docker.com."
  vert "$(docker --version | cut -d, -f1) · compose $(docker compose version --short)"

  # ── 2. Mémoire ─────────────────────────────────────────────────────────────
  # La construction de l'image web (Next.js) demande environ 4 Go. En dessous,
  # le noyau tue le processus en pleine compilation, et le message d'erreur ne
  # dit pas pourquoi. Un fichier d'échange évite ce faux mystère.
  ram_mo="$(free -m | awk '/^Mem:/{print $2}')"
  swap_mo="$(free -m | awk '/^Swap:/{print $2}')"
  if [[ "$ram_mo" -lt 4000 && "$swap_mo" -lt 2000 ]]; then
    bleu "Fichier d'échange (RAM : ${ram_mo} Mo)"
    if [[ ! -f /swapfile ]]; then
      fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096 status=none
      chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
      grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
    vert "Échange actif : $(free -m | awk '/^Swap:/{print $2}') Mo"
  fi

  # ── 3. Arborescence ────────────────────────────────────────────────────────
  bleu "Arborescence sous $PROJECT_ROOT"
  mkdir -p "$PROJECT_ROOT"/{prod,recette,dumps,backups,logs}
  # 750 : les secrets des environnements vivent là-dedans.
  chmod 750 "$PROJECT_ROOT" "$PROJECT_ROOT"/{prod,recette,dumps,backups,logs}
  ls -ld "$PROJECT_ROOT"/* | sed 's/^/   /'

  # ── 4. Pare-feu ────────────────────────────────────────────────────────────
  bleu "Pare-feu"
  ufw allow OpenSSH >/dev/null
  ufw allow "$HTTP_PROD/tcp" >/dev/null
  ufw allow "$HTTP_RECETTE/tcp" >/dev/null
  yes | ufw enable >/dev/null 2>&1 || true
  ufw status | sed 's/^/   /'
  jaune "UFW ne filtre PAS les ports publiés par Docker : ses règles passent avant.
   La base n'est donc exposée que parce qu'elle est publiée sur 127.0.0.1 — ne
   changez jamais cela. Pour restreindre un port applicatif par adresse, il
   faut écrire dans la chaîne iptables DOCKER-USER, pas dans UFW."
fi

# ── 5. Secrets ───────────────────────────────────────────────────────────────
bleu "Secrets"
mdp() { openssl rand -base64 24 | tr -d '\n=+/' | cut -c1-24; }

if [[ ! -f "$ENV_PG" ]]; then
  umask 077
  cat > "$ENV_PG" <<FIN
# Serveur PostgreSQL de la machine — généré le $(date -u '+%Y-%m-%d %H:%M UTC').
# Secret : ne jamais versionner, ne jamais copier ailleurs.
PG_VERSION=$PG_VERSION
PG_PORT=$PG_PORT
PG_CONTAINER=$PG_CONTAINER
PG_NETWORK=$PG_NETWORK
PG_VOLUME=$PG_VOLUME
PG_SUPERUSER=$PG_SUPERUSER
PG_SUPERPASS=$(mdp)
FIN
  chmod 600 "$ENV_PG"
  vert "$ENV_PG créé"
else
  jaune "$ENV_PG existe : mot de passe superutilisateur conservé"
fi
set -a; . "$ENV_PG"; set +a

if [[ ! -f "$ENV_DB" ]]; then
  umask 077
  cat > "$ENV_DB" <<FIN
# Bases applicatives — généré le $(date -u '+%Y-%m-%d %H:%M UTC').
# Fichier à charger avant deploy.sh :  set -a; . $ENV_DB; set +a
DB_PROD_NAME=$DB_PROD_NAME
DB_PROD_USER=$DB_PROD_USER
DB_PROD_PASS=${DB_PROD_PASS:-$(mdp)}
DB_REC_NAME=$DB_REC_NAME
DB_REC_USER=$DB_REC_USER
DB_REC_PASS=${DB_REC_PASS:-$(mdp)}
FIN
  chmod 600 "$ENV_DB"
  vert "$ENV_DB créé"
else
  jaune "$ENV_DB existe : mots de passe conservés"
fi
set -a; . "$ENV_DB"; set +a

# ── 6. Serveur PostgreSQL ────────────────────────────────────────────────────
bleu "Serveur PostgreSQL $PG_VERSION"
COMPOSE_PG_CMD=(docker compose --env-file "$ENV_PG" -f "$COMPOSE_PG" --project-directory "$(dirname "$COMPOSE_PG")")
"${COMPOSE_PG_CMD[@]}" up -d

for essai in $(seq 1 30); do
  docker exec "$PG_CONTAINER" pg_isready -U "$PG_SUPERUSER" -d postgres >/dev/null 2>&1 && break
  [[ $essai -eq 30 ]] && { docker logs --tail 40 "$PG_CONTAINER"; mourir "Le serveur ne démarre pas."; }
  sleep 2
done
vert "$PG_CONTAINER prêt · $(docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d postgres -tAc 'SHOW server_version')"

# psql_super <base> [options psql…]
psql_super() {
  local base="$1"; shift
  docker exec -i -e PGPASSWORD="$PG_SUPERPASS" "$PG_CONTAINER" \
    psql -v ON_ERROR_STOP=1 -U "$PG_SUPERUSER" -d "$base" "$@"
}

# ── 7. Bases et propriétaires ────────────────────────────────────────────────
# Un propriétaire par environnement. Le rôle applicatif (soumis au
# Row-Level Security) est créé plus tard par deploy.sh, qui connaît le mot de
# passe tiré dans le .env de l'environnement.
preparer_base() {
  local nom="$1" proprio="$2" motdepasse="$3"
  bleu "Base $nom (propriétaire $proprio)"

  # BYPASSRLS sur le propriétaire : le schéma force le Row-Level Security sur
  # toutes les tables, lui compris. Sans cela, migrations, seed et espace
  # super-admin ne verraient plus aucune ligne.
  psql_super postgres <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$proprio') THEN
    CREATE ROLE $proprio LOGIN;
  END IF;
END \$\$;
ALTER ROLE $proprio WITH LOGIN PASSWORD '$motdepasse' BYPASSRLS;
SQL

  if [[ "$(psql_super postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$nom'")" != "1" ]]; then
    psql_super postgres -c "CREATE DATABASE $nom OWNER $proprio"
    vert "base créée"
  else
    jaune "base existante : conservée"
  fi

  psql_super "$nom" <<SQL
ALTER DATABASE $nom OWNER TO $proprio;
GRANT ALL ON SCHEMA public TO $proprio;
-- Personne d'autre n'a besoin d'y entrer : chaque environnement est clos.
REVOKE ALL ON DATABASE $nom FROM PUBLIC;
GRANT CONNECT ON DATABASE $nom TO $proprio;
SQL
  vert "$nom · $proprio · droits en place"
}

preparer_base "$DB_PROD_NAME" "$DB_PROD_USER" "$DB_PROD_PASS"
preparer_base "$DB_REC_NAME" "$DB_REC_USER" "$DB_REC_PASS"

# Contrôle depuis l'hôte, avec le compte qui servira réellement.
PGPASSWORD="$DB_PROD_PASS" psql -w -h 127.0.0.1 -p "$PG_PORT" -U "$DB_PROD_USER" \
  -d "$DB_PROD_NAME" -tAc 'SELECT 1' >/dev/null \
  || mourir "Connexion impossible à $DB_PROD_NAME depuis l'hôte."
vert "Connexion applicative vérifiée sur 127.0.0.1:$PG_PORT"

# ── Récapitulatif ────────────────────────────────────────────────────────────
cat <<FIN

$(printf '\033[1;32m✔ Socle prêt.\033[0m')

   PostgreSQL     $PG_CONTAINER · réseau $PG_NETWORK · 127.0.0.1:$PG_PORT
   Production     $DB_PROD_NAME / $DB_PROD_USER   → port HTTP $HTTP_PROD
   Recette        $DB_REC_NAME / $DB_REC_USER   → port HTTP $HTTP_RECETTE
   Secrets        $ENV_PG · $ENV_DB   (600, hors Git)

   Étape suivante — clé de déploiement GitHub, puis :

     set -a; . $ENV_DB; set +a
     HTTP_PORT=$HTTP_PROD sudo -E bash $ICI/deploy.sh prod --init
     sudo -E bash $ICI/deploy.sh prod

FIN
