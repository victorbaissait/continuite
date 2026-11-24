<?php
// api/storyboard.php — Le storyboard : des plans dessinés pour chaque scène, ou le crayonné de chaque case d'une BD
// Les plans vivent dans la base du projet, les images dans data/…/storyboard/ à côté

const SB_IMAGE_MAX = 8 * 1024 * 1024;
const SB_TYPES_IMAGE = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'webp' => 'image/webp'];
const SB_TYPES_SON = ['webm' => 'audio/webm', 'ogg' => 'audio/ogg', 'm4a' => 'audio/mp4', 'mp3' => 'audio/mpeg', 'wav' => 'audio/wav'];
const SB_SON_MAX = 30 * 1024 * 1024;

function assurerStoryboard(PDO $db): void {
    $db->exec("CREATE TABLE IF NOT EXISTS storyboard_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        episode_id INTEGER NOT NULL,
        scene INTEGER NOT NULL,
        ordre INTEGER NOT NULL DEFAULT 0,
        donnees TEXT NOT NULL DEFAULT '{}',
        image TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )");
    $db->exec('CREATE INDEX IF NOT EXISTS idx_storyboard_episode ON storyboard_plans (episode_id, scene, ordre)');
    // La voix enregistrée sur l'animatique d'une scène
    $db->exec("CREATE TABLE IF NOT EXISTS storyboard_sons (
        episode_id INTEGER NOT NULL,
        scene INTEGER NOT NULL,
        fichier TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (episode_id, scene)
    )");
}

function dossierStoryboard(): string {
    $dossier = dirname(DB_PATH) . '/storyboard';
    if (!is_dir($dossier)) mkdir($dossier, 0775, true);
    return $dossier;
}

function planStoryboard(array $r): array {
    return ['id' => (int)$r['id'], 'scene' => (int)$r['scene'], 'ordre' => (int)$r['ordre'], 'd' => json_decode((string)$r['donnees'], true) ?: (object)[], 'image' => $r['image'] ? (string)$r['updated_at'] : null];
}

// Les scènes de l'épisode telles que les lit l'analyse, avec leurs répliques numérotées
function scenesStoryboard(string $texte): array {
    if (estBD()) {
        $cases = lireBD($texte);
        return array_map(fn($c, $i) => [
            'i' => $i, 'slug' => 'Case ' . $c['n'], 'lieu' => $c['lieu'], 'desc' => $c['desc'], 'mots' => $c['mots'], 'secondes' => 0,
            'lignes' => array_map(fn($b, $k) => ['k' => $k, 'qui' => $b['qui'], 'texte' => $b['texte'], 'type' => $b['type'], 'mots' => $b['mots']], $c['bulles'], array_keys($c['bulles'])),
        ], $cases, array_keys($cases));
    }
    $lu = lireLignesEpisode($texte);
    $scenes = [];
    foreach ($lu['scenes'] as $i => [$slug, $lieu]) $scenes[$i] = ['i' => $i, 'slug' => $slug, 'lieu' => $lieu, 'lignes' => [], 'brut' => $slug];
    foreach ($lu['lignes'] as [$i, $qui, $t]) {
        $scenes[$i]['lignes'][] = ['k' => count($scenes[$i]['lignes']), 'qui' => $qui, 'texte' => $t];
        $scenes[$i]['brut'] .= "\n\n" . ($qui !== null ? "$qui\n" : '') . $t;
    }
    // Ce qui précède la première scène n'est une scène que s'il contient quelque chose
    if (!$scenes[0]['lignes']) unset($scenes[0]);
    return array_values(array_map(function ($s) {
        // Une page de scénario dure à peu près une minute ; un roman n'a pas de durée à l'écran
        $s['secondes'] = estRoman() ? 0 : (int)round(pagesScenario($s['brut']) * 60);
        unset($s['brut']);
        return $s;
    }, $scenes));
}

