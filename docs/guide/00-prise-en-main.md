---
title: "LeadSchool — Manuel utilisateur"
subtitle: "Chapitre 0 · Prise en main"
lang: fr
---

# Chapitre 0 — Prise en main

> Ce chapitre est le socle commun à tous les utilisateurs de LeadSchool, quel
> que soit leur métier : se connecter, comprendre où l'on est, changer son mot
> de passe, retrouver ses menus. Les chapitres suivants supposent qu'il est
> acquis.

**Sommaire**

1. À propos de ce manuel
2. Se connecter
3. Le mot de passe
4. La langue de l'interface
5. Les espaces et les rôles
6. L'écran type de l'espace administration
7. Les menus des autres espaces
8. L'application mobile
9. Se déconnecter — sécurité
10. En cas de problème

\newpage

## 1. À propos de ce manuel

### 1.1 Conventions de lecture

| Élément | Mise en forme | Exemple |
|---|---|---|
| Bouton, menu, onglet | **gras** | cliquer sur **Se connecter** |
| Chemin de navigation | gras + flèches | **Paramétrage → Utilisateurs** |
| Valeur à saisir | « guillemets » | saisir « demo » |
| Renvoi interne | § numéro | voir § 5.1 |

> ⚠️ Signale une action irréversible ou une erreur coûteuse.

> 💡 Signale un raccourci ou une bonne pratique.

### 1.2 Ce que vous voyez dépend de votre rôle

LeadSchool n'affiche à chaque utilisateur que les menus correspondant à son
rôle. Si une entrée de menu décrite dans ce manuel n'apparaît pas sur votre
écran, ce n'est pas une panne : votre rôle ne l'autorise pas. Le tableau du
§ 5.1 indique qui voit quoi ; l'attribution des rôles est décrite au chapitre 9
(Paramétrage).

\newpage

## 2. Se connecter

### 2.1 L'adresse d'accès

L'établissement communique une adresse de la forme :

```
https://<adresse-de-votre-etablissement>/fr/login
```

Le segment `/fr/` (ou `/ar/`) est **toujours** présent dans l'adresse : c'est
lui qui détermine la langue de l'interface (§ 4).

> 💡 Enregistrez cette adresse dans les favoris de votre navigateur. Navigateurs
> recommandés : Chrome, Edge ou Firefox à jour.

### 2.2 L'écran de connexion

L'écran est en deux parties : à gauche le formulaire sur fond coloré, à droite
le logo et le nom de votre établissement. Le formulaire comporte trois champs :

| Champ | Ce qu'il faut saisir |
|---|---|
| **Identifiant de l'établissement** | Le code court fourni par l'établissement (ex. « demo »). Il est identique pour tout le personnel et toutes les familles du même établissement. |
| **Adresse email** | Votre adresse personnelle, celle sur laquelle le compte a été créé. |
| **Mot de passe** | Votre mot de passe personnel. |

Sous le bouton figurent deux liens :

- **Mot de passe oublié ?** — réservé aux **parents** (§ 3.1) ;
- **Connexion super-admin SaaS** — réservé à l'éditeur (§ 2.5). Ce lien masque
  le champ « Identifiant de l'établissement ». S'il a été cliqué par erreur,
  cliquer sur **Connexion établissement** pour revenir au formulaire normal.

### 2.3 Procédure — se connecter

**Qui** — tous les utilisateurs.

**Quand** — à chaque début de session de travail.

**Prérequis** — un compte actif, créé par l'établissement, et son mot de passe.

**Étapes**

1. Ouvrir l'adresse d'accès de l'établissement (§ 2.1).
2. Saisir l'**Identifiant de l'établissement**.
3. Saisir l'**Adresse email** du compte.
4. Saisir le **Mot de passe**.
5. Cliquer sur **Se connecter**.

**Résultat attendu** — l'application ouvre directement l'espace correspondant à
votre profil (§ 2.4). Votre adresse email s'affiche en haut à droite de l'écran.

