# LeadSchool — installation d'un environnement de production

Procédure complète, d'un VPS vierge à l'application en service. Comptez
**45 minutes**, dont 20 à 25 de compilation sans intervention.

Deux scripts font le travail, dans cet ordre :

| | Rôle | Où tourne-t-il |
|---|---|---|
| `bootstrap-host.sh` | Socle : paquets, arborescence, pare-feu, serveur PostgreSQL, bases et propriétaires | Une fois par machine |
| `deploy.sh` | Application : clone, secrets, images, migrations, RLS, démarrage | À chaque mise en service et chaque mise à jour |

Les deux sont idempotents : les relancer ne casse rien et ne régénère aucun
secret déjà écrit.

---

## 0. Ce que vous obtenez

```
                       Internet
                          │  port 8003 (prod) · 8080 (recette)
                    ┌─────▼─────┐
                    │   nginx   │  tampons d'en-tête, X-Forwarded-*
                    └─────┬─────┘
          ┌───────────────┼───────────────┬──────────────┐
      ┌───▼───┐      ┌────▼────┐     ┌────▼────┐    ┌────▼────┐
      │  web  │      │ solver  │     │ garage  │    │  redis  │
      │ Next  │      │ OR-Tools│     │   S3    │    │  cache  │
      └───┬───┘      └─────────┘     └─────────┘    └─────────┘
          │ réseau « leadschool-db »
    ┌─────▼──────┐
    │ postgres18 │  127.0.0.1:5436 — jamais exposé à Internet
    └────────────┘
```

```
/srv/leadschool/
├── prod/              clone Git + .env.prod
├── recette/           clone Git + .env.recette
├── dumps/             fichiers .dump à importer
├── backups/           sauvegardes (14 jours de rétention)
├── logs/              journaux des tâches planifiées
├── .postgres.env      superutilisateur du serveur       (600)
└── .db-credentials    bases et propriétaires            (600)
```

| | production | recette |
|---|---|---|
| Dossier | `/srv/leadschool/prod` | `/srv/leadschool/recette` |
| Pile Docker | `leadschool-prod` | `leadschool-recette` |
| Port HTTP | 8003 | 8080 |
| Base | `leadschool_production_db` | `leadschool_recette_db` |
| Rappels automatiques | oui | **non** — aucun message ne part aux familles |

Les deux piles ont leurs propres conteneurs, volumes, stockage et secrets.
Elles ne partagent que la machine et le serveur PostgreSQL, où chacune a sa
base et son propriétaire.

---

## 1. Avant de commencer

**La machine**

- Ubuntu 22.04 ou 24.04, 64 bits.
- 2 vCPU, **4 Go de RAM**, 40 Go de disque. En dessous de 4 Go, le script
  ajoute 4 Go de fichier d'échange : la compilation de l'image web en demande
  autant, et sans cela le noyau tue le processus en pleine construction, avec
  un message qui n'explique rien.
- Accès `ssh` avec `sudo`.

**À noter avant de commencer** — vous en aurez besoin plus bas :

```
Adresse IP publique      ……………………
Port HTTP production     8003
Port HTTP recette        8080
Dépôt Git                git@github.com:sidielcadi-sudo/jawal.git
```

**Ce que l'installation ne couvre pas** : le nom de domaine et le certificat
HTTPS. Sans eux, les mots de passe circulent en clair et les cookies de
session sont partagés entre toutes les applications qui tournent sur la même
adresse IP, quel que soit le port — c'est la cause des incidents
« Request Header Or Cookie Too Large ». Réservez cette installation aux tests
internes jusqu'à la pose d'un domaine (§ 10).

---

## 2. Récupérer les scripts

Le socle doit exister avant le clone définitif : on amorce avec un clone
temporaire, que l'on jette ensuite.

```bash
sudo apt-get update && sudo apt-get install -y git
git clone --depth 1 https://github.com/sidielcadi-sudo/jawal.git /tmp/jawal-amorce
```

> Dépôt privé ? Posez d'abord la clé de déploiement (§ 4), puis clonez en SSH.

---

## 3. Le socle hôte

```bash
sudo -E bash /tmp/jawal-amorce/infra/deploy/scripts/bootstrap-host.sh
```

Ce qu'il fait, dans l'ordre :

1. **Paquets** : `git`, `curl`, `ufw`, `openssl`, `jq`, Docker avec son greffon
   Compose, et le client `postgresql-client-18` depuis le dépôt officiel
   PostgreSQL. La version du client doit être supérieure ou égale à celle du
   serveur, sinon `pg_dump` refuse de travailler — le paquet d'Ubuntu est trop
   ancien.
