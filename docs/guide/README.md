# Manuel utilisateur & procédures — LeadSchool

> Documentation destinée aux **utilisateurs finaux** de la plateforme (personnel
> d'établissement, enseignants, parents, élèves), et non aux développeurs.
> La documentation technique reste dans `docs/` (cahier des charges, architecture,
> glossaire).

**Nom commercial** : l'application s'affiche sous le nom **LeadSchool**
(éditeur : LeadTech). « Jawal » est le nom interne du dépôt et du projet ; il ne
doit **jamais** apparaître dans le manuel remis aux établissements.

---

## 1. Public visé et parti pris

Le manuel est organisé **par métier**, pas par module technique. Le lecteur type
n'est pas « le module Finance » : c'est une secrétaire qui doit inscrire un
élève, un CPE qui traite les absences de la journée, un parent qui règle une
échéance. Chaque chapitre correspond donc à un poste de travail.

## 2. Plan d'ensemble

| # | Fichier | Contenu | État |
|---|---|---|---|
| 00 | `00-prise-en-main.md` | Connexion, langue, espaces et rôles, écran type, mon compte, application mobile | ✅ Rédigé |
| 10 | `10-scolarite.md` | Inscription, réinscription en masse, import MASAR, dossier élève, radiation & transfert | ⬜ À rédiger |
| 20 | `20-vie-scolaire.md` | Appel, cockpit, tableau de bord journalier, justificatifs, carnet de correspondance | ⬜ À rédiger |
| 30 | `30-pedagogie.md` | Évaluations, notes, bulletins, conseils de classe, compétences, cahier de texte | ⬜ À rédiger |
| 40 | `40-finance.md` | Frais et échéanciers, encaissements, impayés, remboursements, paiement en ligne | ⬜ À rédiger |
| 50 | `50-comptabilite.md` | Journal, balance, balance âgée, achats, clôture d'exercice | ⬜ À rédiger |
| 60 | `60-rh-paie.md` | Congés & absences, remplacements, heures supplémentaires, pointage, cycle de paie | ⬜ À rédiger |
| 70 | `70-modules.md` | Transport, Bourse aux livres, Soutien scolaire | ⬜ À rédiger |
| 80 | `80-communication.md` | Annonces, enquêtes, messagerie | ⬜ À rédiger |
| 90 | `90-parametrage.md` | Année scolaire, classes, matières, emploi du temps, utilisateurs & rôles, apparence, journal d'audit | ⬜ À rédiger |
| A1 | `espaces/enseignant.md` | Guide complet de l'espace enseignant (web + mobile) | ⬜ À rédiger |
| A2 | `espaces/parent.md` | Guide complet de l'espace parent (web + mobile + paiement en ligne) | ⬜ À rédiger |
| A3 | `espaces/eleve.md` | Guide complet de l'espace élève | ⬜ À rédiger |
| A4 | `espaces/super-admin.md` | Administration SaaS : établissements, groupes | ⬜ À rédiger |
| B | `annexes/roles-permissions.md` | Tableau des rôles et de ce que chacun voit | ⬜ À rédiger |
| C | `annexes/faq-depannage.md` | Problèmes fréquents et leur résolution | ⬜ À rédiger |

## 3. Règles de rédaction

1. **Une procédure = une fiche**, au gabarit de `_gabarit-fiche.md`. Pas de
   fiche sans « Qui », « Prérequis », « Résultat attendu ».
2. **Chemins de navigation littéraux**, dans les termes exacts de l'interface :
   `Menu → Inscriptions → Nouvelle inscription`. Si un libellé change dans
   `apps/web/messages/fr.json`, la fiche correspondante doit être corrigée.
3. **Numérotation stable** : les titres sont numérotés (1, 1.1, 1.1.1) car le
   manuel est destiné à l'impression — on renvoie à « § 2.3 », jamais à un lien.
4. **Pas de jargon technique** : ni « tenant », ni « slug », ni « RLS ».
   On écrit « établissement », « identifiant de l'établissement ».
5. **Vérifier avant d'écrire** : les rôles autorisés sont lisibles dans le code
   (`apps/web/src/app/[locale]/admin/nav.tsx`, `packages/db/prisma/seed.ts`).
   Une fiche ne doit jamais décrire un bouton que le rôle cité ne voit pas.
6. **FR d'abord** : la traduction arabe est produite en seconde vague, une fois
   le contenu figé, pour ne pas traduire deux fois.

## 4. Captures d'écran

À produire en **seconde passe**, une fois le texte validé, dans `docs/guide/img/`.
Convention de nommage : `<chapitre>-<sujet>.png` (ex. `00-connexion.png`).
Cadrer sur la zone utile, masquer les données personnelles réelles — utiliser le
jeu de démonstration.

## 5. Produire le PDF

Le manuel est écrit pour l'impression : titres numérotés, aucune dépendance au
survol, tableaux courts. Deux chaînes possibles :

```bash
# Option 1 — pandoc (rendu le plus propre, nécessite une installation)
pandoc docs/guide/00-prise-en-main.md -o manuel-prise-en-main.pdf \
  --toc --number-sections -V lang=fr -V geometry:margin=2cm

# Option 2 — sans installation
npx md-to-pdf docs/guide/00-prise-en-main.md
```

Pour un manuel complet relié, concaténer les chapitres dans l'ordre du § 2 avant
la conversion.
