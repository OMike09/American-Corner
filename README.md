# American Corner — version Node.js

Plateforme numérique du Département d’anglais de l’Université de Bouaké. **Backend JavaScript / Express**, interface responsive en HTML/CSS/JavaScript, base SQLite. Le projet s’installe avec **`npm install`** et démarre avec **`npm start`** ; aucune commande Python n’est nécessaire.

**Déploiement de votre Web Service Render existant :** voir [DEPLOIEMENT_RENDER.md](DEPLOIEMENT_RENDER.md). **Installation Android/iPhone :** voir [INSTALLATION_MOBILE.md](INSTALLATION_MOBILE.md).

## Démarrage local

Node.js 20 à 25 requis.

```bash
npm install
AC_DEMO=1 npm start
```

Ouvrir http://localhost:8000. Les comptes d’essai apparaissent sur la page de connexion. `AC_DEMO=1` est exclusivement destiné à un environnement local de démonstration.

### Initialisation sans comptes de démonstration

```bash
AC_ADMIN_EMAIL=chef@exemple.edu.ci AC_ADMIN_PASSWORD='UnMotDePasseFort123!' \
AC_DATA=/chemin/vers/stockage-prive npm start
```

Au premier lancement, le compte chef est créé si aucun chef n’existe dans la base. Ne mettez jamais ces identifiants dans le dépôt Git. Le serveur utilise automatiquement la variable `PORT` de Render et écoute sur `0.0.0.0`.

## Architecture et sécurité

- `sharing.js` : sélection de plusieurs destinataires, contrôle des périmètres et des accès, instantané des destinataires, vues, accusés, notifications internes et rappels, historique et statistiques persistées.
- `server.js` : API Express `/api/*`, sessions stockées en base, vérification des permissions **côté serveur**, SQL paramétré, validation des requêtes et journal d’audit.
- `static/` : interface responsive sans framework, servie depuis le même domaine ; requêtes par URL relative. Manifeste PWA, icônes Android/iOS et service worker pour l’installation sur l’écran d’accueil. Seuls les fichiers publics de l’interface sont mis en cache : jamais l’API, les notes ou les documents privés.
- `better-sqlite3` : base relationnelle dans `AC_DATA/american_corner.sqlite3`. `AC_DATA/uploads` conserve les fichiers téléversés (limite 10 Mo, type contrôlé, nom interne aléatoire, accès vérifié avant téléchargement).
- Mots de passe hachés par PBKDF2-HMAC-SHA256 avec sel aléatoire ; cookie HttpOnly/SameSite, option Secure derrière HTTPS, jeton CSRF, vérification de l’origine et limitation des tentatives de connexion.
- Les restrictions sont vérifiées sur les ressources : étudiant et ses seules notes publiées, enseignant et ses cours, public visé par une annonce, propriétaire d’une demande, responsable d’un mémoire.
- `manage.js` : vérification et restauration **hors ligne** des sauvegardes SQLite. Le chef peut créer une sauvegarde depuis l’interface.

### Parcours opérationnels

Inscription avec validation **et accès automatique dès l’approbation** (l’inscrit peut attendre sur l’écran de validation ; sa session en attente n’a accès à aucune donnée protégée), gestion des comptes et rôles, tableaux de bord, années/niveaux/parcours, cours et listes d’étudiants, annonces ciblées et validées, calendrier ciblé, bibliothèque avec téléversement et téléchargement, saisie → validation → publication des notes, demandes administratives et historique, suivi simple des mémoires/thèses, notifications dans l’application, audit et sauvegarde. Si l’utilisateur a quitté la page ou si sa session d’attente a expiré, il peut se connecter normalement dès que son compte est validé.

### Partage ciblé et suivi (mise à jour 3)

