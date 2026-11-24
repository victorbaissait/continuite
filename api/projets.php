<?php
// api/projets.php — Plusieurs séries dans la même app : chaque projet a son dossier de données
// Le projet d'origine reste dans data/ ; les suivants vont dans data/projets/<identifiant>/

// L'app de bureau range les données dans le dossier de l'utilisateur et le dit par cette variable
// Le nom de l'app (pas celui d'un projet) : aussi dans package.json et assets/js/api.js
const NOM_APP = 'Continuité';

define('PROJETS_RACINE', rtrim((string)getenv('APP_DATA_DIR'), '/\\') ?: dirname(__DIR__) . '/data');
require_once __DIR__ . '/portable.php';

// Un champ du corps qui doit être du texte : un tableau ou un objet envoyé à la place compte comme vide
function texteCorps($valeur): string {
    return is_scalar($valeur) ? (string)$valeur : '';
}

function dossierProjet(string $slug): string {
    return $slug === '' ? PROJETS_RACINE : PROJETS_RACINE . "/projets/$slug";
}

// Un identifiant inconnu n'ouvre jamais le projet d'origine à la place : on n'écrirait pas au bon endroit
function projetDemande(): ?string {
    $slug = (string)($_GET['projet'] ?? '');
    if ($slug === '') return '';
    if (!preg_match('/^[a-z0-9-]{1,40}$/', $slug) || !is_file(dossierProjet($slug) . '/sitcom.db')) return null;
    return $slug;
}

// projet.json : le nom, ce qu'on écrit (série TV, roman, film ou BD) et ses options
const PROJET_TYPES = ['serie', 'roman', 'film', 'bd', 'theatre', 'pub', 'jeu'];
// Les formes possibles de chaque type, la première étant celle par défaut
const PROJET_FORMES = ['film' => ['long', 'court'], 'theatre' => ['classique', 'tableaux', 'seul'], 'pub' => ['tv', 'radio', 'reseaux'], 'jeu' => ['pnc', 'narratif', 'rpg']];
// Les mots qu'on peut choisir pour les deux niveaux, le premier étant celui par défaut
const PROJET_MOTS = [
    'serie' => [['saison', 'partie', 'volume'], ['episode', 'chapitre']],
    'roman' => [['livre', 'tome', 'partie', 'volume'], ['chapitre', 'partie']],
    'film' => [['film'], ['acte', 'partie']],
    'bd' => [['album', 'tome', 'volume'], ['planche', 'page']],
    'theatre' => [['acte', 'partie'], ['scene', 'tableau']],
    'pub' => [['campagne'], ['spot']],
    'jeu' => [['chapitre', 'partie'], ['lieu']],
];
const PROJET_NOMS_NIVEAU = ['saison' => 'Saison', 'livre' => 'Livre', 'tome' => 'Tome', 'partie' => 'Partie', 'volume' => 'Volume', 'album' => 'Album', 'film' => 'Film', 'acte' => 'Acte', 'campagne' => 'Campagne', 'chapitre' => 'Chapitre'];

function infosProjet(string $slug): array {
    $infos = json_decode((string)@file_get_contents(dossierProjet($slug) . '/projet.json'), true);
    $infos = is_array($infos) ? $infos : [];
    $type = in_array($infos['type'] ?? '', PROJET_TYPES, true) ? $infos['type'] : 'serie';
    return [
        'nom' => !empty($infos['nom']) ? (string)$infos['nom'] : ($slug === '' ? 'Mon projet' : $slug),
        'type' => $type,
        // Livres d'un roman, albums d'une BD
        'livres' => in_array($type, ['roman', 'bd'], true) && ($infos['livres'] ?? '') === 'plusieurs' ? 'plusieurs' : 'un',
        'forme' => in_array($infos['forme'] ?? '', PROJET_FORMES[$type] ?? [], true) ? $infos['forme'] : (PROJET_FORMES[$type][0] ?? 'long'),
        'format' => $type === 'bd' && in_array($infos['format'] ?? '', ['fb', 'rg', 'manga', 'comics'], true) ? $infos['format'] : 'fb',
        'storyboard' => !empty($infos['storyboard']),
        'mots' => [
            'haut' => in_array($infos['mots']['haut'] ?? '', PROJET_MOTS[$type][0], true) ? $infos['mots']['haut'] : PROJET_MOTS[$type][0][0],
            'unite' => in_array($infos['mots']['unite'] ?? '', PROJET_MOTS[$type][1], true) ? $infos['mots']['unite'] : PROJET_MOTS[$type][1][0],
        ],
    ];
}

