<?php
// api/analyse_data.php — Données par épisode pour l'analyse côté navigateur.
// Le navigateur recalcule tout selon les épisodes choisis (voir assets/js/analyse-calcul.js).

const ANALYSE_EXPRESSIONS_MAX = 150;
const ANALYSE_EXPRESSIONS_EPISODES_MIN = 8;
const ANALYSE_VOIX_STOP = 'le la les un une des de du et à a au aux en dans que qui quoi ce ça cette ces je tu il elle on nous vous ils elles me te se ne pas plus mais ou où donc or ni car pour par sur sous avec sans est sont suis es était être avoir ai as ont avez avons fait faire y c d l j m n s t qu lui leur mon ma mes ton ta tes son sa ses notre votre si bien oui non tout tous très comme alors là ici va vais vas';

function ensureAnalyseNotes(PDO $db): void {
    $db->exec('CREATE TABLE IF NOT EXISTS analyse_notes (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL)');
}

function handleAnalyseNotes(PDO $db, string $method, array $body): void {
    if ($method === 'GET') {
        // Une seule note, sans charger toutes les autres (les brouillons peuvent être lourds)
        if (isset($_GET['cle']) && is_string($_GET['cle'])) {
            $st = $db->prepare('SELECT valeur FROM analyse_notes WHERE cle = ?');
            $st->execute([mb_substr($_GET['cle'], 0, 200)]);
            $v = $st->fetchColumn();
            echo json_encode(['cle' => $_GET['cle'], 'valeur' => $v === false ? null : $v]);
            return;
        }
        $notes = [];
        foreach ($db->query('SELECT cle, valeur FROM analyse_notes')->fetchAll() as $row) $notes[$row['cle']] = $row['valeur'];
        echo json_encode((object)$notes);
        return;
    }

    if ($method === 'PUT') {
        $cle = trim(texteCorps($body['cle'] ?? ''));
        if (str_starts_with($cle, 'expression-perso:')) {
            $cle = 'expression-perso:' . normaliserExpression(substr($cle, strlen('expression-perso:')));
        }
        $valeur = $body['valeur'] ?? null;
        if ($cle === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Clé manquante']);
            return;
        }
        if ($valeur === null || $valeur === '') {
            $db->prepare('DELETE FROM analyse_notes WHERE cle = ?')->execute([$cle]);
        } else {
            $db->prepare('
                INSERT INTO analyse_notes (cle, valeur) VALUES (?, ?)
                ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur
            ')->execute([$cle, (string)$valeur]);
        }
        echo json_encode(['ok' => true]);
        return;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Méthode non autorisée']);
}

// Change dès qu'une donnée utilisée par l'analyse change
function empreinteAnalyse(PDO $db): string {
    $requetes = [
        "SELECT COUNT(*), MAX(updated_at), SUM(nb_pages), SUM(avancement), GROUP_CONCAT(jet) FROM episodes",
        "SELECT COUNT(*), MAX(analysed_at) FROM episode_stats",
        "SELECT COUNT(*), SUM(present), SUM(nb_repliques) FROM episode_personnages",
        "SELECT COUNT(*), GROUP_CONCAT(statut) FROM episode_lieux",
        "SELECT COUNT(*) FROM episode_themes",
        "SELECT GROUP_CONCAT(id || prenom || COALESCE(nom, '') || COALESCE(nom_affichage, '') || est_principal) FROM personnages",
        "SELECT GROUP_CONCAT(id || nom || est_principal || COALESCE(premiere_apparition_episode_id, '')) FROM lieux",
        "SELECT GROUP_CONCAT(nom_normalise || regle || COALESCE(personnage_id, '')) FROM noms_regles",
        "SELECT GROUP_CONCAT(id || COALESCE(nom, '') || couleur) FROM saisons",
        "SELECT GROUP_CONCAT(cle) FROM analyse_notes WHERE cle LIKE 'expression-perso:%'",
    ];
    $valeurs = array_map(fn($sql) => $db->query($sql)->fetch(PDO::FETCH_NUM), $requetes);
    return md5('v7' . json_encode($valeurs));
}

function handleAnalyseData(PDO $db): void {
    $chemin = dirname(DB_PATH) . '/analyse-cache.json';
    $empreinte = empreinteAnalyse($db);

    if (is_file($chemin)) {
        $flux = fopen($chemin, 'r');
        $entete = fgets($flux);
        if (trim((string)$entete) === $empreinte) {
            fpassthru($flux);
            fclose($flux);
            return;
        }
        fclose($flux);
    }

    @set_time_limit(180);
    ini_set('memory_limit', '1024M');
    $json = json_encode(construireDonneesAnalyse($db), JSON_UNESCAPED_UNICODE);
    file_put_contents($chemin, $empreinte . "\n" . $json);
    echo $json;
}

function construireDonneesAnalyse(PDO $db): array {
    $saisons = $db->query('SELECT numero, nom, couleur FROM saisons ORDER BY numero')->fetchAll();
    $episodes = $db->query("
        SELECT e.id, e.numero_episode, e.titre, e.nb_pages, e.avancement, e.jet, e.texte_episode, s.numero AS saison_numero
        FROM episodes e JOIN saisons s ON s.id = e.saison_id
        ORDER BY s.numero, e.numero_episode
    ")->fetchAll();

    $lieuxScenes = [];
    foreach ($db->query('SELECT episode_id, lieu_raw FROM episode_stat_scenes ORDER BY episode_id, scene_index')->fetchAll() as $r) {
        $lieuxScenes[$r['episode_id']][] = $r['lieu_raw'];
    }
    $stats = [];
    foreach ($db->query('SELECT episode_id, nb_mots, nb_repliques_total, duree_estimee_min FROM episode_stats')->fetchAll() as $r) {
        $stats[$r['episode_id']] = $r;
    }

    $personnages = $db->query('SELECT * FROM personnages')->fetchAll();
    $statuts = [];
    foreach ($db->query("SELECT episode_id, lieu_id, statut FROM episode_lieux WHERE statut <> 'absent'")->fetchAll() as $r) {
        $statuts[$r['episode_id']][$r['lieu_id']] = $r['statut'] === 'present' ? 1 : 2;
    }
    $lieuxEpisode = [];
    foreach ($db->query('SELECT * FROM episode_stat_lieux')->fetchAll() as $r) {
        $persos = [];
        foreach (json_decode($r['personnages_json'] ?? '[]', true) ?: [] as $p) {
            $m = matcherPersonnageDepuisNom($p['nom'], $personnages);
            if ($m) {
                $k = personnageLabel($m);
                $persos[$k] = ($persos[$k] ?? 0) + (int)$p['nb_repliques'];
            }
        }
        $lieuxEpisode[$r['episode_id']][$r['lieu_id']] = [(int)$r['nb_scenes'], (int)$r['nb_repliques'], (int)$r['nb_mots'], (int)$r['duree_min'], (object)$persos];
    }

    $listePersos = []; $indexPersos = [];
    $listeThemes = []; $indexThemes = [];
    $vocab = []; $indexVocab = []; $verbes = [];
    $eps = [];

    $indexPerso = function(string $nom, string $groupe) use (&$listePersos, &$indexPersos): int {
        if (!isset($indexPersos[$nom])) {
            $indexPersos[$nom] = count($listePersos);
            $listePersos[] = ['n' => $nom, 'g' => $groupe];
        }
        return $indexPersos[$nom];
    };

    foreach ($episodes as $e) {
        ob_start();
        handleAnalyse($db, ['episode_ids' => [(int)$e['id']]]);
        $r = json_decode(ob_get_clean(), true);

        $pr = [];
        foreach ($r['par_personnage'] as $p) {
            if (!$p['total_repliques'] && !$p['nb_presences']) continue;
            $groupe = !$p['personnage_id'] ? 'x' : (($p['est_principal'] ?? 0) == 1 ? 'p' : (($p['est_recurrent'] ?? 0) == 1 ? 'r' : 'a'));
            $pr[] = [$indexPerso($p['nom'], $groupe), (int)$p['total_repliques'], (int)$p['nb_presences']];
        }

        $th = [];
        foreach ($r['par_theme'] as $t) {
            if (!isset($indexThemes[$t['nom']])) {
                $indexThemes[$t['nom']] = count($listeThemes);
                $listeThemes[] = ['n' => $t['nom'], 'c' => $t['couleur']];
            }
            $th[] = $indexThemes[$t['nom']];
        }

        $sc = [];
        $lieuxEp = $lieuxScenes[$e['id']] ?? [];
        foreach (($r['par_episode_scenes'][0]['scenes'] ?? []) as $i => $s) {
            $sc[] = [$s['mots'], $s['repliques'], $lieuxEp[$i] ?? '', array_map(fn($n) => $indexPerso($n, 'x'), $s['persos'])];
        }

        $sansVerbes = array_flip(array_column($r['all_mots'], 'mot'));
        $w = [];
        foreach ($r['all_mots_avec_verbes'] as $m) {
            $mot = trim($m['mot'], " \u{00A0}\u{2009}\u{202F}");
            if ($mot === '') continue;
            if (!isset($indexVocab[$mot])) {
                $indexVocab[$mot] = count($vocab);
                $vocab[] = $mot;
            }
            if (!isset($sansVerbes[$m['mot']])) $verbes[$indexVocab[$mot]] = true;
            array_push($w, $indexVocab[$mot], $m['nb']);
        }

        $st = $stats[$e['id']] ?? null;
        $li = [];
        $ids = array_unique(array_merge(array_keys($lieuxEpisode[$e['id']] ?? []), array_keys($statuts[$e['id']] ?? [])));
        foreach ($ids as $lieuId) {
            $li[$lieuId] = array_merge([$statuts[$e['id']][$lieuId] ?? 0], $lieuxEpisode[$e['id']][$lieuId] ?? [0, 0, 0, 0, (object)[]]);
        }

        $eps[] = [
            'id' => (int)$e['id'], 'sa' => (int)$e['saison_numero'], 'n' => (int)$e['numero_episode'], 't' => (string)$e['titre'],
            'x' => trim((string)$e['texte_episode']) !== '' ? 1 : 0,
            'm' => (int)($st['nb_mots'] ?? 0), 'p' => (int)$e['nb_pages'], 'r' => (int)($st['nb_repliques_total'] ?? 0),
            'd' => (int)($st['duree_estimee_min'] ?? 0), 'av' => (int)$e['avancement'], 'fin' => $e['jet'] === 'Final' ? 1 : 0,
            'th' => $th, 'pr' => $pr, 'sc' => $sc, 'w' => $w, 'li' => (object)$li,
        ];
    }

    $mesExpressions = array_map(
        fn($cle) => substr($cle, strlen('expression-perso:')),
        $db->query("SELECT cle FROM analyse_notes WHERE cle LIKE 'expression-perso:%' ORDER BY cle")->fetchAll(PDO::FETCH_COLUMN)
    );
    $parTexte = lireDialoguesAnalyse($db, $episodes, $mesExpressions, $personnages);
    $motsVoix = selectionnerMotsVoix($parTexte['global']);
    $indexVoix = array_flip($motsVoix);
    $parleurs = [];
    $formes = [];
    foreach ($eps as &$e) {
        $detail = $parTexte['episodes'][$e['id']];
        $e['aw'] = $detail['action'];
        $e['ex'] = (object)$detail['expressions'];
        $vx = [];
        $vw = [];
        $vr = [];
        foreach ($detail['voix'] as $perso => $v) {
            $choisis = [];
            foreach ($v['mots'] as $mot => $nb) {
                $mot = (string)$mot;
                if (isset($indexVoix[$mot])) $choisis[$indexVoix[$mot]] = $nb;
            }
            $vx[$perso] = [$v['repliques'], array_sum($v['mots']), (object)$choisis];
        }

        // Mêmes mots que le classement général, pour le filtre « Dit par »
        foreach ($detail['parole'] as $parleur => $mots) {
            $parleurs[$parleur] = ($parleurs[$parleur] ?? 0) + array_sum($mots);
            $comptes = [];
            foreach ($mots as $mot => $nb) {
                $mot = (string)$mot;
                $i = $indexVocab[normaliserMotAnalyse($mot)] ?? null;
                if ($i !== null) {
                    $comptes[$i] = ($comptes[$i] ?? 0) + $nb;
                    $formes[$i][$mot] = ($formes[$i][$mot] ?? 0) + $nb;
                }
            }
            $plat = [];
            foreach ($comptes as $i => $nb) array_push($plat, $i, $nb);
            $vw[$parleur] = $plat;
            $vr[$parleur] = [$detail['repliques'][$parleur] ?? 0, array_sum($mots)];
        }
        $e['vx'] = (object)$vx;
        $e['vw'] = (object)$vw;
        $e['vr'] = (object)$vr;
    }
    unset($e);

    // Le classement retire les accents : on garde la graphie la plus fréquente pour l'affichage
    $accents = [];
    foreach ($formes as $i => $variantes) {
        arsort($variantes);
        $forme = (string)array_key_first($variantes);
        if ($forme !== $vocab[$i]) $accents[$i] = $forme;
    }

    arsort($parleurs);
    $groupes = array_column($listePersos, 'g', 'n');
    $listeParleurs = [];
    foreach ($parleurs as $nom => $nbMots) {
        $groupe = $groupes[$nom] ?? 'a';
        if ($groupe !== 'x') $listeParleurs[] = ['n' => (string)$nom, 'g' => $groupe === 'p' ? 'p' : 's', 'm' => $nbMots];
    }

    $lieux = array_map(fn($l) => [
        'id' => (int)$l['id'], 'n' => $l['nom'], 'pr' => (int)$l['est_principal'],
        'pa' => $l['premiere_apparition_episode_id'] ? (int)$l['premiere_apparition_episode_id'] : null,
    ], $db->query('SELECT * FROM lieux ORDER BY est_principal DESC, id')->fetchAll());

    return [
        'saisons' => array_map(fn($s) => ['n' => (int)$s['numero'], 'nom' => $s['nom'], 'c' => $s['couleur']], $saisons),
        'themes' => $listeThemes, 'persos' => $listePersos, 'vocab' => $vocab, 'accents' => (object)$accents, 'verbes' => array_keys($verbes),
        'phrases' => $parTexte['expressions'], 'mesExpressions' => $mesExpressions, 'parleurs' => $listeParleurs, 'voixPersos' => voixDuProjet($db), 'voixMots' => $motsVoix, 'lieux' => $lieux, 'eps' => $eps,
    ];
}

function normaliserMotAnalyse(string $mot): string {
    return str_replace(
        ['é','è','ê','ë','à','â','ä','î','ï','ô','ö','ù','û','ü','ç','œ','æ'],
        ['e','e','e','e','a','a','a','i','i','o','o','u','u','u','c','oe','ae'],
        $mot
    );
}

function normaliserExpression(string $texte): string {
    preg_match_all("/[a-zà-ÿœ]+/u", mb_strtolower($texte, 'UTF-8'), $trouves);
    return implode(' ', $trouves[0]);
}

// Les suites de 3 à 6 mots qui reviennent dans plusieurs épisodes
function detecterExpressions(array $lignes): array {
    $stop = array_flip(explode(' ', ANALYSE_VOIX_STOP));
    $episodesParSuite = [];
    foreach ($lignes as [$epId, , , $phrase]) {
        $mots = explode(' ', $phrase);
        $nb = count($mots);
        for ($taille = 3; $taille <= 6; $taille++) {
            for ($i = 0; $i + $taille <= $nb; $i++) {
                $suite = implode(' ', array_slice($mots, $i, $taille));
                $episodesParSuite[$suite][$epId] = true;
            }
        }
    }

    $scores = [];
    foreach ($episodesParSuite as $suite => $eps) {
        $nbEp = count($eps);
        if ($nbEp < ANALYSE_EXPRESSIONS_EPISODES_MIN) continue;
        $mots = explode(' ', (string)$suite);
        $parlants = array_filter($mots, fn($m) => mb_strlen($m) >= 4 && !isset($stop[$m]));
        if ($parlants) $scores[$suite] = $nbEp * count($mots);
    }
    unset($episodesParSuite);
    arsort($scores);

    // Retire les morceaux d'une expression plus longue déjà retenue
    $retenues = [];
    foreach (array_keys($scores) as $suite) {
        $suite = (string)$suite;
        foreach ($retenues as $autre) {
            if (str_contains(" $autre ", " $suite ") || str_contains(" $suite ", " $autre ")) continue 2;
        }
        $retenues[] = $suite;
        if (count($retenues) >= ANALYSE_EXPRESSIONS_MAX) break;
    }
    return $retenues;
}

// Les voix comparées : la liste choisie pour la série d'origine, sinon les cinq personnages qui parlent le plus
function voixDuProjet(PDO $db): array {
    $personnages = $db->query('SELECT * FROM personnages')->fetchAll();
    $parNom = [];
    foreach ($db->query('SELECT nom, SUM(nb_repliques) AS n FROM episode_stat_personnages GROUP BY nom')->fetchAll() as $r) {
        if (!matcherPersonnageDepuisNom((string)$r['nom'], $personnages)) continue;
        $cle = preg_split('/\s+/', trim((string)$r['nom']))[0];
        $parNom[$cle] = ($parNom[$cle] ?? 0) + (int)$r['n'];
    }
    arsort($parNom);
    return array_map('strval', array_slice(array_keys($parNom), 0, 5));
}

// Sépare dialogue et action, et compte expressions et vocabulaire par personnage
function lireDialoguesAnalyse(PDO $db, array $episodes, array $mesExpressions, array $personnages): array {
    $resultat = [];
    $identifies = [];
    $nomParleur = function(string $nom) use (&$identifies, $personnages): array {
        if (!isset($identifies[$nom])) {
            $m = matcherPersonnageDepuisNom($nom, $personnages);
            $identifies[$nom] = $m ? [$m['prenom'], true] : [mb_convert_case($nom, MB_CASE_TITLE, 'UTF-8'), false];
        }
        return $identifies[$nom];
    };
    $voixProjet = voixDuProjet($db);
    $global = array_fill_keys($voixProjet, []);
    $lignes = [];

    foreach ($episodes as $e) {
        $detail = ['action' => 0, 'expressions' => [], 'voix' => [], 'parole' => [], 'repliques' => []];
        $courant = null;
        $parleur = null;
        $identifie = false;
        $nouvelle = false;
        $texte = preg_replace('/\/\*.*?\*\//s', '', normaliserScript((string)$e['texte_episode']));

        foreach (explode("\n", $texte) as $ligne) {
            $ligne = trim($ligne);
            if ($ligne === '') { $courant = null; continue; }
            if (preg_match('/^(INT|EXT)\b/u', $ligne) || preg_match('/^\(.*\)$/u', $ligne)) continue;

            if (preg_match("/^([A-ZÀ-Ý][A-ZÀ-Ý '\\-0-9]{1,35})(\\s*\\(.*\\))?$/u", $ligne, $m)) {
                $courant = preg_split('/\s+/', trim($m[1]))[0];
                [$parleur, $identifie] = $nomParleur(trim($m[1]));
                $nouvelle = true;
                continue;
            }
            if ($courant === null) {
                $detail['action'] += count(preg_split('/\s+/u', $ligne, -1, PREG_SPLIT_NO_EMPTY));
                continue;
            }

            preg_match_all("/[a-zà-ÿœ]+(?:'[a-zà-ÿœ]+)?/u", mb_strtolower($ligne, 'UTF-8'), $trouves);
            $mots = $trouves[0];
            $phrase = str_replace("'", ' ', implode(' ', $mots));
            if ($phrase !== '') $lignes[] = [(int)$e['id'], $parleur, count($mots), $phrase];

            if ($identifie) {
                // Une réplique peut courir sur plusieurs lignes : on compte les prises de parole
                if ($nouvelle) $detail['repliques'][$parleur] = ($detail['repliques'][$parleur] ?? 0) + 1;
                foreach ($mots as $mot) {
                    $pos = strrpos($mot, "'");
                    if ($pos !== false) $mot = substr($mot, $pos + 1);
                    $detail['parole'][$parleur][$mot] = ($detail['parole'][$parleur][$mot] ?? 0) + 1;
                }
            }

            if (in_array($courant, $voixProjet, true)) {
                if (!isset($detail['voix'][$courant])) $detail['voix'][$courant] = ['repliques' => 0, 'mots' => []];
                if ($nouvelle) $detail['voix'][$courant]['repliques']++;
                foreach ($mots as $mot) {
                    $pos = strrpos($mot, "'");
                    if ($pos !== false) $mot = substr($mot, $pos + 1);
                    $detail['voix'][$courant]['mots'][$mot] = ($detail['voix'][$courant]['mots'][$mot] ?? 0) + 1;
                    $global[$courant][$mot] = ($global[$courant][$mot] ?? 0) + 1;
                }
            }
            $nouvelle = false;
        }
        $resultat[$e['id']] = $detail;
    }

    // La détection est longue : on ne la refait que si un script a changé
    $cheminDetection = dirname(DB_PATH) . '/analyse-expressions.json';
    $empreinteTextes = md5(json_encode(array_column($episodes, 'texte_episode')) . empreinteProse());
    $detection = is_file($cheminDetection) ? json_decode((string)file_get_contents($cheminDetection), true) : null;
    if (($detection['empreinte'] ?? '') === $empreinteTextes) {
        $detectees = $detection['expressions'];
    } else {
        $detectees = detecterExpressions($lignes);
        file_put_contents($cheminDetection, json_encode(['empreinte' => $empreinteTextes, 'expressions' => $detectees], JSON_UNESCAPED_UNICODE));
    }
    $expressions = array_values(array_unique(array_merge($mesExpressions, $detectees)));
    // Un seul texte par épisode et par personnage : bien plus rapide que réplique par réplique
    $textes = [];
    foreach ($lignes as [$epId, $perso, , $phrase]) {
        $textes[$epId][$perso] = ($textes[$epId][$perso] ?? ' ') . "$phrase | ";
    }
    foreach ($textes as $epId => $parPerso) {
        foreach ($parPerso as $perso => $texte) {
            foreach ($expressions as $i => $expression) {
                $nb = substr_count($texte, " $expression ");
                if ($nb) $resultat[$epId]['expressions'][$i][$perso] = $nb;
            }
        }
    }

    return ['episodes' => $resultat, 'global' => $global, 'expressions' => $expressions];
}

// Les mots les plus caractéristiques de chaque personnage sur toute la série
function selectionnerMotsVoix(array $global): array {
    $stop = array_flip(explode(' ', ANALYSE_VOIX_STOP));
    $totaux = array_map('array_sum', $global);
    $total = array_sum($totaux);
    $choisis = [];

    foreach ($global as $perso => $mots) {
        if (!$totaux[$perso]) continue;
        $scores = [];
        foreach ($mots as $mot => $nb) {
            $mot = (string)$mot;
            if ($nb < 5 || isset($stop[$mot]) || mb_strlen($mot) < 3) continue;
            $autres = 0;
            foreach ($global as $autre => $liste) {
                if ($autre !== $perso) $autres += $liste[$mot] ?? 0;
            }
            $scores[$mot] = ($nb / $totaux[$perso]) / (($autres + 1) / max($total - $totaux[$perso], 1)) * log($nb);
        }
        arsort($scores);
        foreach (array_slice(array_keys($scores), 0, 60) as $mot) $choisis[(string)$mot] = true;
    }
    return array_map('strval', array_keys($choisis));
}
