# Guide de Continuité

Continuité est un atelier d'écriture pour les séries, les films, les romans, la BD, le théâtre, la pub et les jeux. L'app ne génère aucun texte : elle garde la mémoire de ton histoire et te signale ce qui cloche. Les personnages, les secrets, les dates, les fils laissés ouverts, le rythme, la voix de chacun : tout est tiré de ce que **tu** as écrit.

---

## L'IA n'écrit pas à ta place

**Continuité n'écrit pas de texte, et ce n'est pas son but.** L'app n'invente ni réplique, ni scène, ni idée, ni résumé. Elle ne réécrit rien. Elle ne contient aucune intelligence artificielle générative et n'envoie jamais tes textes à un service en ligne.

Tout ce qu'elle t'apprend vient de calculs sur **ton** texte :
- compter (répliques, mots, scènes, présences) ;
- comparer (un épisode avec la série, un personnage avec les autres) ;
- retrouver (qui sait quoi, depuis quand, où un mot a déjà été dit) ;
- signaler (une date qui recule, un absent qui parle, deux personnages qui ne se croisent jamais).

Même « Ça ne lui ressemble pas » (Analyse → Voix) n'est que de la statistique. L'app compare les mots d'une réplique à ceux que chaque personnage emploie dans le reste de la série. Elle ne juge pas et ne propose aucune autre réplique.

Les décisions et les mots restent les tiens.

> Le code de l'app a été écrit avec l'aide de Claude (Anthropic). Ce n'est pas le cas des fonctions de l'app : aucune ne fait appel à une IA.

---

## Installer

Télécharge l'installateur de ton système sur la page [Releases](https://github.com/victorbaissait/continuite/releases/latest) :

| Système | Fichier |
|---|---|
| Mac Apple Silicon (M1, M2…) | `Continuite-…-mac-arm64.dmg` |
| Mac Intel | `Continuite-…-mac-x64.dmg` |
| Windows | `Continuite-…-windows-x64.exe` |
| Linux | `Continuite-…-linux-x86_64.AppImage` ou `…-linux-amd64.deb` |

- **Mac** : ouvre le `.dmg` et glisse Continuité dans Applications. L'app n'est pas signée par Apple : la première fois, fais un clic droit sur l'app, puis **Ouvrir**.
- **Windows** : lance l'installateur. Il installe au besoin un composant de Microsoft (Visual C++), nécessaire au moteur de l'app.
- **Linux** : rends l'AppImage exécutable (`chmod +x`) et lance-la, ou installe le `.deb`.

### Le premier lancement

Continuité crée un premier projet vide. Si une ancienne installation sous MAMP existe sur ce Mac, l'app propose d'en **copier** les projets. L'original n'est pas touché.

---

## Tes données restent chez toi

- Tes projets sont dans ton dossier utilisateur, jamais dans l'app :
  - Mac : `~/Library/Application Support/Continuite/data`
  - Windows : `%APPDATA%\Continuite\data`
  - Linux : `~/.config/Continuite/data`
- **Aide → Ouvrir le dossier des données** y mène directement.
- L'app fait tourner son propre petit serveur, qui n'écoute que ton ordinateur. Il refuse toute requête qui ne vient pas de sa fenêtre : ni une page web ni un autre programme ne peuvent lire tes projets.
- Les polices et la lecture des PDF sont livrées avec l'app : elle marche sans Internet.

**Les seules connexions à Internet**, toutes facultatives :
1. **Les mises à jour** : au plus une fois par jour, l'app demande à GitHub le numéro de la dernière version. Rien de toi n'est envoyé. Tu peux couper cette vérification dans Config → App de bureau.
2. **Les polices d'accessibilité** (Atkinson Hyperlegible, OpenDyslexic) se téléchargent seulement si tu les choisis dans Config → Accessibilité.
3. **Sur Windows et Linux**, le correcteur d'orthographe télécharge une fois le dictionnaire français, depuis les serveurs de Google. Sur Mac, il utilise le correcteur du système.

---

## Les projets

Pour un roman, **Découper en épisodes** (dans la liste des projets) propose un découpage en épisodes de longueur voisine, coupés de préférence sur une fin de chapitre qui pose une question ou reste en suspens. Rien n'est réécrit ni créé : c'est une aide pour préparer une adaptation en série.

**Projet de démonstration** (Config → Projets, ou depuis un onglet Épisodes vide) : une petite série inventée de trois épisodes, avec une scène coupée, un fil ouvert, un objet oublié et des âges qui se contredisent, pour voir chaque vue en situation. Elle se supprime comme n'importe quel projet.

Un projet, c'est une œuvre : une série, un roman, un film, une BD, une pièce, une campagne de pub ou un jeu. Le menu en haut à gauche (le nom du projet) permet d'en créer, d'en ouvrir, d'en dupliquer ou d'en retirer. Un projet retiré va dans une corbeille, d'où on peut le restaurer.