// « Livre 2 » : le nom d'une saison dans les mots du projet
function nomNiveau(string $slug, int $n): string {
    $infos = infosProjet($slug);
    return $infos['type'] === 'film' ? 'Film' : PROJET_NOMS_NIVEAU[$infos['mots']['haut']] . " $n";
}

function nomProjet(string $slug): string {
    return infosProjet($slug)['nom'];
}

function ecrireInfosProjet(string $slug, array $changements): void {
    $infos = array_merge(infosProjet($slug), $changements);
    file_put_contents(dossierProjet($slug) . '/projet.json', json_encode($infos, JSON_UNESCAPED_UNICODE));
}

function ecrireNomProjet(string $slug, string $nom): void {
    ecrireInfosProjet($slug, ['nom' => $nom]);
}

function ouvrirBaseProjet(string $slug): PDO {
    $pdo = new PDO('sqlite:' . dossierProjet($slug) . '/sitcom.db');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA busy_timeout = 5000');
    // Première ouverture (app toute neuve) : la base reçoit sa structure avant qu'on la lise
    mettreAJourSchema($pdo, dossierProjet($slug) . '/sitcom.db');
    return $pdo;
}

function resumeProjet(string $slug): array {
    $pdo = ouvrirBaseProjet($slug);
    $infos = infosProjet($slug);
    return [
        'slug' => $slug, 'nom' => $infos['nom'], 'type' => $infos['type'], 'livres' => $infos['livres'],
        'forme' => $infos['forme'], 'format' => $infos['format'], 'storyboard' => $infos['storyboard'], 'mots' => $infos['mots'],
        'episodes' => (int)$pdo->query('SELECT COUNT(*) FROM episodes')->fetchColumn(),
        'scripts' => (int)$pdo->query("SELECT COUNT(*) FROM episodes WHERE COALESCE(TRIM(texte_episode), '') != ''")->fetchColumn(),
    ];
}

function slugsProjets(): array {
    $slugs = [''];
    foreach (glob(PROJETS_RACINE . '/projets/*/sitcom.db') ?: [] as $base) $slugs[] = basename(dirname($base));
    return $slugs;
}

function nouveauSlug(string $nom): string {
    $plat = strtr(mb_strtolower($nom), ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'ç' => 'c', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'œ' => 'oe', 'æ' => 'ae']);
    $base = substr(trim((string)preg_replace('/[^a-z0-9]+/', '-', $plat), '-'), 0, 32) ?: 'projet';
    $slug = $base;
    for ($n = 2; is_dir(dossierProjet($slug)); $n++) $slug = "$base-$n";
    return $slug;
}

// Le titre affiché suit le nom du projet, sauf s'il a été personnalisé dans Interface
function renommerTitre(PDO $pdo, string $ancien, string $nom): void {
    $brut = $pdo->query("SELECT valeur FROM analyse_notes WHERE cle = 'interface'")->fetchColumn();
    if ($brut === false) {
        $pdo->prepare("INSERT INTO analyse_notes (cle, valeur) VALUES ('interface', ?)")->execute([json_encode(['titre' => $nom], JSON_UNESCAPED_UNICODE)]);
        return;
    }
    $reglages = json_decode((string)$brut, true);
    if (!is_array($reglages) || ($reglages['titre'] ?? $ancien) !== $ancien) return;
    $reglages['titre'] = $nom;
    $pdo->prepare("UPDATE analyse_notes SET valeur = ? WHERE cle = 'interface'")->execute([json_encode($reglages, JSON_UNESCAPED_UNICODE)]);
}

