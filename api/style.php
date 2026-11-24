<?php
// api/style.php — La feuille de style du projet : une typographie et des graphies communes à tous les scripts.
// « Vérifier » compte ce qui s'en écarte, épisode par épisode, avec des exemples ; « Corriger » applique les choix
// cochés, après avoir gardé l'ancien texte dans les Versions. Les mots eux-mêmes ne changent jamais, sauf les
// graphies que l'on a écrites soi-même (ou acceptées depuis les noms détectés).

const STYLE_REGLES = [
    'apostrophe' => 'Apostrophes courbes (l’atelier)',
    'guillemets' => 'Guillemets français « … »',
    'points' => 'Points de suspension en un signe (…)',
    'espaces' => 'Espace insécable avant : ; ! ?',
    'doubles' => 'Une seule espace entre deux mots',
];
const STYLE_GRAPHIES_MAX = 300;

function lireFeuilleStyle(PDO $db): array {
    $st = $db->prepare('SELECT valeur FROM analyse_notes WHERE cle = ?');
    $st->execute(['feuille-style']);
    $v = json_decode((string)$st->fetchColumn(), true);
    $v = is_array($v) ? $v : [];
    $typo = [];
    foreach (array_keys(STYLE_REGLES) as $r) $typo[$r] = !empty($v['typo'][$r]);
    $graphies = [];
    foreach (array_slice(is_array($v['graphies'] ?? null) ? $v['graphies'] : [], 0, STYLE_GRAPHIES_MAX) as $g) {
        if (!is_array($g)) continue;
        $bonne = trim(mb_substr((string)($g['bonne'] ?? ''), 0, 80));
        $variantes = array_values(array_filter(array_map(fn($x) => trim(mb_substr((string)$x, 0, 80)), is_array($g['variantes'] ?? null) ? array_slice($g['variantes'], 0, 20) : []),
            fn($x) => $x !== '' && $x !== $bonne));
        if ($bonne !== '' && $variantes) $graphies[] = ['bonne' => $bonne, 'variantes' => $variantes, 'noms' => !empty($g['noms'])];
    }
    return ['typo' => $typo, 'graphies' => $graphies];
}

// Chaque règle : un motif et son remplacement. Une graphie « noms » ne touche que les lignes de nom (en-têtes de réplique).
function reglesStyle(array $style): array {
    $regles = [];
    $t = $style['typo'];
    if ($t['apostrophe']) $regles[] = ['apostrophe', "/(?<=\\p{L})'(?=\\p{L})/u", fn($m) => '’'];
    if ($t['guillemets']) {
        $regles[] = ['guillemets', '/"([^"\n]{1,400})"/u', fn($m) => "«\u{00A0}" . trim($m[1]) . "\u{00A0}»"];
        $regles[] = ['guillemets', "/«[ \t]*(?=\\S)/u", fn($m) => $m[0] === "«\u{00A0}" ? $m[0] : "«\u{00A0}"];
        $regles[] = ['guillemets', "/(?<=\\S)[ \t]*»/u", fn($m) => $m[0] === "\u{00A0}»" ? $m[0] : "\u{00A0}»"];
    }
    if ($t['points']) $regles[] = ['points', '/(?<!\.)\.\.\.(?!\.)/u', fn($m) => '…'];
    if ($t['espaces']) {
        // Fine insécable avant ; ! ? et insécable avant : (pas dans une heure comme 10:30, ni dans une adresse)
        $regles[] = ['espaces', "/(?<=[\\p{L}\\p{N}»)\\]…])[ \t\u{00A0}]?([;!?])/u", fn($m) => $m[0] === "\u{202F}" . $m[1] ? $m[0] : "\u{202F}" . $m[1]];
        $regles[] = ['espaces', "/(?<=[\\p{L}\\p{N}»)\\]…])[ \t\u{202F}]?:(?![\\/\\d])/u", fn($m) => $m[0] === "\u{00A0}:" ? $m[0] : "\u{00A0}:"];
    }
    if ($t['doubles']) $regles[] = ['doubles', '/(?<=\S) {2,}(?=\S)/u', fn($m) => ' '];
    foreach ($style['graphies'] as $g) {
        foreach ($g['variantes'] as $v) {
            $q = preg_quote($v, '/');
            $motif = $g['noms']
                ? '/^([ \t]*)' . $q . '(?=[ \t]*(?:\(|$))/imu'
                : '/(?<![\p{L}\p{N}])' . $q . '(?![\p{L}\p{N}])/iu';
            $bonne = $g['bonne'];
            $regles[] = ['graphie:' . $bonne, $motif, $g['noms']
                ? fn($m) => $m[1] . remplacementAdapte(trim(mb_substr($m[0], mb_strlen($m[1]))), $bonne, false)
                : fn($m) => remplacementAdapte($m[0], $bonne, false)];
        }
    }
    return $regles;
}

// Le texte corrigé, le nombre de changements par règle, et quelques exemples
function appliquerStyle(string $texte, array $regles, bool $exemples = false): array {
    $comptes = [];
    $extraits = [];
    foreach ($regles as [$nom, $motif, $par]) {
        $n = 0;
        $nouveau = preg_replace_callback($motif, function ($m) use ($par, &$n, &$extraits, $nom, $exemples, &$texte) {
            $r = $par($m);
            if ($r !== $m[0]) {
                $n++;
                if ($exemples && count($extraits) < 4) $extraits[] = ['regle' => $nom, 'avant' => $m[0], 'apres' => $r];
            }
            return $r;
        }, $texte);
        if ($nouveau === null) continue;
        $texte = $nouveau;
        if ($n) $comptes[$nom] = ($comptes[$nom] ?? 0) + $n;
    }
    return [$texte, $comptes, $extraits];
}

