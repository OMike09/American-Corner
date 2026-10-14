# American Corner — colis 11 (source Node.js / Render)

**État : préparé et testé localement ; non déployé sur Render.** Au 14 octobre 2026, le domaine public pointe encore vers `/app.js?v=10-password6` et ne charge pas `/i18n.js?v=11-language`. Aucun accès Render ni déploiement effectif n’a été vérifié. Ce colis ne doit pas être présenté comme déjà en production.

## Nouveautés

- **Langue du compte** : français par défaut ou anglais, réglage dans « Mon profil ». Préférence persistante par compte dans PostgreSQL/SQLite, relue après reconnexion et modification du profil ; dictionnaire central `static/i18n.js`, repli vers le français si une clé manque, dates adaptées. Les noms, les niveaux/parcours, les données saisies et les contenus des utilisateurs ne sont pas traduits automatiquement. Les traductions anglaises couvrent les principaux écrans et messages fixes ; certains libellés secondaires non répertoriés peuvent encore apparaître en français par repli et nécessiter une relecture humaine.
- **Retour tactile** : geste de droite depuis une zone sûre du contenu, en complément du bouton Retour. Pas de prise de contrôle du bord système, des champs, formulaires modifiés, liens, boutons, tableaux, modales, médias ou défilements verticaux. Sans essais sur appareils réels, l’ergonomie native ne peut pas être garantie.
- **Vidéos** : retrait du formulaire de publication autonome sur la page « Vidéos ». La lecture des vidéos anciennes et les annonces avec fichier vidéo restent disponibles ; leurs contrôles, droits et limites ne sont pas retirés.
- **Enseignants en fonction** : liste officielle administrée exclusivement par le chef, indépendante des comptes et publications, avec grade, spécialité, niveaux/parcours, recherche, état actif/indisponible/retiré, réactivation et historique audité. Aucune donnée fictive n’est créée en production.
- **Inscriptions PDF** : fichier privé accessible uniquement au chef, extraction de texte structuré, aperçu, rapprochement par matricule/carte, nom normalisé, score et cohérence des champs, résultat en tableau ; décisions humaines explicites, corrections et suppression du fichier auditées. Doublons de fichiers détectés par SHA-256. Les comptes doivent préexister et être étudiants en attente. **L’approbation automatique reste indisponible**, y compris pour un score supérieur à 90 %, faute de modèle officiel représentatif. OCR non fourni sur cette version : un PDF scanné ou dépourvu de colonnes fiables est rejeté sans validation. Les notes ne sont pas touchées.
- Migrations PostgreSQL **004, 005 et 006** additives. Le schéma final est en version 6 ; transfert SQLite → PostgreSQL conserve également les PDF privés, la liste et les préférences. Aucune conversion ou suppression automatique de l’ancienne source SQLite.

## Vérifications réelles

- Suite complète : **37/37** en configurant des bases PostgreSQL locales séparées pour comptes, médias, enseignants, PDF, langues et import ; **33/33 avec 4 tests PostgreSQL intentionnellement ignorés** sans ces variables. Les scénarios couvrent l’API, le contrôle d’accès, les mots de passe, la revue PDF, la liste et l’historique des enseignants, le rendu de ces écrans, le geste simulé, la langue et la persistance après redémarrage.
- Migration locale d’une base PostgreSQL existante de v3 vers v6 : valeurs existantes conservées. Import hors ligne SQLite → PostgreSQL : enseignant, langue et octets d’un PDF vérifiés, source intacte. Sauvegarde/restauration PostgreSQL : 47 tables et octets PDF contrôlés ; seconde restauration en base non vide refusée.
- **Non testés** : PDF officiel réel, OCR, seuil d’autovalidation sur des données réelles, gestes sur iPhone/Android physiques, déploiement Render, notifications push en conditions réelles.

## Installation / livraison

Préserver et sauvegarder la base PostgreSQL existante avant déploiement. Déployer les **fichiers de ce colis** sur le service Render Node.js existant (`npm install`, `npm start`), sans remplacer sa `DATABASE_URL` déjà configurée. Les migrations additives se font au démarrage et ne doivent pas être rejouées contre une base étrangère. Conserver l’ancien SQLite tant qu’une migration contrôlée n’est pas décidée.

Après déploiement, vérifier la version publique des ressources (`/app.js?v=11-language`, `/i18n.js?v=11-language`), l’accès `/chef`, les migrations et les scénarios du compte. Éviter tout essai de PDF non officiel avec des données personnelles en production. Les versions antérieures de ce projet restent des archives, non des preuves de mise à jour effective du domaine.
