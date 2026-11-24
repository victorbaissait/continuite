<?php
// api/film.php — Un projet Scénario : un film découpé en actes (les épisodes) et en séquences (les scènes)
// Le minutage se lit à la page : une page de scénario dure à peu près une minute à l'écran

const FILM_LIGNES_PAGE = 54;
const FILM_LARGEUR_ACTION = 60;
const FILM_LARGEUR_DIALOGUE = 35;

function estFilm(): bool {
    return defined('PROJET_TYPE') && PROJET_TYPE === 'film';
}

function estSlugline(string $ligne): bool {
    return (bool)preg_match('/^(INT\.|EXT\.|INT |EXT |INT\/EXT|I\/E\b|INT$|EXT$)/iu', $ligne);
}

// Les pages d'un morceau de scénario, au huitième près, d'après la place qu'il prendrait mis en page
function pagesScenario(string $texte): float {
    $lignes = 0;
    $dialogue = false;
    foreach (explode("\n", str_replace("\r", '', $texte)) as $ligne) {
        $ligne = trim($ligne);
        if ($ligne === '') { $lignes++; $dialogue = false; continue; }
        if (estSlugline($ligne)) { $lignes += 2; $dialogue = false; continue; }
        $nom = preg_match('/^[A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ][A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ\s\'\-\d.]{0,35}(\s*\(.*\))?$/u', $ligne) && !estTransition($ligne);
        if ($nom) { $lignes++; $dialogue = true; continue; }
        if (preg_match('/^\(.*\)$/u', $ligne)) { $lignes++; continue; }
        $lignes += max(1, (int)ceil(mb_strlen($ligne) / ($dialogue ? FILM_LARGEUR_DIALOGUE : FILM_LARGEUR_ACTION)));
    }
    return max(0.125, round($lignes / FILM_LIGNES_PAGE * 8) / 8);
}

// Le texte d'avant la première séquence (page de titre), puis une entrée par séquence
function sequencesScenario(string $texte): array {
    $texte = str_replace(["\r", "\u{2019}", "\u{00A0}"], ['', "'", ' '], $texte);
    $avant = '';
    $sequences = [];
    foreach (explode("\n", $texte) as $ligne) {
        if (estSlugline(trim($ligne))) {
            $sequences[] = trim($ligne) . "\n";
            continue;
        }
        if ($sequences) $sequences[count($sequences) - 1] .= $ligne . "\n";
        else $avant .= $ligne . "\n";
    }
    return ['avant' => $avant, 'sequences' => $sequences];
}

// Les actes se coupent au début d'une séquence ; sans coupes données, aux mêmes proportions qu'un film classique
function decouperFilm(string $texte, int $nbActes = 3, ?array $coupes = null): array {
    $lu = sequencesScenario($texte);
    $seqs = $lu['sequences'];
    $n = count($seqs);
    $nbActes = max(1, min(5, $nbActes, max(1, $n)));
    $pages = array_map('pagesScenario', $seqs);
    $total = array_sum($pages) ?: 1;
    if ($coupes === null) {
        $parts = [3 => [0.25, 0.75], 2 => [0.5], 4 => [0.25, 0.5, 0.75], 5 => [0.2, 0.4, 0.6, 0.8]][$nbActes] ?? [];
        $coupes = [];
        foreach ($parts as $part) {
            $cumul = 0;
            foreach ($pages as $i => $p) {
                if ($cumul >= $part * $total) { $coupes[] = $i; break; }
                $cumul += $p;
            }
        }
    }
    $coupes = array_values(array_unique(array_filter(array_map('intval', $coupes), fn($c) => $c > 0 && $c < $n)));
    sort($coupes);
    $bornes = [0, ...$coupes, $n];
    $actes = [];
    for ($a = 0; $a < count($bornes) - 1; $a++) {
        $morceau = implode('', array_slice($seqs, $bornes[$a], $bornes[$a + 1] - $bornes[$a]));
        $actes[] = ['texte' => ($a === 0 ? $lu['avant'] : '') . $morceau, 'sequences' => $bornes[$a + 1] - $bornes[$a], 'pages' => array_sum(array_slice($pages, $bornes[$a], $bornes[$a + 1] - $bornes[$a]))];
    }
    return ['actes' => $actes, 'coupes' => $coupes, 'sequences' => $n, 'pages' => $total];
}

