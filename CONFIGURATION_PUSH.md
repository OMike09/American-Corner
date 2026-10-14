# Notifications Web Push — installation et recette (colis 4)

Le code serveur, la file persistante SQLite, les abonnements par session, la PWA et le service worker sont inclus. **Les alertes système sur Android/iPhone ne sont pas actives tant que les clés VAPID ne sont pas configurées sur https://amer-corner.oymiketech.com et que chaque utilisateur n’a pas autorisé les notifications sur son appareil.** Aucun compte Firebase ou certificat APNs spécifique n’est requis pour le standard Web Push : le navigateur utilise son propre service push. Le serveur doit pouvoir joindre ces services sortants.

## 1. Créer les clés VAPID une seule fois

Dans un terminal où le projet est installé (`npm install`) :

```bash
node -e "console.log(require('web-push').generateVAPIDKeys())"
```

Copiez la `publicKey` et la `privateKey` dans **Render → Web Service → Environment** :

| Variable | Valeur |
|---|---|
| `AC_VAPID_PUBLIC_KEY` | `publicKey` générée ci-dessus |
| `AC_VAPID_PRIVATE_KEY` | `privateKey` correspondante, **secret** |
| `AC_VAPID_SUBJECT` | `mailto:adresse-valide@votre-domaine.ci` |

Redéployez puis ouvrez **Notifications** : le message « clés VAPID manquantes » doit avoir disparu. **Gardez exactement la même paire de clés lors des redéploiements**, sinon les abonnements des appareils doivent être recréés. Ne les mettez pas dans Git, le ZIP, une capture d’écran ou une page Web. La clé publique seule est communiquée au navigateur.

## 2. Activer sur chaque appareil et régler le son

- **Android** : ouvrir directement https://amer-corner.oymiketech.com dans Chrome, installer la PWA, se connecter, aller dans **Notifications → Activer les notifications**, accepter la demande. Autoriser aussi les notifications, le son et les badges dans les réglages Android de Chrome/de la PWA. Le téléphone gère lui-même le son et le badge ; Android peut afficher un point plutôt qu’un nombre exact sur l’icône. Le nombre exact apparaît toujours dans l’application.
- **iPhone/iPad** : iOS/iPadOS **16.4 ou plus**, ajouter le site à l’écran d’accueil depuis Safari, **ouvrir la PWA depuis son icône**, se connecter, activer dans la page Notifications puis accepter l’autorisation iOS. Régler ensuite **Réglages → Notifications → American Corner** (autorisation, Sons, Pastilles). Safari dans un simple onglet ne peut pas recevoir le Web Push iOS ; une PWA installée est nécessaire. Sur iOS compatible, le compteur de l’icône repose sur l’API Badging.
- Appuyer sur **Envoyer une notification de test** puis essayer successivement application ouverte, en arrière-plan et fermée (fenêtre fermée, **sans retirer l’autorisation ou désinstaller la PWA**). Un son ne peut pas être imposé par JavaScript : le système le joue selon les réglages, le mode silence/Ne pas déranger et les politiques du navigateur.
- Si la demande a été refusée, le navigateur ne la réaffiche normalement pas automatiquement : réactiver les notifications dans les réglages du téléphone/navigateur avant de revenir à l’application. Les cases de préférences permettent de choisir publications, résultats officiels et autres alertes. « Désactiver les alertes » désactive la préférence globale pour ce compte et retire l’abonnement de l’appareil actuel ; les notifications internes restent disponibles.

## 3. Vérifier les états séparément

1. Dans un compte expéditeur, publier une annonce ciblée sur un compte destinataire autorisé. Le destinataire doit voir la notification système **si son appareil est abonné**, et un nombre non lu dans l’application. Le service worker peut présenter la notification même quand l’interface est fermée.
2. Dans **Suivi des publications**, constater **0 vue** avant l’ouverture du détail. Une alerte envoyée au service push ne signifie pas qu’elle a atteint l’écran ; « reçue dans l’application » signifie que l’interface l’a affichée, pas un accusé de livraison OS.
3. Toucher l’alerte : ouvrir la notification puis le détail protégé. Si le destinataire est le chef, l’alerte ouvre son entrée réservée `/chef` ; les autres utilisent l’entrée publique. Une lecture de la notification seule diminue le nombre non lu, **sans** compter de vue ; seule l’ouverture du détail compte. Une ouverture répétée peut être conservée comme ouverture technique dans l’historique, mais **le compteur de vues reste à une seule personne unique**.
4. Vérifier le pourcentage, la liste des destinataires consultés/non consultés, les rôles, niveaux/groupes, dates, et l’accusé explicite distinct. Tester un compte non destinataire : les URL directes et statistiques doivent rester interdites.
5. Publier un **résultat validé** : la notification système reste générique et ne révèle **aucune note** sur l’écran verrouillé. Son ouverture conduit aux résultats officiels de l’étudiant ; le suivi des consultations reste distinct de l’annonce générale.
6. Marquer une notification comme lue et vérifier le badge ; le compteur se remet à zéro lorsqu’il n’y a plus de notifications visibles non lues. Sur certains Android, le système choisit sa propre représentation du badge.

## Limites et conservation

Les tests automatisés vérifient l’API, les droits, l’unicité des vues, la file d’envoi Web Push avec un émetteur simulé, le payload sans note privée et le code du service worker. **Ils ne prouvent pas qu’une alerte et un son ont été reçus par un vrai Android/iPhone, ouvert/fermé : cette recette matérielle reste à effectuer après déploiement avec vos clés et deux appareils.** Un accusé du service push signifie acceptation par le service, pas livraison, affichage ou lecture. Les notifications des comptes suspendus, les sessions expirées et les contenus révoqués ne sont pas poussés.

La file, les abonnements et les compteurs sont stockés dans SQLite. **Render Free perd potentiellement SQLite et les uploads à chaque redéploiement ou redémarrage** : ne pas utiliser de données réelles sans disque persistant, sauvegardes et revue de sécurité. Le service gratuit peut se mettre en veille ; une file en attente ne repart qu’au réveil du service, et les utilisateurs doivent parfois se réabonner si une session est expirée.
