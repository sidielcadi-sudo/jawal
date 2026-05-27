# Jawal — Cahier des charges fonctionnel

> Plateforme SaaS multi-tenant de gestion intégrée d'établissement scolaire.
> Cible : Maghreb (Maroc en priorité). Segments : K-12, enseignement supérieur, formation professionnelle.

---

## 1. Vision & objectifs

### 1.1 Vision
Offrir aux établissements du Maghreb une plateforme unique, bilingue FR/AR (RTL), couvrant l'ensemble des processus administratifs, pédagogiques et financiers, avec une expérience mobile-first pour les parents et apprenants.

### 1.2 Objectifs métier
- **Réduire la charge administrative** de 40 % sur les tâches répétitives (appel, bulletins, relances).
- **Améliorer la communication** école/famille via notifications multicanal (push, SMS, email, WhatsApp).
- **Sécuriser les paiements** de scolarité via CMI (Maroc), Stripe, virement, et offrir un échéancier en ligne.
- **Piloter** l'établissement avec des indicateurs temps réel (effectifs, réussite, recouvrement).

### 1.3 Différenciateurs vs concurrence
| Critère | PowerSchool / Classter | PRONOTE | Massar (MEN MA) | **Jawal** |
|---|---|---|---|---|
| AR + RTL natif | ❌ | ❌ | ⚠️ partiel | ✅ |
| Paiement CMI | ❌ | ❌ | ❌ | ✅ |
| Tri-segment (K-12 + Sup + Pro) | ⚠️ | ❌ | ❌ | ✅ |
| Mobile parents/élèves | ⚠️ web | ⚠️ app vieillissante | ❌ | ✅ |
| IA intégrée (bulletins, décrochage) | ⚠️ | ❌ | ❌ | ✅ |
| API ouverte | ⚠️ payant | ❌ | ❌ | ✅ |
| Hébergement souverain Maroc | ❌ | ❌ | ✅ | ✅ option |

---

## 2. Acteurs & personas

| Persona | Description | Besoins clés |
|---|---|---|
| **Super-admin SaaS** | Équipe Jawal | Provisionner tenants, monitoring, facturation SaaS |
| **Directeur établissement** | Chef d'établissement | Pilotage, validation décisions, vision 360° |
| **Administration / scolarité** | Personnel admin | Inscriptions, dossiers, EDT, examens |
| **Comptable** | Gestion financière | Facturation, encaissement, relances, exports |
| **Enseignant** | Professeur, intervenant | Appel, notes, devoirs, communication parents |
| **Surveillant / CPE** | Vie scolaire | Absences, retards, sanctions |
| **Élève / Étudiant / Apprenant** | Apprenant | Notes, EDT, devoirs, ressources, communication |
| **Parent / Tuteur** | K-12 surtout | Suivi enfant, paiement, communication enseignants |
| **Bibliothécaire** | CDI/médiathèque | Catalogage, prêts |
| **Infirmier·ère** | Santé scolaire | Dossier médical, passages |

---

## 3. Profils par segment (terminologie & spécificités)

| Concept | K-12 | Supérieur | Formation pro |
|---|---|---|---|
| Unité temporelle | Année scolaire / trimestre | Année universitaire / semestre | Session / promotion |
| Regroupement apprenants | Classe | Groupe TD/TP, promotion | Groupe / session |
| Unité d'enseignement | Matière | UE / module / crédits ECTS | Bloc de compétences |
| Évaluation finale | Bulletin trimestriel | Relevé semestriel + jury | Certification / titre RNCP |
| Présence | Appel par cours | Émargement | Émargement (obligation Qualiopi-like) |
| Relations externes | Parents | Stages, recherche | OPCO, financeurs, entreprises |

Le **profil de tenant** active les bons modules, terminologie et workflows.

---

## 4. Modules fonctionnels (16)

### M01 — Core (Référentiels & administration)
**Obligatoire pour tous segments.**
- Gestion des **tenants** (établissements) : provisioning, branding, profil (K-12/Sup/Pro), modules activés
- **Années scolaires/universitaires/sessions**, périodes (trimestres, semestres)
- **Structure pédagogique** : cycles, niveaux, filières, classes/groupes, salles, équipements
- **Annuaire central** : personnes (apprenants, responsables, personnels), avec rôles
- **RBAC fin** : rôles système + rôles métier, permissions par module/action
- **Audit log** complet (qui a fait quoi, quand, depuis quelle IP)
- **Paramétrage** : libellés, barèmes, calendriers, jours fériés, vacances