Le type du projet change le vocabulaire (saison et épisode, livre et chapitre, acte et scène…) et ajoute des vues propres. Par exemple :
- le **film** a ses actes, ses séquences, son plan de travail, ses feuilles de service et son budget ;
- la **BD** a ses planches, ses bulles et son chemin de fer. Sous les bulles, les **bruitages** : combien, lesquels reviennent trop souvent, et leur variété. Sous les planches, le **temps de lecture** : un regard par case et les mots des bulles, la durée de tout l'album, et les planches bien plus lentes ou bien plus rapides que les autres ;
- le **théâtre** a sa distribution et ses didascalies. La vue **Conduite** prépare la feuille de régie : chaque effet de lumière ou de son tiré des didascalies (noir, projecteur, musique, on frappe…), avec l'acte, la scène et le « top », c'est-à-dire la fin de la réplique qui le déclenche. Elle s'exporte en tableur. Dans **Temps de parole**, **la fatigue des comédiens** donne pour chaque rôle sa plus longue tirade et le plus long moment passé en scène sans sortir ; au-delà de 250 mots d'affilée ou de 25 minutes, le rôle est signalé ;
- le **jeu** a ses énigmes et son inventaire. Sous les dialogues, les **mots à traduire** : par chapitre et par type de texte (dialogues, choix, lieux, objets), et par personnage pour l'enregistrement des voix ;
- la **pub** a ses campagnes et ses spots. Sous chaque spot, **la marque à l'écran** : écris le nom de la marque et du produit, et l'app montre à quelle seconde ils sont montrés ou dits pour la première fois. Une marque qui n'arrive qu'à la fin est signalée.

### Partir d'un modèle
En créant un projet, **Pour commencer** propose un projet vide ou un modèle :
- série : sitcom 22 min en 3 actes, série 52 min en 4 actes, mini-série de 6 épisodes ;
- film : long métrage en 3 actes, court métrage ;
- roman : voyage du héros en 12 étapes, roman en 3 parties ;
- théâtre : pièce en 3 actes, pièce en un acte.

Un modèle ne prépare que la structure (saisons, épisodes, actes, chapitres) et des repères de construction dans les commentaires, par exemple le nombre de pages habituel de chaque acte. Il n'écrit rien de ton histoire. Tout se renomme, se supprime ou se complète ensuite.

**Tes propres modèles** : dans la liste des projets, **Enregistrer comme modèle** garde la structure d'un projet (saisons, épisodes, titres, repères) et ses réglages (apparence, objectifs, mise en page, feuille de style). Les scripts, les brouillons et les personnages n'y vont jamais. Le modèle est ensuite proposé dans **Pour commencer**, et « retirer » l'efface.

### Importer des textes

Dans l'onglet **Épisodes**, importe le script de chaque épisode. Formats acceptés : Word (.docx), LibreOffice (.odt), PDF, RTF, HTML, Markdown, texte, Fountain, Final Draft (.fdx), Celtx, Highland, Fade In et **Montage** (.montage, le logiciel de Mariner Software qui n'existe plus). L'app découpe le texte en scènes et en répliques, puis reconnaît les personnages et les décors.

- **Un fichier par épisode** : sur la fiche d'un épisode, glisse le fichier ou clique pour le choisir. Un .txt ou un .fountain est analysé tout de suite. Les autres formats sont d'abord lus, puis leur texte est posé dans la zone en dessous : relis-le, puis clique **Analyser le texte** pour le garder.
- **Plusieurs épisodes d'un coup** : **Projets → Importer des scripts**. Un nom de fichier comme « S2E05 », « 2x05 » ou « Saison 2 épisode 5 » place le script dans le bon épisode. Un épisode qui a déjà un script n'est jamais écrasé.
- **Toute une série d'un coup** : **Choisir un dossier**. L'app parcourt les sous-dossiers ; un dossier « Saison 2 » donne la saison d'un fichier « Épisode 5 ». Les anciennes copies (« old », « copie », « ancien ») sont écartées, et si deux fichiers donnent le même épisode, le plus récent gagne. Tu vérifies la liste avant d'importer.
- **Un format inconnu** : l'app regarde ce que contient le fichier plutôt que son extension. Un document Word, un Celtx ou un Montage mal nommé est reconnu. Sinon, elle récupère les morceaux de texte lisibles du fichier. Relis toujours l'aperçu : ce texte peut contenir des restes du logiciel d'origine. Pour un PDF ou un ancien .doc, elle explique comment l'exporter.

Avec Montage, l'app lit le script tel qu'il est dans le fichier, dans l'ordre des scènes. Les vieilles scènes que Montage garde parfois en mémoire (d'un modèle ou d'un épisode copié) sont laissées de côté. Un fichier Montage qui ne contient que la page de titre du modèle est signalé comme vide.

