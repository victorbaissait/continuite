<?php
// api/cartes.php — Cartes des lieux (une image, ou un monde inventé) et graphe de qui parle à qui

const CARTE_IMAGE_MAX = 12 * 1024 * 1024;
const CARTE_TYPES_IMAGE = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'webp' => 'image/webp'];
const CARTE_MONDE_MAX = 4 * 1024 * 1024;

function dossierCartes(): string {
    $dossier = dirname(DB_PATH) . '/cartes';
    if (!is_dir($dossier)) mkdir($dossier, 0775, true);
    return $dossier;
}

function lireNoteJson(PDO $db, string $cle): ?array {
    $st = $db->prepare('SELECT valeur FROM analyse_notes WHERE cle = ?');
    $st->execute([$cle]);
    $v = json_decode((string)$st->fetchColumn(), true);
    return is_array($v) ? $v : null;
}

function ecrireNoteJson(PDO $db, string $cle, ?array $valeur): void {
    if ($valeur === null) {
        $db->prepare('DELETE FROM analyse_notes WHERE cle = ?')->execute([$cle]);
        return;
    }
    $db->prepare('INSERT OR REPLACE INTO analyse_notes (cle, valeur) VALUES (?, ?)')->execute([$cle, json_encode($valeur, JSON_UNESCAPED_UNICODE)]);
}

// La liste des cartes, nettoyée : une note abîmée ou écrite à la main ne fait rien planter
function lireCartes(PDO $db): array {
    $brut = lireNoteJson($db, 'cartes')['cartes'] ?? [];
    $cartes = [];
    foreach (is_array($brut) ? $brut : [] as $c) {
        if (!is_array($c) || !preg_match('/^c[a-f0-9]{8}$/', (string)($c['id'] ?? ''))) continue;
        $epingles = [];
        foreach ((array)($c['epingles'] ?? []) as $cle => $p) {
            if (!preg_match('/^[le]:\d+$/', (string)$cle) || !is_array($p)) continue;
            $epingles[$cle] = ['x' => max(0, min(1, (float)($p['x'] ?? 0))), 'y' => max(0, min(1, (float)($p['y'] ?? 0)))];
            // Une épingle peut ouvrir le plan détaillé de son lieu
            if (preg_match('/^c[a-f0-9]{8}$/', (string)($p['sous'] ?? '')) && $p['sous'] !== $c['id']) $epingles[$cle]['sous'] = $p['sous'];
        }
        $fichier = (string)($c['fichier'] ?? '');
        $cartes[] = [
            'id' => $c['id'],
            'nom' => mb_substr(texteCorps($c['nom'] ?? ''), 0, 60) ?: 'Carte',
            'fichier' => preg_match('/^carte-[a-f0-9]{8}-[a-f0-9]{8}\.(png|jpg|webp)$/', $fichier) ? $fichier : null,
            'monde' => !empty($c['monde']),
            'epingles' => (object)$epingles,
        ];
    }
    return $cartes;
}

function ecrireCartes(PDO $db, array $cartes): void {
    ecrireNoteJson($db, 'cartes', ['cartes' => array_values($cartes)]);
}

// Ce qu'on peut épingler : les décors, et les lieux d'un jeu (qui sont ses unités d'écriture)
function placesCartes(PDO $db): array {
    $places = [];
    foreach ($db->query('SELECT id, nom, nom_affichage, est_principal FROM lieux ORDER BY est_principal DESC, nom')->fetchAll() as $l) {
        $places[] = ['cle' => 'l:' . $l['id'], 'nom' => (string)$l['nom'], 'type' => 'decor', 'principal' => (int)$l['est_principal'] === 1];
    }
    if (PROJET_TYPE === 'jeu') {
        foreach ($db->query('SELECT e.id, e.titre, e.numero_episode, s.numero FROM episodes e JOIN saisons s ON s.id = e.saison_id ORDER BY s.numero, e.numero_episode')->fetchAll() as $e) {
            $places[] = ['cle' => 'e:' . $e['id'], 'nom' => trim((string)$e['titre']) ?: 'Lieu ' . $e['numero_episode'], 'type' => 'jeu', 'principal' => false];
        }
    }
    return $places;
}

