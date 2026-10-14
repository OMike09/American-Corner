# American Corner — version Node.js

> **Version PostgreSQL pour les nouvelles inscriptions — déploiement Render encore à vérifier.** Le propriétaire a décidé le 14 octobre 2026 que l'unique ancien utilisateur pourra refaire son inscription : son compte SQLite n'est pas migré. Avec `DATABASE_URL`, les nouveaux comptes et fichiers sont enregistrés dans PostgreSQL, sans repli local en production. Conservez la variable privée Render déjà définie et suivez [DEPLOIEMENT_RENDER.md](DEPLOIEMENT_RENDER.md) pour publier et vérifier l'inscription, la validation puis la reconnexion après redémarrage. [Compte rendu technique](COMPTE_RENDU_MIGRATION_PG.md). Le mode SQLite sans `DATABASE_URL` est réservé à la démonstration locale et aux tests.

Plateforme numérique du Département d’anglais de l’Université de Bouaké. **Backend JavaScript / Express**, interface responsive en HTML/CSS/JavaScript, PostgreSQL pour la production. Le projet s’installe avec **`npm install`** et démarre avec **`npm start`** ; aucune commande Python n’est nécessaire.

**Adresse commune :** [https://amer-corner.oymiketech.com](https://amer-corner.oymiketech.com). **Déploiement de votre Web Service Render existant :** voir [DEPLOIEMENT_RENDER.md](DEPLOIEMENT_RENDER.md). **Installation Android/iPhone :** voir [INSTALLATION_MOBILE.md](INSTALLATION_MOBILE.md). **Notifications Web Push :** voir [CONFIGURATION_PUSH.md](CONFIGURATION_PUSH.md).

## Démarrage local

Node.js 20 à 25 requis.

```bash
npm install
AC_DEMO=1 npm start
```

Ouvrir http://localhost:8000. Les comptes étudiant et enseignant de démonstration apparaissent sur la page publique ; l’accès du chef reste séparé et n’y est pas affiché. `AC_DEMO=1` est exclusivement destiné à un environnement local de démonstration.

### Initialisation sans comptes de démonstration

```bash
AC_ADMIN_EMAIL=chef@exemple.edu.ci AC_ADMIN_PASSWORD='UnMotDePasseFort123!' \
AC_DATA=/chemin/vers/stockage-prive npm start
```

Au premier lancement, le compte chef est créé si aucun chef n’existe dans la base. Ne mettez jamais ces identifiants dans le dépôt Git. Le serveur utilise automatiquement la variable `PORT` de Render et écoute sur `0.0.0.0`.

## Architecture et sécurité

- `sharing.js` : sélection de plusieurs destinataires, contrôle des périmètres et des accès, instantané des destinataires, vues, accusés, notifications internes et rappels, historique et statistiques persistées.
- `controls.js` : paramètres du chef, surveillance technique, messagerie privée, vidéos, préférences d’affichage et nettoyage limité aux temporaires.
- `server.js` : API Express `/api/*`, sessions stockées en base, vérification des permissions **côté serveur**, SQL paramétré, validation des requêtes et journal d’audit.
- `static/` : interface responsive sans framework, servie depuis le même domaine ; requêtes par URL relative. Manifeste PWA, icônes Android/iOS et service worker pour l’installation sur l’écran d’accueil. Seuls les fichiers publics de l’interface sont mis en cache : jamais l’API, les notes ou les documents privés.
- `DATABASE_URL` : base PostgreSQL requise en production. Comptes et fichiers binaires référencés sont conservés dans PostgreSQL ; SQLite et `AC_DATA/uploads` ne servent qu’au développement local autorisé. Images compressées en WebP avec `sharp`, vidéo sans transcodage. Les limites de fichiers restent paramétrables.
- Mots de passe hachés par PBKDF2-HMAC-SHA256 avec sel aléatoire ; cookie HttpOnly/SameSite, option Secure derrière HTTPS, jeton CSRF, vérification de l’origine et limitation des tentatives de connexion.
- Les restrictions sont vérifiées sur les ressources : étudiant et ses seules notes publiées, enseignant et ses cours, public visé par une annonce, propriétaire d’une demande, responsable d’un mémoire.
- `manage.js` : vérification hors ligne des exports SQLite et PostgreSQL ; `restore-postgres.js` : restauration uniquement dans une destination PostgreSQL vide et isolée. Le chef peut créer une sauvegarde depuis l’interface.

### Parcours opérationnels

Inscription avec validation **et accès automatique dès l’approbation** (l’inscrit peut attendre sur l’écran de validation ; sa session en attente n’a accès à aucune donnée protégée), gestion des comptes et rôles, tableaux de bord, années/niveaux/parcours, cours et listes d’étudiants, annonces ciblées et validées, calendrier ciblé, bibliothèque avec téléversement et téléchargement, saisie → validation → publication des notes, demandes administratives et historique, suivi simple des mémoires/thèses, notifications dans l’application, audit et sauvegarde. Si l’utilisateur a quitté la page ou si sa session d’attente a expiré, il peut se connecter normalement dès que son compte est validé.

### Accès réservé à la direction (mise à jour 5)

- **Comptes ordinaires** : ouvrez `https://amer-corner.oymiketech.com/`. Cette page ne propose aucun formulaire de connexion du chef ni lien vers son espace. Les identifiants du chef y sont refusés, y compris par l’API `/api/login`.
- **Chef de département** : ouvrez **directement** `https://amer-corner.oymiketech.com/chef` avec l’adresse et le mot de passe configurés (`AC_ADMIN_EMAIL`, `AC_ADMIN_PASSWORD` lors de la première initialisation). La page réservée n’affiche pas d’inscription ; l’API `/api/chef/login` exige le **rôle chef vérifié côté serveur**. Une personne qui connaît ou devine l’adresse `/chef` ne peut pas accéder aux données ou obtenir ce rôle sans identifiants et autorisations valides. Les autres comptes administratifs continuent à se connecter par la page ordinaire, avec leurs permissions propres.
- Si le chef ajoute l’application à l’écran d’accueil, il doit le faire **depuis `/chef`** : un manifeste distinct ouvre ensuite cette adresse. Conservez l’URL réservée et les identifiants hors des supports publics. Une URL non affichée ne remplace **jamais** mot de passe, HTTPS, contrôles de rôles et protection contre les essais répétés. Si une PWA a été installée depuis l’ancien domaine Render, les utilisateurs doivent ouvrir/réinstaller la PWA depuis le nouveau sous-domaine : les abonnements push sont liés à l’origine Web.


### Colis 7 — contrôle et fluidité

- **Déjà présents avant ce colis :** rôles et permissions contrôlés côté serveur, audit, sauvegardes SQLite, annonces et documents ciblés, vues uniques, PWA et Web Push conditionnel. Les nouveaux rôles s’appuient sur les tables et vérifications existantes ; il ne s’agit pas d’un second système d’autorisations.
- **Chef :** « Paramètres généraux et contrôle » (tailles proposées, limites de messages/vidéos et documents, dérogations vidéo, suspensions), « Analyse et maintenance » (rapport, alertes, prévisualisation et confirmation du nettoyage des seuls temporaires, archivage conservatoire des anciennes connexions avec sauvegarde), rôles personnalisés par niveau et audit.
- **Tous les comptes autorisés :** taille du texte du compte avec aperçu/réinitialisation ; messages privés limités par rôle et signalables ; lecture des vidéos destinées à leur niveau. Le chef ne voit pas les conversations privées par défaut ; l’examen d’un message signalé requiert une justification auditée.
- **Limites connues :** pas de compression/transcodage ni de vérification de durée sans `ffprobe` externe ; pas de purge automatique de documents ni de quotas globaux de téléchargements ; le mandat de délégué livré cible un **niveau**, pas encore un groupe spécifique. Les alertes mesurent le processus, mais ne garantissent pas une disponibilité ininterrompue. Voir [COMPTE_RENDU_COLIS_7.md](COMPTE_RENDU_COLIS_7.md).

### Partage ciblé et suivi (mise à jour 3)

- **Annonces, documents téléversés et événements** : sélectionner plusieurs cibles (département, rôles, niveaux, parcours, cours, groupes, personnes) parmi les options que le serveur autorise au rôle. Un enseignant ne peut cibler que les étudiants **inscrits explicitement** à ses cours, même lorsqu’il choisit un niveau ; les responsables de niveau, délégués et comptes Master/Doctorat restent dans leur périmètre. Le chef peut ajuster les permissions de rôle depuis son espace. Les adresses ou identifiants directs non autorisés sont refusés côté serveur.
- **Gestion des inscriptions aux cours** : dans Enseignements, le chef choisit « Gérer les inscriptions » après avoir créé un cours. Les nouveaux cours n’inscrivent personne automatiquement. Au premier démarrage de cette mise à jour, les anciens cours reçoivent une liste initiale déduite de leur niveau/parcours/année : **le chef doit la vérifier**. Impossible de retirer un étudiant qui possède une note conservée pour ce cours. Le retrait d’une inscription révoque l’accès aux publications protégées ciblant ce cours ; les traces historiques restent en base.
- **Mes communications** : publications reçues et envoyées, détail explicite, téléchargement contrôlé, accusé demandé séparément, historique des modifications, retrait et relances des destinataires sans vue ou sans accusé. Les statistiques nominatives (destinataires actuels, première/dernière ouverture, nombre de vues, notification mise à disposition/reçue dans l’application, téléchargement et accusé) sont visibles à l’auteur ou aux responsables autorisés. Une simple liste n’enregistre pas de vue ; ouvrir le détail ou télécharger oui. Les rappels sont limités à un par destinataire et par heure.
- **Résultats** : annonce générale possible en catégorie « Résultats », mais la consultation individuelle d’une note publiée est suivie **séparément**. Le suivi par cours ne fournit que noms et dates de consultation, jamais les notes aux profils n’ayant pas le droit de les voir. Les notes provisoires ne deviennent pas officielles avant validation puis publication.
- Les notifications sont **internes à l’application** : « envoyée » signifie créée dans la boîte du destinataire, « reçue » signifie affichée/confirmée par son interface ; aucun e-mail, push ni preuve de lecture hors application n’est impliqué. Une vue signifie ouverture du détail dans l’application, pas compréhension du contenu. Les destinataires sont figés au moment de la publication ; une nouvelle inscription n’ajoute pas automatiquement un destinataire à une ancienne publication.

### Notifications et suivi des publications (mise à jour 4)

- `push.js` gère des abonnements Web Push VAPID par compte et session, des préférences d’activation et une file d’envoi persistante avec contrôle des accès, annulation si la notification est déjà lue, invalide ou révoquée, retries et suppression des abonnements périmés. `static/sw.js` affiche les notifications en arrière-plan, leur lien direct vers l’application et le badge lorsqu’il est pris en charge. Le contenu privé des notes et documents n’est jamais inclus dans les alertes écran verrouillé. **Les trois variables VAPID sont obligatoires pour le push réel** : [configuration complète](CONFIGURATION_PUSH.md).
- **Notifications** : historique paginé, compteur de messages visibles non lus géré par le serveur, ouverture directe et marquage individuel/global comme lu, autorisation utilisateur, désactivation et test d’alerte. L’envoi vers le service push n’est pas la preuve qu’un téléphone a reçu ou affiché l’alerte ; l’application note séparément sa propre réception, la vue du contenu et l’accusé explicite.
- **Suivi des publications** : chef et auteurs autorisés voient les vues uniques et les ouvertures totales, le taux, la date de publication/dernière vue, les destinataires consultés ou non, rôle et niveau/groupe, recherches et tris. Les étudiants doivent ouvrir chaque note officiellement publiée pour afficher sa valeur et enregistrer sa consultation ; le simple chargement de la liste ne suffit pas. Résultats officiels suivis par cours **sans divulgation des notes** aux profils de suivi. Actualisation de l’interface toutes les 20 secondes lorsqu’elle est ouverte. **« X vues » = X personnes distinctes** : la deuxième, troisième ou dixième ouverture d’une même personne ne change pas ce compteur. Les ouvertures répétées sont gardées séparément à titre d’historique. Une vue signifie ouverture du détail, pas lecture intégrale.
- **Badge et son** : le nombre exact apparaît dans l’interface ; iOS/iPadOS 16.4+ pour les PWA installées peut afficher un badge numérique avec l’API Badging. Sur Android, le système affiche souvent un point ou un badge dépendant du lanceur ; un nombre exact sur l’icône n’est pas garanti. Le navigateur ne contrôle pas le son du système.

### Non livrés dans cette version

Forum, inscription aux événements, exports PDF/Excel/CSV, import massif de notes, versionnement des travaux de recherche, favoris, délégations temporaires détaillées, gestion avancée des sessions et restauration depuis l’interface. La réinitialisation du mot de passe par e-mail nécessite un serveur SMTP et `AC_BASE_URL`. Une recette académique et une revue de sécurité indépendantes sont nécessaires avant tout usage institutionnel.

## Sauvegarde et restauration

En production PostgreSQL, le chef peut créer un export `.pg.json.gz` dans « Paramètres ». Il faut **le télécharger immédiatement hors du Web Service Render** et conserver une copie privée : le système de fichiers du service est éphémère. `node manage.js verify fichier.pg.json.gz` vérifie son intégrité ; `restore-postgres.js` ne restaure que vers une base **distincte et vide**. Les comptes et fichiers sont dans PostgreSQL : planifier une sauvegarde automatique indépendante et tester sa restauration. Les commandes SQLite historiques ne concernent que les anciens déploiements ou la démonstration locale.

## Tests

```bash
npm test
```

Les tests lancent un serveur Node réel sur une base temporaire et vérifient le démarrage Render, le contrôle de santé, le CSRF, l’escalade de privilèges, les notes et corrections, le ciblage multi-rôles, les inscriptions effectives aux cours, la révocation d’accès, les vues/accusés/rappels, la confidentialité des résultats, les événements et fichiers, les demandes, la suspension, les sauvegardes et la présence des ressources PWA. Les tests automatisés portent sur les deux entrées de connexion, les rôles, l’API HTTP, la file Web Push simulée, le code du service worker et la syntaxe JavaScript ; ils ne remplacent pas une recette visuelle/navigateur ou sur téléphone réel. Le colis 7 ajoute des tests HTTP pour les préférences, l’analyse/les alertes, la maintenance, les messages, les vidéos et les mandats de rôle (22 tests au total). La procédure d’installation doit aussi être vérifiée manuellement sur un vrai Android et un vrai iPhone.

## Point critique : hébergement Render gratuit

Les comptes créés après l'activation de ce colis sont conservés dans la base PostgreSQL indiquée par le `DATABASE_URL` privé de Render ; ils ne sont plus placés dans la SQLite éphémère du Web Service. Leur durabilité dépend de la disponibilité, de la rétention et des sauvegardes du **service PostgreSQL** : ne laissez pas les sauvegardes sur le disque éphémère. L'ancien compte SQLite volontairement abandonné devra se réinscrire et être approuvé à nouveau. La vérification sur Render (inscription, approbation, redémarrage, reconnexion) reste à effectuer conformément à [DEPLOIEMENT_RENDER.md](DEPLOIEMENT_RENDER.md).
