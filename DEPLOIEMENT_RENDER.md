# American Corner sur Render — installation Node.js

Votre Web Service Render utilise **Node.js**, avec **`npm install`** et **`npm start`**. Cette version du projet correspond à ces commandes : `npm start` exécute `node server.js`. Il ne dépend plus de Python.

> **Render gratuit = démonstration seulement.** SQLite et les documents déposés sur le système de fichiers du service peuvent être perdus au redémarrage ou au redéploiement. N’y enregistrez aucune donnée personnelle, note ou document universitaire réel.

## 1. Envoyer les fichiers au dépôt vide

Téléchargez la dernière archive **`american-corner-node-render-7.zip`** (contrôle général, messagerie, vidéos, affichage et maintenance), décompressez-la et placez **les fichiers décompressés** à la racine du dépôt lié à Render. À la racine doivent se trouver `package.json`, `package-lock.json`, `server.js`, `render.yaml` et le dossier `static/`. **Ne téléversez pas seulement le ZIP** : Render ne le décompressera pas automatiquement.

Avec Git, depuis le dossier décompressé :

```bash
git init
git branch -M main
git remote add origin URL_REELLE_DU_DEPOT
git add .
git commit -m "American Corner Node.js pour Render"
git push -u origin main
```

Si le dépôt contient déjà un commit, clonez-le d’abord et copiez les fichiers dedans. Le `.gitignore` exclut `node_modules/`, `.env`, `data/`, les bases SQLite et les documents ; vérifiez le contenu du commit avant l’envoi.

## 2. Paramétrer votre Web Service existant

Dans **Render → votre Web Service → Settings**, utilisez :

| Paramètre | Valeur |
|---|---|
| Runtime/Environment | **Node.js** |
| Branch | `main` (ou votre branche réelle) |
| Root Directory | vide si `package.json` est à la racine du dépôt |
| Build Command | **`npm install`** |
| Start Command | **`npm start`** |
| Health Check Path | `/healthz` |
| Instance Type | Free **pour démonstration seulement** |

Dans **Environment**, ajoutez :

| Variable | Valeur |
|---|---|
| `AC_DEMO` | `0` — ne jamais publier les comptes de démonstration |
| `AC_DATA` | `/tmp/american-corner-data` — stockage éphémère sur Free |
| `AC_BASE_URL` | `https://amer-corner.oymiketech.com` — domaine commun pour les liens envoyés |
| `AC_ADMIN_EMAIL` | votre adresse e-mail d’administration |
| `AC_ADMIN_PASSWORD` | mot de passe long, unique, contenant lettres et chiffres |

Pour les alertes en arrière-plan, ajoutez aussi `AC_VAPID_PUBLIC_KEY`, `AC_VAPID_PRIVATE_KEY` et `AC_VAPID_SUBJECT` selon [CONFIGURATION_PUSH.md](CONFIGURATION_PUSH.md). Sans ces trois variables, la page Notifications et les vues fonctionnent, **mais aucun push système n’est envoyé**. Conservez les mêmes clés à chaque déploiement.

N’ajoutez pas les mots de passe dans Git ou `render.yaml`. Ne définissez pas `PORT` : Render le fournit. `render.yaml` est un Blueprint **facultatif** ; comme votre Web Service existe déjà, ne l’importez pas pour créer un deuxième service.

## 3. Déployer et vérifier

1. Envoyez les fichiers au dépôt. Lancez **Manual Deploy → Deploy latest commit**, si le déploiement automatique n’a pas démarré.
2. Les logs doivent indiquer `American Corner on http://0.0.0.0:<port> (demo=false)`.
3. Visitez `https://amer-corner.oymiketech.com/healthz` : réponse attendue `{"status":"ok"}`. Le domaine peut déjà répondre alors qu’une ancienne version tourne encore : vérifiez également que `/chef` répond **200**, et non **404**.
4. **Chef :** ouvrez `https://amer-corner.oymiketech.com/chef` et connectez-vous avec `AC_ADMIN_EMAIL` / `AC_ADMIN_PASSWORD`. **Autres utilisateurs :** ouvrez l’URL principale sans `/chef`. N’ajoutez pas l’adresse réservée aux menus ou aux consignes publiques. Les identifiants du chef sont refusés sur la connexion publique ; les autres comptes sont refusés sur l’entrée réservée.
5. Après mise à jour, vérifiez dans **Enseignements → Gérer les inscriptions** les listes déduites pour les anciens cours ; les nouveaux cours exigent une inscription explicite avant un partage par cours ou la saisie de notes. Testez « Mes communications » avec deux comptes fictifs et vérifiez qu’un autre rôle ne peut pas ouvrir l’URL du contenu. Testez avec des informations fictives uniquement. Un compte inscrit reste sur un écran d’attente ; dès que le chef le valide, il entre automatiquement dans son espace si cette page est encore ouverte. Un utilisateur qui a fermé la page peut se connecter immédiatement après validation.
6. Sur un téléphone, ouvrez **directement** https://amer-corner.oymiketech.com dans Chrome (Android) ou Safari (iPhone), puis suivez [INSTALLATION_MOBILE.md](INSTALLATION_MOBILE.md). L’installation depuis une prévisualisation intégrée ou un fichier ZIP n’est pas possible : il faut d’abord déployer la PWA sur Render.
7. Vérifiez qu’une même personne ouvrant deux fois une publication apparaît toujours comme **une seule vue** dans « Suivi des publications » ; les ouvertures répétées restent une mesure technique distincte. Après avoir configuré les clés VAPID, activez les notifications sur chaque téléphone, lancez le bouton de test et vérifiez les états application ouverte, en arrière-plan et fermée. La vérification sur appareils réels doit être faite par vos soins après déploiement. Voir [CONFIGURATION_PUSH.md](CONFIGURATION_PUSH.md).