function storyboardEpisode(PDO $db, int $epId): array {
    $st = $db->prepare('SELECT texte_episode FROM episodes WHERE id = ?');
    $st->execute([$epId]);
    $texte = (string)$st->fetchColumn();
    $plans = $db->prepare('SELECT * FROM storyboard_plans WHERE episode_id = ? ORDER BY scene, ordre, id');
    $plans->execute([$epId]);
    $sons = $db->prepare('SELECT scene, updated_at FROM storyboard_sons WHERE episode_id = ?');
    $sons->execute([$epId]);
    return ['scenes' => trim($texte) === '' ? [] : scenesStoryboard($texte), 'plans' => array_map('planStoryboard', $plans->fetchAll()), 'sons' => $sons->fetchAll(PDO::FETCH_KEY_PAIR)];
}

// Un premier découpage : un plan d'ensemble, puis un plan sur chaque personnage qui prend la parole
function genererPlans(PDO $db, int $epId, int $scene): array {
    $scenes = storyboardEpisode($db, $epId)['scenes'];
    $s = array_values(array_filter($scenes, fn($x) => $x['i'] === $scene))[0] ?? null;
    if (!$s) return [];
    $max = $db->prepare('SELECT COALESCE(MAX(ordre), -1) FROM storyboard_plans WHERE episode_id = ? AND scene = ?');
    $max->execute([$epId, $scene]);
    $ordre = (int)$max->fetchColumn() + 1;
    $persos = array_values(array_unique(array_filter(array_column($s['lignes'], 'qui'), fn($q) => $q !== null)));
    $ajout = $db->prepare('INSERT INTO storyboard_plans (episode_id, scene, ordre, donnees) VALUES (?, ?, ?, ?)');
    $nouveaux = [['valeur' => 'PE', 'angle' => 'normal', 'mvt' => 'fixe', 'focale' => 24, 'duree' => 4, 'transition' => 'cut', 'axe' => 'A', 'persos' => array_slice($persos, 0, 4), 'ligne' => null, 'note' => 'Plan d\'installation']];
    $precedent = null;
    foreach ($s['lignes'] as $l) {
        if ($l['qui'] === null || $l['qui'] === $precedent) continue;
        $precedent = $l['qui'];
        $mots = preg_match_all('/\S+/u', $l['texte']);
        $nouveaux[] = ['valeur' => count($persos) > 2 ? 'PM' : 'PR', 'angle' => count($persos) === 2 ? 'epaule' : 'normal', 'mvt' => 'fixe', 'focale' => 50, 'duree' => max(2, (int)round($mots / 2.5)), 'transition' => 'cut', 'axe' => 'A', 'persos' => [$l['qui']], 'ligne' => $l['k'], 'extrait' => mb_substr($l['texte'], 0, 80)];
    }
    foreach ($nouveaux as $d) $ajout->execute([$epId, $scene, $ordre++, json_encode($d, JSON_UNESCAPED_UNICODE)]);
    return storyboardEpisode($db, $epId)['plans'];
}

