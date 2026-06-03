# Jawal — Contexte projet

## Projet
SaaS multi-tenant de gestion scolaire (K-12 Maghreb, priorité Maroc). Next.js 15 + Prisma + Postgres 16 (RLS) + microservice Python (FastAPI + OR-Tools + FET) en Docker. FR/AR/RTL via next-intl.

## Modules livrés
- **S6 Présences** : vue admin, justifications, pointage personnel + retenues auto, fiche élève + vue famille.
- **S7 Inscriptions** : DRAFT→ACTIVE→WITHDRAWN + réinscription bulk.
- **S8 Emploi du temps** : slots, EDT classe/prof/salle, conflits, dispos + volume, print, overrides, ICS, solveur OR-Tools (mono/multi) + FET, contraintes paramétrables, multi-cycles, contraintes par classe.
- **S9 Bulletins PDF** : pipeline HTML autonome → Playwright/Chromium → PDF (élève + lot classe). `lib/bulletin-{data,html}.ts`, `lib/pdf.ts`.
- **S10 Espace parent (phase 1)** : portail `/[locale]/parent` cloisonné (flag `isParent`), enfants via `lib/parent.ts`, bulletins/présences/scolarité, annonces, messagerie parent↔école (réutilise la messagerie admin participant-based), changement de mot de passe, historique multi-années. Provisioning depuis la fiche PARENT (+ email mdp temporaire via Mailpit). Compte démo `hassan.benani@demo.jawal.ma` / `parent1234`.
- **S11 Documents auto** : 4 PDF officiels (certificat scolarité, attestations présence/paiement/réussite) via le pipeline S9. `lib/document-{data,html}.ts`, `components/documents-panel.tsx`, routes admin + parent.
- **Pilotage** : cockpit direction `/admin/pilotage` (entrée sidebar + tuile dashboard). 7 KPI à code couleur vert/orange/rouge + légende ; 5 calculés (réussite, absentéisme, recouvrement, charge prof, moyennes par niveau), 2 en N/A faute de source (satisfaction, conformité Massar). `lib/kpi-pilotage.ts` (réutilise `lib/bi.ts`).
- **Tableau de bord enseignant** : `/admin/persons/[id]/dashboard` (bouton sur la fiche prof) + composant partagé `TeacherDashboardView`. Moyenne matière + distribution (jauge + histogramme), présence + retards, charge horaire + quota, messages non lus ; programme/incidents/feedback en N/A. `lib/kpi-teacher.ts`.
- **Portail enseignant** : `/[locale]/enseignant` cloisonné (flag `isTeacher`, rôle `enseignant`). Tableau de bord (réutilise la vue), EDT (grille), mes classes, messagerie (réponse seule, participant), changement de mot de passe. Provisioning depuis la fiche prof (+ email). Compte démo `amina.prof@demo.jawal.ma` / `prof1234`. `lib/teacher.ts`.

## Solveur EDT
- Docker Compose : `solver` sur `localhost:8001` (FastAPI + OR-Tools CP-SAT + FET 7.0.8). Endpoints `/solve`, `/solve-multi`, `/engines`.
- `forbidden_class_slots` calculés depuis Tenant.settings.timetable et Cycle.settings.timetable (multi-cycles). Contraintes par classe : Class.metadata.timetableConstraints.
- Contraintes `TimetableConstraint` (enum kinds) → `ConstraintsInput` : max même matière/jour, anti-trous, blocs consécutifs, max h/jour prof, **max consécutives prof (4E3)**, **pause déjeuner échelonnée (4E3)**, **type de salle obligatoire (4E4, heuristique `classifyRoom`/`subjectRoomRequirement`)**, **min. changements de salle + équilibrage journées (4E5, mous)**.
- FET excelle anti-trous. Les contraintes 4E3-4E5 ne s'appliquent qu'au moteur OR-Tools.

## KPI préparation EDT
Page `/admin/timetable` : 9 KPI (couverture horaire contractuelle, salles spécialisées, dispos vs grille, charge profs…) + score global. `lib/kpi-edt.ts`. Person.contractualHoursPerWeek saisi sur fiche prof.

## Dataset test
`infra/postgres/seed-college-big.sql` : 9 classes BIG, 270 élèves, 16 profs, 18 salles, 240h/sem. Tenant `demo`, admin `admin@demo.jawal.ma` / `demo1234`.

## Reste à faire
- **S10 phase 2 — CMI** (seul module non couvert) : init paiement + signature HMAC + page hébergée + callback → `Payment`. Nécessite identifiants marchand sandbox.
- Brancher les 2 KPI Pilotage en N/A : modèle d'enquête (satisfaction) + intégration Massar/MEN (conformité).
- « Mot de passe oublié » parent (table de tokens à créer).

## Conventions
- Working dir : `c:\Users\idris\Documents\01-GitHub\jawal`
- Postgres : Docker `localhost:5433`, user/pass `jawal/jawal`. `pnpm infra:up` pour démarrer.
- `NODE_OPTIONS="--use-system-ca"` requis pour Prisma sur Windows. `prisma db push` après changement de schéma (pas de migrations). Rebuild solveur après changement Python.
- Pas de `git commit` sans accord explicite.
- Permission par défaut : `tenants.manage` (gating fin reporté).