- **Annonces, documents téléversés et événements** : sélectionner plusieurs cibles (département, rôles, niveaux, parcours, cours, groupes, personnes) parmi les options que le serveur autorise au rôle. Un enseignant ne peut cibler que les étudiants **inscrits explicitement** à ses cours, même lorsqu’il choisit un niveau ; les responsables de niveau, délégués et comptes Master/Doctorat restent dans leur périmètre. Le chef peut ajuster les permissions de rôle depuis son espace. Les adresses ou identifiants directs non autorisés sont refusés côté serveur.
- **Gestion des inscriptions aux cours** : dans Enseignements, le chef choisit « Gérer les inscriptions » après avoir créé un cours. Les nouveaux cours n’inscrivent personne automatiquement. Au premier démarrage de cette mise à jour, les anciens cours reçoivent une liste initiale déduite de leur niveau/parcours/année : **le chef doit la vérifier**. Impossible de retirer un étudiant qui possède une note conservée pour ce cours. Le retrait d’une inscription révoque l’accès aux publications protégées ciblant ce cours ; les traces historiques restent en base.
- **Mes communications** : publications reçues et envoyées, détail explicite, téléchargement contrôlé, accusé demandé séparément, historique des modifications, retrait et relances des destinataires sans vue ou sans accusé. Les statistiques nominatives (destinataires actuels, première/dernière ouverture, nombre de vues, notification mise à disposition/reçue dans l’application, téléchargement et accusé) sont visibles à l’auteur ou aux responsables autorisés. Une simple liste n’enregistre pas de vue ; ouvrir le détail ou télécharger oui. Les rappels sont limités à un par destinataire et par heure.
- **Résultats** : annonce générale possible en catégorie « Résultats », mais la consultation individuelle d’une note publiée est suivie **séparément**. Le suivi par cours ne fournit que noms et dates de consultation, jamais les notes aux profils n’ayant pas le droit de les voir. Les notes provisoires ne deviennent pas officielles avant validation puis publication.
- Les notifications sont **internes à l’application** : « envoyée » signifie créée dans la boîte du destinataire, « reçue » signifie affichée/confirmée par son interface ; aucun e-mail, push ni preuve de lecture hors application n’est impliqué. Une vue signifie ouverture du détail dans l’application, pas compréhension du contenu. Les destinataires sont figés au moment de la publication ; une nouvelle inscription n’ajoute pas automatiquement un destinataire à une ancienne publication.

### Non livrés dans cette version

Forum, inscription aux événements, exports PDF/Excel/CSV, import massif de notes, notifications push, versionnement des travaux de recherche, favoris, délégations temporaires détaillées, gestion avancée des sessions et restauration depuis l’interface. La réinitialisation du mot de passe par e-mail nécessite un serveur SMTP et `AC_BASE_URL`. Une recette académique et une revue de sécurité indépendantes sont nécessaires avant tout usage institutionnel.

## Sauvegarde et restauration

Le chef peut créer un fichier `backup-*.sqlite3` depuis Paramètres. Après avoir arrêté le serveur :

```bash
AC_DATA=/chemin/vers/stockage-prive node manage.js verify backup-AAAAmmjj-HHMMSS.sqlite3
AC_DATA=/chemin/vers/stockage-prive node manage.js restore backup-AAAAmmjj-HHMMSS.sqlite3 --confirm
```

Une copie de sécurité de l’ancienne base est créée. **Les fichiers `AC_DATA/uploads` doivent être sauvegardés séparément.**

## Tests

```bash
npm test
```

Les tests lancent un serveur Node réel sur une base temporaire et vérifient le démarrage Render, le contrôle de santé, le CSRF, l’escalade de privilèges, les notes et corrections, le ciblage multi-rôles, les inscriptions effectives aux cours, la révocation d’accès, les vues/accusés/rappels, la confidentialité des résultats, les événements et fichiers, les demandes, la suspension, les sauvegardes et la présence des ressources PWA. Les tests automatisés portent sur l’API HTTP et la syntaxe JavaScript ; ils ne remplacent pas une recette visuelle/navigateur ou sur téléphone réel. La procédure d’installation doit aussi être vérifiée manuellement sur un vrai Android et un vrai iPhone.

## Point critique : hébergement Render gratuit

Le système de fichiers d’un Web Service Render gratuit n’est pas un stockage permanent. Une base SQLite, des notes et des documents enregistrés localement peuvent disparaître. **Utilisez ce déploiement seulement pour une démonstration sans données personnelles réelles.** Pour la production, il faut soit un plan compatible avec un disque persistant et des sauvegardes hors site, soit migrer explicitement vers PostgreSQL **et** un stockage d’objets pour les fichiers. Définir simplement `DATABASE_URL` ne migre pas le code SQLite.
