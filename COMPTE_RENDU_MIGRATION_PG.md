# American Corner — compte rendu de préparation PostgreSQL

> **Mise à jour de la décision, 14 octobre 2026 :** le propriétaire confirme qu'il n'y avait qu'un ancien compte utilisateur à retrouver et accepte qu'il **refasse son inscription**. L'import de ce compte n'est plus un préalable à la mise en service des **nouveaux** comptes dans PostgreSQL. Le déploiement et la vérification sur Render restent à faire ; aucune ancienne donnée n'est réputée transférée. L'ancienne SQLite éventuellement présente n'est ni lue, ni supprimée. La procédure à suivre maintenant est `DEPLOIEMENT_RENDER.md`. Les paragraphes ci-dessous consignent les travaux d'import **optionnel** réalisés localement avant cette décision.

**Date : 14 octobre 2026. État : travail technique local, PAS de migration validée sur Render.** Ce document distingue impérativement les essais locaux de la véritable base du Web Service. L’ancien colis 7 livré utilisait SQLite. Le nouveau paquet peut servir aux nouvelles inscriptions, sous réserve de suivre `DEPLOIEMENT_RENDER.md` et de vérifier son fonctionnement réel sur le service existant.

## Diagnostic / sauvegarde / comparaison

| Point | Constat avant | État maintenant | Limite |
|---|---|---|---|
| Persistance Render Free | SQLite et fichiers sur disque potentiellement éphémère ; cause probable des pertes à confirmer par logs et sauvegarde réelle | `DATABASE_URL` active PostgreSQL pour comptes, données et fichiers ; absence de variable = démarrage refusé en production, sans bascule SQLite silencieuse | Aucun accès à la base Render réelle, aucun ancien compte Render identifié ; la cause exacte des pertes n’est pas prouvée |
| Source ancienne | Copie **locale** trouvée : 4 utilisateurs, 1 résultat, 1 document (provenance Render **non établie**) | Import hors ligne d’une copie SQLite cohérente vers une base PostgreSQL locale isolée : 4/4 utilisateurs, 1/1 résultat, 1/1 document et fichier identifié par SHA-256 | Ces chiffres ne représentent **pas** les anciens comptes Render |
| Intégrité | Ancienne source conservée si disponible ; import historique désormais facultatif pour l’unique ancien compte | `quick_check`, vérification des relations SQLite, copie restaurable, manifeste, décomptes, SHA-256 par table et par fichier, import transactionnel, conservation des IDs et recadrage des séquences | Export réel Render et sauvegarde hors site **non obtenus** ; restauration source Render **non testée** |
| Sauvegarde PostgreSQL | Nécessaire avant/pendant toute bascule | Sauvegarde locale et restauration sur une **autre base locale vide** : 3 blobs, 2 médias, 1 historique de remplacement vérifiés | Pas de plan de sauvegarde automatique hors site ; fichier de sauvegarde créé sur le service éphémère à télécharger impérativement |

**Garde-fous :** importeur refuse une destination PostgreSQL non vide ; aucune suppression automatique de source ou d’archive ; avec `DATABASE_URL`, une ancienne SQLite encore présente dans `AC_DATA` déclenche un avertissement mais n’est ni lue ni effacée. L’utilisateur accepte la réinscription de son unique ancien compte ; le démarrage des nouvelles inscriptions n’est donc plus bloqué par cette source. Si PostgreSQL Render contient déjà de nouveaux comptes et qu’une ancienne SQLite doit être fusionnée, la fusion **n’est pas implémentée** : ne pas tenter l’importeur sur cette destination.

## Fonctionnalités ajoutées / conservées