function handleFeuilleStyle(PDO $db, string $method, array $body): void {
    if ($method === 'GET') {
        echo json_encode(['style' => lireFeuilleStyle($db), 'regles' => STYLE_REGLES, 'suggestions' => suggestionsGraphies($db)], JSON_UNESCAPED_UNICODE);
        return;
    }
    $style = lireFeuilleStyle($db);
    $regles = reglesStyle($style);
    if (!$regles) { echo json_encode(['episodes' => [], 'total' => 0]); return; }
    $appliquer = ($body['action'] ?? '') === 'appliquer';
    $choisis = array_flip(array_map('intval', is_array($body['ids'] ?? null) ? $body['ids'] : []));
    $notes = $db->prepare('SELECT valeur FROM analyse_notes WHERE cle = ?');
    $episodes = $db->query('SELECT e.id, e.numero_episode, e.titre, e.texte_episode, s.numero AS saison FROM episodes e JOIN saisons s ON s.id = e.saison_id ORDER BY s.numero, e.numero_episode, e.id')->fetchAll();
    $sortie = [];
    $total = 0;
    if ($appliquer) $db->beginTransaction();
    try {
        foreach ($episodes as $e) {
            $id = (int)$e['id'];
            if ($appliquer && !isset($choisis[$id])) continue;
            $script = (string)$e['texte_episode'];
            $notes->execute(["brouillon:$id"]);
            $brouillon = (string)$notes->fetchColumn();
            [$scriptNeuf, $comptes, $extraits] = appliquerStyle($script, $regles, !$appliquer);
            [$brouillonNeuf, $comptesB] = appliquerStyle($brouillon, $regles);
            $n = array_sum($comptes) + array_sum($comptesB);
            if (!$n) continue;
            $total += $n;
            if (!$appliquer) {
                foreach ($comptesB as $k => $v) $comptes[$k] = ($comptes[$k] ?? 0) + $v;
                $sortie[] = ['id' => $id, 'saison' => (int)$e['saison'], 'numero' => (int)$e['numero_episode'], 'titre' => (string)$e['titre'], 'comptes' => $comptes, 'extraits' => $extraits];
                continue;
            }
            $motif = 'Avant la feuille de style';
            if ($scriptNeuf !== $script) {
                versionsBrouillon($db, 'POST', ['episode_id' => $id, 'texte' => $script, 'motif' => $motif]);
                enregistrerScriptEpisode($db, $id, $scriptNeuf);
            }
            if ($brouillonNeuf !== $brouillon) {
                versionsBrouillon($db, 'POST', ['episode_id' => $id, 'texte' => $brouillon, 'motif' => "$motif (brouillon)"]);
                ecrireNoteBrute($db, "brouillon:$id", $brouillonNeuf);
            }
            $sortie[] = ['id' => $id];
        }
        if ($appliquer) $db->commit();
    } catch (Throwable $ex) {
        if ($appliquer && $db->inTransaction()) $db->rollBack();
        throw $ex;
    }
    echo json_encode(['episodes' => $sortie, 'total' => $total], JSON_UNESCAPED_UNICODE);
}

/**
 * Les noms de réplique écrits de plusieurs façons pour un même personnage (« HIPPO. », « HIPPO » …) :
 * la forme la plus fréquente est proposée comme la bonne. Seulement les lignes de nom, jamais les dialogues.
 */
function suggestionsGraphies(PDO $db): array {
    $personnages = $db->query('SELECT id, prenom, nom, nom_affichage FROM personnages')->fetchAll();
    $parPerso = [];
    $courtes = [];
    foreach ($db->query('SELECT nom, SUM(nb_repliques) AS n FROM episode_stat_personnages GROUP BY nom')->fetchAll() as $row) {
        $brut = trim((string)$row['nom']);
        if ($brut === '') continue;
        $p = matcherPersonnageDepuisNom($brut, $personnages);
        if (!$p) continue;
        // Le prénom seul ou le nom seul : une forme courte voulue, pas une faute
        $n = normaliserNomPersoPourMatch($brut);
        if (in_array($n, [normaliserNomPersoPourMatch((string)$p['prenom']), normaliserNomPersoPourMatch((string)$p['nom']), normaliserNomPersoPourMatch((string)$p['nom_affichage'])], true)
            && preg_match('/^[\p{L}\'’ -]+$/u', $brut) && mb_strpos(trim($brut), ' ') === false) { $courtes[(int)$p['id']] = true; continue; }
        $parPerso[(int)$p['id']][$brut] = (int)$row['n'];
    }
    $sortie = [];
    foreach ($parPerso as $formes) {
        if (count($formes) < 2) continue;
        arsort($formes);
        $bonne = array_key_first($formes);
        $variantes = array_values(array_filter(array_keys($formes), fn($f) => $f !== $bonne));
        if ($variantes) $sortie[] = ['bonne' => $bonne, 'variantes' => array_slice($variantes, 0, 10), 'noms' => true, 'repliques' => array_sum($formes)];
    }
    usort($sortie, fn($a, $b) => $b['repliques'] <=> $a['repliques']);
    return array_slice($sortie, 0, 60);
}
