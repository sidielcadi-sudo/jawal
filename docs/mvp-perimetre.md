# Jawal — Périmètre MVP

> **Objectif** : livrer en **~3 mois** un produit utilisable en conditions réelles par **un établissement K-12 privé marocain**, démontrant la valeur sur les processus quotidiens les plus douloureux (appel, notes, communication parents, paiement).
> Cibles secondaires (Sup / Formation pro) sont préparées par l'architecture mais leurs spécificités sortent du MVP.

---

## 1. Principes du MVP

1. **Un seul segment cible (K-12), un seul client pilote** — pour valider la valeur sans se disperser.
2. **Bout en bout** sur quelques processus, pas survol des 16 modules.
3. **Multi-tenant dès le jour 1** — c'est l'ADN du produit, on ne le rétrofitte pas.
4. **Bilinguisme FR/AR** dès le MVP — sinon imposible à intégrer après coup.
5. **Mobile-first** sur les portails parent et enseignant (PWA installable, pas d'app native pour le MVP).
6. **Pas d'IA** dans le MVP (sauf si gain temps de dev > coût intégration — improbable à ce stade).
7. **CMI obligatoire** — sans paiement en ligne CMI, l'argument commercial Maroc s'effondre.

---

## 2. Modules retenus pour le MVP (5 + Core)

| Module | Statut MVP | Périmètre retenu | Reporté |
|---|---|---|---|
| **M01 Core** | ✅ Complet | Tenants, users, persons, RBAC, audit, années, périodes, cycles, niveaux, classes, salles, i18n FR/AR, super-admin SaaS | — |
| **M02 Admissions** | ⚠️ Léger | Inscription manuelle par l'admin (saisie + pièces) | Workflow candidature en ligne, commissions, tests d'entrée |
| **M03 Scolarité** | ✅ Complet | Dossier élève 360° (admin, pédago, financier, doc officiels), affectation classes, multi-parents | Médical (voir M14, hors MVP) |
| **M04 EDT** | ⚠️ Léger | Saisie manuelle EDT (drag & drop), vues par classe/prof/salle | Générateur automatique, remplacements complexes |
| **M05 Présences** | ✅ Complet | Appel mobile (PWA), absences/retards, justifications, notifications parents | Sanctions, conseil discipline, statistiques avancées |
| **M06 Notes/Bulletins** | ✅ Complet | Saisie notes (barème /20, coeffs, moyennes, rangs), appréciations, conseil de classe, génération bulletin PDF FR/AR | Compétences LSU, signature électronique |
| **M07 Examens** | ❌ Reporté V1 | — | Tout |
| **M08 LMS** | ❌ Reporté V2 | — | Tout |
| **M09 Communication** | ⚠️ Léger | Annonces établissement/classe, notifications push (web) + email, messagerie 1↔1 parent/enseignant | WhatsApp Business, SMS, sondages, cahier de textes complet |
| **M10 Finance** | ✅ Complet | Échéanciers, factures, paiement CMI, paiement caisse, reçus PDF, relances manuelles | Stripe, exports compta, bourses complexes, relances auto |
| **M11 RH** | ❌ Reporté V1 | — | Tout |
| **M12 Bibliothèque** | ❌ Reporté V2 | — | Tout |
| **M13 Restauration/Transport** | ❌ Reporté V2 | — | Tout |
| **M14 Santé** | ❌ Reporté V2 | — | Tout |
| **M15 Pilotage** | ⚠️ Léger | Dashboard direction basique (effectifs, taux d'absentéisme, encaissement mois) | BI complet, IA, exports MEN |
| **M16 Plateforme** | ⚠️ Léger | API REST minimale (auth, élèves, classes), SSO Google, import CSV élèves | LTI, OneRoster, SAML, mobile native, webhooks |

**Résumé** : 5 modules livrés "complets" + Core + 4 modules "légers" → **couvre 80 % de la valeur quotidienne** pour une école privée K-12.

---

## 3. Parcours utilisateurs MVP (golden paths)

### PU-MVP-01 — Onboarding établissement (jour J)
1. Super-admin Jawal crée le tenant (slug, profil K-12, branding).
2. Admin établissement reçoit invitation par email, définit son mot de passe (MFA optionnel).
3. Import CSV de la nomenclature : niveaux, classes, salles.
4. Import CSV élèves + parents (template fourni).
5. Affectation auto élèves ↔ classes via le CSV.

### PU-MVP-02 — Quotidien enseignant (mobile PWA)
1. Login → vue "Mes cours du jour".
2. Tap sur un cours → liste élèves de la classe.
3. Appel : 1 tap par élève (présent/absent/retard).
4. Validation → notifications push parents.
5. (En fin de période) Saisie des notes du contrôle → calcul auto moyenne classe.

### PU-MVP-03 — Quotidien parent (mobile PWA)
1. Login → tableau de bord enfant (présences semaine, prochaines évaluations, échéances paiement).
2. Notification push absence → ouvre l'app, saisit justification + photo certificat médical.
3. Notification "Échéance scolarité dans 7j" → tap "Payer" → CMI 3DS → reçu téléchargé.
4. Onglet "Messages" → conversation avec professeur principal.

### PU-MVP-04 — Cycle d'évaluation trimestriel (admin + enseignants)
1. Admin ouvre la période de saisie (date début/fin).
2. Enseignants saisissent notes + appréciations (rappels J-3 si retard).
3. Verrouillage automatique à date limite.
4. Conseil de classe : appréciations générales + décision.
5. Admin lance la génération en masse des bulletins PDF (FR par défaut, AR sur demande).
6. Bulletins disponibles dans l'espace parent + notification.

### PU-MVP-05 — Paiement et recouvrement
1. Admin configure la grille tarifaire annuelle par niveau + échéancier mensuel.
2. Génération auto des appels à paiement par élève à chaque échéance.
3. Parent paie via CMI ou se présente en caisse (admin enregistre).
4. Reçu PDF généré, dossier financier mis à jour.
5. Admin consulte le tableau "impayés" pour relances manuelles.

---

## 4. Hors-périmètre MVP (à dire explicitement aux clients pilotes)

- Pas de génération automatique d'emploi du temps (saisie manuelle uniquement)
- Pas de classe virtuelle ni de devoirs en ligne (LMS V2)
- Pas de bibliothèque / cantine / transport / infirmerie (V2)
- Pas de gestion RH/paie enseignants (V1)
- Pas d'applications mobiles natives (PWA seulement — installable mais pas dans les stores)
- Pas de WhatsApp Business ni SMS dans le MVP (push web + email uniquement)
- Pas de bulletins par compétences LSU (V1)
- Pas d'IA (V2)
- Pas d'API publique formelle (REST interne uniquement)

---

## 5. Roadmap MVP — 6 sprints de 2 semaines (~3 mois)

| Sprint | Dates indicatives | Livrables |
|---|---|---|
| **S0** | Sem 1-2 | ✅ Monorepo + CI/CD, Docker dev, Prisma + RLS opérationnel (test isolation), Auth.js, i18n FR/AR, design system de base, super-admin SaaS minimal |
| **S1** | Sem 3-4 | **Core complet** : tenants UI, users invités, persons CRUD, années/cycles/niveaux/classes/salles, RBAC, audit log, import CSV |
| **S2** | Sem 5-6 | **Scolarité** : dossier élève 360°, affectations classes, multi-parents, documents officiels (certif scolarité PDF) |
| **S3** | Sem 7-8 | **Présences** + **Communication** : appel mobile PWA, justifications, notifications push web + email, messagerie 1↔1, annonces |
| **S4** | Sem 9-10 | **Notes & Bulletins** : saisie notes, moyennes/rangs, appréciations, conseil de classe, génération bulletin PDF FR + AR |
| **S5** | Sem 11-12 | **Finance + CMI** : grille tarifaire, échéancier, factures, intégration CMI sandbox + prod, paiement caisse, reçus PDF |
| **S6** | Sem 13-14 | **Pilotage léger** + **Hardening** : dashboard direction, tests e2e bilingues, accessibilité, perf, doc utilisateur, démo |

**Jalons** :
- **J+45** : démo interne (S0-S2 livrés) — vérification architecture
- **J+90** : pilote chez 1er client — tous les modules MVP opérationnels
- **J+120** : feedback pilote + corrections → V1.0 prête à signer client #2

---

## 6. Équipe minimale recommandée

| Rôle | ETP | Périmètre |
|---|---|---|
| **Tech lead / Architecte** | 1 | Conception, code review, RLS, sécurité |
| **Dev full-stack senior TS** | 1 | Modules Core + Scolarité + Notes + Finance |
| **Dev full-stack** | 1 | Modules Présences + Communication + UI |
| **Designer produit (mi-temps)** | 0,5 | UX/UI, design system, accessibilité, RTL |
| **Consultant métier scolaire (mi-temps)** | 0,5 | Spec fonctionnelle, recette, relation pilote |
| **Total** | **4 ETP** | sur 3 mois |

---

## 7. Critères de succès MVP (à 90 jours)

| Indicateur | Cible |
|---|---|
| Établissement pilote opérationnel | 1 école, 200+ élèves, 20+ enseignants |
| Appel mobile : taux d'usage enseignants | ≥ 80 % des cours saisis |
| Communication parents : taux d'activation | ≥ 60 % des parents connectés au moins 1 fois/semaine |
| Bulletin trimestriel généré et distribué | 100 % des élèves, sans incident bloquant |
| Paiement CMI fonctionnel | ≥ 30 % des échéances payées en ligne |
| Disponibilité plateforme | ≥ 99 % sur 30 jours glissants |
| Bugs bloquants en prod | 0 sur 30 jours |
| NPS pilote | ≥ +30 |

---

## 8. Risques MVP et mitigation

| Risque | Probabilité | Mitigation |
|---|---|---|
| Conventionnement CMI long (8-12 sem) | Élevée | Démarrer la demande **dès S0**, prévoir Stripe en backup pour démo |
| Intégration RLS PostgreSQL bug subtil | Moyenne | POC dès S0 + tests d'isolation automatisés en CI sur **chaque PR** |
| Génération bulletins AR/RTL incorrecte | Moyenne | Sprint S4 commence par un POC PDF AR (police, sens, alignement) |
| Client pilote change d'avis ou freeze | Moyenne | Signer **2 pilotes** dès le départ, l'un payant l'autre gratuit |
| Sous-estimation du temps i18n AR | Élevée | Mobiliser le designer + un relecteur arabophone dès S1 |
| Conformité CNDP non vérifiée à temps | Moyenne | Audit DPO externe planifié au S5, **avant la mise en prod pilote** |

---

## 9. Après le MVP — Vision V1 (mois 4-6)

Sur la base du MVP livré et des retours pilote :
- **Admissions en ligne** complètes (workflow candidature, paiement frais dossier)
- **Examens** (sessions, convocations, anonymat, jurys, diplômes simples)
- **Mobile native** parents + élèves (iOS/Android) si demande pilote
- **WhatsApp Business** + **SMS** Maroc (passerelle locale)
- **RH léger** (dossier enseignant, heures, absences)
- **EDT automatique** (générateur sous contraintes)
- **Onboarding self-service** d'un 2e/3e établissement payant
