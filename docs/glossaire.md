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

## 5. Spécificités du système éducatif marocain

### 5.1 Organisation administrative MEN

| Sigle / Terme | Description |
|---|---|
| **MEN** | Ministère de l'Éducation Nationale, du Préscolaire et des Sports |
| **AREF** | Académie Régionale d'Éducation et de Formation — 12 académies régionales (une par région administrative) |
| **DP** | Direction Provinciale — relais de l'AREF dans chaque province |
| **CT** | Cellule Territoriale — équivalent local de la DP |
| **Massar** | Système d'information national obligatoire pour tous les établissements (publics et privés homologués) — Jawal doit pouvoir exporter au format Massar |
| **Taalim.ma** | Portail e-services du MEN (résultats examens, inscriptions) |
| **GRESA** | Gestion des Ressources Humaines des Établissements Scolaires et des Académies |
| **ESISE** | Enquête Statistique Intégrée du Système Éducatif — collecte annuelle |

### 5.2 Structure pédagogique K-12 au Maroc

| Niveau | Code MEN | Âge | Cycle |
|---|---|---|---|
| Préscolaire | PSC | 4-5 ans | Enseignement préscolaire |
| 1ʳᵉ année primaire | 1AP | 6 ans | Primaire |
| 2ᵉ année primaire | 2AP | 7 ans | Primaire |
| 3ᵉ année primaire | 3AP | 8 ans | Primaire |
| 4ᵉ année primaire | 4AP | 9 ans | Primaire |
| 5ᵉ année primaire | 5AP | 10 ans | Primaire |
| 6ᵉ année primaire | 6AP | 11 ans | Primaire (fin) |
| 1ʳᵉ année collège | 1AC | 12 ans | Secondaire collégial |
| 2ᵉ année collège | 2AC | 13 ans | Secondaire collégial |
| 3ᵉ année collège | 3AC | 14 ans | Secondaire collégial (fin, BEC) |
| Tronc commun | TC | 15 ans | Secondaire qualifiant |
| 1ʳᵉ année baccalauréat | 1BAC | 16 ans | Secondaire qualifiant (Bac régional) |
| 2ᵉ année baccalauréat | 2BAC | 17 ans | Secondaire qualifiant (Bac national) |

**Note importante** : Les terminologies « 6ème », « 3ème », « Terminale » utilisées en France ne s'appliquent **pas** au Maroc. Le profil tenant `MAROC_K12` doit utiliser la nomenclature MEN ci-dessus.

### 5.3 Examens et certifications au Maroc