- Schéma PostgreSQL versionné 001–003 et adaptateur ; comptes, résultats, demandes, rôles, messages, journaux, documents, vidéos et pièces jointes dans PostgreSQL avec `DATABASE_URL`. PostgreSQL testé **en local** après redémarrage avec un autre `AC_DATA` ; compte en attente relu, puis approbation et connexion immédiate. Contrôles de rôle côté serveur préservés.
- Parcours : création, description, cycles/enseignants, renommage avec références, archivage, réactivation ; suppression refusée si données liées. Liste d’inscription actualisée et validation des parcours actifs hors démonstration PostgreSQL.
- Publications du chef : texte, image, vidéo, texte+image, texte+vidéo ; prévisualisation, progression d’envoi, compression des images JPEG/PNG/WebP en WebP via `sharp` (jusqu’à 1600 px, limite 10 Mo d’entrée) ; vidéos MP4/WebM conservées **sans transcodage**. Création d’un brouillon avant envoi : si l’envoi échoue, il ne devient pas officiel. Visibilité du média masquable/réactivable, remplacement audité avec ancienne version conservée. Les destinataires voient le média uniquement si la publication est diffusée et leur est accessible. Lecture vidéo partielle HTTP 206 testée. Quota vidéo chef et vidéo indépendante partagent désormais les compteurs des envois du jour ; limites réglables ; contrôle de durée disponible seulement avec `AC_FFPROBE`.
- Catégories de publication configurables par les responsables autorisés : ajout, archivage et réactivation audités ; publications existantes conservées, nouvelle utilisation d’une catégorie archivée refusée.
- Inscription, réinitialisation et changement de mot de passe : confirmation exigée côté serveur, champs de confirmation et afficher/masquer dans l’interface ; mots de passe hachés. Les règles d’audience, vues distinctes par personne, validation des notes, séparation `/chef` et permissions existantes sont préservées.

## Tests exécutés

| Vérification | Résultat |
|---|---|
| Suite Node/SQLite existante, plus essai média local | **24 réussis, 2 tests PostgreSQL optionnels ignorés, 0 échec** dans `npm test` sans URL de test ; un démarrage simultané avait temporairement fait échouer un test sous charge, isolé puis suite relancée avec succès |
| Test HTTP ciblé médias/catégories sur PostgreSQL local isolé | **2/2 réussis** (SQLite + PostgreSQL) : ACL, compression, publication, masquage, remplacement, quota, retour 206, redémarrage avec dossier local neuf, et sauvegarde |
| Test PostgreSQL comptes/parcours sur base locale isolée | **2/2 réussis** : ancienne SQLite présente mais non modifiée, ancien compte non réutilisé, réinscription avec la même adresse, refus mot de passe non confirmé, inscription en attente, conservation après redémarrage, vérification directe du compte et du mot de passe haché dans PostgreSQL, approbation, connexion, refus d’élévation chef, archivage et suppression prudente des parcours |
| Parcours HTTP PostgreSQL historique | Réussi : rôles, résultats, documents, demandes et vérification d’export |
| Import d’ancienne **copie locale** vers PostgreSQL v3 | Réussi : 4 utilisateurs, 1 résultat, 1 document, 1 fichier vérifié ; comptes et hachages de lignes vérifiés pour chaque table source |
| Restauration PostgreSQL v3 locale | Réussie sur destination vide avec vérification de 3 fichiers binaires, 2 médias et 1 version historique |
| Vérification sur Render réel / smartphones réels | **Non effectuée** : aucune donnée ou session de production Render consultée, aucun test réel Android/iPhone, SMTP ou push |

## Import historique facultatif et vérifications de production restantes

1. **Seulement si une récupération historique est à nouveau souhaitée :** obtenir une copie authentifiée de l’ancienne base et de `uploads/` de Render. L’unique ancien compte abandonné se réinscrit ; ce point ne bloque plus les nouveaux comptes.
2. Vérifier que le `DATABASE_URL` privé du service existant pointe sur la bonne base PostgreSQL. Si elle contient déjà des comptes, les préserver ; ne pas lancer l’importeur historique sur cette destination non vide.
3. Après déploiement, tester avec un **nouveau** compte inscrit, approuvé et reconnecté après redémarrage, et vérifier son enregistrement dans PostgreSQL. Une comparaison avec une ancienne source Render n’est nécessaire que si sa migration redevient souhaitée.
4. Installer et tester les sauvegardes automatiques **hors de Render**, quotas/espace PostgreSQL, restauration périodique, revue de confidentialité/sécurité et procédures de retour arrière.
5. Tester en environnement cible les 14 parcours détaillés par le demandeur, sur navigateur et téléphones ; vérifier vidéo/codecs, compression et quotas selon les vrais fichiers. Les tests locaux ci-dessus sont significatifs mais ne sont **pas** une validation exhaustive de ces 14 scénarios ou du déploiement.

**Conclusion actualisée :** les **nouveaux** comptes et fichiers persistent en PostgreSQL **local** dans les scénarios exécutés. L’unique ancien utilisateur peut se réinscrire selon le choix explicite du propriétaire ; son ancien compte n’a pas été migré. Le déploiement sur Render et sa vérification après redémarrage restent à faire. Ne réinitialisez pas la base PostgreSQL existante.
