<?php
// api/creatif.php — Des outils pour se relire autrement. Aucun n'écrit de texte : ils comptent, cherchent et montrent.
//   aveugle : des répliques sans leur nom, pour deviner qui parle (des voix trop proches se confondent)
//   objets  : les « fusils de Tchekhov », des objets mis en avant dans une didascalie qui ne reviennent jamais
//   annee   : le bilan d'une année d'écriture (versions, épisodes les plus repris, qui a le plus parlé)

// Les lignes d'un script, comme les classe l'éditeur : en-tête, nom de réplique, réplique, parenthèse, action
function lignesClassees(string $texte): array {
    $sortie = [];
    $qui = null;
    $note = false;
    foreach (explode("\n", str_replace(["\r", "\u{2019}"], ['', "'"], $texte)) as $brut) {
        $l = trim($brut);
        if ($note || str_starts_with($l, '/*')) { $note = !str_contains($l, '*/'); continue; }
        if ($l === '') { $qui = null; continue; }
        if (preg_match('/^(INT|EXT)\b/iu', $l)) { $qui = null; $sortie[] = ['type' => 'scene', 'texte' => $l, 'qui' => null]; continue; }
        if (preg_match('/^\(.*\)$/u', $l)) { $sortie[] = ['type' => 'parenthese', 'texte' => $l, 'qui' => $qui]; continue; }
        if (preg_match("/^([A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ][A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ\\s'\\-\\d]{0,35})(\\s*\\(.*\\))?\\.?$/u", $l, $m)) {
            $qui = trim(preg_replace('/\s+/u', ' ', $m[1]), " .-'");
            $sortie[] = ['type' => 'perso', 'texte' => $l, 'qui' => $qui];
            continue;
        }
        $sortie[] = ['type' => $qui !== null ? 'dialogue' : 'action', 'texte' => $l, 'qui' => $qui];
    }
    return $sortie;
}

