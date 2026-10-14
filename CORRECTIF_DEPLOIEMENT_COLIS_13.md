# Correctif ciblé du déploiement du colis 13

Le commit public `1604c78` a reçu le delta **12 → 13** alors que plusieurs fichiers du colis **11 → 12** n'avaient pas été ajoutés au dépôt. Le démarrage a été reproduit sur une copie de ce commit après `npm ci` : `Cannot find module './academic-pathways'` dans `server.js`. Les migrations PostgreSQL `007` à `010` manquent également et empêcheraient la progression vers le schéma 11.

Cette archive de réparation contient **uniquement les 12 fichiers manquants ou périmés** par rapport au code du colis 13 déjà présent sur GitHub : `LIVRAISON_COLIS_12.md`, `academic-pathways.js`, `controls.js`, `publication-media.js`, `sharing.js`, `migrations/007` à `010`, `tests/migrate-v6.test.js`, `tests/pathway-hierarchy-v12.test.js`, `tests/postgres-accounts.test.js`. Aucun fichier du colis 13 déjà téléversé n'est remplacé.

## Appliquer sans effacer les données

1. Décompresser cette archive sur l'ordinateur. Dans GitHub, **ajouter/remplacer les fichiers extraits** à la racine du dépôt `OMike09/American-Corner`, en conservant les sous-dossiers `migrations/` et `tests/` ; ne pas déposer le ZIP non décompressé comme un fichier isolé.
2. Créer un nouveau commit sur `main`. Laisser Render redéployer automatiquement le Web Service **Node.js** existant (`npm install`, `npm start`). Ne pas modifier ni communiquer la variable `DATABASE_URL` déjà configurée ; ne pas supprimer les comptes, les fichiers ou la base.
3. Vérifier le journal du nouveau déploiement : démarrage sans erreur et statut **Live**, `/healthz`, puis `https://amer-corner.oymiketech.com/` et `/chef`. Vérifier le logo, le script versionné `app.js?v=13-brand-updates` et `/api/app-version` (build `13.0.0`). Les notes de version ne doivent être publiées par le chef qu'après la recette réelle.
4. Si le déploiement échoue encore, fournir **les dernières lignes du journal de ce nouveau déploiement**, sans mots de passe, cookies ni valeur de `DATABASE_URL`. Une simple capture « Failed » ne contient pas le message d'erreur.

**Validation du correctif localement :** application de ces 12 fichiers à un clone du commit public, installation des dépendances et démarrage réussi ; `npm test` : 48 tests, 41 réussis, 7 ignorés faute d'URL PostgreSQL de test, aucun échec. Cela ne constitue pas une validation sur Render : vérifier le nouveau déploiement avant de le considérer réglé.
