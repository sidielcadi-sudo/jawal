# Jawal — App mobile Parents (Expo / React Native)

MVP **consultation + push**. Phase 2 livrée : **connexion (JWT)** + **liste des enfants**.
Consomme l'API `/api/mobile/*` de l'app web Next.js.

> ⚠️ Cette app est **hors du workspace pnpm** (React Native ne gère pas les
> symlinks pnpm). On l'installe/l'exécute en **standalone avec npm**.

## Prérequis
- Node 18+ et **npm**.
- L'app web Jawal qui tourne (`pnpm dev` à la racine) et **joignable sur le réseau local**.
- Sur votre téléphone : l'app **Expo Go** (App Store / Play Store). *(Ou un simulateur iOS/Android.)*
- Le **téléphone et le PC sur le même Wi-Fi**.

> ### ⚠️ Expo Go n'exécute qu'une seule version du SDK
> Expo Go, tel qu'installé depuis le store, ne sait ouvrir qu'un projet dont le
> **SDK correspond au sien**. Si le projet est sur un SDK plus ancien, Expo Go
> affiche un écran bleu **« Something went wrong »** — sans rapport avec le code :
> le bundle Metro compile parfaitement.
>
> Ce projet est actuellement en **SDK 57**. Pour vérifier et réaligner :
> ```bash
> npx expo-doctor                       # doit afficher 21/21
> npx expo install expo@^57 --fix       # puis :
> npx expo install --fix
> ```
> Pour confirmer que le problème est natif et non JavaScript, demandez le bundle
> pendant que `expo start` tourne — un HTTP 200 innocente le code :
> ```bash
> curl "http://127.0.0.1:8081/index.bundle?platform=android&dev=true" -o /dev/null -w "%{http_code}\n"
> ```

## 1) Installer
```bash
cd apps/mobile
npm install
# Aligne les versions natives sur le SDK Expo installé :
npx expo install --fix
```

## 2) Configurer l'URL de l'API
Le téléphone ne voit pas le `localhost` du PC → il faut l'**IP LAN** de la machine.
- Windows : `ipconfig` → « Adresse IPv4 » (ex. `192.168.1.20`).
- Créez `apps/mobile/.env` :
```
EXPO_PUBLIC_API_URL=http://192.168.1.20:3000
```

> L'app web doit écouter sur le réseau (pas seulement 127.0.0.1). En dev Next.js
> écoute déjà sur 0.0.0.0 ; assurez-vous que le **pare-feu Windows** autorise le
> port 3000 sur le réseau privé.

## 3) Lancer
```bash
npx expo start
```
Scannez le **QR code** avec Expo Go (Android) ou l'app Appareil photo (iOS).

## 4) Se connecter (démo)
- Établissement : `demo`
- Email : `hassan.benani@demo.jawal.ma`
- Mot de passe : `parent1234`

Vous arrivez sur **« Mes enfants »** (tirez pour rafraîchir, bouton Déconnexion).

## Structure
```
App.tsx                  Racine : AuthProvider → Login ou Home selon le token
src/config.ts            URL de l'API (EXPO_PUBLIC_API_URL)
src/api.ts               Client HTTP + types + endpoints
src/auth.tsx             Contexte auth (token en SecureStore, login/logout)
src/screens/LoginScreen  Connexion (établissement + email + mot de passe)
src/screens/HomeScreen   Liste des enfants (GET /api/mobile/me)
```