Montage gardait aussi des **notes sur chaque rôle**. Après l'import, l'app les propose : coche celles à garder, elles s'ajoutent à la fin des caractéristiques de la fiche du personnage, sous « Notes de Montage ». Rien n'est effacé, rien n'est ajouté deux fois, et un rôle sans fiche n'en crée une que si tu le demandes.

### Partager un projet

**Config → Projet portable** enregistre un projet entier dans un seul fichier `.continuite` : textes, réglages, dessins, voix et cartes. On peut n'envoyer qu'une saison, ou seulement la bible.

Pour ouvrir un projet reçu :
- double-clique sur le fichier `.continuite` ;
- ou glisse-le sur la fenêtre de l'app ;
- ou passe par **Fichier → Ouvrir un projet partagé…** (⌘O).

L'app montre un aperçu avant d'importer. Tu choisis ensuite :
- **Nouveau projet** : il s'ajoute à côté des tiens.
- **Remplacer** le projet ouvert : l'ancien part dans la corbeille, d'où on peut le restaurer.
- **Comparer et fusionner** : pour reprendre le travail d'un coauteur. L'app montre, épisode par épisode, ce qui diffère (titre, résumé, intrigues, script et brouillon, avec le nombre de lignes ajoutées et retirées). Pour chaque épisode, tu gardes le tien ou tu prends celui du fichier. Les épisodes qui n'existent que dans le fichier peuvent être ajoutés, comme les personnages et les lieux qui te manquent. Tout texte remplacé est d'abord gardé dans les Versions de l'épisode.

Les anciens fichiers `.lemenu` s'ouvrent aussi.

---

## Les onglets

### Épisodes
La liste des épisodes par saison, avec leur titre, leur date dans l'histoire, l'avancement, le nombre de pages et la durée estimée. On y crée et modifie les épisodes, on y importe les scripts, et on y note les intrigues A, B et C.