### M02 — Admissions & inscriptions
- **Candidatures en ligne** : formulaire configurable, dépôt pièces, paiement frais de dossier
- **Workflow d'admission** : pré-sélection, tests/entretiens, commissions, décisions
- **Listes principale / d'attente / refus** avec notifications
- **Inscription définitive** : contrat, frais, validation pièces administratives
- **Réinscription annuelle** : pré-remplissage, mise à jour pièces
- **Transferts** internes/externes, archivage dossiers (durée légale)

### M03 — Scolarité & vie de l'apprenant
- **Dossier 360°** : administratif, pédagogique, médical (lien M14), disciplinaire, financier (lien M10)
- **Affectation** classes/groupes/options, parcours individualisés
- **Documents officiels** : certificat de scolarité, attestation, convention de stage
- **Gestion des familles** : multi-parents, garde alternée, autorisations de sortie

### M04 — Emplois du temps & ressources
- **Générateur automatique** sous contraintes (disponibilités profs, salles, équipements, max heures/jour)
- **Édition manuelle** drag & drop, vue jour/semaine/mois
- **Remplacements** : alertes, recherche de remplaçant, notifications
- **Gestion des salles** : capacité, équipements, réservation ponctuelle
- **Synchronisation calendrier** : iCal, Google Calendar, Outlook
- **Vues** : par classe, prof, salle, élève

### M05 — Présences & vie scolaire
- **Appel numérique** : web + mobile, par cours, batch
- **Types** : absence, retard, sortie anticipée, dispense
- **Justifications** : saisie parent, validation CPE, pièces jointes
- **Sanctions & observations** : avertissement, retenue, conseil de discipline
- **Alertes parents** automatiques (push, SMS, email, WhatsApp)
- **Statistiques** : taux d'absentéisme par classe/élève, alertes décrochage

### M06 — Évaluations & bulletins
- **Saisie des notes** : barème configurable (/20, /10, lettres, compétences)
- **Compétences** : référentiels (LSU-like, socle), positionnement
- **Coefficients** par matière/période, moyennes pondérées, rangs
- **Appréciations** : par matière, générale, conseil de classe
- **Génération bulletins** : templates personnalisables (logo, signature, multi-langue)
- **Conseils de classe** : convocations, PV, décisions (passage, redoublement, orientation)
- **Export PDF** + signature électronique optionnelle

