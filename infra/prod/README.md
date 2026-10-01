# Déploiement VPS — Jawal / LeadSchool

Pile mono-machine, **sans nom de domaine** : l'application répond sur l'IP
publique du VPS, en HTTP. Tout tourne en conteneurs ; seul nginx publie un
port (80).

```
Internet ─▶ :80 nginx ─▶ web:3000 (Next.js 15) ─┬─▶ postgres:5432
                                                 ├─▶ redis:6379
                                                 ├─▶ garage:3900  (S3)
                                                 └─▶ solver:8000  (OR-Tools + FET)
                                   cron ─▶ web   (rappels quotidiens, 02h15)
```

## Prérequis

- VPS Debian 12 / Ubuntu 22.04+, **4 Go de RAM minimum** (le build Next et le
  solveur sont gourmands ; 2 Go suffisent à faire échouer le build) ;
- 20 Go de disque ;
- accès SSH root ou sudo ;
- une clé SSH autorisée sur le dépôt GitHub (déploiement par `git clone`).

## Première installation

```bash
# 1. Clé de déploiement (sur le VPS)
ssh-keygen -t ed25519 -C "vps-jawal" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub        # → GitHub ▸ Settings ▸ Deploy keys (lecture seule)

# 2. Code
sudo mkdir -p /opt && cd /opt
git clone git@github.com:sidielcadi-sudo/jawal.git
cd jawal

# 3. Préparation de la machine (Docker, pare-feu, secrets)
sudo bash infra/prod/scripts/bootstrap-vps.sh

# 4. Relire .env.prod — surtout APP_URL (IP publique)
nano .env.prod

# 5. Déploiement
bash infra/prod/scripts/deploy.sh
```

L'application répond ensuite sur `http://IP_DU_VPS`.

Pour partir avec le jeu de démonstration (collège, 150 élèves, comptes
`@demo.jawal.ma`) : `bash infra/prod/scripts/deploy.sh --seed`. **La base est
vidée** ; le script demande confirmation.

## Mises à jour

```bash
cd /opt/jawal
bash infra/prod/scripts/deploy.sh --pull
```

Enchaîne : `git pull` → build → `prisma migrate deploy` → RLS → bascule des
conteneurs → vérification de `/api/health`. Les migrations passent avant la
bascule : si elles échouent, l'ancienne version reste en service.

## Sauvegardes

```bash
bash infra/prod/scripts/backup.sh            # base + fichiers → /var/backups/jawal
bash infra/prod/scripts/restore-db.sh f.dump # restauration (demande confirmation)
```

À planifier sur l'hôte, pas dans un conteneur :

```cron
15 3 * * * bash /opt/jawal/infra/prod/scripts/backup.sh >> /var/log/jawal-backup.log 2>&1
```

La base et les fichiers sont **deux sauvegardes distinctes** : un dump SQL seul
laisse des photos et des pièces jointes introuvables.

## Reprendre la base d'une autre machine

```bash
# Poste source
docker exec jawal-postgres pg_dump -U jawal -d jawal -Fc -Z6 -f /tmp/jawal.dump
docker cp jawal-postgres:/tmp/jawal.dump .
scp jawal.dump root@IP_VPS:/tmp/

# VPS
bash infra/prod/scripts/restore-db.sh /tmp/jawal.dump
```

Puis recopier les fichiers (sinon photos et documents cassés) :

```bash
mc alias set src http://127.0.0.1:9000 <cle-dev> <secret-dev>     # poste
mc alias set dst http://IP_VPS:3900    <cle-prod> <secret-prod>   # VPS (port fermé par défaut)
mc mirror src/jawal-dev dst/jawal-prod
```

Le port S3 n'étant pas publié, ouvrir un tunnel le temps de la copie :
`ssh -L 9900:localhost:3900 root@IP_VPS`, puis viser `http://127.0.0.1:9900`.

## Exploitation

```bash
cd /opt/jawal
C="docker compose -f infra/prod/docker-compose.prod.yml --env-file .env.prod"

$C ps                      # état des services
$C logs -f web             # journaux applicatifs
$C logs --since 24h cron   # exécution des rappels quotidiens
$C restart web             # redémarrage simple
$C exec postgres psql -U jawal -d jawal   # accès SQL
```

Déclencher un cron à la main :

```bash
source .env.prod
$C exec web curl -fsS -X POST -H "X-Cron-Secret: $CRON_SECRET" \
  http://127.0.0.1:3000/api/cron/payment-reminders
```

## Limites assumées de cette configuration

1. **HTTP sans TLS.** Mots de passe et sessions circulent en clair. Acceptable
   pour une recette interne, pas pour de vraies familles. Dès qu'un domaine
   existe : certificat Let's Encrypt, redirection 80 → 443, HSTS.
2. **Un seul nœud Garage**, `replication_factor = 1` : aucune redondance des
   fichiers. La sauvegarde est la seule protection.
3. **Postgres sur la même machine** que l'application : une panne disque emporte
   les deux. Sauvegarder hors du VPS (objet distant, autre machine).
4. **Pas d'envoi d'e-mail par défaut** (`NOTIFY_DRIVER=log`) : les rappels sont
   journalisés, pas envoyés, tant qu'un relais SMTP n'est pas configuré.
5. **Comptes de démonstration** : si vous avez seedé, `admin@demo.jawal.ma` et
   consorts existent avec des mots de passe connus et publiés. À supprimer ou à
   changer avant d'ouvrir l'accès à qui que ce soit.
