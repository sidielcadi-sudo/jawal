#!/bin/sh
# Amorçage de Garage : disposition du cluster, clé d'accès, bucket.
#
# Passe par l'API d'administration v2 : l'image Garage ne contient que son
# binaire, aucun shell pour y lancer un script.
#
# Idempotent : relancé sur un cluster en place, il constate et sort.
set -eu

HOTE="${GARAGE_HOST:-garage}"
RACINE="http://${HOTE}:3903"
ADMIN="$RACINE/v2"
ENTETE="Authorization: Bearer ${GARAGE_ADMIN_TOKEN}"
CLE="${S3_ACCESS_KEY}"
SECRET="${S3_SECRET_KEY}"
BUCKET="${S3_BUCKET}"

# L'API rend du JSON indenté : on l'aplatit avant d'y chercher des champs.
plat() {
  tr -d '[:space:]'
}

champ() {
  sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p" | head -n 1
}

poster() {
  curl -sf -X POST -H "$ENTETE" -H 'Content-Type: application/json' -d "$2" "$ADMIN/$1"
}

attendre() {
  essai=0
  while [ "$essai" -lt 60 ]; do
    if curl -sf -H "$ENTETE" "$ADMIN/GetClusterStatus" >/dev/null 2>&1; then
      return 0
    fi
    essai=$((essai + 1))
    sleep 1
  done
  echo "Garage n'a pas répondu en 60 s." >&2
  exit 1
}

# Garage n'accepte que ses propres formats : `GK` + 24 hex, secret de 64 hex.
case "$CLE" in
  GK????????????????????????) ;;
  *)
    echo "S3_ACCESS_KEY doit valoir GK suivi de 24 chiffres hexadécimaux (reçu : $CLE)." >&2
    exit 1
    ;;
esac

attendre

NOEUD=$(curl -sf -H "$ENTETE" "$ADMIN/GetClusterStatus" | plat | champ id)
if [ -z "$NOEUD" ]; then
  echo "Identifiant de nœud introuvable." >&2
  exit 1
fi

# ── Disposition ── un nœud sans capacité assignée refuse les écritures.
LAYOUT=$(curl -sf -H "$ENTETE" "$ADMIN/GetClusterLayout" | plat)
VERSION=$(echo "$LAYOUT" | sed -n 's/.*"version":\([0-9]*\).*/\1/p' | head -n 1)

case "$LAYOUT" in
  *'"roles":[]'*)
    poster UpdateClusterLayout \
      "{\"roles\":[{\"id\":\"$NOEUD\",\"zone\":\"dev\",\"capacity\":${GARAGE_CAPACITY:-10000000000},\"tags\":[]}]}" >/dev/null
    poster ApplyClusterLayout "{\"version\":$((VERSION + 1))}" >/dev/null
    echo "Disposition appliquée sur le nœud ${NOEUD}."
    ;;
  *)
    echo "Disposition déjà en place (version ${VERSION})."
    ;;
esac

# ── Clé d'accès ── importée depuis l'env pour survivre à `infra:reset`.
if curl -sf -H "$ENTETE" "$ADMIN/GetKeyInfo?id=$CLE" >/dev/null 2>&1; then
  echo "Clé ${CLE} déjà présente."
else
  poster ImportKey \
    "{\"name\":\"${BUCKET}\",\"accessKeyId\":\"$CLE\",\"secretAccessKey\":\"$SECRET\"}" >/dev/null
  echo "Clé ${CLE} importée."
fi

# ── Bucket ──
REPONSE=$(curl -sf -H "$ENTETE" "$ADMIN/GetBucketInfo?globalAlias=$BUCKET" 2>/dev/null | plat || true)
ID=$(echo "$REPONSE" | champ id)

if [ -z "$ID" ]; then
  REPONSE=$(poster CreateBucket "{\"globalAlias\":\"$BUCKET\"}" | plat)
  ID=$(echo "$REPONSE" | champ id)
  echo "Bucket ${BUCKET} créé."
else
  echo "Bucket ${BUCKET} déjà présent."
fi

if [ -z "$ID" ]; then
  echo "Bucket sans identifiant : $REPONSE" >&2
  exit 1
fi

# Droits reposés à chaque démarrage (idempotent côté Garage).
poster AllowBucketKey \
  "{\"bucketId\":\"$ID\",\"accessKeyId\":\"$CLE\",\"permissions\":{\"read\":true,\"write\":true,\"owner\":true}}" >/dev/null

echo "Stockage prêt : bucket ${BUCKET}, clé ${CLE}."