**Erreurs fréquentes**

| Message ou symptôme | Cause | Correction |
|---|---|---|
| « Identifiants incorrects ou compte désactivé. » | Mot de passe erroné, adresse email erronée, identifiant d'établissement erroné, ou compte désactivé. | Le message est volontairement unique et ne précise pas lequel des trois champs est en cause. Vérifier les trois, puis contacter le secrétariat si le blocage persiste. |
| Le champ « Identifiant de l'établissement » a disparu | Le mode super-administrateur a été activé par mégarde. | Cliquer sur **Connexion établissement** en bas du formulaire. |
| Retour à l'écran de connexion après quelques heures de travail | La session a expiré (§ 2.6). | Se reconnecter. |

### 2.4 Où arrive-t-on après la connexion ?

LeadSchool cloisonne les profils : chacun est redirigé vers son espace et ne
peut pas entrer dans celui d'un autre, même en saisissant l'adresse à la main.

| Profil | Espace ouvert après connexion |
|---|---|
| Personnel administratif, direction, scolarité, secrétariat, comptabilité, CPE | Espace **administration** |
| Enseignant | Espace **enseignant** |
| Parent | Espace **parent** |
| Élève | Espace **élève** |
| Super-administrateur (éditeur) | Liste des **établissements** |

Si vous tentez d'ouvrir une adresse d'un autre espace, vous êtes automatiquement
ramené à l'accueil du vôtre. Ce n'est pas une erreur.

### 2.5 La connexion super-administrateur

Elle est réservée aux équipes de l'éditeur pour l'administration de la
plateforme (création d'établissements, groupes d'établissements). Elle ne
demande pas d'identifiant d'établissement. Le personnel des établissements n'a
jamais à l'utiliser.

### 2.6 La durée de la session

Une session ouverte reste valable **8 heures**. Au-delà, l'application redemande
les identifiants. C'est une mesure de sécurité : elle limite l'exposition d'un
poste laissé allumé en fin de journée.