// Les noms des répliques sont en capitales : on retrouve la fiche pour le prénom et la couleur
function fichesParNom(PDO $db): array {
    $fiches = [];
    $plat = 'cleNomCarte';
    foreach ($db->query('SELECT prenom, nom, nom_affichage, couleur_identite, est_principal FROM personnages')->fetchAll() as $p) {
        $fiche = ['nom' => trim((string)($p['prenom'] ?: $p['nom_affichage'])), 'couleur' => (string)$p['couleur_identite'], 'principal' => (int)$p['est_principal'] === 1];
        foreach ([trim($p['prenom'] . ' ' . $p['nom']), $p['prenom'], $p['nom_affichage']] as $alias) {
            if ($plat($alias) !== '' && !isset($fiches[$plat($alias)])) $fiches[$plat($alias)] = $fiche;
        }
    }
    return $fiches;
}

// Les espaces fines ou insécables collées aux noms ne doivent pas créer un second personnage
function cleNomCarte($s): string {
    return mb_strtoupper(trim((string)preg_replace('/[\s\x{00A0}\x{2000}-\x{200B}\x{202F}\x{FEFF}]+/u', ' ', (string)$s)));
}

function nomAffiche(array $fiches, string $brut): array {
    $cle = cleNomCarte($brut);
    if (isset($fiches[$cle])) return $fiches[$cle];
    return ['nom' => mb_convert_case(mb_strtolower($cle), MB_CASE_TITLE), 'couleur' => '', 'principal' => false];
}

// Pour une saison (0 : toutes), les scènes jouées dans chaque lieu, qui y va, et le trajet de chacun
function scenesCartes(PDO $db, int $saison): array {
    $fiches = fichesParNom($db);
    $sql = 'SELECT sc.episode_id, sc.scene_index, sc.slugline, sc.persos_json, sc.lieux_detectes_json, e.code, e.titre, e.numero_episode, s.numero AS saison
            FROM episode_stat_scenes sc JOIN episodes e ON e.id = sc.episode_id JOIN saisons s ON s.id = e.saison_id'
        . ($saison > 0 ? ' WHERE s.numero = ?' : '') . ' ORDER BY s.numero, e.numero_episode, sc.scene_index';
    $st = $db->prepare($sql);
    $st->execute($saison > 0 ? [$saison] : []);
    $lieux = [];
    $trajets = [];
    $sequence = [];
    $episodes = [];
    foreach ($st->fetchAll() as $r) {
        $persos = [];
        foreach ((array)json_decode((string)$r['persos_json'], true) as $p) if (is_string($p)) $persos[] = nomAffiche($fiches, $p)['nom'];
        $cles = [];
        foreach ((array)json_decode((string)$r['lieux_detectes_json'], true) as $id) if (is_numeric($id)) $cles[] = 'l:' . (int)$id;
        if (PROJET_TYPE === 'jeu') $cles[] = 'e:' . $r['episode_id'];
        $code = trim((string)$r['code']) ?: sprintf('S%02dE%02d', $r['saison'], $r['numero_episode']);
        // Scène par scène, pour rejouer un épisode sur la carte et repérer les trajets impossibles
        $episodes[(int)$r['episode_id']] ??= ['id' => (int)$r['episode_id'], 'code' => $code, 'titre' => (string)$r['titre']];
        $sequence[] = [(int)$r['episode_id'], (int)$r['scene_index'], (string)$r['slugline'], array_values(array_unique($cles)), array_values(array_unique($persos))];
        foreach (array_unique($cles) as $cle) {
            $lieux[$cle] ??= ['scenes' => [], 'persos' => []];
            $lieux[$cle]['scenes'][] = ['episode_id' => (int)$r['episode_id'], 'scene' => (int)$r['scene_index'], 'code' => $code, 'titre' => (string)$r['titre'], 'slugline' => (string)$r['slugline']];
            foreach ($persos as $p) $lieux[$cle]['persos'][$p] = ($lieux[$cle]['persos'][$p] ?? 0) + 1;
            foreach ($persos as $p) {
                // Un trajet ne note qu'un changement de lieu, pas deux scènes de suite au même endroit
                $dernier = $trajets[$p] ?? [];
                if (end($dernier) !== $cle) $trajets[$p][] = $cle;
            }
        }
    }
    foreach ($lieux as &$l) arsort($l['persos']);
    unset($l);
    return ['lieux' => (object)$lieux, 'trajets' => (object)$trajets, 'sequence' => $sequence, 'episodes' => array_values($episodes)];
}

