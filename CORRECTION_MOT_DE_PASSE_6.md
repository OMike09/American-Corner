# Correction urgente — mot de passe à 6 caractères et boutons œil

**Date : 14 octobre 2026. Le code est corrigé et testé localement, mais il n'a PAS été déployé sur le Web Service Render du propriétaire.** L'URL publique consultée aujourd'hui sert toujours `/app.js` avec « Mot de passe (10 caractères minimum) » ; `/sw.js` reste `american-corner-public-v3`. Les nouveaux fichiers ne peuvent pas apparaître sur cette URL avant l'envoi du colis 10 sur le dépôt relié à Render et le redéploiement réussi.

## Fichiers réellement utilisés qui ont été modifiés

- `static/app.js` : formulaire public `authFields()` déjà utilisé pour l'inscription et la connexion, champs de création/confirmation superposés verticalement, placeholder demandé, SVG œil fermé/ouvert, commande réelle d'affichage/masquage ; validation immédiate et à la soumission. Également profil (changement), réinitialisation et création manuelle par le chef. La connexion n'exige jamais une deuxième saisie.
- `static/app.css` : placement des boutons à droite dans les champs, zone cliquable 46×46 px pour téléphone, styles focus et messages d'erreur.
- `server.js` : validation serveur **exactement 6 caractères**, messages exacts, confirmation obligatoire à l'inscription, à la création administrative, au changement et à la réinitialisation ; conservation des zéros initiaux. Les mots de passe sont hachés avec PBKDF2-HMAC-SHA256 et un sel aléatoire ; ils ne sont pas enregistrés en clair. Le mot de passe déjà configuré du chef et les anciens comptes plus longs continuent de fonctionner lors de la connexion.
- `static/index.html`, `static/chef.html`, `static/sw.js` : URL versionnée `?v=10-password6` et nouveau cache PWA `american-corner-public-v4-password6` pour éviter l'ancienne interface stockée sur téléphone.
- `tests/password-ui-dom.test.js`, `tests/password6-api.test.js`, `tests/postgres-accounts.test.js`, anciens tests HTTP adaptés : vérifications DOM, API, PostgreSQL et régressions.
- `package.json`, `package-lock.json` : `jsdom` en dépendance de développement pour tester le DOM réel et les clics. Aucun changement de base de données n'est nécessaire pour les comptes existants.

## Résultats vérifiés

- Test DOM : les deux champs sont voisins dans le formulaire public ; chaque œil bascule `password` ↔ `text` sans vider le champ ni envoyer le formulaire ; connexion avec un seul champ et un œil. Les erreurs exactes apparaissent pour 5/7 caractères et deux valeurs différentes ; `012345` est transmis tel quel.
- Test HTTP local : les valeurs de 5 ou 7 caractères sont refusées, les deux champs différents sont refusés, `012345` est accepté, les changements et réinitialisations sont contrôlés, les zéros initiaux survivent à la connexion ; la base ne contient qu'un hachage salé.
- Test PostgreSQL local : inscription `012345`, refus des erreurs, compte en attente retrouvé après redémarrage depuis un nouveau répertoire, hachage vérifié, validation par le chef puis connexion réussie.
- `npm test` : **28 tests au total, 26 réussis, 2 tests PostgreSQL optionnels ignorés sans URL de test, 0 échec** ; les deux tests PostgreSQL optionnels ont aussi été lancés avec des bases locales dédiées et ont réussi. Les fichiers JavaScript passent `node --check`.

## Ce qui reste à faire sur Render

Publier **le contenu du colis 10** sur la branche utilisée par le Web Service Node.js existant (`npm install`, `npm start`), en conservant `DATABASE_URL`. Vérifier les logs de compilation et de démarrage, puis contrôler la réponse publique des URL `/`, `/app.js`, `/sw.js`, en navigation privée et depuis la PWA installée. Tester sur le service réel un nouvel utilisateur : ouvrir Inscription, cliquer les deux œils, essayer mot de passe incorrect puis `012345`, valider par le chef et reconnecter après redémarrage. Sans accès autorisé au dépôt/Render, ces opérations **ne peuvent pas être déclarées effectuées** par l'assistant.

**Prudence :** six caractères constituent un secret faible pour des données académiques ; la règle demandée est appliquée, mais il faut conserver limitation des essais, HTTPS, contrôle des sessions et sauvegardes. Ne partagez jamais des mots de passe dans un journal ou une capture.