function actesFilm(PDO $db): array {
    return $db->query("
        SELECT e.id, e.numero_episode, e.titre, e.texte_episode
        FROM episodes e JOIN saisons sa ON sa.id = e.saison_id
        WHERE sa.numero = 1 ORDER BY e.numero_episode
    ")->fetchAll();
}

// Import d'un scénario entier : une saison « Film » et un épisode par acte
function importerFilm(PDO $db, array $body): array {
    $texte = texteCorps($body['texte'] ?? '');
    if (trim($texte) === '') return ['error' => 'Le scénario est vide.'];
    $decoupe = decouperFilm($texte, (int)($body['actes'] ?? 3));
    if (!empty($body['apercu'])) {
        return ['actes' => array_map(fn($a) => ['sequences' => $a['sequences'], 'pages' => $a['pages']], $decoupe['actes']), 'sequences' => $decoupe['sequences'], 'pages' => $decoupe['pages']];
    }
    $resultats = [];
    foreach ($decoupe['actes'] as $i => $acte) {
        $resultats[] = importerScript($db, ['saison' => 1, 'numero' => $i + 1, 'titre' => '', 'texte' => $acte['texte']]);
    }
    return ['actes' => $resultats, 'sequences' => $decoupe['sequences'], 'pages' => $decoupe['pages']];
}

// Déplacer une coupure d'acte réécrit les actes ; le scénario, lui, ne change pas d'un mot
function recouperFilm(PDO $db, array $body): array {
    $actes = actesFilm($db);
    if (count($actes) < 2) return ['error' => 'Le film n\'a qu\'un acte.'];
    $texte = implode("\n", array_map(fn($a) => rtrim((string)$a['texte_episode']), $actes)) . "\n";
    $coupes = array_map('intval', (array)($body['coupes'] ?? []));
    if (count($coupes) !== count($actes) - 1) return ['error' => 'Il faut une coupure entre chaque acte.'];
    $decoupe = decouperFilm($texte, count($actes), $coupes);
    if (count($decoupe['actes']) !== count($actes)) return ['error' => 'Chaque acte doit garder au moins une séquence.'];
    foreach ($actes as $i => $a) {
        ob_start();
        handleUpload($db, ['episode_id' => (int)$a['id'], 'texte' => $decoupe['actes'][$i]['texte']]);
        ob_end_clean();
    }
    return ['ok' => true, 'coupes' => $decoupe['coupes']];
}

// Les séquences du film dans l'ordre, avec leurs pages et qui parle
function sequencesFilm(PDO $db): array {
    $sortie = [];
    $g = 0;
    $actes = actesFilm($db);
    // Les pages viennent de la vraie mise en page du film entier, réglages du projet compris
    $pagination = paginerScenario(blocsScenario(implode("\n\n", array_map(fn($a) => (string)$a['texte_episode'], $actes))), miseEnPage($db));
    foreach ($actes as $a) {
        $lu = sequencesScenario((string)$a['texte_episode']);
        foreach ($lu['sequences'] as $n => $seq) {
            $lignes = explode("\n", trim($seq));
            $slug = array_shift($lignes);
            $persos = [];
            $precedenteVide = true;
            foreach ($lignes as $l) {
                $l = trim($l);
                if ($l === '') { $precedenteVide = true; continue; }
                if ($precedenteVide && preg_match('/^([A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ][A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ\s\'\-\d.]{0,35}?)\s*(\(.*\))?$/u', $l, $m) && !estTransition($l) && !estFauxPersonnage(trim($m[1]))) $persos[trim($m[1])] = ($persos[trim($m[1])] ?? 0) + 1;
                $precedenteVide = false;
            }
            $moment = preg_match('/\b(JOUR|NUIT|MATIN|SOIR|AUBE|CRÉPUSCULE|PLUS TARD|CONTINU)\b/iu', $slug, $mm) ? mb_strtoupper($mm[1], 'UTF-8') : '';
            $sortie[] = [
                'g' => $g, 'acte' => (int)$a['id'], 'n' => $n + 1,
                'slug' => preg_replace('/\s*#[\w.-]+#\s*$/u', '', $slug),
                'ext' => (bool)preg_match('/^EXT/iu', $slug), 'moment' => $moment,
                'pages' => $pagination['sequences'][$g++] ?? pagesScenario($seq), 'persos' => array_keys($persos), 'repliques' => $persos,
                'h' => empreinteSequence($seq),
            ];
        }
    }
    return $sortie;
}

// Le texte d'une séquence, sans les espaces ni la casse : une virgule déplacée compte, un saut de ligne non
function empreinteSequence(string $seq): string {
    return substr(md5(mb_strtolower(preg_replace('/\s+/u', ' ', trim($seq)), 'UTF-8')), 0, 12);
}

// Les révisions colorées : chaque version figée garde l'empreinte de ses séquences
const FILM_COULEURS = ['Blanche', 'Bleue', 'Rose', 'Jaune', 'Verte', 'Chamois', 'Saumon', 'Cerise', 'Bleu ciel', 'Gris'];

function revisionsFilm(PDO $db, string $method, array $body): array {
    $db->exec("CREATE TABLE IF NOT EXISTS film_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        couleur TEXT NOT NULL,
        note TEXT,
        empreintes TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )");
    if ($method === 'POST' && ($body['action'] ?? '') === 'figer') {
        $nb = (int)$db->query('SELECT COUNT(*) FROM film_revisions')->fetchColumn();
        $empreintes = array_column(sequencesFilm($db), 'h');
        $db->prepare('INSERT INTO film_revisions (couleur, note, empreintes) VALUES (?, ?, ?)')->execute([FILM_COULEURS[$nb % count(FILM_COULEURS)], mb_substr(texteCorps($body['note'] ?? ''), 0, 200), json_encode($empreintes)]);
    } elseif ($method === 'POST' && ($body['action'] ?? '') === 'supprimer') {
        $db->prepare('DELETE FROM film_revisions WHERE id = (SELECT MAX(id) FROM film_revisions)')->execute();
    }
    return array_map(fn($r) => ['id' => (int)$r['id'], 'couleur' => $r['couleur'], 'note' => $r['note'], 'date' => $r['created_at'], 'h' => json_decode($r['empreintes'], true)], $db->query('SELECT * FROM film_revisions ORDER BY id')->fetchAll());
}

// ─── Formats propres au scénario ─────────────────────────────────────────────

// Blocs de scénario → texte lisible par l'analyse : le nom, puis la réplique juste dessous
function assemblerScenario(array $blocs): string {
    $sortie = '';
    $precedent = null;
    foreach ($blocs as [$type, $texte]) {
        $texte = trim(preg_replace("/[ \t\x{00A0}]+/u", ' ', $texte));
        if ($texte === '') continue;
        $colle = in_array($type, ['dialogue', 'parenthese'], true) && in_array($precedent, ['personnage', 'dialogue', 'parenthese'], true);
        if (in_array($type, ['sequence', 'personnage', 'transition'], true)) $texte = mb_strtoupper($texte, 'UTF-8');
        $sortie .= ($sortie === '' ? '' : ($colle ? "\n" : "\n\n")) . $texte;
        $precedent = $type;
    }
    return $sortie;
}

function typeBlocScenario(string $style): string {
    $s = mb_strtolower($style, 'UTF-8');
    if (str_contains($s, 'scene heading') || str_contains($s, 'sceneheading') || str_contains($s, 'slug')) return 'sequence';
    if (str_contains($s, 'character') || $s === 'personnage') return 'personnage';
    if (str_contains($s, 'parenthetical') || str_contains($s, 'paren')) return 'parenthese';
    if (str_contains($s, 'dialog')) return 'dialogue';
    if (str_contains($s, 'transition')) return 'transition';
    return 'action';
}

// Final Draft : <Paragraph Type="Scene Heading"><Text>…</Text></Paragraph>
function texteFdx(string $xml): string {
    $xp = new DOMXPath(lireXml($xml));
    $blocs = [];
    foreach ($xp->query('//Content/Paragraph') as $p) {
        $texte = '';
        foreach ($xp->query('Text', $p) as $t) $texte .= $t->textContent;
        $blocs[] = [typeBlocScenario($p->getAttribute('Type')), $texte];
    }
    if (!$blocs) throw new RuntimeException('Ce fichier Final Draft ne contient pas de scénario.');
    return assemblerScenario($blocs);
}

// Highland : une archive qui contient le texte en Fountain
function texteHighland(string $octets): string {
    $zip = ouvrirZip($octets);
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $nom = $zip->getNameIndex($i);
        if (preg_match('/text\.(fountain|md|markdown|txt)$/i', $nom) && !str_contains($nom, '__MACOSX')) return decoderTexte($zip->getFromIndex($i));
    }
    throw new RuntimeException('Cette archive Highland ne contient pas de texte.');
}