// Qui parle à qui, épisode par épisode : le navigateur additionne la période choisie (saisons, épisodes)
// noeuds : [épisode, nom, répliques] ; liens : [épisode, a, b, répliques des scènes partagées, scènes]
function grapheRelations(PDO $db): array {
    $fiches = fichesParNom($db);
    $saisons = array_map(fn($s) => ['numero' => (int)$s['numero'], 'nom' => (string)$s['nom']], $db->query('SELECT numero, nom FROM saisons ORDER BY numero')->fetchAll());
    $episodes = [];
    foreach ($db->query('SELECT e.id, e.numero_episode, e.code, e.titre, s.numero AS saison FROM episodes e JOIN saisons s ON s.id = e.saison_id ORDER BY s.numero, e.numero_episode, e.id')->fetchAll() as $e) {
        $episodes[] = ['id' => (int)$e['id'], 'saison' => (int)$e['saison'], 'n' => (int)$e['numero_episode'], 'code' => trim((string)$e['code']) ?: sprintf('S%02dE%02d', $e['saison'], $e['numero_episode']), 'titre' => (string)$e['titre']];
    }
    $personnages = [];
    $noeuds = [];
    $somme = [];
    foreach ($db->query('SELECT episode_id, nom, nb_repliques FROM episode_stat_personnages WHERE nb_repliques > 0')->fetchAll() as $n) {
        $f = nomAffiche($fiches, (string)$n['nom']);
        $cle = $n['episode_id'] . '|' . $f['nom'];
        $somme[$cle] = ($somme[$cle] ?? 0) + (int)$n['nb_repliques'];
        $personnages[$f['nom']] = ['nom' => $f['nom'], 'couleur' => $f['couleur'], 'principal' => $f['principal']];
    }
    foreach ($somme as $cle => $rep) {
        [$ep, $nom] = explode('|', $cle, 2);
        $noeuds[] = [(int)$ep, $nom, $rep];
    }
    $paires = [];
    foreach ($db->query("SELECT episode_id, membres_json, nb_repliques, nb_scenes FROM episode_stat_copresences WHERE type = 'personnages' AND taille = 2")->fetchAll() as $l) {
        $m = json_decode((string)$l['membres_json'], true);
        if (!is_array($m) || count($m) !== 2) continue;
        $a = nomAffiche($fiches, (string)$m[0])['nom'];
        $b = nomAffiche($fiches, (string)$m[1])['nom'];
        if ($a === $b) continue;
        [$a, $b] = strcmp($a, $b) < 0 ? [$a, $b] : [$b, $a];
        $cle = $l['episode_id'] . "|$a|$b";
        $paires[$cle] ??= [(int)$l['episode_id'], $a, $b, 0, 0];
        $paires[$cle][3] += (int)$l['nb_repliques'];
        $paires[$cle][4] += (int)$l['nb_scenes'];
    }
    // Dans combien de scènes de chaque épisode chacun apparaît : pour repérer ceux qu'on oublie
    $presences = [];
    $nbScenes = [];
    foreach ($db->query('SELECT episode_id, persos_json FROM episode_stat_scenes')->fetchAll() as $r) {
        $ep = (int)$r['episode_id'];
        $nbScenes[$ep] = ($nbScenes[$ep] ?? 0) + 1;
        $vus = [];
        foreach ((array)json_decode((string)$r['persos_json'], true) as $p) if (is_string($p)) $vus[nomAffiche($fiches, $p)['nom']] = true;
        foreach (array_keys($vus) as $nom) $presences["$ep|$nom"] = ($presences["$ep|$nom"] ?? 0) + 1;
    }
    foreach ($episodes as &$e) $e['scenes'] = $nbScenes[$e['id']] ?? 0;
    unset($e);
    $presences = array_map(function ($cle, $n) { [$ep, $nom] = explode('|', $cle, 2); return [(int)$ep, $nom, $n]; }, array_keys($presences), $presences);
    return ['saisons' => $saisons, 'episodes' => $episodes, 'noeuds' => $noeuds, 'liens' => array_values($paires), 'personnages' => array_values($personnages), 'presences' => $presences];
}

