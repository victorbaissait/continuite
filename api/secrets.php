<?php
// api/secrets.php — Qui sait quoi : les secrets de la série, qui les apprend et quand,
// et les répliques qui en parlent trop tôt

const SECRETS_MAX = 200;

function motsSecret($mots): array {
    $propres = [];
    foreach ((array)$mots as $m) {
        $m = mb_strtolower(trim(preg_replace('/\s+/u', ' ', texteCorps($m))));
        if (mb_strlen($m) >= 2 && !in_array($m, $propres, true)) $propres[] = mb_substr($m, 0, 40);
    }
    return array_slice($propres, 0, 12);
}

// Les secrets, nettoyés : un savoir est soit « dès le départ », soit une scène d'un épisode
function lireSecrets(PDO $db): array {
    $brut = lireNoteJson($db, 'secrets')['secrets'] ?? [];
    $secrets = [];
    foreach (is_array($brut) ? $brut : [] as $s) {
        if (!is_array($s) || !preg_match('/^s[a-f0-9]{8}$/', (string)($s['id'] ?? ''))) continue;
        $savent = [];
        foreach ((array)($s['savent'] ?? []) as $nom => $q) {
            $nom = mb_substr(trim(texteCorps($nom)), 0, 60);
            if ($nom === '') continue;
            if ($q === 'depart') $savent[$nom] = 'depart';
            elseif (is_array($q) && is_numeric($q['ep'] ?? null)) $savent[$nom] = ['ep' => (int)$q['ep'], 'i' => max(0, (int)($q['i'] ?? 0))];
        }
        $p = $s['public'] ?? null;
        $secrets[] = [
            'id' => $s['id'],
            'texte' => mb_substr(texteCorps($s['texte'] ?? ''), 0, 300),
            'mots' => motsSecret($s['mots'] ?? []),
            'savent' => (object)$savent,
            // Quand le spectateur l'apprend : c'est l'écart avec les personnages qui fait l'ironie
            'public' => $p === 'depart' ? 'depart' : (is_array($p) && is_numeric($p['ep'] ?? null) ? ['ep' => (int)$p['ep'], 'i' => max(0, (int)($p['i'] ?? 0))] : null),
        ];
    }
    return $secrets;
}

// Toutes les scènes de la série dans l'ordre, avec qui parle et ce qu'il dit
function scenesSecrets(PDO $db): array {
    $fiches = fichesParNom($db);
    // Relire tous les scripts prend une seconde : on garde le découpage tant que rien n'a changé
    $empreinte = md5('v2' . json_encode($fiches) . json_encode($db->query('SELECT e.id, e.numero_episode, e.code, e.titre, s.numero, e.date_diege, e.est_flashback, e.texte_episode FROM episodes e JOIN saisons s ON s.id = e.saison_id ORDER BY e.id')->fetchAll(PDO::FETCH_NUM)));
    $cache = dirname(DB_PATH) . '/secrets-scenes.json';
    $lu = is_file($cache) ? json_decode((string)file_get_contents($cache), true) : null;
    if (($lu['empreinte'] ?? '') === $empreinte && is_array($lu['episodes'] ?? null)) return $lu['episodes'];
    $episodes = [];
    $noms = [];
    $rang = 0;
    foreach ($db->query('SELECT e.id, e.numero_episode, e.code, e.titre, e.texte_episode, e.date_diege, e.est_flashback, s.numero AS saison FROM episodes e JOIN saisons s ON s.id = e.saison_id ORDER BY s.numero, e.numero_episode, e.id')->fetchAll() as $e) {
        $scenes = [];
        if (trim((string)$e['texte_episode']) !== '') {
            // Le même découpage que l'écriture et le storyboard, sans le calcul des durées
            $lu = lireLignesEpisode((string)$e['texte_episode']);
            $parScene = [];
            foreach ($lu['lignes'] as [$i, $quiBrut, $t]) {
                // Les lignes d'action sont gardées sans locuteur : un objet se décrit souvent hors dialogue
                if ($quiBrut === null || $quiBrut === '') { $parScene[$i][] = ['', (string)$t]; continue; }
                $parScene[$i][] = [$noms[$quiBrut] ??= nomAffiche($fiches, (string)$quiBrut)['nom'], (string)$t];
            }
            foreach ($lu['scenes'] as $i => [$slug]) {
                if ($i === 0 && !isset($parScene[0])) continue;
                $lignes = $parScene[$i] ?? [];
                $scenes[] = ['i' => $i, 'slug' => (string)$slug, 'qui' => array_values(array_filter(array_unique(array_column($lignes, 0)), fn($q) => $q !== '')), 'lignes' => $lignes];
            }
        }
        $episodes[] = [
            'id' => (int)$e['id'], 'rang' => $rang++, 'saison' => (int)$e['saison'],
            'code' => trim((string)$e['code']) ?: sprintf('S%02dE%02d', $e['saison'], $e['numero_episode']),
            'titre' => (string)$e['titre'], 'scenes' => $scenes,
            'date' => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$e['date_diege']) ? (string)$e['date_diege'] : null,
            'flashback' => (int)$e['est_flashback'] === 1,
        ];
    }
    @file_put_contents($cache, json_encode(['empreinte' => $empreinte, 'episodes' => $episodes], JSON_UNESCAPED_UNICODE));
    return $episodes;
}

