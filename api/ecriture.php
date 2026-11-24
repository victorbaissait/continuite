<?php
// api/ecriture.php — Données de l'onglet Écriture : répliques, échanges, échos et répétitions

const ECRITURE_ECHOS_EPISODES_MIN = 3;
const ECRITURE_ECHOS_MAX = 300;
const ECRITURE_SUITE_MOTS = 6;
const ECRITURE_SUITE_EPISODES_MAX = 12;
const ECRITURE_REPETITION_MIN = 25;

// Crée la saison et l'épisode au besoin ; un script déjà présent n'est jamais écrasé
function importerScript(PDO $db, array $body): array {
    $numeroSaison = max(1, (int)($body['saison'] ?? 1));
    $numero = max(1, (int)($body['numero'] ?? 1));
    $texte = texteCorps($body['texte'] ?? '');
    if (trim($texte) === '') return ['statut' => 'vide'];

    $st = $db->prepare('SELECT id FROM saisons WHERE numero = ?');
    $st->execute([$numeroSaison]);
    $saisonId = $st->fetchColumn();
    if (!$saisonId) {
        $couleurs = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6'];
        $nom = nomNiveau(projetDemande() ?? '', $numeroSaison);
        $db->prepare('INSERT INTO saisons (numero, nom, couleur) VALUES (?, ?, ?)')->execute([$numeroSaison, $nom, $couleurs[($numeroSaison - 1) % 5]]);
        $saisonId = $db->lastInsertId();
    }

    $st = $db->prepare('SELECT id, texte_episode FROM episodes WHERE saison_id = ? AND numero_episode = ?');
    $st->execute([$saisonId, $numero]);
    $episode = $st->fetch();
    if ($episode && trim((string)$episode['texte_episode']) !== '') return ['statut' => 'existe', 'id' => (int)$episode['id']];
    $id = $episode ? (int)$episode['id'] : createEpisode($db, ['saison_id' => (int)$saisonId, 'numero_episode' => $numero, 'titre' => texteCorps($body['titre'] ?? '')]);

    ob_start();
    handleUpload($db, ['episode_id' => $id, 'texte' => $texte]);
    $stats = json_decode((string)ob_get_clean(), true);
    return ['statut' => 'importe', 'id' => $id, 'repliques' => (int)($stats['nb_repliques_total'] ?? 0)];
}