| Examen | Quand | Description |
|---|---|---|
| **CEP** (Certificat d'Études Primaires) | Fin 6AP | Examen normalisé fin du primaire |
| **BEC** (Brevet d'Études Collégiales) | Fin 3AC | Examen régional fin du collège (anciennement BEPC) |
| **Bac régional** | Fin 1BAC | Examen organisé par l'AREF — compte pour 25 % de la note finale du baccalauréat |
| **Bac national** | Fin 2BAC | Examen national — compte pour 75 % de la note finale |
| **Note finale Bac** | — | Moyenne pondérée : 25 % bac régional + 50 % bac national + 25 % contrôle continu 2BAC |
| **Mention** | — | Passable (10-12), Assez Bien (12-14), Bien (14-16), Très Bien (16-18), Excellent (18-20) |

### 5.4 Filières du baccalauréat marocain

| Filière | Code | Branches |
|---|---|---|
| Sciences Mathématiques | SM | A, B |
| Sciences Expérimentales | SE | SVT, PC, SA (Sciences Agronomiques) |
| Sciences et Technologies | ST | Mécanique, Électrique |
| Sciences Économiques | SEG | — |
| Lettres et Sciences Humaines | LSH | Lettres, Sciences humaines |
| Arts Appliqués | AA | — |
| Enseignement Originel | EO | Lettres, Sciences |
| Bac International (BIOF) | BIOF | Option française pour les filières scientifiques |

### 5.5 Barèmes de notation au Maroc

- **Échelle** : sur **20** (la plus courante), sur **10** parfois en primaire
- **Seuil de validation** : généralement **10/20**
- **Coefficients** : variables selon filière (ex. en SM : Maths coef 9, Physique coef 7, Français coef 4)
- **Note de classe (CC)** : généralement contrôle continu + 1 ou 2 contrôles trimestriels
- **Compensation** : non systématique au K-12 (chaque matière doit atteindre une moyenne minimale dans certaines filières)
- **Conseil de classe** : à chaque fin de trimestre, donne un avis et peut décider d'un avertissement / encouragement / félicitations

### 5.6 Types d'établissement au Maroc

| Type | Description | Volume marché |
|---|---|---|
| **Public** | Géré par le MEN, gratuit, utilise Massar obligatoirement | ~10 000 établissements, hors cible Jawal V1 |
| **Privé homologué** | Suit le programme MEN, agrément ministériel, frais à la charge des familles | ~3 800 établissements, **cœur de cible Jawal** |
| **Mission française** (AEFE, OSUI) | Programme français + arabe, lycées français à l'étranger | ~40 établissements, segment premium |
| **Mission espagnole** | Programme espagnol | ~10 établissements |
| **École américaine** | Programme américain (Common Core, IB) | ~10 établissements (Casa, Rabat, Tanger, Marrakech) |
| **Écoles confessionnelles** | Catholiques, juives | Quelques dizaines |
| **Pacte privé** | Établissements privés en convention avec le MEN | ~200 établissements |

### 5.7 Formation professionnelle au Maroc

| Acteur / Concept | Description |
|---|---|
| **DFP** | Département de la Formation Professionnelle (Ministère de l'Inclusion Économique, de la PME, de l'Emploi et des Compétences) |
| **OFPPT** | Office de la Formation Professionnelle et de la Promotion du Travail — opérateur public dominant (700 000+ stagiaires/an) |
| **GIAC** | Groupements Interprofessionnels d'Aide au Conseil — financement de la formation continue |
| **Anapec** | Agence Nationale de Promotion de l'Emploi et des Compétences |
| **CSF** | Contrats Spéciaux de Formation — co-financement OFPPT/entreprises |
| **Niveau de qualification** | Spécialisation (NS), Qualification (NQ), Technicien (NT), Technicien Spécialisé (NTS) |
| **Durée typique** | 1-2 ans selon niveau |
| **Insertion** | Suivi obligatoire des taux d'insertion à 6, 12, 24 mois |
| **CSF / OFPPT** | Réformes en cours pour structurer un référentiel national des compétences |
| **Cités des Métiers et des Compétences (CMC)** | Nouveau dispositif lancé en 2022 (Souss-Massa, puis autres régions) |

### 5.8 Enseignement supérieur au Maroc

| Acteur / Concept | Description |
|---|---|
| **MES** | Ministère de l'Enseignement Supérieur, de la Recherche Scientifique et de l'Innovation |
| **Université publique** | 13 universités d'État (UM5, UH2, UM6P n'est pas publique mais privée d'utilité publique, etc.) |
| **Université privée reconnue** | Reconnaissance d'État (UM6P, UIR, UPM, UEMF, ...) |
| **École privée à reconnaissance partielle** | Programmes spécifiques reconnus (ENCG privée, ESC privée) |
| **Système LMD** | Adopté depuis 2003 : Licence (Bac+3), Master (Bac+5), Doctorat (Bac+8) |
| **CNE** | Code National Étudiant — identifiant unique étudiant au niveau national |
| **Massinia** | Plateforme de candidature en ligne pour les universités publiques |
| **Apogée** | (côté France, mais utilisé par les conventions franco-marocaines) |
| **CMR** | Caisse Marocaine des Retraites — pour les enseignants fonctionnaires |

### 5.9 Calendrier scolaire marocain typique

| Période | Dates indicatives (varient chaque année selon décret MEN) |
|---|---|
| Rentrée scolaire | Première semaine de septembre |
| Vacances Aïd Al Mawlid | 1-2 jours autour de l'événement (calendrier hégire) |
| Vacances de la Toussaint | 1 semaine fin octobre / début novembre |
| Vacances de fin d'année | 2 semaines fin décembre |
| Vacances de mi-année | 1 semaine fin janvier |
| Vacances de printemps | 2 semaines avril |
| Vacances Aïd Al Fitr | 2-4 jours (calendrier hégire) |
| Vacances Aïd Al Adha | 2-4 jours (calendrier hégire) |
| Fin année scolaire | Dernière semaine de juin / première semaine de juillet |
| Bac national | Mi-juin |
| Examens session de rattrapage | Début juillet |

**Implication produit** : Jawal doit afficher **calendrier grégorien + dates hégire en parallèle** pour les fêtes religieuses, et permettre à l'admin de saisir les vacances chaque année (le décret MEN fixe les dates officielles).

### 5.10 Devises et fiscalité

| Aspect | Détail |
|---|---|
| **Devise** | Dirham marocain (MAD), 1 EUR ≈ 11 MAD (2026) |
| **TVA** | 20 % standard ; éducation **exonérée** (article 91 du Code Général des Impôts) |
| **Numéro ICE** | Identifiant Commun de l'Entreprise — obligatoire sur toute facture, format 15 chiffres |
| **N° patente / RC / IF** | Patente, Registre du Commerce, Identifiant Fiscal — à afficher sur les factures |
| **Mention TVA exonérée** | « TVA exonérée selon l'article 91 du CGI » sur factures d'enseignement |

### 5.11 Protection des données — loi 09-08

| Aspect | Implication produit |
|---|---|
| **CNDP** | Commission Nationale de contrôle de la Protection des Données — déclaration obligatoire de tout traitement de données personnelles |
| **Déclaration préalable** | Avant tout traitement de DCP (données à caractère personnel) |
| **Consentement** | Explicite pour mineurs (via le responsable légal) |
| **Hébergement hors Maroc** | Nécessite une autorisation de transfert (sauf pays « adéquats » dont la liste évolue) |
| **Droit d'accès, rectification, opposition** | À implémenter dans le portail parent/élève |
| **Données sensibles** | Données médicales/scolaires de mineurs = catégorie sensible, garanties renforcées |
| **Sanctions** | Jusqu'à 300 000 MAD + 1 an d'emprisonnement |

---

## 6. Conventions de nommage dans le code

- **Entités Prisma** : `PascalCase` en anglais neutre (`Student`, `Class`, `Bulletin`).
- **Colonnes BDD** : `snake_case` (Prisma `@map`).
- **Énumérations** : `SCREAMING_SNAKE_CASE` (`PersonType.STUDENT`).
- **Permissions** : `<module>.<action>` minuscules (`grades.write`).
- **Clés i18n** : `<scope>.<feature>.<detail>` (`bulletins.create.success`).
- **Slugs tenants** : `kebab-case` minuscules sans accents.
- **Codes niveaux MEN** : conserver les codes officiels (1AP, 6AP, 1AC, 1BAC, etc.) — ne pas franciser en "6ème", "Terminale", etc.