function extraitSecret(string $texte, string $mot): string {
    $bas = mb_strtolower($texte);
    $p = mb_strpos($bas, $mot);
    if ($p === false) return mb_substr($texte, 0, 120);
    $debut = max(0, $p - 50);
    return ($debut ? '…' : '') . mb_substr($texte, $debut, 120) . (mb_strlen($texte) > $debut + 120 ? '…' : '');
}

function contientMot(string $texte, string $mot): bool {
    // Le mot entier, pas un bout d'un autre mot (« or » ne doit pas trouver « dehors »)
    return (bool)preg_match('/(?<![\p{L}\p{N}])' . preg_quote($mot, '/') . '(?![\p{L}\p{N}])/iu', $texte);
}

// Pour chaque secret : qui en parle avant de le savoir, qui l'entend sans être noté,
// et qui est noté comme l'apprenant dans une scène où il ne parle pas
function analyserSecrets(array $secrets, array $episodes): array {
    $pos = [];
    foreach ($episodes as $e) $pos[$e['id']] = $e;
    $analyse = [];
    foreach ($secrets as $s) {
        $savent = (array)$s['savent'];
        $moment = function (string $nom) use ($savent, $pos): ?int {
            $q = $savent[$nom] ?? null;
            if ($q === 'depart') return -1;
            if (is_array($q) && isset($pos[$q['ep']])) return $pos[$q['ep']]['rang'] * 10000 + $q['i'];
            return null;
        };
        $alertes = [];
        $suggestions = [];
        $mentions = 0;
        foreach ($episodes as $e) {
            foreach ($e['scenes'] as $sc) {
                $ici = $e['rang'] * 10000 + $sc['i'];
                $lieu = ['ep' => $e['id'], 'i' => $sc['i'], 'code' => $e['code'], 'slug' => $sc['slug']];
                foreach ($sc['lignes'] as [$qui, $texte]) {
                    if ($qui === '') continue;
                    $mot = null;
                    foreach ($s['mots'] as $m) if (contientMot($texte, $m)) { $mot = $m; break; }
                    if ($mot === null) continue;
                    $mentions++;
                    $m = $moment($qui);
                    if (($m === null || $m > $ici) && !isset($alertes[$qui])) {
                        $alertes[$qui] = $lieu + ['nom' => $qui, 'extrait' => extraitSecret($texte, $mot), 'type' => $m === null ? 'jamais' : 'tot'];
                    }
                    // Ceux qui sont dans la scène et ne sont notés nulle part l'ont peut-être appris là
                    foreach ($sc['qui'] as $autre) {
                        if ($autre === $qui || $moment($autre) !== null || isset($suggestions[$autre])) continue;
                        $suggestions[$autre] = $lieu + ['nom' => $autre, 'par' => $qui, 'extrait' => extraitSecret($texte, $mot)];
                    }
                }
            }
        }
        $absents = [];
        foreach ($savent as $nom => $q) {
            if (!is_array($q)) continue;
            $e = $pos[$q['ep']] ?? null;
            $sc = $e ? array_values(array_filter($e['scenes'], fn($x) => $x['i'] === $q['i']))[0] ?? null : null;
            if (!$e) $absents[] = ['nom' => $nom, 'raison' => 'épisode supprimé'];
            elseif (!$sc) $absents[] = ['nom' => $nom, 'raison' => 'scène introuvable', 'code' => $e['code']];
            elseif (!in_array($nom, $sc['qui'], true)) $absents[] = ['nom' => $nom, 'raison' => 'ne parle pas dans cette scène', 'code' => $e['code'], 'slug' => $sc['slug']];
        }
        $analyse[$s['id']] = [
            'mentions' => $mentions,
            'alertes' => array_values($alertes),
            // Une alerte « jamais » propose déjà la scène : inutile de la proposer deux fois
            'suggestions' => array_values(array_filter($suggestions, fn($x) => !isset($alertes[$x['nom']]))),
            'absents' => $absents,
        ];
    }
    return $analyse;
}

