# Jawal — Veille concurrentielle

> Analyse des principaux acteurs de la gestion d'établissement scolaire,
> avec focus sur les segments K-12 / supérieur / formation pro et le marché Maghreb.
> Sources : sites éditeurs, démos publiques, témoignages utilisateurs (G2, Capterra, forums Reddit r/sysadmin, retours terrain Maroc/France 2024-2025).

---

## 1. Cartographie générale

| Catégorie | Acteurs | Cible | Présence Maghreb |
|---|---|---|---|
| **SIS K-12 international** | PowerSchool, Infinite Campus, Skyward, Alma, SchoolMint | USA principalement | Faible |
| **SIS K-12 France** | PRONOTE, EcoleDirecte, La Vie Scolaire, Aplon | France | Faible (établissements français à l'étranger) |
| **SIS K-12 Maghreb** | Massar (étatique MA), Marwa, Smart School, GestExia | Maroc / Algérie / Tunisie | Forte |
| **SIS supérieur** | Ellucian Banner, Workday Student, Anthology, Unit4, Charlemagne, Aurion, Hyperplanning | International / France | Très faible (sauf Aurion dans qq écoles) |
| **LMS** | Moodle, Canvas, Blackboard, Schoology, Google Classroom, Microsoft Teams for Education | Universel | Forte (Moodle / Google) |
| **Open-source / mid-market** | Classter, Fedena, OpenEduCat (Odoo), Gibbon, Sycamore | International | Faible |
| **Communication parents** | ClassDojo, Seesaw, Remind | K-12 USA principalement | Nulle |

---

## 2. Analyse détaillée des concurrents directs

### 2.1 PowerSchool (USA — leader mondial K-12)
- **Forces** : couverture fonctionnelle énorme (SIS + LMS Schoology + analytics + recrutement), 50M+ élèves, écosystème intégrations massif.
- **Faiblesses** : UX vieillissante (héritage 90s), tarification opaque & élevée, dépendance aux administrateurs experts, **pas de support AR/RTL**, pas de présence Maghreb, hébergement US.
- **Modèle** : SaaS, tarif par élève (~$5-15/an), contrats pluriannuels.
- **Menace pour Jawal** : faible — pas d'appétit pour le marché marocain, surcoût de localisation prohibitif.

### 2.2 PRONOTE (France — dominant K-12 secondaire)
- **Forces** : standard de facto en France (collèges/lycées), riche pour notes/bulletins/vie scolaire, app parent installée massivement, connexion EduConnect/ENT.
- **Faiblesses** : technologie client lourd vieillissante (migration web partielle), peu modulaire, AR/RTL absent, **pas de finance/facturation**, intégrations fermées, perçu comme rigide.
- **Modèle** : licence à l'établissement, tarif par tranche d'effectif.
- **Menace pour Jawal** : modérée pour les écoles françaises au Maroc (Lycée français, Mission laïque) ; nulle pour les autres.

### 2.3 EcoleDirecte (France — privé K-12)
- **Forces** : très répandu dans l'enseignement catholique français, intègre facturation parents, mobile honorable.
- **Faiblesses** : interface datée, pas de tri-segment, AR absent.
- **Menace pour Jawal** : faible, mais bon benchmark pour l'UX parent + facturation intégrée.

### 2.4 Massar (Maroc — système officiel MEN)
- **Forces** : adopté par tous les établissements publics marocains, gratuit, intégré aux examens nationaux, conforme au programme.
- **Faiblesses** : ergonomie pauvre, lenteur récurrente (rapports utilisateurs), AR partiel, **absence de modules privés** (finance, communication parents avancée), pas d'API, pas mobile.
- **Modèle** : étatique, déployé par le MEN.
- **Menace pour Jawal** : nulle dans le privé (la cible principale) ; coopétition possible côté public (Jawal en complément pour modules absents).

### 2.5 Classter (Grèce — international mid-market)
- **Forces** : modulaire, multi-segment (K-12 + sup + formation), API, multi-langue (incluant AR), tarification raisonnable.
- **Faiblesses** : pénétration faible, intégrations paiement locales absentes (pas de CMI), interface générique, support FR limité.
- **Modèle** : SaaS par utilisateur actif.
- **Menace pour Jawal** : **principal concurrent direct potentiel** au Maghreb pour les établissements internationaux ou privés ambitieux. Différenciation Jawal : intégration CMI, ergonomie FR/AR native, support local.

### 2.6 Fedena (Inde — open source + SaaS)
- **Forces** : open source (GPL), bon socle SIS, plugins.
- **Faiblesses** : code Ruby vieillissant, communauté en perte de vitesse, UI datée, AR non natif.
- **Menace** : faible.

### 2.7 OpenEduCat (module Odoo)
- **Forces** : sur stack Odoo (très riche pour ERP/finance/RH), modulaire, open source, présence francophone via partenaires.
- **Faiblesses** : pédagogie générique (pas de bulletin LSU-like fin), dépendance à Odoo (montée en compétence), AR limité.
- **Menace** : modérée — séduit les écoles ayant déjà Odoo.

### 2.8 Aurion / Charlemagne (France — supérieur)
- **Forces** : référence dans l'enseignement supérieur français privé, gestion ECTS/jurys, planning intégré.
- **Faiblesses** : sur-mesure coûteux, déploiement long, peu mobile, AR absent.
- **Menace pour Jawal** : faible (cible différente, mais bon benchmark pour le module Supérieur).

### 2.9 Marwa / Smart School / GestExia (acteurs Maghreb)
- **Forces** : connaissance du marché local (CMI, MEN, calendrier hégire), tarifs accessibles, support en arabe.
- **Faiblesses** : produits techniquement peu ambitieux (souvent PHP monolithique), peu modulaires, UX en retard de 10 ans, absence de tri-segment, peu d'investissement R&D, **pas d'IA**, mobile faible.
- **Menace pour Jawal** : modérée — ce sont les concurrents les plus proches du marché. Différenciation Jawal : qualité produit, mobile-first, IA, API ouverte, tri-segment.

### 2.10 ClassDojo / Seesaw / Remind (communication K-12)
- **Forces** : adoption virale parents/enseignants USA, UX excellente, gratuit en freemium.
- **Faiblesses** : pas un SIS — purement communication.
- **Menace** : nulle (mais inspiration UX précieuse pour le module Communication).

### 2.11 Google Classroom / Microsoft Teams for Education (LMS)
- **Forces** : gratuit, intégré aux suites bureautiques, adoption massive.
- **Faiblesses** : ce ne sont pas des SIS (pas de scolarité, notes officielles, facturation). Couplés à un SIS, ils complètent bien.
- **Stratégie Jawal** : intégration (SSO, sync classes via OneRoster) plutôt que concurrence.

---

## 3. Tableau comparatif synthétique

| Critère | PowerSchool | PRONOTE | Massar | Classter | Marwa/local | **Jawal cible** |
|---|---|---|---|---|---|---|
| Tri-segment K-12/Sup/Pro | ⚠️ | ❌ | ❌ | ✅ | ❌ | ✅ |
| AR + RTL natif | ❌ | ❌ | ⚠️ | ✅ | ⚠️ | ✅ |
| Paiement CMI (Maroc) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Mobile-first parents | ⚠️ | ⚠️ | ❌ | ⚠️ | ❌ | ✅ |
| LMS intégré | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ V2 |
| Finance/facturation | ⚠️ | ❌ | ❌ | ✅ | ✅ | ✅ |
| IA (bulletins, décrochage) | ⚠️ | ❌ | ❌ | ❌ | ❌ | ✅ V2 |
| API ouverte | ⚠️ payant | ❌ | ❌ | ✅ | ❌ | ✅ |
| Multi-tenant SaaS | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ✅ |
| SSO Google/MS | ✅ | ⚠️ | ❌ | ✅ | ❌ | ✅ |
| Hébergement souverain MA | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ option |
| Accessibilité WCAG AA | ⚠️ | ⚠️ | ❌ | ⚠️ | ❌ | ✅ |
| Tarif accessible PME | ❌ | ⚠️ | gratuit | ⚠️ | ✅ | ✅ |

Légende : ✅ couvert · ⚠️ partiel · ❌ absent

---

## 4. Forces & faiblesses du marché Maghreb

### 4.1 Ce qui manque aujourd'hui
1. **Aucun acteur ne couvre proprement les trois segments** (K-12 / sup / formation pro).
2. **Mobile-first parents** : seul Massar a une app, médiocre. Les écoles privées bricolent souvent avec WhatsApp.
3. **Paiement en ligne** : adopté par les acteurs locaux mais souvent CMI uniquement, pas multi-passerelle.
4. **IA** : aucun acteur local ne propose d'IA. Opportunité réelle.
5. **API ouverte** : les acteurs locaux sont fermés, ce qui bloque les intégrations (compta, paie, RH).
6. **Conformité loi 09-08 / CNDP** : peu communiquée par les acteurs internationaux ; argument fort pour Jawal.

### 4.2 Pièges identifiés
- **Cycle de vente long** : un établissement scolaire change de SIS rarement (5-10 ans). Vente B2B avec démo, pilote, formation.
- **Saisonnalité forte** : décisions d'achat avant rentrée (juin-août). Implémentation pendant l'été. Manquer une fenêtre = perdre 12 mois.
- **Inertie** : la migration depuis Massar/PRONOTE/locaux est techniquement et politiquement coûteuse. Prévoir des **outils d'import** dès la V1.
- **Support multilingue** : pas seulement traduction — appui local (téléphone, WhatsApp, formations en présentiel) indispensable.

### 4.3 Tendances 2025-2026
- **IA générative** dans l'éducation (correction, génération d'exercices, appréciations) — fenêtre d'opportunité.
- **Paiement instantané** mobile (CMI mobile, paiement par QR via bank apps).
- **WhatsApp Business API** comme canal de communication parent dominant au Maghreb.
- **Souveraineté des données** : CNDP renforce ses exigences ; hébergement local devient un argument commercial.
- **Conformité Qualiopi-like au Maroc** pour la formation pro (Anapec, OFPPT) en évolution.

