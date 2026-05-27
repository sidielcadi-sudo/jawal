# Jawal — Business plan & pricing

> Document de cadrage économique. Toutes les hypothèses sont **à valider par 5-10 entretiens avec des directeurs d'établissement** avant arbitrage final.
> Devise : MAD (1 EUR ≈ 11 MAD en 2026, 1 USD ≈ 10 MAD).

---

## 1. Synthèse exécutive

**Promesse** : Jawal est la première plateforme SaaS bilingue FR/AR couvrant les 3 segments éducatifs (K-12, supérieur, formation pro) au Maghreb, avec paiement CMI intégré et conformité loi 09-08.

**Modèle** : SaaS B2B, abonnement annuel par établissement, tarification par élève actif + setup.

**Cibles 36 mois** : 60 établissements payants, ~50 000 apprenants gérés, 14 MAD/mois en moyenne par apprenant (168 MAD/an).

**Revenu cible Année 3** : ~8,4 M MAD (≈ 760 k EUR) en ARR — atteignable avec une équipe de 6-8 personnes.

**Investissement initial** : ~3,2 M MAD (≈ 290 k EUR) pour atteindre le break-even mensuel au mois 24.

---

## 2. Marché adressable au Maroc

### 2.1 Tailles de marché (TAM / SAM / SOM)

| Marché | Définition | Volume |
|---|---|---|
| **TAM** (Total Addressable Market) | Tous les établissements éducatifs au Maroc | ~10 000 publics + ~4 000 privés + ~1 800 centres formation pro + ~500 sup |
| **SAM** (Serviceable Available Market) | Privés homologués K-12 + supérieur privé + formation pro privée + missions | ~5 500 établissements |
| **SAM élèves** | Apprenants dans le SAM | ~1,2 M apprenants |
| **SOM** (Serviceable Obtainable Market) | Établissements joignables/convertibles en 5 ans | ~1 200 établissements (~250 000 apprenants) |

### 2.2 Segmentation cible prioritaire

| Segment | Établissements | Apprenants moy. | Capacité de payer | Priorité Jawal |
|---|---|---|---|---|
| **Privé K-12 urbain premium** (Casa, Rabat, Marrakech, Tanger) | ~600 | 400-1 200 | Forte | ⭐⭐⭐ (P1) |
| **Privé K-12 milieu de gamme** (autres villes) | ~2 200 | 150-400 | Moyenne | ⭐⭐ (P2) |
| **Supérieur privé reconnu** | ~30 | 800-4 000 | Forte | ⭐⭐⭐ (P1) |
| **Supérieur privé non reconnu** | ~80 | 200-800 | Moyenne | ⭐ (P3) |
| **Formation pro privée** | ~600 | 100-500 | Variable | ⭐⭐ (P2) |
| **Missions étrangères** | ~60 | 300-2 000 | Forte | ⭐ (P3) — décideurs hors Maroc |

### 2.3 Pourquoi maintenant ?

1. **Massar saturé** : système étatique vieillissant, ne couvre pas le privé sur la communication/paiement
2. **Adoption smartphone** : 90 % de pénétration parents urbains au Maroc → mobile-first crédible
3. **CMI en essor** : montée du paiement carte/mobile au Maroc (+30 %/an depuis 2022)
4. **Concurrence locale faible** : 3-4 acteurs avec UX vieillissante, pas d'investissement R&D
5. **IA générative** : fenêtre d'opportunité pour différenciation produit

---

## 3. Modèle économique & pricing

### 3.1 Architecture tarifaire

**Principe** : par **apprenant actif** facturé annuellement, avec **3 plans** d'inclusion de modules + **add-ons**.

| Plan | Modules inclus | Cible | Prix MAD/élève/an | Prix EUR équivalent |
|---|---|---|---|---|
| **Starter** | Core + Scolarité + Présences + Notes/Bulletins + Communication basique | Petites écoles privées (<200 élèves) | **120** | ~11 € |
| **Standard** | Starter + Admissions + Finance/CMI + EDT + Pilotage | Écoles privées 200-1 000 élèves (cible cœur) | **180** | ~16 € |
| **Premium** | Standard + LMS + Examens + Mobile native + IA bulletins | Grosses écoles, supérieur, missions | **280** | ~25 € |