function handleStoryboard(PDO $db, string $resource, string $method, array $body): void {
    assurerStoryboard($db);
    if ($resource === 'ecriture_sb_image' && $method === 'GET') {
        $st = $db->prepare('SELECT image FROM storyboard_plans WHERE id = ?');
        $st->execute([(int)($_GET['id'] ?? 0)]);
        $fichier = (string)$st->fetchColumn();
        $chemin = dossierStoryboard() . '/' . basename($fichier);
        if ($fichier === '' || !is_file($chemin)) { http_response_code(404); echo json_encode(['error' => 'Image introuvable']); return; }
        header('Content-Type: ' . (SB_TYPES_IMAGE[pathinfo($chemin, PATHINFO_EXTENSION)] ?? 'application/octet-stream'));
        header('Cache-Control: private, max-age=31536000');
        readfile($chemin);
        return;
    }
    if ($resource === 'ecriture_sb_son' && $method === 'GET') {
        $st = $db->prepare('SELECT fichier FROM storyboard_sons WHERE episode_id = ? AND scene = ?');
        $st->execute([(int)($_GET['episode_id'] ?? 0), (int)($_GET['scene'] ?? 0)]);
        $chemin = dossierStoryboard() . '/' . basename((string)$st->fetchColumn());
        if (!is_file($chemin)) { http_response_code(404); echo json_encode(['error' => 'Son introuvable']); return; }
        header('Content-Type: ' . (SB_TYPES_SON[pathinfo($chemin, PATHINFO_EXTENSION)] ?? 'application/octet-stream'));
        readfile($chemin);
        return;
    }
    // Tous les plans du projet, sans le détail : pour le suivi de production
    if ($resource === 'ecriture_sb_tous' && $method === 'GET') {
        $rows = $db->query('SELECT id, episode_id, scene, donnees, image FROM storyboard_plans WHERE episode_id > 0')->fetchAll();
        echo json_encode(array_map(function ($r) {
            $d = json_decode((string)$r['donnees'], true) ?: [];
            return ['e' => (int)$r['episode_id'], 's' => (int)$r['scene'], 'statut' => $d['statut'] ?? '', 'date' => $d['statut_date'] ?? '', 'image' => (bool)$r['image'], 'ref' => !empty($d['ref'])];
        }, $rows), JSON_UNESCAPED_UNICODE);
        return;
    }
    // Les fiches dessinées des personnages vivent hors des épisodes (episode_id = 0)
    if ($resource === 'ecriture_sb_fiches' && $method === 'GET') {
        echo json_encode(array_map('planStoryboard', $db->query('SELECT * FROM storyboard_plans WHERE episode_id = 0 ORDER BY ordre, id')->fetchAll()), JSON_UNESCAPED_UNICODE);
        return;
    }
    if ($method === 'GET') {
        echo json_encode(storyboardEpisode($db, (int)($_GET['episode_id'] ?? 0)), JSON_UNESCAPED_UNICODE);
        return;
    }
    $id = (int)($body['id'] ?? 0);
    $action = texteCorps($body['action'] ?? '');
    $retirerImage = function (int $id) use ($db): void {
        $st = $db->prepare('SELECT image FROM storyboard_plans WHERE id = ?');
        $st->execute([$id]);
        $ancien = (string)$st->fetchColumn();
        if ($ancien !== '') @unlink(dossierStoryboard() . '/' . basename($ancien));
    };
    switch ($action) {
        case 'enregistrer':
            $d = json_encode($body['d'] ?? (object)[], JSON_UNESCAPED_UNICODE);
            if ($id) {
                $db->prepare('UPDATE storyboard_plans SET donnees = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$d, $id]);
            } else {
                $epId = (int)($body['episode_id'] ?? 0);
                $scene = (int)($body['scene'] ?? 0);
                $max = $db->prepare('SELECT COALESCE(MAX(ordre), -1) FROM storyboard_plans WHERE episode_id = ? AND scene = ?');
                $max->execute([$epId, $scene]);
                $db->prepare('INSERT INTO storyboard_plans (episode_id, scene, ordre, donnees) VALUES (?, ?, ?, ?)')->execute([$epId, $scene, (int)$max->fetchColumn() + 1, $d]);
                $id = (int)$db->lastInsertId();
            }
            $st = $db->prepare('SELECT * FROM storyboard_plans WHERE id = ?');
            $st->execute([$id]);
            $plan = $st->fetch();
            if (!$plan) { http_response_code(404); echo json_encode(['error' => 'Plan introuvable']); return; }
            echo json_encode(planStoryboard($plan), JSON_UNESCAPED_UNICODE);
            return;
        case 'supprimer':
            $retirerImage($id);
            $db->prepare('DELETE FROM storyboard_plans WHERE id = ?')->execute([$id]);
            echo json_encode(['ok' => true]);
            return;
        case 'ordonner':
            $maj = $db->prepare('UPDATE storyboard_plans SET ordre = ? WHERE id = ?');
            foreach (array_values((array)($body['ids'] ?? [])) as $n => $pid) $maj->execute([$n, (int)$pid]);
            echo json_encode(['ok' => true]);
            return;
        case 'generer':
            echo json_encode(['plans' => genererPlans($db, (int)($body['episode_id'] ?? 0), (int)($body['scene'] ?? 0))], JSON_UNESCAPED_UNICODE);
            return;
        case 'image':
            $existe = $db->prepare('SELECT 1 FROM storyboard_plans WHERE id = ?');
            $existe->execute([$id]);
            if (!$existe->fetchColumn()) { http_response_code(404); echo json_encode(['error' => 'Plan introuvable']); return; }
            $ext = array_search(texteCorps($body['type'] ?? ''), SB_TYPES_IMAGE, true);
            $octets = base64_decode(texteCorps($body['donnees'] ?? ''), true);
            if ($ext === false || $octets === false || $octets === '') { http_response_code(422); echo json_encode(['error' => 'Image illisible : PNG, JPEG ou WebP seulement.']); return; }
            if (strlen($octets) > SB_IMAGE_MAX) { http_response_code(422); echo json_encode(['error' => 'Image trop lourde (8 Mo au plus).']); return; }
            if (@getimagesizefromstring($octets) === false) { http_response_code(422); echo json_encode(['error' => 'Ce fichier n\'est pas une image.']); return; }
            $retirerImage($id);
            $nom = "plan-$id-" . bin2hex(random_bytes(4)) . ".$ext";
            file_put_contents(dossierStoryboard() . "/$nom", $octets);
            $db->prepare('UPDATE storyboard_plans SET image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$nom, $id]);
            $st = $db->prepare('SELECT * FROM storyboard_plans WHERE id = ?');
            $st->execute([$id]);
            echo json_encode(planStoryboard($st->fetch()), JSON_UNESCAPED_UNICODE);
            return;
        case 'son':
            $epId = (int)($body['episode_id'] ?? 0);
            $scene = (int)($body['scene'] ?? 0);
            $type = preg_replace('/;.*$/', '', texteCorps($body['type'] ?? ''));
            $ext = array_search($type, SB_TYPES_SON, true);
            $octets = base64_decode(texteCorps($body['donnees'] ?? ''), true);
            if ($ext === false || $octets === false || $octets === '') { http_response_code(422); echo json_encode(['error' => 'Son illisible.']); return; }
            if (strlen($octets) > SB_SON_MAX) { http_response_code(422); echo json_encode(['error' => 'Enregistrement trop long (30 Mo au plus).']); return; }
            $st = $db->prepare('SELECT fichier FROM storyboard_sons WHERE episode_id = ? AND scene = ?');
            $st->execute([$epId, $scene]);
            if ($ancien = $st->fetchColumn()) @unlink(dossierStoryboard() . '/' . basename($ancien));
            $nom = "voix-$epId-$scene-" . bin2hex(random_bytes(4)) . ".$ext";
            file_put_contents(dossierStoryboard() . "/$nom", $octets);
            $db->prepare('INSERT OR REPLACE INTO storyboard_sons (episode_id, scene, fichier, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)')->execute([$epId, $scene, $nom]);
            echo json_encode(['ok' => true, 'maj' => date('Y-m-d H:i:s')]);
            return;
        case 'sans_son':
            $st = $db->prepare('SELECT fichier FROM storyboard_sons WHERE episode_id = ? AND scene = ?');
            $st->execute([(int)($body['episode_id'] ?? 0), (int)($body['scene'] ?? 0)]);
            if ($ancien = $st->fetchColumn()) @unlink(dossierStoryboard() . '/' . basename($ancien));
            $db->prepare('DELETE FROM storyboard_sons WHERE episode_id = ? AND scene = ?')->execute([(int)($body['episode_id'] ?? 0), (int)($body['scene'] ?? 0)]);
            echo json_encode(['ok' => true]);
            return;
        case 'sans_image':
            $retirerImage($id);
            $db->prepare('UPDATE storyboard_plans SET image = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$id]);
            echo json_encode(['ok' => true]);
            return;
    }
    http_response_code(404);
    echo json_encode(['error' => 'Action inconnue']);
}
