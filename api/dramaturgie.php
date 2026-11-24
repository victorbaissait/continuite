<?php
// api/dramaturgie.php — Les états des personnages au fil des épisodes,
// et les répliques qui sonnent comme celles d'un autre personnage

const ETATS_MAX = 300;
const ETATS_TYPES = ['situation', 'absent', 'brouille'];

// ─── États des personnages ───────────────────────────────────────────────

// Les états, nettoyés : un état commence à un épisode et cesse à un autre (exclu), ou dure jusqu'au bout
function lireEtats(PDO $db): array {
    $brut = lireNoteJson($db, 'etats')['etats'] ?? [];
    $etats = [];
    foreach (is_array($brut) ? $brut : [] as $e) {
        if (!is_array($e) || !is_string($e['id'] ?? null) || !is_numeric($e['debut'] ?? null)) continue;
        $type = in_array($e['type'] ?? '', ETATS_TYPES, true) ? $e['type'] : 'situation';
        $etats[] = [
            'id' => $e['id'],
            'nom' => mb_substr(trim((string)($e['nom'] ?? '')), 0, 60),
            'texte' => mb_substr(trim((string)($e['texte'] ?? '')), 0, 200),
            'type' => $type,
            'avec' => $type === 'brouille' ? mb_substr(trim((string)($e['avec'] ?? '')), 0, 60) : '',
            'debut' => (int)$e['debut'],
            'fin' => is_numeric($e['fin'] ?? null) ? (int)$e['fin'] : null,
        ];
    }
    return $etats;
}

// Ce qui contredit un état : un absent qui parle, deux brouillés qui partagent une scène
function alertesEtats(array $etats, array $episodes): array {
    $rang = [];
    foreach ($episodes as $e) $rang[$e['id']] = $e['rang'];
    $alertes = [];
    foreach ($etats as $s) {
        if ($s['type'] === 'situation' || !isset($rang[$s['debut']])) continue;
        $debut = $rang[$s['debut']];
        $fin = $s['fin'] !== null && isset($rang[$s['fin']]) ? $rang[$s['fin']] : PHP_INT_MAX;
        foreach ($episodes as $e) {
            if ($e['rang'] < $debut || $e['rang'] >= $fin) continue;
            $scenes = array_values(array_filter($e['scenes'], fn($sc) => in_array($s['nom'], $sc['qui'], true)
                && ($s['type'] === 'absent' || in_array($s['avec'], $sc['qui'], true))));
            if (!$scenes) continue;
            $alertes[] = ['etat' => $s['id'], 'ep' => $e['id'], 'i' => $scenes[0]['i'], 'slug' => $scenes[0]['slug'], 'n' => count($scenes)];
        }
    }
    return $alertes;
}