// Les modèles de départ : une structure vide (saisons, épisodes, actes, chapitres) avec des repères de durée.
// Ils ne contiennent aucun texte d'histoire : seulement des titres de parties et des repères de construction.
function modelesProjet(): array {
    return [
    'serie' => [
        'sitcom' => ['Sitcom 22 min en 3 actes', [[1, array_fill(0, 10, ['', "Repères (sitcom de 22 min, 22 à 25 pages) : ouverture avant le générique (1 à 2 p.) · acte 1, la situation et le problème (environ 7 p.) · acte 2, ça se complique (environ 8 p.) · acte 3, la résolution (environ 6 p.) · scène finale (1 p.)."])]]],
        'drame52' => ['Série 52 min en 4 actes', [[1, array_fill(0, 8, ['', "Repères (épisode de 52 min, 50 à 58 pages) : teaser (2 à 4 p.) · acte 1 (environ 13 p.) · acte 2 (environ 13 p.) · acte 3 (environ 13 p.) · acte 4 (environ 12 p.). Chaque fin d'acte relance l'enjeu."])]]],
        'mini' => ['Mini-série de 6 épisodes', [[1, [
            ['', 'Repères : mise en place. Le monde, les personnages, l\'enjeu, et l\'événement qui lance la série.'],
            ['', 'Repères : les conséquences. Les personnages s\'engagent, les obstacles apparaissent.'],
            ['', 'Repères : premier tournant. Une découverte change la direction de l\'histoire.'],
            ['', 'Repères : le milieu. Tout semble possible ou tout semble perdu ; un secret se révèle.'],
            ['', 'Repères : la crise. Le prix à payer devient clair, les camps se forment.'],
            ['', 'Repères : le dénouement. L\'enjeu se règle, les arcs se referment.'],
        ]]]],
    ],
    'film' => [
        'trois_actes' => ['Long métrage en 3 actes', [[1, [
            ['Acte 1', 'Repères : environ 25 % du film (25 à 30 p.). Le monde, le personnage, l\'incident déclencheur (vers la p. 10 à 15), puis la décision qui ouvre l\'acte 2.'],
            ['Acte 2', 'Repères : environ 50 % du film (50 à 60 p.). Les obstacles montent ; un retournement au milieu (vers la p. 55) ; tout semble perdu à la fin de l\'acte.'],
            ['Acte 3', 'Repères : environ 25 % du film (20 à 30 p.). La confrontation finale et la résolution.'],
        ]]]],
        'court' => ['Court métrage', [[1, [['Court métrage', 'Repères : 10 à 15 minutes (10 à 15 p.). Une seule situation, un seul enjeu, une fin qui surprend ou qui éclaire.']]]]],
    ],
    'roman' => [
        'voyage' => ['Roman en 12 étapes (voyage du héros)', [[1, [
            ['Le monde ordinaire', ''], ['L\'appel', ''], ['Le refus', ''], ['Le mentor', ''], ['Le seuil', ''], ['Épreuves, alliés, ennemis', ''],
            ['L\'approche', ''], ['L\'épreuve suprême', ''], ['La récompense', ''], ['Le chemin du retour', ''], ['La résurrection', ''], ['Le retour', ''],
        ]]]],
        'trois_parties' => ['Roman en 3 parties', [[1, [['Première partie', 'Repères : environ un quart du livre. Installer le monde et ce que veut le personnage.'], ['Deuxième partie', 'Repères : environ la moitié du livre. Les obstacles, le tournant du milieu.'], ['Troisième partie', 'Repères : environ un quart du livre. La crise et le dénouement.']]]]],
    ],
    'theatre' => [
        'trois_actes' => ['Pièce en 3 actes', [[1, [['Scène 1', 'Repères : l\'exposition.']]], [2, [['Scène 1', 'Repères : le nœud de l\'intrigue.']]], [3, [['Scène 1', 'Repères : le dénouement.']]]]],
        'un_acte' => ['Pièce en un acte', [[1, [['Scène 1', '']]]]],
    ],
    ];
}

// ─── Les modèles personnels : la structure et les réglages d'un projet, jamais ses textes ───

function dossierModeles(): string {
    return PROJETS_RACINE . '/modeles';
}

