# Mise en service PostgreSQL sur le Web Service Render existant

**Décision du propriétaire, 14 octobre 2026 :** l'unique ancien utilisateur peut refaire son inscription. Il n'est donc **pas nécessaire de migrer cet ancien compte** pour commencer à enregistrer les nouvelles inscriptions dans PostgreSQL. Ce choix n'efface pas l'ancien fichier SQLite : il n'est simplement plus lu lorsque `DATABASE_URL` est disponible. Ne dites pas à l'ancien utilisateur que son compte a été transféré.

**Important :** cette archive n'a pas été déployée ni testée sur votre Render réel par l'assistant. Les vérifications ci-dessous sont à effectuer lors de la mise en service.

## 1. Réglages à conserver sur le service existant

| Réglage | Valeur |
|---|---|
| Runtime | **Node.js** |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Health Check | `/healthz` |
| `AC_DEMO` | `0` |
| `DATABASE_URL` | **Déjà défini chez vous sur Render : le conserver, ne jamais copier sa valeur dans le code, Git ou une capture** |
| `AC_ADMIN_EMAIL`, `AC_ADMIN_PASSWORD` | À conserver dans les variables privées Render pour créer le chef au premier démarrage d'une base PostgreSQL sans chef ; ne pas partager le mot de passe |
| `AC_BASE_URL` | `https://amer-corner.oymiketech.com` |

Utilisez le **Web Service déjà existant**. N'importez pas `render.yaml` pour en créer un second. Vérifiez que `DATABASE_URL` pointe sur la base PostgreSQL que vous souhaitez conserver et qu'elle restera disponible selon les conditions de votre offre. Si cette base contient déjà des comptes, cette application **ne la vide pas**. Si elle contient un schéma inconnu ou si la connexion échoue, le serveur s'arrête : aucune écriture SQLite de secours.

## 2. Publier le colis

Décompressez `american-corner-node-render-9-postgresql.zip`. Placez le **contenu** du dossier à la racine du dépôt lié à Render (par exemple `server.js`, `package.json`, `package-lock.json`, `migrations/`, `static/`). N'envoyez ni le ZIP seul ni `node_modules/`, ni sauvegarde de base, ni mot de passe. Poussez les fichiers sur la branche que le Web Service utilise ; Render lancera `npm install` puis `npm start`.

**À propos de l'ancien compte :** si l'ancienne base SQLite subsiste dans `AC_DATA`, le serveur émet un avertissement mais ne la lit, ne la modifie et ne la supprime pas. Son ancien compte ne sera pas connecté automatiquement : l'intéressé se réinscrit après la mise en service, puis attend la validation du chef. Si vous avez encore accès à l'ancienne base et souhaitez la garder comme précaution, copiez-la hors de Render ; ce n'est plus un préalable bloquant pour ce compte abandonné.

## 3. Vérifier réellement la persistance des nouveaux comptes

1. Voir dans les logs que le service démarre et que `/healthz` répond `{"status":"ok"}`. Un `DATABASE_URL` absent ou indisponible doit empêcher le démarrage, **pas produire une nouvelle base SQLite en production**.
2. Accéder directement à `https://amer-corner.oymiketech.com/chef` et connecter le chef. La page publique `/` ne présente pas l'entrée du chef. Sur PostgreSQL vide, le chef initial est créé avec les deux variables privées d'administration.
3. Depuis la page publique, inscrire un **compte d'essai inédit** (adresse et identifiant jamais utilisés) ; confirmer le mot de passe. L'inscription est **en attente**, pas déjà active. Si vous utilisez un parcours, le chef peut d'abord en créer un dans « Structure académique ».
4. Le chef retrouve ce compte dans « Utilisateurs », le valide ; l'utilisateur peut se connecter immédiatement. Seul le serveur peut octroyer les rôles, pas le formulaire d'inscription.
5. Faire un redémarrage contrôlé du Web Service, puis vérifier que **ce même nouveau compte** peut encore se connecter, que son statut et son rôle restent corrects et que le chef le voit toujours. Cette vérification en production doit encore être faite.
6. Créer une sauvegarde PostgreSQL depuis « Paramètres », **la télécharger hors du service** et tester sa vérification (`node manage.js verify fichier.pg.json.gz`). Tester ultérieurement une restauration sur une base PostgreSQL **séparée et vide**, jamais sur la base contenant des comptes actifs.

Les comptes, sessions, rôles, résultats, messages et fichiers nouveaux sont stockés dans PostgreSQL lorsque `DATABASE_URL` est défini. Le système n'a pas besoin de l'ancien utilisateur pour les enregistrer. Les documents/vidéos/images joints sont dans PostgreSQL (`file_blobs`), pas uniquement dans `AC_DATA/uploads` ; surveillez la capacité et la politique de sauvegarde de la **base PostgreSQL elle-même**. Le système de fichiers du Web Service gratuit et les sauvegardes qui y restent peuvent disparaître au redéploiement.

## Si le démarrage échoue

- `DATABASE_URL requis` : vérifier sa présence dans les variables privées du **bon Web Service** (ne pas partager la valeur).
- « Base PostgreSQL contient déjà des tables inconnues » : ne pas réinitialiser cette base ; inspecter son schéma et choisir prudemment la bonne base.
- « Premier démarrage : configurez AC_ADMIN_EMAIL et AC_ADMIN_PASSWORD » : renseigner ces variables privées pour le compte chef initial.
- `Missing script: start` : les fichiers décompressés ne sont pas à la racine du dépôt ou le Root Directory Render est incorrect.
- Erreur réseau PostgreSQL : vérifier l'état de la base et son URL privée ; le serveur ne revient pas à SQLite.

Pour le dossier d'import **optionnel** d'une ancienne SQLite complète, les scripts `migrate-sqlite-to-postgres.js`, `restore-postgres.js` et le compte rendu sont conservés dans le colis. **Ne lancez jamais l'importeur sur une base PostgreSQL où des comptes nouveaux existent déjà** : il refuse volontairement la destination non vide. Les autres anciennes données éventuelles ne sont pas réputées migrées du simple fait de l'abandon de cet unique compte.
