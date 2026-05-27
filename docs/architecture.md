# Jawal — Architecture technique

> Document d'architecture pour la plateforme SaaS multi-tenant Jawal.
> À lire après `cahier-des-charges.md`.

---

## 1. Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
│  Web (Next.js)  ·  PWA installable  ·  Apps natives (V2)         │
└──────────────────────────────────────────────────────────────────┘
                              │ HTTPS
┌──────────────────────────────────────────────────────────────────┐
│                  EDGE / CDN (Vercel / Cloudflare)                │
│         · Cache assets statiques · WAF · Rate limit              │
└──────────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────────┐
│              APPLICATION (Next.js App Router, SSR)               │
│  ┌────────────────────┐  ┌─────────────────────────────────┐    │
│  │  Portails React    │  │  Route Handlers (API HTTP/tRPC) │    │
│  │  - Admin/Direction │  │  Middleware:                    │    │
│  │  - Enseignant      │  │   1. Auth (NextAuth)            │    │
│  │  - Parent          │  │   2. Tenant resolution          │    │
│  │  - Élève/Étudiant  │  │   3. RBAC                       │    │
│  │  - Super-admin     │  │   4. Audit log                  │    │
│  └────────────────────┘  └─────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────────┐
│               DOMAINES MÉTIER (src/modules/*)                    │
│  core · admissions · scolarite · edt · presences · notes ·       │
│  examens · lms · communication · finance · rh · biblio ·         │
│  restauration · sante · pilotage · plateforme                    │
└──────────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────────┐
│                          INFRASTRUCTURE                          │
│  PostgreSQL (RLS)  ·  Redis (cache, queues, sessions)            │
│  S3-compatible (documents)  ·  Workers BullMQ (jobs, exports)    │
│  Meilisearch (recherche)  ·  Resend/SES (mail)  ·  SMS gw        │
└──────────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────────┐
│                     INTÉGRATIONS EXTERNES                        │
│  CMI · Stripe · BBB/Jitsi · WhatsApp Business · Google/MS SSO    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Stack technique

### 2.1 Choix et justifications

| Couche | Choix | Justification |
|---|---|---|
| Framework full-stack | **Next.js 15+** (App Router) | SSR, RSC, Route Handlers unifiés. Écosystème mature, recrutement facile. |
| Langage | **TypeScript strict** | Partage types front/back, sécurité de refactoring sur projet long terme. |
| Style | **Tailwind CSS + shadcn/ui** | Productif, accessible, RTL-friendly via `dir="rtl"`. |
| ORM | **Prisma** | Typage fort, migrations versionnées, bon support RLS via `$extends`. |
| Base de données | **PostgreSQL 16+** | Row-Level Security natif pour multi-tenant, JSONB, full-text. |
| Cache & queues | **Redis 7+** | Sessions, cache, queues BullMQ pour jobs asynchrones. |
| Recherche | **Meilisearch** (ou Postgres FTS au début) | UX recherche instantanée multilingue (FR/AR). |
| Auth | **Auth.js (NextAuth) v5** | OAuth, credentials, support SSO SAML/OIDC. |
| i18n | **next-intl** | Routing localisé, RTL automatique, format dates/nombres. |
| Validation | **Zod** | Schémas partagés front/back. |
| API | **tRPC** (interne) + **REST OpenAPI** (externe) | tRPC pour portails internes (DX), REST pour intégrations. |
| Tests | **Vitest + Playwright** | Unit + e2e ; rapides. |
| Observabilité | **OpenTelemetry + Sentry** | Standard, multi-backend. |
| Stockage fichiers | **S3-compatible** (AWS S3, Scaleway, MinIO) | Documents élèves, bulletins PDF, ressources LMS. |
| PDF | **react-pdf** ou **Puppeteer** | Bulletins, factures, diplômes. |
| Paiement | **CMI** (Maroc) + **Stripe** | CMI prioritaire pour acceptation cartes nationales. |

### 2.2 Versions cibles
- Node.js ≥ 22 LTS
- Next.js ≥ 15
- PostgreSQL ≥ 16
- Redis ≥ 7

---

## 3. Multi-tenant : modèle et isolation

### 3.1 Stratégie
**Shared database, shared schema + Row-Level Security (RLS) PostgreSQL.**

Chaque table métier porte une colonne `tenant_id` (UUID). Une politique RLS filtre automatiquement les lignes selon le tenant actif (variable de session PostgreSQL `app.current_tenant_id`).

### 3.2 Avantages
- Coût opérationnel faible (1 base, 1 cluster)
- Sauvegardes/migrations centralisées
- Sécurité forte : même un bug applicatif ne peut lire les données d'un autre tenant (RLS appliquée par le SGBD)

### 3.3 Mise en œuvre

```sql
-- Activation RLS
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- Politique : un utilisateur ne voit que son tenant
CREATE POLICY tenant_isolation ON students
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Côté Prisma : middleware qui exécute avant chaque requête
-- SET LOCAL app.current_tenant_id = '<uuid>';
```

### 3.4 Résolution du tenant
1. Sous-domaine : `monecole.jawal.app` → lookup `tenants.slug`
2. Ou domaine custom : `ecole.exemple.ma` → lookup `tenants.custom_domain`
3. Le middleware Next.js injecte le `tenantId` dans le contexte de requête.

### 3.5 Super-admin SaaS
Bypass RLS via un rôle PostgreSQL dédié (`saas_admin`), uniquement utilisé par le portail super-admin, lui-même isolé sur un sous-domaine séparé avec MFA obligatoire.

---

## 4. Modèle de données (Core, V0)

> Vue d'ensemble du noyau. Chaque module ajoute ses propres tables (voir cahier des charges).

```
┌─────────────────┐         ┌──────────────────┐
│    tenants      │◄────────│ tenant_modules   │
│  id (uuid)      │         │  tenant_id       │
│  slug           │         │  module_code     │
│  name           │         │  enabled         │
│  profile        │         │  config (jsonb)  │
│  custom_domain  │         └──────────────────┘
│  locale_default │
│  status         │
└────────┬────────┘
         │
         │ 1..N (toutes les tables métier portent tenant_id)
         │
    ┌────┴────────────────────────────────────────────┐
    │                                                 │
┌───▼─────────────┐  ┌─────────────────┐  ┌──────────▼──────┐
│  users          │  │  persons        │  │  roles          │
│  id             │  │  id             │  │  id             │
│  email          │  │  tenant_id      │  │  tenant_id      │
│  password_hash  │  │  type (eleve,   │  │  code           │
│  mfa_secret     │  │   parent, prof, │  │  permissions[]  │
│  locale         │  │   personnel)    │  └─────────────────┘
│  last_login_at  │  │  first_name     │           ▲
└────────┬────────┘  │  last_name      │           │
         │           │  birth_date     │  ┌────────┴────────┐
         │           │  gender         │  │ user_roles      │
         │           │  nationality    │  │ user_id         │
         │           │  cin            │  │ role_id         │
         │           │  contacts(jsonb)│  │ scope (jsonb)   │
         │           │  address(jsonb) │  └─────────────────┘
         │           └────────┬────────┘
         │                    │
         │  ┌─────────────────┴──────────────┐
         │  │ user_persons (lien compte ↔    │
         └──┤  identité ; un user peut être  │
            │  parent de plusieurs élèves)   │
            └─────────────────────────────────┘

┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ academic_years  │  │  cycles         │  │  levels         │
│ id, tenant_id   │  │ id, tenant_id   │  │ id, tenant_id   │
│ label           │  │ code, label     │  │ cycle_id        │
│ start, end      │  └─────────────────┘  │ order, label    │
│ active          │                       └─────────────────┘
└─────────────────┘
                                          ┌─────────────────┐
┌─────────────────┐  ┌─────────────────┐  │  classes        │
│  periods        │  │  rooms          │  │ id, tenant_id   │
│ tenant_id       │  │ tenant_id       │  │ academic_year_id│
│ year_id         │  │ name, capacity  │  │ level_id        │
│ kind (trim,sem) │  │ equipment       │  │ name, capacity  │
│ start, end      │  └─────────────────┘  │ main_teacher_id │
└─────────────────┘                       └─────────────────┘

┌─────────────────┐  ┌─────────────────┐
│ audit_logs      │  │ files           │
│ tenant_id       │  │ tenant_id       │
│ user_id         │  │ owner_type/id   │
│ action          │  │ s3_key          │
│ entity, id      │  │ mime, size      │
│ before, after   │  │ checksum        │
│ ip, ua, at      │  │ encrypted       │
└─────────────────┘  └─────────────────┘
```

**Conventions** :
- Toutes les tables métier : `id uuid`, `tenant_id uuid not null`, `created_at`, `updated_at`, `deleted_at` (soft delete).
- Pas de cascade DELETE entre tenants (impossible par construction RLS).
- Toutes les références externes (CIN, emails) sont uniques **par tenant** (contrainte composite).

---

## 5. Arborescence du projet

```
jawal/
├── apps/
│   ├── web/                    # Next.js — portails web
│   │   ├── src/
│   │   │   ├── app/            # App Router
│   │   │   │   ├── [locale]/   # i18n (fr, ar)
│   │   │   │   │   ├── (auth)/
│   │   │   │   │   ├── (admin)/
│   │   │   │   │   ├── (enseignant)/
│   │   │   │   │   ├── (parent)/
│   │   │   │   │   └── (eleve)/
│   │   │   │   └── api/        # Route Handlers (REST publique)
│   │   │   ├── modules/        # Cœur métier (voir §6)
│   │   │   ├── lib/            # auth, db, tenant, audit, i18n
│   │   │   ├── components/     # UI partagés (shadcn)
│   │   │   └── server/         # tRPC routers
│   │   └── public/
│   ├── super-admin/            # Portail SaaS (sous-domaine séparé)
│   └── mobile/                 # (V2) Expo / React Native
├── packages/
│   ├── db/                     # Prisma schema, migrations, seed
│   ├── ui/                     # Design system partagé
│   ├── config/                 # Tailwind, ESLint, TS configs
│   ├── shared/                 # Types/Zod/utils partagés
│   └── i18n/                   # Messages FR, AR, EN
├── docs/                       # Documentation (ce dossier)
├── infra/                      # IaC (Terraform / Docker Compose dev)
├── scripts/                    # Outils dev, seed, migrations data
├── .github/workflows/          # CI/CD
└── turbo.json                  # Monorepo Turborepo
```

**Monorepo** : Turborepo + pnpm workspaces. Permet de partager types/UI entre web, super-admin, mobile.

---

## 6. Architecture modulaire

Chaque module suit la même structure :

```
src/modules/<nom>/
├── domain/             # Entities, value objects, règles métier pures
├── application/        # Use cases (services applicatifs)
├── infrastructure/     # Repositories Prisma, adapters externes
├── api/                # Routes Next.js / handlers tRPC
├── ui/                 # Composants React spécifiques au module
├── schema.prisma       # Fragment de schéma (mergé au build)
└── module.config.ts    # Permissions, activation par segment, i18n keys
```

**Activation par tenant** : la table `tenant_modules` détermine quels modules sont actifs. Le middleware retourne 404 si un module désactivé est sollicité.

**Profils par défaut** (à l'inscription d'un tenant) :
- `k12` : core, admissions, scolarite, edt, presences, notes, examens, communication, finance
- `superieur` : core, admissions, scolarite, edt, presences, notes, examens, lms, communication, finance, stages
- `formation_pro` : core, admissions, scolarite, edt, presences, examens, lms, communication, finance, certifications

---

## 7. Internationalisation FR/AR + RTL

- **next-intl** : tous les textes UI sont des clés (`t('students.add')`).
- Routing : `/[locale]/...` → `fr`, `ar`.
- Direction : `dir="rtl"` automatique pour `ar` ; Tailwind avec `rtl:` variants ou `tailwindcss-rtl` plugin.
- Polices : Inter pour Latin, Noto Sans Arabic pour AR.
- Format dates : `Intl.DateTimeFormat` + calendrier hégire affiché en parallèle (`Intl.DateTimeFormat('fr-MA-u-ca-islamic')`).
- Devises : MAD par défaut, formatables.
- **Test RTL en CI** : Playwright sur `/ar/...` pour vérifier que les layouts ne cassent pas.

---

## 8. Authentification & autorisation

### 8.1 Authentification
- **Auth.js v5** avec provider Credentials (email + mot de passe + MFA TOTP optionnel)
- Providers additionnels (V1.5) : Google Workspace for Education, Microsoft Entra
- SSO SAML 2.0 / OIDC (V2) pour gros établissements
- Cookies HTTP-only, SameSite=Lax, rotation tokens

### 8.2 Autorisation (RBAC + ABAC léger)
- **Rôles système** : `super_admin`, `tenant_admin`, `direction`, `scolarite`, `comptable`, `enseignant`, `cpe`, `parent`, `eleve`
- **Permissions** : action + ressource, ex `notes.write`, `bulletins.publish`
- **Scope** : un enseignant n'accède qu'à ses classes ; un parent qu'à ses enfants. Implémenté via `user_roles.scope` (jsonb : `{ "classes": [...] }` ou `{ "persons": [...] }`)
- Helper côté serveur : `can(user, "notes.write", { classId })` testé dans chaque use case + RLS pour filet de sécurité.

---

## 9. Paiement (CMI + Stripe)

### 9.1 CMI (Maroc, priorité)
- Intégration via formulaire de paiement hébergé CMI (3D Secure inclus).
- Flow : créer une commande locale → POST signé vers CMI → redirect 3DS → callback (succès/échec) → vérification HMAC → enregistrement encaissement.
- Webhook + page de retour pour confirmer (idempotent via `order_ref` unique).
- **Important** : CMI exige une convention commerçant ; prévoir un mode "sandbox" via VPC bancaire pour tests.

### 9.2 Stripe (international / fallback)
- Stripe Checkout pour simplicité, ou Payment Intent pour UX intégrée.
- Webhooks signés.

### 9.3 Abstraction
```
modules/finance/infrastructure/payment-gateways/
├── cmi.gateway.ts
├── stripe.gateway.ts
└── payment-gateway.interface.ts
```

---

## 10. Jobs asynchrones & événements

- **BullMQ** sur Redis pour : génération bulletins PDF en masse, envois SMS/email/push, imports CSV, exports comptables, calculs BI nocturnes, relances paiement.
- **Event bus** interne (in-process pour V0, Redis pub/sub pour scaling) : événements métier `note.saisie`, `paiement.confirmé`, `absence.declaree` → handlers (notifications, BI, webhooks).

---

## 11. Recherche

- V0 : PostgreSQL Full-Text Search (`tsvector`) avec dictionnaires français + arabe.
- V1 : Meilisearch pour recherche instantanée multilingue + tolérance fautes ; index par tenant.

---

## 12. Sécurité — checklist

- [ ] TLS 1.3 partout, HSTS, redirection HTTP→HTTPS
- [ ] CSP stricte, X-Frame-Options, X-Content-Type-Options
- [ ] Rate limiting (Upstash Ratelimit ou middleware custom)
- [ ] CSRF tokens sur mutations non-API
- [ ] Validation Zod systématique sur entrées
- [ ] Échappement output (React le fait, mais vigilance sur `dangerouslySetInnerHTML`)
- [ ] Secrets dans vault (Doppler / Infisical / variables Vercel)
- [ ] MFA obligatoire pour `super_admin` et `tenant_admin`
- [ ] Audit log immuable (append-only, hash chaîné optionnel)
- [ ] Chiffrement au repos pour documents médicaux et données sensibles (AES-256 via pgcrypto ou côté app)
- [ ] Backups chiffrés, restauration testée mensuellement
- [ ] DPA (Data Processing Agreement) signé avec chaque tenant
- [ ] Pentest annuel + bug bounty (V2)

---

## 13. Déploiement

### 13.1 Environnements
- `dev` : Docker Compose local (Postgres, Redis, Mailpit, MinIO)
- `staging` : Vercel + Neon (DB) + Upstash (Redis)
- `production` : voir options ci-dessous

### 13.2 Options de production
| Option | Avantages | Inconvénients |
|---|---|---|
| **Vercel + Neon + Upstash** | Time-to-market rapide, zéro ops | Données hors Maroc (RGPD/CNDP à valider), coût croissant à l'échelle |
| **VPS Maroc (N+ONE, Maroc Data Center)** | Souveraineté, conformité CNDP | Ops à gérer (Docker Swarm/k3s, backups) |
| **Hybride** | Vercel edge + DB au Maroc | Latence DB ↔ app à mesurer |

**Recommandation MVP** : Vercel + Neon (région UE la plus proche, ex. Paris) avec mention dans le DPA. Migration possible vers VPS Maroc dès qu'un client le requiert contractuellement.

### 13.3 CI/CD
- GitHub Actions : lint, typecheck, tests unit, tests e2e, build, déploiement Vercel.
- Migrations Prisma : `prisma migrate deploy` en hook post-build.
- Preview deployments par PR.

---

## 14. Roadmap technique (MVP)

| Sprint | Livrable |
|---|---|
| **S0** (2 sem) | Setup monorepo, CI/CD, Docker dev, Prisma + RLS POC, Auth.js, i18n FR/AR, design system de base |
| **S1** (2 sem) | Module Core complet : tenants, users, persons, années, classes, RBAC, audit log, super-admin |
| **S2** (2 sem) | Module Scolarité : dossier élève, affectations, documents officiels |
| **S3** (2 sem) | Modules Présences + Communication (notifications push/email) |
| **S4** (2 sem) | Module Notes/Bulletins (saisie + génération PDF) |
| **S5** (1 sem) | Hardening : tests e2e, accessibilité, RTL polish, perf |
| **S6** (1 sem) | Onboarding tenant, doc utilisateur, démo |

→ **MVP livrable à ~3 mois** avec 5 modules pilotes, déployable chez un premier client K-12.

---

## 15. Décisions ouvertes (à trancher avant S0)

1. **tRPC ou REST** pour API interne ? → Recommandation : tRPC pour DX, REST exposé en V2 via OpenAPI auto-généré.
2. **Prisma ou Drizzle** ? → Prisma pour maturité ; surveiller Drizzle pour V2.
3. **Hébergement production** ? → Vercel+Neon MVP, à revalider à 10 tenants.
4. **PWA suffisante ou apps natives dès V1** ? → PWA installable + push web (FCM) pour MVP, apps natives en V2 si demande pressante.
5. **Passerelle SMS Maroc** ? → Évaluer Inwi, Orange, Maroc Telecom Business + agrégateurs (Twilio fallback international).
6. **Intégration WhatsApp Business** ? → Via Meta Cloud API ou 360dialog.

---

## 16. Risques techniques majeurs

| Risque | Impact | Mitigation |
|---|---|---|
| Bug RLS fuite données entre tenants | Critique | Tests automatisés isolation par tenant en CI, audit code reviews systématique, monitoring requêtes sans `tenant_id` |
| Génération bulletins en masse non scalable | Élevé | Jobs BullMQ avec workers dédiés, génération streaming, cache PDF |
| CMI : refus/délai conventionnement | Moyen | Démarrer Stripe en parallèle ; partenariat banque tôt |
| AR/RTL régressions UI invisibles | Moyen | Tests Playwright sur `/ar/`, design system testé bi-directionnel |
| Conformité CNDP non validée | Élevé | Audit DPO externe avant 1er client, hébergement Maroc option |
| Recrutement (stack TS + connaissance éducation Maroc) | Moyen | Mix dev seniors TS + consultant métier scolaire |

---

## 17. Glossaire technique

- **RLS** : Row-Level Security, mécanisme PostgreSQL filtrant les lignes par utilisateur/session.
- **RBAC / ABAC** : Role-Based / Attribute-Based Access Control.
- **CMI** : Centre Monétique Interbancaire, opérateur cartes bancaires Maroc.
- **CNDP** : Commission Nationale de Contrôle de la Protection des Données Personnelles (Maroc).
- **MEN** : Ministère de l'Éducation Nationale (Maroc).
- **LTI / xAPI / SCORM** : standards d'interopérabilité pédagogique.
- **OneRoster** : standard d'échange listes élèves/classes/notes.