function episodesAvecScript(PDO $db): array {
    return $db->query("SELECT e.id, e.numero_episode, e.titre, e.texte_episode, s.numero AS saison FROM episodes e JOIN saisons s ON s.id = e.saison_id
        WHERE TRIM(COALESCE(e.texte_episode, '')) <> '' ORDER BY s.numero, e.numero_episode, e.id")->fetchAll();
}

// ─── Le test de l'aveugle ───

function testAveugle(PDO $db, array $q): array {
    // Chaque voix : le personnage de la fiche s'il y en a une, sinon le nom de réplique tel qu'il est écrit
    $personnages = $db->query('SELECT id, prenom, nom, nom_affichage FROM personnages')->fetchAll();
    $parQui = [];
    $noms = [];
    $choisis = array_values(array_filter(array_map('trim', explode(',', (string)($q['persos'] ?? ''))), fn($x) => $x !== ''));
    foreach (episodesAvecScript($db) as $e) {
        $code = sprintf('S%dE%02d', $e['saison'], $e['numero_episode']);
        foreach (lignesClassees((string)$e['texte_episode']) as $l) {
            if ($l['type'] !== 'dialogue' || $l['qui'] === null) continue;
            $mots = preg_match_all('/[\p{L}\p{N}]+/u', $l['texte']);
            if ($mots < 7 || $mots > 60) continue;
            $p = matcherPersonnageDepuisNom($l['qui'], $personnages);
            $id = $p ? 'p' . $p['id'] : 'n' . substr(md5(mb_strtoupper($l['qui'])), 0, 10);
            $noms[$id] ??= $p ? personnageLabel($p) : mb_convert_case(mb_strtolower($l['qui']), MB_CASE_TITLE);
            $parQui[$id][] = ['texte' => $l['texte'], 'ep' => $code];
        }
    }
    uasort($parQui, fn($a, $b) => count($b) <=> count($a));
    $assez = array_keys(array_filter($parQui, fn($l) => count($l) >= 10));
    $ids = $choisis ? array_values(array_intersect($assez, $choisis)) : array_slice($assez, 0, 4);
    $questions = [];
    $n = max(5, min(40, (int)($q['n'] ?? 15)));
    // Une réplique qui contient le nom d'une des voix en lice donnerait un indice : on en tire une autre
    $prenoms = [];
    foreach ($ids as $id) foreach (preg_split('/\s+/u', mb_strtolower($noms[$id])) as $m) if (mb_strlen($m) >= 3) $prenoms[] = preg_quote($m, '/');
    $indice = $prenoms ? '/(?<![\p{L}])(?:' . implode('|', $prenoms) . ')(?![\p{L}])/iu' : null;
    for ($k = 0; $k < $n && count($ids) >= 2; $k++) {
        $id = $ids[random_int(0, count($ids) - 1)];
        for ($essai = 0; $essai < 25; $essai++) {
            $r = $parQui[$id][random_int(0, count($parQui[$id]) - 1)];
            if (!$indice || !preg_match($indice, $r['texte'])) break;
        }
        $questions[] = ['texte' => $r['texte'], 'ep' => $r['ep'], 'qui' => $id];
    }
    $fiche = fn($id) => ['id' => $id, 'nom' => $noms[$id], 'repliques' => count($parQui[$id])];
    return ['personnages' => array_map($fiche, $ids), 'disponibles' => array_map($fiche, array_slice($assez, 0, 30)), 'questions' => $questions];
}

// ─── Les fusils de Tchekhov ───

const OBJETS_MOTS_VIDES = ['alors', 'avec', 'dans', 'mais', 'pour', 'sans', 'sous', 'vers', 'chez', 'tout', 'toute', 'tous', 'toutes', 'autre', 'autres', 'même', 'fois',
    'moment', 'instant', 'temps', 'jour', 'nuit', 'matin', 'soir', 'porte', 'pièce', 'table', 'chaise', 'main', 'mains', 'tête', 'yeux', 'regard', 'voix', 'bras', 'sourire',
    'personne', 'chose', 'choses', 'peu', 'coup', 'côté', 'fond', 'milieu', 'place', 'suite', 'fin', 'début', 'scène', 'plan', 'silence', 'air', 'mot', 'mots', 'cette', 'quelques',
    'quelque', 'chacun', 'dont', 'leur', 'leurs', 'notre', 'votre', 'elle', 'elles', 'ils', 'lui', 'nous', 'vous', 'cela', 'ceci', 'plus', 'moins', 'très', 'bien', 'aussi', 'encore'];

function objetsOublies(PDO $db): array {
    $personnages = $db->query('SELECT prenom, nom, nom_affichage FROM personnages')->fetchAll();
    $exclus = array_flip(OBJETS_MOTS_VIDES);
    foreach ($personnages as $p) foreach ([$p['prenom'], $p['nom'], $p['nom_affichage']] as $n) foreach (preg_split('/\s+/u', mb_strtolower((string)$n)) as $m) if ($m !== '') $exclus[$m] = true;
    $episodes = episodesAvecScript($db);
    $textes = array_map(fn($e) => ' ' . mb_strtolower(str_replace("\u{2019}", "'", (string)$e['texte_episode'])) . ' ', $episodes);
    $candidats = [];
    foreach ($episodes as $i => $e) {
        $code = sprintf('S%dE%02d', $e['saison'], $e['numero_episode']);
        $local = [];
        $dansUneScene = false;
        foreach (lignesClassees((string)$e['texte_episode']) as $l) {
            if ($l['type'] === 'scene') $dansUneScene = true;
            // Avant la première scène : le titre et la page de garde, pas des didascalies
            if ($l['type'] !== 'action' || !$dansUneScene) continue;
            // Un objet écrit en capitales au milieu d'une didascalie surtout en minuscules : l'auteur l'a mis en avant.
            // (Si les didascalies sont écrites en capitales, ce repère ne veut rien dire : on ne s'en sert pas.)
            $mots = max(1, preg_match_all('/\p{L}+/u', $l['texte']));
            $enMinuscules = preg_match_all('/\p{L}*\p{Ll}\p{L}*/u', $l['texte']) / $mots >= 0.6;
            if ($enMinuscules && preg_match_all('/(?<![\p{L}])(\p{Lu}{3,})(?![\p{L}])/u', $l['texte'], $m)) {
                foreach ($m[1] as $mot) { $k = mb_strtolower($mot); if (!isset($exclus[$k])) $local[$k] = ['fort' => true, 'n' => ($local[$k]['n'] ?? 0) + 1, 'ligne' => $local[$k]['ligne'] ?? $l['texte']]; }
            }
            // Un objet nommé (« un revolver », « la lettre ») qui revient plusieurs fois dans les didascalies de l'épisode
            if (preg_match_all("/(?<![\\p{L}])(?:(?:un|une|le|la|les|des|son|sa|ses)\\s+|l')([\\p{L}-]{4,})/iu", $l['texte'], $m)) {
                foreach ($m[1] as $mot) { $k = mb_strtolower($mot); if (isset($exclus[$k])) continue; $local[$k] = ['fort' => $local[$k]['fort'] ?? false, 'n' => ($local[$k]['n'] ?? 0) + 1, 'ligne' => $local[$k]['ligne'] ?? $l['texte']]; }
            }
        }
        foreach ($local as $mot => $c) {
            if (!$c['fort'] && $c['n'] < 2) continue;
            // Déjà présent avant cet épisode : ce n'est pas un objet qui apparaît ici
            $avant = false;
            for ($j = 0; $j < $i && !$avant; $j++) $avant = (bool)preg_match('/(?<![\p{L}])' . preg_quote($mot, '/') . 's?(?![\p{L}])/u', $textes[$j]);
            if ($avant || isset($candidats[$mot])) continue;
            $apres = false;
            for ($j = $i + 1; $j < count($episodes) && !$apres; $j++) $apres = (bool)preg_match('/(?<![\p{L}])' . preg_quote($mot, '/') . 's?(?![\p{L}])/u', $textes[$j]);
            if ($apres) continue;
            $candidats[$mot] = ['mot' => $mot, 'ep' => (int)$e['id'], 'code' => $code, 'fort' => $c['fort'], 'n' => $c['n'], 'ligne' => mb_substr($c['ligne'], 0, 180),
                'recent' => count($episodes) - $i <= 2];
        }
    }
    $liste = array_values($candidats);
    usort($liste, fn($a, $b) => [$b['fort'], $b['n']] <=> [$a['fort'], $a['n']]);
    return ['objets' => array_slice($liste, 0, 60), 'episodes' => count($episodes)];
}

// ─── L'année d'écriture ───

function anneeEcriture(PDO $db, array $q): array {
    $annee = max(2000, min(2100, (int)($q['annee'] ?? date('Y'))));
    $db->exec("CREATE TABLE IF NOT EXISTS brouillon_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, episode_id INTEGER NOT NULL, texte TEXT NOT NULL, motif TEXT NOT NULL, mots INTEGER NOT NULL, cree_le TEXT NOT NULL DEFAULT (datetime('now', 'localtime')))");
    $st = $db->prepare("SELECT v.episode_id, COUNT(*) AS n, e.numero_episode, e.titre, s.numero AS saison FROM brouillon_versions v JOIN episodes e ON e.id = v.episode_id JOIN saisons s ON s.id = e.saison_id
        WHERE substr(v.cree_le, 1, 4) = ? GROUP BY v.episode_id ORDER BY n DESC LIMIT 5");
    $st->execute([(string)$annee]);
    $reprises = array_map(fn($r) => ['code' => sprintf('S%dE%02d', $r['saison'], $r['numero_episode']), 'titre' => (string)$r['titre'], 'versions' => (int)$r['n']], $st->fetchAll());
    $st = $db->prepare("SELECT COUNT(*) FROM brouillon_versions WHERE substr(cree_le, 1, 4) = ?");
    $st->execute([(string)$annee]);
    $versions = (int)$st->fetchColumn();
    $st = $db->prepare("SELECT COUNT(DISTINCT episode_id) FROM brouillon_versions WHERE substr(cree_le, 1, 4) = ?");
    $st->execute([(string)$annee]);
    $touches = (int)$st->fetchColumn();
    $bavards = $db->query('SELECT p.prenom, p.nom, SUM(ep.nb_repliques) AS n FROM episode_personnages ep JOIN personnages p ON p.id = ep.personnage_id GROUP BY p.id ORDER BY n DESC LIMIT 3')->fetchAll();
    $envois = 0;
    try {
        $st = $db->prepare("SELECT COUNT(*) FROM lecteur_episodes WHERE substr(envoye_le, 1, 4) = ?");
        $st->execute([(string)$annee]);
        $envois = (int)$st->fetchColumn();
    } catch (Throwable $e) { /* pas de lecteurs */ }
    $annees = array_column($db->query("SELECT DISTINCT substr(cree_le, 1, 4) AS a FROM brouillon_versions ORDER BY a DESC")->fetchAll(), 'a');
    return ['annee' => $annee, 'annees' => $annees, 'versions' => $versions, 'episodes_touches' => $touches, 'reprises' => $reprises, 'envois' => $envois,
        'bavards' => array_map(fn($p) => ['nom' => trim($p['prenom'] . ' ' . ($p['nom'] ?? '')), 'repliques' => (int)$p['n']], $bavards)];
}

function handleCreatif(PDO $db, string $resource, string $method): void {
    if ($method !== 'GET') { http_response_code(405); echo json_encode(['error' => 'GET attendu']); return; }
    $r = match ($resource) {
        'aveugle' => testAveugle($db, $_GET),
        'objets_oublies' => objetsOublies($db),
        'annee_ecriture' => anneeEcriture($db, $_GET),
        'roman_sens' => romanSens($db),
        'film_lisibilite' => filmLisibilite($db) + ['debut' => premieresPages($db)],
        'portraits' => portraitsRoman($db),
        'conduite' => conduiteTheatre($db),
        'accroches' => accrochesSerie($db),
        'chutier' => chutier($db),
        'registres' => registresVoix($db),
    };
    echo json_encode($r, JSON_UNESCAPED_UNICODE);
}

// ─── Roman : les cinq sens et les tics de plume, chapitre par chapitre ───

const SENS_MOTS = [
    'vue' => ['voir', 'vois', 'voit', 'vu', 'vue', 'regard', 'regarde', 'regarda', 'regarder', 'aperçoit', 'aperçut', 'contempl', 'lumière', 'ombre', 'couleur', 'brill', 'éclat', 'sombre', 'clair', 'pâle', 'rouge', 'bleu', 'vert', 'jaune', 'noir', 'blanc', 'gris', 'scintill', 'reflet', 'observ', 'fixa', 'yeux', 'œil', 'visage'],
    'ouie' => ['entend', 'entendit', 'entendre', 'écoute', 'écouta', 'bruit', 'voix', 'murmur', 'chuchot', 'cri', 'cria', 'hurl', 'silence', 'craqu', 'grinc', 'tinte', 'résonn', 'écho', 'musique', 'chant', 'sonn', 'claqu', 'gronde', 'siffl', 'fracas', 'rumeur'],
    'odorat' => ['odeur', 'parfum', 'sent', 'sentit', 'senteur', 'arôme', 'effluve', 'puanteur', 'pue', 'puait', 'renifl', 'flair', 'relent', 'fum', 'encens', 'moisi', 'humid'],
    'toucher' => ['touch', 'caress', 'froid', 'chaud', 'tiède', 'glacé', 'brûl', 'rugueux', 'lisse', 'doux', 'douce', 'peau', 'frôl', 'effleur', 'serr', 'press', 'poids', 'lourd', 'humide', 'moite', 'piqu', 'frisson', 'chatouill', 'gratt'],
    'gout' => ['goût', 'goûte', 'goûta', 'saveur', 'sucré', 'salé', 'amer', 'acide', 'aigre', 'fade', 'savour', 'langue', 'bouche', 'mâch', 'croqu', 'aval', 'boire', 'mange', 'mangea', 'délicieux', 'épic'],
];
const TICS_MOTS = ['soudain', 'soudainement', 'alors', 'puis', 'vraiment', 'très', 'juste', 'sembla', 'semblait', 'commença', 'commençait', 'se mit à', 'un peu', 'presque', 'tout à coup', 'en fait', 'bien sûr', 'littéralement'];

function romanSens(PDO $db): array {
    $chapitres = [];
    foreach (episodesAvecScript($db) as $e) {
        $texte = mb_strtolower(str_replace("\u{2019}", "'", (string)$e['texte_episode']));
        preg_match_all('/[\p{L}]+(?:\'[\p{L}]+)?/u', $texte, $m);
        $mots = $m[0];
        $n = max(1, count($mots));
        $sens = [];
        foreach (SENS_MOTS as $s => $racines) {
            $c = 0;
            foreach ($mots as $w) foreach ($racines as $r) if (str_starts_with($w, $r) && mb_strlen($w) <= mb_strlen($r) + 4) { $c++; break; }
            $sens[$s] = round($c * 1000 / $n, 1);
        }
        $adverbes = count(array_filter($mots, fn($w) => mb_strlen($w) >= 6 && str_ends_with($w, 'ment') && !in_array($w, ['moment', 'comment', 'vêtement', 'appartement', 'gouvernement', 'sentiment', 'mouvement', 'instrument', 'élément', 'monument', 'événement', 'évènement', 'bâtiment', 'commencement', 'traitement', 'jugement', 'logement', 'département', 'argument', 'segment', 'ciment', 'aliment', 'serment', 'tourment', 'testament', 'document', 'paiement', 'changement', 'seulement'], true)));
        $tics = [];
        foreach (TICS_MOTS as $t) { $k = preg_match_all('/(?<![\p{L}])' . preg_quote($t, '/') . '(?![\p{L}])/u', $texte); if ($k) $tics[$t] = $k; }
        arsort($tics);
        // Le même mot (de 5 lettres au moins) deux fois à moins de 30 mots : une répétition proche
        $proches = [];
        $vu = [];
        foreach ($mots as $i => $w) {
            if (mb_strlen($w) < 5) continue;
            if (isset($vu[$w]) && $i - $vu[$w] <= 30) $proches[$w] = ($proches[$w] ?? 0) + 1;
            $vu[$w] = $i;
        }
        arsort($proches);
        // La tension : des phrases courtes, des ! et des ?, et peu de longues descriptions
        $phrases = array_values(array_filter(array_map('trim', preg_split('/(?<=[.!?…])\s+/u', str_replace("\n", ' ', $texte))), fn($x) => preg_match('/\p{L}/u', $x)));
        $longueurs = array_map(fn($x) => preg_match_all('/[\p{L}\p{N}]+/u', $x), $phrases);
        $courtes = count(array_filter($longueurs, fn($n) => $n > 0 && $n <= 8));
        $ponct = preg_match_all('/[!?]/u', $texte);
        $tension = $phrases ? round(min(100, ($courtes * 100 / count($phrases)) * 0.6 + min(40, $ponct * 1000 / $n / 1.5))) : 0;
        $chapitres[] = ['id' => (int)$e['id'], 'code' => sprintf('S%dE%02d', $e['saison'], $e['numero_episode']), 'titre' => (string)$e['titre'], 'mots' => count($mots),
            'tension' => $tension, 'phrase_moyenne' => $longueurs ? round(array_sum($longueurs) / count($longueurs), 1) : 0,
            'fin' => $phrases ? mb_substr(end($phrases), -160) : '',
            'sens' => $sens, 'adverbes' => round($adverbes * 1000 / $n, 1), 'tics' => array_slice($tics, 0, 5, true), 'proches' => array_slice($proches, 0, 6, true), 'nb_proches' => array_sum($proches)];
    }
    return ['chapitres' => $chapitres];
}

// ─── Scénario : les pavés (blocs d'action de plus de 4 lignes) et la densité de chaque séquence ───

function filmLisibilite(PDO $db): array {
    $sortie = [];
    $largeur = 61; // caractères d'une ligne d'action en Courier 12 (6 pouces)
    foreach (episodesAvecScript($db) as $e) {
        $bloc = [];
        $sequence = null;
        $lignes = lignesClassees((string)$e['texte_episode']);
        $lignes[] = ['type' => 'fin', 'texte' => '', 'qui' => null];
        $ajouter = function () use (&$bloc, &$sequence, $largeur) {
            if (!$bloc || !$sequence) { $bloc = []; return; }
            $n = 0;
            foreach ($bloc as $t) $n += max(1, (int)ceil(mb_strlen($t) / $largeur));
            $sequence['action'] += $n;
            if ($n > 4) $sequence['paves'][] = ['lignes' => $n, 'debut' => mb_substr($bloc[0], 0, 120)];
            $bloc = [];
        };
        foreach ($lignes as $l) {
            if ($l['type'] === 'action') { $bloc[] = $l['texte']; continue; }
            $ajouter();
            if ($l['type'] === 'scene' || $l['type'] === 'fin') {
                if ($sequence) $sortie[] = $sequence;
                $sequence = $l['type'] === 'scene' ? ['ep' => (int)$e['id'], 'code' => sprintf('S%dE%02d', $e['saison'], $e['numero_episode']), 'slug' => $l['texte'], 'action' => 0, 'dialogue' => 0, 'paves' => []] : null;
            } elseif ($sequence && in_array($l['type'], ['dialogue', 'parenthese', 'perso'], true)) {
                $sequence['dialogue'] += max(1, (int)ceil(mb_strlen($l['texte']) / 35));
            }
        }
    }
    foreach ($sortie as $i => &$s) { $s['g'] = $i + 1; $s['densite'] = $s['action'] + $s['dialogue'] ? round($s['action'] * 100 / ($s['action'] + $s['dialogue'])) : 0; }
    return ['sequences' => $sortie];
}

// ─── Roman : les portraits. La description physique de chaque personnage, et ce qui se contredit ───

const PORTRAIT_TRAITS = [
    'Yeux' => '/\byeux\s+(?:d[\'’]un\s+|très\s+|si\s+)?(bleus?|verts?|marron|noirs?|gris|noisette|bruns?|clairs?|sombres?|vairons)\b/iu',
    'Cheveux' => '/\bcheveux\s+(?:très\s+|mi-\s*)?(blonds?|bruns?|roux|noirs?|gris|blancs?|châtains?|courts?|longs?|bouclés?|frisés?|raides?|rasés?)\b/iu',
    'Barbe' => '/\b(barbu|imberbe|moustachu|rasé de près)\b/iu',
    // La taille : seulement si le sujet est le personnage (« il », « elle » ou son prénom, remplacé à la lecture) et que l'adjectif finit la proposition
    'Taille' => '/(?:\b(?:il|elle|PRENOM)\s+(?:est|était|paraît|paraissait|semble|semblait)\s+(?:très\s+|si\s+|plutôt\s+|assez\s+)?(grand|grande|petit|petite)(?=\s*(?:[,.;!?…]|et\b|$)))|\bde\s+(petite|grande)\s+taille\b/iu',
    'Lunettes' => '/\b(lunettes|binocles|monocle)\b/iu',
];

function portraitsRoman(PDO $db): array {
    $personnages = $db->query('SELECT id, prenom, nom FROM personnages ORDER BY est_principal DESC, prenom')->fetchAll();
    // Tous les prénoms dans une seule recherche (les plus longs d'abord) : une phrase n'est lue qu'une fois
    $parPrenom = [];
    foreach ($personnages as $p) { $k = mb_strtolower(trim((string)$p['prenom'])); if (mb_strlen($k) >= 2 && !isset($parPrenom[$k])) $parPrenom[$k] = $p; }
    $cles = array_keys($parPrenom);
    usort($cles, fn($a, $b) => mb_strlen($b) <=> mb_strlen($a));
    $tousLesPrenoms = $cles ? '/(?<![\p{L}])(' . implode('|', array_map(fn($k) => preg_quote($k, '/'), $cles)) . ')(?![\p{L}])/iu' : null;
    $traits = [];
    foreach (episodesAvecScript($db) as $e) {
        $code = sprintf('S%dE%02d', $e['saison'], $e['numero_episode']);
        $phrases = preg_split('/(?<=[.!?…])\s+|\n+/u', str_replace("\u{2019}", "'", (string)$e['texte_episode']));
        $dernier = null;
        foreach ($phrases as $ph) {
            $ph = trim($ph);
            if ($ph === '') continue;
            // Le personnage de la phrase, ou celui de la phrase d'avant (« Il a les yeux verts. »)
            $qui = null;
            if ($tousLesPrenoms && preg_match($tousLesPrenoms, $ph, $mp)) $qui = $parPrenom[mb_strtolower($mp[1])] ?? null;
            if (!$qui && $dernier && preg_match('/^(il|elle|ses|son|sa)\b/iu', $ph)) $qui = $dernier;
            if ($qui) $dernier = $qui;
            if (!$qui) continue;
            foreach (PORTRAIT_TRAITS as $trait => $motif) {
                $motif = str_replace('PRENOM', preg_quote(mb_strtolower(trim((string)$qui['prenom'])), '/'), $motif);
                if (!preg_match($motif, $ph, $m)) continue;
                $m[1] = ($m[1] ?? '') !== '' ? $m[1] : ($m[2] ?? '');
                $valeur = mb_strtolower(rtrim($m[1], 's'));
                $valeur = preg_replace('/e$/u', '', $valeur) ?: $valeur;
                $traits[(int)$qui['id']]['nom'] = trim($qui['prenom'] . ' ' . ($qui['nom'] ?? ''));
                $traits[(int)$qui['id']]['traits'][$trait][] = ['valeur' => $valeur, 'brut' => mb_strtolower($m[1]), 'ep' => (int)$e['id'], 'code' => $code, 'phrase' => mb_substr($ph, 0, 200)];
            }
        }
    }
    $sortie = [];
    foreach ($traits as $id => $t) {
        $contradictions = [];
        foreach ($t['traits'] as $trait => $vus) {
            // Couleur et longueur des cheveux sont deux choses : on ne les oppose pas entre elles
            $groupes = $trait === 'Cheveux'
                ? ['couleur' => array_filter($vus, fn($v) => !preg_match('/^(court|long|bouclé|frisé|raide|rasé)/u', $v['valeur'])), 'coupe' => array_filter($vus, fn($v) => preg_match('/^(court|long|bouclé|frisé|raide|rasé)/u', $v['valeur']))]
                : ['' => $vus];
            foreach ($groupes as $g) {
                $valeurs = array_values(array_unique(array_column($g, 'valeur')));
                if (count($valeurs) > 1 && !in_array($trait, ['Lunettes', 'Barbe'], true)) $contradictions[] = ['trait' => $trait, 'valeurs' => array_values($g)];
            }
        }
        $sortie[] = ['id' => $id, 'nom' => $t['nom'], 'traits' => $t['traits'], 'contradictions' => $contradictions];
    }
    usort($sortie, fn($a, $b) => count($b['contradictions']) <=> count($a['contradictions']));
    return ['personnages' => $sortie];
}

// ─── Théâtre : la conduite lumière et son, tirée des didascalies ───

const CONDUITE_LUMIERE = '/\b(noir|pénombre|obscurité|lumière|lumières|projecteur|poursuite|éclair|s\'éteint|s\'éteignent|s\'allume|s\'allument|lampe|bougie|clair de lune|aube|crépuscule|la nuit tombe|le jour se lève|douche)\b/iu';
const CONDUITE_SON = '/\b(musique|chanson|chante|sonnerie|sonne|téléphone|on frappe|frappe à la porte|coup de feu|détonation|orage|tonnerre|cloche|klaxon|pluie|vent|sirène|radio|disque|piano|bruit|fracas|applaudissements|rires)\b/iu';

function conduiteTheatre(PDO $db): array {
    $rows = $db->query("SELECT e.id, e.numero_episode, e.texte_episode, sa.numero AS acte FROM episodes e JOIN saisons sa ON sa.id = e.saison_id
        WHERE COALESCE(TRIM(e.texte_episode), '') != '' ORDER BY sa.numero, e.numero_episode")->fetchAll();
    $cues = [];
    foreach ($rows as $r) {
        $avant = '';
        foreach (lireTheatre((string)$r['texte_episode'])['evenements'] as [$type, $t, $qui]) {
            if ($type === 'dit') { $avant = ($qui ? "$qui : " : '') . $t; continue; }
            $lum = preg_match(CONDUITE_LUMIERE, $t);
            $son = preg_match(CONDUITE_SON, $t);
            if (!$lum && !$son) continue;
            $mots = preg_split('/\s+/u', trim($avant));
            $cues[] = ['acte' => (int)$r['acte'], 'scene' => (int)$r['numero_episode'], 'ep' => (int)$r['id'],
                'type' => $lum && $son ? 'Lumière et son' : ($lum ? 'Lumière' : 'Son'), 'texte' => mb_substr(trim($t), 0, 240),
                'top' => $avant === '' ? 'début de la scène' : '… ' . implode(' ', array_slice($mots, -8))];
        }
    }
    foreach ($cues as $i => &$c) $c['n'] = $i + 1;
    return ['cues' => $cues];
}

// ─── Série : l'accroche de chaque épisode (la scène avant le générique, ou la première scène) ───

function accrochesSerie(PDO $db): array {
    $sortie = [];
    foreach (episodesAvecScript($db) as $e) {
        $lignes = lignesClassees((string)$e['texte_episode']);
        $total = 0;
        foreach ($lignes as $l) $total += preg_match_all('/[\p{L}\p{N}]+/u', $l['texte']);
        if (!$total) continue;
        // Jusqu'au générique s'il est écrit, sinon la première scène
        $fin = null;
        foreach ($lignes as $i => $l) if (preg_match('/\b(générique|generique|titre de la série|credits)\b/iu', $l['texte']) && $l['type'] !== 'dialogue') { $fin = $i; break; }
        $debut = null;
        foreach ($lignes as $i => $l) if ($l['type'] === 'scene') { $debut = $i; break; }
        if ($debut === null) continue;
        if ($fin === null) { foreach ($lignes as $i => $l) if ($i > $debut && $l['type'] === 'scene') { $fin = $i; break; } }
        $fin ??= count($lignes);
        $bloc = array_slice($lignes, $debut, max(0, $fin - $debut));
        $mots = 0;
        foreach ($bloc as $l) $mots += preg_match_all('/[\p{L}\p{N}]+/u', $l['texte']);
        $derniere = '';
        // La dernière vraie ligne : on saute les transitions (« COUPE SUR : », « FONDU AU NOIR »)
        foreach (array_reverse($bloc) as $l) {
            if (!in_array($l['type'], ['dialogue', 'action'], true)) continue;
            if (preg_match('/^(coupe|cut|fondu|enchaîn|enchain|retour|plus tard|noir|générique|generique|transition|smash)\b[^.!?]*:?\s*$/iu', $l['texte'])) continue;
            $derniere = $l['texte'];
            break;
        }
        $chute = preg_match('/\?\s*[»"]?$/u', $derniere) ? 'question' : (preg_match('/!\s*[»"]?$/u', $derniere) ? 'chute' : (preg_match('/(…|\.\.\.)\s*[»"]?$/u', $derniere) ? 'suspendue' : 'plate'));
        // La dernière vraie ligne de l'épisode (pour repérer les fins qui se répètent d'un épisode à l'autre)
        $finEp = '';
        foreach (array_reverse($lignes) as $l) {
            if (!in_array($l['type'], ['dialogue', 'action'], true) || preg_match('/^(coupe|cut|fondu|enchaîn|enchain|noir|fin|générique|generique|transition)\b[^.!?]*:?\s*$/iu', $l['texte'])) continue;
            $finEp = $l['texte'];
            break;
        }
        $sortie[] = ['id' => (int)$e['id'], 'code' => sprintf('S%dE%02d', $e['saison'], $e['numero_episode']), 'titre' => (string)$e['titre'], 'fin_episode' => mb_substr($finEp, 0, 200), 'generique' => $fin !== null && isset($lignes[$fin]) && $lignes[$fin]['type'] !== 'scene',
            'slug' => $lignes[$debut]['texte'], 'mots' => $mots, 'part' => round($mots * 100 / $total), 'fin' => $chute, 'derniere' => mb_substr($derniere, 0, 160)];
    }
    // Les fins qui se répètent : la même dernière ligne (à la ponctuation et aux accents près) dans plusieurs épisodes
    $groupes = [];
    foreach ($sortie as $x) {
        $k = trim(preg_replace('/[^\p{L}\p{N} ]+/u', '', mb_strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $x['fin_episode']) ?: $x['fin_episode'])));
        if (mb_strlen($k) >= 3) $groupes[$k][] = ['code' => $x['code'], 'id' => $x['id'], 'texte' => $x['fin_episode']];
    }
    $repetees = array_values(array_filter($groupes, fn($g) => count($g) > 1));
    usort($repetees, fn($a, $b) => count($b) <=> count($a));
    return ['episodes' => $sortie, 'fins_repetees' => array_slice($repetees, 0, 30)];
}

// ─── Scénario : les dix premières pages (environ 55 lignes par page) ───

function premieresPages(PDO $db): array {
    $personnages = $db->query('SELECT id, prenom, nom, nom_affichage FROM personnages')->fetchAll();
    $lignesPage = 0;
    $page = 1;
    $premiere = [];
    $repliques = [];
    $premiereReplique = null;
    $scenes = 0;
    $action = $dialogue = 0;
    foreach (episodesAvecScript($db) as $e) {
        foreach (lignesClassees((string)$e['texte_episode']) as $l) {
            $h = $l['type'] === 'action' ? max(1, (int)ceil(mb_strlen($l['texte']) / 61)) + 1 : ($l['type'] === 'dialogue' ? max(1, (int)ceil(mb_strlen($l['texte']) / 35)) : ($l['type'] === 'scene' ? 3 : 1));
            $lignesPage += $h;
            while ($lignesPage > 55) { $lignesPage -= 55; $page++; }
            if ($l['type'] === 'perso' && $l['qui']) {
                $p = matcherPersonnageDepuisNom($l['qui'], $personnages);
                $nom = $p ? personnageLabel($p) : $l['qui'];
                $premiere[$nom] ??= $page;
                $repliques[$nom] = ($repliques[$nom] ?? 0) + 1;
                $premiereReplique ??= $page;
            }
            if ($page <= 10) {
                if ($l['type'] === 'scene') $scenes++;
                if ($l['type'] === 'action') $action += $h;
                if ($l['type'] === 'dialogue') $dialogue += $h;
            }
        }
    }
    arsort($repliques);
    $principaux = array_slice(array_keys($repliques), 0, 4);
    return ['pages' => $page, 'premiere_replique' => $premiereReplique, 'scenes' => $scenes, 'action' => $action + $dialogue ? round($action * 100 / ($action + $dialogue)) : 0,
        'principaux' => array_map(fn($n) => ['nom' => $n, 'page' => $premiere[$n], 'repliques' => $repliques[$n]], $principaux)];
}

// ─── Le chutier : les scènes coupées au fil des versions, qu'on peut retrouver et reprendre ───

function scenesDe(string $texte): array {
    $scenes = [];
    $cour = null;
    foreach (explode("\n", str_replace("\r", '', $texte)) as $ligne) {
        if (preg_match('/^\s*(INT|EXT)\b/iu', $ligne)) { if ($cour) $scenes[] = $cour; $cour = ['slug' => trim($ligne), 'texte' => $ligne . "\n"]; continue; }
        if ($cour) $cour['texte'] .= $ligne . "\n";
    }
    if ($cour) $scenes[] = $cour;
    return $scenes;
}

function chutier(PDO $db): array {
    $db->exec("CREATE TABLE IF NOT EXISTS brouillon_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, episode_id INTEGER NOT NULL, texte TEXT NOT NULL, motif TEXT NOT NULL, mots INTEGER NOT NULL, cree_le TEXT NOT NULL DEFAULT (datetime('now', 'localtime')))");
    $norme = fn($t) => md5(mb_strtolower(preg_replace('/\s+/u', ' ', trim($t))));
    $episodes = $db->query('SELECT e.id, e.numero_episode, e.titre, e.texte_episode, s.numero AS saison FROM episodes e JOIN saisons s ON s.id = e.saison_id ORDER BY s.numero, e.numero_episode')->fetchAll();
    $brouillon = $db->prepare('SELECT valeur FROM analyse_notes WHERE cle = ?');
    $versions = $db->prepare('SELECT id, texte, motif, cree_le FROM brouillon_versions WHERE episode_id = ? ORDER BY id DESC');
    $sortie = [];
    foreach ($episodes as $e) {
        $brouillon->execute(['brouillon:' . $e['id']]);
        $actuel = (string)$e['texte_episode'] . "\n" . (string)$brouillon->fetchColumn();
        // Ce qui est encore là : les en-têtes et les textes de scène du script et du brouillon
        $presents = [];
        $titres = [];
        foreach (scenesDe($actuel) as $sc) { $presents[$norme($sc['texte'])] = true; $titres[mb_strtolower($sc['slug'])] = true; }
        $versions->execute([(int)$e['id']]);
        $vus = [];
        foreach ($versions->fetchAll() as $v) {
            foreach (scenesDe((string)$v['texte']) as $sc) {
                $h = $norme($sc['texte']);
                // Coupée : ni ce texte, ni une scène du même en-tête dans la version actuelle
                if (isset($presents[$h]) || isset($titres[mb_strtolower($sc['slug'])]) || isset($vus[$h])) continue;
                $vus[$h] = true;
                $mots = preg_match_all('/[\p{L}\p{N}]+/u', $sc['texte']);
                if ($mots < 8) continue;
                $sortie[] = ['ep' => (int)$e['id'], 'code' => sprintf('S%dE%02d', $e['saison'], $e['numero_episode']), 'titre' => (string)$e['titre'],
                    'slug' => $sc['slug'], 'texte' => mb_substr($sc['texte'], 0, 20000), 'mots' => $mots, 'version' => (string)$v['cree_le'], 'motif' => (string)$v['motif']];
                if (count($sortie) >= 500) break 3;
            }
        }
    }
    return ['scenes' => $sortie];
}

// ─── Les registres de langue : tutoiement, vouvoiement, argot et mots soutenus, pour chaque personnage ───

const REGISTRE_ARGOT = ['mec', 'meuf', 'ouf', 'bouffe', 'bouffer', 'boulot', 'flic', 'flics', 'fric', 'thune', 'bagnole', 'truc', 'trucs', 'bordel', 'putain', 'merde', 'genre', 'kiffer', 'kiffe', 'grave', 'chelou', 'relou', 'ouais', 'nan', 'bah', 'ben', 'pote', 'potes', 'zarb', 'taf', 'pognon', 'crever', 'flinguer', 'bosser', 'bouquin', 'fringues', 'gamin', 'gosse', 'mioche', 'chiant', 'chiante', 'bourré', 'piaule', 'clope', 'teuf'];
const REGISTRE_SOUTENU = ['néanmoins', 'toutefois', 'cependant', 'certes', 'naguère', 'jadis', 'quérir', 'demeure', 'demeurer', 'souhaiterais', 'voudriez', 'pourriez', 'auriez', 'veuillez', 'je vous prie', 'nonobstant', 'ainsi', 'dorénavant', 'désormais', 'aucunement', 'guère', 'sauriez', 'daigner', 'je crains', 'fort bien', 'entendu'];

function registresVoix(PDO $db): array {
    $personnages = $db->query('SELECT id, prenom, nom, nom_affichage FROM personnages')->fetchAll();
    $parQui = [];
    foreach (episodesAvecScript($db) as $e) {
        $saison = (int)$e['saison'];
        foreach (lignesClassees((string)$e['texte_episode']) as $l) {
            if ($l['type'] !== 'dialogue' || $l['qui'] === null) continue;
            $p = matcherPersonnageDepuisNom($l['qui'], $personnages);
            $nom = $p ? personnageLabel($p) : mb_convert_case(mb_strtolower($l['qui']), MB_CASE_TITLE);
            $t = ' ' . mb_strtolower(str_replace("\u{2019}", "'", $l['texte'])) . ' ';
            preg_match_all('/[\p{L}]+/u', $t, $m);
            $c = &$parQui[$nom];
            $c['mots'] = ($c['mots'] ?? 0) + count($m[0]);
            $c['tu'] = ($c['tu'] ?? 0) + preg_match_all("/(?<![\p{L}])(tu|t'|toi|te|ton|ta|tes)(?![\p{L}])/u", $t);
            $c['vous'] = ($c['vous'] ?? 0) + preg_match_all('/(?<![\p{L}])(vous|votre|vos)(?![\p{L}])/u', $t);
            $argot = count(array_intersect($m[0], REGISTRE_ARGOT));
            $soutenu = 0;
            foreach (REGISTRE_SOUTENU as $w) $soutenu += substr_count($t, " $w ");
            $c['argot'] = ($c['argot'] ?? 0) + $argot;
            $c['soutenu'] = ($c['soutenu'] ?? 0) + $soutenu;
            $c['saisons'][$saison]['mots'] = ($c['saisons'][$saison]['mots'] ?? 0) + count($m[0]);
            $c['saisons'][$saison]['argot'] = ($c['saisons'][$saison]['argot'] ?? 0) + $argot;
            unset($c);
        }
    }
    uasort($parQui, fn($a, $b) => $b['mots'] <=> $a['mots']);
    $sortie = [];
    foreach (array_slice($parQui, 0, 14, true) as $nom => $c) {
        if ($c['mots'] < 200) continue;
        // Le registre change-t-il d'une saison à l'autre ? (argot pour 1 000 mots, saisons d'au moins 300 mots)
        $taux = [];
        foreach ($c['saisons'] as $sa => $v) if ($v['mots'] >= 300) $taux[$sa] = round($v['argot'] * 1000 / $v['mots'], 1);
        $sortie[] = ['nom' => $nom, 'mots' => $c['mots'], 'tu' => $c['tu'], 'vous' => $c['vous'],
            'argot' => round($c['argot'] * 1000 / $c['mots'], 1), 'soutenu' => round($c['soutenu'] * 1000 / $c['mots'], 1),
            'saisons' => $taux, 'change' => count($taux) > 1 && max($taux) - min($taux) >= 3];
    }
    return ['personnages' => $sortie];
}
