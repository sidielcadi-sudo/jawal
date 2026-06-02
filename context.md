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

## En cours
Correction `estimateTeacherCapacity` dans kpi-edt.ts : calcul actuel = somme heures dispo × 0.7 (donne 561h pour BIG, trompeur). Décision validée : remplacer par comptage des créneaux placables couverts par dispo, et afficher **2 KPI séparés** :
1. Card « Couverture horaire » : pct capé 100% (capacité ≥ demande ⇒ OK)
2. Card « Taux d'utilisation prévisionnel » : ratio brut 240/465 = 52%

## Prochaines phases potentielles
- S8.4E3 Profs : pause obligatoire, max consécutives
- S8.4E4 Matières+Salles : durée séance, type salle obligatoire
- S8.4E5 Objectifs qualité OR-Tools : min changements salle, journées longues
- S9 Bulletins PDF officiels, S10 Espace parent + CMI, S11 Documents auto

## Conventions
- Working dir : `c:\Users\idris\Documents\01-GitHub\jawal`
- Postgres : Docker `localhost:5433`, user/pass `jawal/jawal`
- NODE_OPTIONS="--use-system-ca" requis pour Prisma sur Windows
- Pas de `git commit` sans accord explicite
- Permission par défaut : `tenants.manage` (gating fin reporté)