function listerModelesPerso(): array {
    $sortie = [];
    foreach (glob(dossierModeles() . '/*.json') ?: [] as $f) {
        $m = json_decode((string)file_get_contents($f), true);
        if (!is_array($m) || !preg_match('/^[a-z0-9-]{1,60}$/', basename($f, '.json'))) continue;
        $sortie[] = ['id' => basename($f, '.json'), 'nom' => (string)($m['nom'] ?? ''), 'type' => (string)($m['type'] ?? 'serie'),
            'saisons' => count($m['saisons'] ?? []), 'episodes' => array_sum(array_map(fn($x) => count($x['episodes'] ?? []), $m['saisons'] ?? []))];
    }
    usort($sortie, fn($a, $b) => strcmp($a['nom'], $b['nom']));
    return $sortie;
}

function enregistrerModelePerso(string $slug, string $nom): array {
    $db = ouvrirBaseProjet($slug);
    $saisons = [];
    foreach ($db->query('SELECT id, numero, nom FROM saisons ORDER BY numero')->fetchAll() as $sa) {
        $st = $db->prepare('SELECT numero_episode, titre, commentaires FROM episodes WHERE saison_id = ? ORDER BY numero_episode LIMIT 500');
        $st->execute([$sa['id']]);
        $saisons[] = ['numero' => (int)$sa['numero'], 'nom' => (string)$sa['nom'], 'episodes' => array_map(fn($e) => ['numero' => (int)$e['numero_episode'], 'titre' => (string)$e['titre'], 'commentaires' => (string)$e['commentaires']], $st->fetchAll())];
        if (count($saisons) >= 50) break;
    }
    $notes = [];
    $st = $db->query("SELECT cle, valeur FROM analyse_notes WHERE cle IN ('interface', 'objectifs', 'mise-en-page', 'feuille-style')");
    foreach ($st->fetchAll() as $r) $notes[$r['cle']] = (string)$r['valeur'];
    $infos = infosProjet($slug);
    if (!is_dir(dossierModeles())) mkdir(dossierModeles(), 0775, true);
    $base = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $nom) ?: 'modele')), '-') ?: 'modele';
    $id = substr($base, 0, 50);
    for ($i = 2; is_file(dossierModeles() . "/$id.json"); $i++) $id = substr($base, 0, 50) . "-$i";
    $modele = ['nom' => $nom, 'type' => $infos['type'], 'livres' => $infos['livres'], 'forme' => $infos['forme'], 'format' => $infos['format'], 'storyboard' => $infos['storyboard'],
        'mots' => $infos['mots'], 'saisons' => $saisons, 'notes' => $notes, 'cree_le' => date('c')];
    file_put_contents(dossierModeles() . "/$id.json", json_encode($modele, JSON_UNESCAPED_UNICODE));
    return ['id' => $id] + listerModelesPerso()[array_search($id, array_column(listerModelesPerso(), 'id'))];
}

function appliquerModelePerso(PDO $pdo, string $slug, string $id): void {
    if (!preg_match('/^[a-z0-9-]{1,60}$/', $id) || !is_file(dossierModeles() . "/$id.json")) return;
    $m = json_decode((string)file_get_contents(dossierModeles() . "/$id.json"), true);
    if (!is_array($m)) return;
    $couleurs = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6'];
    $saison = $pdo->prepare('INSERT INTO saisons (numero, nom, couleur) VALUES (?, ?, ?)');
    $episode = $pdo->prepare('INSERT INTO episodes (saison_id, numero_episode, titre, commentaires) VALUES (?, ?, ?, ?)');
    $note = $pdo->prepare('INSERT OR REPLACE INTO analyse_notes (cle, valeur) VALUES (?, ?)');
    $pdo->beginTransaction();
    foreach (array_slice(is_array($m['saisons'] ?? null) ? $m['saisons'] : [], 0, 50) as $sa) {
        $n = max(1, (int)($sa['numero'] ?? 1));
        $saison->execute([$n, mb_substr((string)($sa['nom'] ?? '') ?: nomNiveau($slug, $n), 0, 80), $couleurs[($n - 1) % 5]]);
        $idSaison = (int)$pdo->lastInsertId();
        foreach (array_slice(is_array($sa['episodes'] ?? null) ? $sa['episodes'] : [], 0, 500) as $e) {
            $episode->execute([$idSaison, max(1, (int)($e['numero'] ?? 1)), mb_substr((string)($e['titre'] ?? ''), 0, 200) ?: null, mb_substr((string)($e['commentaires'] ?? ''), 0, 5000) ?: null]);
        }
    }
    foreach (['interface', 'objectifs', 'mise-en-page', 'feuille-style'] as $cle) {
        if (isset($m['notes'][$cle]) && is_string($m['notes'][$cle]) && strlen($m['notes'][$cle]) < 500000) $note->execute([$cle, $m['notes'][$cle]]);
    }
    $pdo->commit();
}

