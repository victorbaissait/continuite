<?php
// api/calendrier.php — Repères du calendrier : ce que le texte dit du temps qu'il fait et du jour qu'il est,
// comparé aux dates des épisodes. Fêtes hors saison, jour de la semaine, chevauchements, anniversaires, âges

// Ce que le texte évoque, et les mois où ça tombe
const CALENDRIER_FETES = [
    // Le père Noël est un personnage, pas une date
    'Noël' => ['/(?<!p[eè]re )\bno[eë]l\b|\br[ée]veillon de no[eë]l\b/iu', [11, 12, 1]],
    'le Nouvel An' => ['/\bnouvel an\b|\bbonne ann[ée]e\b|\bsaint[- ]sylvestre\b/iu', [12, 1]],
    'la galette des rois' => ['/\bgalette des rois\b|\b[ée]piphanie\b/iu', [1]],
    'la Saint-Valentin' => ['/\bsaint[- ]valentin\b/iu', [2]],
    'Pâques' => ['/\bp[âa]ques\b/iu', [3, 4, 5]],
    'la fête de la musique' => ['/\bf[êe]te de la musique\b/iu', [6]],
    'le 14 Juillet' => ['/\b14 juillet\b|\bf[êe]te nationale\b/iu', [7]],
    'les grandes vacances' => ['/\bgrandes vacances\b/iu', [6, 7, 8, 9]],
    'la rentrée' => ['/\bla rentr[ée]e\b/iu', [8, 9, 10]],
    'Halloween' => ['/\bhalloween\b/iu', [10, 11]],
    'la neige' => ['/\bneige\b|\bbonhomme de neige\b|\bflocons?\b/iu', [11, 12, 1, 2, 3, 4]],
    'la canicule' => ['/\bcanicule\b/iu', [6, 7, 8, 9]],
];
const CALENDRIER_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const CALENDRIER_MOIS = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// « trente-deux », « soixante et onze », « 45 » : l'âge tel qu'un personnage le dit
function nombreFrancais(string $t): ?int {
    $t = trim(mb_strtolower($t));
    if (preg_match('/^\d{1,3}$/', $t)) return (int)$t;
    $unites = ['un' => 1, 'une' => 1, 'deux' => 2, 'trois' => 3, 'quatre' => 4, 'cinq' => 5, 'six' => 6, 'sept' => 7, 'huit' => 8, 'neuf' => 9, 'dix' => 10, 'onze' => 11, 'douze' => 12, 'treize' => 13, 'quatorze' => 14, 'quinze' => 15, 'seize' => 16];
    $dizaines = ['vingt' => 20, 'trente' => 30, 'quarante' => 40, 'cinquante' => 50, 'soixante' => 60, 'quatre-vingt' => 80, 'quatre-vingts' => 80];
    $t = preg_replace('/\s+et\s+/u', '-', $t);
    $t = str_replace(' ', '-', $t);
    if (isset($unites[$t])) return $unites[$t];
    if (preg_match('/^dix-(sept|huit|neuf)$/u', $t, $m)) return 10 + $unites[$m[1]];
    foreach ($dizaines as $mot => $v) {
        if ($t === $mot) return $v;
        if (str_starts_with($t, "$mot-")) {
            $reste = substr($t, strlen($mot) + 1);
            if (isset($unites[$reste])) return $v + $unites[$reste];
            if ($reste === 'dix') return $v + 10;
            if (preg_match('/^dix-(sept|huit|neuf)$/u', $reste, $m)) return $v + 10 + $unites[$m[1]];
        }
    }
    return null;
}