**Add-ons à la carte** (annuels) :
- **RH/Paie** : +30 MAD/employé
- **Bibliothèque** : +500 MAD/établissement (flat)
- **Restauration & transport** : +25 MAD/élève
- **Infirmerie** : +1 000 MAD/établissement (flat)
- **Chatbot scolarité IA** : +15 MAD/élève
- **API publique** (>10 k appels/mois) : +5 000 MAD/an
- **Hébergement souverain Maroc** : +20 % sur le total

### 3.2 Frais de setup (one-shot)

| Plan | Setup (MAD) | Inclus |
|---|---|---|
| Starter | 8 000 | Création tenant, import 1 fichier CSV, formation 2h en visio |
| Standard | 18 000 | Setup + intégration CMI + formation présentielle 1 jour + reprise de données simples |
| Premium | 35 000 | Setup complet + SSO + intégration paie/compta + formation 2 jours + accompagnement 30 jours |

### 3.3 Politique de remises

- **Volume** : -10 % au-delà de 500 élèves, -15 % au-delà de 1 000, -20 % au-delà de 2 000
- **Multi-établissements** (groupe scolaire) : -15 % à partir du 3ᵉ
- **Engagement 3 ans** : -10 % sur l'annuel
- **Pilote (3 premiers clients)** : -50 % an 1, prix normal an 2
- **Public** (si on s'y attaque V2) : tarification ad hoc / projet

### 3.4 Comparaison concurrence (estimations marché)

| Solution | Prix/élève/an estimé | Couverture |
|---|---|---|
| **Massar** | Gratuit (public) | Tout K-12 mais pauvre en fonctionnalités |
| **Acteurs locaux (Marwa, GestExia, Smart School)** | 50-100 MAD | Modules basiques, UX vieillissante |
| **PRONOTE** (lycées français) | ~80-150 MAD | Très complet K-12 mais pas finance |
| **Classter** | 200-400 MAD | International, modulaire, peu présent Maroc |
| **PowerSchool** | 300-600 MAD | Très complet, prix premium, hors Maroc |
| **Jawal Standard** | **180 MAD** | Couverture + bilingue + CMI + IA, positionnement *value* |

→ Jawal se positionne **20-30 % moins cher** que Classter/PowerSchool, **2-3× plus cher** que les acteurs locaux (justifié par la valeur ajoutée).

### 3.5 Exemple de facturation type — école privée 500 élèves (plan Standard)

| Ligne | Calcul | Montant MAD/an |
|---|---|---|
| Abonnement Standard | 500 × 180 | 90 000 |
| Setup (an 1 uniquement) | — | 18 000 |
| **Total an 1** | | **108 000** (≈ 9 800 €) |
| **Total an 2+** | | 90 000 (≈ 8 200 €) |

Soit **15 MAD/élève/mois** en récurrent — comparable au coût d'**un café par élève par an** pour la famille.

---

## 4. Projection financière 36 mois

### 4.1 Hypothèses de croissance commerciale

| Trimestre | Nouveaux clients (net) | Total clients | Total apprenants (moy.) | ARR cumulé (MAD) |
|---|---:|---:|---:|---:|
| T1 (S0-S2) | 0 (build) | 0 | 0 | 0 |
| T2 (lancement, MVP livré) | 2 (pilotes) | 2 | 600 | 54 000 (50 % rabais) |
| T3 | 3 | 5 | 1 800 | 270 000 |
| T4 | 5 | 10 | 4 000 | 600 000 |
| T5 | 6 | 16 | 7 200 | 1 080 000 |
| T6 | 7 | 23 | 11 000 | 1 650 000 |
| T7 | 8 | 31 | 15 500 | 2 325 000 |
| T8 | 9 | 40 | 21 000 | 3 150 000 |
| T9 | 10 | 50 | 28 000 | 4 200 000 |
| T10 | 10 | 60 | 35 000 | 5 250 000 |
| T11 | 11 | 71 | 44 000 | 6 600 000 |
| T12 | 12 | 83 | 53 000 | **7 950 000** |

**Hypothèses sous-jacentes** :
- ARPU moyen pondéré (mix Starter/Standard/Premium) : ~150 MAD/élève/an en T2-T6, **150 MAD** stabilisé ensuite
- Churn annuel : 8 % an 1, 6 % an 2, 5 % an 3 (cycle scolaire long, faible volatilité)
- Croissance d'effectifs intra-client : +5 %/an (établissements qui grandissent)
- Taille moyenne établissement : 300 élèves T2, monte progressivement à 640 élèves T12 (acquisition de clients plus gros)

### 4.2 Structure de coûts (annuelle)

| Poste | An 1 | An 2 | An 3 |
|---|---:|---:|---:|
| **Salaires & charges** (équipe core) | 1 800 000 | 2 600 000 | 3 800 000 |
| Tech lead / archi (1) | 350 000 | 380 000 | 400 000 |
| Devs full-stack (2 → 3 → 4) | 700 000 | 1 200 000 | 1 800 000 |
| Designer produit (0,5 → 1) | 130 000 | 280 000 | 320 000 |
| Consultant métier scolaire (0,5 → 1) | 90 000 | 200 000 | 230 000 |
| Commercial (0 → 1 → 2) | 0 | 280 000 | 600 000 |
| Customer success (0 → 1 → 2) | 0 | 220 000 | 450 000 |
| Charges patronales et bénéfices | 530 000 | (incl.) | (incl.) |
| **Infrastructure & SaaS** | 80 000 | 220 000 | 480 000 |
| Hébergement (Vercel/Neon/MinIO/etc.) | 50 000 | 150 000 | 350 000 |
| Outils dev (GitHub, Linear, etc.) | 30 000 | 70 000 | 130 000 |
| **Marketing & commercial** | 150 000 | 400 000 | 700 000 |
| Salons, contenus, ads | 100 000 | 250 000 | 450 000 |
| Commissions commerciales (10 % nouveau ARR) | 50 000 | 150 000 | 250 000 |
| **Juridique & conformité** | 60 000 | 80 000 | 100 000 |
| CNDP, contrats, conseil | 60 000 | 80 000 | 100 000 |
| **Frais généraux** (bureaux, déplacements, etc.) | 120 000 | 220 000 | 350 000 |
| **TOTAL COÛTS** | **2 210 000** | **3 520 000** | **5 430 000** |

### 4.3 Compte de résultat simplifié

| Année | Revenu reconnu (MAD) | Coûts (MAD) | Marge brute (MAD) | Marge % |
|---|---:|---:|---:|---:|
| **An 1** | 350 000 | 2 210 000 | **-1 860 000** | -531 % |
| **An 2** | 2 200 000 | 3 520 000 | **-1 320 000** | -60 % |
| **An 3** | 5 500 000 | 5 430 000 | **+70 000** | +1 % (break-even atteint en T11) |
| **An 4 (extrapolation)** | 9 500 000 | 7 200 000 | +2 300 000 | +24 % |

**Conclusion** : ~3,2 M MAD nécessaires pour traverser les an 1 et 2. Le break-even mensuel est atteint au mois 22-24 dans le scénario de base.

---

## 5. Unit economics

### 5.1 Coût d'acquisition client (CAC)

| Composant | Estimation |
|---|---|
| Coût commercial (1 commercial × 15 deals/an × salaire annuel chargé) | ~30 000 MAD / deal |
| Marketing (alloué) | ~10 000 MAD / deal |
| Démo, onboarding, setup (non facturé) | ~8 000 MAD / deal |
| **CAC total estimé** | **~48 000 MAD** (≈ 4 350 €) |

### 5.2 Lifetime Value (LTV)

| Hypothèse | Valeur |
|---|---|
| ARPU annuel moyen | 90 000 MAD (école 500 élèves × 180 MAD) |
| Marge brute (hors devs récurrent / support) | 75 % → 67 500 MAD/an |
| Churn annuel stabilisé | 5 % → durée moyenne 20 ans (très long, secteur peu volatile) |
| **LTV plafonnée à 7 ans** | **~470 000 MAD** (≈ 42 700 €) |

### 5.3 Ratios clés

| Ratio | Valeur | Cible SaaS B2B saine |
|---|---|---|
| **LTV / CAC** | ~10× | > 3× |
| **CAC Payback** | ~9 mois (couvert par le setup an 1) | < 18 mois |
| **Marge brute** | ~75 % | > 70 % |
| **Net Revenue Retention** | ~105 % (croissance intra-compte) | > 100 % |

Profil typique d'un SaaS vertical sain — **les unit economics tiennent**, même avec des hypothèses prudentes.

---

## 6. Stratégie go-to-market

### 6.1 Phasage

| Phase | Mois | Stratégie | Objectif |
|---|---|---|---|
| **Pilote** | M3-M6 | 2-3 écoles partenaires Casa/Rabat à -50 % | Témoignages, validation produit |
| **Acquisition warm** | M6-M12 | Bouche-à-oreille, réseaux directeurs, salons EduMaroc | 10 clients payants |
| **Acquisition active** | M12-M24 | 1 commercial dédié, partenariats banques (CMI/BMCE), démos en région | 40 clients |
| **Scale** | M24+ | 2 commerciaux, customer success structuré, marketing produit | 80+ clients |

### 6.2 Canaux d'acquisition

1. **Référents directeurs** (LinkedIn, événements professionnels)
2. **Salons et événements** : EduTech Maroc, Salon de l'Éducation (Casa), salons régionaux
3. **Partenariats bancaires** : co-démarchage avec CMI ou BMCE Bank of Africa (financement de la digitalisation)
4. **Partenariats AMIDEAST / British Council / IFM** : pour les écoles internationales
5. **Content marketing** : webinaires "Comment digitaliser votre établissement" (FR + AR)
6. **Bouche-à-oreille** : programme de parrainage (1 mois offert au parrain)

### 6.3 Cycle de vente type

| Étape | Durée | Acteurs |
|---|---|---|
| Prise de contact | 1 jour | Commercial → directeur |
| Démo personnalisée | 2 sem | Commercial + tech lead |
| Pilote/POC (optionnel) | 1-2 mois | CS + équipe |
| Négociation contrat | 2-4 sem | Commercial + juriste |
| Décision | 2-4 sem | Conseil d'établissement |
| **Total cycle moyen** | **3-6 mois** | |

**Saisonnalité forte** : la majorité des décisions sont prises **avril-août** pour la rentrée de septembre. La timing matters → cycle annuel.

---

## 7. Besoins de financement & jalons

### 7.1 Tableau de financement

| Phase | Montant | Affectation | Source recommandée |
|---|---:|---|---|
| **Pré-amorçage** | 500 k MAD | MVP S0-S6 (3 mois × 4 ETP) | Fonds propres / love money |
| **Amorçage** | 2 700 k MAD | An 1-2 (équipe core, premiers clients, marketing) | Business angels Maroc, MNF (Maroc Numeric Fund), CDG Invest, ou autofinancement par cash-flow client |
| **Série A** | (optionnel, an 3+) | Expansion régionale (Algérie, Tunisie, Sénégal), équipe commerciale, IA | VC régionaux (Outlierz, Saviu, Janngo Capital) |

### 7.2 Jalons décisionnels

| Mois | Jalon | Décision conditionnelle |
|---|---|---|
| **M6** | MVP livré, 2 pilotes signés | Continuer (go) ou pivot (no-go) |
| **M12** | 10 clients payants, 600 k MAD ARR | Lever 2,7 M MAD ou bootstrapper |
| **M18** | 25 clients, 2 M MAD ARR | Recruter commercial #2 |
| **M24** | Break-even mensuel | Décision expansion régionale |
| **M36** | 60 clients, 8 M MAD ARR | Lever série A ou rester rentable |

---

## 8. Analyse de sensibilité

Que se passe-t-il si nos hypothèses centrales bougent ?

| Variable | Scénario pessimiste | Scénario médian | Scénario optimiste |
|---|---|---|---|
| **Nb clients fin an 3** | 35 | 60 | 90 |
| **ARPU moyen** | 120 MAD | 150 MAD | 200 MAD |
| **Churn annuel** | 10 % | 5 % | 3 % |
| **CAC** | 70 k MAD | 48 k MAD | 30 k MAD |
| **ARR an 3** | 3,5 M | 8,4 M | 15,8 M |
| **Break-even** | jamais an 3 | M22-M24 | M16-M18 |
| **Besoin de cash** | 5 M MAD | 3,2 M MAD | 1,8 M MAD |

**Variables les plus sensibles** (par ordre d'impact) :
1. **Taux de conversion démo → contrat** (impact ×3 sur croissance)
2. **ARPU** (impact direct sur unit economics)
3. **Cycle de vente** (peut décaler tout le plan de 6-12 mois)
4. **Churn an 1** (un mauvais pilote = effet domino sur les références)

---

## 9. Risques business majeurs

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Massar ouvre une API publique et capture le privé | Faible | Critique | Avance produit (UX, mobile, IA), focus sur ce que Massar ne peut pas faire (paiement, comm parents avancée) |
| PRONOTE / EcoleDirecte localisent FR+AR pour le Maghreb | Moyenne | Élevé | Vitesse, ancrage local, hébergement souverain Maroc |
| Conventionnement CMI long (8-12 sem) → retard de revenus | Élevée | Moyen | Démarche dès J0, Stripe en backup pour les pilotes |
| Recrutement difficile (dev TS senior + métier scolaire Maroc) | Élevée | Moyen | Mix local + remote ; partenariat avec écoles d'ingénieur marocaines |
| Cycle de vente plus long que prévu (8-12 mois au lieu de 3-6) | Moyenne | Élevé | Démarrer la prospection dès M3, ne pas attendre le MVP |
| Réglementation MEN durcit les exigences (homologation logiciels) | Faible | Élevé | Veille active, certification volontaire dès l'amorçage |
| Baisse du DH ou crise économique | Faible | Moyen | Mix devise (clients EUR via missions), exposition limitée |

---

## 10. Indicateurs à suivre (north-star metrics)

| KPI | Cible Année 1 | Cible Année 2 | Cible Année 3 |
|---|---|---|---|
| **ARR** (Annual Recurring Revenue) | 600 k MAD | 2,4 M MAD | 8 M MAD |
| **Nb clients payants** | 10 | 25 | 60 |
| **Nb apprenants gérés** | 4 000 | 14 000 | 35 000 |
| **NPS clients** | > 30 | > 40 | > 50 |
| **NPS parents** (utilisateur final) | > 20 | > 30 | > 40 |
| **% paiements en ligne (CMI)** des échéances | 30 % | 50 % | 65 % |
| **MAU parents** (parents actifs mensuels) | 60 % du parc | 70 % | 75 % |
| **Disponibilité plateforme** | 99,5 % | 99,7 % | 99,9 % |
| **Marge brute** | -500 % | -60 % | break-even |
| **LTV/CAC** | n/a | 5× | 10× |

---

## 11. Scénarios alternatifs (variations stratégiques)

### 11.1 Bootstrap pur (sans levée)
- Croissance plus lente (40 clients à 36 mois au lieu de 60)
- Pas de commercial dédié → fondateur vend
- Profitable plus tard (M30 vs M24)
- Avantage : 100 % equity conservée

### 11.2 Levée précoce (1 M MAD pré-amorçage business angels)
- Recrutement plus rapide d'un commercial dès M9
- Marketing plus agressif
- Croissance +50 % vs scénario central
- Dilution ~15-20 %

### 11.3 Expansion régionale anticipée (Algérie + Tunisie à partir de M18)
- Multiplie le TAM par ~3
- Coût d'expansion : ~1,5 M MAD (équipe locale, conformité)
- Risque change/réglementaire
- Recommandation : **après M30 minimum**, une fois le Maroc stabilisé

---

## 12. Décisions ouvertes — à valider avec les premiers prospects

1. **Setup forfaitaire vs % du contrat ?** (impact sur cash an 1)
2. **Facturation annuelle ou mensuelle ?** (annuelle : meilleur cash, mensuelle : moins de friction commerciale)
3. **Tarification dégressive immédiate ou seulement engagement 3 ans ?**
4. **Inclure ou non l'hébergement souverain Maroc dans Premium par défaut ?**
5. **Free trial de 30 jours ou pilote payant -50 % ?**
6. **Programme partenariat intégrateurs ?** (cabinets de conseil locaux qui revendent + setup)
7. **Mode "freemium" sur la communication parents** (acquisition virale, monétisation upsell) ?

À trancher après **5-10 entretiens découverte** avec des directeurs cibles. Ce plan est une hypothèse de travail, pas une vérité gravée.