2. **Fichier d'échange** si la machine a moins de 4 Go de RAM.
3. **Arborescence** `/srv/leadschool/…` en 750.
4. **Pare-feu** : SSH, 8003, 8080.
5. **Secrets** : `/srv/leadschool/.postgres.env` et
   `/srv/leadschool/.db-credentials`, en 600, hors de Git.
6. **Serveur PostgreSQL 18** en conteneur (`docker-compose.postgres.yml`),
   publié sur `127.0.0.1:5436` seulement, sur le réseau `leadschool-db`.
7. **Bases et propriétaires** : `leadschool_production_db` et
   `leadschool_recette_db`, chacune avec son rôle propriétaire en
   `BYPASSRLS` — le schéma force le Row-Level Security sur toutes les tables,
   propriétaire compris, et sans cette exception les migrations et l'espace
   super-admin ne verraient plus une seule ligne.

Il affiche à la fin les noms, les ports et l'emplacement des secrets.
Vérification à tout moment, sans rien modifier :

```bash
sudo bash /tmp/jawal-amorce/infra/deploy/scripts/bootstrap-host.sh --status
```

**Pour imposer vos propres mots de passe** plutôt que ceux tirés au hasard,
passez-les à la première exécution — ils ne sont plus régénérés ensuite :

```bash
sudo -E env DB_PROD_PASS='…' DB_REC_PASS='…' \
  bash /tmp/jawal-amorce/infra/deploy/scripts/bootstrap-host.sh
```

> **La base ne doit jamais être publiée sur `0.0.0.0`.** Docker écrit ses
> règles iptables *avant* UFW : un port publié sur toutes les interfaces est
> accessible depuis Internet même avec le pare-feu actif. Les conteneurs
> applicatifs n'en ont pas besoin — ils rejoignent le réseau `leadschool-db` et
> visent le serveur par son nom, sur le port interne 5432.

---

## 4. Clé de déploiement GitHub

`deploy.sh` clone en SSH, pour pouvoir se mettre à jour sans mot de passe.

```bash
sudo ssh-keygen -t ed25519 -C "vps-leadschool" -f /root/.ssh/id_ed25519 -N ""
sudo cat /root/.ssh/id_ed25519.pub
```

Collez la clé dans **GitHub ▸ dépôt ▸ Settings ▸ Deploy keys ▸ Add deploy key**,
en **lecture seule** (ne cochez pas « Allow write access » : la machine n'a
aucune raison de pousser du code). Puis :

```bash
sudo ssh -T git@github.com     # « successfully authenticated » attendu
```

---

## 5. Initialiser la production

```bash
set -a; . /srv/leadschool/.db-credentials; set +a
HTTP_PORT=8003 sudo -E bash /tmp/jawal-amorce/infra/deploy/scripts/deploy.sh prod --init
```

`--init` clone le dépôt dans `/srv/leadschool/prod` et génère
`/srv/leadschool/prod/.env.prod` (permissions 600) : secret de session, secret
des tâches planifiées, clés Garage, mot de passe du rôle applicatif. Tout est
tiré au hasard et n'existe nulle part ailleurs.

**Relisez trois lignes avant d'aller plus loin :**

```bash
sudo grep -E '^(APP_URL|HTTP_PORT|NOTIFY_DRIVER)=' /srv/leadschool/prod/.env.prod
```

| Ligne | Attendu | Pourquoi |
|---|---|---|
| `APP_URL` | `http://VOTRE_IP:8003` | Sert à fabriquer les liens des courriels et des paiements. Le port doit y figurer. |
| `HTTP_PORT` | `8003` | Port publié par nginx. S'il change, `APP_URL` doit changer aussi. |
| `NOTIFY_DRIVER` | `log` au départ | Tant qu'il vaut `log`, **aucun courriel ne part**. À passer à `smtp` seulement quand les lignes `SMTP_*` sont renseignées et que vous voulez réellement écrire aux familles. |

Le clone temporaire a fini son office :

```bash
rm -rf /tmp/jawal-amorce
D=/srv/leadschool/prod/infra/deploy/scripts/deploy.sh
```

---

## 6. Premier déploiement

```bash
sudo -E bash $D prod
```

Le script enchaîne, et s'arrête à la première anomalie :

```
contrôles → détection du serveur PostgreSQL → rôle applicatif (RLS)
→ construction des images → stockage et cache → migrations Prisma
→ politiques RLS et droits → rôles système → démarrage → contrôle de santé
```

Deux points à retenir :

- **Les migrations passent avant la bascule.** Si elles échouent, la version
  précédente reste en service.
- **Le rôle applicatif est `NOBYPASSRLS`.** C'est lui que l'application
  utilise, et il reste soumis aux politiques de cloisonnement par
  établissement. Le propriétaire, lui, garde `BYPASSRLS` pour les migrations.