// Les anachronismes : des choses qui n'existaient pas encore à la date de l'épisode (année de première diffusion grand public)
const CALENDRIER_INVENTIONS = [
    ['smartphone', '/\bsmartphones?\b/iu', 2007], ['iPhone', '/\biphones?\b/iu', 2007], ['Facebook', '/\bfacebook\b/iu', 2004], ['Twitter', '/\btwitter\b|\btweet(?:s|é|er)?\b/iu', 2006],
    ['Instagram', '/\binstagram\b/iu', 2010], ['WhatsApp', '/\bwhatsapp\b/iu', 2009], ['TikTok', '/\btik ?tok\b/iu', 2016], ['YouTube', '/\byoutube(?:r|rs|use)?\b/iu', 2005],
    ['Google', '/\bgoogle\b|\bgoogl(?:er|é)\b/iu', 1998], ['Wikipédia', '/\bwikip[ée]dia\b/iu', 2001], ['le wifi', '/\bwi-?fi\b/iu', 1999], ['Netflix', '/\bnetflix\b/iu', 2007],
    ['Uber', '/\buber\b/iu', 2009], ['un selfie', '/\bselfies?\b/iu', 2012], ['un emoji', '/\b[ée]mojis?\b/iu', 2010], ['le bitcoin', '/\bbitcoins?\b/iu', 2009],
    ['une clé USB', '/\bcl[ée]s? usb\b/iu', 2000], ['le Bluetooth', '/\bbluetooth\b/iu', 1999], ['un GPS', '/\bgps\b/iu', 2000], ['un lecteur MP3', '/\bmp3\b/iu', 1998],
    ['un DVD', '/\bdvds?\b/iu', 1996], ['un SMS', '/\bsms\b|\btexto(?:s)?\b/iu', 1994], ['un e-mail', '/\be-?mails?\b|\bcourriels?\b/iu', 1990], ['un CD', '/\b(?:un|des|le|les|ce) cd\b/iu', 1982],
    ['l\'euro (pièces et billets)', '/\b\d+[\s\x{00A0}]*(?:euros?|€)/iu', 2002], ['le Covid', '/\bcovid\b|\bconfinement\b/iu', 2020], ['Zoom (visioconférence)', '/\bsur zoom\b|\ben visio\b/iu', 2020],
];

