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
| [Maquettes (wireframes)](./maquettes.md) | Wireframes ASCII des 6 écrans clés : login, dashboard admin, fiche élève 360°, appel mobile, parent mobile + paiement CMI, bulletin PDF | ✅ V0 |
| [Business plan & pricing](./business-plan.md) | Marché TAM/SAM/SOM Maroc, tarification 3 plans (Starter/Standard/Premium), projection 36 mois, unit economics, go-to-market, risques | ✅ V0 |
| [Manuel utilisateur & procédures](./guide/README.md) | Guide destiné aux utilisateurs finaux, organisé par métier ; gabarit de fiche de procédure, chapitre « Prise en main » rédigé | 🚧 En cours |

## À produire ensuite

- Pack hi-fi Figma sur la base des wireframes
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
├── infra/docker-compose.yml   # Postgres + Redis + Garage + Mailpit
└── turbo.json
```

Avec en S0 : auth multi-tenant, RLS Postgres, i18n FR/AR, RBAC, audit log, et le module Core complet (tenants, users, persons, années, classes).