function handleEcriture(PDO $db, string $resource, string $method, array $body): void {
    @set_time_limit(180);
    ini_set('memory_limit', '1024M');
    if ($resource === 'ecriture_versions') {
        echo json_encode(versionsBrouillon($db, $method, $body), JSON_UNESCAPED_UNICODE);
        return;
    }
    if ($resource === 'ecriture_extraire') {
        echo json_encode(handleExtraire($body), JSON_UNESCAPED_UNICODE);
        return;
    }
    if ($resource === 'ecriture_film_import') {
        echo json_encode(importerFilm($db, $body), JSON_UNESCAPED_UNICODE);
        return;
    }
    if ($resource === 'ecriture_film_revisions') {
        echo json_encode(revisionsFilm($db, $method, $body), JSON_UNESCAPED_UNICODE);
        return;
    }
    if ($resource === 'ecriture_export') {
        echo json_encode(handleExport($db), JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        return;
    }
    if ($resource === 'ecriture_liege') {
        $ids = array_values(array_filter(array_map('intval', explode(',', (string)($_GET['ids'] ?? '')))));
        echo json_encode($method === 'POST' ? reordonnerLiege($db, $body) : cartesLiege($db, $ids), JSON_UNESCAPED_UNICODE);
        return;
    }
    if ($resource === 'ecriture_adapter') {
        echo json_encode(adapterRoman($db), JSON_UNESCAPED_UNICODE);
        return;
    }
    if ($resource === 'ecriture_film_actes') {
        echo json_encode(recouperFilm($db, $body), JSON_UNESCAPED_UNICODE);
        return;
    }
    if (str_starts_with($resource, 'ecriture_sb')) {
        handleStoryboard($db, $resource, $method, $body);
        return;
    }
    if ($resource === 'ecriture_import') {
        echo json_encode(importerScript($db, $body), JSON_UNESCAPED_UNICODE);
        return;
    }
    if ($resource === 'ecriture_date') {
        $date = texteCorps($body['date'] ?? '');
        if ($date !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            http_response_code(422);
            echo json_encode(['error' => 'Date invalide']);
            return;
        }
        $db->prepare('UPDATE episodes SET date_diege = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$date ?: null, (int)($body['id'] ?? 0)]);
        echo json_encode(['ok' => true]);
        return;
    }
    switch ($resource) {
        case 'ecriture_data':      echo json_encode(donneesEcriture($db), JSON_UNESCAPED_UNICODE); break;
        case 'ecriture_recherche': echo json_encode(rechercheEcriture($db), JSON_UNESCAPED_UNICODE); break;
        case 'ecriture_scene':     echo json_encode(sceneEcriture($db), JSON_UNESCAPED_UNICODE); break;
        case 'ecriture_perso':     echo json_encode(dernieresRepliques($db), JSON_UNESCAPED_UNICODE); break;
        case 'ecriture_echange':   echo json_encode(derniersEchanges($db), JSON_UNESCAPED_UNICODE); break;
        case 'ecriture_commun':    echo json_encode(passagesCommuns($db), JSON_UNESCAPED_UNICODE); break;
        case 'ecriture_gags':      echo json_encode(gagsSuivis($db), JSON_UNESCAPED_UNICODE); break;
        case 'ecriture_episode':   echo json_encode(dialoguesEpisode($db), JSON_UNESCAPED_UNICODE); break;
        case 'ecriture_lecteurs':  echo json_encode(retoursLecteurs($db), JSON_UNESCAPED_UNICODE); break;
        case 'ecriture_roman':     echo json_encode(chapitresRoman($db), JSON_UNESCAPED_UNICODE); break;
        case 'ecriture_film':      echo json_encode(sequencesFilm($db), JSON_UNESCAPED_UNICODE); break;
        case 'ecriture_bd':        echo json_encode(planchesBD($db), JSON_UNESCAPED_UNICODE); break;
        case 'ecriture_continuite': echo json_encode(continuite($db), JSON_UNESCAPED_UNICODE); break;
        case 'ecriture_theatre':   echo json_encode(donneesTheatre($db), JSON_UNESCAPED_UNICODE); break;
        case 'ecriture_pub':       echo json_encode(donneesPub($db), JSON_UNESCAPED_UNICODE); break;
        case 'ecriture_jeu':       echo json_encode(analyseJeu($db), JSON_UNESCAPED_UNICODE); break;
        case 'ecriture_depouillement': echo json_encode(depouillementSerie($db), JSON_UNESCAPED_UNICODE); break;
        default:
            http_response_code(404);
            echo json_encode(['error' => 'Route non trouvée']);
    }
}

// Même lecture que analyserTexte(), mais en gardant le texte et l'ordre des répliques
function lireLignesEpisode(string $texte): array {
    $texte = normaliserScript($texte);
    $texte = preg_replace('/\/\*.*?\*\//s', '', $texte);
    if (preg_match('/^(INT\.|EXT\.|INT |EXT )/im', $texte, $m, PREG_OFFSET_CAPTURE)) {
        $texte = substr($texte, $m[0][1]);
    }

    $scenes = [['', '']];
    $lignes = [];
    $courant = null;
    $ouvert = false;
    $nomEnCapitales = '/^([A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ][A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ\s\'\-\d]{0,35})(\s*\(.*\))?$/u';

    foreach (explode("\n", $texte) as $ligne) {
        $ligne = trim($ligne);
        if ($ligne === '') { if ($ouvert) $courant = null; $ouvert = false; continue; }

        if (preg_match('/^(INT\.|EXT\.|INT |EXT |INT$|EXT$)/iu', $ligne) || preg_match('/^[-=]{3,}\s*$/', $ligne)) {
            $scenes[] = [$ligne, extraireLieuSlugline($ligne)];
            $courant = null;
            $ouvert = false;
            continue;
        }
        if (preg_match('/^\(.*\)$/', $ligne)) continue;

        $scene = count($scenes) - 1;
        if (preg_match($nomEnCapitales, $ligne, $m)) {
            $nom = trim($m[1]);
            if (!estFauxPersonnage($nom)) {
                $courant = $nom;
                $ouvert = false;
                continue;
            }
            if ($courant === null || estTransition($ligne)) {
                $courant = null;
                $lignes[] = [$scene, null, $ligne];
                $ouvert = false;
                continue;
            }
        }
        if (preg_match('/^([A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ][A-Za-zÀ-ÿ\s\-\']{0,25})\s*:\s*(.+)/u', $ligne, $m) && estNomEnLigne(trim($m[1]))) {
            $lignes[] = [$scene, trim($m[1]), trim($m[2])];
            $courant = null;
            $ouvert = false;
            continue;
        }
        if ($courant === null) {
            $lignes[] = [$scene, null, $ligne];
            continue;
        }
        if (estTransition($ligne)) {
            $lignes[] = [$scene, null, $ligne];
            $courant = null;
            $ouvert = false;
            continue;
        }
        if ($ouvert) {
            $lignes[count($lignes) - 1][2] .= ' ' . $ligne;
        } else {
            $lignes[] = [$scene, $courant, $ligne];
            $ouvert = true;
        }
    }
    return ['scenes' => $scenes, 'lignes' => $lignes];
}

function texteDesRepliques(string $script): string {
    return implode("\n", array_map(fn($l) => $l[2], array_filter(lireLignesEpisode($script)['lignes'], fn($l) => $l[1] !== null)));
}

// Seuls les épisodes dont le script a changé sont relus
function lignesEcriture(PDO $db): array {
    $chemin = dirname(DB_PATH) . '/ecriture-lignes.json';
    $ancien = is_file($chemin) ? (json_decode((string)file_get_contents($chemin), true) ?: []) : [];
    $regles = md5('v2' . json_encode(reglesNoms()) . empreinteProse());
    $resultat = [];
    $change = false;

    $episodes = $db->query("
        SELECT e.id, e.numero_episode, e.titre, e.texte_episode, s.numero AS saison
        FROM episodes e JOIN saisons s ON s.id = e.saison_id
        WHERE TRIM(COALESCE(e.texte_episode, '')) <> ''
        ORDER BY s.numero, e.numero_episode
    ")->fetchAll();

    foreach ($episodes as $e) {
        $h = md5('v4' . $regles . $e['texte_episode']);
        $id = (int)$e['id'];
        if (($ancien[$id]['h'] ?? '') === $h) {
            $lu = $ancien[$id];
        } else {
            $lu = lireLignesEpisode((string)$e['texte_episode']) + ['h' => $h];
            $change = true;
        }
        $lu['sa'] = (int)$e['saison'];
        $lu['n'] = (int)$e['numero_episode'];
        $lu['t'] = (string)$e['titre'];
        $resultat[$id] = $lu;
    }

    if ($change || count($ancien) !== count($resultat)) {
        file_put_contents($chemin, json_encode($resultat, JSON_UNESCAPED_UNICODE));
    }
    return $resultat;
}

// Les noms du script ramenés aux fiches personnages, comme dans l'Analyse
function nommeurEcriture(PDO $db): callable {
    $personnages = $db->query('SELECT * FROM personnages')->fetchAll();
    $connus = [];
    return function (string $nom) use (&$connus, $personnages): string {
        if (!isset($connus[$nom])) {
            $m = matcherPersonnageDepuisNom($nom, $personnages);
            $connus[$nom] = $m ? ($m['prenom'] ?: personnageLabel($m)) : mb_convert_case($nom, MB_CASE_TITLE, 'UTF-8');
        }
        return $connus[$nom];
    };
}

function texteComparable(string $texte): string {
    $texte = str_replace(['’', '‘'], "'", mb_strtolower($texte, 'UTF-8'));
    return normaliserMotAnalyse($texte);
}

function motsDe(string $texte): array {
    preg_match_all("/[a-z0-9]+/", texteComparable($texte), $m);
    return $m[0];
}

function donneesEcriture(PDO $db): array {
    $parEpisode = lignesEcriture($db);
    $chemin = dirname(DB_PATH) . '/ecriture-cache.json';
    $meilleurs = $db->query("SELECT id FROM episodes WHERE etat_episode = 'excellent'")->fetchAll(PDO::FETCH_COLUMN);
    $empreinte = md5('v2' . json_encode(array_column($parEpisode, 'h')) . json_encode($meilleurs));

    if (is_file($chemin)) {
        $cache = json_decode((string)file_get_contents($chemin), true);
        if (($cache['empreinte'] ?? '') === $empreinte) return $cache;
    }

    $nommer = nommeurEcriture($db);
    $eps = [];
    foreach ($parEpisode as $id => $e) {
        $echanges = [];
        $parlees = [];
        $avantGenerique = 0;
        $vuGenerique = false;
        $precedent = null;
        $scene = -1;
        foreach ($e['lignes'] as [$sc, $nom, $texte]) {
            if ($sc !== $scene) { $scene = $sc; $precedent = null; }
            if ($nom === null) {
                if (preg_match('/^G[ÉE]N[ÉE]RIQUE/u', $texte)) $vuGenerique = true;
                continue;
            }
            if (!$vuGenerique) $avantGenerique += count(motsDe($texte));
            $parlees[$sc] = true;
            $label = $nommer($nom);
            if ($precedent !== null && $precedent !== $label) {
                $paire = [$precedent, $label];
                sort($paire);
                $cle = implode('|', $paire);
                $echanges[$cle] = ($echanges[$cle] ?? 0) + 1;
            }
            $precedent = $label;
        }
        $eps[$id] = ['ech' => (object)$echanges, 'ouv' => $vuGenerique ? $avantGenerique : null, 'scn' => array_keys($parlees)];
    }

    $resultat = [
        'empreinte' => $empreinte, 'eps' => (object)$eps, 'meilleurs' => array_map('intval', $meilleurs),
        'echos' => detecterEchos($parEpisode, $nommer), 'repetitions' => detecterRepetitions($parEpisode),
    ];
    file_put_contents($chemin, json_encode($resultat, JSON_UNESCAPED_UNICODE));
    return $resultat;
}

// Les phrases identiques qui reviennent d'un épisode à l'autre
function detecterEchos(array $parEpisode, callable $nommer): array {
    $stop = array_flip(explode(' ', ANALYSE_VOIX_STOP));
    $phrases = [];
    foreach ($parEpisode as $id => $e) {
        foreach ($e['lignes'] as [, $nom, $texte]) {
            if ($nom === null) continue;
            foreach (preg_split('/(?<=[.!?…])\s+/u', $texte) as $phrase) {
                $mots = motsDe($phrase);
                $nb = count($mots);
                if ($nb < 3 || $nb > 12) continue;
                if (!array_filter($mots, fn($m) => strlen($m) >= 4 && !isset($stop[$m]))) continue;
                $cle = implode(' ', $mots);
                $phrases[$cle]['eps'][$id] = ($phrases[$cle]['eps'][$id] ?? 0) + 1;
                $phrases[$cle]['formes'][trim($phrase)] = ($phrases[$cle]['formes'][trim($phrase)] ?? 0) + 1;
                $label = $nommer($nom);
                $phrases[$cle]['qui'][$label] = ($phrases[$cle]['qui'][$label] ?? 0) + 1;
            }
        }
    }
    $phrases = array_filter($phrases, fn($p) => count($p['eps']) >= ECRITURE_ECHOS_EPISODES_MIN);
    uasort($phrases, fn($a, $b) => count($b['eps']) <=> count($a['eps']));

    $echos = [];
    foreach (array_slice($phrases, 0, ECRITURE_ECHOS_MAX, true) as $p) {
        arsort($p['formes']);
        arsort($p['qui']);
        $echos[] = ['t' => (string)array_key_first($p['formes']), 'eps' => array_map('intval', array_keys($p['eps'])), 'n' => array_sum($p['eps']), 'qui' => array_slice(array_keys($p['qui']), 0, 3)];
    }
    return $echos;
}

// Les épisodes qui partagent de longues suites de mots identiques
function detecterRepetitions(array $parEpisode): array {
    $suites = [];
    $tailles = [];
    foreach ($parEpisode as $id => $e) {
        $mots = [];
        foreach ($e['lignes'] as [, $nom, $texte]) {
            if ($nom !== null) array_push($mots, ...motsDe($texte));
        }
        $vues = [];
        for ($i = 0, $fin = count($mots) - ECRITURE_SUITE_MOTS; $i <= $fin; $i++) {
            $vues[crc32(implode(' ', array_slice($mots, $i, ECRITURE_SUITE_MOTS)))] = true;
        }
        $tailles[$id] = count($vues);
        foreach ($vues as $h => $_) $suites[$h][] = $id;
    }

    $paires = [];
    foreach ($suites as $ids) {
        $nb = count($ids);
        if ($nb < 2 || $nb > ECRITURE_SUITE_EPISODES_MAX) continue;
        for ($i = 0; $i < $nb; $i++) {
            for ($j = $i + 1; $j < $nb; $j++) {
                $cle = $ids[$i] . '|' . $ids[$j];
                $paires[$cle] = ($paires[$cle] ?? 0) + 1;
            }
        }
    }
    arsort($paires);

    $liste = [];
    foreach ($paires as $cle => $nb) {
        if ($nb < ECRITURE_REPETITION_MIN || count($liste) >= 150) break;
        [$a, $b] = array_map('intval', explode('|', (string)$cle));
        $liste[] = ['a' => $a, 'b' => $b, 'n' => $nb, 'pct' => round(($nb * 100) / max(1, min($tailles[$a], $tailles[$b])), 1)];
    }
    return $liste;
}

// Copies du brouillon : à part des notes, pour ne pas alourdir leur chargement
function versionsBrouillon(PDO $db, string $method, array $body): array {
    $db->exec('CREATE TABLE IF NOT EXISTS brouillon_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, episode_id INTEGER NOT NULL, texte TEXT NOT NULL,
        motif TEXT NOT NULL, mots INTEGER NOT NULL, cree_le TEXT NOT NULL DEFAULT (datetime(\'now\', \'localtime\'))
    )');
    if ($method === 'POST') {
        $id = (int)($body['episode_id'] ?? 0);
        $texte = texteCorps($body['texte'] ?? '');
        $st = $db->prepare('SELECT texte FROM brouillon_versions WHERE episode_id = ? ORDER BY id DESC LIMIT 1');
        $st->execute([$id]);
        if (!$id || trim($texte) === '' || $st->fetchColumn() === $texte) return ['ok' => false];
        $db->prepare('INSERT INTO brouillon_versions (episode_id, texte, motif, mots) VALUES (?, ?, ?, ?)')
            ->execute([$id, $texte, texteCorps($body['motif'] ?? ''), count(motsDe($texte))]);
        $db->prepare('DELETE FROM brouillon_versions WHERE episode_id = ? AND id NOT IN (SELECT id FROM brouillon_versions WHERE episode_id = ? ORDER BY id DESC LIMIT 30)')
            ->execute([$id, $id]);
        return ['ok' => true];
    }
    if (isset($_GET['id'])) {
        $st = $db->prepare('SELECT texte FROM brouillon_versions WHERE id = ?');
        $st->execute([(int)$_GET['id']]);
        return ['texte' => (string)$st->fetchColumn()];
    }
    $st = $db->prepare('SELECT id, motif, mots, cree_le FROM brouillon_versions WHERE episode_id = ? ORDER BY id DESC');
    $st->execute([(int)($_GET['episode'] ?? 0)]);
    return $st->fetchAll();
}

// La portée demandée par l'onglet : une liste d'épisodes, ou tous si elle est absente
function episodesDemandes(): ?array {
    if (!isset($_GET['ids'])) return null;
    return array_flip(array_map('intval', array_filter(explode(',', (string)$_GET['ids']), 'is_numeric')));
}

function rechercheEcriture(PDO $db): array {
    $q = texteComparable(trim((string)($_GET['q'] ?? '')));
    $perso = trim((string)($_GET['perso'] ?? ''));
    $saison = (int)($_GET['saison'] ?? 0);
    $lieu = texteComparable(trim((string)($_GET['lieu'] ?? '')));
    $action = !empty($_GET['action']);
    $limite = min(500, max(1, (int)($_GET['limite'] ?? 200)));
    if ($q === '' && $perso === '') return ['total' => 0, 'resultats' => []];

    $nommer = nommeurEcriture($db);
    $portee = episodesDemandes();
    $total = 0;
    $resultats = [];
    foreach (lignesEcriture($db) as $id => $e) {
        if ($saison && $e['sa'] !== $saison) continue;
        if ($portee !== null && !isset($portee[$id])) continue;
        foreach ($e['lignes'] as $i => [$sc, $nom, $texte]) {
            if ($nom === null && !$action) continue;
            $label = $nom === null ? '' : $nommer($nom);
            if ($perso !== '' && $label !== $perso) continue;
            if ($lieu !== '' && !str_contains(texteComparable((string)$e['scenes'][$sc][1]), $lieu)) continue;
            if ($q !== '' && !str_contains(texteComparable($texte), $q)) continue;
            if (++$total > $limite) continue;
            $resultats[] = ['id' => $id, 'sa' => $e['sa'], 'n' => $e['n'], 't' => $e['t'], 'sc' => $sc, 'slug' => $e['scenes'][$sc][0], 'qui' => $label, 'texte' => $texte];
        }
    }
    return ['total' => $total, 'resultats' => $resultats];
}

function sceneEcriture(PDO $db): array {
    $e = lignesEcriture($db)[(int)($_GET['episode'] ?? 0)] ?? null;
    $sc = (int)($_GET['scene'] ?? 0);
    if (!$e || !isset($e['scenes'][$sc])) return ['slug' => '', 'lignes' => []];
    $nommer = nommeurEcriture($db);
    $lignes = [];
    foreach ($e['lignes'] as [$s, $nom, $texte]) {
        if ($s === $sc) $lignes[] = ['qui' => $nom === null ? '' : $nommer($nom), 'texte' => $texte];
    }
    return ['sa' => $e['sa'], 'n' => $e['n'], 't' => $e['t'], 'slug' => $e['scenes'][$sc][0], 'lignes' => $lignes];
}

function dialoguesEpisode(PDO $db): array {
    $e = lignesEcriture($db)[(int)($_GET['episode'] ?? 0)] ?? null;
    if (!$e) return [];
    $nommer = nommeurEcriture($db);
    $lignes = [];
    foreach ($e['lignes'] as [, $nom, $texte]) {
        if ($nom !== null) $lignes[] = ['qui' => $nommer($nom), 'texte' => $texte, 'mots' => count(motsDe($texte))];
    }
    return $lignes;
}

function retoursLecteurs(PDO $db): array {
    $id = (int)($_GET['episode'] ?? 0);
    $st = $db->prepare("
        SELECT l.nom, le.note, le.commentaire, NULL AS critere FROM lecteur_episodes le JOIN lecteurs l ON l.id = le.lecteur_id
        WHERE le.episode_id = ? AND (le.note IS NOT NULL OR TRIM(COALESCE(le.commentaire, '')) <> '')
        UNION ALL
        SELECT l.nom, NULL, c.commentaire, c.critere FROM lecteur_episode_critiques c JOIN lecteurs l ON l.id = c.lecteur_id
        WHERE c.episode_id = ?
    ");
    $st->execute([$id, $id]);
    return $st->fetchAll();
}

// Parcourt les épisodes du plus récent au plus ancien, en s'arrêtant avant l'épisode indiqué
function episodesAvant(PDO $db): array {
    $tous = lignesEcriture($db);
    $portee = episodesDemandes();
    if ($portee !== null) $tous = array_intersect_key($tous, $portee);
    $avant = (int)($_GET['avant'] ?? 0);
    if ($avant) {
        $ids = array_keys($tous);
        $pos = array_search($avant, $ids, true);
        if ($pos !== false) $tous = array_slice($tous, 0, $pos, true);
    }
    return array_reverse($tous, true);
}

function dernieresRepliques(PDO $db): array {
    $cible = (string)($_GET['nom'] ?? '');
    $nommer = nommeurEcriture($db);
    $resultat = [];
    foreach (episodesAvant($db) as $id => $e) {
        foreach (array_reverse($e['lignes']) as [$sc, $nom, $texte]) {
            if ($nom === null || $nommer($nom) !== $cible) continue;
            $resultat[] = ['id' => $id, 'sa' => $e['sa'], 'n' => $e['n'], 'sc' => $sc, 'slug' => $e['scenes'][$sc][0], 'texte' => $texte];
            if (count($resultat) >= 8) return $resultat;
        }
    }
    return $resultat;
}

function derniersEchanges(PDO $db): array {
    $paire = [(string)($_GET['a'] ?? ''), (string)($_GET['b'] ?? '')];
    $nommer = nommeurEcriture($db);
    $resultat = [];
    foreach (episodesAvant($db) as $id => $e) {
        $lignes = $e['lignes'];
        for ($i = count($lignes) - 1; $i > 0; $i--) {
            [$sc, $nom, $texte] = $lignes[$i];
            [$scAvant, $nomAvant, $texteAvant] = $lignes[$i - 1];
            if ($nom === null || $nomAvant === null || $sc !== $scAvant) continue;
            $qui = [$nommer($nomAvant), $nommer($nom)];
            if ($qui[0] === $qui[1] || !in_array($qui[0], $paire, true) || !in_array($qui[1], $paire, true)) continue;
            $resultat[] = ['id' => $id, 'sa' => $e['sa'], 'n' => $e['n'], 'sc' => $sc, 'lignes' => [[$qui[0], $texteAvant], [$qui[1], $texte]]];
            $i--;
            if (count($resultat) >= 5) return $resultat;
        }
    }
    return $resultat;
}

function passagesCommuns(PDO $db): array {
    $tous = lignesEcriture($db);
    $a = $tous[(int)($_GET['a'] ?? 0)] ?? null;
    $b = $tous[(int)($_GET['b'] ?? 0)] ?? null;
    if (!$a || !$b) return [];
    $nommer = nommeurEcriture($db);
    $dansB = [];
    foreach ($b['lignes'] as [, $nom, $texte]) {
        if ($nom !== null && count(motsDe($texte)) >= 4) $dansB[implode(' ', motsDe($texte))] = true;
    }
    $communs = [];
    foreach ($a['lignes'] as [, $nom, $texte]) {
        if ($nom !== null && isset($dansB[implode(' ', motsDe($texte))])) $communs[] = ['qui' => $nommer($nom), 'texte' => $texte];
    }
    return array_slice($communs, 0, 60);
}

// Un décor sans fiche se reconnaît à son nom, sans article ni « de »
function cleDecor(string $lieu): string {
    $lieu = mb_strtoupper(trim($lieu), 'UTF-8');
    $lieu = preg_replace("/^(LE |LA |LES |L['’])/u", '', $lieu);
    $lieu = preg_replace("/(?<![\\p{L}])(DE |DU |DES |D['’])/u", '', $lieu);
    return trim(preg_replace('/\s+/u', ' ', $lieu));
}

// Ce que chaque épisode demande au tournage, dans l'ordre de la série pour repérer les décors nouveaux
function depouillementSerie(PDO $db): array {
    $fiches = $db->query('SELECT id, nom FROM lieux')->fetchAll(PDO::FETCH_KEY_PAIR);
    $nommer = nommeurEcriture($db);
    $scenes = $db->query("
        SELECT sc.episode_id, sc.lieu_raw, sc.slugline, sc.persos_json, sc.lieux_detectes_json
        FROM episode_stat_scenes sc
        JOIN episodes e ON e.id = sc.episode_id
        JOIN saisons sa ON sa.id = e.saison_id
        ORDER BY sa.numero, e.numero_episode, sc.scene_index
    ")->fetchAll();
    $eps = [];
    $vus = [];
    foreach ($scenes as $s) {
        $id = (int)$s['episode_id'];
        $eps[$id] ??= ['sc' => 0, 'ch' => 0, 'e' => 0, 'd' => [], 'r' => [], 'avant' => null];
        $e = &$eps[$id];
        $e['sc']++;
        if (stripos(ltrim((string)$s['slugline']), 'EXT') === 0) $e['e']++;
        $ids = array_values(array_filter(json_decode($s['lieux_detectes_json'] ?? '[]', true) ?: [], fn($l) => isset($fiches[$l])));
        $brut = trim((string)$s['lieu_raw']);
        $lieux = [];
        foreach ($ids as $l) $lieux["f$l"] = $fiches[$l];
        if (!$lieux && cleDecor($brut) !== '') $lieux[cleDecor($brut)] = mb_strtoupper(mb_substr($brut, 0, 1)) . mb_strtolower(mb_substr($brut, 1));
        foreach ($lieux as $cle => $nom) {
            if (!isset($e['d'][$cle])) {
                $e['d'][$cle] = ['nom' => $nom, 'n' => 0, 'nouveau' => !isset($vus[$cle])];
                $vus[$cle] = true;
            }
            $e['d'][$cle]['n']++;
        }
        $ici = implode('|', array_keys($lieux));
        if ($e['avant'] !== null && $e['avant'] !== $ici) $e['ch']++;
        $e['avant'] = $ici;
        foreach (json_decode($s['persos_json'] ?? '[]', true) ?: [] as $p) $e['r'][$nommer($p)] = true;
        unset($e);
    }
    foreach ($eps as &$e) {
        unset($e['avant']);
        $e['d'] = array_values($e['d']);
        usort($e['d'], fn($a, $b) => $b['n'] <=> $a['n']);
        $e['r'] = array_keys($e['r']);
        sort($e['r']);
    }
    return $eps;
}

// Les gags suivis par l'auteur, retrouvés dans tous les dialogues
function gagsSuivis(PDO $db): array {
    ensureAnalyseNotes($db);
    $st = $db->query("SELECT cle, valeur FROM analyse_notes WHERE cle LIKE 'gag:%' ORDER BY cle");
    $gags = [];
    foreach ($st->fetchAll() as $r) {
        $texte = substr($r['cle'], 4);
        $gags[] = ['t' => $texte, 'statut' => $r['valeur'], 'cherche' => texteComparable($texte), 'eps' => []];
    }
    if (!$gags) return [];
    foreach (lignesEcriture($db) as $id => $e) {
        foreach ($e['lignes'] as [, $nom, $texte]) {
            if ($nom === null) continue;
            $ligne = texteComparable($texte);
            foreach ($gags as &$g) {
                if (str_contains($ligne, $g['cherche'])) $g['eps'][$id] = ($g['eps'][$id] ?? 0) + 1;
            }
            unset($g);
        }
    }
    return array_map(fn($g) => ['t' => $g['t'], 'statut' => $g['statut'], 'eps' => array_map('intval', array_keys($g['eps'])), 'n' => array_sum($g['eps'])], $gags);
}