### Écriture
L'atelier pour écrire un épisode, ou pour regarder toute la série. Les vues sont rangées en quatre familles : **Écrire** (reprendre, plan, brouillon, objectifs), **L'histoire** (personnages, mémoire, structure), **Relire** (à revoir, lisibilité, feuille de style) et **Produire** (dépouillement, export, tournage). Config → Interface permet toujours de les masquer ou de changer leur ordre dans chaque famille.
- **Pour la série** :
  - **Reprendre** : où tu en étais, l'objectif du jour, ce qu'il ne faut pas oublier, la suite. En bas, le projet en un coup d'œil : les fils encore ouverts, les commentaires à revoir, la date de la dernière sauvegarde et le dernier envoi aux lecteurs ;
  - les personnages et leurs relations ;
  - la Mémoire (les fils ouverts, les faits à respecter, les gags) ;
  - **À revoir** : tous les commentaires laissés dans les brouillons, réunis en une liste, avec « Aller à la ligne » et « Fait » ;
  - les répétitions d'un épisode à l'autre, le plan, le dépouillement (ce que chaque épisode demande au tournage) ;
  - les objectifs d'écriture : les mots par jour sur deux semaines, et par semaine sur six mois, avec le total de chaque mois ;
  - **Ouvertures et fins** (série) : en bas, **les fins qui se répètent**, c'est-à-dire la même dernière ligne dans plusieurs épisodes (un gimmick voulu, ou une fin reprise sans s'en rendre compte). En haut, l'ouverture : l'ouverture de chaque épisode, c'est-à-dire la scène avant le générique (si le mot « générique » est écrit), sinon la première scène. Sa part dans l'épisode, et sa dernière vraie réplique (les transitions sont sautées) : une question, une chute ou une phrase en suspens donnent envie de rester, une fin à plat moins ;
  - **Lisibilité** (série et scénario) : les **pavés**, ces blocs d'action de plus de quatre lignes à la largeur d'une page en Courier 12, que les lecteurs survolent. Et la **densité** de chaque séquence, c'est-à-dire la part d'action face aux dialogues, en barres, les séquences très denses en orange. Une réplique séparée de son nom par une ligne vide est lue comme une action, comme partout dans l'app ;
  - **Les dix premières pages** (scénario, dans Lisibilité) : la page où apparaît chacun des personnages principaux, la première réplique, le nombre de séquences et la part d'action. L'app signale un héros qui arrive tard ou un début sans dialogue ;
  - **Portraits** (roman) : ce que le texte dit du physique de chaque personnage (yeux, cheveux, taille, barbe, lunettes), dans les phrases qui le nomment ou juste après. Les contradictions sont signalées (des yeux bleus puis verts) ;
  - **Rythme** (roman) : sous la longueur et la part de dialogue de chaque chapitre, la **tension** en courbe. Elle est calculée sur la part de phrases courtes et le nombre de ! et de ?, et l'app signale trois chapitres calmes d'affilée. C'est une indication, pas une note ;
  - **Sens et tics** (roman) : pour chaque chapitre, ce qu'on y voit, entend, sent, touche et goûte, pour 1 000 mots. L'app signale un sens presque absent du livre. Les **tics de plume** : les adverbes en -ment, les petits mots qui reviennent (« soudain », « alors », « vraiment »…) et le même mot répété à moins de trente mots d'intervalle ;
  - **Ton année** : le bilan d'une année d'écriture, comme une rétrospective. On y trouve les mots écrits (comparés à l'année d'avant), les jours d'écriture, ta meilleure journée, ta plus longue série de jours d'affilée, ton jour, ton mois et ton moment préférés pour écrire, les versions gardées, les épisodes les plus repris, les envois aux lecteurs et les personnages qui parlent le plus ;
  - dans la **Mémoire**, le filtre **Objets oubliés** liste les fusils de Tchekhov. Ce sont les objets mis en avant dans une didascalie (écrits en capitales dans une ligne en minuscules, ou nommés plusieurs fois dans l'épisode) que la suite de la série ne mentionne plus jamais. Parfois c'est voulu : « ignorer » le retire. Une faute de frappe y apparaît aussi, puisqu'elle ne revient jamais ;
  - **Feuille de style** : la typographie du projet (apostrophes courbes, guillemets « », points de suspension, espaces insécables avant : ; ! ?, une seule espace entre les mots) et l'orthographe des noms. Pour chaque nom, tu écris la bonne graphie et ses variantes. « Noms de réplique seulement » ne touche que la ligne du nom au-dessus d'une réplique : un surnom dans un dialogue reste tel quel. L'app propose les noms de réplique écrits de plusieurs façons. **Vérifier** montre ce qui s'écarte, épisode par épisode, avec des exemples ; tu coches les épisodes à corriger, et l'ancien texte reste dans leurs Versions ;
  - les exports : PDF aux normes, Final Draft, Fountain et Word, pour un épisode ou toute la série, avec une page de titre et, si tu veux, un **filigrane** (« Confidentiel ») sur chaque page. Sous **Autres documents** :
    - le **PDF à annoter**, avec une grande marge à droite, des lignes numérotées et un interligne double, pour relire au stylo ;
    - le **dossier de présentation**, une page pour un producteur ou un éditeur avec le titre, l'idée en une phrase, le résumé, les personnages principaux (avec leur photo de casting) et les chiffres du projet. Les champs se remplissent une fois et restent dans le projet.
- **Pour un épisode** :
  - Préparer, Séquencier, Tableau de liège ;
  - **Brouillon** : l'éditeur, avec recherche et remplacement dans l'épisode, et le mode concentration ;
  - Lecture à la table (une voix par personnage), Versions, Structure, Gags par page. Dans **Versions**, **Chutier** réunit les scènes coupées de toute la série : celles qu'une version gardée contenait et que ni le script ni le brouillon n'ont plus. On les cherche, on les relit, et « Copier » en reprend une. **▶ Rejouer l'écriture** fait défiler les versions gardées comme un film : les scènes apparaissent (en vert), sont réécrites (en orange) ou disparaissent (barrées), avec le nombre de mots de chaque version.
  - **Lire à plusieurs (Wi-Fi)**, dans la Lecture à la table (app de bureau) : chaque comédien suit le texte sur son téléphone, connecté au même Wi-Fi. L'app donne une adresse à ouvrir. Chacun choisit son rôle, ses répliques sont surlignées, et la ligne lue sur l'ordinateur avance chez tout le monde. Le partage ne sert que cet épisode, en lecture seule, derrière une adresse qui contient un code impossible à deviner. Il s'arrête avec **Arrêter le partage**, au bout de 4 heures, ou quand l'app se ferme. macOS peut demander d'autoriser les connexions entrantes la première fois.
- Le brouillon reste à part tant que tu ne le valides pas comme script. Chaque version importante est gardée dans **Versions**.
- **Révisions en couleur**, comme sur un tournage. Au-dessus de la liste des scènes du brouillon, **Figer cette version** la marque blanche, puis la suivante bleue, rose, jaune, verte… Chaque scène garde la couleur de la version où son texte est apparu, et une scène changée depuis la dernière version est hachurée en orange. Chaque envoi à un lecteur fige aussi une version (« Envoyé à … ») : on voit ce qui a changé depuis qu'il l'a reçu.
- **Contraintes**, dans la colonne du brouillon : des règles qu'on se donne pour un épisode, comme un jeu à la façon de l'Oulipo. Par exemple : au plus 80 répliques, au plus 40 mots par réplique, sans le mot « vraiment », un personnage qui ne parle que par questions, un personnage qui ne dit rien, au moins N scènes. L'app vérifie à mesure que tu écris : ✓ tenue, ✗ pas tenue, avec le détail.
- **Prompteur** : le brouillon défile en grand, sur fond noir, à la vitesse choisie. Espace met en pause, ↑ et ↓ changent la vitesse, A− et A+ la taille. **Miroir** inverse le texte pour une vitre de prompteur. Il existe aussi dans la Lecture à la table.
- **▶ Écouter** lit le brouillon à voix haute depuis le curseur, avec une voix par personnage. L'éditeur suit la ligne lue. Ça marche aussi en mode concentration : on entend le rythme des dialogues.

#### Les vues propres à chaque type de projet
- **Roman** : **Point de vue** (qui raconte chaque chapitre), **Fins de chapitre** (question ouverte, révélation, suspens ou fin à plat), **Temps du récit** (les dates, les retours en arrière), **Fils entre livres** (les promesses lancées dans un livre et tenues dans un autre).
- **Scénario** : **Personnages par acte** (qui apparaît dans chaque acte), en plus de Structure, Séquences, Plan de travail, Tournage et Révisions.
- **BD** : **Tourne de page** (la dernière case d'une page de droite donne-t-elle envie de tourner ?) et **Production** (l'avancement de chaque planche).
- **Théâtre** : **Entrées et sorties** (qui est en scène, qui parle, qui reste muet).
- **Jeu** : **Carte des lieux** (les lieux, leurs sorties et ce qu'il faut pour passer).
- **Pub** : le **script image et son**, chaque spot en deux colonnes minutées, pour le client.
- **Arcs** (Atelier) : la courbe d'un personnage, scène par scène, selon qu'il avance vers ce qu'il veut (▲) ou s'en éloigne (▼).

### Personnages
- **Fiches** : qui est qui. Sur la fiche, **photo de casting** ajoute une image de référence (un comédien, un dessin) pour se représenter le personnage. Elle est réduite et gardée dans le projet ; rien n'est cherché en ligne.
- **Relations** : le graphe des personnages. On y voit qui partage des scènes avec qui, et comment ça évolue. La vue **Rencontres** montre les duos qui ne se sont jamais croisés, et ceux qu'on n'a pas vus ensemble depuis longtemps.
- **Qui sait quoi** : les secrets, qui les apprend et quand. L'app signale un personnage qui parle d'un secret avant de le connaître. Elle montre aussi l'ironie dramatique : les scènes où le public en sait plus que les personnages.
- **États** : ce qui change pour un personnage pendant quelques épisodes (blessé, parti, fâché avec quelqu'un). L'app le rappelle pendant l'écriture. Elle signale aussi un absent qui parle, ou deux personnages brouillés qui partagent une scène.
- **Qui parle ?** : le test de l'aveugle. L'app montre une réplique sans son nom, et tu devines qui la dit. Les répliques qui contiennent le nom d'un des personnages en jeu sont écartées. À la fin : ton score, et les voix que tu as confondues. Si tu mélanges souvent deux personnages, leurs voix se ressemblent trop. On choisit les personnages en jeu (jusqu'à six). Au clavier, 1, 2, 3… répondent.
- **Parcours** : pour un personnage principal, l'app liste aussi les **grandes scènes où il manque** (un repas, une fête, une réunion, ou au moins quatre personnages qui parlent) sans que le texte dise pourquoi. Puis tout ce qui arrive à un personnage, épisode par épisode. On y voit ses répliques, ses moments décisifs, ses états, sa première et sa dernière apparition, et sa plus longue absence. On y voit aussi l'âge qu'il dit avoir (« j'ai 34 ans », « j'ai trente-quatre ans ») ou qu'on lui donne (« Paul a 34 ans »). L'app signale un âge qui recule d'un épisode à l'autre, ou qui ne colle pas à la fiche. Avec une date de naissance sur la fiche et une date sur l'épisode, elle compare aussi à l'âge attendu. Elle ne corrige rien : elle montre où regarder.

### Décors
La liste des lieux, leurs scènes et qui y va. La carte : une image de ton choix avec des épingles, et même un monde inventé (royaumes, villes, chronologie).

### Frise
Le calendrier et la frise de l'histoire. **Repères** confronte les scripts aux dates des épisodes : une fête citée hors de sa saison (Noël en juillet), un jour de la semaine qui ne colle pas, des épisodes qui se chevauchent, les anniversaires et les âges. Et les **anachronismes** : un smartphone en 1995, des euros en 1998, le wifi en 1990… à partir de l'année où chaque chose s'est répandue (une trentaine d'objets et de mots, de l'e-mail à TikTok).

### Thèmes
Les thèmes de la série, épisode par épisode, et les **fils** (promesses narratives) : ce qui a été annoncé et doit revenir. On voit les fils qui dorment depuis longtemps, ou qu'on n'a jamais résolus.

### Suivi
L'avancement de l'écriture : dates de début et de fin de chaque jet, épisode par épisode.

### Analyse
Dans **Voix**, les **registres de langue** de chaque personnage : la part de tutoiement et de vouvoiement, l'argot et les mots soutenus pour 1 000 mots, saison par saison. L'app signale un registre qui change d'une saison à l'autre.
Tout se recalcule sur les épisodes choisis à gauche (une saison, une sélection, toute la série).
- **Ensemble, Présence, Combinaisons, Scènes** : qui parle, combien, avec qui. Présence repère aussi les personnages qui s'effacent.
- **Rythme** : répliques par minute, scènes longues. Le profil d'un épisode compare la longueur et le tempo de ses scènes aux habitudes de la série.
- **Durée** : la durée par les pages et par le dialogue.
- **Intrigues** : la part des intrigues A, B et C par scène, l'équilibre sur la sélection, et qui porte chaque intrigue.
- **Voix** : les mots propres à chaque personnage. « Ça ne lui ressemble pas » montre les répliques qui sonnent comme celles d'un autre.
- **Mots, Expressions** : le vocabulaire, les tics d'écriture et les gags récurrents.
- **Comparateur, Diff** : deux épisodes ou deux versions côte à côte.
- **Bible** : la bible d'une saison, ou de toute la série (personnages, relations, états, secrets, fils), à imprimer ou à enregistrer en PDF.

### Batch
Les traitements par lots : réanalyser les scripts, dater les épisodes à la suite, créer plusieurs épisodes d'un coup.

### Recherche
Cherche dans les titres, les résumés, les commentaires, les thèmes, les lieux, les mentions et les scripts.

**Remplacer dans toute la série** sert à renommer un personnage ou un lieu partout d'un coup :
1. Tu vois d'abord un aperçu, épisode par épisode, avec des extraits.
2. Tu coches les épisodes à modifier.
3. Le remplacement se fait. Chaque script modifié est d'abord gardé dans ses Versions.

Sans « casse exacte », un nom en capitales reste en capitales : MARC devient GASTON, Marc devient Gaston.

### Journal
L'historique des modifications : ce qui a été ajouté, changé ou supprimé (épisodes, personnages, thèmes, saisons, lieux), avec l'ancienne et la nouvelle valeur.

### Lecteurs
Les retours des bêta-lecteurs : à qui chaque épisode a été envoyé, leurs notes et leurs commentaires.

**Pour une lecture publique**, Écriture → Exporter → **PDF du rôle** donne à chaque comédien tout le texte, avec ses répliques surlignées et leur nombre.

**Envoyer des épisodes** : sur la fiche d'un lecteur, coche les épisodes. L'app note l'envoi du jour pour chacun, et prépare au choix :
- un seul **PDF** de leurs scripts, au format scénario ;
- une **version de lecture** : un seul fichier HTML, avec un sommaire, qui s'adapte à l'écran. Il se lit bien sur un téléphone, une tablette ou une liseuse, en clair ou en sombre selon l'appareil, et s'ouvre sans connexion et sans rien installer.

Avec **Au nom du lecteur dans les envois** (Écriture → Exporter → Filigrane), le PDF et la version de lecture portent « Confidentiel · son nom » en travers de chaque page : si un texte circule, on sait d'où il vient.

« Cocher ceux pas encore envoyés » choisit d'un coup ce qu'il n'a pas lu.

**Vue d'ensemble** (en haut de l'onglet) : un tableau de tous les épisodes envoyés et de tous les lecteurs. Chaque case montre la note, ✓ pour un retour sans note, ou … pour une attente (en orange après deux semaines). Un point orange signale un script qui a changé depuis l'envoi. La dernière colonne donne la moyenne de chaque épisode, et signale les avis partagés. En dessous, **À relancer** liste ceux qui n'ont pas répondu après deux semaines.

### Config
Les projets, le vocabulaire, les intrigues, la mise en page des exports, l'apparence, l'accessibilité, le projet portable, les sauvegardes manuelles et l'**App de bureau** (sauvegarde automatique, restauration, mot de passe, mises à jour).

**Accessibilité et typographie → L'éditeur du brouillon** : la police, la taille, l'interligne et la largeur du texte pendant que tu écris. Les PDF et les exports gardent leur propre mise en page.

Le thème peut être **Sombre**, **Clair** ou **Système**. Avec Système, l'app suit le réglage de macOS, de Windows ou de Linux, et bascule en même temps que lui.

---

## Aller vite : la palette (⌘K)

**⌘K** (Ctrl+K sur Windows et Linux) ouvre une barre où l'on tape quelques lettres pour aller n'importe où. Elle trouve aussi chaque **fonction par son nom ou un synonyme** : « chutier », « pomodoro », « tutoiement », « anachronisme », « prompteur »… sans avoir à se souvenir de l'endroit où elle est rangée :
- un épisode : « s2e04 » ouvre son brouillon ; la fiche de l'épisode est juste en dessous ;
- un personnage : « léonie » ouvre sa fiche ;
- une vue : « analyse rythme », « qui sait », « bible »… ;
- un autre projet ;
- une commande : nouvel épisode, remplacer dans la série, thème, PDF, sauvegarde, nouvelle fenêtre, verrouiller.

↑ ↓ pour choisir, Entrée pour ouvrir, Échap pour fermer. La palette marche aussi dans un navigateur.

---

## L'app de bureau

### Sauvegarde automatique
**Config → App de bureau** : choisis un dossier (iCloud, Dropbox, un disque externe…) et un rythme :
- une fois par jour ;
- ou à chaque fermeture ;
- ou jamais.

Chaque projet est enregistré en entier, dans un fichier `.continuite` qu'on rouvre d'un double-clic. L'app garde les dernières copies de chaque projet (3 à 50, au choix) et efface les plus anciennes. **Fichier → Sauvegarder tous les projets maintenant** lance une sauvegarde à tout moment.

**Chiffrer les sauvegardes…** protège les copies par un mot de passe (10 caractères au moins, demandé deux fois). C'est utile si le dossier est dans un cloud : sans le mot de passe, le fichier est illisible. Le chiffrement est AES-256. Le fichier en clair ne passe jamais par le dossier de sauvegarde. Le mot de passe est rangé dans le trousseau de l'ordinateur (Trousseau de macOS, Windows, trousseau de Linux) : les sauvegardes automatiques ne demandent rien. Pour rouvrir une copie chiffrée, double-clic ou **Restaurer** : sur cet ordinateur, rien à taper ; ailleurs, l'app demande le mot de passe. **Un mot de passe perdu ne se retrouve pas**, et les copies faites avec lui ne s'ouvrent plus. « Ne plus chiffrer » ne touche pas aux copies déjà faites.

### Dossier surveillé
Tu écris dans Final Draft, Word, Fountain ou Montage ? **Config → App de bureau → Dossier surveillé** : choisis le dossier de tes scripts. Ensuite, quand un fichier change, l'app reprend son texte dans l'épisode, toute seule.

- Le nom du fichier donne l'épisode : « S2E05 », « 2x05 » ou « Saison 2 épisode 5 ». Les fichiers sans numéro sont ignorés, comme ceux qui contiennent « old », « copie », « ancien » ou « sauvegarde ».
- Au premier passage, seuls les épisodes encore sans script sont remplis. Rien n'est écrasé tant que tu n'as pas modifié un fichier.
- Quand un fichier modifié remplace un script, l'ancien texte est gardé dans les **Versions** de l'épisode.
- Si deux fichiers donnent le même épisode, le plus récent gagne.
- Le brouillon en cours dans l'app n'est pas touché.
- Chaque projet a son propre dossier. Les dernières reprises s'affichent sous le réglage, avec « Vérifier maintenant », « Ouvrir » et « Arrêter ».

Formats repris : Fountain, texte, Markdown, Final Draft, Montage, Celtx, Highland, Fade In, Word, LibreOffice, RTF et HTML. Le PDF ne l'est pas : son texte ne se lit bien qu'à l'import.

### Restaurer une sauvegarde
**Config → App de bureau → Restaurer ou comparer une sauvegarde** liste les sauvegardes du dossier, les plus récentes d'abord. « Ouvrir » passe la sauvegarde dans l'import, où tu choisis :
- **Comparer et fusionner** avec le projet ouvert, pour récupérer seulement un épisode perdu ou abîmé ;
- **Remplacer** le projet entier ;
- ou en faire un **nouveau projet**, pour la consulter à côté.

### Deux fenêtres
**Fichier → Nouvelle fenêtre** (⌘⇧N) ouvre une seconde fenêtre. Dans le brouillon d'un épisode, **Autre fenêtre** ouvre ce même brouillon à côté. C'est pratique pour relire l'épisode précédent pendant que tu écris le suivant.

Les deux fenêtres partagent tes projets. Ce que tu écris dans l'une est enregistré dès que tu passes à l'autre, et l'autre se met à jour quand tu y reviens. Évite tout de même d'écrire en même temps dans le même brouillon depuis les deux fenêtres.

### Mot de passe
**Config → App de bureau → Mot de passe** : l'app demande alors ce mot de passe à chaque ouverture. Elle peut aussi se verrouiller toute seule :
- après un temps sans activité (5 minutes à 1 heure) ;
- quand l'ordinateur se met en veille ou se verrouille.

**Fichier → Verrouiller** (⌘L) la verrouille tout de suite. Après plusieurs erreurs, il faut attendre de plus en plus longtemps avant de réessayer.

- **Ce n'est pas un chiffrement** : il empêche d'ouvrir tes projets dans l'app, mais les fichiers restent lisibles sur le disque. Pour les protéger aussi, active **FileVault** (Mac) ou **BitLocker** (Windows).
- **Un mot de passe oublié ne se retrouve pas.** Pour retirer le verrou sans lui, quitte l'app et efface la ligne `"verrou"` du fichier `config.json` (dans `~/Library/Application Support/Continuite` sur Mac). Tes projets ne sont pas touchés.

### Tes réglages dans un fichier
**Config → App de bureau → Enregistrer mes réglages…** crée un petit fichier avec l'apparence, l'accessibilité, l'ordre des onglets, les objectifs, la mise en page, la feuille de style et les raccourcis du projet ouvert. Aucun texte ni personnage n'y va. **Reprendre des réglages…** les applique au projet ouvert, sur cet ordinateur ou un autre.

### Mises à jour
Quand une nouvelle version sort, l'app te le propose : Télécharger, Plus tard, ou Ignorer cette version. Si tu acceptes :
1. L'installateur arrive dans « Téléchargements ».
2. Son empreinte est vérifiée : un fichier abîmé est effacé.
3. Tu installes toi-même.

Tes projets ne sont pas touchés. **Rechercher les mises à jour…** est dans le menu Continuité (Mac) ou Aide (Windows, Linux).

### Le clic droit et l'orthographe
Dans un champ, le clic droit propose Couper, Copier, Coller et Tout sélectionner. Sur un mot souligné, il propose des corrections et **Ajouter au dictionnaire**. Les noms de tes personnages et de tes décors sont ajoutés au dictionnaire tout seuls : le correcteur ne les souligne plus. Sur un texte sélectionné, il propose aussi **Chercher dans la série**.

### PDF
Les feuilles de service, le script au format scénario, le storyboard et la bible s'enregistrent directement en PDF : l'app demande seulement où enregistrer le fichier. **Fichier → Enregistrer la page en PDF…** (⌘⇧E) enregistre la page affichée.

### L'aide sur chaque écran
Le **?** rond en bas à droite, F1, ou **Aide → Aide sur cet écran** ouvre le passage de ce guide qui parle de l'écran affiché. Le paragraphe de la vue ouverte est surligné. Le guide est dans l'app : il se lit sans connexion. **Tout le guide** l'affiche en entier.

### Raccourcis clavier
Sur Windows et Linux, remplace ⌘ par Ctrl. Chacun se change dans **Config → App de bureau → Raccourcis clavier** : clique sur le raccourci, tape les touches voulues. Un raccourci déjà pris est refusé, et « d'origine » remet celui de départ.

| Raccourci | Action |
|---|---|
| ⌘1 à ⌘9 | Épisodes, Écriture, Personnages, Décors, Frise, Thèmes, Suivi, Analyse, Recherche |
| ⌘K | Palette : aller à un épisode, un personnage, une vue, une commande |
| F1 | Aide sur l'écran affiché |
| ⌘F | Rechercher dans la série |
| ⌘N | Nouvel épisode |
| ⌘O | Ouvrir un projet partagé |
| ⌘⇧N | Nouvelle fenêtre |
| ⌘L | Verrouiller (si un mot de passe est défini) |
| ⌘⇧E | Enregistrer la page en PDF |
| ⌘⇧F | Mode concentration (depuis le brouillon d'un épisode) |
| ⌘, | Réglages (Config) |
| Échap | Sortir du mode concentration |

### Mode concentration
Depuis le brouillon d'un épisode, le bouton **Concentration** (ou ⌘⇧F) met l'éditeur seul en plein écran, avec le nombre de mots. Échap pour sortir.

**⏱ Sprint** lance 25 minutes chronométrées et compte les mots gagnés pendant la séance ; cliquer de nouveau l'arrête. Les sprints faits s'affichent dans Objectifs (moyenne et record).

Le bouton **♪** en haut ajoute un bruit de fond pour se concentrer : pluie, bruit brun ou rumeur de café, au choix. Le son est fabriqué par l'ordinateur lui-même, sans fichier ni connexion. Il s'arrête en sortant du mode concentration.

---

## Questions

**Puis-je utiliser Continuité dans un navigateur, sans l'app ?**
Oui. Le même code fonctionne derrière un serveur web avec PHP 8.3 ou plus (MAMP, par exemple). Seules les fonctions de l'app de bureau (sauvegarde automatique, mises à jour, clic droit, raccourcis) n'y sont pas.

**Changer d'ordinateur ?**
Exporte chaque projet en `.continuite` (Config → Projet portable), ou copie le dossier des données. Sur le nouvel ordinateur, double-clique sur les fichiers.

**Un remplacement s'est mal passé ?**
Écriture → l'épisode → **Versions** : l'ancien script y est, daté, avec la mention du remplacement.

**Un problème ?**
Ouvre une *issue* sur [GitHub](https://github.com/victorbaissait/continuite/issues), en joignant si possible le journal (Aide → Ouvrir le journal de PHP). Ne joins jamais tes projets si tu veux qu'ils restent privés.

---

Continuité est un logiciel libre, sous licence [GNU AGPL v3](../LICENSE). Pensé et designé par Victor Baissait.
