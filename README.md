# Jawal

> Plateforme SaaS multi-tenant de gestion intégrée d'établissement scolaire.
> K-12 · Enseignement supérieur · Formation professionnelle. Maghreb (Maroc prioritaire).

## Démarrage rapide

### Prérequis

- **Node.js** ≥ 22 (voir `.nvmrc`)
- **pnpm** ≥ 9 (`npm install -g pnpm`)
- **Docker Desktop** (pour Postgres, Redis, Garage, Mailpit)

### Installation

```bash
# 1. Cloner et installer
pnpm install

# 2. Variables d'environnement
cp .env.example .env

# 3. Lancer l'infra dev (Postgres + Redis + Garage + Mailpit)
pnpm infra:up

# 4. Migrer la base et seed
pnpm db:migrate
pnpm db:seed

# 5. Lancer l'application
pnpm dev
```

L'app web démarre sur http://localhost:3000.
Mailpit UI : http://localhost:8025 · API admin Garage : http://localhost:9001 (bucket et clé posés par `garage-init`).

### Scripts utiles

| Commande | Description |
|---|---|
| `pnpm dev` | Démarre tous les apps en mode dev |
| `pnpm build` | Build de production |
| `pnpm lint` / `pnpm typecheck` | Qualité de code |
| `pnpm test` / `pnpm test:e2e` | Tests unitaires / e2e |
| `pnpm db:studio` | Prisma Studio (UI BDD) |
| `pnpm db:migrate` | Applique les migrations |
| `pnpm db:seed` | Seed des données de démo |
| `pnpm infra:up` / `:down` / `:logs` / `:reset` | Gestion de l'infra dev |

## Structure du monorepo

```
jawal/
├── apps/
│   └── web/                # Next.js 15 — portails web (admin, parent, élève, prof)
├── packages/
│   ├── db/                 # Prisma — schéma + client + migrations + seed
│   ├── ui/                 # Design system partagé (shadcn/ui)
│   ├── shared/             # Types, Zod schemas, utils partagés front/back
│   └── config/             # Configs partagées (TS, ESLint, Tailwind)
├── infra/
│   └── docker-compose.yml  # Postgres + Redis + Garage + Mailpit
├── docs/                   # Cahier des charges, architecture, veille
└── turbo.json              # Pipeline Turborepo
```

## Documentation

Tous les documents fondateurs sont dans [docs/](./docs/) :

- [Cahier des charges](./docs/cahier-des-charges.md) — 16 modules fonctionnels
- [Architecture technique](./docs/architecture.md) — stack, multi-tenant RLS, sécurité
- [Index de la documentation](./docs/README.md)

## Stack

Next.js 15 (App Router) · TypeScript strict · Prisma · PostgreSQL 16 (Row-Level Security multi-tenant) · Redis · Tailwind + shadcn/ui · next-intl (FR + AR/RTL) · Auth.js v5 · tRPC interne + REST public · BullMQ · S3-compatible · Turborepo + pnpm.

## License

Propriétaire — tous droits réservés.