Compter 15 à 25 minutes la première fois (téléchargement de Chromium, qui sert
à produire les PDF, puis compilation). Les fois suivantes : 3 à 5 minutes.

La dernière ligne doit être :

```
✔ Santé : {"status":"ok"}
✔ prod déployé — http://VOTRE_IP:8003
```

---

## 7. Mettre des données

Au choix — **une seule** des deux voies.

### a. Jeu de démonstration

```bash
sudo -E bash $D prod --seed       # demande confirmation : il VIDE la base
```

Crée des établissements, des classes, des élèves et les comptes de
démonstration. Mots de passe publics, documentés dans le dépôt : à supprimer
avant tout usage réel.

### b. Reprise d'une base existante

Sur le poste de développement :

```bash
docker exec jawal-postgres pg_dump -U jawal -d jawal -Fc -Z6 -f /tmp/base.dump
docker cp jawal-postgres:/tmp/base.dump .
scp base.dump ubuntu@VOTRE_IP:/srv/leadschool/dumps/
```

Sur le VPS — **en recette d'abord**, la production ensuite :

```bash
sudo -E bash $D recette --import /srv/leadschool/dumps/base.dump
sudo -E bash $D prod    --import /srv/leadschool/dumps/base.dump
```

Le script prend une sauvegarde de filet avant d'écraser quoi que ce soit, vide
le schéma, restaure, rattache la base à la migration de référence `0_init`,
puis applique les migrations suivantes.

**Les fichiers ne sont pas dans le dump** (photos, pièces jointes, logos) : ils
vivent dans Garage. Pour les reprendre, voir la section « Importer votre base
de développement » du [README](README.md).

---

## 8. Vérifier

```bash
curl -s http://127.0.0.1:8003/api/health          # {"status":"ok"}
sudo -E bash $D prod --status                     # tous les conteneurs « healthy »
```

Puis au navigateur, sur `http://VOTRE_IP:8003/fr`, **en navigation privée** —
un navigateur qui a servi aux essais garde des cookies trop gros, et le serveur
répond alors `400 Request Header Or Cookie Too Large`.

Contrôles fonctionnels à faire une fois : connexion d'un compte
administrateur, affichage d'une liste d'élèves, ouverture d'une photo (vérifie
Garage), génération d'un PDF (vérifie Chromium), et une génération d'emploi du
temps (vérifie le solveur).

---

## 9. La recette

Même chose, en changeant le mot :

```bash
set -a; . /srv/leadschool/.db-credentials; set +a
HTTP_PORT=8080 sudo -E bash $D recette --init
sudo -E bash $D recette
```

Les rappels automatiques y sont **désactivés** : une recette ne doit jamais
écrire aux familles. C'est le script qui le garantit, pas une case à cocher.

---

## 10. Sauvegardes

```bash
sudo bash /srv/leadschool/prod/infra/deploy/scripts/backup.sh prod
```

Base (`pg_dump -Fc`) et fichiers Garage, dans `/srv/leadschool/backups`,
14 jours de rétention. À planifier (`sudo crontab -e`) :

```cron
15 3 * * * bash /srv/leadschool/prod/infra/deploy/scripts/backup.sh prod    >> /srv/leadschool/logs/backup.log 2>&1
45 3 * * 0 bash /srv/leadschool/prod/infra/deploy/scripts/backup.sh recette >> /srv/leadschool/logs/backup.log 2>&1
```

**Une sauvegarde qui reste sur la machine sauvegardée ne sauvegarde rien** :
copiez-la ailleurs (`rsync` vers un autre hôte, stockage objet distant). Et
testez une restauration en recette — une sauvegarde jamais restaurée est une
hypothèse, pas une garantie.

---

## 11. Exploitation courante

```bash
D=/srv/leadschool/prod/infra/deploy/scripts/deploy.sh

sudo -E bash $D prod --pull      # mise à jour : git pull + build + migrations + bascule
sudo -E bash $D prod --status    # état des conteneurs
sudo -E bash $D prod --logs      # journaux en direct
sudo -E bash $D prod --stop      # arrêt de la pile
```

Une modification de code exige une **reconstruction** : `--pull` s'en charge.
Modifier seulement `nginx.conf` suffit en revanche à un
`docker compose … up -d --force-recreate nginx`, la configuration étant montée
dans le conteneur.

---

## 12. Dépannage

Incidents réellement rencontrés sur cette installation, et leur cause.