function appliquerModele(PDO $pdo, string $slug, string $type, string $modele): void {
    $structure = modelesProjet()[$type][$modele][1] ?? null;
    if (!$structure) return;
    $couleurs = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6'];
    $saison = $pdo->prepare('INSERT INTO saisons (numero, nom, couleur) VALUES (?, ?, ?)');
    $episode = $pdo->prepare('INSERT INTO episodes (saison_id, numero_episode, titre, commentaires) VALUES (?, ?, ?, ?)');
    $pdo->beginTransaction();
    foreach ($structure as [$numero, $episodes]) {
        $saison->execute([$numero, nomNiveau($slug, $numero), $couleurs[($numero - 1) % 5]]);
        $id = (int)$pdo->lastInsertId();
        foreach ($episodes as $i => [$titre, $reperes]) $episode->execute([$id, $i + 1, $titre ?: null, $reperes ?: null]);
    }
    $pdo->commit();
}

function creerProjet(string $nom, ?string $source, array $options = []): array {
    $slug = nouveauSlug($nom);
    if (!is_dir(PROJETS_RACINE . '/projets')) mkdir(PROJETS_RACINE . '/projets', 0775);
    mkdir(dossierProjet($slug), 0775);
    $chemin = dossierProjet($slug) . '/sitcom.db';
    $pdo = new PDO('sqlite:' . $chemin);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    // La structure vient de la base d'origine : elle porte toutes les colonnes ajoutées au fil du temps
    $structure = ouvrirBaseProjet('')->query("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type = 'table' DESC, rowid")->fetchAll(PDO::FETCH_COLUMN);
    // La base d'origine peut venir d'un import : son schéma n'est qu'une donnée. Seules des tables et des index
    // sont recréés, une instruction à la fois (prepare n'en exécute qu'une : rien d'autre ne peut se glisser derrière)
    foreach ($structure as $sql) {
        if (!preg_match('/^\s*CREATE\s+(TABLE|(UNIQUE\s+)?INDEX)\s/i', $sql)) continue;
        $pdo->prepare($sql)->execute();
    }
    // Les règles de noms de la série d'origine ne valent pas pour une autre
    $pdo->exec("INSERT INTO app_meta (key, value) VALUES ('noms_regles_seed_v1', '1'), ('stats_tables_backfilled_v1', '1')");
    migrateSchema($pdo);
    $type = in_array($options['type'] ?? '', PROJET_TYPES, true) ? $options['type'] : 'serie';
    ecrireInfosProjet($slug, ['nom' => $nom, 'type' => $type, 'livres' => (string)($options['livres'] ?? 'un'), 'forme' => (string)($options['forme'] ?? 'long'), 'format' => (string)($options['format'] ?? 'fb'), 'storyboard' => !empty($options['storyboard'])]);
    $modele = is_string($options['modele'] ?? null) ? $options['modele'] : '';
    if (str_starts_with($modele, 'perso:')) {
        // Un modèle personnel apporte aussi son type, ses mots et ses options
        $id = substr($modele, 6);
        $m = preg_match('/^[a-z0-9-]{1,60}$/', $id) && is_file(dossierModeles() . "/$id.json") ? json_decode((string)file_get_contents(dossierModeles() . "/$id.json"), true) : null;
        if (is_array($m)) {
            $t = in_array($m['type'] ?? '', PROJET_TYPES, true) ? $m['type'] : $type;
            ecrireInfosProjet($slug, ['type' => $t] + array_intersect_key($m, array_flip(['livres', 'forme', 'format', 'storyboard', 'mots'])));
            appliquerModelePerso($pdo, $slug, $id);
        }
    } elseif ($modele !== '' && isset(modelesProjet()[$type][$modele])) appliquerModele($pdo, $slug, $type, $modele);
    // Seuls les réglages passent d'un projet à l'autre, jamais les épisodes
    if ($source !== null) {
        $reglages = ouvrirBaseProjet($source)->query("SELECT cle, valeur FROM analyse_notes WHERE cle IN ('interface', 'objectifs')")->fetchAll();
        $ajout = $pdo->prepare('INSERT OR REPLACE INTO analyse_notes (cle, valeur) VALUES (?, ?)');
        foreach ($reglages as $r) $ajout->execute([$r['cle'], $r['valeur']]);
        renommerTitre($pdo, nomProjet($source), $nom);
    } else {
        renommerTitre($pdo, '', $nom);
    }
    return resumeProjet($slug);
}

