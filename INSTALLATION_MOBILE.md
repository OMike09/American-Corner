# Installer American Corner sur téléphone

American Corner est maintenant une **PWA (application web installable)**. Aucun fichier APK ni passage par une boutique d’applications n’est nécessaire : partagez l’**adresse HTTPS de votre Web Service Render** avec les utilisateurs. Ils l’ouvrent dans le navigateur de leur téléphone, puis ajoutent l’application à leur écran d’accueil.

## Android

1. Ouvrir l’URL Render d’American Corner dans **Chrome**.
2. Toucher **« Installer sur mon téléphone »** sur la page de connexion ou **« Installer »** dans l’application.
3. Accepter l’invitation d’installation. Si elle n’apparaît pas, ouvrir le menu **⋮** de Chrome et choisir **« Installer l’application »** ou **« Ajouter à l’écran d’accueil »**.
4. Une icône American Corner apparaît sur l’écran d’accueil. Toucher l’icône pour ouvrir l’application directement.

## iPhone et iPad

1. Ouvrir l’URL Render dans **Safari** (pas dans le navigateur intégré d’une application de messagerie).
2. Toucher **Partager** (carré avec une flèche vers le haut).
3. Choisir **« Ajouter à l’écran d’accueil »**, puis **« Ajouter »**. Selon la version d’iOS, cette option peut se trouver plus bas dans la liste.
4. Ouvrir American Corner depuis l’icône sur l’écran d’accueil.

Sur iPhone, le bouton **« Installer sur mon téléphone »** affiche aussi ces étapes : iOS ne propose pas toujours la fenêtre d’installation automatique disponible sur Android.

## Important

- **HTTPS obligatoire** : l’installation fonctionnera depuis `https://...onrender.com`, mais pas depuis une URL HTTP ordinaire. En local, `localhost` est accepté pour les essais.
- **Connexion Internet nécessaire pour les données** : l’application affiche une page explicative hors connexion ; **notes, comptes, documents et réponses de l’API ne sont jamais mis en cache** sur le téléphone par le service worker.
- Ce n’est **ni un APK Android ni une application publiée dans l’App Store**. Le fonctionnement dépend du navigateur et de sa prise en charge de l’installation PWA.
- L’installation du raccourci sur le téléphone **ne rend pas les données de Render Free persistantes**. Tant que SQLite et les documents sont sur le disque éphémère du Web Service gratuit, il ne faut pas utiliser de véritables données universitaires.
- Si le téléphone n’affiche pas la nouvelle version après un redéploiement, fermer et rouvrir l’application installée, puis vérifier la connexion réseau. Le service worker ne met en cache que les ressources publiques de l’interface.