> 💡 Sur un poste partagé (bureau d'accueil, salle des professeurs), ne comptez
> pas sur l'expiration : déconnectez-vous explicitement (§ 9).

\newpage

## 3. Le mot de passe

### 3.1 Procédure — réinitialiser un mot de passe parent oublié

**Qui** — les **parents** uniquement.

**Quand** — mot de passe perdu, avant tout appel au secrétariat.

**Prérequis** — connaître l'identifiant de l'établissement et l'adresse email
déclarée à l'école ; avoir accès à cette boîte email.

**Étapes**

1. Sur l'écran de connexion, cliquer sur **Mot de passe oublié ?**.
2. Saisir l'**Identifiant de l'établissement**.
3. Saisir l'**Adresse e-mail** de l'espace parent.
4. Cliquer sur **Envoyer le lien**.
5. Ouvrir l'email reçu et cliquer sur le lien qu'il contient.
6. Saisir le nouveau mot de passe (**8 caractères minimum**), puis le confirmer.
7. Valider, puis se reconnecter avec le nouveau mot de passe.

**Résultat attendu** — un message confirme l'envoi, puis, après l'étape 7, la
connexion fonctionne avec le nouveau mot de passe.

> ⚠️ Le lien de réinitialisation est valable **1 heure**. Passé ce délai, il faut
> recommencer la procédure depuis l'étape 1.

**Erreurs fréquentes**

| Symptôme | Cause | Correction |
|---|---|---|
| Aucun email reçu | L'adresse saisie n'est pas celle déclarée à l'école, ou l'email est en indésirables. | Vérifier le dossier « Spam » / « Courrier indésirable ». Si rien n'arrive, contacter le secrétariat pour faire vérifier l'adresse enregistrée. |
| Le lien affiche une erreur | Lien expiré (plus d'une heure) ou déjà utilisé. | Recommencer la procédure. |
| « Veuillez renseigner l'établissement et une adresse e-mail valide. » | Un des deux champs est vide ou mal formé. | Compléter les deux champs. |

> Le message affiché après l'envoi est volontairement neutre : il ne révèle pas
> si un compte existe pour cette adresse. C'est une protection contre la
> recherche d'adresses par des tiers.

### 3.2 Procédure — changer son mot de passe

**Qui** — tous les utilisateurs connectés.

**Quand** — à la première connexion, puis dès qu'un doute existe sur la
confidentialité du mot de passe.

**Prérequis** — connaître son mot de passe actuel.

**Étapes**

1. Dans le menu, ouvrir **Mon compte**.
2. Saisir le **mot de passe actuel**.
3. Saisir le **nouveau mot de passe** (8 caractères minimum).
4. Le saisir une seconde fois dans le champ de **confirmation**.
5. Cliquer sur **Enregistrer**.

**Résultat attendu** — un message de confirmation s'affiche sous le formulaire.
Le nouveau mot de passe est actif immédiatement.

### 3.3 Personnel : mot de passe perdu

La procédure de réinitialisation par email du § 3.1 est **réservée à l'espace
parent**. Un membre du personnel (enseignant, secrétariat, comptabilité,
direction, CPE) qui a perdu son mot de passe doit s'adresser à l'administrateur
de l'établissement, qui le réinitialise depuis **Paramétrage → Utilisateurs**
(chapitre 9).

### 3.4 Règles et bonnes pratiques

- Longueur minimale imposée : **8 caractères**.
- Un mot de passe est **personnel** : il n'est ni partagé entre collègues, ni
  transmis par messagerie interne, ni collé sous le clavier.
- Un compte partagé (« le compte du secrétariat ») rend le journal d'audit
  inexploitable : on ne sait plus qui a fait quoi. Chaque agent doit avoir son
  compte nominatif.

\newpage

## 4. La langue de l'interface

LeadSchool est disponible en **français** et en **arabe**. En arabe, toute
l'interface bascule en écriture de droite à gauche : les menus passent à droite,
les tableaux se lisent en sens inverse. Les contenus saisis (noms d'élèves,
libellés de classes) s'affichent dans leur version arabe lorsqu'elle a été
renseignée, sinon dans leur version française.

**Avant la connexion** — la page d'accueil propose les deux liens **Français**
et **العربية**.

**Après la connexion** — la langue est portée par l'adresse affichée dans le
navigateur : le segment `/fr/` ou `/ar/` qui suit le nom du site. Pour changer
de langue en cours de session, remplacer ce segment dans la barre d'adresse :

```
https://.../fr/admin/enrollments      ->  francais
https://.../ar/admin/enrollments      ->  arabe
```

La page se recharge dans l'autre langue, au même endroit.

> 💡 Le choix de langue n'est pas mémorisé dans le profil : la prochaine
> connexion repartira de la langue de l'adresse utilisée pour se connecter.
> Le plus simple est d'enregistrer en favori l'adresse dans la langue voulue.

\newpage

## 5. Les espaces et les rôles

### 5.1 Les rôles

Un rôle décrit un poste de travail. Un même utilisateur peut en cumuler
plusieurs ; il voit alors la réunion des menus correspondants.

| Rôle | Vocation |
|---|---|
| **Administrateur établissement** | Accès complet, y compris le paramétrage et la gestion des comptes. |
| **Direction** | Vision d'ensemble : pilotage, indicateurs, tous les modules en lecture, paramétrage. |
| **Scolarité** | Élèves, classes, inscriptions et admissions. |
| **Secrétariat** | Dossiers élèves et inscriptions, courrier aux familles, consultation de l'appel et de l'état des règlements — **sans encaisser**. |
| **Comptabilité** | Finances, comptabilité, paie, heures supplémentaires. |
| **CPE / Vie scolaire** | Appel, absences et retards, justificatifs, carnet de correspondance, discipline, communication. |
| **Enseignant** | Ses classes : appel, notes, cahier de texte, compétences. |
| **Parent** | Le suivi de ses enfants uniquement. |
| **Élève** | Son propre dossier uniquement. |

### 5.2 Les cinq espaces

| Espace | Pour qui | Contenu |
|---|---|---|
| **Administration** | Personnel de l'établissement | Tous les modules de gestion, selon le rôle |
| **Enseignant** | Professeurs | Emploi du temps, appel, notes, cahier de texte, carnet |
| **Parent** | Familles | Suivi des enfants, annonces, messagerie, règlements |
| **Élève** | Élèves | Emploi du temps, notes, bulletins, carnet |
| **Super-administration** | Éditeur | Établissements et groupes d'établissements |

> Le cas particulier du CPE : un utilisateur qui a **uniquement** le rôle CPE
> (sans direction ni administration) voit son **Tableau de bord** ouvrir
> directement le cockpit **Vie scolaire**, et non la page de pilotage réservée à
> la direction.

\newpage

## 6. L'écran type de l'espace administration

L'écran se compose de trois zones fixes : le **menu** à gauche, le **bandeau**
en haut, la **zone de travail** au centre.

### 6.1 Le bandeau supérieur

De gauche à droite :

| Élément | Rôle |
|---|---|
| Logo de l'établissement | Identité visuelle, paramétrable (chapitre 9) |
| Sélecteur de site | N'apparaît que si vous êtes rattaché à plusieurs établissements (§ 6.5) |
| Nom de l'établissement (au centre) | Affiché en arabe si l'interface est en arabe et que le nom arabe est renseigné |
| Enveloppe ✉️ | Messagerie interne, avec le nombre de messages non lus (§ 6.4) |
| Cloche 🔔 | Alertes internes, avec le nombre d'alertes non lues (§ 6.3) |
| Adresse email | Rappel du compte connecté — à vérifier sur un poste partagé |
| **Déconnexion** | Ferme la session (§ 9) |

### 6.2 Le menu de gauche

L'ordre du menu est fixe. La colonne « Visible par » indique les rôles qui
voient l'entrée ; les entrées sans restriction sont visibles par tout le
personnel administratif.

| Entrée | Contenu | Visible par |
|---|---|---|
| **Tableau de bord** | Indicateurs, pilotage, cockpit vie scolaire | Tous |
| **Inscriptions** | Admissions, inscriptions, réinscriptions, import MASAR | Tous |
| **Élèves** | Fichier élèves, dossier 360° | Tous |
| **Enseignants** | Fichier enseignants, affectations | Tous |
| **Personnel** | Fichier du personnel non enseignant | Tous |
| **Parents** | Fichier des responsables légaux | Tous |
| **Classes** | Classes, groupes, listes, bulletins | Tous |
| **Finances** | Frais, encaissements, impayés, dépenses | Administrateur, Direction, Comptabilité |
| **Carnet de correspondance** | Carnet numérique, communications famille | CPE, Administrateur, Direction, Scolarité |
| **Justifications** | Traitement des justificatifs d'absence | CPE, Administrateur, Direction |
| **Compétences et aptitudes** | Évaluation par compétences, bilans, remédiation | CPE, Administrateur, Direction, Scolarité |
| **Soutien scolaire** | Cours de soutien, séances, rapports | CPE, Administrateur, Direction, Scolarité |
| **Congés & absences** | Congés du personnel, remplacements | Administrateur, Direction, CPE, Scolarité |
| **Pointage personnel** | Présence du personnel, synthèses | Administrateur, Direction |
| **Heures supplémentaires** | Saisie et validation des heures | Administrateur, Direction, Comptabilité |
| **Transport** | Lignes, zones, appel transport, incidents | Administrateur, Direction, CPE |
| **Paie** | Cycles de paie, bulletins de salaire | Administrateur, Direction, Comptabilité |
| **Comptabilité** | Journal, balance, achats, clôture | Administrateur, Direction, Comptabilité |
| **Annonces** | Publications à destination des familles | Tous |
| **Enquêtes** | Questionnaires aux familles et au personnel | Administrateur, Direction |
| **Bourse aux livres** | Dépôt-vente de manuels scolaires | Administrateur, Direction, CPE |
| **Paramétrage** | Année scolaire, classes, matières, emploi du temps, utilisateurs, apparence, audit | Administrateur, Direction |

> 💡 **Emploi du temps** ne figure pas dans la liste principale : il se trouve
> dans **Paramétrage**. Les emplois du temps d'une classe ou d'une personne
> restent accessibles depuis leur fiche.

Une **pastille numérique** peut apparaître à côté de **Tableau de bord** pour les
CPE : elle compte les feuilles d'appel non faites dans la journée.

### 6.3 La cloche d'alertes

La cloche regroupe les alertes internes qui vous sont adressées : demande de
validation, étape de dossier à traiter, échéance de contrat, absence à couvrir.

- Le chiffre rouge indique le nombre d'alertes **non lues**.
- Cliquer sur la cloche déplie la liste et la rafraîchit.
- Cliquer sur une alerte la marque comme lue **et** ouvre directement la page
  concernée.
- Un bouton permet de **tout marquer comme lu**.

> ⚠️ Marquer comme lu ne traite pas le dossier : l'action reste à faire. Ne
> videz la liste que si vous avez bien ouvert chaque alerte.

### 6.4 L'enveloppe des messages

L'enveloppe ouvre la **messagerie interne** (personnel, familles, enseignants).
Le compteur indique les messages non lus. Le fonctionnement détaillé est décrit
au chapitre 8 (Communication).

### 6.5 Le sélecteur de site

Un utilisateur rattaché à plusieurs établissements d'un même groupe voit, à
gauche du bandeau, un sélecteur listant ses sites. En choisir un recharge
l'ensemble de l'application sur cet établissement : les listes, les chiffres et
le paramétrage affichés sont ceux du site actif.

> ⚠️ Avant toute saisie, vérifiez le site actif et le nom d'établissement
> affiché au centre du bandeau. Une inscription saisie sur le mauvais site doit
> être annulée puis ressaisie.

### 6.6 Imprimer une page

Les pages sont préparées pour l'impression : au moment d'imprimer, le menu de
gauche et le bandeau supérieur sont automatiquement masqués, seule la zone de
travail est imprimée. Utiliser simplement l'impression du navigateur
(`Ctrl + P`, ou `Cmd + P` sur Mac).

\newpage

## 7. Les menus des autres espaces

### 7.1 Espace enseignant

| Entrée | Contenu |
|---|---|
| **Tableau de bord** | Journée en cours, appels à faire |
| **Emploi du temps** | Emploi du temps personnel |
| **Feuilles d'appel** | Saisie de l'appel par séance |
| **Cahier de texte** | Contenus de séance, devoirs, ressources |
| **Notes** | Évaluations et saisie des notes |
| **Compétences et aptitudes** | Évaluation par compétences |
| **Soutien scolaire** | Séances de soutien encadrées |
| **Carnet de correspondance** | Observations et communications aux familles |
| **Mes classes** | Listes d'élèves des classes affectées |
| **Congés & absences** | Demandes de congé personnelles |
| **Annonces** | Annonces de l'établissement |
| **Mon compte** | Changement de mot de passe (§ 3.2) |

### 7.2 Espace parent

Le menu s'organise autour de deux niveaux : une partie **Général**, commune, et
une partie par enfant.

| Entrée | Contenu |
|---|---|
| **Accueil** | Vue de synthèse |
| **Mes enfants** | Un sous-menu par enfant scolarisé |
| **Cahier de texte** | Devoirs et contenus de séance |
| **Annonces** | Publications de l'établissement |
| **Messages** | Messagerie avec l'établissement |
| **Bourse aux livres** | Dépôt et achat de manuels |
| **Enquêtes** | Questionnaires à remplir |
| **Mon compte** | Changement de mot de passe (§ 3.2) |

Pour chaque enfant, les rubriques disponibles sont : **Cahier de texte**,
**Notes**, **Vie scolaire**, **Règlement**, **Documents officiels**, **Bourse
aux livres**.

### 7.3 Espace élève

| Entrée | Contenu |
|---|---|
| **Accueil** | Vue de synthèse |
| **Emploi du temps** | Emploi du temps de la classe |
| **Cahier de texte** | Devoirs à faire, contenus de séance |
| **Mes notes** | Notes par matière |
| **Bulletins** | Bulletins des périodes closes |
| **Mon carnet** | Carnet de correspondance |
| **Annonces** | Annonces de l'établissement |
| **Mon compte** | Changement de mot de passe (§ 3.2) |

\newpage

## 8. L'application mobile

Une application mobile LeadSchool est disponible pour deux publics : les
**parents** et les **enseignants**. L'espace ouvert est déterminé par le profil
du compte : il n'y a pas de choix à faire au démarrage.

**Se connecter sur mobile** — les trois champs sont identiques à ceux du web
(§ 2.2) : **Identifiant de l'établissement**, **Adresse email**, **Mot de
passe**. Les identifiants sont les mêmes que sur le site : il n'y a pas de
compte mobile distinct.

L'application couvre les usages du quotidien — appel, notes, annonces,
messagerie, suivi des enfants — et renvoie au site web pour les opérations plus
complètes.

\newpage

## 9. Se déconnecter — sécurité

**Procédure** — cliquer sur **Déconnexion**, en haut à droite du bandeau
(espaces administration, enseignant, parent, élève).

Bonnes pratiques, en particulier sur les postes partagés :

1. Se déconnecter **à chaque fois** que l'on quitte le poste, sans attendre
   l'expiration automatique des 8 heures (§ 2.6).
2. Vérifier l'adresse email affichée dans le bandeau avant toute saisie : elle
   indique au nom de qui les actions vont être enregistrées.
3. Ne pas enregistrer le mot de passe dans le navigateur d'un poste partagé.
4. Toute action sensible est tracée dans le journal d'audit
   (**Paramétrage → Journal d'audit**) : elle est attribuée au compte connecté.

\newpage

## 10. En cas de problème

| Symptôme | Que faire |
|---|---|
| « Identifiants incorrects ou compte désactivé. » | Vérifier les trois champs (§ 2.3). Si le blocage persiste, faire vérifier l'état du compte par l'administrateur. |
| Je ne vois pas un menu décrit dans ce manuel | Votre rôle ne l'autorise pas (§ 5.1). Demander l'ajout du rôle à l'administrateur. |
| Je suis renvoyé vers un autre espace quand j'ouvre une adresse | Cloisonnement normal des profils (§ 2.4). |
| L'interface est passée en arabe, de droite à gauche | Le segment `/ar/` figure dans l'adresse. Le remplacer par `/fr/` (§ 4). |
| Les chiffres affichés ne correspondent pas à mon établissement | Mauvais site actif dans le sélecteur (§ 6.5). |
| Je suis déconnecté sans avoir rien fait | Session expirée après 8 heures (§ 2.6). |
| Parent : je n'ai pas reçu l'email de réinitialisation | Vérifier les indésirables, puis faire contrôler l'adresse enregistrée par le secrétariat (§ 3.1). |
| Personnel : mot de passe perdu | Passer par l'administrateur de l'établissement (§ 3.3). |

---

*Fin du chapitre 0. Chapitre suivant : Scolarité — inscriptions et dossiers
élèves.*
