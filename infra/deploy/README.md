# Déploiement VPS — LeadSchool (production + recette)

Deux environnements sur une même machine, sans nom de domaine pour l'instant.
Tout tourne en conteneurs, PostgreSQL compris : un seul serveur pour les deux
environnements, une base et un propriétaire par environnement.

**Première installation : [INSTALLATION.md](INSTALLATION.md)** — d'un VPS
vierge au service en marche. Ce fichier-ci est la référence d'exploitation.

```
/srv/leadschool/
├── prod/        clone Git + .env.prod       → http://IP:8003
├── recette/     clone Git + .env.recette    → http://IP:8080
├── dumps/       fichiers .dump à importer
├── backups/     sauvegardes automatiques
└── logs/        journaux des tâches planifiées
```

| | production | recette |
|---|---|---|
| Dossier | `/srv/leadschool/prod` | `/srv/leadschool/recette` |
| Pile Docker | `leadschool-prod` | `leadschool-recette` |
| Port HTTP | 8003 | 8080 |
| Base | `leadschool_production_db` | `leadschool_recette_db` |
| Rappels automatiques | oui | **non** (aucun message aux familles) |

Chaque pile a ses propres conteneurs, volumes, stockage Garage et secrets.
Elles ne partagent que l'hôte et le serveur PostgreSQL.

## Installation

Décrite pas à pas dans [INSTALLATION.md](INSTALLATION.md). En résumé, deux
commandes :

```bash
# 1. Socle de la machine : paquets, arborescence, pare-feu, PostgreSQL, bases
sudo -E bash infra/deploy/scripts/bootstrap-host.sh

# 2. Application (après la clé de déploiement GitHub)
set -a; . /srv/leadschool/.db-credentials; set +a
HTTP_PORT=8003 sudo -E bash infra/deploy/scripts/deploy.sh prod --init
sudo -E bash infra/deploy/scripts/deploy.sh prod
```

## Utilisation courante

```bash
D=/srv/leadschool/prod/infra/deploy/scripts/deploy.sh

bash $D prod --pull              # mise à jour : git pull + build + migrations + bascule
bash $D prod --status            # état des conteneurs
bash $D prod --logs              # journaux en direct
bash $D prod --stop              # arrêt de la pile
bash $D recette --seed           # jeu de démonstration (vide la base, demande confirmation)
bash $D recette --import /srv/leadschool/dumps/base.dump
```

Le script enchaîne toujours : contrôles → rôle applicatif → build → stockage →
import éventuel → migrations → RLS → rôles système → bascule → santé. Les
migrations passent **avant** le démarrage de la nouvelle version : si elles
échouent, l'ancienne reste en service.

## Schéma de base et migrations

Le développement s'est fait avec `prisma db push` : il n'existait donc
aucune migration, et une base de production restait vide. Le dépôt porte
maintenant une migration de référence, `0_init`, générée depuis le schéma et
vérifiée comme identique à la base de développement (132 tables).

- **Base vierge** (production, recette) : `migrate deploy` crée tout.
- **Base déjà peuplée** (dump restauré, `db push`) : le script la rattache à
  `0_init` sans rien réexécuter, puis applique les migrations suivantes.

Les évolutions de schéma passeront désormais par `prisma migrate dev`, pour
que production et recette se mettent à jour sans intervention manuelle.

## Importer votre base de développement

Sur le poste de développement :

```bash
docker exec jawal-postgres pg_dump -U jawal -d jawal -Fc -Z6 -f /tmp/base.dump
docker cp jawal-postgres:/tmp/base.dump .
scp base.dump root@IP_DU_VPS:/srv/leadschool/dumps/
```

Sur le VPS :

```bash
bash $D recette --import /srv/leadschool/dumps/base.dump   # essayer en recette d'abord
bash $D prod   --import /srv/leadschool/dumps/base.dump
```

Le script prend un filet de sécurité avant d'écraser, vide le schéma, restaure,
puis rejoue les migrations.

**Les fichiers ne sont pas dans le dump** (photos, pièces jointes, logos). Pour
les copier, ouvrez un tunnel vers le Garage de l'environnement visé — son port
n'est pas publié :

```bash
# Depuis le poste : récupérer la clé S3 de l'environnement
ssh root@IP_DU_VPS "grep -E '^S3_(ACCESS|SECRET|BUCKET)' /srv/leadschool/prod/.env.prod"
ssh -L 9900:localhost:3900 root@IP_DU_VPS   # laisser ouvert
# Dans une autre fenêtre
mc alias set src http://127.0.0.1:9000 <cle-dev> <secret-dev>
mc alias set dst http://127.0.0.1:9900 <cle-prod> <secret-prod>
mc mirror src/jawal-dev dst/leadschool-prod
```

Le tunnel ne marche que si le port Garage est exposé à l'hôte ; sinon, passez
par `docker exec` sur le conteneur `leadschool-prod-garage`.

## Sauvegardes

```bash
bash /srv/leadschool/prod/infra/deploy/scripts/backup.sh prod
bash /srv/leadschool/prod/infra/deploy/scripts/backup.sh recette
```

À planifier (`crontab -e`) :

```cron
15 3 * * * bash /srv/leadschool/prod/infra/deploy/scripts/backup.sh prod    >> /srv/leadschool/logs/backup.log 2>&1
45 3 * * 0 bash /srv/leadschool/prod/infra/deploy/scripts/backup.sh recette >> /srv/leadschool/logs/backup.log 2>&1
```

Les sauvegardes restent sur le disque du VPS : copiez-les ailleurs (`rsync`,
stockage objet distant), sinon une panne disque emporte tout.

## Sécurité : ce qui n'est pas réglé

1. **HTTP sans certificat.** Mots de passe et sessions en clair. À réserver aux
   tests internes jusqu'à la pose d'un domaine et de HTTPS.
2. **Row-Level Security.** Le schéma force RLS sur toutes les tables, y compris
   pour le propriétaire. Le script met donc le compte applicatif sous
   politiques (`NOBYPASSRLS`) et accorde `BYPASSRLS` au compte d'administration,
   dont les migrations et l'espace super-admin ont besoin. Cette opération
   demande un accès superutilisateur : si `sudo -u postgres` n'est pas
   disponible, le script affiche le SQL exact à exécuter.
3. **Mots de passe de base dans `.env.<env>`** (600, non versionnés). Ils ne
   figurent nulle part dans le dépôt Git — c'est pour cela que `--init` les
   demande en variable d'environnement.
4. **Comptes de démonstration** (`admin@demo.jawal.ma` / `demo1234`…) : mots de
   passe publics. À supprimer avant tout usage réel.
