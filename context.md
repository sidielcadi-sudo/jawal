# Jawal — Contexte session

## Projet
SaaS multi-tenant de gestion scolaire (K-12 Maghreb, priorité Maroc). Next.js 15 + Prisma + Postgres 16 RLS + microservice Python (FastAPI + OR-Tools + FET) en Docker. FR/AR/RTL via next-intl.

## Modules livrés
- S6 Présences (vue admin, justifications, pointage personnel + retenues auto, fiche élève + vue famille)
- S7 Inscriptions DRAFT→ACTIVE→WITHDRAWN + réinscription bulk
- S8 Emploi du temps : slots, EDT classe/prof/salle, conflits, dispos + volume, print, overrides, ICS, solveur OR-Tools (mono/multi) + FET, contraintes paramétrables, multi-cycles (E1+), contraintes par classe (E2)

## Solveur EDT
- Docker Compose : `solver` sur `localhost:8001` (FastAPI + OR-Tools CP-SAT + FET 7.0.8)
- Endpoints `/solve`, `/solve-multi`, `/engines`
- `forbidden_class_slots: [{class_id, day, slot_id}]` calculés depuis Tenant.settings.timetable et Cycle.settings.timetable (multi-cycles : collège vs lycée)
- Contraintes par classe : Class.metadata.timetableConstraints (max/min h/jour, jours OFF, plages interdites)
- Phase D : FET excelle anti-trous (240/240h en 1s vs OR-Tools 240/240h en 194s avec 53 trous)
- Phase analyse : `TeacherDiagnostic` + suggestions actionables dans réponse solveur, affichées dans modal résultat

## Dataset test
`infra/postgres/seed-college-big.sql` : 9 classes BIG-1ACA/B/C/2ACA/B/C/3ACA/B/C, 270 élèves, 16 profs, 18 salles, 10 matières, 90 affectations, 240h/sem. Tenant `demo`, login `admin@demo.jawal.ma` / `demo1234`.

## Dashboard KPI préparation EDT (commit cf6c5e7)
Page `/admin/timetable` (entrée sidebar « Emploi du temps »). 9 KPI : couverture horaire profs (jauge), classes physiques, dispos profs vs grille, salles spécialisées (par type heuristique LABO_PC/LABO_SVT/INFO/EPS/STD), cohérence matière-prof-classe, grille complète, contraintes pédagogiques, charge profs, conflits structurels, + score global pondéré. Helper `apps/web/src/lib/kpi-edt.ts`.

## Dashboard KPI — refonte couverture horaire (commit fd75c29)
- Person.contractualHoursPerWeek (Int?) saisi sur fiche prof, indépendant des dispos
- 2 KPI séparés : Couverture (cap 100%) et Taux d'utilisation (non cap)
- Seed BIG : 326h contractuelles → 100% couverture / 74% utilisation
- Alerte « X/N profs sans heures contractuelles saisies » sur la jauge

## S9 — Bulletins PDF officiels (livré)
- Moteur : HTML autonome (CSS inline, A4, RTL-aware) → Playwright/Chromium `setContent` → PDF. Indépendant de Tailwind, reproductible.
- `playwright` ajouté à apps/web (+ `playwright install chromium`). `serverExternalPackages` dans next.config.
- `lib/bulletin-data.ts` : loader partagé (page + routes PDF), réutilise computeClassBook.
- `lib/bulletin-html.ts` : `renderBulletinDocument` (1..N élèves, 1 page chacun, échappement HTML).
- `lib/pdf.ts` : `htmlToPdf` (browser Chromium singleton réutilisé).
- Routes : `/api/admin/classes/[id]/bulletin.pdf?studentId=&period=` (élève) + `/bulletins.pdf?period=` (lot classe, 1 PDF combiné).
- UI : liens « Télécharger PDF » + « Bulletins de la classe (PDF) » sur page bulletin. i18n fr/ar.
- Validé : typecheck OK, smoke Chromium → PDF OK (arabe inclus), test navigateur sur seed OK.
- Déploiement : `playwright install chromium` requis (app web hors Docker).

## Prochaines phases potentielles
- S8.4E3 Profs : pause obligatoire, max consécutives
- S8.4E4 Matières+Salles : durée séance, type salle obligatoire
- S8.4E5 Objectifs qualité OR-Tools : min changements salle, journées longues
- S10 Espace parent + CMI, S11 Documents auto

## Conventions
- Working dir : `c:\Users\idris\Documents\01-GitHub\jawal`
- Postgres : Docker `localhost:5433`, user/pass `jawal/jawal`
- NODE_OPTIONS="--use-system-ca" requis pour Prisma sur Windows
- Pas de `git commit` sans accord explicite
- Permission par défaut : `tenants.manage` (gating fin reporté)