// Scène par scène : les secrets que le public connaît déjà et qu'un personnage présent ignore encore
function ironieSecrets(array $secrets, array $episodes): array {
    $pos = [];
    foreach ($episodes as $e) $pos[$e['id']] = $e['rang'];
    $moment = function ($q) use ($pos): ?int {
        if ($q === 'depart') return -1;
        if (is_array($q) && isset($pos[$q['ep']])) return $pos[$q['ep']] * 10000 + $q['i'];
        return null;
    };
    $parEp = [];
    foreach ($episodes as $e) {
        if (!$e['scenes']) continue;
        $scenes = [];
        foreach ($e['scenes'] as $sc) {
            $ici = $e['rang'] * 10000 + $sc['i'];
            $ecarts = [];
            foreach ($secrets as $s) {
                $pub = $moment($s['public']);
                if ($pub === null || $pub > $ici) continue;
                $savent = (array)$s['savent'];
                $ignorent = array_values(array_filter($sc['qui'], function ($q) use ($savent, $moment, $ici) {
                    $m = $moment($savent[$q] ?? null);
                    return $m === null || $m > $ici;
                }));
                if ($ignorent) $ecarts[] = [$s['id'], $ignorent];
            }
            if ($ecarts) $scenes[] = ['i' => $sc['i'], 'slug' => $sc['slug'], 'ecarts' => $ecarts];
        }
        $parEp[] = ['ep' => $e['id'], 'total' => count($e['scenes']), 'scenes' => $scenes];
    }
    return $parEp;
}

// Les personnages de la série, ceux qui parlent sans fiche compris, les plus présents d'abord
function personnagesSerie(PDO $db, array $episodes): array {
    $personnages = [];
    foreach ($db->query('SELECT prenom, nom_affichage, couleur_identite, est_principal FROM personnages ORDER BY est_principal DESC, prenom')->fetchAll() as $p) {
        $nom = trim((string)($p['prenom'] ?: $p['nom_affichage']));
        if ($nom !== '' && !isset($personnages[$nom])) $personnages[$nom] = ['nom' => $nom, 'couleur' => (string)$p['couleur_identite'], 'principal' => (int)$p['est_principal'] === 1];
    }
    // Ceux qui parlent sans avoir de fiche comptent aussi ; les plus présents d'abord
    foreach ($personnages as &$p) $p['scenes'] = 0;
    unset($p);
    foreach ($episodes as $e) foreach ($e['scenes'] as $sc) foreach ($sc['qui'] as $q) {
        $personnages[$q] ??= ['nom' => $q, 'couleur' => '', 'principal' => false, 'scenes' => 0];
        $personnages[$q]['scenes']++;
    }
    uasort($personnages, fn($a, $b) => $b['scenes'] <=> $a['scenes'] ?: strcmp($a['nom'], $b['nom']));
    return array_values($personnages);
}

function etatSecrets(PDO $db): array {
    $secrets = lireSecrets($db);
    $episodes = scenesSecrets($db);
    return [
        'secrets' => $secrets,
        'analyse' => (object)analyserSecrets($secrets, $episodes),
        'ironie' => ironieSecrets($secrets, $episodes),
        'personnages' => personnagesSerie($db, $episodes),
        'episodes' => array_map(fn($e) => ['id' => $e['id'], 'code' => $e['code'], 'titre' => $e['titre'], 'saison' => $e['saison'], 'scenes' => array_map(fn($sc) => ['i' => $sc['i'], 'slug' => $sc['slug'], 'qui' => $sc['qui']], $e['scenes'])], $episodes),
    ];
}