// La frise et les familles d'un monde inventé, nettoyées : rien d'écrit à la main ne fait planter le dessin
function lireHistoire($brut): array {
    $brut = is_array($brut) ? $brut : [];
    $idOk = fn($v) => is_string($v) && preg_match('/^[a-z0-9]{1,12}$/', $v);
    $an = fn($v) => is_numeric($v) ? max(-100000, min(100000, (int)$v)) : null;
    $evenements = [];
    foreach (array_slice(is_array($brut['evenements'] ?? null) ? $brut['evenements'] : [], 0, 300) as $e) {
        if (!is_array($e) || !$idOk($e['id'] ?? null) || $an($e['an'] ?? null) === null) continue;
        $evenements[] = [
            'id' => $e['id'], 'an' => $an($e['an']),
            'titre' => mb_substr(trim(texteCorps($e['titre'] ?? '')), 0, 120) ?: 'Événement',
            'texte' => mb_substr(texteCorps($e['texte'] ?? ''), 0, 2000),
            'lieu' => preg_match('/^[rvn]:[a-z0-9]{1,12}$/', texteCorps($e['lieu'] ?? '')) ? $e['lieu'] : '',
        ];
    }
    usort($evenements, fn($a, $b) => $a['an'] <=> $b['an']);
    $gens = [];
    foreach (array_slice(is_array($brut['gens'] ?? null) ? $brut['gens'] : [], 0, 200) as $g) {
        if (!is_array($g) || !$idOk($g['id'] ?? null) || isset($gens[$g['id']])) continue;
        $gens[$g['id']] = [
            'id' => $g['id'],
            'nom' => mb_substr(trim(texteCorps($g['nom'] ?? '')), 0, 60) ?: 'Sans nom',
            'perso' => mb_substr(trim(texteCorps($g['perso'] ?? '')), 0, 60),
            'parents' => array_values(array_unique(array_filter(is_array($g['parents'] ?? null) ? $g['parents'] : [], $idOk))),
            'conjoint' => $idOk($g['conjoint'] ?? null) ? $g['conjoint'] : '',
            'naissance' => $an($g['naissance'] ?? null),
            'mort' => $an($g['mort'] ?? null),
            'royaume' => preg_match('/^r:[a-z0-9]{1,12}$/', texteCorps($g['royaume'] ?? '')) ? $g['royaume'] : '',
        ];
    }
    // Pas de parent inconnu, pas d'ancêtre de soi-même : l'arbre doit pouvoir se dessiner
    foreach ($gens as $id => &$g) {
        $g['parents'] = array_slice(array_values(array_filter($g['parents'], fn($p) => $p !== $id && isset($gens[$p]))), 0, 2);
        if ($g['conjoint'] === $id || !isset($gens[$g['conjoint']])) $g['conjoint'] = '';
    }
    unset($g);
    $ancetre = function (string $de, string $cherche, int $prof = 0) use (&$ancetre, &$gens): bool {
        if ($prof > 60) return true;
        foreach ($gens[$de]['parents'] as $p) if ($p === $cherche || $ancetre($p, $cherche, $prof + 1)) return true;
        return false;
    };
    foreach ($gens as $id => &$g) $g['parents'] = array_values(array_filter($g['parents'], fn($p) => !$ancetre($p, $id)));
    unset($g);
    return ['evenements' => $evenements, 'gens' => array_values($gens)];
}

