<?php
// api/parcours.php — Le parcours d'un personnage, épisode par épisode : ses répliques, ses moments décisifs,
// ses états (absent, brouillé…), et l'âge qu'il dit avoir ou qu'on lui donne dans les dialogues.
// Les incohérences sont signalées (un âge qui recule, un âge qui ne colle pas à la fiche ou à la date de naissance) :
// l'app ne corrige rien, elle montre où regarder.

// Un âge écrit en lettres (« trente-deux », « quatre-vingt-un ») : de 1 à 120, sinon null
function nombreEnLettres(string $t): ?int {
    $unites = ['un' => 1, 'une' => 1, 'deux' => 2, 'trois' => 3, 'quatre' => 4, 'cinq' => 5, 'six' => 6, 'sept' => 7, 'huit' => 8, 'neuf' => 9, 'dix' => 10,
        'onze' => 11, 'douze' => 12, 'treize' => 13, 'quatorze' => 14, 'quinze' => 15, 'seize' => 16, 'vingt' => 20, 'vingts' => 20, 'trente' => 30, 'quarante' => 40,
        'cinquante' => 50, 'soixante' => 60, 'cent' => 100];
    $mots = preg_split('/[\s-]+/u', mb_strtolower(trim($t)));
    $total = 0;
    $courant = 0;
    foreach ($mots as $m) {
        if ($m === 'et' || $m === '') continue;
        if (!isset($unites[$m])) return null;
        $v = $unites[$m];
        if ($v === 20 && $courant === 4) $courant = 80;          // quatre-vingt
        elseif ($v === 100) $courant = max(1, $courant) * 100;
        elseif ($v === 10 && $courant % 10 === 0 && $courant >= 60) $courant += 10; // soixante-dix, quatre-vingt-dix
        elseif ($v < 10 && $courant >= 10 && $courant % 10 === 0 && $courant !== 0) $courant += $v; // vingt-deux, dix-sept
        elseif ($v < 20 && $courant >= 60 && $courant % 20 === 0) $courant += $v;  // soixante-douze, quatre-vingt-onze
        elseif ($courant === 0) $courant = $v;
        else return null;
    }
    $total += $courant;
    return $total >= 1 && $total <= 120 ? $total : null;
}

function ageDit(string $brut): ?int {
    return ctype_digit($brut) ? (int)$brut : nombreEnLettres($brut);
}

// Les âges dits dans un script : « j'ai 34 ans » dans ses répliques, « Paul a 34 ans » dans la bouche des autres
function agesDansScript(string $texte, array $personnage, array $personnages): array {
    $prenom = trim((string)$personnage['prenom']);
    $trouves = [];
    $qui = null;
    $lignes = explode("\n", str_replace(["\r", "\u{2019}"], ['', "'"], $texte));
    foreach ($lignes as $ligne) {
        $t = trim($ligne);
        if ($t === '') { $qui = null; continue; }
        // Un nom de réplique : une ligne courte en capitales, qui n'est pas un en-tête de scène
        if (mb_strlen($t) <= 40 && $t === mb_strtoupper($t) && preg_match('/\p{Lu}/u', $t) && !estSlugline($t)) {
            $nom = trim(preg_replace('/\s*\(.*$/u', '', $t), " .:");
            $p = matcherPersonnageDepuisNom($nom, $personnages);
            $qui = $p ? (int)$p['id'] : -1;
            continue;
        }
        $nombre = "(\\d{1,3}|[\\p{L}]+(?:[\\s-]+(?:et[\\s-]+)?[\\p{L}]+){0,3})";
        if ($qui === (int)$personnage['id'] && preg_match("/\\bj'ai\\s+$nombre\\s+ans\\b/iu", $t, $m) && ($age = ageDit($m[1])) !== null) {
            $trouves[] = ['age' => $age, 'qui' => 'lui', 'extrait' => mb_substr($t, 0, 160)];
        } elseif ($prenom !== '' && mb_strlen($prenom) >= 2 && preg_match('/(?<![\p{L}])' . preg_quote($prenom, '/') . "(?![\\p{L}])[^.!?\\n]{0,30}?\\b(?:a|aura|avait|fête ses|vient d'avoir)\\s+$nombre\\s+ans\\b/iu", $t, $m) && ($age = ageDit($m[1])) !== null) {
            $trouves[] = ['age' => $age, 'qui' => 'autre', 'extrait' => mb_substr($t, 0, 160)];
        }
    }
    return array_slice($trouves, 0, 10);
}