function handleSecrets(PDO $db, string $method, array $body): void {
    if ($method === 'GET') { echo json_encode(etatSecrets($db), JSON_UNESCAPED_UNICODE); return; }
    if ($method !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Méthode non autorisée']); return; }
    $db->exec('BEGIN IMMEDIATE');
    try {
        $secrets = lireSecrets($db);
        $action = texteCorps($body['action'] ?? '');
        $id = texteCorps($body['id'] ?? '');
        $i = array_search($id, array_column($secrets, 'id'), true);
        $erreur = null;
        if ($action === 'creer') {
            if (count($secrets) >= SECRETS_MAX) $erreur = 'Trop de secrets (' . SECRETS_MAX . ' au plus).';
            else $secrets[] = ['id' => 's' . bin2hex(random_bytes(4)), 'texte' => mb_substr(trim(texteCorps($body['texte'] ?? '')), 0, 300) ?: 'Nouveau secret', 'mots' => motsSecret($body['mots'] ?? []), 'savent' => (object)[], 'public' => null];
        } elseif ($i === false) {
            $erreur = 'Secret introuvable';
        } elseif ($action === 'modifier') {
            if (array_key_exists('texte', $body)) $secrets[$i]['texte'] = mb_substr(trim(texteCorps($body['texte'])), 0, 300) ?: $secrets[$i]['texte'];
            if (array_key_exists('mots', $body)) $secrets[$i]['mots'] = motsSecret(is_array($body['mots']) ? $body['mots'] : explode(',', texteCorps($body['mots'])));
        } elseif ($action === 'savoir') {
            $nom = mb_substr(trim(texteCorps($body['nom'] ?? '')), 0, 60);
            $savent = (array)$secrets[$i]['savent'];
            $q = $body['quand'] ?? null;
            if ($nom === '') $erreur = 'Personnage manquant';
            elseif ($q === null) unset($savent[$nom]);
            elseif ($q === 'depart') $savent[$nom] = 'depart';
            elseif (is_array($q) && is_numeric($q['ep'] ?? null)) {
                $st = $db->prepare('SELECT 1 FROM episodes WHERE id = ?');
                $st->execute([(int)$q['ep']]);
                if (!$st->fetchColumn()) $erreur = 'Épisode introuvable';
                else $savent[$nom] = ['ep' => (int)$q['ep'], 'i' => max(0, min(9999, (int)($q['i'] ?? 0)))];
            } else $erreur = 'Moment inconnu';
            $secrets[$i]['savent'] = (object)$savent;
        } elseif ($action === 'public') {
            $q = $body['quand'] ?? null;
            if ($q === null) $secrets[$i]['public'] = null;
            elseif ($q === 'depart') $secrets[$i]['public'] = 'depart';
            elseif (is_array($q) && is_numeric($q['ep'] ?? null)) {
                $st = $db->prepare('SELECT 1 FROM episodes WHERE id = ?');
                $st->execute([(int)$q['ep']]);
                if (!$st->fetchColumn()) $erreur = 'Épisode introuvable';
                else $secrets[$i]['public'] = ['ep' => (int)$q['ep'], 'i' => max(0, min(9999, (int)($q['i'] ?? 0)))];
            } else $erreur = 'Moment inconnu';
        } elseif ($action === 'retirer') {
            array_splice($secrets, $i, 1);
        } else {
            $erreur = 'Action inconnue';
        }
        if ($erreur) {
            $db->exec('ROLLBACK');
            http_response_code(400);
            echo json_encode(['error' => $erreur]);
            return;
        }
        ecrireNoteJson($db, 'secrets', ['secrets' => array_values($secrets)]);
        $db->exec('COMMIT');
    } catch (Throwable $e) {
        $db->exec('ROLLBACK');
        throw $e;
    }
    echo json_encode(['ok' => true, 'secrets' => lireSecrets($db)], JSON_UNESCAPED_UNICODE);
}

// ─── Les fusils de Tchekhov : les fils ouverts de la Mémoire, cherchés dans les scripts ───

const FILS_VIDES = ['avec', 'dans', 'pour', 'sans', 'sous', 'chez', 'mais', 'donc', 'elle', 'elles', 'nous', 'vous', 'leur', 'leurs', 'cette', 'celui', 'celle', 'quand', 'comme', 'tout', 'tous', 'toute', 'toutes', 'plus', 'moins', 'très', 'fait', 'faire', 'être', 'avoir', 'entre', 'vers', 'depuis', 'encore', 'jamais', 'aussi', 'alors', 'notre', 'votre', 'quoi', 'dont'];

// Sans mots-clés choisis, les mots qui portent le titre du fil : « La clé du grenier » → clé, grenier
function motsFil(string $titre): array {
    preg_match_all('/[\p{L}\p{N}][\p{L}\p{N}\'-]*/u', mb_strtolower($titre), $m);
    $mots = [];
    foreach ($m[0] as $w) {
        $w = preg_replace("/^[a-z]'/u", '', $w);
        if (mb_strlen($w) >= 3 && !in_array($w, FILS_VIDES, true) && !in_array($w, ['les', 'des', 'une', 'qui', 'que', 'est', 'son', 'ses', 'sur', 'par', 'pas', 'aux', 'ces', 'mes', 'tes'], true)) $mots[] = $w;
    }
    return array_values(array_unique($mots)) ?: [mb_strtolower(trim($titre))];
}

function filsMentions(PDO $db): array {
    $choisis = lireNoteJson($db, 'fils-mots') ?? [];
    try {
        $fils = $db->query('SELECT id, titre, statut, episode_source_id, episode_resolution_id FROM promesses_narratives ORDER BY id')->fetchAll();
    } catch (Throwable $e) {
        return ['fils' => (object)[]];
    }
    $episodes = scenesSecrets($db);
    $rang = [];
    $dernierEcrit = -1;
    foreach ($episodes as $e) { $rang[$e['id']] = $e; if ($e['scenes']) $dernierEcrit = $e['rang']; }
    $resultat = [];
    foreach ($fils as $f) {
        $id = (int)$f['id'];
        $auto = !isset($choisis[$id]) || !is_array($choisis[$id]) || !$choisis[$id];
        $mots = $auto ? motsFil((string)$f['titre']) : motsSecret($choisis[$id]);
        $eps = [];
        foreach ($episodes as $e) {
            $n = 0;
            $extrait = '';
            foreach ($e['scenes'] as $sc) {
                foreach ($sc['lignes'] as [, $texte]) {
                    foreach ($mots as $m) if (contientMot($texte, $m)) { $n++; $extrait = $extrait ?: extraitSecret($texte, $m); continue 3; }
                }
            }
            if ($n) $eps[] = ['ep' => $e['id'], 'n' => $n, 'extrait' => $extrait];
        }
        $r = fn($ep) => isset($rang[$ep]) ? $rang[$ep]['rang'] : null;
        $alerte = null;
        $ouvert = $f['statut'] === 'ouverte';
        $dernier = $eps ? end($eps) : null;
        $source = $r((int)$f['episode_source_id']);
        if (!$eps) {
            $alerte = ['type' => 'introuvable'];
        } elseif ($ouvert && count($eps) === 1 && $source !== null && $dernierEcrit - $source >= 3) {
            $alerte = ['type' => 'jamais', 'ep' => $eps[0]['ep']];
        } elseif ($ouvert && $dernierEcrit - $r($dernier['ep']) >= 5) {
            $alerte = ['type' => 'pendant', 'ep' => $dernier['ep'], 'depuis' => $dernierEcrit - $r($dernier['ep'])];
        } elseif (!$ouvert && $f['episode_resolution_id']) {
            // Résolu, mais le public l'avait-il encore en tête ?
            $fin = $r((int)$f['episode_resolution_id']);
            $avant = array_values(array_filter($eps, fn($x) => $r($x['ep']) !== null && $fin !== null && $r($x['ep']) < $fin));
            if ($fin !== null && $avant && $fin - $r(end($avant)['ep']) >= 6) {
                $alerte = ['type' => 'rappel', 'ep' => end($avant)['ep'], 'fin' => (int)$f['episode_resolution_id']];
            }
        }
        $resultat[$id] = ['mots' => $mots, 'auto' => $auto, 'eps' => $eps, 'alerte' => $alerte];
    }
    return ['fils' => (object)$resultat];
}

function handleFilsMentions(PDO $db, string $method, array $body): void {
    if ($method === 'GET') { echo json_encode(filsMentions($db), JSON_UNESCAPED_UNICODE); return; }
    $id = (int)($body['id'] ?? 0);
    $st = $db->prepare('SELECT 1 FROM promesses_narratives WHERE id = ?');
    $st->execute([$id]);
    if (!$st->fetchColumn()) { http_response_code(404); echo json_encode(['error' => 'Fil introuvable']); return; }
    $db->exec('BEGIN IMMEDIATE');
    $choisis = lireNoteJson($db, 'fils-mots') ?? [];
    $mots = motsSecret(is_array($body['mots'] ?? null) ? $body['mots'] : explode(',', texteCorps($body['mots'] ?? '')));
    if ($mots) $choisis[$id] = $mots; else unset($choisis[$id]);
    ecrireNoteJson($db, 'fils-mots', $choisis ?: null);
    $db->exec('COMMIT');
    echo json_encode(['ok' => true]);
}
