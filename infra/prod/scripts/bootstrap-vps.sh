#!/usr/bin/env bash
# Préparation d'un VPS Debian/Ubuntu neuf pour héberger Jawal.
#
# À lancer UNE FOIS, en root, après un `git clone` du dépôt :
#   sudo bash infra/prod/scripts/bootstrap-vps.sh
#
# Ce script installe Docker, pose le pare-feu, génère .env.prod avec des
# secrets aléatoires, puis s'arrête : le déploiement lui-même est fait par
# scripts/deploy.sh, pour que les deux opérations restent séparables.
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_PROD="$RACINE/.env.prod"
MODELE="$RACINE/infra/prod/.env.prod.example"

info() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
avert() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }

[[ $EUID -eq 0 ]] || { echo "À lancer en root (sudo)."; exit 1; }

# ── Docker ────────────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  info "Installation de Docker"
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl git ufw
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc 2>/dev/null \
    || curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  info "Docker déjà installé ($(docker --version))"
fi

# ── Pare-feu ──────────────────────────────────────────────────────────────
# Seuls SSH et HTTP sont ouverts. Postgres, Redis, Garage et le solveur ne
# sont joignables que depuis le réseau Docker interne.
info "Pare-feu : SSH + HTTP"
ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp
ufw allow 80/tcp
ufw --force enable
ufw status verbose | sed 's/^/   /'

# ── Fichier d'environnement ───────────────────────────────────────────────
if [[ -f "$ENV_PROD" ]]; then
  avert ".env.prod existe déjà : laissé tel quel."
else
  info "Génération de .env.prod (secrets aléatoires)"
  cp "$MODELE" "$ENV_PROD"
  ip_pub="$(curl -fsS --max-time 5 https://api.ipify.org || echo '')"
  secret() { openssl rand -base64 32 | tr -d '\n='; }
  hexa() { openssl rand -hex 32; }

  remplir() { sed -i "s|^$1=.*|$1=$2|" "$ENV_PROD"; }
  remplir AUTH_SECRET "$(secret)"
  remplir CRON_SECRET "$(secret)"
  remplir POSTGRES_PASSWORD "$(secret)"
  remplir APP_DB_PASSWORD "$(secret)"
  remplir GARAGE_RPC_SECRET "$(hexa)"
  remplir GARAGE_ADMIN_TOKEN "$(hexa)"
  remplir S3_ACCESS_KEY "GK$(openssl rand -hex 12)"
  remplir S3_SECRET_KEY "$(hexa)"
  [[ -n "$ip_pub" ]] && remplir APP_URL "http://$ip_pub"

  chmod 600 "$ENV_PROD"
  info "Secrets générés. APP_URL = $(grep '^APP_URL=' "$ENV_PROD")"
  avert "Vérifiez APP_URL (IP publique du VPS) avant de déployer."
fi

cat <<'FIN'

✔ VPS prêt.

Suite :
  1. Relire et compléter .env.prod (APP_URL, SMTP si besoin)
  2. bash infra/prod/scripts/deploy.sh
FIN