| Symptôme | Cause | Geste |
|---|---|---|
| `Postgres n'est pas joignable DEPUIS un conteneur` | Le port de la base n'est publié que sur `127.0.0.1` : la passerelle Docker ne le voit pas | Rien à faire : `deploy.sh` détecte le conteneur, rejoint son réseau et vise le port interne 5432. Vérifiez `PG_NETWORK` dans `.env.prod` |
| `role "…_app" does not exist` | Le SQL privilégié est parti sur un **autre** serveur PostgreSQL (celui de l'hôte, via `sudo -u postgres`) | Corrigé : le script s'adresse d'abord au superutilisateur **du conteneur**. Si un cluster hôte traîne, désinstallez-le |
| `No migration found in prisma/migrations` | Base vierge sans historique | Corrigé par la migration de référence `0_init` |
| Rien ne répond sur le port | La pile publie un autre port | `grep HTTP_PORT .env.prod`, et `sudo ufw allow <port>/tcp` |
| `400 Request Header Or Cookie Too Large` | Les cookies ignorent le port : toutes les applications de la même IP les partagent | Navigation privée pour l'instant ; un domaine règle le problème définitivement |
| `502 Bad Gateway`, nginx `unhealthy` | nginx ne partageait pas le réseau de `web`, ou le nom `web` existe aussi sur le réseau de la base | Corrigé : `web` porte l'alias `app-jawal` sur le réseau de la pile, que nginx seul utilise |
| `502 upstream sent too big header` | Les tampons de **réponse** sont distincts de ceux de requête | Corrigé : `proxy_buffer_size` / `proxy_buffers` dans `nginx.conf` |
| `500` + `Failed to proxy …` + `HPE_HEADER_OVERFLOW` | `AUTH_URL` faisait remplacer l'origine de la requête par next-auth ; au moindre écart avec l'en-tête `Host`, next-intl renvoyait une réécriture absolue que Next proxifiait vers lui-même, en boucle | Corrigé : plus d'`AUTH_URL`, `AUTH_TRUST_HOST=true`, et nginx conserve le port dans `Host` (`$http_host`) |
| Construction tuée sans message | Mémoire insuffisante | `free -m` ; `bootstrap-host.sh` ajoute 4 Go d'échange |

Journaux utiles :

```bash
C="docker compose -f /srv/leadschool/prod/infra/deploy/docker-compose.stack.yml \
   --env-file /srv/leadschool/prod/.env.prod \
   --project-directory /srv/leadschool/prod/infra/deploy"

$C logs --since 5m web
$C logs --since 5m nginx
docker logs --tail 50 leadschool-postgres
```

---

## 13. Avant d'ouvrir au public

Par ordre d'importance.

1. **Un domaine et HTTPS.** Tout le reste en dépend : sans certificat, mots de
   passe et sessions circulent en clair, et les cookies restent partagés entre
   les applications d'une même adresse IP. Avec un domaine, posez
   `nginx` + Let's Encrypt devant la pile, mettez `APP_URL=https://…` et
   `ROOT_DOMAIN`, puis redéployez.
2. **Supprimer les comptes de démonstration.** Leurs mots de passe sont
   publics et figurent dans le dépôt.
3. **Courriels** : renseigner `SMTP_*`, puis `NOTIFY_DRIVER=smtp`. Tant que la
   valeur est `log`, rien ne part — vérifiez-le avant une mise en service, et
   après.
4. **Sauvegardes hors machine**, et une restauration de test en recette.
5. **Sauvegarder les secrets ailleurs** : `.env.prod`, `.postgres.env`,
   `.db-credentials`. Perdus, ils ne se retrouvent pas — les données de Garage
   deviennent illisibles et les sessions invalides.
6. **Mises à jour système** : `unattended-upgrades` pour les correctifs de
   sécurité, redémarrage planifié.
7. **Surveillance** : au minimum une alerte sur `/api/health` et sur le disque.

---

## Annexe — les fichiers

| Fichier | Rôle |
|---|---|
| `scripts/bootstrap-host.sh` | Socle de la machine : paquets, arborescence, pare-feu, PostgreSQL, bases |
| `docker-compose.postgres.yml` | Le serveur PostgreSQL 18, partagé par les deux environnements |
| `scripts/deploy.sh` | Déploiement d'un environnement, de bout en bout |
| `scripts/backup.sh` | Sauvegarde base + fichiers, 14 jours de rétention |
| `docker-compose.stack.yml` | La pile applicative : nginx, web, solver, garage, redis, cron |
| `Dockerfile.web` | Image de l'application (Next.js + Chromium pour les PDF) |
| `nginx.conf` | Proxy : tampons d'en-tête, `X-Forwarded-*`, WebSocket |
| `run-crons.sh` | Tâches planifiées internes (production seulement) |
| `README.md` | Référence d'exploitation : options, imports, Garage, sécurité |