**Changement de domaine pour les téléphones :** les installations faites auparavant depuis `*.onrender.com` et leurs abonnements push ne basculent pas automatiquement vers `amer-corner.oymiketech.com`. Ouvrez/réinstallez la PWA depuis le sous-domaine et réautorisez les notifications. Les requêtes API, le service worker et les liens de notification suivent ensuite ce domaine.

Cette mise à jour conserve les tables de suivi et les inscriptions de départ créées lors du colis 3 ; **sauvegardez la base SQLite et le dossier `uploads/` avant le redéploiement** si vous utilisez un stockage persistant. Cette mise à jour nécessite un nouveau commit suivi d’un redéploiement de votre Web Service. Les statistiques et notifications sont conservées dans SQLite : sur Render Free, elles peuvent donc être perdues comme les autres données.

### Si cela échoue

- `Missing script: start` → `package.json` n’est pas dans le **Root Directory** configuré dans Render.
- `Cannot find module 'better-sqlite3'` → vérifiez que `npm install` s’exécute sans erreur dans les logs. Si une version Node incompatible est utilisée, sélectionnez une version Node 20, 22 ou 24 ; le projet accepte Node 20 à 25.
- `Premier démarrage : configurez AC_ADMIN_EMAIL...` → ajoutez les deux variables d’administration.
- `Application failed to respond` → vérifiez `npm start`, le port ouvert et les logs.
- Données disparues après redémarrage → conséquence attendue du stockage éphémère sur le plan gratuit.

## 4. Avant une utilisation réelle du département

**Le déploiement gratuit ne garantit pas la conservation des données.** Deux trajectoires possibles :

1. **Disque persistant Render, si le plan choisi le permet** : monter le disque sur un chemin dédié, placer `AC_DATA` sur ce disque et sauvegarder également les fichiers `uploads/` hors site. Limiter l’application à une seule instance SQLite.
2. **PostgreSQL + stockage d’objets** : migrer effectivement `server.js` de SQLite vers PostgreSQL et stocker les documents dans un service persistant. La simple présence d’une variable `DATABASE_URL` ne suffit pas.

Pour les réinitialisations par courriel en production, conserver `AC_BASE_URL=https://amer-corner.oymiketech.com` et configurer également `AC_SMTP_HOST`, `AC_SMTP_PORT`, `AC_SMTP_USER`, `AC_SMTP_PASSWORD` et `AC_SMTP_FROM`. Prévoir aussi une revue de sécurité, une politique de confidentialité, des sauvegardes/restaurations testées et la validation officielle des circuits de résultats.

## Colis 7 — nouveaux réglages et limites

Après déploiement, le chef ouvre `/chef`, puis **Paramètres généraux et contrôle**, **Analyse et maintenance** et **Rôles & permissions**. Les comptes ordinaires utilisent les rubriques **Messages privés**, **Vidéos** et **Mon profil → Taille du texte**. Les préférences sont enregistrées dans SQLite ; la messagerie et les vidéos sont également persistantes uniquement si `AC_DATA` et `uploads/` sont sur un disque persistant. **Avant la migration, sauvegardez la base et les fichiers téléversés ensemble**. Sur Render Free sans disque persistant, un redéploiement peut les effacer. Ne considérez pas une sauvegarde SQLite seule comme une copie des vidéos/documents.

Les limites quotidiennes sont calculées dans le fuseau **Africa/Abidjan** : 5 messages par compte et 2 vidéos par auteur chef/enseignant par défaut. Les dérogations vidéo temporaires sont auditées. Les vidéos acceptées sont MP4 ou WebM, avec vérification de conteneur et limite de taille (1–25 Mo, valeur initiale 10 Mo) ; pour contrôler la durée maximale, installer séparément `ffprobe` et régler `AC_FFPROBE` sur son chemin absolu. Sans cela, laisser la durée à **0 = non contrôlée** ; aucune compression/transcodage vidéo n’est fourni. Essayer la lecture dans les navigateurs cibles avec le codec réellement utilisé.

La surveillance technique suit les indicateurs observables dans **ce processus Node.js**. Les alertes arrivent dans l’application et sont proposées à Web Push si VAPID et l’abonnement du chef sont configurés. Sur Render Free, le processus peut être mis en sommeil et ne surveille pas pendant ce temps ; configurez aussi les alertes Render et un monitoring externe. Le stockage libre renvoyé par le système n’est pas forcément le quota exact du plan. Le nettoyage planifié ne concerne que les anciens fichiers temporaires `data/temp/ac-tmp-*` ; aucune suppression automatique des comptes, notes, documents, journaux ou preuves. L’archivage manuel des connexions de plus d’un an crée une sauvegarde SQLite préalable et conserve ces événements dans `archived_login_events`. Gardez une copie **hors de Render** de la base et de `uploads/`.

La création de rôles personnalisés est limitée à une liste de permissions vérifiées côté serveur ; les permissions administratives ou d’édition de résultats ne peuvent pas être attribuées à un nouveau rôle. Un délégué de niveau doit avoir un niveau correspondant à son mandat et les permissions `announcements.create` et `delegation.relay` ; la publication officielle reste soumise à validation. La suppression d’une attribution n’efface pas le compte. Les mandats peuvent expirer, et les rôles personnalisés peuvent être suspendus/réactivés.