function parcoursPersonnage(PDO $db, int $id): array {
    $st = $db->prepare('SELECT * FROM personnages WHERE id = ?');
    $st->execute([$id]);
    $p = $st->fetch();
    if (!$p) return ['error' => 'Personnage introuvable.'];
    $personnages = $db->query('SELECT id, prenom, nom, nom_affichage FROM personnages')->fetchAll();
    $episodes = $db->query('SELECT e.id, e.numero_episode, e.titre, e.date_diege, e.texte_episode, s.numero AS saison FROM episodes e JOIN saisons s ON s.id = e.saison_id ORDER BY s.numero, e.numero_episode, e.id')->fetchAll();

    $repliques = [];
    $st = $db->prepare('SELECT episode_id, nb_repliques, present FROM episode_personnages WHERE personnage_id = ?');
    $st->execute([$id]);
    foreach ($st->fetchAll() as $r) $repliques[(int)$r['episode_id']] = ['n' => (int)$r['nb_repliques'], 'present' => (bool)$r['present']];

    $moments = [];
    $st = $db->prepare('SELECT episode_id, titre, type_moment, description FROM personnage_moments_decisifs WHERE personnage_id = ? ORDER BY id');
    $st->execute([$id]);
    foreach ($st->fetchAll() as $m) $moments[(int)$m['episode_id']][] = ['titre' => (string)$m['titre'], 'type' => (string)$m['type_moment'], 'description' => (string)$m['description']];

    // Les états qui le concernent (le nom de l'état est celui d'une réplique)
    $debuts = [];
    $fins = [];
    foreach (function_exists('lireEtats') ? lireEtats($db) : [] as $e) {
        $q = matcherPersonnageDepuisNom($e['nom'], $personnages);
        if (!$q || (int)$q['id'] !== $id) continue;
        $libelle = trim($e['texte'] ?: ($e['type'] === 'absent' ? 'absent' : ($e['type'] === 'brouille' ? "brouillé avec {$e['avec']}" : 'situation')));
        $debuts[$e['debut']][] = $libelle;
        if ($e['fin'] !== null) $fins[$e['fin']][] = $libelle;
    }

    $naissance = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$p['date_naissance']) ? new DateTime($p['date_naissance']) : null;
    $ageFiche = is_numeric($p['age']) ? (int)$p['age'] : null;
    $sortie = [];
    $alertes = [];
    $dernierAge = null;
    $premier = null;
    $dernier = null;
    $absence = ['n' => 0, 'de' => null, 'a' => null];
    $sansLui = 0;
    $avant = null;
    foreach ($episodes as $e) {
        $eid = (int)$e['id'];
        $code = sprintf('S%dE%02d', $e['saison'], $e['numero_episode']);
        $r = $repliques[$eid] ?? ['n' => 0, 'present' => false];
        $la = $r['n'] > 0 || $r['present'];
        if ($la) {
            if ($premier === null) $premier = $code;
            $dernier = $code;
            if ($avant !== null && $sansLui > $absence['n']) $absence = ['n' => $sansLui, 'de' => $avant, 'a' => $code];
            $avant = $code;
            $sansLui = 0;
        } elseif ($avant !== null && trim((string)$e['texte_episode']) !== '') {
            $sansLui++;
        }
        $ages = trim((string)$e['texte_episode']) !== '' ? agesDansScript((string)$e['texte_episode'], $p, $personnages) : [];
        $attendu = null;
        if ($naissance && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$e['date_diege'])) $attendu = $naissance->diff(new DateTime($e['date_diege']))->y;
        foreach ($ages as $a) {
            if ($attendu !== null && abs($a['age'] - $attendu) > 1) $alertes[] = ['ep' => $eid, 'code' => $code, 'texte' => "{$a['age']} ans dans le dialogue, mais {$attendu} ans d'après sa date de naissance et la date de l'épisode."];
            if ($dernierAge && $a['age'] < $dernierAge['age']) $alertes[] = ['ep' => $eid, 'code' => $code, 'texte' => "{$a['age']} ans ici, alors qu'il en avait déjà {$dernierAge['age']} en {$dernierAge['code']}."];
            if ($attendu === null && $ageFiche !== null && abs($a['age'] - $ageFiche) > 2 && !$naissance) $alertes[] = ['ep' => $eid, 'code' => $code, 'texte' => "{$a['age']} ans dans le dialogue, la fiche dit {$ageFiche} ans."];
            $dernierAge = ['age' => $a['age'], 'code' => $code];
        }
        $evenement = $la || isset($moments[$eid]) || isset($debuts[$eid]) || isset($fins[$eid]) || $ages;
        if (!$evenement) continue;
        $sortie[] = ['id' => $eid, 'code' => $code, 'titre' => (string)$e['titre'], 'date' => (string)$e['date_diege'], 'repliques' => $r['n'], 'present' => $la,
            'moments' => $moments[$eid] ?? [], 'debut' => $debuts[$eid] ?? [], 'fin' => $fins[$eid] ?? [], 'ages' => $ages, 'age_attendu' => $attendu];
    }
    // Les absents des grandes scènes : un repas, une fête, une réunion, ou au moins quatre personnages qui parlent,
    // sans ce personnage principal (et sans que le texte dise pourquoi : à vérifier)
    $absents = [];
    if ((int)$p['est_principal'] === 2 && function_exists('lignesClassees')) {
        $groupe = '/\b(repas|d[îi]ner|d[ée]jeuner|f[êe]te|anniversaire|mariage|r[ée]union|soir[ée]e|enterrement|no[ëe]l|r[ée]veillon|tous ensemble|toute la bande|toute la famille)\b/iu';
        foreach ($episodes as $e) {
            if (trim((string)$e['texte_episode']) === '') continue;
            $code = sprintf('S%dE%02d', $e['saison'], $e['numero_episode']);
            $scene = null;
            $finir = function () use (&$scene, &$absents, $id, $code, $e, $groupe) {
                if (!$scene) return;
                $parlent = count($scene['qui']);
                $theme = preg_match($groupe, $scene['texte']);
                if (($parlent >= 4 || ($theme && $parlent >= 3)) && !isset($scene['qui'][$id]) && !preg_match('/\b(absent|manque|n\'est pas là|pas venu|parti)\b/iu', $scene['texte'])) {
                    $absents[] = ['ep' => (int)$e['id'], 'code' => $code, 'slug' => $scene['slug'], 'parlent' => $parlent, 'groupe' => (bool)$theme];
                }
            };
            foreach (lignesClassees((string)$e['texte_episode']) as $l) {
                if ($l['type'] === 'scene') { $finir(); $scene = ['slug' => $l['texte'], 'qui' => [], 'texte' => $l['texte']]; continue; }
                if (!$scene) continue;
                if (mb_strlen($scene['texte']) < 1500) $scene['texte'] .= ' ' . $l['texte'];
                if ($l['type'] === 'perso' && $l['qui']) { $q = matcherPersonnageDepuisNom($l['qui'], $personnages); if ($q) $scene['qui'][(int)$q['id']] = true; }
            }
            $finir();
        }
    }
    return [
        'absents' => array_slice($absents, 0, 30),
        'personnage' => ['id' => $id, 'nom' => personnageLabel($p), 'age' => $ageFiche, 'naissance' => $naissance ? $p['date_naissance'] : null, 'profession' => (string)$p['profession']],
        'premier' => $premier, 'dernier' => $dernier, 'absence' => $absence['n'] >= 2 ? $absence : null,
        'episodes' => $sortie, 'alertes' => $alertes,
    ];
}

function handleParcours(PDO $db, string $method): void {
    echo json_encode($method === 'GET' ? parcoursPersonnage($db, (int)($_GET['id'] ?? 0)) : ['error' => 'GET attendu'], JSON_UNESCAPED_UNICODE);
}