function dupliquerProjet(string $source): array {
    $nom = nomProjet($source) . ' (copie)';
    $slug = nouveauSlug($nom);
    if (!is_dir(PROJETS_RACINE . '/projets')) mkdir(PROJETS_RACINE . '/projets', 0775);
    mkdir(dossierProjet($slug), 0775);
    $cible = dossierProjet($slug) . '/sitcom.db';
    $stmt = ouvrirBaseProjet($source)->prepare('VACUUM INTO ?');
    $stmt->execute([$cible]);
    ecrireInfosProjet($slug, ['nom' => $nom] + infosProjet($source));
    // Les images du storyboard vivent à côté de la base
    $images = dossierProjet($source) . '/storyboard';
    if (is_dir($images)) {
        mkdir(dossierProjet($slug) . '/storyboard', 0775);
        foreach (glob("$images/*") ?: [] as $f) copy($f, dossierProjet($slug) . '/storyboard/' . basename($f));
    }
    renommerTitre(ouvrirBaseProjet($slug), nomProjet($source), $nom);
    return resumeProjet($slug);
}

function listerCorbeille(): array {
    $liste = [];
    foreach (glob(PROJETS_RACINE . '/corbeille/*/sitcom.db') ?: [] as $base) {
        $dossier = basename(dirname($base));
        $infos = json_decode((string)@file_get_contents(dirname($base) . '/projet.json'), true);
        $liste[] = ['dossier' => $dossier, 'nom' => $infos['nom'] ?? $dossier, 'date' => date('c', filemtime(dirname($base)))];
    }
    usort($liste, fn($a, $b) => strcmp($b['date'], $a['date']));
    return $liste;
}

function restaurerProjet(string $dossier): array {
    $source = PROJETS_RACINE . "/corbeille/$dossier";
    $infos = json_decode((string)@file_get_contents("$source/projet.json"), true);
    $slug = nouveauSlug((string)($infos['nom'] ?? 'projet'));
    if (!is_dir(PROJETS_RACINE . '/projets')) mkdir(PROJETS_RACINE . '/projets', 0775);
    rename($source, dossierProjet($slug));
    return resumeProjet($slug);
}

// Un projet retiré part dans data/corbeille/ : rien n'est effacé pour de bon
function retirerProjet(string $slug): void {
    $corbeille = PROJETS_RACINE . '/corbeille';
    if (!is_dir($corbeille)) mkdir($corbeille, 0775);
    rename(dossierProjet($slug), "$corbeille/$slug-" . date('Ymd-His'));
}

