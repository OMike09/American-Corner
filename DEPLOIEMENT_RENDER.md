# American Corner sur Render — installation Node.js

Votre Web Service Render utilise **Node.js**, avec **`npm install`** et **`npm start`**. Cette version du projet correspond à ces commandes : `npm start` exécute `node server.js`. Il ne dépend plus de Python.

> **Render gratuit = démonstration seulement.** SQLite et les documents déposés sur le système de fichiers du service peuvent être perdus au redémarrage ou au redéploiement. N’y enregistrez aucune donnée personnelle, note ou document universitaire réel.

## 1. Envoyer les fichiers au dépôt vide

Téléchargez la dernière archive **`american-corner-node-render-3.zip`** (partage ciblé, suivi et installation Android/iPhone), décompressez-la et placez **les fichiers décompressés** à la racine du dépôt lié à Render. À la racine doivent se trouver `package.json`, `package-lock.json`, `server.js`, `render.yaml` et le dossier `static/`. **Ne téléversez pas seulement le ZIP** : Render ne le décompressera pas automatiquement.

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
| `AC_ADMIN_EMAIL` | votre adresse e-mail d’administration |
| `AC_ADMIN_PASSWORD` | mot de passe long, unique, contenant lettres et chiffres |

N’ajoutez pas les mots de passe dans Git ou `render.yaml`. Ne définissez pas `PORT` : Render le fournit. `render.yaml` est un Blueprint **facultatif** ; comme votre Web Service existe déjà, ne l’importez pas pour créer un deuxième service.

## 3. Déployer et vérifier

1. Envoyez les fichiers au dépôt. Lancez **Manual Deploy → Deploy latest commit**, si le déploiement automatique n’a pas démarré.
2. Les logs doivent indiquer `American Corner on http://0.0.0.0:<port> (demo=false)`.
3. Visitez `https://VOTRE-SERVICE.onrender.com/healthz` : réponse attendue `{"status":"ok"}`.
4. Ouvrez l’URL principale et connectez-vous avec `AC_ADMIN_EMAIL` / `AC_ADMIN_PASSWORD`.
5. Après mise à jour, vérifiez dans **Enseignements → Gérer les inscriptions** les listes déduites pour les anciens cours ; les nouveaux cours exigent une inscription explicite avant un partage par cours ou la saisie de notes. Testez « Mes communications » avec deux comptes fictifs et vérifiez qu’un autre rôle ne peut pas ouvrir l’URL du contenu. Testez avec des informations fictives uniquement. Un compte inscrit reste sur un écran d’attente ; dès que le chef le valide, il entre automatiquement dans son espace si cette page est encore ouverte. Un utilisateur qui a fermé la page peut se connecter immédiatement après validation.
6. Sur un téléphone, ouvrez **directement** l’URL HTTPS Render dans Chrome (Android) ou Safari (iPhone), puis suivez [INSTALLATION_MOBILE.md](INSTALLATION_MOBILE.md). L’installation depuis une prévisualisation intégrée ou un fichier ZIP n’est pas possible : il faut d’abord déployer la PWA sur Render.

Cette mise à jour crée automatiquement des tables de suivi et des inscriptions de départ pour les anciens cours ; **sauvegardez la base SQLite et le dossier `uploads/` avant le redéploiement** si vous utilisez un stockage persistant. Cette mise à jour nécessite un nouveau commit suivi d’un redéploiement de votre Web Service. Les statistiques et notifications sont conservées dans SQLite : sur Render Free, elles peuvent donc être perdues comme les autres données.

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

Pour les réinitialisations par courriel en production, configurer `AC_BASE_URL=https://VOTRE-SERVICE.onrender.com` ainsi que `AC_SMTP_HOST`, `AC_SMTP_PORT`, `AC_SMTP_USER`, `AC_SMTP_PASSWORD` et `AC_SMTP_FROM`. Prévoir aussi une revue de sécurité, une politique de confidentialité, des sauvegardes/restaurations testées et la validation officielle des circuits de résultats.
