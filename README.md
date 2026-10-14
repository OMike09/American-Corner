# American Corner — version Node.js

Plateforme numérique du Département d’anglais de l’Université de Bouaké. **Backend JavaScript / Express**, interface responsive en HTML/CSS/JavaScript, base SQLite. Le projet s’installe avec **`npm install`** et démarre avec **`npm start`** ; aucune commande Python n’est nécessaire.

**Déploiement de votre Web Service Render existant :** voir [DEPLOIEMENT_RENDER.md](DEPLOIEMENT_RENDER.md).

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

- `server.js` : API Express `/api/*`, sessions stockées en base, vérification des permissions **côté serveur**, SQL paramétré, validation des requêtes et journal d’audit.
- `static/` : interface responsive sans framework, servie depuis le même domaine ; requêtes par URL relative.
- `better-sqlite3` : base relationnelle dans `AC_DATA/american_corner.sqlite3`. `AC_DATA/uploads` conserve les fichiers téléversés (limite 10 Mo, type contrôlé, nom interne aléatoire, accès vérifié avant téléchargement).
- Mots de passe hachés par PBKDF2-HMAC-SHA256 avec sel aléatoire ; cookie HttpOnly/SameSite, option Secure derrière HTTPS, jeton CSRF, vérification de l’origine et limitation des tentatives de connexion.
- Les restrictions sont vérifiées sur les ressources : étudiant et ses seules notes publiées, enseignant et ses cours, public visé par une annonce, propriétaire d’une demande, responsable d’un mémoire.
- `manage.js` : vérification et restauration **hors ligne** des sauvegardes SQLite. Le chef peut créer une sauvegarde depuis l’interface.

### Parcours opérationnels

Inscription avec validation, gestion des comptes et rôles, tableaux de bord, années/niveaux/parcours, cours et listes d’étudiants, annonces ciblées et validées, calendrier ciblé, bibliothèque avec téléversement et téléchargement, saisie → validation → publication des notes, demandes administratives et historique, suivi simple des mémoires/thèses, notifications dans l’application, audit et sauvegarde.

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

Les tests lancent un serveur Node réel sur une base temporaire et vérifient le démarrage Render, le contrôle de santé, le CSRF, l’escalade de privilèges, les notes et corrections, le ciblage, les fichiers, les demandes, la suspension et les sauvegardes.

## Point critique : hébergement Render gratuit

Le système de fichiers d’un Web Service Render gratuit n’est pas un stockage permanent. Une base SQLite, des notes et des documents enregistrés localement peuvent disparaître. **Utilisez ce déploiement seulement pour une démonstration sans données personnelles réelles.** Pour la production, il faut soit un plan compatible avec un disque persistant et des sauvegardes hors site, soit migrer explicitement vers PostgreSQL **et** un stockage d’objets pour les fichiers. Définir simplement `DATABASE_URL` ne migre pas le code SQLite.
