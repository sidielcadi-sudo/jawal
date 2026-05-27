# Jawal — Glossaire tri-segment

> Terminologie unifiée pour les trois segments couverts par Jawal.
> Ce glossaire sert de référence pour le code (noms d'entités, libellés), l'i18n et la documentation.

---

## 1. Concepts pivots et correspondance entre segments

| Concept Jawal | K-12 (primaire/secondaire) | Enseignement supérieur | Formation professionnelle |
|---|---|---|---|
| **Tenant** | Établissement / école | Établissement / faculté / école | Centre / organisme de formation |
| **AcademicYear** | Année scolaire (2025-2026) | Année universitaire (2025-2026) | Année / promotion |
| **Period** | Trimestre | Semestre | Session / module |
| **Cycle** | Primaire, collège, lycée | Licence, master, doctorat | Niveau (qualifiant, spécialisation) |
| **Level** | CP, CE1, … 6ème, 3ème, Tle | L1, L2, L3, M1, M2 | Niveau 1, niveau 2 |
| **Class** | Classe (« 6ème A ») | Groupe TD / TP / promotion | Groupe / session formation |
| **Subject** (M06+) | Matière (maths, français) | UE / module / cours | Bloc de compétences |
| **Person : STUDENT** | Élève | Étudiant | Apprenant / stagiaire |
| **Person : TEACHER** | Enseignant / professeur | Enseignant-chercheur / vacataire | Formateur |
| **Person : PARENT** | Parent / responsable légal | (rarement utilisé) | (rarement utilisé) |
| **Evaluation** | Note (devoir, contrôle) | Note (CC, examen, projet) | Évaluation (théorique, pratique, mise en situation) |
| **Bulletin** | Bulletin trimestriel | Relevé de notes semestriel | Attestation / livret de progression |
| **Diploma** | Brevet, baccalauréat | Licence, master, diplôme d'ingénieur | Titre RNCP-like / certification |
| **Attendance** | Appel / absence | Émargement | Émargement (obligation Qualiopi-like) |
| **Tuition** | Frais de scolarité | Frais d'inscription + scolarité | Frais de formation (souvent financés OPCO-like) |
| **Council** | Conseil de classe | Jury d'année / commission pédagogique | Jury de certification |

**Règle d'or** : dans le code, on utilise les **termes Jawal** (anglais neutres). Les **libellés affichés** sont fournis par la couche i18n et adaptés au profil du tenant.

---

## 2. Concepts spécifiques par segment

### 2.1 K-12 (primaire/secondaire)

| Terme | Définition |
|---|---|
| **Vie scolaire** | Ensemble des activités hors enseignement (surveillance, discipline, autorisations) |
| **CPE** | Conseiller Principal d'Éducation (France) / surveillant général (Maroc) |
| **LSU** | Livret Scolaire Unique numérique (France) — référence pour l'évaluation par compétences |
| **Conseil de classe** | Réunion périodique enseignants pour évaluation collective |
| **Carnet de correspondance** | Carnet/cahier de liaison école ↔ famille |
| **Sortie pédagogique** | Activité hors enceinte, requiert autorisation parentale |

### 2.2 Enseignement supérieur

| Terme | Définition |
|---|---|
| **UE** | Unité d'Enseignement — bloc de cours avec crédits associés |
| **ECTS** | European Credit Transfer System — système de crédits européen (1 année = 60 ECTS) |
| **CM / TD / TP** | Cours Magistral / Travaux Dirigés / Travaux Pratiques |
| **Contrôle Continu (CC)** | Évaluations en cours de semestre |
| **Examen final** | Évaluation en fin de période |
| **Compensation** | Mécanisme permettant la validation par moyenne entre UE/semestres |
| **Rattrapage / 2e session** | Session de repêchage pour les UE non validées |
| **Jury** | Commission validant l'obtention de l'année / du diplôme |
| **Mention** | Passable, AB, B, TB |
| **Stage** | Période en entreprise, avec convention tripartite |

### 2.3 Formation professionnelle

| Terme | Définition |
|---|---|
| **Bloc de compétences** | Ensemble cohérent de compétences pouvant être certifié indépendamment |
| **Certification / titre RNCP** | Reconnaissance officielle d'une qualification (France ; équivalents marocains via DFP) |
| **Émargement** | Signature de présence (souvent obligation légale pour financement) |
| **Convention de formation** | Contrat entre organisme, stagiaire et financeur |
| **OPCO** | Opérateur de Compétences (France) — financeur. Au Maroc : Anapec, GIAC, OFPPT |
| **Qualiopi** | Certification qualité organismes de formation (France). Référentiel marocain en évolution |
| **Pré-requis** | Conditions d'accès à une formation |
| **Évaluation des acquis** | Mesure des compétences en fin de formation (théorie + pratique + situation) |

---

## 3. Acronymes et entités externes (contexte Maroc)

| Sigle | Signification |
|---|---|
| **MEN** | Ministère de l'Éducation Nationale |
| **CNDP** | Commission Nationale de contrôle de la Protection des Données personnelles |
| **CMI** | Centre Monétique Interbancaire — opérateur cartes bancaires |
| **AREF** | Académie Régionale de l'Éducation et de la Formation |
| **OFPPT** | Office de la Formation Professionnelle et de la Promotion du Travail |
| **DFP** | Département de la Formation Professionnelle |
| **Anapec** | Agence Nationale de Promotion de l'Emploi et des Compétences |
| **Massar** | Système d'information scolaire du MEN |
| **CIN** | Carte d'Identité Nationale |
| **Loi 09-08** | Loi marocaine sur la protection des données personnelles |

---

## 4. Acronymes techniques utilisés dans Jawal

| Sigle | Signification |
|---|---|
| **SIS** | Student Information System — système d'information scolaire |
| **LMS** | Learning Management System — plateforme pédagogique |
| **ERP** | Enterprise Resource Planning — système intégré de gestion |
| **RBAC / ABAC** | Role-Based / Attribute-Based Access Control |
| **RLS** | Row-Level Security (PostgreSQL) |
| **LTI** | Learning Tools Interoperability — standard d'intégration outils pédagogiques |
| **xAPI / SCORM** | Standards de traçage d'activités d'apprentissage |
| **OneRoster** | Standard d'échange d'inventaires scolaires (élèves, classes, notes) |
| **SSO / OIDC / SAML** | Single Sign-On / OpenID Connect / Security Assertion Markup Language |
| **SLA** | Service Level Agreement — engagement de niveau de service |
| **WCAG / RGAA** | Standards d'accessibilité (international / France) |

---

## 5. Conventions de nommage dans le code

- **Entités Prisma** : `PascalCase` en anglais neutre (`Student`, `Class`, `Bulletin`).
- **Colonnes BDD** : `snake_case` (Prisma `@map`).
- **Énumérations** : `SCREAMING_SNAKE_CASE` (`PersonType.STUDENT`).
- **Permissions** : `<module>.<action>` minuscules (`grades.write`).
- **Clés i18n** : `<scope>.<feature>.<detail>` (`bulletins.create.success`).
- **Slugs tenants** : `kebab-case` minuscules sans accents.