---

## 5. Positionnement Jawal — synthèse stratégique

**Promesse** : "Le SIS intégré du Maghreb — moderne, bilingue, mobile, conforme."

**Cibles prioritaires (12 mois)** :
1. **Écoles privées K-12** marocaines (Casablanca, Rabat, Marrakech) — 2 000+ établissements en cible.
2. **Établissements supérieurs privés** (ESC, EMSI, HEM, UIR, UM6P spin-offs) — segment haut de gamme, peu équipés en SIS spécialisé.
3. **Centres de formation pro privés** (Anapec partenaires, OFPPT en complément) — segment émergent, peu d'offre.

**Hors-cible court terme** :
- Établissements publics (concurrence avec Massar, cycle de vente politique).
- Universités publiques (Aurion / contrats cadres).
- Marché USA/Europe (PowerSchool/PRONOTE trop installés).

**Pricing à valider** : SaaS par élève actif (estimation 15-40 MAD/élève/an selon modules) + setup unique. Modèle freemium possible sur le module Communication parents (acquisition virale).

**Go-to-market** :
- Pilote gratuit 6 mois avec 2-3 écoles partenaires (témoignages, retours produit).
- Partenariats banques (CMI, BMCE) pour paiement.
- Présence dans les salons Édutech Maroc (Edutech, salons CDG).

---

## 6. Risques concurrentiels

| Risque | Probabilité | Mitigation |
|---|---|---|
| Massar ouvre son API ou ajoute des modules privés | Faible | Différenciation produit (UX, mobile, IA) reste forte |
| Un acteur français (PRONOTE/EcoleDirecte) localise FR+AR pour le Maghreb | Moyenne | Avance produit + ancrage local (support, CMI) |
| Classter renforce sa présence Maghreb | Moyenne | UX FR/AR native + tarification locale + IA |
| Un GAFAM (Google Classroom) ajoute des fonctions SIS | Faible | Stratégie d'intégration (SSO + OneRoster) plutôt que concurrence |
| Un acteur local lève des fonds et accélère | Moyenne | Vitesse d'exécution MVP + qualité produit |
