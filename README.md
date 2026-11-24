# Continuité

Atelier d'écriture local pour les séries, les films, les romans, la BD, le théâtre, la pub et les jeux.

Continuité garde la mémoire d'une histoire pendant qu'on l'écrit :
- les personnages et leurs relations ;
- qui sait quoi, et à partir de quand ;
- les états de chacun d'un épisode à l'autre ;
- les fils laissés ouverts ;
- l'équilibre des intrigues, le rythme et la voix de chaque personnage ;
- la continuité des dates et des lieux.

**Tes textes restent sur ton ordinateur.** L'app n'envoie rien en ligne. Elle fait tourner son propre PHP en local, et celui-ci refuse toute requête qui ne vient pas de sa fenêtre. Les polices et la lecture des PDF sont livrées avec l'app : elle marche sans Internet. Seules les deux polices d'accessibilité (Atkinson Hyperlegible, OpenDyslexic) se téléchargent, et seulement si tu les choisis dans les réglages.

Pensée et designée par Victor Baissait, codée avec Claude.

## Installer

Les installateurs sont dans l'onglet **Releases** :
- **macOS** : `Continuite-…-mac-arm64.dmg` (Apple Silicon) ou `…-mac-x64.dmg` (Intel) ;
- **Windows** : `Continuite-…-windows-x64.exe` ;
- **Linux** : `Continuite-…-linux-x86_64.AppImage` ou `…-linux-amd64.deb`.

L'app n'est pas signée par Apple. La première fois, fais un clic droit sur l'app, puis **Ouvrir**.

Tes projets sont rangés ici :
- macOS : `~/Library/Application Support/Continuite/data`
- Windows : `%APPDATA%\Continuite\data`
- Linux : `~/.config/Continuite/data`

Le menu **Aide → Ouvrir le dossier des données** y mène directement. Pour sauvegarder ou changer d'ordinateur, il suffit de copier ce dossier, ou d'utiliser l'export de projet de l'app.

## Développer

Il faut Node.js 24.

```bash
npm install
npm run fetch:php      # télécharge le PHP embarqué de ce système (empreinte sha256 vérifiée)
npm start              # données dans le dossier de l'utilisateur
npm run start:local    # données dans le dossier data/ du projet
npm run test:serveur   # essai du serveur PHP : secret, dossiers interdits, API
```

Le même code fonctionne aussi sans Electron, derrière un serveur web avec PHP 8.3 ou plus, par exemple MAMP dans `htdocs/`. Les données vont alors dans `data/`.

## Tester

```bash
npm run test:serveur                     # serveur PHP : secret, dossiers interdits, app neuve, rebinding DNS
LEMENU_BASE_URL=http://localhost:8888/lemenu/ node tools/smoke-test.mjs   # bout en bout sur un projet existant
APP_SELFTEST=/tmp/essai APP_DATA_DIR_DESKTOP=/tmp/donnees APP_USER_DATA_DESKTOP=/tmp/profil npm start
APP_SINGE=/tmp/singe APP_SINGE_ACTIONS=1000 APP_DATA_DIR_DESKTOP=/tmp/copie APP_USER_DATA_DESKTOP=/tmp/profil npm start
```

- **`APP_SELFTEST`** : l'app ouvre quelques onglets, fait des captures, puis tente ce que ferait une page piégée : sortir de l'app, lire un fichier, appeler Internet, ouvrir le micro. Le rapport est dans `etat.json`.
- **`APP_SINGE`** : un « utilisateur qui fait n'importe quoi » clique et tape au hasard, avec des textes piégés. Il note chaque erreur JavaScript et chaque injection dans `singe.json`.
- Les deux essais se lancent toujours sur une **copie** des données (`APP_DATA_DIR_DESKTOP`) et avec un profil à part (`APP_USER_DATA_DESKTOP`).

## Fabriquer les installateurs

- **Sur ce Mac** : `npm run dist:mac` (il faut aussi `node electron/fetch-php.js darwin-x64` pour la version Intel).
- **Pour les trois systèmes** : le workflow GitHub « Installateurs » (onglet Actions). Pousser une étiquette `v1.2.3` crée un brouillon de version avec tous les installateurs.

Un garde-fou (`electron/build/hooks.js`) arrête la fabrication si une base de données, une sauvegarde ou un dossier de données se trouve dans l'app.

## Structure

```
index.html, assets/   l'interface
api/                  l'API PHP + SQLite (une base par projet)
router.php            le routeur du serveur PHP de l'app de bureau
electron/             l'app de bureau : fenêtre, serveur PHP, PHP embarqué, fabrication
tools/smoke-test.mjs  essai de bout en bout sur un projet existant
data/                 les projets, jamais versionnés
```

## Licence

[GNU AGPL v3 ou ultérieure](LICENSE). Copyright © 2026 Victor Baissait.
