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

## S10 — Espace parent (phase 1, en cours, non commité)
- Décision : portail d'abord, **CMI en phase 2** (bouton « Payer en ligne » présent mais désactivé « bientôt »).
- Auth : flag `isParent` (rôle `parent`) calculé dans `authorize`, propagé JWT/session/types. Cloisonnement parent/admin dans le callback `authorized` (config.ts) + redirections layout.
- `lib/parent.ts` : `getParentChildren` (via UserPerson → PersonRelation), `parentCanAccessChild` (garde de propriété), `getParentAnnouncements` (ALL/PARENTS/CLASS/LEVEL des enfants).
- Routes `/[locale]/parent` : layout + sidebar (`nav.tsx`), dashboard (cartes enfants + annonces), page enfant `children/[childId]` (bulletins+présences+scolarité), `announcements`.
- Route PDF parent sécurisée : `/api/parent/children/[childId]/bulletin.pdf?period=` (réutilise pipeline S9 + garde de propriété).
- Provisioning : action `createParentAccessAction` + composant `ParentAccess` sur fiche personne PARENT (crée User+rôle parent+UserPerson, mdp temporaire affiché 1×).
- Seed : compte parent démo `hassan.benani@demo.jawal.ma` / `parent1234` (lié à Yassine + Youssra Benani). **Re-seed requis** pour tester.
- Validé : typecheck web OK. Reste : test navigateur (login parent), puis commit.
- Note : `pnpm db typecheck` échoue sur rootDir/seed.ts — **préexistant**, sans rapport.

## S8.4E3 — Contraintes profs (en cours, non commité)
- 2 nouveaux kinds `TimetableConstraint` : `MAX_CONSECUTIVE_HOURS_TEACHER` (config {max}) + `TEACHER_LUNCH_BREAK` (config {from,to}).
- CP-SAT (solver_multi.py, moteur OR-Tools) : max consécutives = fenêtre glissante (max+1)≤max par prof/jour ; pause déjeuner échelonnée = somme créneaux déjeuner occupés ≤ (n-1) par prof/jour (≥1 libre). FET non concerné.
- Chaîne : schema.prisma (enum) → shared (schémas config + défauts) → settings UI (page/client/actions) → solver-client (SolverConstraints) → orchestrateur generate/actions.ts (mapping, calcul lunch slot ids depuis la plage) → schemas.py ConstraintsInput.
- i18n fr/ar (kinds + fields.from/to). Validé : typecheck shared+web OK, py_compile OK, prisma generate OK.
- ⚠️ **`prisma db push` requis** (Docker 5433 doit tourner) pour appliquer les valeurs enum à la base, sinon l'enregistrement d'une contrainte échoue. Solveur Python à redémarrer. Test génération non fait (base down).