function handleEtats(PDO $db, string $method, array $body): void {
    $episodes = scenesSecrets($db);
    $repondre = function () use ($db, $episodes) {
        $etats = lireEtats($db);
        echo json_encode([
            'etats' => $etats,
            'alertes' => alertesEtats($etats, $episodes),
            'personnages' => array_slice(personnagesSerie($db, $episodes), 0, 80),
            'episodes' => array_map(fn($e) => ['id' => $e['id'], 'rang' => $e['rang'], 'code' => $e['code'], 'titre' => $e['titre'], 'saison' => $e['saison']], $episodes),
        ], JSON_UNESCAPED_UNICODE);
    };
    if ($method === 'GET') { $repondre(); return; }
    if ($method !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Méthode non autorisée']); return; }

    $rang = [];
    foreach ($episodes as $e) $rang[$e['id']] = $e['rang'];
    $db->exec('BEGIN IMMEDIATE');
    try {
        $etats = lireEtats($db);
        $action = texteCorps($body['action'] ?? '');
        $i = array_search(texteCorps($body['id'] ?? ''), array_column($etats, 'id'), true);
        $erreur = null;
        if ($action === 'creer') {
            if (count($etats) >= ETATS_MAX) $erreur = 'Trop d\'états (' . ETATS_MAX . ' au plus).';
            else {
                $etats[] = ['id' => 'e' . bin2hex(random_bytes(4)), 'nom' => '', 'texte' => '', 'type' => 'situation', 'avec' => '', 'debut' => 0, 'fin' => null];
                $i = count($etats) - 1;
            }
        } elseif ($i === false) {
            $erreur = 'État introuvable';
        }
        if (!$erreur && in_array($action, ['creer', 'modifier'], true)) {
            $e = $etats[$i];
            foreach (['nom', 'texte', 'avec'] as $k) if (array_key_exists($k, $body)) $e[$k] = mb_substr(trim(texteCorps($body[$k])), 0, $k === 'texte' ? 200 : 60);
            if (array_key_exists('type', $body)) $e['type'] = in_array($body['type'], ETATS_TYPES, true) ? $body['type'] : 'situation';
            if (array_key_exists('debut', $body)) $e['debut'] = (int)$body['debut'];
            if (array_key_exists('fin', $body)) $e['fin'] = is_numeric($body['fin']) && (int)$body['fin'] > 0 ? (int)$body['fin'] : null;
            if ($e['type'] !== 'brouille') $e['avec'] = '';
            if ($e['nom'] === '') $erreur = 'Choisis un personnage';
            elseif (!isset($rang[$e['debut']])) $erreur = 'Épisode de départ introuvable';
            elseif ($e['fin'] !== null && !isset($rang[$e['fin']])) $erreur = 'Épisode de fin introuvable';
            elseif ($e['fin'] !== null && $rang[$e['fin']] <= $rang[$e['debut']]) $erreur = 'L\'état doit cesser après l\'épisode où il commence';
            elseif ($e['type'] === 'brouille' && ($e['avec'] === '' || $e['avec'] === $e['nom'])) $erreur = 'Choisis avec qui il est brouillé';
            else $etats[$i] = $e;
        } elseif (!$erreur && $action === 'retirer') {
            array_splice($etats, $i, 1);
        } elseif (!$erreur) {
            $erreur = 'Action inconnue';
        }
        if ($erreur) {
            $db->exec('ROLLBACK');
            http_response_code(400);
            echo json_encode(['error' => $erreur]);
            return;
        }
        ecrireNoteJson($db, 'etats', ['etats' => array_values($etats)]);
        $db->exec('COMMIT');
    } catch (Throwable $e) {
        $db->exec('ROLLBACK');
        throw $e;
    }
    $repondre();
}

// ─── « Ça ne lui ressemble pas » ─────────────────────────────────────────

const VOIX_ECARTS_MIN_MOTS = 3000; // un personnage doit avoir assez parlé ailleurs pour avoir une voix
const VOIX_ECARTS_VOIX = 8;        // les voix comparées : celles qui parlent le plus
const VOIX_ECARTS_MIN_LIGNE = 8;   // une réplique trop courte ne dit rien de qui la prononce
const VOIX_ECARTS_SEUIL = 0.35;    // écart moyen par mot au-dessus duquel on signale

function motsVoix(string $texte, array $exclus): array {
    preg_match_all('/\p{L}+/u', mb_strtolower($texte), $m);
    return array_values(array_filter($m[0], fn($w) => mb_strlen($w) >= 2 && !isset($exclus[$w])));
}

// Chaque réplique de l'épisode, comparée à ce que son personnage dit d'habitude
// et à ce que disent les autres : on signale celles qui ressemblent nettement plus à quelqu'un d'autre
function ecartsVoix(PDO $db, int $epId): array {
    $episodes = scenesSecrets($db);
    $cible = null;
    foreach ($episodes as $e) if ($e['id'] === $epId) $cible = $e;
    if (!$cible) return ['error' => 'Épisode introuvable'];
    // Les prénoms se disent à quelqu'un, ils ne disent rien de qui parle
    $exclus = [];
    foreach (personnagesSerie($db, $episodes) as $p) foreach (preg_split('/\s+/u', mb_strtolower($p['nom'])) as $w) $exclus[$w] = true;

    $compte = [];
    $total = [];
    $vocab = [];
    foreach ($episodes as $e) {
        if ($e['id'] === $epId) continue;
        foreach ($e['scenes'] as $sc) foreach ($sc['lignes'] as [$qui, $texte]) {
            if ($qui === '') continue;
            foreach (motsVoix($texte, $exclus) as $w) {
                $compte[$qui][$w] = ($compte[$qui][$w] ?? 0) + 1;
                $total[$qui] = ($total[$qui] ?? 0) + 1;
                $vocab[$w] = true;
            }
        }
    }
    arsort($total);
    $voix = array_slice(array_keys(array_filter($total, fn($n) => $n >= VOIX_ECARTS_MIN_MOTS)), 0, VOIX_ECARTS_VOIX);
    $V = max(1, count($vocab));
    $lp = fn($q, $w) => log((($compte[$q][$w] ?? 0) + 0.5) / ($total[$q] + 0.5 * $V));

    $ecarts = [];
    $examinees = 0;
    foreach ($cible['scenes'] as $sc) foreach ($sc['lignes'] as [$qui, $texte]) {
        if ($qui === '' || !in_array($qui, $voix, true)) continue;
        $mots = motsVoix($texte, $exclus);
        if (count($mots) < VOIX_ECARTS_MIN_LIGNE) continue;
        $examinees++;
        $soi = array_sum(array_map(fn($w) => $lp($qui, $w), $mots)) / count($mots);
        $mieux = null;
        $ecart = 0;
        foreach ($voix as $autre) {
            if ($autre === $qui) continue;
            $d = array_sum(array_map(fn($w) => $lp($autre, $w), $mots)) / count($mots) - $soi;
            if ($d > $ecart) { $ecart = $d; $mieux = $autre; }
        }
        if ($mieux === null || $ecart < VOIX_ECARTS_SEUIL) continue;
        // Les mots qui font pencher : fréquents chez l'autre, rares chez celui qui parle
        $poids = [];
        foreach (array_unique($mots) as $w) {
            if (($compte[$mieux][$w] ?? 0) < 3) continue;
            $poids[$w] = $lp($mieux, $w) - $lp($qui, $w);
        }
        arsort($poids);
        $ecarts[] = ['i' => $sc['i'], 'slug' => $sc['slug'], 'qui' => $qui, 'texte' => mb_substr($texte, 0, 400), 'plutot' => $mieux, 'ecart' => round($ecart, 2),
            'mots' => array_slice(array_keys(array_filter($poids, fn($p) => $p > 0.7)), 0, 4)];
    }
    usort($ecarts, fn($a, $b) => $b['ecart'] <=> $a['ecart']);
    return ['ep' => $epId, 'examinees' => $examinees, 'voix' => $voix, 'ecarts' => array_slice($ecarts, 0, 25)];
}

function handleVoixEcarts(PDO $db): void {
    $res = ecartsVoix($db, (int)($_GET['ep'] ?? 0));
    if (isset($res['error'])) http_response_code(404);
    echo json_encode($res, JSON_UNESCAPED_UNICODE);
}

// ─── Remplacer dans toute la série ───────────────────────────────────────

const REMPLACER_MAX = 200;

// Le motif cherché : texte littéral, casse exacte ou non, mot entier ou non
function motifRemplacement(array $body): ?string {
    $cherche = texteCorps($body['chercher'] ?? '');
    if (trim($cherche) === '' || mb_strlen($cherche) > REMPLACER_MAX) return null;
    $motif = preg_quote($cherche, '/');
    if (!empty($body['mot'])) $motif = '(?<![\p{L}\p{N}])' . $motif . '(?![\p{L}\p{N}])';
    return '/' . $motif . '/u' . (empty($body['casse']) ? 'i' : '');
}

// Sans casse exacte, un nom en capitales (en-tête de réplique) reste en capitales : MARC devient PAUL, Marc devient Paul
function remplacementAdapte(string $trouve, string $par, bool $casse): string {
    if ($casse || $trouve !== mb_strtoupper($trouve) || $trouve === mb_strtolower($trouve)) return $par;
    return mb_strtoupper($par);
}

function remplacerDansSerie(PDO $db, array $body): array {
    $motif = motifRemplacement($body);
    if ($motif === null) return ['error' => 'Écris ce qu\'il faut chercher (200 caractères au plus).'];
    $par = texteCorps($body['remplacer'] ?? '');
    if (mb_strlen($par) > REMPLACER_MAX) return ['error' => 'Le remplacement fait 200 caractères au plus.'];
    $casse = !empty($body['casse']);
    $appliquer = ($body['action'] ?? '') === 'appliquer';
    $choisis = array_flip(array_map('intval', is_array($body['ids'] ?? null) ? $body['ids'] : []));
    $notes = $db->prepare('SELECT valeur FROM analyse_notes WHERE cle = ?');
    $episodes = $db->query("SELECT e.id, e.numero_episode, e.titre, e.code, e.texte_episode, s.numero AS saison FROM episodes e JOIN saisons s ON s.id = e.saison_id ORDER BY s.numero, e.numero_episode, e.id")->fetchAll();
    $resultat = [];
    $total = 0;
    foreach ($episodes as $e) {
        $id = (int)$e['id'];
        $script = (string)$e['texte_episode'];
        $notes->execute(["brouillon:$id"]);
        $brouillon = (string)$notes->fetchColumn();
        $n = preg_match_all($motif, $script, $m, PREG_OFFSET_CAPTURE);
        $nb = preg_match_all($motif, $brouillon);
        if (!$n && !$nb) continue;
        if (!$appliquer) {
            // Quelques extraits pour juger avant de remplacer
            $extraits = [];
            foreach (array_slice($m[0] ?? [], 0, 3) as [$trouve, $pos]) {
                $avant = substr($script, max(0, $pos - 60), min(60, $pos));
                $extraits[] = ['avant' => mb_scrub(ltrim(preg_replace('/\s+/u', ' ', $avant))), 'trouve' => $trouve,
                    'par' => remplacementAdapte($trouve, $par, $casse), 'apres' => mb_scrub(rtrim(preg_replace('/\s+/u', ' ', substr($script, $pos + strlen($trouve), 60))))];
            }
            $resultat[] = ['id' => $id, 'saison' => (int)$e['saison'], 'numero' => (int)$e['numero_episode'], 'titre' => (string)$e['titre'], 'script' => $n, 'brouillon' => $nb, 'extraits' => $extraits];
            $total += $n + $nb;
            continue;
        }
        if (!isset($choisis[$id])) continue;
        $motifVersion = mb_substr('Avant le remplacement de « ' . texteCorps($body['chercher']) . ' » dans la série', 0, 200);
        if ($n) {
            versionsBrouillon($db, 'POST', ['episode_id' => $id, 'texte' => $script, 'motif' => $motifVersion]);
            enregistrerScriptEpisode($db, $id, preg_replace_callback($motif, fn($x) => remplacementAdapte($x[0], $par, $casse), $script));
        }
        if ($nb) {
            versionsBrouillon($db, 'POST', ['episode_id' => $id, 'texte' => $brouillon, 'motif' => $motifVersion . ' (brouillon)']);
            ecrireNoteBrute($db, "brouillon:$id", preg_replace_callback($motif, fn($x) => remplacementAdapte($x[0], $par, $casse), $brouillon));
        }
        $resultat[] = ['id' => $id];
        $total += $n + $nb;
    }
    return ['episodes' => $resultat, 'total' => $total];
}

function ecrireNoteBrute(PDO $db, string $cle, string $valeur): void {
    $db->prepare('INSERT OR REPLACE INTO analyse_notes (cle, valeur) VALUES (?, ?)')->execute([$cle, $valeur]);
}

function handleRemplacerSerie(PDO $db, string $method, array $body): void {
    if ($method !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Méthode non autorisée']); return; }
    $appliquer = ($body['action'] ?? '') === 'appliquer';
    // Tout ou rien : un épisode qui échoue annule tous les remplacements (PDO sait qu'une transaction est ouverte)
    if ($appliquer) $db->beginTransaction();
    try {
        $res = remplacerDansSerie($db, $body);
        if ($appliquer) { if (isset($res['error'])) $db->rollBack(); else $db->commit(); }
    } catch (Throwable $e) {
        if ($appliquer && $db->inTransaction()) $db->rollBack();
        throw $e;
    }
    if (isset($res['error'])) http_response_code(400);
    echo json_encode($res, JSON_UNESCAPED_UNICODE);
}