function handleCartes(PDO $db, string $method, array $parts, array $body): void {
    $sous = $parts[1] ?? '';
    $erreur = function (string $message, int $code = 400): void {
        http_response_code($code);
        echo json_encode(['error' => $message]);
    };

    if ($method === 'GET') {
        if ($sous === 'image') {
            $f = (string)($_GET['f'] ?? '');
            $chemin = dossierCartes() . '/' . basename($f);
            if (!preg_match('/^carte-[a-f0-9]{8}-[a-f0-9]{8}\.(png|jpg|webp)$/', $f) || !is_file($chemin)) { $erreur('Image introuvable', 404); return; }
            header('Content-Type: ' . CARTE_TYPES_IMAGE[pathinfo($chemin, PATHINFO_EXTENSION)]);
            header('Cache-Control: private, max-age=31536000, immutable');
            readfile($chemin);
            return;
        }
        if ($sous === 'scenes') { echo json_encode(scenesCartes($db, (int)($_GET['saison'] ?? 0)), JSON_UNESCAPED_UNICODE); return; }
        if ($sous === 'encyclo') {
            $id = (string)($_GET['id'] ?? '');
            echo json_encode(preg_match('/^c[a-f0-9]{8}$/', $id) ? (lireNoteJson($db, "encyclo:$id") ?? (object)[]) : (object)[], JSON_UNESCAPED_UNICODE);
            return;
        }
        if ($sous === 'histoire') {
            $id = (string)($_GET['id'] ?? '');
            echo json_encode(lireHistoire(preg_match('/^c[a-f0-9]{8}$/', $id) ? lireNoteJson($db, "histoire:$id") : null), JSON_UNESCAPED_UNICODE);
            return;
        }
        if ($sous === 'monde') {
            $id = (string)($_GET['id'] ?? '');
            echo json_encode(preg_match('/^c[a-f0-9]{8}$/', $id) ? (lireNoteJson($db, "monde:$id") ?? (object)[]) : (object)[], JSON_UNESCAPED_UNICODE);
            return;
        }
        // Seules les saisons qui ont des scènes servent à filtrer la carte
        $saisons = $db->query('SELECT numero, nom FROM saisons s WHERE EXISTS (SELECT 1 FROM episodes e JOIN episode_stat_scenes sc ON sc.episode_id = e.id WHERE e.saison_id = s.id) ORDER BY numero')->fetchAll();
        echo json_encode(['cartes' => lireCartes($db), 'places' => placesCartes($db), 'saisons' => $saisons], JSON_UNESCAPED_UNICODE);
        return;
    }
    if ($method !== 'POST') { $erreur('Méthode non autorisée', 405); return; }
    // Deux épingles glissées coup sur coup ne doivent pas s'effacer l'une l'autre
    $db->exec('BEGIN IMMEDIATE');
    try {
        ecrireCarteAction($db, $body, $erreur);
        $db->exec('COMMIT');
    } catch (Throwable $e) {
        $db->exec('ROLLBACK');
        throw $e;
    }
}