## Notifications push (Phase 4)
L'app demande la permission, récupère un **jeton Expo** et l'enregistre via
`POST /api/mobile/push/register`. Une **nouvelle annonce** déclenche un push aux
parents concernés. Un bouton **« 🔔 Tester une notification »** (écran d'accueil)
envoie un push de test à vos appareils.

> ⚠️ Le push distant nécessite :
> 1. un **appareil physique** (pas de push sur simulateur) ;
> 2. un **projectId EAS** → lancez `npx eas init` (ajoute `extra.eas.projectId`
>    dans app.json) ;
> 3. selon la version d'Expo Go, un **development build** peut être requis
>    (`npx expo run:android` / `run:ios` ou `eas build --profile development`).
>    Android : `eas credentials` configure FCM ; iOS : APNs via EAS.

Sans ces prérequis, l'app fonctionne (consultation) mais le push est ignoré
silencieusement (best-effort).

## Messagerie (Phase 5)
Depuis l'accueil, la carte **« Messagerie avec l'école »** (badge de non-lus) ouvre
la liste des conversations. On peut :
- **écrire un nouveau message** (bouton « Nouveau » : objet + corps) — crée une
  conversation avec le personnel, comme sur le web ;
- **ouvrir un fil** et **répondre** (l'ouverture marque comme lu).

Quand l'**école répond** (admin ou enseignant), le parent reçoit une **notification
push** ; le tap ouvre directement le fil concerné.

Endpoints : `GET/POST /api/mobile/messages`, `GET /api/mobile/messages/[id]`,
`POST /api/mobile/messages/[id]/reply`. Le compteur de non-lus est dans
`GET /api/mobile/me` (`unreadMessages`).

## Paiement en ligne CMI (Phase 6)
Onglet **« Scolarité »** de la fiche enfant : échéancier (montant, reste dû,
statut) + total à payer. On coche les échéances à régler et on touche
**« Payer X MAD »** → un **WebView** ouvre la page de paiement sécurisée CMI
(auto-soumission d'un formulaire signé). Au retour, l'app **interroge le statut**
de la commande (le règlement est enregistré par le callback serveur signé, jamais
côté client) et affiche la confirmation.

- Dépendance : `react-native-webview` (installée par `npm install` /
  `npx expo install --fix`).
- Endpoints : `GET /api/mobile/children/[id]/scolarite`,
  `POST /api/mobile/children/[id]/pay` (crée la commande + renvoie le formulaire
  signé ; **503 `notConfigured`** si CMI non paramétré),
  `GET /api/mobile/payments/[orderId]` (statut, pour le polling).
- **Config CMI** (côté web/API) : variables `CMI_GATEWAY_URL`, `CMI_MERCHANT_ID`,
  `CMI_STORE_KEY` + `APP_URL` (base publique pour okUrl/callbackURL). Sans elles,
  l'onglet affiche « bientôt disponible ».

> En dev sans CMI configuré, l'échéancier s'affiche mais « Payer » indique que le
> paiement n'est pas encore activé.

## Build & publication (EAS)
La config est dans **`eas.json`** (profils `development`, `preview`, `production`)
et **`app.json`** (identifiants `ma.jawal.parents`, versioning `runtimeVersion`).

### 0) Prérequis (une fois)
- Un **compte Expo** (gratuit) : `npx expo login`.
- `npm install` (génère aussi le lockfile utilisé par EAS).
- **Icône & splash** (obligatoires pour les stores) : ajoutez
  `assets/icon.png` (1024×1024, sans transparence) et `assets/adaptive-icon.png`
  (Android), puis référencez-les dans `app.json` (`expo.icon`,
  `expo.android.adaptiveIcon.foregroundImage`). Sans ça, l'icône Expo par défaut
  est utilisée (OK pour un build interne, refusé par l'App Store).

### 1) Lier le projet EAS
```bash
npx eas init          # crée le projet + écrit extra.eas.projectId dans app.json
```
> Ce `projectId` est **aussi requis pour le push** (voir plus haut).

### 2) Renseigner l'URL de l'API de prod
Dans `eas.json`, remplacez `https://app.jawal.ma` par le **domaine public réel**
de l'app web (profils `preview` et `production`). `EXPO_PUBLIC_API_URL` est
**inliné au build** — un rebuild est nécessaire si l'URL change.

### 3) Builder
```bash
# APK de test interne (installable directement sur Android)
npx eas build --profile preview --platform android

# Build de production (AAB Android / IPA iOS signés) — Expo gère les certificats
npx eas build --profile production --platform all
```
> **iOS** nécessite un compte **Apple Developer** (99 $/an) ; Android un compte
> **Google Play Console** (25 $ une fois). EAS génère et stocke les certificats
> (`eas credentials` pour les gérer).

### 3 bis) APK pour le VPS sans nom de domaine
Le profil **`vps`** vise `http://57.129.157.247:8003` et produit un APK
Android installable par simple lien, sans passer par le Play Store :
```bash
npx eas build --profile vps --platform android
```
EAS affiche à la fin une page d'installation (lien + QR code) à transmettre.

`app.config.js` autorise le trafic HTTP non chiffré **uniquement** quand
`EXPO_PUBLIC_API_URL` commence par `http://` : sans cela Android refuse chaque
requête (« Network request failed »). Les builds `https` restent stricts.

> ⚠️ **À réserver à un pilote.** En HTTP, mots de passe et données des élèves
> circulent en clair. Et l'adresse est figée dans l'APK : le jour où un
> domaine arrive, chaque parent devra réinstaller. iOS n'est pas couvert
> (pas d'installation par lien sans compte Apple Developer + TestFlight).

### 4) Publier
```bash
npx eas submit --profile production --platform android   # → Play Console
npx eas submit --profile production --platform ios        # → App Store Connect
```

### Mises à jour OTA (optionnel)
Pour pousser des correctifs JS sans repasser par les stores :
`npx eas update` (nécessite `expo-updates` + `eas update:configure`).

## Durcissement avant production
- **`MOBILE_JWT_SECRET`** dédié (aujourd'hui on signe avec `AUTH_SECRET`).
- **Refresh tokens** + expiration plus courte de l'access token.
- **Rate-limit** sur `POST /api/mobile/auth/login`.
- Config **CMI par tenant** (aujourd'hui variables d'env globales).

## Dépannage

### Séquence de démarrage (mode USB — configuration actuelle du .env)
Trois choses doivent tourner **en même temps** : l'API web (3000), Metro (8081),
et les redirections `adb reverse` qui relient le téléphone aux deux.

```powershell
# Terminal A — API web (à la racine du dépôt)
pnpm dev

# Téléphone branché en USB, écran déverrouillé, débogage USB autorisé.

# Terminal B — app mobile
cd apps/mobile
npm start          # PAS « npx expo start » : npm start pose d'abord adb reverse
```
Puis, sur le téléphone : ouvrir **Expo Go** et recharger (secouer → *Reload*).

### Diagnostic en 4 commandes
À lancer dans PowerShell quand l'app ne démarre pas ou affiche
« connexion au serveur impossible ». Chaque commande a un résultat attendu :

```powershell
# 1) Le téléphone est-il vu ? → une ligne « <série>   device »
adb devices

# 2) Les deux redirections sont-elles posées ? → tcp:3000 ET tcp:8081 présents
adb reverse --list

# 3) L'API répond-elle ? → 401 (normal : pas de jeton) ; 000 = rien n'écoute
curl.exe -s -o NUL -w "%{http_code}`n" http://127.0.0.1:3000/api/mobile/me

# 4) Metro sert-il le bundle ? → 200 (la 1re fois : jusqu'à 1 min)
curl.exe -s -o NUL -w "%{http_code}`n" "http://127.0.0.1:8081/index.bundle?platform=android&dev=true"
```

### Réparations selon la commande qui échoue

| Symptôme | Commande de réparation |
|---|---|
| (2) `tcp:3000` absent de la liste — **cause la plus fréquente** | `adb reverse tcp:3000 tcp:3000` |
| (2) `tcp:8081` absent | `adb reverse tcp:8081 tcp:8081` |
| (2) le reverse pointe sur `tcp:8082` (ou 8083…) | **un autre projet React Native occupe 8081** — voir ci-dessous |
| (1) liste vide | `adb kill-server` puis `adb start-server` ; sinon changer de câble (certains ne font que charger) |
| (1) appareil en `unauthorized` | déverrouiller le téléphone et accepter « Autoriser le débogage USB » |
| (3) renvoie `000` | l'API ne tourne pas → `pnpm dev` à la racine |
| (4) renvoie `000` | Metro ne tourne pas → `npm start` dans `apps/mobile` |
| Expo Go : écran bleu « Something went wrong » | `npx expo-doctor` (doit afficher 21/21), puis `npx expo install --fix` |
| Modification du `.env` ignorée | arrêter expo start, relancer `npm start -- -c` (vide le cache Metro) |

Les redirections `adb reverse` sont **perdues à chaque débranchement du câble**,
au redémarrage du téléphone et à chaque relance du serveur adb — c'est pourquoi
`npm start` les repose systématiquement, et pourquoi `npx expo start` lancé
directement laisse l'app sans API.

### Un autre projet occupe déjà le port 8081
Metro se réserve 8081. Si un **autre** dépôt React Native tourne déjà sur la
machine, Expo bascule silencieusement sur 8082 : le téléphone qui charge depuis
8081 reçoit alors le bundle **de l'autre projet**. Symptôme : `adb reverse --list`
montre `tcp:8082` au lieu de `tcp:8081`.

Identifier le squatteur :

```powershell
$metroPid = (Get-NetTCPConnection -LocalPort 8081 -State Listen).OwningProcess
(Get-CimInstance Win32_Process -Filter "ProcessId=$metroPid").CommandLine
```

Puis, au choix :

```powershell
# A) libérer 8081 pour ce projet
Stop-Process -Id $metroPid
npm start

# B) faire cohabiter les deux — ce projet sur 8082
$env:RCT_METRO_PORT = "8082"
npm start
```
`scripts/adb-reverse.mjs` lit `RCT_METRO_PORT` : la redirection suit
automatiquement le port choisi.

### Basculer en Wi-Fi (sans câble)
```powershell
ipconfig    # relever « Adresse IPv4 » du Wi-Fi, ex. 192.168.254.211
```
Reporter cette IP dans `apps/mobile/.env` (`EXPO_PUBLIC_API_URL=http://<IP>:3000`),
puis relancer `npm start -- -c`. L'IP LAN **change** d'un réseau à l'autre : c'est
la cause n°1 des pannes en mode Wi-Fi. Vérification depuis le navigateur du
téléphone : `http://<IP>:3000/fr/login` doit s'afficher. Sinon, ouvrir le port
3000 dans le pare-feu Windows (profil « Réseau privé »).