// Fade In : document.xml au format Open Screenplay Format
function texteFadeIn(string $octets): string {
    $zip = ouvrirZip($octets);
    $xml = $zip->getFromName('document.xml');
    if ($xml === false) throw new RuntimeException('Ce fichier Fade In ne contient pas de scénario.');
    $xp = new DOMXPath(lireXml($xml));
    $blocs = [];
    foreach ($xp->query('//paragraphs/para') as $p) {
        $style = $xp->query('style', $p)->item(0);
        $texte = '';
        foreach ($xp->query('text', $p) as $t) $texte .= $t->textContent;
        $blocs[] = [typeBlocScenario($style ? ($style->getAttribute('basestyle') ?: $style->getAttribute('base')) : ''), $texte];
    }
    return assemblerScenario($blocs);
}

// Celtx : une archive dont le scénario est une page HTML, un paragraphe classé par bloc
function texteCeltx(string $octets): string {
    $zip = ouvrirZip($octets);
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $nom = $zip->getNameIndex($i);
        if (!preg_match('/^script.*\.html?$/i', basename($nom))) continue;
        $doc = new DOMDocument();
        @$doc->loadHTML('<?xml encoding="utf-8"?>' . $zip->getFromIndex($i), LIBXML_NONET);
        $blocs = [];
        foreach ((new DOMXPath($doc))->query('//p[@class]') as $p) {
            $classe = $p->getAttribute('class');
            $blocs[] = [typeBlocScenario($classe === 'dialog' ? 'dialogue' : $classe), $p->textContent];
        }
        if ($blocs) return assemblerScenario($blocs);
    }
    throw new RuntimeException('Cette archive Celtx ne contient pas de scénario.');
}