function ecrireCarteAction(PDO $db, array $body, callable $erreur): void {
    $cartes = lireCartes($db);
    $action = texteCorps($body['action'] ?? '');
    $id = texteCorps($body['id'] ?? '');
    $index = null;
    foreach ($cartes as $i => $c) if ($c['id'] === $id) $index = $i;

    if ($action === 'creer') {
        if (count($cartes) >= 40) { $erreur('40 cartes au plus par projet.'); return; }
        $nom = trim(texteCorps($body['nom'] ?? '')) ?: (!empty($body['monde']) ? 'Monde inventé' : 'Nouvelle carte');
        $carte = ['id' => 'c' . bin2hex(random_bytes(4)), 'nom' => mb_substr($nom, 0, 60), 'fichier' => null, 'monde' => !empty($body['monde']), 'epingles' => (object)[]];
        $cartes[] = $carte;
        ecrireCartes($db, $cartes);
        echo json_encode($carte, JSON_UNESCAPED_UNICODE);
        return;
    }
    if ($index === null) { $erreur('Carte introuvable.', 404); return; }
    $carte = &$cartes[$index];

    switch ($action) {
        case 'renommer':
            $nom = trim(texteCorps($body['nom'] ?? ''));
            if ($nom === '') { $erreur('Donne un nom à la carte.'); return; }
            $carte['nom'] = mb_substr($nom, 0, 60);
            break;
        case 'retirer':
            if ($carte['fichier']) @unlink(dossierCartes() . '/' . $carte['fichier']);
            ecrireNoteJson($db, "monde:$id", null);
            ecrireNoteJson($db, "encyclo:$id", null);
            ecrireNoteJson($db, "histoire:$id", null);
            array_splice($cartes, $index, 1);
            unset($carte);
            // Les épingles qui ouvraient ce plan n'ouvrent plus rien
            foreach ($cartes as &$autre) {
                $ep = (array)$autre['epingles'];
                foreach ($ep as $k => $p) if (($p['sous'] ?? '') === $id) unset($ep[$k]['sous']);
                $autre['epingles'] = (object)$ep;
            }
            unset($autre);
            ecrireCartes($db, $cartes);
            echo json_encode(['ok' => true, 'cartes' => lireCartes($db)], JSON_UNESCAPED_UNICODE);
            return;
        case 'image':
            $ext = array_search(texteCorps($body['type'] ?? ''), CARTE_TYPES_IMAGE, true);
            $octets = base64_decode(texteCorps($body['donnees'] ?? ''), true);
            if ($ext === false || $octets === false || $octets === '') { $erreur('Image illisible : PNG, JPEG ou WebP seulement.', 422); return; }
            if (strlen($octets) > CARTE_IMAGE_MAX) { $erreur('Image trop lourde (12 Mo au plus).', 422); return; }
            if (@getimagesizefromstring($octets) === false) { $erreur('Ce fichier n\'est pas une image.', 422); return; }
            if ($carte['fichier']) @unlink(dossierCartes() . '/' . $carte['fichier']);
            $carte['fichier'] = 'carte-' . substr($id, 1) . '-' . bin2hex(random_bytes(4)) . ".$ext";
            file_put_contents(dossierCartes() . '/' . $carte['fichier'], $octets);
            break;
        case 'epingler':
            $cle = texteCorps($body['cle'] ?? '');
            if (!preg_match('/^[le]:\d+$/', $cle)) { $erreur('Lieu inconnu.'); return; }
            $epingles = (array)$carte['epingles'];
            if (($body['x'] ?? null) === null) unset($epingles[$cle]);
            else $epingles[$cle] = ['x' => max(0, min(1, (float)$body['x'])), 'y' => max(0, min(1, (float)($body['y'] ?? 0)))] + array_intersect_key((array)($epingles[$cle] ?? []), ['sous' => 1]);
            $carte['epingles'] = (object)$epingles;
            break;
        case 'lier':
            $cle = texteCorps($body['cle'] ?? '');
            $epingles = (array)$carte['epingles'];
            if (!isset($epingles[$cle])) { $erreur('Épingle ce lieu avant de lui donner un plan.'); return; }
            $sous = texteCorps($body['sous'] ?? '');
            if ($sous === '') unset($epingles[$cle]['sous']);
            elseif ($sous === $id || !in_array($sous, array_column($cartes, 'id'), true)) { $erreur('Plan introuvable.', 404); return; }
            else $epingles[$cle]['sous'] = $sous;
            $carte['epingles'] = (object)$epingles;
            break;
        case 'fiche':
            // Une fiche d'encyclopédie pour un royaume, une ville ou un nom posé sur le monde
            $cle = texteCorps($body['cle'] ?? '');
            if (!preg_match('/^[rvn]:[a-z0-9]{1,12}$/', $cle)) { $erreur('Élément du monde inconnu.'); return; }
            $fiches = lireNoteJson($db, "encyclo:$id") ?? [];
            $f = $body['fiche'] ?? null;
            if (!is_array($f)) unset($fiches[$cle]);
            else {
                if (!isset($fiches[$cle]) && count($fiches) >= 400) { $erreur('400 fiches au plus par monde.'); return; }
                $liste = fn($v, $motif, $max, $long) => array_values(array_unique(array_slice(array_filter(array_map(fn($x) => mb_substr(texteCorps($x), 0, $long), is_array($v) ? $v : []), fn($x) => $x !== '' && preg_match($motif, $x)), 0, $max)));
                $fiche = [
                    'bref' => mb_substr(texteCorps($f['bref'] ?? ''), 0, 200),
                    'histoire' => mb_substr(texteCorps($f['histoire'] ?? ''), 0, 8000),
                    'coutumes' => mb_substr(texteCorps($f['coutumes'] ?? ''), 0, 3000),
                    'persos' => $liste($f['persos'] ?? [], '/^[^<>]+$/u', 30, 60),
                    'lieux' => $liste($f['lieux'] ?? [], '/^[le]:\d+$/', 20, 12),
                    'plan' => preg_match('/^c[a-f0-9]{8}$/', texteCorps($f['plan'] ?? '')) && in_array($f['plan'], array_column($cartes, 'id'), true) ? $f['plan'] : '',
                ];
                $vide = implode('', [$fiche['bref'], $fiche['histoire'], $fiche['coutumes'], $fiche['plan']]) === '' && !$fiche['persos'] && !$fiche['lieux'];
                if ($vide) unset($fiches[$cle]); else $fiches[$cle] = $fiche;
            }
            ecrireNoteJson($db, "encyclo:$id", $fiches ?: null);
            echo json_encode(['ok' => true, 'fiches' => (object)$fiches], JSON_UNESCAPED_UNICODE);
            return;
        case 'histoire':
            if (strlen(json_encode($body['histoire'] ?? null)) > 1024 * 1024) { $erreur('Histoire trop longue.'); return; }
            $h = lireHistoire($body['histoire'] ?? null);
            ecrireNoteJson($db, "histoire:$id", $h['evenements'] || $h['gens'] ? $h : null);
            echo json_encode(['ok' => true, 'histoire' => $h], JSON_UNESCAPED_UNICODE);
            return;
        case 'monde':
            $etat = $body['etat'] ?? null;
            if (!is_array($etat)) { $erreur('Monde illisible.'); return; }
            if (strlen(json_encode($etat)) > CARTE_MONDE_MAX) { $erreur('Monde trop lourd.'); return; }
            $carte['monde'] = true;
            ecrireNoteJson($db, "monde:$id", $etat);
            break;
        default:
            $erreur('Action inconnue.', 404);
            return;
    }
    unset($carte);
    ecrireCartes($db, $cartes);
    echo json_encode(['ok' => true, 'cartes' => lireCartes($db)], JSON_UNESCAPED_UNICODE);
}