function handleProjets(string $method, array $parts, array $body): void {
    $action = $parts[1] ?? '';
    $erreur = function (string $message, int $code = 400): void {
        http_response_code($code);
        echo json_encode(['error' => $message]);
    };
    $slugValide = fn($s) => is_string($s) && in_array($s, slugsProjets(), true);
    $slugCorps = isset($body['slug']) && is_string($body['slug']) ? $body['slug'] : null;
    if (handlePortable($method, $action, $slugCorps, $body, $erreur, $slugValide)) return;

    if ($method === 'GET') {
        echo json_encode($action === 'corbeille' ? listerCorbeille() : ($action === 'modeles' ? listerModelesPerso() : array_map('resumeProjet', slugsProjets())));
        return;
    }
    if ($method !== 'POST') {
        $erreur('Méthode non autorisée', 405);
        return;
    }
    // Sans « slug » explicite, aucune action ne vise le projet d'origine par défaut
    $slug = isset($body['slug']) && is_string($body['slug']) ? $body['slug'] : null;
    $nom = trim(texteCorps($body['nom'] ?? ''));

    if ($action === 'restaurer') {
        $dossier = texteCorps($body['dossier'] ?? '');
        if (!preg_match('/^[a-z0-9-]{1,60}$/', $dossier) || !is_file(PROJETS_RACINE . "/corbeille/$dossier/sitcom.db")) {
            $erreur('Projet introuvable dans la corbeille.', 404);
            return;
        }
        echo json_encode(restaurerProjet($dossier));
        return;
    }

    if ($action === 'retirer_modele') {
        $id = texteCorps($body['id'] ?? '');
        if (!preg_match('/^[a-z0-9-]{1,60}$/', $id) || !is_file(dossierModeles() . "/$id.json")) { $erreur('Modèle introuvable.', 404); return; }
        unlink(dossierModeles() . "/$id.json");
        echo json_encode(['ok' => true]);
        return;
    }

    if ($action === 'modele') {
        if ($nom === '' || mb_strlen($nom) > 80) { $erreur('Donne un nom au modèle (80 caractères au plus).'); return; }
        if (!$slugValide($slug ?? '')) { $erreur('Projet inconnu.', 404); return; }
        echo json_encode(enregistrerModelePerso($slug ?? '', $nom), JSON_UNESCAPED_UNICODE);
        return;
    }

    if ($action === 'creer') {
        if ($nom === '' || mb_strlen($nom) > 80) {
            $erreur('Donne un nom au projet (80 caractères au plus).');
            return;
        }
        $source = isset($body['source']) && is_string($body['source']) ? $body['source'] : (isset($body['source']) ? false : null);
        if ($source !== null && !$slugValide($source)) {
            $erreur('Projet de départ inconnu.');
            return;
        }
        echo json_encode(creerProjet($nom, $source, $body));
        return;
    }
    if (!$slugValide($slug)) {
        $erreur('Projet inconnu.', 404);
        return;
    }
    if ($action === 'livres') {
        if (!in_array(infosProjet($slug)['type'], ['roman', 'bd'], true)) {
            $erreur('Seuls un roman et une BD se découpent en livres ou en albums.');
            return;
        }
        ecrireInfosProjet($slug, ['livres' => ($body['livres'] ?? '') === 'plusieurs' ? 'plusieurs' : 'un']);
        echo json_encode(resumeProjet($slug));
        return;
    }
    // Changer de mots renomme aussi les saisons qui portent encore un nom par défaut
    if ($action === 'mots') {
        ecrireInfosProjet($slug, ['mots' => ['haut' => texteCorps($body['haut'] ?? ''), 'unite' => texteCorps($body['unite'] ?? '')]]);
        $infos = infosProjet($slug);
        if ($infos['type'] !== 'film') {
            $pdo = ouvrirBaseProjet($slug);
            $maj = $pdo->prepare('UPDATE saisons SET nom = ? WHERE id = ?');
            foreach ($pdo->query('SELECT id, numero, nom FROM saisons')->fetchAll() as $s) {
                if (preg_match('/^(' . implode('|', PROJET_NOMS_NIVEAU) . ') \d+$/u', (string)$s['nom'])) $maj->execute([nomNiveau($slug, (int)$s['numero']), $s['id']]);
            }
        }
        echo json_encode(resumeProjet($slug));
        return;
    }
    if ($action === 'storyboard') {
        ecrireInfosProjet($slug, ['storyboard' => !empty($body['storyboard'])]);
        echo json_encode(resumeProjet($slug));
        return;
    }
    if ($action === 'renommer') {
        if ($nom === '' || mb_strlen($nom) > 80) {
            $erreur('Donne un nom au projet (80 caractères au plus).');
            return;
        }
        $ancien = nomProjet($slug);
        ecrireNomProjet($slug, $nom);
        renommerTitre(ouvrirBaseProjet($slug), $ancien, $nom);
        echo json_encode(resumeProjet($slug));
    } elseif ($action === 'dupliquer') {
        echo json_encode(dupliquerProjet($slug));
    } elseif ($action === 'retirer') {
        if ($slug === '') {
            $erreur('Le projet d\'origine ne peut pas être retiré.');
            return;
        }
        retirerProjet($slug);
        echo json_encode(['ok' => true]);
    } else {
        $erreur('Action inconnue.', 404);
    }
}
