# Colis 12 — changements depuis le colis 11 seulement

**État au 14 octobre 2026 : livré comme delta local, non déployé sur Render.** Le domaine public a répondu le 14/10/2026 avec `/app.js?v=11-language` ; il ne sert pas encore le colis 12. Ne pas présenter les nouvelles fonctions comme disponibles en production.

## Modifications

- **Annonces** : le formulaire existant propose texte, image, vidéo et PDF (avec ou sans texte). Pour un PDF : nom, taille, aperçu du fichier choisi, retrait/remplacement, catégorie, description, ciblage et brouillon. Téléversement contrôlé côté serveur (PDF valide, jusqu'à 200 pages, limite réglable de 1 à 10 Mo par le chef, empreinte SHA-256), stockage PostgreSQL en production, lecture privée selon statut, auteur, destinataires et permissions. Remplacement, masquage/réactivation et retrait logique audités. Les listes nominatives et fiches de résultats PDF sont limitées aux personnels ; un PDF destiné aux étudiants sans texte extractible est refusé ; une détection prudente rejette les fiches de notes évidentes mal classées. **La détection ne garantit pas l'absence de données confidentielles dans tout PDF, notamment les images numérisées ou un texte ambigu** : vérifier humainement le document avant diffusion. Pour des résultats individuels, utiliser la rubrique « Résultats ».
- **Navigation** : rubrique sélectionnée conservée au fil des recherches, filtres, retours, actualisations et requêtes concurrentes ; formulaire en cours préservé lorsqu'on reclique sur la rubrique active ; menu mobile et retour restent accessibles.
- **Parcours** : arborescence sans profondeur prédéfinie, recherche, développement des branches, ordre numérique, ajout/renommage/déplacement, suspension/réactivation/archivage et suppression bloquée en présence de liens. Affectations étudiants corrigées avec confirmation des opérations multiples, chemins lisibles, associations d'enseignants définies par le chef, choix par un enseignant d'une spécialité parmi celles autorisées. Identifiants et alias stables : les anciens noms des dossiers, cours et notes ne sont pas réécrits silencieusement ; accès ciblés réévalués en cas de réaffectation.
- **PostgreSQL** : migrations **007 à 010**, toutes additives ; tables, colonnes et fichiers existants conservés. Les fichiers PDF de production restent dans PostgreSQL via le stockage déjà prévu ; ne pas placer les données sur le disque éphémère Render.

## Vérifications locales effectuées

- `npm test` en SQLite : **44 tests ; 38 réussis, 6 ignorés**, aucun échec (les 6 nécessitent une base PostgreSQL dédiée).
- `npm test` avec bases PostgreSQL neuves dédiées : **44 réussis, 0 échec**. Accès PDF autorisé/interdit, révocation, persistance après redémarrage, renommage/archivage/réaffectation, notes préservées, migration depuis SQLite, et contrôles de sauvegarde/restauration locale couverts. Les bases PostgreSQL de tests ne sont pas la base Render.
- Essai avec **Chromium réel automatisé** à 1366 px et 390 px : connexion locale chef, principales rubriques, PDF dans le formulaire d'annonce, recherche parcours, actualisation, retour et ouverture/fermeture du menu mobile. Ce n'est **pas** un essai sur Android/iPhone physiques.

## Intégration prudente

1. Faire une sauvegarde de la base PostgreSQL de production et conserver l'export à l'extérieur du Web Service. Garder l'accès à l'ancien code pour retour arrière. Ne jamais effacer la base, les fichiers ou les comptes.
2. Appliquer **uniquement** les fichiers de l'archive delta à la racine du dépôt issu du colis 11 : les chemins internes sont relatifs à cette racine. Il ne s'agit pas d'un projet neuf. Faire un commit de ces fichiers sans inclure les journaux, les dépendances, les bases de tests ou les secrets.
3. Laisser Render exécuter `npm install` puis `npm start` avec le Runtime Node.js existant et le `DATABASE_URL` **déjà configuré** ; ne pas afficher ni modifier sa valeur. Au démarrage, les migrations 007–010 s'appliquent progressivement et sans suppression. Vérifier les journaux de démarrage et `/healthz`.
4. Sur `amer-corner.oymiketech.com`, vérifier le marqueur `/app.js?v=12-pathways-pdf-nav` dans les deux entrées, puis réaliser avec de vrais comptes autorisés les essais PDF privés (tiers refusé), annonce brouillon/publication/retrait, parcours renommé puis déplacé sans perte de résultats, navigation mobile/ordinateur, redémarrage Render et relecture du PDF. Tester la sauvegarde et la restauration sur une **base de destination distincte et vide**, jamais sur la production occupée.

**Reste à faire :** déploiement réel et recette sur le domaine, essai sur appareils physiques, contrôle humain des PDF académiques diffusés et confirmation de la stratégie de sauvegarde PostgreSQL. Aucun de ces points n'est présenté comme déjà accompli.