## S8.4E4 — Type de salle obligatoire (livré, non commité→commité)
- Nouveau kind `REQUIRE_SUBJECT_ROOM_TYPE` (toggle, config {}). Réutilise l'heuristique existante `classifyRoom` + `subjectRoomRequirement` (kpi-edt.ts) → **zéro migration data-model**.
- Volet « durée de séance » : couvert par `REQUIRES_CONSECUTIVE_SUBJECTS` existant (décidé avec l'utilisateur, pas de modèle de durée séparé).
- Solveur : à la création des variables, restreint les salles aux types compatibles (NO_ROOM exclu) ; raison unplaced dédiée si aucune salle compatible. RoomInput.room_type + MultiAssignmentInput.required_room_type + ConstraintsInput.enforce_room_type.
- Validé : typecheck shared+web OK, py_compile OK, **test solveur direct OK** (Physique→labo PC placée ; sans labo → unplaced avec raison). db push appliqué, solveur rebuildé.

## S8.4E5 — Objectifs qualité (livré, commité)
- 2 kinds pondérés (mous) : `MINIMIZE_ROOM_CHANGES` {weight} + `BALANCE_DAILY_LOAD` {weight}.
- Solveur (objectif CP-SAT) : +weight × salle conservée d'un créneau au suivant (var `same` ≤ occ classe sur les 2 slots) ; −weight × journée la plus chargée par classe (`maxload` ≥ charge/jour). Aucun nouveau modèle de données.
- Chaîne identique 4E3/4E4 : enum → shared (configs weight + défauts 5) → UI (groupe poids avec NO_GAPS) → solver-client → orchestrateur → schemas.py.
- Validé : typecheck shared+web OK, py_compile OK, **test solveur direct OK** (6h → 3/3 sur 2 jours = équilibré ; tout dans 1 salle = 0 changement).

## S10 phase 1 — finitions (en cours, non commité)
- Email mdp temporaire : `safeSendEmail` dans `createParentAccessAction` (Mailpit en dev).
- Changement mdp parent : `/parent/account` + `changeParentPasswordAction` (vérif bcrypt).
- Historique multi-années : sélecteur d'année sur `/parent/children/[id]` (présences + bulletins par année ; route PDF résout la classe via l'année de la période).
- Messagerie parent↔école : **l'admin avait déjà une messagerie** (participant-based, perm `communication.write`). Intégration : le parent ouvre une conversation → ajoute le personnel (users non-parent, non super-admin) comme participants → l'admin la voit dans sa boîte existante. Pas d'UI admin à refaire.
  - `lib/messaging.ts` (listConversationsForParticipant, getThread, isParticipant, resolveSenderNames) ; actions parent (start/reply/markRead, gardées par isParticipant) ; pages `/parent/messages` + `[id]` ; nav parent (Messages, Mon compte).
- Validé : typecheck web OK, JSON fr/ar OK. Test navigateur à faire.

## S11 — Documents auto (en cours, non commité)
- 4 documents officiels PDF réutilisant le pipeline S9 (HTML autonome → Playwright) : `CERTIFICAT_SCOLARITE`, `ATTESTATION_PRESENCE`, `ATTESTATION_PAIEMENT`, `ATTESTATION_REUSSITE`.
- `lib/document-data.ts` : loader par type (classe/année via StudentClass, présence par période, finance all-time, réussite via loadBulletinData). Renvoie null si prérequis manquants → HTTP 422.
- `lib/document-html.ts` : `renderDocumentHTML` (layout commun : en-tête établissement, infos élève, corps i18n par type, ligne « figure », mention/signature/réf/footer).
- Routes : `/api/admin/persons/[id]/document.pdf?type=&year=&period=` + `/api/parent/children/[childId]/document.pdf` (garde de propriété).
- UI : composant partagé `components/documents-panel.tsx` (sélecteur année+période + 4 boutons) sur fiche élève admin ET page enfant parent.
- i18n `admin.documents` (titles/types/body/figures/mentions) fr+ar. Validé : typecheck web OK, JSON OK. Test navigateur à faire.

## Finitions (hors CMI) — livré
- Dette `pnpm db typecheck` corrigée (rootDir `.` au lieu de `./src`).
- Notification email au parent quand l'école répond à un message (admin `sendMessageAction` → safeSendEmail aux participants parents).
- **Validation end-to-end réelle** (login NextAuth programmatique) : les 5 routes PDF (bulletin élève, lot classe, certificat ; admin + parent) renvoient de vrais PDF (`%PDF`, 54–77 Ko) ; accès enfant non rattaché → 403. Pipeline auth → route → Playwright → PDF OK.
- Signataire/chef d'établissement sur les documents : **volontairement non fait** (bloc signature blanc = conventionnel, signé/cacheté à la main ; pas de page identité établissement → périmètre inventé évité).
- « Mot de passe oublié » parent : reporté (nécessite une table de tokens = nouveau modèle).

## Reste : S10 phase 2 — CMI (seul module non couvert)
- Intégration CMI réelle (init paiement, HMAC, page hébergée, callback → Payment). Nécessite identifiants marchand sandbox.

## Conventions
- Working dir : `c:\Users\idris\Documents\01-GitHub\jawal`
- Postgres : Docker `localhost:5433`, user/pass `jawal/jawal`
- NODE_OPTIONS="--use-system-ca" requis pour Prisma sur Windows
- Pas de `git commit` sans accord explicite
- Permission par défaut : `tenants.manage` (gating fin reporté)