### M07 — Examens & diplômes
- **Sessions d'examens** : planification, calendrier, salles
- **Convocations** candidats et surveillants
- **Anonymat des copies** (numéro d'anonymat, levée après correction)
- **Saisie notes** examen, péréquation, harmonisation
- **Jury et délibération** : PV, mentions, décisions
- **Production** : relevés de notes, attestations, **diplômes** (parchemin imprimable)
- **Supérieur** : ECTS, compensation, validation semestres
- **Formation pro** : certification, titre RNCP-like, blocs de compétences

### M08 — LMS / Pédagogie numérique
- **Espace cours** : description, programme, ressources (vidéo, PDF, liens)
- **Devoirs** : énoncé, dépôt en ligne, correction, note, retour
- **Quiz & évaluations en ligne** : QCM, ouvert, glisser-déposer, auto-correction
- **Classe virtuelle** : intégration BigBlueButton, Jitsi, Teams, Zoom
- **Détection de plagiat** : intégration externe (Compilatio, Turnitin)
- **Suivi progression** : temps passé, complétion, badges
- **Standards** : LTI 1.3, SCORM 1.2/2004, xAPI

### M09 — Communication
- **Messagerie interne** : conversations enseignants/parents/élèves/admin, fil par classe
- **Cahier de textes / cahier de liaison** : devoirs, leçons, mots d'absence
- **Annonces** : par classe, niveau, établissement, multi-canal
- **Notifications** : push (PWA + native), SMS (passerelle locale Maroc), email, WhatsApp Business
- **Sondages & demandes** : autorisations sortie, choix options, inscriptions activités

### M10 — Finance & facturation
- **Frais de scolarité** : grille tarifaire par profil (filière, niveau, bourse, fratrie)
- **Échéancier** : mensuel/trimestriel, configurable
- **Facturation** : factures, avoirs, reçus (conformes normes locales)
- **Paiement en ligne** :
  - **CMI** (Centre Monétique Interbancaire Maroc) — priorité
  - Stripe (cartes internationales)
  - Virement avec rapprochement automatique
  - Espèces / chèque en caisse
- **Relances automatiques** : J+7, J+15, J+30, escalade
- **Bourses & remises** : configurables, justifiées
- **Comptabilité** : exports (Sage, Ciel, formats locaux), comptes auxiliaires
- **Caisse** : tenue de caisse multi-utilisateurs, clôture journalière

### M11 — RH & enseignants
- **Dossier personnel** : contrats, diplômes, qualifications
- **Heures** : service prévu, heures effectuées, heures supplémentaires, vacations
- **Absences enseignants** : congés, maladie, formation
- **Évaluation** : entretiens annuels, objectifs
- **Formation continue** : plan, suivi
- **Paie** : calcul ou interface avec logiciel paie (export)

### M12 — Bibliothèque (CDI / médiathèque)
- **Catalogage** : Dublin Core, MARC21 simplifié, codes-barres
- **Prêts/retours** : durées paramétrables, prolongations
- **Réservations**, suggestions d'achat
- **Recherche** : par titre, auteur, mot-clé, ISBN
- **Statistiques** : taux d'emprunt, top, par classe

### M13 — Restauration & transport
- **Cantine** :
  - Régimes alimentaires, allergies (lien M14)
  - Réservation repas, menus hebdo
  - Pointage (badge, QR), prépaiement
- **Transport scolaire** :
  - Circuits, arrêts, véhicules, conducteurs
  - Inscription élèves, pointage montée/descente, alertes parents

### M14 — Infirmerie & santé
- **Dossier médical** : antécédents, allergies, traitements, PAI/PAP
- **Vaccinations** : carnet numérique, alertes échéances
- **Passages infirmerie** : motif, soins, suite donnée
- **Urgences** : contacts, autorisations parentales

### M15 — Pilotage & décisionnel (BI)
- **Tableaux de bord** :
  - Direction : effectifs, réussite, recouvrement, climat
  - Pédagogique : moyennes, absentéisme, décrochage
  - Financier : encaissements, impayés, projections
- **Indicateurs réglementaires** : exports MEN / ministère de tutelle
- **Cohortes** : suivi promotions, taux de réussite, devenir
- **IA** :
  - Détection précoce du décrochage (modèle prédictif sur présence + notes)
  - Suggestions d'appréciations (LLM)
  - Chatbot scolarité (parents/élèves) — FAQ contextualisée

### M16 — Plateforme & intégrations
- **API REST + GraphQL** documentées (OpenAPI), authent OAuth2 client credentials
- **Webhooks** : événements (note saisie, paiement reçu, absence déclarée)
- **Standards éducatifs** :
  - **LTI 1.3** (outils tiers branchables dans le LMS)
  - **OneRoster 1.2** (échange élèves/classes/notes)
  - **xAPI / SCORM** (suivi pédagogique)
- **SSO** : SAML 2.0, OIDC, Google Workspace for Education, Microsoft Entra
- **Imports/exports** : CSV, XLSX, formats locaux (Massar, MEN MA)
- **Applications mobiles** :
  - App parents/élèves (iOS + Android, ou PWA installable)
  - App enseignants (appel, notes, communication)
- **Portail public** : site vitrine + portail candidats

---

## 5. Exigences transverses

### 5.1 Internationalisation
- **Langues** : FR (par défaut), AR (RTL complet), EN (V2)
- **Formats** : dates (FR + hégire optionnel), nombres, devises (MAD, EUR, USD, TND, DZD)
- **Calendriers** : grégorien + hégire (affichage parallèle pour vacances religieuses)

### 5.2 Accessibilité
- **WCAG 2.1 niveau AA** sur tous les portails
- Navigation clavier complète, contrastes, lecteurs d'écran
- Mode haut contraste, taille de police ajustable

### 5.3 Sécurité
- **Authentification** : mot de passe + MFA optionnel (TOTP, SMS), SSO
- **Autorisation** : RBAC fin, ABAC pour cas complexes (ex: parent ↔ enfant)
- **Chiffrement** : TLS 1.3 transit, AES-256 au repos (documents sensibles, données médicales)
- **Audit log** immuable
- **Gestion des sessions** : timeout configurable, révocation
- **Tests de sécurité** : SAST/DAST en CI, pentest annuel

### 5.4 Conformité
- **Loi 09-08** (protection données personnelles Maroc) + CNDP
- **RGPD** (pour clients européens / multi-pays)
- **Hébergement souverain** : option datacenter Maroc (N+ONE, Maroc Data Center)
- **Durées de conservation** configurables par type de donnée
- **Droit à l'oubli**, export données (portabilité)

### 5.5 Performance
- **Temps de réponse** : < 300 ms p95 sur opérations courantes
- **Disponibilité** : SLA 99,5 % (V1), 99,9 % (V2)
- **Scalabilité** : supporter 500 tenants, 500 000 utilisateurs actifs
- **Mode dégradé** offline pour appel mobile en classe (sync différée)

### 5.6 Observabilité
- Logs structurés (JSON), traces distribuées (OpenTelemetry)
- Monitoring (Prometheus/Grafana ou équivalent SaaS)
- Alerting (erreurs, latence, échec paiement, échec import)

---

## 6. Parcours utilisateurs clés (résumés)

### PU-01 — Inscription d'un nouvel élève (K-12)
1. Parent crée un compte sur portail public.
2. Remplit formulaire candidature, dépose pièces (CIN, acte naissance, bulletins antérieurs).
3. Paie frais de dossier via CMI.
4. Admin valide pièces, programme un entretien.
5. Commission décide → notification parent (admis / liste d'attente / refusé).
6. Si admis : signature électronique contrat, paiement 1ère échéance, affectation classe.
7. Génération automatique des accès parent + élève.

### PU-02 — Saisie appel et notification parent
1. Enseignant ouvre app mobile, sélectionne son cours du moment.
2. Coche absents/retards en 1 tap par élève.
3. Validation → notification push parent dans la minute.
4. Parent justifie depuis son app, pièce jointe optionnelle.
5. CPE valide ou rejette la justification.

### PU-03 — Génération bulletin trimestriel
1. Période de saisie ouverte → enseignants saisissent notes + appréciations.
2. Verrouillage automatique à date limite.
3. Conseil de classe : appréciations générales, décisions.
4. Génération PDF en masse (job asynchrone).
5. Diffusion : notification parent, téléchargement portail, archivage dossier élève.

### PU-04 — Paiement échéance scolarité
1. Parent reçoit notification 7j avant échéance.
2. Connexion portail → voit l'échéancier annuel.
3. Paie via CMI (3D Secure).
4. Reçu PDF généré et envoyé par email.
5. Mise à jour automatique du dossier financier élève.

### PU-05 — Délibération supérieur (UE/ECTS)
1. Fin de semestre : notes saisies, calcul moyennes UE + crédits acquis.
2. Jury : revue cas particuliers, compensations.
3. Décisions : validé / ajourné / session de rattrapage.
4. Génération relevés + notifications étudiants.

---

## 7. Hors-périmètre V1

- Comptabilité générale complète (lien avec logiciel comptable spécialisé)
- Paie complète (export vers Sage Paie ou équivalent)
- E-commerce (boutique fournitures, billetterie événements)
- Réseau social interne type Edmodo

---

## 8. Métriques de succès

| Métrique | Cible 12 mois |
|---|---|
| Établissements clients | 30 |
| Apprenants gérés | 25 000 |
| Taux d'adoption parents (app) | > 70 % |
| Taux de recouvrement digital | > 60 % paiements en ligne |
| NPS | > 40 |
| Disponibilité plateforme | ≥ 99,5 % |

---

## 9. Annexes

- **Glossaire** : voir `docs/glossaire.md` (à produire)
- **Maquettes** : voir `docs/maquettes/` (à produire)
- **Modèle de données** : voir `docs/architecture.md`
- **Veille concurrentielle détaillée** : voir `docs/veille.md` (à produire)
