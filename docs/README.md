# Jawal — Documentation

> **Jawal** : plateforme SaaS multi-tenant de gestion intégrée d'établissement scolaire.
> Cible : Maghreb (Maroc en priorité) · Segments : K-12, enseignement supérieur, formation professionnelle.

## Documents fondateurs

| Document | Contenu | État |
|---|---|---|
| [Cahier des charges](./cahier-des-charges.md) | Vision, personas, 16 modules fonctionnels, parcours utilisateurs, exigences transverses, métriques | ✅ V0 |
| [Architecture technique](./architecture.md) | Stack, multi-tenant RLS, modèle de données core, modularité, sécurité, déploiement, roadmap | ✅ V0 |
| [Veille concurrentielle](./veille.md) | Analyse des concurrents (PowerSchool, PRONOTE, Massar, Classter, acteurs Maghreb), positionnement stratégique | ✅ V0 |
| [Glossaire tri-segment](./glossaire.md) | Terminologie unifiée K-12 / Supérieur / Formation pro + acronymes Maroc + conventions code | ✅ V0 |
| [Périmètre MVP](./mvp-perimetre.md) | Modules retenus pour le MVP 3 mois, parcours golden paths, roadmap 6 sprints, critères de succès | ✅ V0 |

## À produire ensuite

- `maquettes/` — wireframes principaux portails (admin, parent mobile, enseignant mobile)
- `api/openapi.yaml` — spec API publique (V1)
- `runbooks/` — procédures opérationnelles (incident, backup, déploiement)

## Décisions structurantes prises

- **Stack** : Next.js 15 (App Router) + TypeScript + Prisma + PostgreSQL 16 + Redis
- **Multi-tenant** : shared DB + PostgreSQL Row-Level Security
- **i18n** : FR (défaut) + AR avec RTL natif via next-intl
- **Paiement** : CMI (Maroc) prioritaire, Stripe en complément
- **Hébergement MVP** : Vercel + Neon (à revalider à 10 tenants pour souveraineté CNDP)
- **Monorepo** : Turborepo + pnpm

## Prochaine étape proposée

Initialiser le squelette du projet :

```
jawal/
├── apps/web/                  # Next.js
├── packages/db/               # Prisma
├── packages/ui/               # Design system
├── packages/shared/           # Types/utils
├── infra/docker-compose.yml   # Postgres + Redis + MinIO + Mailpit
└── turbo.json
```

Avec en S0 : auth multi-tenant, RLS Postgres, i18n FR/AR, RBAC, audit log, et le module Core complet (tenants, users, persons, années, classes).