function calendrierSerie(PDO $db): array {
    $episodes = scenesSecrets($db);
    $alertes = [];
    $parId = [];
    foreach ($episodes as $e) $parId[$e['id']] = $e;
    $moments = [];
    foreach ($db->query('SELECT id, moment_journee FROM episodes')->fetchAll() as $r) $moments[(int)$r['id']] = (string)$r['moment_journee'];
    $dates = array_filter(array_column($episodes, 'date'));
    $periode = $dates ? ['debut' => min($dates), 'fin' => max($dates)] : null;

    $repliques = [];
    foreach ($episodes as $e) {
        if (!$e['date'] || $e['flashback']) continue;
        $mois = (int)substr($e['date'], 5, 2);
        $jour = (int)date('w', strtotime($e['date']));
        $vus = [];
        foreach ($e['scenes'] as $sc) {
            foreach ($sc['lignes'] as [$qui, $t]) {
                // 1. Une fête ou une saison évoquée au mauvais moment de l'année ; « Noël dernier » n'en est pas une
                foreach (CALENDRIER_FETES as $fete => [$motif, $moisOk]) {
                    if (isset($vus[$fete]) || in_array($mois, $moisOk, true) || !preg_match($motif, $t, $m, PREG_OFFSET_CAPTURE)) continue;
                    $apres = mb_strtolower(substr($t, $m[0][1], 60));
                    $avant = mb_strtolower(substr($t, max(0, $m[0][1] - 30), min(30, $m[0][1])));
                    if (preg_match('/dernier|derni[èe]re|prochain|prochaine|pass[ée]|l\'an|l\'ann[ée]e|souvenir|r[êe]v|quand|depuis|jusqu|avant|apr[èe]s|chaque|tous les/u', $apres . ' ' . $avant)) continue;
                    $vus[$fete] = true;
                    $alertes[] = ['type' => 'fete', 'ep' => $e['id'], 'i' => $sc['i'], 'fete' => $fete, 'mois' => CALENDRIER_MOIS[$mois], 'extrait' => extraitSecret($t, mb_strtolower(trim($m[0][0])))];
                }
                // 1 bis. Un objet ou un mot qui n'existait pas encore à la date de l'épisode
                $annee = (int)substr($e['date'], 0, 4);
                foreach (CALENDRIER_INVENTIONS as [$quoi, $motif, $depuis]) {
                    if ($annee >= $depuis || isset($vus["anachro:$quoi"]) || !preg_match($motif, $t, $m)) continue;
                    $vus["anachro:$quoi"] = true;
                    $alertes[] = ['type' => 'anachronisme', 'ep' => $e['id'], 'i' => $sc['i'], 'quoi' => $quoi, 'depuis' => $depuis, 'annee' => $annee, 'extrait' => extraitSecret($t, mb_strtolower(trim($m[0])))];
                }
                // 2. « On est lundi » dans un épisode daté un jeudi
                if (!isset($vus['jour']) && preg_match('/\b(?:on est|nous sommes|aujourd\'hui(?:,)? (?:c\'est|on est)?)\s*(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/iu', $t, $m)) {
                    $dit = array_search(mb_strtolower($m[1]), CALENDRIER_JOURS, true);
                    if ($dit !== false && $dit !== $jour) {
                        $vus['jour'] = true;
                        $alertes[] = ['type' => 'jour', 'ep' => $e['id'], 'i' => $sc['i'], 'dit' => CALENDRIER_JOURS[$dit], 'vrai' => CALENDRIER_JOURS[$jour], 'extrait' => extraitSecret($t, mb_strtolower($m[1]))];
                    }
                }
                // L'âge dit par un personnage, pour le comparer d'un épisode à l'autre
                if ($qui !== '' && preg_match("/\\bj'ai\\s+([\\p{L}\\d][\\p{L}\\d -]{0,30}?)\\s+ans\\b/iu", $t, $m)) {
                    $n = nombreFrancais($m[1]);
                    if ($n !== null && $n > 0 && $n < 130) $repliques[$qui][] = ['ep' => $e['id'], 'date' => $e['date'], 'age' => $n];
                }
            }
        }
    }

    // 3. Deux épisodes le même jour au même moment, avec un personnage dans les deux
    $creneaux = [];
    foreach ($episodes as $e) {
        $m = $moments[$e['id']] ?? 'inconnu';
        if ($e['date'] && !$e['flashback'] && $m !== '' && $m !== 'inconnu') $creneaux["{$e['date']}|$m"][] = $e;
    }
    foreach ($creneaux as $cle => $liste) {
        for ($a = 0; $a < count($liste); $a++) for ($b = $a + 1; $b < count($liste); $b++) {
            $qa = array_unique(array_merge(...array_map(fn($s) => $s['qui'], $liste[$a]['scenes'] ?: [['qui' => []]])));
            $qb = array_unique(array_merge(...array_map(fn($s) => $s['qui'], $liste[$b]['scenes'] ?: [['qui' => []]])));
            $communs = array_values(array_intersect($qa, $qb));
            if ($communs) $alertes[] = ['type' => 'chevauche', 'ep' => $liste[$a]['id'], 'autre' => $liste[$b]['id'], 'date' => explode('|', $cle)[0], 'moment' => explode('|', $cle)[1], 'qui' => array_slice($communs, 0, 4)];
        }
    }

    // 4. Un âge qui ne suit pas le temps : 30 ans en 2016, 30 ans encore en 2018
    $fiches = [];
    foreach ($db->query('SELECT prenom, nom_affichage, date_naissance, age FROM personnages')->fetchAll() as $p) {
        $nom = trim((string)($p['prenom'] ?: $p['nom_affichage']));
        if ($nom !== '') $fiches[$nom] = $p;
    }
    foreach ($repliques as $nom => $dits) {
        // La continuité compare déjà le texte à la fiche : ici, seulement ceux qu'aucune fiche ne date
        if (!empty($fiches[$nom]['date_naissance']) || (int)($fiches[$nom]['age'] ?? 0) > 0) continue;
        for ($k = 1; $k < count($dits); $k++) {
            $a = $dits[0];
            $b = $dits[$k];
            $ans = (strtotime($b['date']) - strtotime($a['date'])) / (365.25 * 86400);
            $attendu = $a['age'] + $ans;
            if (abs($b['age'] - $attendu) > 1.01) {
                $alertes[] = ['type' => 'age', 'ep' => $b['ep'], 'avant' => $a['ep'], 'nom' => $nom, 'dit' => $b['age'], 'ditAvant' => $a['age'], 'attendu' => (int)floor($attendu)];
                break;
            }
        }
    }

    // 5. Les anniversaires qui tombent pendant la série, et les épisodes de ces jours-là
    $anniversaires = [];
    if ($periode) {
        $parDate = [];
        foreach ($episodes as $e) if ($e['date'] && !$e['flashback']) $parDate[$e['date']][] = $e['id'];
        $mentionne = function (string $date) use ($episodes): ?int {
            foreach ($episodes as $e) {
                if (!$e['date'] || abs(strtotime($e['date']) - strtotime($date)) > 3 * 86400) continue;
                foreach ($e['scenes'] as $sc) foreach ($sc['lignes'] as [, $t]) if (preg_match('/\banniversaire\b/iu', $t)) return $e['id'];
            }
            return null;
        };
        foreach ($fiches as $nom => $p) {
            if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', (string)$p['date_naissance'], $n)) continue;
            for ($an = (int)substr($periode['debut'], 0, 4); $an <= (int)substr($periode['fin'], 0, 4); $an++) {
                $jour = sprintf('%04d-%s-%s', $an, $n[2], $n[3] === '29' && $n[2] === '02' && !checkdate(2, 29, $an) ? '28' : $n[3]);
                if ($jour < $periode['debut'] || $jour > $periode['fin']) continue;
                $anniversaires[] = ['nom' => $nom, 'date' => $jour, 'age' => $an - (int)$n[1], 'eps' => $parDate[$jour] ?? [], 'fete' => $mentionne($jour)];
            }
        }
        usort($anniversaires, fn($a, $b) => strcmp($a['date'], $b['date']));
    }

    $numeros = $db->query('SELECT id, numero_episode FROM episodes')->fetchAll(PDO::FETCH_KEY_PAIR);
    // Les points écartés à la main ne reviennent plus
    $ignores = lireNoteJson($db, 'calendrier-ignores') ?? [];
    foreach ($alertes as &$a) $a['cle'] = $a['type'] . ':' . $a['ep'] . ':' . ($a['fete'] ?? $a['nom'] ?? $a['autre'] ?? $a['dit'] ?? '');
    unset($a);
    $alertes = array_values(array_filter($alertes, fn($a) => !in_array($a['cle'], $ignores, true)));
    return [
        'ecartes' => count($ignores),
        'periode' => $periode,
        'sansDate' => count(array_filter($episodes, fn($e) => !$e['date'])),
        'alertes' => $alertes,
        'anniversaires' => $anniversaires,
        'episodes' => (object)array_map(fn($e) => ['code' => $e['code'], 'titre' => $e['titre'], 'date' => $e['date'], 's' => $e['saison'], 'n' => $numeros[$e['id']] ?? 0], array_column($episodes, null, 'id')),
    ];
}

function handleCalendrier(PDO $db, string $method, array $body): void {
    if ($method === 'GET') { echo json_encode(calendrierSerie($db), JSON_UNESCAPED_UNICODE); return; }
    $cle = mb_substr(texteCorps($body['cle'] ?? ''), 0, 120);
    $db->exec('BEGIN IMMEDIATE');
    $ignores = lireNoteJson($db, 'calendrier-ignores') ?? [];
    if (!empty($body['tout'])) $ignores = [];
    elseif ($cle !== '' && !in_array($cle, $ignores, true)) $ignores[] = $cle;
    ecrireNoteJson($db, 'calendrier-ignores', $ignores ? array_slice($ignores, -500) : null);
    $db->exec('COMMIT');
    echo json_encode(['ok' => true]);
}
