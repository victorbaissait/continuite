<?php
// api/routes.php — Toutes les routes de l'API

function route(PDO $db, string $method, string $path, array $body): void {
    $parts = explode('/', trim($path, '/'));
    $resource = $parts[0] ?? '';
    $id = isset($parts[1]) && is_numeric($parts[1]) ? (int)$parts[1] : null;
    reglesNoms($db);

    if (str_starts_with($resource, 'ecriture_')) {
        handleEcriture($db, $resource, $method, $body);
        return;
    }

    if ($resource === 'cartes') {
        handleCartes($db, $method, $parts, $body);
        return;
    }
    if ($resource === 'calendrier') {
        handleCalendrier($db, $method, $body);
        return;
    }
    if ($resource === 'fils_mentions') {
        handleFilsMentions($db, $method, $body);
        return;
    }
    if ($resource === 'etats') {
        handleEtats($db, $method, $body);
        return;
    }
    if ($resource === 'voix_ecarts' && $method === 'GET') {
        handleVoixEcarts($db);
        return;
    }
    if ($resource === 'secrets') {
        handleSecrets($db, $method, $body);
        return;
    }
    if ($resource === 'graphe' && $method === 'GET') {
        echo json_encode(grapheRelations($db), JSON_UNESCAPED_UNICODE);
        return;
    }

    // Upload / analyse de texte
    if ($resource === 'upload') {
        handleUpload($db, $body);
        return;
    }

    // Batch — édition en masse
    if ($resource === 'batch' && $method === 'POST') {
        handleBatch($db, $body);
        return;
    }

    // Réanalyse d'un épisode (texte déjà stocké)
    if ($resource === 'reanalyse' && $method === 'POST') {
        handleReanalyse($db, $body);
        return;
    }

    // Analyse multi-épisodes
    if ($resource === 'analyse' && $method === 'POST') {
        handleAnalyse($db, $body);
        return;
    }

    // Auto-détection des décors depuis les textes uploadés
    if ($resource === 'decors_auto' && $method === 'POST') {
        handleDecorsAuto($db);
        return;
    }

    if ($resource === 'stats') {
        handleStats($db, $method, $parts);
        return;
    }

    if ($resource === 'maintenance' && $method === 'GET') {
        handleMaintenance($db);
        return;
    }

    if ($resource === 'analyse_data' && $method === 'GET') {
        handleAnalyseData($db);
        return;
    }

    if ($resource === 'analyse_notes') {
        handleAnalyseNotes($db, $method, $body);
        return;
    }

    if ($resource === 'sauvegardes') {
        handleSauvegardes($db, $method, $parts);
        return;
    }

    if ($resource === 'comparateur') {
        handleComparateur($db, $method, $body);
        return;
    }

    switch ($resource) {
        case 'saisons':    handleSaisons($db, $method, $id, $body); break;
        case 'episodes':   handleEpisodes($db, $method, $id, $body); break;
        case 'frise':      handleFrise($db, $method, $id, $body); break;
        case 'personnages': handlePersonnages($db, $method, $id, $body); break;
        case 'personnage_moments': handlePersonnageMoments($db, $method, $id, $body); break;
        case 'personnage_signatures': handlePersonnageSignatures($db, $method, $id, $body); break;
        case 'noms':       handleNoms($db, $method, $id, $body); break;
        case 'lieux':      handleLieux($db, $method, $id, $body); break;
        case 'themes':     handleThemes($db, $method, $id, $body); break;
        case 'bible_notes': handleBibleNotes($db, $method, $id, $body); break;
        case 'promesses':   handlePromessesNarratives($db, $method, $id, $body); break;
        case 'journal':    handleJournal($db, $method, $id, $body); break;
        case 'lecteurs':   handleLecteurs($db, $method, $parts, $body); break;
        default:
            http_response_code(404);
            echo json_encode(['error' => 'Route non trouvée: ' . $path]);
    }
}

// ===================== SAISONS =====================

function handleSaisons(PDO $db, string $method, ?int $id, array $body): void {
    switch ($method) {
        case 'GET':
            if ($id) {
                $s = $db->prepare('SELECT * FROM saisons WHERE id = ?');
                $s->execute([$id]);
                echo json_encode($s->fetch());
            } else {
                $rows = $db->query('SELECT s.*, COUNT(e.id) as nb_episodes FROM saisons s LEFT JOIN episodes e ON e.saison_id = s.id GROUP BY s.id ORDER BY s.numero')->fetchAll();
                echo json_encode($rows);
            }
            break;
        case 'POST':
            $st = $db->prepare('INSERT INTO saisons (numero, nom, couleur) VALUES (?, ?, ?)');
            $st->execute([$body['numero'] ?? 1, $body['nom'] ?? null, $body['couleur'] ?? '#e74c3c']);
            echo json_encode(['id' => $db->lastInsertId()]);
            break;
        case 'PUT':
            $st = $db->prepare('UPDATE saisons SET numero=?, nom=?, couleur=? WHERE id=?');
            $st->execute([$body['numero'] ?? 1, $body['nom'] ?? null, $body['couleur'] ?? '#888', $id]);
            echo json_encode(['ok' => true]);
            break;
        case 'DELETE':
            $db->prepare('DELETE FROM saisons WHERE id = ?')->execute([$id]);
            echo json_encode(['ok' => true]);
            break;
    }
}

// ===================== ÉPISODES =====================

// La structure propre aux épisodes : appelée une fois par version, sous verrou (voir mettreAJourSchema)
function ensureEpisodesSchema(PDO $db): void {
    // Migration : ajout colonne etat_episode si absente
    try { $db->exec("ALTER TABLE episodes ADD COLUMN etat_episode TEXT DEFAULT NULL"); } catch (Exception $e) {}
    // Migration : ajout colonnes dates d'écriture 1er jet
    try { $db->exec("ALTER TABLE episodes ADD COLUMN date_debut_ecriture TEXT DEFAULT NULL"); } catch (Exception $e) {}
    try { $db->exec("ALTER TABLE episodes ADD COLUMN date_debut_qual TEXT DEFAULT 'exacte'"); } catch (Exception $e) {}
    try { $db->exec("ALTER TABLE episodes ADD COLUMN date_fin_ecriture TEXT DEFAULT NULL"); } catch (Exception $e) {}
    try { $db->exec("ALTER TABLE episodes ADD COLUMN date_fin_qual TEXT DEFAULT 'exacte'"); } catch (Exception $e) {}
    // Migration : chronologie & structure narrative
    try { $db->exec("ALTER TABLE episodes ADD COLUMN moment_journee TEXT DEFAULT 'inconnu'"); } catch (Exception $e) {}
    try { $db->exec("ALTER TABLE episodes ADD COLUMN est_flashback INTEGER DEFAULT 0"); } catch (Exception $e) {}
    try { $db->exec("ALTER TABLE episodes ADD COLUMN date_flashback_origine TEXT DEFAULT NULL"); } catch (Exception $e) {}
    try { $db->exec("ALTER TABLE episodes ADD COLUMN arc_nom TEXT DEFAULT NULL"); } catch (Exception $e) {}
    try { $db->exec("ALTER TABLE episodes ADD COLUMN arc_partie INTEGER DEFAULT NULL"); } catch (Exception $e) {}
    try { $db->exec("ALTER TABLE episodes ADD COLUMN arc_total INTEGER DEFAULT NULL"); } catch (Exception $e) {}
    try { $db->exec("ALTER TABLE episode_plages ADD COLUMN importance TEXT DEFAULT 'principal'"); } catch (Exception $e) {}
    try { $db->exec("
        CREATE TABLE IF NOT EXISTS episode_plages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            episode_id INTEGER NOT NULL,
            date_plage TEXT DEFAULT NULL,
            moment TEXT DEFAULT 'inconnu',
            importance TEXT DEFAULT 'principal',
            est_flashback INTEGER DEFAULT 0,
            date_flashback_origine TEXT DEFAULT NULL,
            FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
        )
    "); } catch (Exception $e) {}
    try { $db->exec("
        CREATE TABLE IF NOT EXISTS episode_liens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            episode_id INTEGER NOT NULL,
            episode_lie_id INTEGER NOT NULL,
            type_lien TEXT NOT NULL DEFAULT 'flashback',
            FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
            FOREIGN KEY (episode_lie_id) REFERENCES episodes(id) ON DELETE CASCADE
        )
    "); } catch (Exception $e) {}
    try { $db->exec("
        CREATE TABLE IF NOT EXISTS episode_mentions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            episode_id INTEGER NOT NULL,
            episode_mentionne_id INTEGER NOT NULL,
            niveau TEXT NOT NULL DEFAULT 'mineure',
            FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
            FOREIGN KEY (episode_mentionne_id) REFERENCES episodes(id) ON DELETE CASCADE
        )
    "); } catch (Exception $e) {}
    try { $db->exec("ALTER TABLE episode_stats ADD COLUMN nb_scenes INTEGER DEFAULT NULL"); } catch (Exception $e) {}
}

function handleEpisodes(PDO $db, string $method, ?int $id, array $body): void {
    switch ($method) {
        case 'GET':
            if ($id) {
                echo json_encode(getEpisodeDetail($db, $id));
            } else {
                echo json_encode(getAllEpisodes($db, !empty($_GET['include_text']), !empty($_GET['include_stats'])));
            }
            break;
        case 'POST':
            $epId = createEpisode($db, $body);
            echo json_encode(['id' => $epId]);
            break;
        case 'PUT':
            updateEpisode($db, $id, $body);
            echo json_encode(['ok' => true]);
            break;
        case 'DELETE':
            $db->prepare('DELETE FROM episodes WHERE id = ?')->execute([$id]);
            echo json_encode(['ok' => true]);
            break;
    }
}

function episodeListSelectFields(PDO $db, bool $includeText = false): string {
    $cols = array_column($db->query("PRAGMA table_info(episodes)")->fetchAll(PDO::FETCH_ASSOC), 'name');
    if (!$includeText) {
        $cols = array_values(array_filter($cols, fn($col) => $col !== 'texte_episode'));
    }
    return implode(",\n               ", array_map(fn($col) => 'e."' . str_replace('"', '""', $col) . '"', $cols));
}

function getAllEpisodes(PDO $db, bool $includeText = false, bool $includeStats = false): array {
    $episodeFields = episodeListSelectFields($db, $includeText);
    $statsJsonField = $includeStats ? 'es.stats_json as stats_json' : 'NULL as stats_json';
    $episodes = $db->query("
        SELECT $episodeFields,
               s.numero as saison_numero, s.couleur as saison_couleur, s.nom as saison_nom,
               es.duree_estimee_min as duree_estimee_min,
               es.nb_mots as nb_mots,
               es.nb_scenes as nb_scenes,
               CASE WHEN es.episode_id IS NULL THEN 0 ELSE 1 END as has_texte,
               $statsJsonField
        FROM episodes e
        JOIN saisons s ON s.id = e.saison_id
        LEFT JOIN episode_stats es ON es.episode_id = e.id
        ORDER BY s.numero, e.numero_episode
    ")->fetchAll();

    attachEpisodeListRelations($db, $episodes, ['personnages', 'lieux', 'extras', 'themes', 'chronology']);

    $intrigues = fetchIntriguesSup($db);
    foreach ($episodes as &$episode) $episode['intrigues_sup'] = (object)($intrigues[(int)$episode['id']] ?? []);
    unset($episode);

    return $episodes;
}

function attachEpisodeListRelations(PDO $db, array &$episodes, array $relations): void {
    if (!$episodes) return;

    $ids = array_values(array_unique(array_map(fn($ep) => (int)$ep['id'], $episodes)));
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $byId = [];

    foreach ($episodes as $idx => &$ep) {
        $epId = (int)$ep['id'];
        $byId[$epId] = $idx;
        $ep['has_texte'] = !empty($ep['has_texte']);
        if (in_array('personnages', $relations, true)) $ep['personnages_principaux'] = [];
        if (in_array('lieux', $relations, true)) $ep['lieux'] = [];
        if (in_array('extras', $relations, true)) $ep['extras'] = [];
        if (in_array('themes', $relations, true)) $ep['themes'] = [];
        if (in_array('chronology', $relations, true)) {
            $ep['plages_temporelles'] = [];
            $ep['liens'] = [];
            $ep['mentions'] = [];
        }
    }
    unset($ep);

    $pushRows = function(string $key, array $rows, string $episodeIdField = 'episode_id') use (&$episodes, $byId): void {
        foreach ($rows as $row) {
            $epId = (int)($row[$episodeIdField] ?? 0);
            if (!isset($byId[$epId])) continue;
            $episodes[$byId[$epId]][$key][] = $row;
        }
    };

    if (in_array('personnages', $relations, true)) {
        $stmt = $db->prepare("
            SELECT ep.*, p.prenom, p.couleur_identite
            FROM episode_personnages ep
            JOIN personnages p ON p.id = ep.personnage_id
            WHERE ep.episode_id IN ($placeholders)
            ORDER BY ep.episode_id, p.est_principal DESC, p.prenom
        ");
        $stmt->execute($ids);
        $pushRows('personnages_principaux', $stmt->fetchAll());
    }

    if (in_array('lieux', $relations, true)) {
        $stmt = $db->prepare("
            SELECT el.*, l.nom as lieu_nom
            FROM episode_lieux el
            JOIN lieux l ON l.id = el.lieu_id
            WHERE el.episode_id IN ($placeholders)
            ORDER BY el.episode_id, l.est_principal DESC, l.nom
        ");
        $stmt->execute($ids);
        $pushRows('lieux', $stmt->fetchAll());
    }

    if (in_array('extras', $relations, true)) {
        $stmt = $db->prepare("SELECT * FROM episode_extras WHERE episode_id IN ($placeholders) ORDER BY episode_id, id");
        $stmt->execute($ids);
        $pushRows('extras', $stmt->fetchAll());
    }

    if (in_array('themes', $relations, true)) {
        $stmt = $db->prepare("
            SELECT et.*, t.nom as theme_nom, t.couleur
            FROM episode_themes et
            JOIN themes t ON t.id = et.theme_id
            WHERE et.episode_id IN ($placeholders)
            ORDER BY et.episode_id, t.nom
        ");
        $stmt->execute($ids);
        $pushRows('themes', $stmt->fetchAll());
    }

    if (in_array('chronology', $relations, true)) {
        $stmt = $db->prepare("
            SELECT episode_id, id, date_plage as date, moment, COALESCE(importance, 'principal') as importance,
                   est_flashback, date_flashback_origine
            FROM episode_plages
            WHERE episode_id IN ($placeholders)
            ORDER BY episode_id, id
        ");
        $stmt->execute($ids);
        $pushRows('plages_temporelles', $stmt->fetchAll());

        $stmt = $db->prepare("
            SELECT el.episode_id, el.id, el.episode_lie_id, el.type_lien,
                   e.titre as ep_titre, e.numero_episode as ep_num, s.numero as ep_saison
            FROM episode_liens el
            JOIN episodes e ON e.id = el.episode_lie_id
            JOIN saisons s ON s.id = e.saison_id
            WHERE el.episode_id IN ($placeholders)
            ORDER BY el.episode_id, el.id
        ");
        $stmt->execute($ids);
        $pushRows('liens', $stmt->fetchAll());

        $stmt = $db->prepare("
            SELECT em.episode_id, em.id, em.episode_mentionne_id, em.niveau,
                   e.titre as ep_titre, e.numero_episode as ep_num, s.numero as ep_saison
            FROM episode_mentions em
            JOIN episodes e ON e.id = em.episode_mentionne_id
            JOIN saisons s ON s.id = e.saison_id
            WHERE em.episode_id IN ($placeholders)
            ORDER BY em.episode_id, em.id
        ");
        $stmt->execute($ids);
        $pushRows('mentions', $stmt->fetchAll());
    }
}

function encodeStatsJson($value): string {
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function combinaisonsValeurs(array $items, int $taille): array {
    $items = array_values($items);
    if ($taille <= 0) return [[]];
    if ($taille > count($items)) return [];

    $out = [];
    $walk = function(int $start, array $current) use (&$walk, &$out, $items, $taille): void {
        if (count($current) === $taille) {
            $out[] = $current;
            return;
        }

        $remaining = $taille - count($current);
        for ($i = $start; $i <= count($items) - $remaining; $i++) {
            $next = $current;
            $next[] = $items[$i];
            $walk($i + 1, $next);
        }
    };

    $walk(0, []);
    return $out;
}

function syncEpisodeStatsTables(PDO $db, int $episodeId, array $stats): void {
    $db->prepare('DELETE FROM episode_stat_personnages WHERE episode_id = ?')->execute([$episodeId]);
    $db->prepare('DELETE FROM episode_stat_lieux WHERE episode_id = ?')->execute([$episodeId]);
    $db->prepare('DELETE FROM episode_stat_scenes WHERE episode_id = ?')->execute([$episodeId]);
    $db->prepare('DELETE FROM episode_stat_copresences WHERE episode_id = ?')->execute([$episodeId]);

    $stPerso = $db->prepare('
        INSERT INTO episode_stat_personnages (episode_id, nom, nb_repliques, nb_mots, type)
        VALUES (?, ?, ?, ?, ?)
    ');
    foreach (($stats['repliques_par_perso'] ?? []) as $nom => $data) {
        $nom = trim((string)$nom);
        if ($nom === '') continue;
        $stPerso->execute([
            $episodeId,
            $nom,
            (int)($data['nb_repliques'] ?? 0),
            (int)($data['nb_mots'] ?? 0),
            $data['type'] ?? null,
        ]);
    }

    $stLieu = $db->prepare('
        INSERT INTO episode_stat_lieux
            (episode_id, lieu_id, nom, nb_scenes, nb_repliques, nb_mots, duree_min, personnages_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ');
    foreach (($stats['repliques_par_lieu'] ?? []) as $row) {
        $lieuId = (int)($row['lieu_id'] ?? 0);
        if (!$lieuId) continue;
        $stLieu->execute([
            $episodeId,
            $lieuId,
            $row['nom'] ?? null,
            (int)($row['nb_scenes'] ?? 0),
            (int)($row['nb_repliques'] ?? 0),
            (int)($row['nb_mots'] ?? 0),
            (int)($row['duree_min'] ?? 0),
            encodeStatsJson($row['personnages'] ?? []),
        ]);
    }

    $stScene = $db->prepare('
        INSERT INTO episode_stat_scenes
            (episode_id, scene_index, lieu_raw, slugline, nb_mots, nb_repliques, persos_json, repliques_json, lieux_detectes_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ');
    $coPresenceAgg = [];
    foreach (array_values($stats['scenes'] ?? []) as $idx => $scene) {
        $repliques = is_array($scene['repliques'] ?? null) ? $scene['repliques'] : [];
        $persos = array_values(array_filter(array_unique(array_map('strval', array_merge(
            $scene['persos'] ?? [],
            array_keys($repliques)
        ))), fn($p) => trim($p) !== ''));
        $nbRepliques = array_sum(array_map('intval', $repliques));

        $stScene->execute([
            $episodeId,
            $idx,
            $scene['lieu_raw'] ?? null,
            $scene['slugline'] ?? null,
            (int)($scene['mots'] ?? 0),
            (int)$nbRepliques,
            encodeStatsJson($persos),
            encodeStatsJson($repliques),
            encodeStatsJson($scene['lieux_detectes'] ?? []),
        ]);

        sort($persos, SORT_NATURAL | SORT_FLAG_CASE);
        $maxSize = min(8, count($persos));
        for ($size = 2; $size <= $maxSize; $size++) {
            foreach (combinaisonsValeurs($persos, $size) as $combo) {
                $key = implode('||', $combo);
                if (!isset($coPresenceAgg[$size][$key])) {
                    $coPresenceAgg[$size][$key] = [
                        'membres' => $combo,
                        'nb_scenes' => 0,
                        'nb_repliques' => 0,
                    ];
                }
                $coPresenceAgg[$size][$key]['nb_scenes']++;
                foreach ($combo as $nom) {
                    $coPresenceAgg[$size][$key]['nb_repliques'] += (int)($repliques[$nom] ?? 0);
                }
            }
        }
    }

    $stCo = $db->prepare('
        INSERT INTO episode_stat_copresences
            (episode_id, type, taille, cle, membres_json, nb_scenes, nb_repliques)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ');
    foreach ($coPresenceAgg as $size => $rows) {
        foreach ($rows as $key => $row) {
            $stCo->execute([
                $episodeId,
                'personnages',
                (int)$size,
                $key,
                encodeStatsJson($row['membres']),
                (int)$row['nb_scenes'],
                (int)$row['nb_repliques'],
            ]);
        }
    }
}

function ensureStatsTablesBackfilled(PDO $db): void {
    static $done = false;
    if ($done) return;
    $done = true;

    if (function_exists('ensureStatsTables')) ensureStatsTables($db);

    $db->exec('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)');
    $current = $db->prepare("SELECT value FROM app_meta WHERE key = 'stats_tables_backfilled_v1'");
    $current->execute();
    if ($current->fetchColumn() === '1') return;

    $ownTransaction = !$db->inTransaction();
    if ($ownTransaction) $db->beginTransaction();

    try {
        $rows = $db->query('SELECT episode_id, stats_json FROM episode_stats WHERE stats_json IS NOT NULL')->fetchAll();
        foreach ($rows as $row) {
            $stats = json_decode($row['stats_json'] ?? '', true);
            if (!is_array($stats)) continue;
            syncEpisodeStatsTables($db, (int)$row['episode_id'], $stats);
        }

        $db->prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('stats_tables_backfilled_v1', '1')")->execute();
        if ($ownTransaction) $db->commit();
    } catch (Throwable $e) {
        if ($ownTransaction && $db->inTransaction()) $db->rollBack();
        throw $e;
    }
}

function fetchStatsPersonnagesByEpisode(PDO $db, array $ids = []): array {
    ensureStatsTablesBackfilled($db);
    $params = [];
    $where = '';
    if ($ids) {
        $params = array_values(array_map('intval', $ids));
        $where = 'WHERE episode_id IN (' . implode(',', array_fill(0, count($params), '?')) . ')';
    }

    $stmt = $db->prepare("
        SELECT episode_id, nom, nb_repliques, nb_mots, type
        FROM episode_stat_personnages
        $where
        ORDER BY episode_id, nb_repliques DESC, nom
    ");
    $stmt->execute($params);

    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $epId = (int)$row['episode_id'];
        if (!isset($out[$epId])) $out[$epId] = [];
        $out[$epId][$row['nom']] = [
            'nb_repliques' => (int)$row['nb_repliques'],
            'nb_mots' => (int)$row['nb_mots'],
            'type' => $row['type'] ?: 'autre',
        ];
    }
    return $out;
}

function fetchStatsLieuxByEpisode(PDO $db, array $ids = []): array {
    ensureStatsTablesBackfilled($db);
    $params = [];
    $where = '';
    if ($ids) {
        $params = array_values(array_map('intval', $ids));
        $where = 'WHERE episode_id IN (' . implode(',', array_fill(0, count($params), '?')) . ')';
    }

    $stmt = $db->prepare("
        SELECT episode_id, lieu_id, nom, nb_scenes, nb_repliques, nb_mots, duree_min, personnages_json
        FROM episode_stat_lieux
        $where
        ORDER BY episode_id, nb_scenes DESC, nb_repliques DESC
    ");
    $stmt->execute($params);

    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $epId = (int)$row['episode_id'];
        if (!isset($out[$epId])) $out[$epId] = [];
        $out[$epId][] = [
            'lieu_id' => (int)$row['lieu_id'],
            'nom' => $row['nom'] ?? '',
            'nb_scenes' => (int)$row['nb_scenes'],
            'nb_repliques' => (int)$row['nb_repliques'],
            'nb_mots' => (int)$row['nb_mots'],
            'duree_min' => (int)$row['duree_min'],
            'personnages' => json_decode($row['personnages_json'] ?? '[]', true) ?: [],
        ];
    }
    return $out;
}

function fetchStatsScenesByEpisode(PDO $db, array $ids = []): array {
    ensureStatsTablesBackfilled($db);
    $params = [];
    $where = '';
    if ($ids) {
        $params = array_values(array_map('intval', $ids));
        $where = 'WHERE episode_id IN (' . implode(',', array_fill(0, count($params), '?')) . ')';
    }

    $stmt = $db->prepare("
        SELECT episode_id, lieu_raw, slugline, nb_mots, nb_repliques, persos_json, repliques_json, lieux_detectes_json
        FROM episode_stat_scenes
        $where
        ORDER BY episode_id, scene_index
    ");
    $stmt->execute($params);

    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $epId = (int)$row['episode_id'];
        if (!isset($out[$epId])) $out[$epId] = [];
        $out[$epId][] = [
            'persos' => json_decode($row['persos_json'] ?? '[]', true) ?: [],
            'repliques' => json_decode($row['repliques_json'] ?? '[]', true) ?: [],
            'mots' => (int)$row['nb_mots'],
            'lieu_raw' => $row['lieu_raw'] ?? null,
            'slugline' => $row['slugline'] ?? null,
            'lieux_detectes' => json_decode($row['lieux_detectes_json'] ?? '[]', true) ?: [],
        ];
    }
    return $out;
}

function getEpisodeStatsSlices(PDO $db, array $keys): array {
    $allowed = ['repliques_par_lieu', 'repliques_par_perso', 'scenes'];
    $keys = array_values(array_intersect($allowed, $keys));
    if (!$keys) return [];

    $slices = [];

    if (in_array('repliques_par_perso', $keys, true)) {
        foreach (fetchStatsPersonnagesByEpisode($db) as $epId => $rows) {
            $slices[$epId]['repliques_par_perso'] = $rows;
        }
    }

    if (in_array('repliques_par_lieu', $keys, true)) {
        foreach (fetchStatsLieuxByEpisode($db) as $epId => $rows) {
            $slices[$epId]['repliques_par_lieu'] = $rows;
        }
    }

    if (in_array('scenes', $keys, true)) {
        foreach (fetchStatsScenesByEpisode($db) as $epId => $rows) {
            $slices[$epId]['scenes'] = $rows;
        }
    }

    return $slices;
}

function getEpisodesStatsBase(PDO $db): array {
    $episodeFields = episodeListSelectFields($db, false);
    $episodes = $db->query("
        SELECT $episodeFields,
               s.numero as saison_numero, s.couleur as saison_couleur, s.nom as saison_nom,
               es.duree_estimee_min as duree_estimee_min,
               es.nb_mots as nb_mots,
               es.nb_scenes as nb_scenes,
               CASE WHEN es.episode_id IS NULL THEN 0 ELSE 1 END as has_texte,
               NULL as stats_json
        FROM episodes e
        JOIN saisons s ON s.id = e.saison_id
        LEFT JOIN episode_stats es ON es.episode_id = e.id
        ORDER BY s.numero, e.numero_episode
    ")->fetchAll();

    attachEpisodeListRelations($db, $episodes, ['personnages', 'lieux']);

    return $episodes;
}

function getEpisodesWithStatsSlice(PDO $db, array $keys): array {
    $episodes = getEpisodesStatsBase($db);
    $statsSlices = getEpisodeStatsSlices($db, $keys);

    foreach ($episodes as &$ep) {
        $ep['stats_json'] = $statsSlices[(int)$ep['id']] ?? null;
    }
    unset($ep);

    return $episodes;
}

function handleStats(PDO $db, string $method, array $parts): void {
    if ($method !== 'GET') {
        http_response_code(405);
        echo json_encode(['error' => 'Méthode non autorisée']);
        return;
    }

    $scope = $parts[1] ?? '';
    switch ($scope) {
        case 'decors':
            echo json_encode(getEpisodesWithStatsSlice($db, ['repliques_par_lieu']));
            break;
        case 'batch':
        case 'diagnostics':
            echo json_encode(getEpisodesWithStatsSlice($db, ['repliques_par_perso', 'repliques_par_lieu']));
            break;
        case 'personnages':
            echo json_encode(getEpisodesWithStatsSlice($db, ['repliques_par_perso', 'scenes']));
            break;
        default:
            http_response_code(404);
            echo json_encode(['error' => 'Stats non trouvées: ' . $scope]);
    }
}

function handleMaintenance(PDO $db): void {
    ensureStatsTablesBackfilled($db);

    $scalar = function(string $sql, array $params = []) use ($db): int {
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        return (int)$stmt->fetchColumn();
    };

    $episodesTotal = $scalar('SELECT COUNT(*) FROM episodes');
    $episodesAvecTexte = $scalar("SELECT COUNT(*) FROM episodes WHERE texte_episode IS NOT NULL AND TRIM(texte_episode) <> ''");
    $episodesSansTexte = max(0, $episodesTotal - $episodesAvecTexte);
    $episodesAnalyses = $scalar('SELECT COUNT(*) FROM episode_stats');
    $statsManquantes = $scalar("
        SELECT COUNT(*)
        FROM episodes e
        LEFT JOIN episode_stats es ON es.episode_id = e.id
        WHERE e.texte_episode IS NOT NULL
          AND TRIM(e.texte_episode) <> ''
          AND es.episode_id IS NULL
    ");
    $statsScenesMismatch = $scalar("
        SELECT COUNT(*)
        FROM episode_stats es
        LEFT JOIN (
            SELECT episode_id, COUNT(*) as nb_scenes_table
            FROM episode_stat_scenes
            GROUP BY episode_id
        ) sc ON sc.episode_id = es.episode_id
        WHERE COALESCE(es.nb_scenes, 0) <> COALESCE(sc.nb_scenes_table, 0)
    ");

    $personnages = $db->query('SELECT id, prenom, nom, nom_affichage, couleur_identite FROM personnages')->fetchAll();
    $presentPersos = [];
    $rows = $db->query('SELECT episode_id, personnage_id FROM episode_personnages WHERE present = 1')->fetchAll();
    foreach ($rows as $row) $presentPersos[(int)$row['episode_id']][(int)$row['personnage_id']] = true;

    $detectedPersos = [];
    $personDetectedMissing = 0;
    $rows = $db->query('
        SELECT episode_id, nom, nb_repliques
        FROM episode_stat_personnages
        WHERE nb_repliques > 0
    ')->fetchAll();
    foreach ($rows as $row) {
        $matched = matcherPersonnageDepuisNom((string)$row['nom'], $personnages);
        if (!$matched) continue;
        $episodeId = (int)$row['episode_id'];
        $personnageId = (int)$matched['id'];
        $detectedPersos[$episodeId][$personnageId] = true;
        if (empty($presentPersos[$episodeId][$personnageId])) $personDetectedMissing++;
    }

    $personPresentNotDetected = 0;
    foreach ($presentPersos as $episodeId => $personRows) {
        foreach ($personRows as $personnageId => $_) {
            if (empty($detectedPersos[$episodeId][$personnageId])) $personPresentNotDetected++;
        }
    }

    $lieuDetectedMissing = $scalar("
        SELECT COUNT(*)
        FROM episode_stat_lieux esl
        LEFT JOIN episode_lieux el ON el.episode_id = esl.episode_id
            AND el.lieu_id = esl.lieu_id
            AND el.statut = 'present'
        WHERE (esl.nb_scenes > 0 OR esl.nb_repliques > 0)
          AND el.episode_id IS NULL
    ");
    $lieuPresentNotDetected = $scalar("
        SELECT COUNT(*)
        FROM episode_lieux el
        LEFT JOIN episode_stat_lieux esl ON esl.episode_id = el.episode_id
            AND esl.lieu_id = el.lieu_id
        WHERE el.statut = 'present'
          AND esl.episode_id IS NULL
    ");

    $dbSize = defined('DB_PATH') && file_exists(DB_PATH) ? filesize(DB_PATH) : null;
    $indexCount = $scalar("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%'");
    $statsRows = [
        'personnages' => $scalar('SELECT COUNT(*) FROM episode_stat_personnages'),
        'lieux' => $scalar('SELECT COUNT(*) FROM episode_stat_lieux'),
        'scenes' => $scalar('SELECT COUNT(*) FROM episode_stat_scenes'),
        'copresences' => $scalar('SELECT COUNT(*) FROM episode_stat_copresences'),
    ];
    $statsARecalculer = $statsManquantes + $statsScenesMismatch;
    $incoherences = $personDetectedMissing + $personPresentNotDetected + $lieuDetectedMissing + $lieuPresentNotDetected;

    echo json_encode([
        'generated_at' => date('c'),
        'database' => [
            'ok' => true,
            'sqlite_version' => $db->query('SELECT sqlite_version()')->fetchColumn(),
            'size_bytes' => $dbSize,
            'indexes' => $indexCount,
        ],
        'counts' => [
            'saisons' => $scalar('SELECT COUNT(*) FROM saisons'),
            'episodes' => $episodesTotal,
            'personnages' => $scalar('SELECT COUNT(*) FROM personnages'),
            'lieux' => $scalar('SELECT COUNT(*) FROM lieux'),
            'themes' => $scalar('SELECT COUNT(*) FROM themes'),
        ],
        'texts' => [
            'episodes_avec_texte' => $episodesAvecTexte,
            'episodes_sans_texte' => $episodesSansTexte,
        ],
        'stats' => [
            'episodes_analyses' => $episodesAnalyses,
            'stats_manquantes' => $statsManquantes,
            'stats_scenes_mismatch' => $statsScenesMismatch,
            'stats_a_recalculer' => $statsARecalculer,
            'tables' => $statsRows,
        ],
        'incoherences' => [
            'total' => $incoherences,
            'personnages_detectes_absents' => $personDetectedMissing,
            'personnages_presents_non_detectes' => $personPresentNotDetected,
            'lieux_detectes_absents' => $lieuDetectedMissing,
            'lieux_presents_non_detectes' => $lieuPresentNotDetected,
        ],
        'fiabilite' => fiabiliteDonnees($db),
        'status' => [
            'level' => ($statsARecalculer === 0 && $incoherences === 0) ? 'ok' : 'warning',
            'message' => ($statsARecalculer === 0 && $incoherences === 0)
                ? 'Tout semble cohérent.'
                : 'Quelques points méritent une vérification.',
        ],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

// Ce qui fausse encore les chiffres : chaque point dit quoi faire, rien n'est corrigé seul
function fiabiliteDonnees(PDO $db): array {
    $personnages = $db->query('SELECT * FROM personnages')->fetchAll();
    $attendu = [];
    foreach ($db->query('SELECT episode_id, nom, nb_repliques FROM episode_stat_personnages')->fetchAll() as $r) {
        $p = matcherPersonnageDepuisNom((string)$r['nom'], $personnages);
        if ($p) {
            $cle = $r['episode_id'] . ':' . $p['id'];
            $attendu[$cle] = ($attendu[$cle] ?? 0) + (int)$r['nb_repliques'];
        }
    }
    $analyses = array_flip($db->query('SELECT episode_id FROM episode_stats')->fetchAll(PDO::FETCH_COLUMN));
    $perimees = 0;
    $enTrop = 0;
    foreach ($db->query('SELECT episode_id, personnage_id, nb_repliques FROM episode_personnages WHERE nb_repliques > 0')->fetchAll() as $r) {
        if (!isset($analyses[$r['episode_id']])) continue;
        $ecart = (int)$r['nb_repliques'] - ($attendu[$r['episode_id'] . ':' . $r['personnage_id']] ?? 0);
        if ($ecart !== 0) {
            $perimees++;
            $enTrop += max(0, $ecart);
        }
    }

    $inconnus = getNomsNonReconnus($db, $personnages);
    $sansDecor = $db->query("SELECT lieu_raw, COUNT(*) AS nb FROM episode_stat_scenes WHERE COALESCE(lieux_detectes_json, '[]') = '[]' GROUP BY lieu_raw ORDER BY nb DESC")->fetchAll();

    return [
        'presences' => ['lignes' => $perimees, 'repliques' => $enTrop],
        'noms' => ['nb' => count($inconnus), 'repliques' => array_sum(array_column($inconnus, 'nb_repliques')), 'exemples' => array_column(array_slice($inconnus, 0, 3), 'nom')],
        'decors' => ['scenes' => (int)array_sum(array_column($sansDecor, 'nb')), 'total' => (int)$db->query('SELECT COUNT(*) FROM episode_stat_scenes')->fetchColumn(), 'exemples' => array_values(array_filter(array_column(array_slice($sansDecor, 0, 4), 'lieu_raw')))],
        'pages' => (int)$db->query('SELECT COUNT(*) FROM episodes WHERE COALESCE(nb_pages, 0) = 0')->fetchColumn(),
        'titres' => (int)$db->query("SELECT COUNT(*) FROM episodes WHERE TRIM(COALESCE(titre, '')) = ''")->fetchColumn(),
    ];
}

function normaliserComparaisonTexte(string $s): string {
    $s = mb_strtolower(trim($s), 'UTF-8');
    $s = str_replace(
        ['é','è','ê','ë','à','â','ä','î','ï','ô','ö','ù','û','ü','ç','œ','æ','’', "'"],
        ['e','e','e','e','a','a','a','i','i','o','o','u','u','u','c','oe','ae',' ', ' '],
        $s
    );
    $s = preg_replace('/[^a-z0-9]+/u', ' ', $s);
    return trim(preg_replace('/\s+/', ' ', $s));
}

function codeEpisode(array $ep): string {
    return 'S' . ($ep['saison_numero'] ?? '?') . 'E' . str_pad((string)($ep['numero_episode'] ?? 0), 2, '0', STR_PAD_LEFT);
}

function getEpisodeCompareBundle(PDO $db, int $episodeId): array {
    ensurePromessesNarratives($db);
    ensureStatsTablesBackfilled($db);

    $stmt = $db->prepare("
        SELECT e.*, s.numero as saison_numero, s.nom as saison_nom, s.couleur as saison_couleur,
               es.nb_repliques_total, es.nb_mots, es.nb_scenes, es.duree_estimee_min
        FROM episodes e
        JOIN saisons s ON s.id = e.saison_id
        LEFT JOIN episode_stats es ON es.episode_id = e.id
        WHERE e.id = ?
    ");
    $stmt->execute([$episodeId]);
    $episode = $stmt->fetch();
    if (!$episode) return [];

    $stmt = $db->prepare("
        SELECT p.id, p.prenom, p.nom, p.nom_affichage, p.couleur_identite, ep.nb_repliques
        FROM episode_personnages ep
        JOIN personnages p ON p.id = ep.personnage_id
        WHERE ep.episode_id = ? AND ep.present = 1
        ORDER BY ep.nb_repliques DESC, p.prenom
    ");
    $stmt->execute([$episodeId]);
    $personnages = array_map(function($p) {
        $p['label'] = personnageLabel($p);
        return $p;
    }, $stmt->fetchAll());

    $stmt = $db->prepare("
        SELECT l.id, l.nom, l.nom_affichage, l.est_principal, el.statut
        FROM episode_lieux el
        JOIN lieux l ON l.id = el.lieu_id
        WHERE el.episode_id = ? AND el.statut = 'present'
        ORDER BY l.est_principal DESC, l.nom
    ");
    $stmt->execute([$episodeId]);
    $lieux = $stmt->fetchAll();

    $stmt = $db->prepare("
        SELECT t.id, t.nom, t.couleur, et.intensite
        FROM episode_themes et
        JOIN themes t ON t.id = et.theme_id
        WHERE et.episode_id = ?
        ORDER BY t.nom
    ");
    $stmt->execute([$episodeId]);
    $themes = $stmt->fetchAll();

    $stmt = $db->prepare("
        SELECT id, date_plage as date, moment, COALESCE(importance, 'principal') as importance,
               est_flashback, date_flashback_origine
        FROM episode_plages
        WHERE episode_id = ?
        ORDER BY id
    ");
    $stmt->execute([$episodeId]);
    $plages = $stmt->fetchAll();

    $stmt = $db->prepare("
        SELECT episode_id, nom, nb_repliques, nb_mots, type
        FROM episode_stat_personnages
        WHERE episode_id = ?
        ORDER BY nb_repliques DESC, nom
    ");
    $stmt->execute([$episodeId]);
    $statsPersos = $stmt->fetchAll();

    $stmt = $db->prepare("
        SELECT episode_id, lieu_id, nom, nb_scenes, nb_repliques, nb_mots, duree_min, personnages_json
        FROM episode_stat_lieux
        WHERE episode_id = ?
        ORDER BY nb_scenes DESC, nb_repliques DESC
    ");
    $stmt->execute([$episodeId]);
    $statsLieux = array_map(function($row) {
        $row['personnages'] = json_decode($row['personnages_json'] ?? '[]', true) ?: [];
        unset($row['personnages_json']);
        return $row;
    }, $stmt->fetchAll());

    $stmt = $db->prepare("
        SELECT scene_index, lieu_raw, slugline, nb_mots, nb_repliques,
               persos_json, repliques_json, lieux_detectes_json
        FROM episode_stat_scenes
        WHERE episode_id = ?
        ORDER BY scene_index
    ");
    $stmt->execute([$episodeId]);
    $scenes = array_map(function($row) {
        $row['persos'] = json_decode($row['persos_json'] ?? '[]', true) ?: [];
        $row['repliques'] = json_decode($row['repliques_json'] ?? '[]', true) ?: [];
        $row['lieux_detectes'] = json_decode($row['lieux_detectes_json'] ?? '[]', true) ?: [];
        unset($row['persos_json'], $row['repliques_json'], $row['lieux_detectes_json']);
        return $row;
    }, $stmt->fetchAll());

    return [
        'episode' => $episode,
        'personnages' => $personnages,
        'lieux' => $lieux,
        'themes' => $themes,
        'plages' => $plages,
        'stats_personnages' => $statsPersos,
        'stats_lieux' => $statsLieux,
        'scenes' => $scenes,
        'mots' => getEpisodeTopWords($db, $episode['texte_episode'] ?? ''),
    ];
}

function getEpisodeTopWords(PDO $db, string $texte): array {
    if (trim($texte) === '') return [];

    $stop = array_flip([
        'le','la','les','un','une','des','du','de','d','l','a','au','aux','en','et','ou',
        'mais','donc','or','ni','car','que','qui','quoi','dont','se','si','je','tu','il','elle',
        'nous','vous','ils','elles','me','te','lui','y','on','mon','ma','mes','ton','ta','tes',
        'son','sa','ses','notre','votre','leur','leurs','ce','cet','cette','ces','ca','c','j',
        'n','m','s','qu','ne','pas','plus','tres','bien','tout','tous','toute','toutes',
        'par','pour','sur','sous','dans','avec','sans','entre','vers','chez','apres','avant','contre',
        'meme','aussi','alors','encore','puis','deja','non','oui','ah','oh','eh','hm','bon','ben',
        'ici','ainsi','peu','trop','moins','comme','quand','comment','pourquoi','parce',
        'voila','va','allons','allez',
        'moi','toi','soi','eux','maintenant','jamais','toujours','souvent','parfois',
        'quelque','quelques','plusieurs','chaque','quel','quelle',
        'tant','autant','assez','environ','bah','euh','hein',
        'pause','string','uuid','window','name','type','gender','revision',
        'int','ext','jour','nuit','you','the','and','for','this','that','with',
    ]);

    $stopVerbes = array_flip([
        'etre','avoir','est','sont','etait','etaient','sera','serait','serais','serons','seront',
        'ai','as','avons','avez','ont','avait','avaient','aura','aurait','aurais','aurons','auront',
        'eu','eue','ete',
        'fait','fais','faire','dit','dis','dire',
        'vois','voit','voyons','voyez','voient','voir',
        'veux','veut','vouloir','voulais','voulait','voulez','voulons','veulent',
        'suis','sais','sait','savoir','savais','savait',
        'peux','peut','pouvoir','pouvais','pouvait','pouvez','peuvent',
        'dois','doit','devoir','devais','devait','devez','doivent',
        'vais','vas','vont','allais','allait',
        'faut','falloir',
        'crois','croit','croire','croyais','croyait',
        'viens','vient','venir','venais','venait',
        'suit','suivre',
        'avais','aurai','aurez',
        'etais','etiez','etions',
        'faisais','faisait','faisiez','faisions',
        'disais','disait','disiez','disions',
    ]);

    $personnages = $db->query('SELECT prenom, nom, nom_affichage FROM personnages')->fetchAll();
    $nomsPersoExclus = [];
    foreach ($personnages as $p) {
        foreach (['prenom', 'nom', 'nom_affichage'] as $champ) {
            $tokens = preg_split('/\s+/', normaliserComparaisonTexte($p[$champ] ?? ''), -1, PREG_SPLIT_NO_EMPTY);
            foreach ($tokens as $token) {
                if (strlen($token) >= 3) $nomsPersoExclus[$token] = true;
            }
        }
    }

    $texte = mb_strtolower(texteDesRepliques($texte), 'UTF-8');
    $texte = str_replace(
        ['é','è','ê','ë','à','â','ä','î','ï','ô','ö','ù','û','ü','ç','œ','æ','’'],
        ['e','e','e','e','a','a','a','i','i','o','o','u','u','u','c','oe','ae', "'"],
        $texte
    );
    $texte = preg_replace('/[^a-z\s\-\']/u', ' ', $texte);

    $freq = [];
    foreach (preg_split('/[\s\-\']+/', $texte, -1, PREG_SPLIT_NO_EMPTY) as $mot) {
        $mot = preg_replace('/[^a-z0-9]+/u', '', trim($mot, "-'"));
        if (strlen($mot) < 3 || isset($stop[$mot])) continue;
        if (isset($stopVerbes[$mot])) continue;
        if (isset($nomsPersoExclus[$mot])) continue;
        if (isset($formesMajuscules[$mot])) continue;
        $freq[$mot] = ($freq[$mot] ?? 0) + 1;
    }
    arsort($freq);

    $out = [];
    foreach (array_slice($freq, 0, 80, true) as $mot => $nb) {
        $out[] = ['mot' => $mot, 'nb' => $nb];
    }
    return $out;
}

function getPromessesForEpisodes(PDO $db, array $episodeIds): array {
    ensurePromessesNarratives($db);
    $ids = array_values(array_unique(array_map('intval', $episodeIds)));
    if (!$ids) return [];

    $ph = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $db->prepare(promessesNarrativesSelectSql() . "
        LEFT JOIN promesse_episodes pe_filter ON pe_filter.promesse_id = p.id
        WHERE p.episode_source_id IN ($ph)
           OR p.episode_resolution_id IN ($ph)
           OR pe_filter.episode_id IN ($ph)
        GROUP BY p.id
        ORDER BY ss.numero, es.numero_episode, p.id
    ");
    $stmt->execute(array_merge($ids, $ids, $ids));
    $rows = $stmt->fetchAll();

    foreach ($rows as &$row) {
        attachPromesseJalons($db, $row);
        $row['episode_roles'] = [];
        foreach ($ids as $episodeId) {
            $roles = [];
            if ((int)$row['episode_source_id'] === $episodeId) $roles[] = 'lance';
            if ((int)($row['episode_resolution_id'] ?? 0) === $episodeId) $roles[] = 'paie';
            foreach ($row['episodes_jalons'] ?? [] as $jalon) {
                if ((int)$jalon['episode_id'] === $episodeId) {
                    $roles[] = !empty($jalon['est_decisif']) ? 'decisif' : 'jalon';
                }
            }
            if ($roles) $row['episode_roles'][$episodeId] = array_values(array_unique($roles));
        }
    }
    unset($row);

    return $rows;
}

function compareById(array $left, array $right, string $idKey = 'id'): array {
    $a = [];
    $b = [];
    foreach ($left as $row) $a[(int)$row[$idKey]] = $row;
    foreach ($right as $row) $b[(int)$row[$idKey]] = $row;

    $shared = [];
    foreach ($a as $id => $row) {
        if (isset($b[$id])) $shared[] = ['a' => $row, 'b' => $b[$id]];
    }

    return [
        'shared' => $shared,
        'only_a' => array_values(array_diff_key($a, $b)),
        'only_b' => array_values(array_diff_key($b, $a)),
    ];
}

function compareWords(array $wordsA, array $wordsB): array {
    $a = [];
    $b = [];
    foreach ($wordsA as $row) $a[$row['mot']] = (int)$row['nb'];
    foreach ($wordsB as $row) $b[$row['mot']] = (int)$row['nb'];

    $shared = [];
    foreach ($a as $mot => $nbA) {
        if (isset($b[$mot])) $shared[] = ['mot' => $mot, 'a' => $nbA, 'b' => $b[$mot], 'total' => $nbA + $b[$mot]];
    }
    usort($shared, fn($x, $y) => $y['total'] <=> $x['total']);

    return [
        'shared' => array_slice($shared, 0, 30),
        'only_a' => array_slice(array_values(array_map(fn($mot, $nb) => ['mot' => $mot, 'nb' => $nb], array_keys(array_diff_key($a, $b)), array_values(array_diff_key($a, $b)))), 0, 20),
        'only_b' => array_slice(array_values(array_map(fn($mot, $nb) => ['mot' => $mot, 'nb' => $nb], array_keys(array_diff_key($b, $a)), array_values(array_diff_key($b, $a)))), 0, 20),
    ];
}

function compareStructure(array $a, array $b): array {
    $ea = $a['episode'];
    $eb = $b['episode'];
    $fields = [
        ['label' => 'Jet', 'key' => 'jet'],
        ['label' => 'État', 'key' => 'etat_episode'],
        ['label' => 'Arc', 'key' => 'arc_nom'],
        ['label' => 'Moment journée', 'key' => 'moment_journee'],
        ['label' => 'Flashback', 'key' => 'est_flashback'],
        ['label' => 'Pages', 'key' => 'nb_pages'],
        ['label' => 'Scènes détectées', 'key' => 'nb_scenes'],
        ['label' => 'Durée estimée', 'key' => 'duree_estimee_min'],
    ];

    $rows = [];
    foreach ($fields as $field) {
        $key = $field['key'];
        $va = $ea[$key] ?? null;
        $vb = $eb[$key] ?? null;
        $rows[] = [
            'label' => $field['label'],
            'a' => $va,
            'b' => $vb,
            'same' => $va !== null && $va !== '' && (string)$va === (string)$vb,
        ];
    }

    return [
        'rows' => $rows,
        'plages_a' => $a['plages'],
        'plages_b' => $b['plages'],
    ];
}

function compareScenes(array $a, array $b): array {
    $out = [];

    foreach ($a['scenes'] as $sceneA) {
        $persosA = array_values(array_unique(array_map('strval', $sceneA['persos'] ?? [])));
        $lieuxA = array_values(array_unique(array_map('intval', $sceneA['lieux_detectes'] ?? [])));
        $lieuRawA = normaliserComparaisonTexte($sceneA['lieu_raw'] ?? '');

        foreach ($b['scenes'] as $sceneB) {
            $persosB = array_values(array_unique(array_map('strval', $sceneB['persos'] ?? [])));
            $lieuxB = array_values(array_unique(array_map('intval', $sceneB['lieux_detectes'] ?? [])));
            $lieuRawB = normaliserComparaisonTexte($sceneB['lieu_raw'] ?? '');

            $sharedPersos = array_values(array_intersect($persosA, $persosB));
            $sharedLieux = array_values(array_intersect($lieuxA, $lieuxB));
            $score = count($sharedPersos) * 2 + count($sharedLieux) * 4;
            if ($lieuRawA && $lieuRawA === $lieuRawB) $score += 3;

            $motsA = (int)($sceneA['nb_mots'] ?? 0);
            $motsB = (int)($sceneB['nb_mots'] ?? 0);
            if ($motsA > 0 && $motsB > 0 && abs($motsA - $motsB) <= max(30, min($motsA, $motsB) * 0.3)) $score += 1;

            if ($score < 4) continue;
            $out[] = [
                'score' => $score,
                'scene_a' => [
                    'index' => (int)$sceneA['scene_index'] + 1,
                    'lieu_raw' => $sceneA['lieu_raw'] ?? '',
                    'slugline' => $sceneA['slugline'] ?? '',
                    'nb_mots' => $motsA,
                    'nb_repliques' => (int)($sceneA['nb_repliques'] ?? 0),
                ],
                'scene_b' => [
                    'index' => (int)$sceneB['scene_index'] + 1,
                    'lieu_raw' => $sceneB['lieu_raw'] ?? '',
                    'slugline' => $sceneB['slugline'] ?? '',
                    'nb_mots' => $motsB,
                    'nb_repliques' => (int)($sceneB['nb_repliques'] ?? 0),
                ],
                'shared_personnages' => $sharedPersos,
                'shared_lieux' => $sharedLieux,
                'same_lieu_raw' => $lieuRawA && $lieuRawA === $lieuRawB,
            ];
        }
    }

    usort($out, fn($x, $y) => $y['score'] <=> $x['score']);
    return array_slice($out, 0, 12);
}

function handleComparateur(PDO $db, string $method, array $body): void {
    if ($method !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'Méthode non autorisée']);
        return;
    }

    $idA = (int)($body['episode_a_id'] ?? 0);
    $idB = (int)($body['episode_b_id'] ?? 0);
    if (!$idA || !$idB || $idA === $idB) {
        http_response_code(400);
        echo json_encode(['error' => 'Sélectionnez deux épisodes différents']);
        return;
    }

    $a = getEpisodeCompareBundle($db, $idA);
    $b = getEpisodeCompareBundle($db, $idB);
    if (!$a || !$b) {
        http_response_code(404);
        echo json_encode(['error' => 'Épisode introuvable']);
        return;
    }

    $promesses = getPromessesForEpisodes($db, [$idA, $idB]);
    $promessesA = array_values(array_filter($promesses, fn($p) => !empty($p['episode_roles'][$idA])));
    $promessesB = array_values(array_filter($promesses, fn($p) => !empty($p['episode_roles'][$idB])));
    $promessesShared = array_values(array_filter($promesses, fn($p) => !empty($p['episode_roles'][$idA]) && !empty($p['episode_roles'][$idB])));

    $personnages = compareById($a['personnages'], $b['personnages']);
    $lieux = compareById($a['lieux'], $b['lieux']);
    $themes = compareById($a['themes'], $b['themes']);
    $mots = compareWords($a['mots'], $b['mots']);
    $scenes = compareScenes($a, $b);

    $score = min(100,
        count($personnages['shared']) * 8
        + count($lieux['shared']) * 10
        + count($themes['shared']) * 10
        + count($promessesShared) * 12
        + min(20, count($mots['shared']))
        + min(20, count($scenes) * 3)
    );

    echo json_encode([
        'episode_a' => [
            'id' => (int)$a['episode']['id'],
            'code' => codeEpisode($a['episode']),
            'titre' => $a['episode']['titre'] ?? '',
            'saison_couleur' => $a['episode']['saison_couleur'] ?? null,
            'resume' => $a['episode']['resume'] ?? null,
            'stats' => [
                'nb_repliques_total' => (int)($a['episode']['nb_repliques_total'] ?? 0),
                'nb_mots' => (int)($a['episode']['nb_mots'] ?? 0),
                'nb_scenes' => (int)($a['episode']['nb_scenes'] ?? 0),
                'duree_estimee_min' => (int)($a['episode']['duree_estimee_min'] ?? 0),
            ],
        ],
        'episode_b' => [
            'id' => (int)$b['episode']['id'],
            'code' => codeEpisode($b['episode']),
            'titre' => $b['episode']['titre'] ?? '',
            'saison_couleur' => $b['episode']['saison_couleur'] ?? null,
            'resume' => $b['episode']['resume'] ?? null,
            'stats' => [
                'nb_repliques_total' => (int)($b['episode']['nb_repliques_total'] ?? 0),
                'nb_mots' => (int)($b['episode']['nb_mots'] ?? 0),
                'nb_scenes' => (int)($b['episode']['nb_scenes'] ?? 0),
                'duree_estimee_min' => (int)($b['episode']['duree_estimee_min'] ?? 0),
            ],
        ],
        'score_miroir' => $score,
        'personnages' => $personnages,
        'lieux' => $lieux,
        'themes' => $themes,
        'mots' => $mots,
        'promesses' => [
            'shared' => $promessesShared,
            'episode_a' => $promessesA,
            'episode_b' => $promessesB,
        ],
        'structure' => compareStructure($a, $b),
        'scenes_similaires' => $scenes,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function getEpisodeDetail(PDO $db, int $id): array {
    $stmt = $db->prepare("
        SELECT e.*, s.numero as saison_numero, s.couleur as saison_couleur, s.nom as saison_nom
        FROM episodes e JOIN saisons s ON s.id = e.saison_id WHERE e.id = ?
    ");
    $stmt->execute([$id]);
    $ep = $stmt->fetch();
    if (!$ep) return [];

    // Personnages
    $stmt = $db->prepare("
        SELECT ep.*, p.prenom, p.couleur_identite, p.est_principal, p.id as personnage_id
        FROM episode_personnages ep
        JOIN personnages p ON p.id = ep.personnage_id
        WHERE ep.episode_id = ?
        ORDER BY p.est_principal DESC, p.prenom
    ");
    $stmt->execute([$id]);
    $ep['personnages'] = $stmt->fetchAll();

    // Extras
    $stmt = $db->prepare('SELECT * FROM episode_extras WHERE episode_id = ?');
    $stmt->execute([$id]);
    $ep['extras'] = $stmt->fetchAll();

    // Lieux
    $stmt = $db->prepare("
        SELECT el.*, l.nom as lieu_nom
        FROM episode_lieux el
        JOIN lieux l ON l.id = el.lieu_id
        WHERE el.episode_id = ?
    ");
    $stmt->execute([$id]);
    $ep['lieux'] = $stmt->fetchAll();

    // Lieux autres
    if ($ep['lieux_autres']) {
        $items = array_filter(array_map('trim', explode(',', $ep['lieux_autres'])));
        $ep['lieux_autres'] = array_values(array_map(fn($x) => ['description' => $x], $items));
    } else {
        $ep['lieux_autres'] = [];
    }

    // Thèmes
    $stmt = $db->prepare("
        SELECT et.*, t.nom as theme_nom, t.couleur
        FROM episode_themes et
        JOIN themes t ON t.id = et.theme_id
        WHERE et.episode_id = ?
    ");
    $stmt->execute([$id]);
    $ep['themes'] = $stmt->fetchAll();

    // Stats texte
    $stmt = $db->prepare('SELECT * FROM episode_stats WHERE episode_id = ?');
    $stmt->execute([$id]);
    $ep['stats'] = $stmt->fetch() ?: null;

    attachEpisodeChronology($db, $ep);
    $ep['intrigues_sup'] = (object)(fetchIntriguesSup($db)[$id] ?? []);

    return $ep;
}

function createEpisode(PDO $db, array $body): int {
    $chron = normalizeEpisodeChronology($body);

    $st = $db->prepare("
        INSERT INTO episodes (saison_id, numero_episode, titre, titre_fr, date_diege, code, jet, avancement, nb_pages,
            intrigue_a, intrigue_b, intrigue_c, resume, faux_site_web, commentaires, lieux_autres, etat_episode,
            date_debut_ecriture, date_debut_qual, date_fin_ecriture, date_fin_qual,
            moment_journee, est_flashback, date_flashback_origine, arc_nom, arc_partie, arc_total)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ");
    $st->execute([
        (int)exigerTexte($body, 'saison_id'), (int)exigerTexte($body, 'numero_episode'), $body['titre'] ?? null,
        $body['titre_fr'] ?? null,
        $chron['date_diege'], $body['code'] ?? null, $body['jet'] ?? '1er jet',
        $body['avancement'] ?? 0, $body['nb_pages'] ?? 0,
        $body['intrigue_a'] ?? null, $body['intrigue_b'] ?? null, $body['intrigue_c'] ?? null,
        $body['resume'] ?? null,
        $body['faux_site_web'] ?? null, $body['commentaires'] ?? null,
        $body['lieux_autres'] ?? null,
        $body['etat_episode'] ?? null,
        $body['date_debut_ecriture'] ?? null, $body['date_debut_qual'] ?? 'exacte',
        $body['date_fin_ecriture'] ?? null,   $body['date_fin_qual'] ?? 'exacte',
        $chron['moment_journee'], $chron['est_flashback'], $chron['date_flashback_origine'],
        $chron['arc_nom'], $chron['arc_partie'], $chron['arc_total'],
    ]);
    $epId = (int)$db->lastInsertId();
    saveEpisodeRelations($db, $epId, $body);
    return $epId;
}

function updateEpisode(PDO $db, int $id, array $body): void {
    $chron = normalizeEpisodeChronology($body);

    $st = $db->prepare("
        UPDATE episodes SET saison_id=?, numero_episode=?, titre=?, titre_fr=?, date_diege=?, code=?, jet=?,
            avancement=?, nb_pages=?, intrigue_a=?, intrigue_b=?, intrigue_c=?, resume=?,
            faux_site_web=?, commentaires=?, lieux_autres=?, etat_episode=?,
            date_debut_ecriture=?, date_debut_qual=?, date_fin_ecriture=?, date_fin_qual=?,
            moment_journee=?, est_flashback=?, date_flashback_origine=?, arc_nom=?, arc_partie=?, arc_total=?,
            updated_at=CURRENT_TIMESTAMP
        WHERE id=?
    ");
    $st->execute([
        (int)exigerTexte($body, 'saison_id'), (int)exigerTexte($body, 'numero_episode'), $body['titre'] ?? null,
        $body['titre_fr'] ?? null,
        $chron['date_diege'], $body['code'] ?? null, $body['jet'] ?? '1er jet',
        $body['avancement'] ?? 0, $body['nb_pages'] ?? 0,
        $body['intrigue_a'] ?? null, $body['intrigue_b'] ?? null, $body['intrigue_c'] ?? null,
        $body['resume'] ?? null,
        $body['faux_site_web'] ?? null, $body['commentaires'] ?? null,
        $body['lieux_autres'] ?? null,
        $body['etat_episode'] ?? null,
        $body['date_debut_ecriture'] ?? null, $body['date_debut_qual'] ?? 'exacte',
        $body['date_fin_ecriture'] ?? null,   $body['date_fin_qual'] ?? 'exacte',
        $chron['moment_journee'], $chron['est_flashback'], $chron['date_flashback_origine'],
        $chron['arc_nom'], $chron['arc_partie'], $chron['arc_total'],
        $id
    ]);
    saveEpisodeRelations($db, $id, $body);
}

// Intrigues au-delà de A, B et C. Absentes du corps : celles déjà enregistrées ne bougent pas.
function saveEpisodeIntrigues(PDO $db, int $epId, array $intrigues): void {
    foreach ($intrigues as $lettre => $texte) {
        $texte = trim((string)$texte);
        if ($texte === '') {
            $db->prepare('DELETE FROM episode_intrigues WHERE episode_id = ? AND lettre = ?')->execute([$epId, $lettre]);
        } else {
            $db->prepare('
                INSERT INTO episode_intrigues (episode_id, lettre, texte) VALUES (?, ?, ?)
                ON CONFLICT(episode_id, lettre) DO UPDATE SET texte = excluded.texte
            ')->execute([$epId, $lettre, $texte]);
        }
    }
}

function fetchIntriguesSup(PDO $db): array {
    $parEpisode = [];
    foreach ($db->query('SELECT episode_id, lettre, texte FROM episode_intrigues ORDER BY lettre')->fetchAll() as $r) {
        $parEpisode[(int)$r['episode_id']][$r['lettre']] = $r['texte'];
    }
    return $parEpisode;
}

function saveEpisodeRelations(PDO $db, int $epId, array $body): void {
    if (isset($body['intrigues_sup']) && is_array($body['intrigues_sup'])) saveEpisodeIntrigues($db, $epId, $body['intrigues_sup']);

    // Personnages
    $db->prepare('DELETE FROM episode_personnages WHERE episode_id = ?')->execute([$epId]);
    foreach ($body['personnages'] ?? [] as $p) {
        $db->prepare('INSERT INTO episode_personnages (episode_id, personnage_id, present, nb_repliques) VALUES (?,?,?,?)')
           ->execute([$epId, $p['personnage_id'], $p['present'] ?? 0, $p['nb_repliques'] ?? 0]);
    }

    // Extras
    $db->prepare('DELETE FROM episode_extras WHERE episode_id = ?')->execute([$epId]);
    foreach ($body['extras'] ?? [] as $x) {
        if (!empty($x['nom'])) {
            $db->prepare('INSERT INTO episode_extras (episode_id, nom, nb_repliques) VALUES (?,?,?)')
               ->execute([$epId, $x['nom'], $x['nb_repliques'] ?? 0]);
        }
    }

    // Lieux
    $db->prepare('DELETE FROM episode_lieux WHERE episode_id = ?')->execute([$epId]);
    foreach ($body['lieux'] ?? [] as $l) {
        $db->prepare('INSERT INTO episode_lieux (episode_id, lieu_id, statut) VALUES (?,?,?)')
           ->execute([$epId, $l['lieu_id'], $l['statut'] ?? 'absent']);
    }

    // Thèmes
    $db->prepare('DELETE FROM episode_themes WHERE episode_id = ?')->execute([$epId]);
    foreach ($body['themes'] ?? [] as $t) {
        if (!empty($t['intensite'])) {
            $db->prepare('INSERT INTO episode_themes (episode_id, theme_id, intensite) VALUES (?,?,?)')
               ->execute([$epId, $t['theme_id'], $t['intensite']]);
        }
    }

    // Chronologie : plages temporelles
    $chron = normalizeEpisodeChronology($body);
    $db->prepare('DELETE FROM episode_plages WHERE episode_id = ?')->execute([$epId]);
    foreach ($chron['plages_temporelles'] as $plage) {
        $db->prepare('
            INSERT INTO episode_plages (episode_id, date_plage, moment, importance, est_flashback, date_flashback_origine)
            VALUES (?,?,?,?,?,?)
        ')->execute([
            $epId,
            $plage['date'],
            $plage['moment'],
            $plage['importance'],
            $plage['est_flashback'],
            $plage['date_flashback_origine'],
        ]);
    }

    // Chronologie : liens flashbacks / flashforwards / références
    $db->prepare('DELETE FROM episode_liens WHERE episode_id = ?')->execute([$epId]);
    foreach ($body['liens'] ?? [] as $lien) {
        $episodeLieId = (int)($lien['episode_lie_id'] ?? 0);
        if ($episodeLieId <= 0 || $episodeLieId === $epId) continue;
        $db->prepare('INSERT INTO episode_liens (episode_id, episode_lie_id, type_lien) VALUES (?,?,?)')
           ->execute([$epId, $episodeLieId, $lien['type_lien'] ?? 'flashback']);
    }

    // Mentions d'autres épisodes
    $db->prepare('DELETE FROM episode_mentions WHERE episode_id = ?')->execute([$epId]);
    foreach ($body['mentions'] ?? [] as $mention) {
        $episodeMentionneId = (int)($mention['episode_mentionne_id'] ?? 0);
        if ($episodeMentionneId <= 0 || $episodeMentionneId === $epId) continue;
        $db->prepare('INSERT INTO episode_mentions (episode_id, episode_mentionne_id, niveau) VALUES (?,?,?)')
           ->execute([$epId, $episodeMentionneId, $mention['niveau'] ?? 'mineure']);
    }
}

function attachEpisodeChronology(PDO $db, array &$ep): void {
    $stmt = $db->prepare("
        SELECT id, date_plage as date, moment, COALESCE(importance, 'principal') as importance,
               est_flashback, date_flashback_origine
        FROM episode_plages
        WHERE episode_id = ?
        ORDER BY id
    ");
    $stmt->execute([$ep['id']]);
    $ep['plages_temporelles'] = $stmt->fetchAll();

    $stmt = $db->prepare("
        SELECT el.id, el.episode_lie_id, el.type_lien,
               e.titre as ep_titre, e.numero_episode as ep_num, s.numero as ep_saison
        FROM episode_liens el
        JOIN episodes e ON e.id = el.episode_lie_id
        JOIN saisons s ON s.id = e.saison_id
        WHERE el.episode_id = ?
        ORDER BY el.id
    ");
    $stmt->execute([$ep['id']]);
    $ep['liens'] = $stmt->fetchAll();

    $stmt = $db->prepare("
        SELECT em.id, em.episode_mentionne_id, em.niveau,
               e.titre as ep_titre, e.numero_episode as ep_num, s.numero as ep_saison
        FROM episode_mentions em
        JOIN episodes e ON e.id = em.episode_mentionne_id
        JOIN saisons s ON s.id = e.saison_id
        WHERE em.episode_id = ?
        ORDER BY em.id
    ");
    $stmt->execute([$ep['id']]);
    $ep['mentions'] = $stmt->fetchAll();
}

function normalizeEpisodeChronology(array $body): array {
    $plages = normalizeEpisodePlages($body['plages_temporelles'] ?? []);
    $firstPlage = $plages[0] ?? null;
    $firstFlashbackPlage = null;
    foreach ($plages as $plage) {
        if (!empty($plage['est_flashback'])) {
            $firstFlashbackPlage = $plage;
            break;
        }
    }

    $dateDiege = $body['date_diege'] ?? null;
    if (!$dateDiege && $firstPlage) {
        $dateDiege = $firstPlage['date'];
    }

    $momentJournee = $body['moment_journee'] ?? null;
    if (!$momentJournee || $momentJournee === 'inconnu') {
        $momentJournee = $firstPlage['moment'] ?? 'inconnu';
    }

    $estFlashback = (int)($body['est_flashback'] ?? 0);
    if (!$estFlashback && $firstFlashbackPlage) {
        $estFlashback = 1;
    }

    $dateFlashbackOrigine = $body['date_flashback_origine'] ?? null;
    if (!$dateFlashbackOrigine && $firstFlashbackPlage) {
        $dateFlashbackOrigine = $firstFlashbackPlage['date_flashback_origine'];
    }

    return [
        'date_diege' => $dateDiege ?: null,
        'moment_journee' => $momentJournee ?: 'inconnu',
        'est_flashback' => $estFlashback ? 1 : 0,
        'date_flashback_origine' => $dateFlashbackOrigine ?: null,
        'arc_nom' => !empty($body['arc_nom']) ? $body['arc_nom'] : null,
        'arc_partie' => isset($body['arc_partie']) && $body['arc_partie'] !== '' ? (int)$body['arc_partie'] : null,
        'arc_total' => isset($body['arc_total']) && $body['arc_total'] !== '' ? (int)$body['arc_total'] : null,
        'plages_temporelles' => $plages,
    ];
}

function normalizeEpisodePlages(array $plages): array {
    $result = [];
    foreach ($plages as $plage) {
        $date = $plage['date'] ?? null;
        $moment = $plage['moment'] ?? 'inconnu';
        $importance = normalizePlageImportance($plage['importance'] ?? 'principal');
        $estFlashback = (int)($plage['est_flashback'] ?? 0);
        $dateFlashbackOrigine = $plage['date_flashback_origine'] ?? null;

        if (!$date && $moment === 'inconnu' && !$estFlashback && !$dateFlashbackOrigine) {
            continue;
        }

        $result[] = [
            'date' => $date ?: null,
            'moment' => $moment ?: 'inconnu',
            'importance' => $importance,
            'est_flashback' => $estFlashback ? 1 : 0,
            'date_flashback_origine' => $dateFlashbackOrigine ?: null,
        ];
    }
    return $result;
}

function normalizePlageImportance(?string $importance): string {
    $importance = $importance ?: 'principal';
    if ($importance === 'na' || $importance === 'n/a' || $importance === 'non-applicable') {
        return 'non_applicable';
    }
    return in_array($importance, ['principal', 'secondaire', 'non_applicable'], true)
        ? $importance
        : 'principal';
}

// ===================== FRISE =====================

function handleFrise(PDO $db, string $method, ?int $id, array $body): void {
    ensureFriseSchema($db);

    switch ($method) {
        case 'GET':
            if ($id) {
                echo json_encode(getFriseEpisode($db, $id) ?: []);
            } else {
                echo json_encode(getFriseEpisodes($db));
            }
            break;
        case 'PUT':
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'ID épisode manquant']);
                return;
            }
            updateFriseEpisode($db, $id, $body);
            echo json_encode(['ok' => true]);
            break;
        default:
            http_response_code(405);
            echo json_encode(['error' => 'Méthode non autorisée']);
    }
}

function ensureFriseSchema(PDO $db): void {
    try { $db->exec("ALTER TABLE episodes ADD COLUMN moment_journee TEXT DEFAULT 'inconnu'"); } catch (Exception $e) {}
    try { $db->exec("ALTER TABLE episodes ADD COLUMN est_flashback INTEGER DEFAULT 0"); } catch (Exception $e) {}
    try { $db->exec("ALTER TABLE episodes ADD COLUMN date_flashback_origine TEXT DEFAULT NULL"); } catch (Exception $e) {}
    try { $db->exec("ALTER TABLE episode_plages ADD COLUMN importance TEXT DEFAULT 'principal'"); } catch (Exception $e) {}
    try { $db->exec("
        CREATE TABLE IF NOT EXISTS episode_plages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            episode_id INTEGER NOT NULL,
            date_plage TEXT DEFAULT NULL,
            moment TEXT DEFAULT 'inconnu',
            importance TEXT DEFAULT 'principal',
            est_flashback INTEGER DEFAULT 0,
            date_flashback_origine TEXT DEFAULT NULL,
            FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
        )
    "); } catch (Exception $e) {}
}

function getFriseEpisodes(PDO $db): array {
    $rows = $db->query("
        SELECT e.id, e.saison_id, e.numero_episode, e.titre, e.date_diege,
               e.moment_journee, e.est_flashback, e.date_flashback_origine,
               e.arc_nom, e.arc_partie, e.arc_total,
               s.numero as saison_numero, s.couleur as saison_couleur, s.nom as saison_nom
        FROM episodes e
        JOIN saisons s ON s.id = e.saison_id
        ORDER BY s.numero, e.numero_episode
    ")->fetchAll();

    foreach ($rows as &$row) {
        attachEpisodeChronology($db, $row);
    }

    return $rows;
}

function getFriseEpisode(PDO $db, int $id): ?array {
    $stmt = $db->prepare("
        SELECT e.id, e.saison_id, e.numero_episode, e.titre, e.date_diege,
               e.moment_journee, e.est_flashback, e.date_flashback_origine,
               e.arc_nom, e.arc_partie, e.arc_total,
               s.numero as saison_numero, s.couleur as saison_couleur, s.nom as saison_nom
        FROM episodes e
        JOIN saisons s ON s.id = e.saison_id
        WHERE e.id = ?
    ");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) return null;

    attachEpisodeChronology($db, $row);
    return $row;
}

function updateFriseEpisode(PDO $db, int $id, array $body): void {
    $dateDiege = !empty($body['date_diege']) ? $body['date_diege'] : null;
    $moment = !empty($body['moment_journee']) ? $body['moment_journee'] : 'inconnu';
    $estFlashback = !empty($body['est_flashback']) ? 1 : 0;
    $dateFlashback = $estFlashback && !empty($body['date_flashback_origine'])
        ? $body['date_flashback_origine']
        : null;

    $stmt = $db->prepare("
        UPDATE episodes
        SET date_diege = ?,
            moment_journee = ?,
            est_flashback = ?,
            date_flashback_origine = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ");
    $stmt->execute([$dateDiege, $moment, $estFlashback, $dateFlashback, $id]);

    $stmt = $db->prepare('SELECT id FROM episode_plages WHERE episode_id = ? ORDER BY id LIMIT 1');
    $stmt->execute([$id]);
    $plageId = $stmt->fetchColumn();

    if ($plageId) {
        $db->prepare("
            UPDATE episode_plages
            SET date_plage = ?, moment = ?, importance = 'principal', est_flashback = ?, date_flashback_origine = ?
            WHERE id = ?
        ")->execute([$dateDiege, $moment, $estFlashback, $dateFlashback, $plageId]);
    } elseif ($dateDiege || $moment !== 'inconnu' || $estFlashback || $dateFlashback) {
        $db->prepare("
            INSERT INTO episode_plages (episode_id, date_plage, moment, importance, est_flashback, date_flashback_origine)
            VALUES (?,?,?,?,?,?)
        ")->execute([$id, $dateDiege, $moment, 'principal', $estFlashback, $dateFlashback]);
    }
}

// ===================== PERSONNAGES =====================

function ensurePersonnageEditorialSchema(PDO $db): void {
    $db->exec("
        CREATE TABLE IF NOT EXISTS personnage_moments_decisifs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            personnage_id INTEGER NOT NULL,
            episode_id INTEGER DEFAULT NULL,
            titre TEXT,
            type_moment TEXT DEFAULT 'Décision',
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (personnage_id) REFERENCES personnages(id) ON DELETE CASCADE,
            FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE SET NULL
        )
    ");
    $db->exec("
        CREATE TABLE IF NOT EXISTS personnage_signatures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            personnage_id INTEGER NOT NULL,
            episode_id INTEGER DEFAULT NULL,
            expression TEXT NOT NULL,
            note TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (personnage_id) REFERENCES personnages(id) ON DELETE CASCADE,
            FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE SET NULL
        )
    ");
}

function normaliserNomPersoPourMatch(string $s): string {
    $s = mb_strtolower(trim($s), 'UTF-8');
    $s = str_replace(['é','è','ê','ë'], 'e', $s);
    $s = str_replace(['à','â','ä'], 'a', $s);
    $s = str_replace(['î','ï'], 'i', $s);
    $s = str_replace(['ô','ö'], 'o', $s);
    $s = str_replace(['ù','û','ü'], 'u', $s);
    $s = str_replace(['ç'], 'c', $s);
    $s = str_replace(['-', '_', '.', '’', "'"], ' ', $s);
    return trim(preg_replace('/[\s\x{00A0}]+/u', ' ', $s));
}

function personnageLabel(array $p): string {
    return trim(($p['prenom'] ?? '') . ' ' . ($p['nom'] ?? '')) ?: ($p['nom_affichage'] ?? ('Personnage #' . ($p['id'] ?? '?')));
}

// Correspondance exacte ou par alias : les noms ambigus passent par Config → Noms détectés
function matcherPersonnageDepuisNom(string $nom, array $personnages): ?array {
    $nomN = normaliserNomPersoPourMatch($nom);
    if (!$nomN) return null;

    $regle = reglesNoms()[$nomN] ?? null;
    if ($regle && $regle['regle'] === 'alias') {
        foreach ($personnages as $p) {
            if ((int)$p['id'] === (int)$regle['personnage_id']) return $p;
        }
    }

    foreach ($personnages as $p) {
        $prenomN = normaliserNomPersoPourMatch($p['prenom'] ?? '');
        $nomFamN = normaliserNomPersoPourMatch($p['nom'] ?? '');
        $affichageN = normaliserNomPersoPourMatch($p['nom_affichage'] ?? '');
        $prenomNomN = trim($prenomN . ' ' . $nomFamN);

        if ($prenomN && $prenomN === $nomN) return $p;
        if ($nomFamN && $nomFamN === $nomN) return $p;
        if ($affichageN && $affichageN === $nomN) return $p;
        if ($prenomNomN && $prenomNomN === $nomN) return $p;
    }
    return null;
}

// Reporte les répliques détectées sur episode_personnages
function syncPresencePersonnages(PDO $db, int $epId, array $stats): void {
    $personnages = $db->query('SELECT * FROM personnages')->fetchAll();
    // Plusieurs graphies d'un même personnage peuvent coexister dans un épisode
    $repliquesParId = [];
    foreach ($stats['repliques_par_perso'] as $nom => $data) {
        $matched = matcherPersonnageDepuisNom((string)$nom, $personnages);
        if ($matched) {
            $pid = (int)$matched['id'];
            $repliquesParId[$pid] = ($repliquesParId[$pid] ?? 0) + (int)$data['nb_repliques'];
        }
    }

    // Le script fait foi : qui n'y parle plus perd ses répliques. Une présence notée à la main, sans réplique, reste.
    if ($repliquesParId) $db->prepare('UPDATE episode_personnages SET present = 0, nb_repliques = 0 WHERE episode_id = ? AND nb_repliques > 0')->execute([$epId]);

    $sync = $db->prepare('
        INSERT INTO episode_personnages (episode_id, personnage_id, present, nb_repliques) VALUES (?, ?, 1, ?)
        ON CONFLICT(episode_id, personnage_id) DO UPDATE SET present = 1, nb_repliques = excluded.nb_repliques
    ');
    foreach ($repliquesParId as $pid => $nb) $sync->execute([$epId, $pid, $nb]);
}

function addPersonnageSceneGroup(array &$bucket, string $type, array $ids, array $sceneRepliques, array $episode, array $personnagesById): void {
    $ids = array_values(array_unique(array_map('intval', $ids)));
    sort($ids);
    $key = implode('-', $ids);
    if (!isset($bucket[$type][$key])) {
        $bucket[$type][$key] = [
            'type' => $type,
            'personnages' => array_map(fn($pid) => [
                'id' => $pid,
                'nom' => isset($personnagesById[$pid]) ? personnageLabel($personnagesById[$pid]) : ('Personnage #' . $pid),
                'couleur' => $personnagesById[$pid]['couleur_identite'] ?? '#888888',
            ], $ids),
            'nb_scenes' => 0,
            'nb_repliques' => 0,
            'episodes' => [],
        ];
    }

    $bucket[$type][$key]['nb_scenes']++;
    foreach ($ids as $pid) {
        $bucket[$type][$key]['nb_repliques'] += (int)($sceneRepliques[$pid] ?? 0);
    }
    $epKey = $episode['saison_numero'] . '-' . $episode['numero_episode'];
    $bucket[$type][$key]['episodes'][$epKey] = [
        'episode_id' => (int)$episode['episode_id'],
        'saison_numero' => (int)$episode['saison_numero'],
        'numero_episode' => (int)$episode['numero_episode'],
        'titre' => $episode['titre'] ?? '',
    ];
}

function personnageSceneGroupTypes(): array {
    return [
        2 => 'duos',
        3 => 'trios',
        4 => 'quatuors',
        5 => 'quintettes',
        6 => 'sextuors',
        7 => 'septuors',
        8 => 'octuors',
    ];
}

function initPersonnageSceneGroups(): array {
    $groups = [];
    foreach (personnageSceneGroupTypes() as $type) {
        $groups[$type] = [];
    }
    return $groups;
}

function combinaisonsPersonnageIds(array $ids, int $taille): array {
    $ids = array_values($ids);
    if ($taille <= 0) return [[]];
    if ($taille > count($ids)) return [];

    $out = [];
    $walk = function(int $start, array $current) use (&$walk, &$out, $ids, $taille) {
        if (count($current) === $taille) {
            $out[] = $current;
            return;
        }

        $remaining = $taille - count($current);
        for ($i = $start; $i <= count($ids) - $remaining; $i++) {
            $next = $current;
            $next[] = $ids[$i];
            $walk($i + 1, $next);
        }
    };
    $walk(0, []);
    return $out;
}

function finaliserGroupesScenes(array $groups): array {
    $out = initPersonnageSceneGroups();
    foreach (personnageSceneGroupTypes() as $type) {
        $rows = array_values($groups[$type] ?? []);
        foreach ($rows as &$row) {
            $row['nb_episodes'] = count($row['episodes']);
            $row['episodes'] = array_values($row['episodes']);
        }
        unset($row);
        usort($rows, fn($a, $b) =>
            ($b['nb_scenes'] <=> $a['nb_scenes'])
            ?: ($b['nb_repliques'] <=> $a['nb_repliques'])
            ?: ($b['nb_episodes'] <=> $a['nb_episodes'])
        );
        $out[$type] = array_slice($rows, 0, 12);
    }
    return $out;
}

function calculerGroupesScenesPersonnage(PDO $db, int $personnageId): array {
    ensureStatsTablesBackfilled($db);
    $personnages = $db->query('SELECT id, prenom, nom, nom_affichage, couleur_identite FROM personnages')->fetchAll();
    $personnagesById = [];
    foreach ($personnages as $p) $personnagesById[(int)$p['id']] = $p;

    $global = initPersonnageSceneGroups();
    $parSaison = [];

    $rows = $db->query("
        SELECT e.id as episode_id, e.titre, e.numero_episode, s.numero as saison_numero,
               ess.persos_json, ess.repliques_json
        FROM episode_stat_scenes ess
        JOIN episodes e ON e.id = ess.episode_id
        JOIN saisons s ON s.id = e.saison_id
        WHERE ess.episode_id = e.id
        ORDER BY s.numero, e.numero_episode, ess.scene_index
    ")->fetchAll();

    foreach ($rows as $sceneRow) {
        $saisonNum = (int)$sceneRow['saison_numero'];
        if (!isset($parSaison[$saisonNum])) $parSaison[$saisonNum] = initPersonnageSceneGroups();

        $repliques = json_decode($sceneRow['repliques_json'] ?? '[]', true) ?: [];
        $persos = json_decode($sceneRow['persos_json'] ?? '[]', true) ?: [];
        $sceneRepliques = [];
        $rawNames = array_unique(array_merge(array_keys($repliques), $persos));

        foreach ($rawNames as $rawName) {
            $matched = matcherPersonnageDepuisNom((string)$rawName, $personnages);
            if (!$matched) continue;
            $pid = (int)$matched['id'];
            $sceneRepliques[$pid] = ($sceneRepliques[$pid] ?? 0) + (int)($repliques[$rawName] ?? 0);
        }

        if (!isset($sceneRepliques[$personnageId])) continue;
        $others = array_values(array_filter(array_keys($sceneRepliques), fn($pid) => (int)$pid !== $personnageId));
        usort($others, fn($a, $b) => ($sceneRepliques[$b] ?? 0) <=> ($sceneRepliques[$a] ?? 0));
        $others = array_slice($others, 0, 8);
        sort($others);

        foreach (personnageSceneGroupTypes() as $size => $type) {
            $othersNeeded = $size - 1;
            if (count($others) < $othersNeeded) continue;

            foreach (combinaisonsPersonnageIds($others, $othersNeeded) as $combo) {
                $ids = array_merge([$personnageId], array_map('intval', $combo));
                addPersonnageSceneGroup($global, $type, $ids, $sceneRepliques, $sceneRow, $personnagesById);
                addPersonnageSceneGroup($parSaison[$saisonNum], $type, $ids, $sceneRepliques, $sceneRow, $personnagesById);
            }
        }
    }

    $parSaisonFinal = [];
    foreach ($parSaison as $saisonNum => $groups) {
        $parSaisonFinal[(string)$saisonNum] = finaliserGroupesScenes($groups);
    }

    return [
        'global' => finaliserGroupesScenes($global),
        'par_saison' => $parSaisonFinal,
    ];
}

function handlePersonnages(PDO $db, string $method, ?int $id, array $body): void {
    switch ($method) {
        case 'GET':
            if ($id) {
                echo json_encode(getPersonnageDetail($db, $id));
            } else {
                $totalEpisodes = (int)$db->query('SELECT COUNT(*) FROM episodes')->fetchColumn();
                $rows = $db->query("
                    SELECT p.*,
                        COUNT(DISTINCT ep.episode_id) as nb_episodes_count,
                        SUM(ep.nb_repliques) as total_repliques_sum
                    FROM personnages p
                    LEFT JOIN episode_personnages ep ON ep.personnage_id = p.id AND ep.present = 1
                    GROUP BY p.id
                    ORDER BY p.est_principal DESC, p.prenom
                ")->fetchAll();
                // Total répliques toutes séries confondues pour le %
                $totalRepliquesGlobal = (int)$db->query('SELECT SUM(nb_repliques) FROM episode_personnages WHERE present = 1')->fetchColumn();
                foreach ($rows as &$r) {
                    // Durée proportionnelle aux répliques : (répliques perso / répliques totales épisode) * durée épisode
                    $durStmt = $db->prepare("
                        SELECT COALESCE(SUM(
                            CASE WHEN es.nb_repliques_total > 0
                                THEN es.duree_estimee_min * ep.nb_repliques / es.nb_repliques_total
                                ELSE 0
                            END
                        ), 0)
                        FROM episode_personnages ep
                        JOIN episode_stats es ON es.episode_id = ep.episode_id
                        WHERE ep.personnage_id = ? AND ep.present = 1
                    ");
                    $durStmt->execute([$r['id']]);
                    $duree = (int)round($durStmt->fetchColumn());
                    $nbEp = (int)$r['nb_episodes_count'];
                    $pctPresence = $totalEpisodes > 0 ? round($nbEp / $totalEpisodes * 100) : 0;
                    $pctRepliques = $totalRepliquesGlobal > 0 ? round((int)$r['total_repliques_sum'] / $totalRepliquesGlobal * 100) : 0;
                    $r['stats'] = [
                        'nb_episodes'        => $nbEp,
                        'total_repliques'    => (int)$r['total_repliques_sum'],
                        'duree_totale_min'   => $duree,
                        'pct_presence'       => $pctPresence,
                        'pct_repliques'      => $pctRepliques,
                        'total_episodes_serie' => $totalEpisodes
                    ];
                }
                echo json_encode($rows);
            }
            break;
        case 'POST':
            $st = $db->prepare("INSERT INTO personnages (prenom, nom, couleur_identite, est_principal, sexe, age, date_naissance, profession, caracteristiques, nom_affichage) VALUES (?,?,?,?,?,?,?,?,?,?)");
            $st->execute([exigerTexte($body, 'prenom'), $body['nom'] ?? null, $body['couleur_identite'] ?? '#888', $body['est_principal'] ?? 0, $body['sexe'] ?? null, $body['age'] ?? null, $body['date_naissance'] ?? null, $body['profession'] ?? null, $body['caracteristiques'] ?? null, $body['nom_affichage'] ?? null]);
            echo json_encode(['id' => $db->lastInsertId()]);
            break;
        case 'PUT':
            $st = $db->prepare("UPDATE personnages SET prenom=?, nom=?, couleur_identite=?, est_principal=?, sexe=?, age=?, date_naissance=?, profession=?, caracteristiques=?, nom_affichage=? WHERE id=?");
            $st->execute([exigerTexte($body, 'prenom'), $body['nom'] ?? null, $body['couleur_identite'] ?? '#888', $body['est_principal'] ?? 0, $body['sexe'] ?? null, $body['age'] ?? null, $body['date_naissance'] ?? null, $body['profession'] ?? null, $body['caracteristiques'] ?? null, $body['nom_affichage'] ?? null, $id]);
            echo json_encode(['ok' => true]);
            break;
        case 'DELETE':
            $db->prepare('DELETE FROM personnages WHERE id = ?')->execute([$id]);
            echo json_encode(['ok' => true]);
            break;
    }
}

function handlePersonnageMoments(PDO $db, string $method, ?int $id, array $body): void {
    ensurePersonnageEditorialSchema($db);
    switch ($method) {
        case 'POST':
            $st = $db->prepare("
                INSERT INTO personnage_moments_decisifs (personnage_id, episode_id, titre, type_moment, description)
                VALUES (?, ?, ?, ?, ?)
            ");
            $st->execute([
                (int)($body['personnage_id'] ?? 0),
                !empty($body['episode_id']) ? (int)$body['episode_id'] : null,
                trim($body['titre'] ?? ''),
                trim($body['type_moment'] ?? 'Décision'),
                trim($body['description'] ?? ''),
            ]);
            echo json_encode(['id' => $db->lastInsertId()]);
            break;
        case 'PUT':
            $st = $db->prepare("
                UPDATE personnage_moments_decisifs
                SET episode_id = ?, titre = ?, type_moment = ?, description = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ");
            $st->execute([
                !empty($body['episode_id']) ? (int)$body['episode_id'] : null,
                trim($body['titre'] ?? ''),
                trim($body['type_moment'] ?? 'Décision'),
                trim($body['description'] ?? ''),
                $id,
            ]);
            echo json_encode(['ok' => true]);
            break;
        case 'DELETE':
            $db->prepare('DELETE FROM personnage_moments_decisifs WHERE id = ?')->execute([$id]);
            echo json_encode(['ok' => true]);
            break;
        default:
            echo json_encode(['ok' => true]);
    }
}

function handlePersonnageSignatures(PDO $db, string $method, ?int $id, array $body): void {
    ensurePersonnageEditorialSchema($db);
    switch ($method) {
        case 'POST':
            $st = $db->prepare("
                INSERT INTO personnage_signatures (personnage_id, episode_id, expression, note)
                VALUES (?, ?, ?, ?)
            ");
            $st->execute([
                (int)($body['personnage_id'] ?? 0),
                !empty($body['episode_id']) ? (int)$body['episode_id'] : null,
                trim($body['expression'] ?? ''),
                trim($body['note'] ?? ''),
            ]);
            echo json_encode(['id' => $db->lastInsertId()]);
            break;
        case 'PUT':
            $st = $db->prepare("
                UPDATE personnage_signatures
                SET episode_id = ?, expression = ?, note = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ");
            $st->execute([
                !empty($body['episode_id']) ? (int)$body['episode_id'] : null,
                trim($body['expression'] ?? ''),
                trim($body['note'] ?? ''),
                $id,
            ]);
            echo json_encode(['ok' => true]);
            break;
        case 'DELETE':
            $db->prepare('DELETE FROM personnage_signatures WHERE id = ?')->execute([$id]);
            echo json_encode(['ok' => true]);
            break;
        default:
            echo json_encode(['ok' => true]);
    }
}

function getPersonnageDetail(PDO $db, int $id): array {
    ensurePersonnageEditorialSchema($db);
    $stmt = $db->prepare('SELECT * FROM personnages WHERE id = ?');
    $stmt->execute([$id]);
    $p = $stmt->fetch();
    if (!$p) return [];

    // Relations
    $stmt = $db->prepare("
        SELECT r.*, p2.prenom as autre_prenom
        FROM relations r JOIN personnages p2 ON p2.id = r.autre_id
        WHERE r.personnage_id = ?
    ");
    $stmt->execute([$id]);
    $p['relations'] = $stmt->fetchAll();

    // Épisodes
    $stmt = $db->prepare("
        SELECT e.id, e.titre, e.numero_episode, s.numero as saison_numero, s.couleur as saison_couleur,
               ep.nb_repliques,
               CASE WHEN es.nb_repliques_total > 0
                    THEN es.duree_estimee_min * ep.nb_repliques / es.nb_repliques_total
                    ELSE 0
               END as duree_estimee_min
        FROM episode_personnages ep
        JOIN episodes e ON e.id = ep.episode_id
        JOIN saisons s ON s.id = e.saison_id
        LEFT JOIN episode_stats es ON es.episode_id = e.id
        WHERE ep.personnage_id = ? AND ep.present = 1
        ORDER BY s.numero, e.numero_episode
    ");
    $stmt->execute([$id]);
    $p['episodes'] = $stmt->fetchAll();

    // Stats enrichies
    $stmt = $db->prepare("
        SELECT COUNT(ep.episode_id) as nb_episodes, SUM(ep.nb_repliques) as total_repliques
        FROM episode_personnages ep WHERE ep.personnage_id = ? AND ep.present = 1
    ");
    $stmt->execute([$id]);
    $stats = $stmt->fetch();

    $totalEpisodes        = (int)$db->query('SELECT COUNT(*) FROM episodes')->fetchColumn();
    $totalRepliquesGlobal = (int)$db->query('SELECT SUM(nb_repliques) FROM episode_personnages WHERE present = 1')->fetchColumn();

    $totauxSaisons = $db->query("
        SELECT s.numero as saison_numero,
               COUNT(DISTINCT e.id) as total_episodes,
               COALESCE(SUM(ep.nb_repliques), 0) as total_repliques
        FROM saisons s
        LEFT JOIN episodes e ON e.saison_id = s.id
        LEFT JOIN episode_personnages ep ON ep.episode_id = e.id AND ep.present = 1
        GROUP BY s.id
        ORDER BY s.numero
    ")->fetchAll();

    $durStmt = $db->prepare("
        SELECT COALESCE(SUM(
            CASE WHEN es.nb_repliques_total > 0
                THEN es.duree_estimee_min * ep.nb_repliques / es.nb_repliques_total
                ELSE 0
            END
        ), 0)
        FROM episode_personnages ep
        JOIN episode_stats es ON es.episode_id = ep.episode_id
        WHERE ep.personnage_id = ? AND ep.present = 1
    ");
    $durStmt->execute([$id]);
    $duree   = (int)round($durStmt->fetchColumn());
    $nbEp    = (int)$stats['nb_episodes'];
    $totRepl = (int)$stats['total_repliques'];

    $stats['duree_totale_min']     = $duree;
    $stats['pct_presence']         = $totalEpisodes > 0 ? round($nbEp / $totalEpisodes * 100) : 0;
    $stats['pct_repliques']        = $totalRepliquesGlobal > 0 ? round($totRepl / $totalRepliquesGlobal * 100) : 0;
    $stats['total_episodes_serie'] = $totalEpisodes;

    $p['stats_episodes'] = $stats;
    $p['stats_totaux_saisons'] = $totauxSaisons;

    // Co-présence : personnages qui apparaissent le plus souvent dans les mêmes épisodes
    $coStmt = $db->prepare("
        SELECT p2.id, p2.prenom, p2.nom, p2.couleur_identite as couleur,
               COUNT(DISTINCT ep2.episode_id) as nb_episodes_ensemble,
               SUM(ep2.nb_repliques) as nb_repliques_ensemble
        FROM episode_personnages ep1
        JOIN episode_personnages ep2 ON ep2.episode_id = ep1.episode_id
            AND ep2.personnage_id != ep1.personnage_id
            AND ep2.present = 1
        JOIN personnages p2 ON p2.id = ep2.personnage_id
        WHERE ep1.personnage_id = ? AND ep1.present = 1
        GROUP BY p2.id
        ORDER BY nb_repliques_ensemble DESC
        LIMIT 10
    ");
    $coStmt->execute([$id]);
    $p['coPresence'] = $coStmt->fetchAll();

    $coSaisonStmt = $db->prepare("
        SELECT p2.id, p2.prenom, p2.nom, p2.couleur_identite as couleur,
               s.numero as saison_numero,
               COUNT(DISTINCT ep2.episode_id) as nb_episodes_ensemble,
               SUM(ep2.nb_repliques) as nb_repliques_ensemble
        FROM episode_personnages ep1
        JOIN episodes e ON e.id = ep1.episode_id
        JOIN saisons s ON s.id = e.saison_id
        JOIN episode_personnages ep2 ON ep2.episode_id = ep1.episode_id
            AND ep2.personnage_id != ep1.personnage_id
            AND ep2.present = 1
        JOIN personnages p2 ON p2.id = ep2.personnage_id
        WHERE ep1.personnage_id = ? AND ep1.present = 1
        GROUP BY p2.id, s.numero
        ORDER BY s.numero, nb_repliques_ensemble DESC
    ");
    $coSaisonStmt->execute([$id]);
    $p['coPresence_par_saison'] = $coSaisonStmt->fetchAll();

    // Toutes les saisons de la série (pour afficher les saisons absentes avec couleur)
    $saisonsStmt = $db->query("SELECT id, numero, nom, couleur FROM saisons ORDER BY numero");
    $p['saisons_info'] = $saisonsStmt->fetchAll();

    // Tous les épisodes de la série (pour le mode espacé du graphique répliques)
    $tousEpStmt = $db->query("
        SELECT e.numero_episode, s.numero as saison_numero
        FROM episodes e
        JOIN saisons s ON s.id = e.saison_id
        ORDER BY s.numero, e.numero_episode
    ");
    $p['tous_episodes'] = $tousEpStmt->fetchAll();

    $momentsStmt = $db->prepare("
        SELECT m.*, e.titre as episode_titre, e.numero_episode, s.numero as saison_numero, s.couleur as saison_couleur
        FROM personnage_moments_decisifs m
        LEFT JOIN episodes e ON e.id = m.episode_id
        LEFT JOIN saisons s ON s.id = e.saison_id
        WHERE m.personnage_id = ?
        ORDER BY COALESCE(s.numero, 999), COALESCE(e.numero_episode, 999), m.id
    ");
    $momentsStmt->execute([$id]);
    $p['moments_decisifs'] = $momentsStmt->fetchAll();

    $signaturesStmt = $db->prepare("
        SELECT sig.*, e.titre as episode_titre, e.numero_episode, s.numero as saison_numero, s.couleur as saison_couleur
        FROM personnage_signatures sig
        LEFT JOIN episodes e ON e.id = sig.episode_id
        LEFT JOIN saisons s ON s.id = e.saison_id
        WHERE sig.personnage_id = ?
        ORDER BY sig.id DESC
    ");
    $signaturesStmt->execute([$id]);
    $p['repliques_signature'] = $signaturesStmt->fetchAll();
    $p['scene_groupes'] = calculerGroupesScenesPersonnage($db, $id);

    return $p;
}

// ===================== LIEUX =====================

function getEpisodeOrder(PDO $db, int $episodeId): ?array {
    $st = $db->prepare("
        SELECT e.id, e.numero_episode, s.numero as saison_numero
        FROM episodes e
        JOIN saisons s ON s.id = e.saison_id
        WHERE e.id = ?
    ");
    $st->execute([$episodeId]);
    $row = $st->fetch();
    return $row ? ['saison' => (int)$row['saison_numero'], 'episode' => (int)$row['numero_episode']] : null;
}

function chargerEpisodeOrders(PDO $db, array $episodeIds): array {
    $episodeIds = array_values(array_unique(array_filter(array_map('intval', $episodeIds))));
    if (!$episodeIds) return [];

    $placeholders = implode(',', array_fill(0, count($episodeIds), '?'));
    $st = $db->prepare("
        SELECT e.id, e.numero_episode, s.numero as saison_numero
        FROM episodes e
        JOIN saisons s ON s.id = e.saison_id
        WHERE e.id IN ($placeholders)
    ");
    $st->execute($episodeIds);

    $orders = [];
    foreach ($st->fetchAll() as $row) {
        $orders[(int)$row['id']] = ['saison' => (int)$row['saison_numero'], 'episode' => (int)$row['numero_episode']];
    }
    return $orders;
}

function episodeOrderBefore(?array $current, ?array $target): bool {
    if (!$current || !$target) return false;
    return ($current['saison'] < $target['saison'])
        || ($current['saison'] === $target['saison'] && $current['episode'] < $target['episode']);
}

function syncPasEncoreAvantPremiereApparition(PDO $db, int $lieuId, ?int $episodeId): void {
    if (!$episodeId) return;

    $target = getEpisodeOrder($db, $episodeId);
    if (!$target) return;

    $rows = $db->prepare("
        SELECT e.id
        FROM episodes e
        JOIN saisons s ON s.id = e.saison_id
        WHERE s.numero < ?
           OR (s.numero = ? AND e.numero_episode < ?)
    ");
    $rows->execute([$target['saison'], $target['saison'], $target['episode']]);

    foreach ($rows->fetchAll() as $row) {
        $epId = (int)$row['id'];
        $db->prepare('DELETE FROM episode_lieux WHERE episode_id = ? AND lieu_id = ?')->execute([$epId, $lieuId]);
        $db->prepare('INSERT INTO episode_lieux (episode_id, lieu_id, statut) VALUES (?, ?, ?)')->execute([$epId, $lieuId, 'pas encore existant']);
    }

    $db->prepare('DELETE FROM episode_lieux WHERE episode_id = ? AND lieu_id = ?')->execute([$episodeId, $lieuId]);
    $db->prepare('INSERT INTO episode_lieux (episode_id, lieu_id, statut) VALUES (?, ?, ?)')->execute([$episodeId, $lieuId, 'present']);
}

function getLieuListStats(PDO $db): array {
    ensureStatsTablesBackfilled($db);
    $stats = [];

    $presenceRows = $db->query("
        SELECT lieu_id, COUNT(DISTINCT episode_id) as nb_episodes
        FROM episode_lieux
        WHERE statut = 'present'
        GROUP BY lieu_id
    ")->fetchAll();

    foreach ($presenceRows as $row) {
        $lieuId = (int)$row['lieu_id'];
        $stats[$lieuId] = [
            'nb_episodes' => (int)$row['nb_episodes'],
            'nb_repliques_total' => 0,
            'nb_scenes_total' => 0,
            'duree_totale_min' => 0.0,
        ];
    }

    $statsRows = $db->query("
        SELECT esl.lieu_id,
               SUM(esl.nb_repliques) as nb_repliques_total,
               SUM(esl.nb_scenes) as nb_scenes_total,
               SUM(esl.duree_min) as duree_totale_min
        FROM episode_stat_lieux esl
        JOIN episode_lieux el ON el.episode_id = esl.episode_id
            AND el.lieu_id = esl.lieu_id
            AND el.statut = 'present'
        GROUP BY esl.lieu_id
    ")->fetchAll();
    foreach ($statsRows as $row) {
        $lieuId = (int)$row['lieu_id'];
        if (!isset($stats[$lieuId])) {
            $stats[$lieuId] = [
                'nb_episodes' => 0,
                'nb_repliques_total' => 0,
                'nb_scenes_total' => 0,
                'duree_totale_min' => 0.0,
            ];
        }
        $stats[$lieuId]['nb_repliques_total'] = (int)($row['nb_repliques_total'] ?? 0);
        $stats[$lieuId]['nb_scenes_total'] = (int)($row['nb_scenes_total'] ?? 0);
        $stats[$lieuId]['duree_totale_min'] = (float)($row['duree_totale_min'] ?? 0);
    }

    foreach ($stats as &$row) {
        $row['nb_repliques_total'] = $row['nb_repliques_total'] ?: null;
        $row['nb_scenes_total'] = $row['nb_scenes_total'] ?: null;
        $row['duree_totale_min'] = (int)round($row['duree_totale_min']) ?: null;
    }
    unset($row);

    return $stats;
}

function handleLieux(PDO $db, string $method, ?int $id, array $body): void {
    switch ($method) {
        case 'GET':
            $lieux = $db->query('SELECT * FROM lieux ORDER BY est_principal DESC, nom')->fetchAll();
            $statsByLieu = getLieuListStats($db);
            foreach ($lieux as &$l) {
                $lieuStats = $statsByLieu[(int)$l['id']] ?? [];
                $l['nb_episodes'] = (int)($lieuStats['nb_episodes'] ?? 0);
                $l['nb_repliques_total'] = $lieuStats['nb_repliques_total'] ?? null;
                $l['nb_scenes_total'] = $lieuStats['nb_scenes_total'] ?? null;
                $l['duree_totale_min'] = $lieuStats['duree_totale_min'] ?? null;
            }
            unset($l);
            echo json_encode($lieux);
            break;
        case 'POST':
            $premiereApparitionId = !empty($body['premiere_apparition_episode_id']) ? (int)$body['premiere_apparition_episode_id'] : null;
            $st = $db->prepare('INSERT INTO lieux (nom, description, est_principal, nom_affichage, premiere_apparition_episode_id) VALUES (?, ?, ?, ?, ?)');
            $st->execute([exigerTexte($body, 'nom'), $body['description'] ?? null, isset($body['est_principal']) ? (int)$body['est_principal'] : 0, $body['nom_affichage'] ?? null, $premiereApparitionId]);
            $newId = (int)$db->lastInsertId();
            syncPasEncoreAvantPremiereApparition($db, $newId, $premiereApparitionId);
            echo json_encode(['id' => $newId]);
            break;
        case 'PUT':
            $premiereApparitionId = !empty($body['premiere_apparition_episode_id']) ? (int)$body['premiere_apparition_episode_id'] : null;
            $st = $db->prepare('UPDATE lieux SET nom=?, description=?, est_principal=?, nom_affichage=?, premiere_apparition_episode_id=? WHERE id=?');
            $st->execute([exigerTexte($body, 'nom'), $body['description'] ?? null, isset($body['est_principal']) ? (int)$body['est_principal'] : 0, $body['nom_affichage'] ?? null, $premiereApparitionId, $id]);
            syncPasEncoreAvantPremiereApparition($db, (int)$id, $premiereApparitionId);
            echo json_encode(['ok' => true]);
            break;
        case 'DELETE':
            $db->prepare('DELETE FROM lieux WHERE id = ?')->execute([$id]);
            echo json_encode(['ok' => true]);
            break;
    }
}

// ===================== THÈMES =====================

function handleThemes(PDO $db, string $method, ?int $id, array $body): void {
    switch ($method) {
        case 'GET':
            $rows = $db->query("
                SELECT t.*, COUNT(DISTINCT et.episode_id) as nb_episodes
                FROM themes t
                LEFT JOIN episode_themes et ON et.theme_id = t.id
                GROUP BY t.id ORDER BY t.nom
            ")->fetchAll();
            // Pour chaque thème, charger les épisodes avec leurs données
            if (!$id) {
                // Enrichir avec les données thèmes pour la matrice
                $allEpThemes = $db->query("
                    SELECT et.*, t.couleur
                    FROM episode_themes et JOIN themes t ON t.id = et.theme_id
                ")->fetchAll();
                // Les épisodes seront chargés séparément par le JS
            }
            echo json_encode($rows);
            break;
        case 'POST':
            $st = $db->prepare('INSERT INTO themes (nom, couleur, description) VALUES (?, ?, ?)');
            $st->execute([exigerTexte($body, 'nom'), $body['couleur'] ?? '#ff6b6b', $body['description'] ?? null]);
            echo json_encode(['id' => $db->lastInsertId()]);
            break;
        case 'PUT':
            $st = $db->prepare('UPDATE themes SET nom=?, couleur=?, description=? WHERE id=?');
            $st->execute([exigerTexte($body, 'nom'), $body['couleur'] ?? '#ff6b6b', $body['description'] ?? null, $id]);
            echo json_encode(['ok' => true]);
            break;
        case 'DELETE':
            $db->prepare('DELETE FROM themes WHERE id = ?')->execute([$id]);
            echo json_encode(['ok' => true]);
            break;
    }
}

// ===================== NOTES BIBLE =====================

function ensureBibleNotes(PDO $db): void {
    $db->exec("
        CREATE TABLE IF NOT EXISTS bible_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            saison_id INTEGER NOT NULL,
            section TEXT NOT NULL DEFAULT 'arcs_continuite',
            titre TEXT DEFAULT NULL,
            contenu TEXT NOT NULL,
            position INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (saison_id) REFERENCES saisons(id) ON DELETE CASCADE
        )
    ");
}

function handleBibleNotes(PDO $db, string $method, ?int $id, array $body): void {
    ensureBibleNotes($db);

    switch ($method) {
        case 'GET':
            if ($id) {
                $st = $db->prepare('SELECT * FROM bible_notes WHERE id = ?');
                $st->execute([$id]);
                echo json_encode($st->fetch() ?: []);
            } else {
                $rows = $db->query('SELECT * FROM bible_notes ORDER BY saison_id, section, position, id')->fetchAll();
                echo json_encode($rows);
            }
            break;
        case 'POST':
            $section = texteCorps($body['section'] ?? '') ?: 'arcs_continuite';
            $saisonId = (int)($body['saison_id'] ?? 0);
            $posSt = $db->prepare('SELECT COALESCE(MAX(position), 0) + 1 FROM bible_notes WHERE saison_id = ? AND section = ?');
            $posSt->execute([$saisonId, $section]);
            $position = (int)$posSt->fetchColumn();
            $st = $db->prepare('INSERT INTO bible_notes (saison_id, section, titre, contenu, position) VALUES (?, ?, ?, ?, ?)');
            $st->execute([
                $saisonId,
                $section,
                isset($body['titre']) ? texteCorps($body['titre']) : null,
                trim(texteCorps($body['contenu'] ?? '')),
                $position,
            ]);
            echo json_encode(['id' => $db->lastInsertId()]);
            break;
        case 'PUT':
            $st = $db->prepare('UPDATE bible_notes SET saison_id = ?, section = ?, titre = ?, contenu = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
            $st->execute([
                (int)($body['saison_id'] ?? 0),
                texteCorps($body['section'] ?? '') ?: 'arcs_continuite',
                isset($body['titre']) ? texteCorps($body['titre']) : null,
                trim(texteCorps($body['contenu'] ?? '')),
                $id,
            ]);
            echo json_encode(['ok' => true]);
            break;
        case 'DELETE':
            $db->prepare('DELETE FROM bible_notes WHERE id = ?')->execute([$id]);
            echo json_encode(['ok' => true]);
            break;
    }
}

// ===================== PROMESSES NARRATIVES =====================

function ensurePromessesNarratives(PDO $db): void {
    $db->exec("
        CREATE TABLE IF NOT EXISTS promesses_narratives (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            episode_source_id INTEGER NOT NULL,
            episode_resolution_id INTEGER DEFAULT NULL,
            theme_id INTEGER DEFAULT NULL,
            theme_lien_type TEXT DEFAULT 'lie',
            titre TEXT NOT NULL,
            type_promesse TEXT DEFAULT 'objet',
            statut TEXT DEFAULT 'ouverte',
            description TEXT DEFAULT NULL,
            resolution TEXT DEFAULT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (episode_source_id) REFERENCES episodes(id) ON DELETE CASCADE,
            FOREIGN KEY (episode_resolution_id) REFERENCES episodes(id) ON DELETE SET NULL,
            FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE SET NULL
        )
    ");
    try { $db->exec("ALTER TABLE promesses_narratives ADD COLUMN theme_id INTEGER DEFAULT NULL"); } catch (Exception $e) {}
    try { $db->exec("ALTER TABLE promesses_narratives ADD COLUMN theme_lien_type TEXT DEFAULT 'lie'"); } catch (Exception $e) {}
    $db->exec("
        CREATE TABLE IF NOT EXISTS promesse_episodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            promesse_id INTEGER NOT NULL,
            episode_id INTEGER NOT NULL,
            explication TEXT DEFAULT NULL,
            est_decisif INTEGER DEFAULT 0,
            FOREIGN KEY (promesse_id) REFERENCES promesses_narratives(id) ON DELETE CASCADE,
            FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
        )
    ");
    try { $db->exec("ALTER TABLE promesse_episodes ADD COLUMN est_decisif INTEGER DEFAULT 0"); } catch (Exception $e) {}
}

function normalizePromesseStatut(?string $statut): string {
    $allowed = ['ouverte', 'veille', 'payee', 'oubliee'];
    return in_array($statut, $allowed, true) ? $statut : 'ouverte';
}

function normalizePromesseType(?string $type): string {
    $allowed = ['objet', 'conflit', 'info', 'relation', 'theme', 'gag', 'autre'];
    return in_array($type, $allowed, true) ? $type : 'autre';
}

function normalizePromesseThemeLien(?string $type): string {
    $allowed = ['lie', 'theme_meme'];
    return in_array($type, $allowed, true) ? $type : 'lie';
}

function promessesNarrativesSelectSql(): string {
    return "
        SELECT p.*,
               es.titre as source_titre,
               es.numero_episode as source_numero_episode,
               es.saison_id as source_saison_id,
               ss.numero as source_saison_numero,
               ss.couleur as source_saison_couleur,
               er.titre as resolution_titre,
               er.numero_episode as resolution_numero_episode,
               er.saison_id as resolution_saison_id,
               sr.numero as resolution_saison_numero,
               sr.couleur as resolution_saison_couleur,
               t.nom as theme_nom,
               t.couleur as theme_couleur
        FROM promesses_narratives p
        JOIN episodes es ON es.id = p.episode_source_id
        JOIN saisons ss ON ss.id = es.saison_id
        LEFT JOIN episodes er ON er.id = p.episode_resolution_id
        LEFT JOIN saisons sr ON sr.id = er.saison_id
        LEFT JOIN themes t ON t.id = p.theme_id
    ";
}

function attachPromesseJalons(PDO $db, array &$row): void {
    $st = $db->prepare("
        SELECT pe.*, e.titre, e.numero_episode, s.numero as saison_numero, s.couleur as saison_couleur
        FROM promesse_episodes pe
        JOIN episodes e ON e.id = pe.episode_id
        JOIN saisons s ON s.id = e.saison_id
        WHERE pe.promesse_id = ?
        ORDER BY s.numero, e.numero_episode, pe.id
    ");
    $st->execute([(int)$row['id']]);
    $row['episodes_jalons'] = $st->fetchAll();
}

function savePromesseJalons(PDO $db, int $promesseId, array $jalons): void {
    $db->prepare('DELETE FROM promesse_episodes WHERE promesse_id = ?')->execute([$promesseId]);
    $st = $db->prepare('INSERT INTO promesse_episodes (promesse_id, episode_id, explication, est_decisif) VALUES (?, ?, ?, ?)');
    foreach ($jalons as $jalon) {
        $episodeId = (int)($jalon['episode_id'] ?? 0);
        if ($episodeId <= 0) continue;
        $st->execute([
            $promesseId,
            $episodeId,
            trim($jalon['explication'] ?? ''),
            !empty($jalon['est_decisif']) ? 1 : 0,
        ]);
    }
}

function handlePromessesNarratives(PDO $db, string $method, ?int $id, array $body): void {
    ensurePromessesNarratives($db);

    switch ($method) {
        case 'GET':
            if ($id) {
                $st = $db->prepare(promessesNarrativesSelectSql() . ' WHERE p.id = ?');
                $st->execute([$id]);
                $row = $st->fetch() ?: [];
                if ($row) attachPromesseJalons($db, $row);
                echo json_encode($row);
            } else {
                $rows = $db->query(promessesNarrativesSelectSql() . "
                    ORDER BY CASE p.statut
                        WHEN 'ouverte' THEN 0
                        WHEN 'veille' THEN 1
                        WHEN 'payee' THEN 2
                        WHEN 'oubliee' THEN 3
                        ELSE 4
                    END, ss.numero, es.numero_episode, p.id
                ")->fetchAll();
                foreach ($rows as &$row) attachPromesseJalons($db, $row);
                echo json_encode($rows);
            }
            break;
        case 'POST':
            $st = $db->prepare("
                INSERT INTO promesses_narratives
                    (episode_source_id, episode_resolution_id, theme_id, theme_lien_type, titre, type_promesse, statut, description, resolution)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $st->execute([
                (int)($body['episode_source_id'] ?? 0),
                !empty($body['episode_resolution_id']) ? (int)$body['episode_resolution_id'] : null,
                !empty($body['theme_id']) ? (int)$body['theme_id'] : null,
                normalizePromesseThemeLien($body['theme_lien_type'] ?? null),
                trim($body['titre'] ?? ''),
                normalizePromesseType($body['type_promesse'] ?? null),
                normalizePromesseStatut($body['statut'] ?? null),
                $body['description'] ?? null,
                $body['resolution'] ?? null,
            ]);
            $newId = (int)$db->lastInsertId();
            savePromesseJalons($db, $newId, $body['episodes_jalons'] ?? []);
            echo json_encode(['id' => $newId]);
            break;
        case 'PUT':
            $st = $db->prepare("
                UPDATE promesses_narratives
                SET episode_source_id = ?, episode_resolution_id = ?, theme_id = ?, theme_lien_type = ?, titre = ?, type_promesse = ?,
                    statut = ?, description = ?, resolution = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ");
            $st->execute([
                (int)($body['episode_source_id'] ?? 0),
                !empty($body['episode_resolution_id']) ? (int)$body['episode_resolution_id'] : null,
                !empty($body['theme_id']) ? (int)$body['theme_id'] : null,
                normalizePromesseThemeLien($body['theme_lien_type'] ?? null),
                trim($body['titre'] ?? ''),
                normalizePromesseType($body['type_promesse'] ?? null),
                normalizePromesseStatut($body['statut'] ?? null),
                $body['description'] ?? null,
                $body['resolution'] ?? null,
                $id,
            ]);
            savePromesseJalons($db, (int)$id, $body['episodes_jalons'] ?? []);
            echo json_encode(['ok' => true]);
            break;
        case 'DELETE':
            $db->prepare('DELETE FROM promesses_narratives WHERE id = ?')->execute([$id]);
            echo json_encode(['ok' => true]);
            break;
    }
}

// ===================== UPLOAD / ANALYSE TEXTE =====================

function handleUpload(PDO $db, array $body): void {
    $epId = (int)($body['episode_id'] ?? $_POST['episode_id'] ?? 0);
    $texte = '';

    // Fichier uploadé
    if (!empty($_FILES['fichier'])) {
        $texte = file_get_contents($_FILES['fichier']['tmp_name']);
    } elseif (!empty($body['texte'])) {
        $texte = $body['texte'];
    }

    if (!$texte || !$epId) {
        http_response_code(400);
        echo json_encode(['error' => 'Texte ou épisode manquant']);
        return;
    }

    $stats = analyserTexte($texte);
    enrichirStatsLieuxEpisode($db, $epId, $stats, true);

    // Sauvegarder le texte dans l'épisode
    $db->prepare('UPDATE episodes SET texte_episode = ? WHERE id = ?')->execute([$texte, $epId]);

    // Sauvegarder les stats
    $db->prepare("
        INSERT OR REPLACE INTO episode_stats (episode_id, nb_repliques_total, nb_mots, nb_scenes, duree_estimee_min, stats_json, analysed_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ")->execute([
        $epId,
        $stats['nb_repliques_total'],
        $stats['nb_mots'],
        $stats['nb_scenes'],
        $stats['duree_estimee_min'],
        json_encode($stats)
    ]);
    syncEpisodeStatsTables($db, $epId, $stats);

    syncPresencePersonnages($db, $epId, $stats);

    echo json_encode($stats);
}

/**
 * Réanalyse le texte déjà stocké d'un épisode.
 * Appelé en boucle depuis le batch JS pour chaque épisode sélectionné.
 */
function handleReanalyse(PDO $db, array $body): void {
    $epId = (int)($body['episode_id'] ?? 0);
    if (!$epId) {
        http_response_code(400);
        echo json_encode(['error' => 'episode_id manquant']);
        return;
    }

    // Récupérer le texte déjà stocké
    $stmt = $db->prepare('SELECT texte_episode FROM episodes WHERE id = ?');
    $stmt->execute([$epId]);
    $row = $stmt->fetch();

    if (!$row || empty($row['texte_episode'])) {
        echo json_encode(['ok' => false, 'skipped' => true, 'reason' => 'Pas de texte stocké']);
        return;
    }

    $stats = analyserTexte($row['texte_episode']);
    enrichirStatsLieuxEpisode($db, $epId, $stats, true);

    $db->prepare("
        INSERT OR REPLACE INTO episode_stats
            (episode_id, nb_repliques_total, nb_mots, nb_scenes, duree_estimee_min, stats_json, analysed_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ")->execute([
        $epId,
        $stats['nb_repliques_total'],
        $stats['nb_mots'],
        $stats['nb_scenes'],
        $stats['duree_estimee_min'],
        json_encode($stats),
    ]);
    syncEpisodeStatsTables($db, $epId, $stats);

    syncPresencePersonnages($db, $epId, $stats);

    echo json_encode(['ok' => true, 'stats' => $stats]);
}

/**
 * Mots-clés qui NE sont pas des noms de personnages dans un script BEAT/Fountain.
 * On filtre : sluglines INT/EXT, transitions, directives scéniques, et toute
 * "phrase" en majuscules qui contient un verbe ou préposition (≥ 3 mots distincts
 * avec des mots courants).
 */
function estFauxPersonnage(string $nom): bool {
    // Règles saisies dans Config → Noms détectés : priment sur les heuristiques ci-dessous
    $regle = reglesNoms()[normaliserNomPersoPourMatch($nom)] ?? null;
    if ($regle) return $regle['regle'] === 'ignorer';

    // Contient des chiffres → pas un personnage, SAUF si c'est un nom court type "P1", "VISITEUR 1", "GARDE 2", "INFIRMIÈRE DE NUIT 1"
    // On accepte les noms d'1-4 mots où le chiffre est à la fin (ex: "P1", "VISITEUR 3", "INFIRMIÈRE DE NUIT 2")
    if (preg_match('/\d/', $nom)) {
        $mots = preg_split('/\s+/', trim($nom));
        $dernierMot = end($mots);
        $premierMot = $mots[0];
        $nomCourt = count($mots) <= 4
            && (preg_match('/^[A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ]+\d+$/', $premierMot)   // P1, P12
             || preg_match('/^\d+$/', $dernierMot));                      // GARDE 2, INFIRMIÈRE DE NUIT 1
        if (!$nomCourt) return true;
    }

    // Une transition n'est jamais un nom, même si elle ne figure pas dans les règles
    if (preg_match('/^(FONDU|COUPE|G[ÉE]N[ÉE]RIQUE)\b/u', $nom)) return true;

    // Trop long (> 5 mots) → probablement une didascalie
    $mots = preg_split('/\s+/', trim($nom));
    if (count($mots) > 5) return true;

    // Commence par un article/préposition indiscutablement non-personnage
    // Note : on exclut LE/LA/LES car des personnages peuvent s'appeler "LE NOTAIRE", "LA VOISINE", etc.
    $premiers = ['DE','DU','DES','AU','AUX','EN','DANS','PAR','SUR','SOUS','AVEC'];
    if (in_array(strtoupper($mots[0]), $premiers)) return true;

    // Si commence par LE/LA/LES : n'accepter que si le reste est un nom propre court (1 mot)
    // Ex: "LE NOTAIRE" (2 mots) → ok | "LE NOTAIRE EST AFFOLÉ" (> 2 mots) → filtré par > 4 mots
    // "LA LUMIÈRE S'ALLUME" → 3 mots, filtré par > 4 mots (ici on n'a rien à faire de plus)
    // Le filtre > 4 mots suffit dans la majorité des cas.

    // Contient des mots courants qui ne sont pas des prénoms
    $motsCourants = [
        'EST','SONT','ÉTAIT','DANS','AVEC','POUR','PAR','QUE','QUI','MAIS','OU','ET','CAR','OR','NI','DONC','PLUS','TRÈS','PUIS',
        // Verbes d'action courants dans les didascalies
        'REGARDE','REGARDENT','ENTRE','ENTRENT','SORT','SORTENT','VIENT','VIENNENT','VA','VONT',
        'FAIT','FONT','PREND','PRENNENT','MET','METTENT','SE','S\'EN','OUVRE','FERME',
        'COURT','COURENT','TOMBE','TOMBENT','ARRIVE','ARRIVENT','PART','PARTENT',
        'LIT','LISENT','ÉCRIT','ÉCRIVENT','MANGE','MANGENT','RIT','RIENT',
        'ALLUME','ÉTEINT','POSE','LÈVE','ASSIS','DEBOUT','COUCHÉ',
    ];
    foreach ($mots as $m) {
        if (in_array(strtoupper($m), $motsCourants)) return true;
    }

    // Contient de la ponctuation (sauf tiret) → pas un nom
    if (preg_match('/[,.;:!?()\[\]\/]/', $nom)) return true;

    // Un seul mot entièrement en majuscules de plus de 12 caractères → probablement une didascalie
    // Exception : les pseudos/noms avec chiffres (ex: ROBOT3000) sont acceptés
    if (count($mots) === 1 && mb_strlen($nom, 'UTF-8') > 15 && strtoupper($nom) === $nom && !preg_match('/\d/', $nom)) return true;

    // Un seul mot très court (≤ 2 lettres) → abréviation/directive
    // SAUF si c'est un nom de type P1/P2 (déjà validé avant)
    if (count($mots) === 1 && mb_strlen(trim($nom), 'UTF-8') <= 2 && !preg_match('/\d/', $nom)) return true;

    // Expressions de 4+ mots entièrement en majuscules → probablement une didascalie
    // (3 mots peut être un nom à particule : "LE VIEUX MONSIEUR", "LA PERSONNE DE...")
    // SAUF si le dernier mot est un chiffre (ex: "LE GARDE 2", "VISITEUR 1") — déjà validé avant
    $dernierMotFinal = strtoupper(end($mots));
    $estNomNumerote = preg_match('/^\d+$/', $dernierMotFinal);
    if (count($mots) >= 4 && strtoupper($nom) === $nom && !$estNomNumerote) return true;

    return false;
}

/**
 * Compte les mots en UTF-8 correctement pour le français.
 * str_word_count() de PHP est limité aux caractères ASCII — il rate les accents
 * et coupe mal sur les apostrophes ("n'ai" → 1 mot, pas 2).
 * On sépare sur tout ce qui n'est pas une lettre unicode ou un chiffre.
 */
function compterMots(string $texte): int {
    // Remplacer les apostrophes typographiques et droites par un espace
    $texte = str_replace(["\u{2019}", "\u{2018}", "'", "'"], ' ', $texte);
    // Séparer sur tout caractère non-lettre/non-chiffre
    $mots = preg_split('/[^\p{L}\p{N}]+/u', trim($texte), -1, PREG_SPLIT_NO_EMPTY);
    return count($mots);
}

function normaliserTexteDecor(string $s): string {
    $s = mb_strtolower(trim($s), 'UTF-8');
    $s = str_replace(['é','è','ê','ë'], 'e', $s);
    $s = str_replace(['à','â','ä'], 'a', $s);
    $s = str_replace(['î','ï'], 'i', $s);
    $s = str_replace(['ô','ö'], 'o', $s);
    $s = str_replace(['ù','û','ü'], 'u', $s);
    $s = str_replace(['ç'], 'c', $s);
    $s = preg_replace('/\b(d|de|du|des|la|le|les|l)\b/u', ' ', $s);
    $s = preg_replace('/[^a-z0-9]+/u', ' ', $s);
    return trim(preg_replace('/\s+/', ' ', $s));
}

function extraireLieuSlugline(string $line): string {
    $raw = trim($line);
    $raw = preg_replace('/^(INT\.?|EXT\.?|INT\/EXT\.?|I\/E\.?)\s*/iu', '', $raw);
    $parts = preg_split('/\s+[-–—](?:\s+|$)|\s+\/\s+|\s+\|\s+|\s+\(/u', $raw);
    $lieu = trim($parts[0] ?? $raw);
    $lieu = preg_replace('/\b(JOUR|NUIT|MATIN|SOIR|AUBE|CRÉPUSCULE|CREPUSCULE|PLUS TARD|CONTINU|FLASHBACK)\b/iu', '', $lieu);
    return trim(preg_replace('/\s+/', ' ', $lieu));
}

function decorTokensSignificatifs(string $s): array {
    $stop = ['d','de','du','des','la','le','les','l','un','une','et','a','au','aux'];
    return array_values(array_filter(explode(' ', normaliserTexteDecor($s)), fn($t) => strlen($t) >= 3 && !in_array($t, $stop, true)));
}

function matcherSceneDecors(string $sceneLieu, array $lieux): array {
    $sceneN = normaliserTexteDecor($sceneLieu);
    if (!$sceneN) return [];
    $sceneTokens = decorTokensSignificatifs($sceneLieu);

    $scores = [];
    foreach ($lieux as $lieu) {
        $candidates = array_filter([$lieu['nom'] ?? '', $lieu['nom_affichage'] ?? '']);
        $best = 0;
        foreach ($candidates as $candidate) {
            $candN = normaliserTexteDecor($candidate);
            if (!$candN || strlen(str_replace(' ', '', $candN)) < 3) continue;
            if ($sceneN === $candN) {
                $best = max($best, 100);
                continue;
            }
            if (strlen($candN) >= 4 && preg_match('/(?:^| )' . preg_quote($candN, '/') . '(?: |$)/u', $sceneN)) {
                $best = max($best, min(96, 62 + strlen($candN)));
                continue;
            }

            $tokens = decorTokensSignificatifs($candidate);
            if ($tokens) {
                $ok = true;
                foreach ($tokens as $token) {
                    if (!in_array($token, $sceneTokens, true)) { $ok = false; break; }
                }
                if ($ok) $best = max($best, 50 + count($tokens) * 8);
            }
        }
        if ($best >= 58) $scores[] = ['lieu' => $lieu, 'score' => $best];
    }

    if (!$scores) return [];
    usort($scores, fn($a, $b) => $b['score'] <=> $a['score']);
    $top = $scores[0]['score'];
    return array_values(array_map(fn($x) => $x['lieu'], array_filter($scores, fn($x) => $x['score'] >= $top - 4)));
}

function enrichirStatsLieuxEpisode(PDO $db, int $episodeId, array &$stats, bool $syncEpisodeLieux = true): array {
    ensureStatsTablesBackfilled($db);
    $lieux = $db->query('SELECT * FROM lieux')->fetchAll();
    if (!$lieux || empty($stats['scenes'])) {
        $stats['repliques_par_lieu'] = [];
        return [];
    }

    $firstAppearanceIds = array_values(array_filter(array_map(fn($l) => (int)($l['premiere_apparition_episode_id'] ?? 0), $lieux)));
    $episodeOrders = chargerEpisodeOrders($db, array_merge([$episodeId], $firstAppearanceIds));
    $currentOrder = $episodeOrders[$episodeId] ?? null;

    $statutsEpisode = [];
    $stStatuts = $db->prepare('SELECT lieu_id, statut FROM episode_lieux WHERE episode_id = ?');
    $stStatuts->execute([$episodeId]);
    foreach ($stStatuts->fetchAll() as $row) {
        $statutsEpisode[(int)$row['lieu_id']] = $row['statut'];
    }

    $oldAutoLieuIds = [];
    $stOldLieux = $db->prepare('SELECT lieu_id FROM episode_stat_lieux WHERE episode_id = ?');
    $stOldLieux->execute([$episodeId]);
    foreach ($stOldLieux->fetchAll() as $oldLieu) $oldAutoLieuIds[] = (int)$oldLieu['lieu_id'];
    $oldAutoLieuIds = array_values(array_unique($oldAutoLieuIds));

    $totalMots = max(1, (int)($stats['nb_mots'] ?? 0));
    $dureeEp = max(0, (int)($stats['duree_estimee_min'] ?? 0));
    $agg = [];

    foreach ($stats['scenes'] as $idx => &$scene) {
        $sceneLieu = $scene['lieu_raw'] ?? '';
        $matched = array_values(array_filter(matcherSceneDecors($sceneLieu, $lieux), function($lieu) use ($currentOrder, $episodeOrders, $statutsEpisode) {
            $lieuId = (int)($lieu['id'] ?? 0);
            if (($statutsEpisode[$lieuId] ?? '') === 'pas encore existant') return false;

            $firstId = (int)($lieu['premiere_apparition_episode_id'] ?? 0);
            if ($firstId && episodeOrderBefore($currentOrder, $episodeOrders[$firstId] ?? null)) return false;

            return true;
        }));
        $scene['lieux_detectes'] = array_map(fn($l) => (int)$l['id'], $matched);
        if (!$matched) continue;

        $nbReplScene = array_sum(array_map('intval', $scene['repliques'] ?? []));
        $motsScene = (int)($scene['mots'] ?? 0);
        $dureeScene = $dureeEp > 0 ? $dureeEp * ($motsScene / $totalMots) : 0;

        foreach ($matched as $lieu) {
            $id = (int)$lieu['id'];
            if (!isset($agg[$id])) {
                $agg[$id] = [
                    'lieu_id'      => $id,
                    'nom'          => $lieu['nom'] ?? '',
                    'nb_scenes'    => 0,
                    'nb_repliques' => 0,
                    'nb_mots'      => 0,
                    'duree_min'    => 0.0,
                    'personnages'  => [],
                ];
            }
            $agg[$id]['nb_scenes']++;
            $agg[$id]['nb_repliques'] += $nbReplScene;
            $agg[$id]['nb_mots'] += $motsScene;
            $agg[$id]['duree_min'] += $dureeScene;

            foreach (($scene['repliques'] ?? []) as $nom => $nb) {
                if (!isset($agg[$id]['personnages'][$nom])) $agg[$id]['personnages'][$nom] = 0;
                $agg[$id]['personnages'][$nom] += (int)$nb;
            }
        }
    }
    unset($scene);

    foreach ($agg as &$row) {
        $row['duree_min'] = (int)round($row['duree_min']);
        $persos = [];
        foreach ($row['personnages'] as $nom => $nb) $persos[] = ['nom' => $nom, 'nb_repliques' => $nb];
        usort($persos, fn($a, $b) => $b['nb_repliques'] <=> $a['nb_repliques']);
        $row['personnages'] = $persos;
    }
    unset($row);

    $stats['repliques_par_lieu'] = array_values($agg);

    if ($syncEpisodeLieux) {
        $newAutoLieuIds = array_map('intval', array_keys($agg));
        foreach ($oldAutoLieuIds as $oldLieuId) {
            if (in_array($oldLieuId, $newAutoLieuIds, true)) continue;
            if (($statutsEpisode[$oldLieuId] ?? '') !== 'present') continue;
            $db->prepare('DELETE FROM episode_lieux WHERE episode_id = ? AND lieu_id = ?')->execute([$episodeId, $oldLieuId]);
        }

        foreach (array_keys($agg) as $lieuId) {
            $db->prepare('DELETE FROM episode_lieux WHERE episode_id = ? AND lieu_id = ?')->execute([$episodeId, $lieuId]);
            $db->prepare('INSERT INTO episode_lieux (episode_id, lieu_id, statut) VALUES (?, ?, ?)')->execute([$episodeId, $lieuId, 'present']);
        }
    }

    return $stats['repliques_par_lieu'];
}

function handleDecorsAuto(PDO $db): void {
    $rows = $db->query("SELECT id, texte_episode FROM episodes WHERE texte_episode IS NOT NULL AND TRIM(texte_episode) <> ''")->fetchAll();
    $episodesAnalyses = 0;
    $presences = 0;

    foreach ($rows as $row) {
        $epId = (int)$row['id'];
        $stats = analyserTexte($row['texte_episode']);
        $lieux = enrichirStatsLieuxEpisode($db, $epId, $stats, true);
        $presences += count($lieux);

        $db->prepare("
            INSERT OR REPLACE INTO episode_stats
                (episode_id, nb_repliques_total, nb_mots, nb_scenes, duree_estimee_min, stats_json, analysed_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ")->execute([
            $epId,
            $stats['nb_repliques_total'],
            $stats['nb_mots'],
            $stats['nb_scenes'],
            $stats['duree_estimee_min'],
            json_encode($stats),
        ]);
        syncEpisodeStatsTables($db, $epId, $stats);

        $episodesAnalyses++;
    }

    echo json_encode([
        'ok' => true,
        'episodes_analyses' => $episodesAnalyses,
        'presences_detectees' => $presences,
    ]);
}

// Apostrophe courbe et espace insécable cachent sinon des noms comme L’HOMME ou VISITEUR 1
function normaliserScript(string $texte): string {
    if (estRoman()) return proseVersScript($texte);
    if (estBD()) return bdVersScript($texte);
    if (genreTexte()) return genreVersScript($texte);
    return str_replace(["\u{2019}", "\u{00A0}", "\u{202F}"], ["'", ' ', ' '], $texte);
}

// Une transition collée à une réplique n'en fait pas partie
function estTransition(string $ligne): bool {
    return preg_match('/^(FONDU|COUPE|G[ÉE]N[ÉE]RIQUE|FIN\b)/u', $ligne) && mb_strtoupper($ligne, 'UTF-8') === $ligne;
}

// « Je précise : … » est une phrase ; seul un nom en capitales ouvre une réplique en ligne
function estNomEnLigne(string $nom): bool {
    return mb_strtoupper($nom, 'UTF-8') === $nom && !estFauxPersonnage($nom);
}

// $dejaScript : texte déjà réécrit depuis la prose d'un roman
function analyserTexte(string $texte, bool $dejaScript = false): array {
    if (estRoman() && !$dejaScript) {
        // Dans un roman, les mots comptent toute la prose et la durée devient un temps de lecture
        $stats = analyserTexte(proseVersScript($texte), true);
        $stats['nb_mots_dialogue'] = $stats['nb_mots'];
        $stats['nb_mots'] = compterMotsProse($texte);
        $stats['duree_estimee_min'] = max(1, (int)round($stats['nb_mots'] / 250));
        return $stats;
    }
    // Théâtre, pub, jeu : le texte est relu en script, et chaque unité garde ses scènes même muettes
    if (genreTexte() && !$dejaScript) {
        $stats = analyserTexte(genreVersScript($texte), true);
        $stats['duree_estimee_min'] = dureeGenre($texte);
        return $stats;
    }
    if (estBD() && !$dejaScript) {
        // Une case est une scène, une bulle une réplique ; une case sans bulle compte quand même
        return analyserTexte(bdVersScript($texte), true);
    }
    if (estFilm() && !$dejaScript) {
        // Une séquence sans dialogue reste une séquence ; la durée se lit à la page
        $stats = analyserTexte(str_replace(["\u{2019}", "\u{00A0}", "\u{202F}"], ["'", ' ', ' '], $texte), true);
        $stats['duree_estimee_min'] = max(1, (int)round(array_sum(paginerScenario(blocsScenario($texte), miseEnPageCourante())['sequences'])));
        return $stats;
    }
    if (!$dejaScript) $texte = normaliserScript($texte);
    // Supprimer les commentaires BEAT/Fountain /* ... */ (métadonnées de l'app)
    $texte = preg_replace('/\/\*.*?\*\//s', '', $texte);
    // Supprimer aussi les lignes de titre/métadonnées Fountain au tout début
    // (ex: "Une histoire écrite par Paul" avant le premier slugline)
    // On coupe tout ce qui précède le premier INT. ou EXT.
    if (preg_match('/^(INT\.|EXT\.|INT |EXT )/im', $texte, $m, PREG_OFFSET_CAPTURE)) {
        $texte = substr($texte, $m[0][1]);
    }

    $lines = explode("\n", $texte);
    $repliques = [];
    $mots = 0;          // Compte uniquement les mots des dialogues (répliques)
    $currentPerso = null;
    $dialogueOuvert = false; // true = on est dans le bloc dialogue d'un personnage

    // ── Découpage en scènes ──────────────────────────────────────────────────
    $scenes = [];
    $currentScene = ['persos' => [], 'repliques' => [], 'mots' => 0, 'lieu_raw' => null, 'slugline' => null];
    $isSlugline = function(string $line): bool {
        if (preg_match('/^(INT\.|EXT\.|INT |EXT |INT$|EXT$)/iu', $line)) return true;
        if (preg_match('/^[-=]{3,}\s*$/', $line)) return true;
        return false;
    };
    $scenePerso = null;

    foreach ($lines as $line) {
        $line = trim($line);

        // Ligne vide → ferme le bloc dialogue en cours
        if (empty($line)) {
            // Le bloc de dialogue est fini : ce qui suit est une didascalie, sauf nouveau nom
            if ($dialogueOuvert) $currentPerso = null;
            $dialogueOuvert = false;
            continue;
        }

        // Nouvelle scène ?
        if ($isSlugline($line)) {
            if (!empty($currentScene['persos']) || !empty($currentScene['repliques']) || ($dejaScript && $currentScene['slugline'] !== null)) {
                $scenes[] = $currentScene;
            }
            $currentScene = [
                'persos'    => [],
                'repliques' => [],
                'mots'      => 0,
                'lieu_raw'  => extraireLieuSlugline($line),
                'slugline'  => $line,
            ];
            $scenePerso = null;
            $currentPerso = null;
            $dialogueOuvert = false;
            // Sluglines ne comptent pas dans les mots de dialogue
            continue;
        }

        // Parenthetical Fountain : (entre parenthèses) → ignorer, garder le perso courant
        if (preg_match('/^\(.*\)$/', $line)) {
            // On reste dans le bloc dialogue du personnage courant
            continue;
        }

        // Détection format screenplay BEAT/Fountain : NOM EN MAJUSCULES seul sur une ligne
        // (avec éventuellement un parenthetical sur la même ligne : "MARIE (V.O.)")
        if (preg_match('/^([A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ][A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ\s\'\-\d]{0,35})(\s*\(.*\))?$/u', $line, $m)) {
            $nom = trim($m[1]);
            if (!estFauxPersonnage($nom)) {
                $currentPerso   = $nom;
                $scenePerso     = $nom;
                $dialogueOuvert = false; // Le bloc dialogue commence à la prochaine ligne de texte
                continue;
            } elseif (!$currentPerso || estTransition($line)) {
                // Didascalie en majuscules : fin du bloc dialogue
                $currentPerso   = null;
                $scenePerso     = null;
                $dialogueOuvert = false;
                continue;
            }
            // Sinon « OK » ou un mot crié : la réplique continue
        }

        // Détection format "NOM: réplique" (scripts non-Fountain)
        if (preg_match('/^([A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ][A-Za-zÀ-ÿ\s\-\']{0,25})\s*:\s*(.+)/u', $line, $m)) {
            $nom     = trim($m[1]);
            $replique = trim($m[2]);
            if (estNomEnLigne($nom)) {
                if (!isset($repliques[$nom])) $repliques[$nom] = ['nb_repliques' => 0, 'nb_mots' => 0, 'type' => 'autre'];
                $repliques[$nom]['nb_repliques']++;
                $nMots = compterMots($replique);
                $repliques[$nom]['nb_mots'] += $nMots;
                $mots += $nMots;
                if (!isset($currentScene['repliques'][$nom])) $currentScene['repliques'][$nom] = 0;
                $currentScene['repliques'][$nom]++;
                if (!in_array($nom, $currentScene['persos'])) $currentScene['persos'][] = $nom;
                $currentScene['mots'] += $nMots;
                $currentPerso   = null;
                $scenePerso     = null;
                $dialogueOuvert = false;
                continue;
            }
        }

        // Ligne de dialogue après un nom détecté (format screenplay Fountain)
        if ($currentPerso) {
            // C'est une ligne de dialogue : on l'accumule
            if (!isset($repliques[$currentPerso])) $repliques[$currentPerso] = ['nb_repliques' => 0, 'nb_mots' => 0, 'type' => 'autre'];

            // On n'incrémente nb_repliques qu'à la première ligne du bloc dialogue
            if (!$dialogueOuvert) {
                $repliques[$currentPerso]['nb_repliques']++;
                if (!isset($currentScene['repliques'][$currentPerso])) $currentScene['repliques'][$currentPerso] = 0;
                $currentScene['repliques'][$currentPerso]++;
                // Un nom seul n'est pas une présence : le personnage entre en scène à sa première réplique
                if (!in_array($currentPerso, $currentScene['persos'])) $currentScene['persos'][] = $currentPerso;
                $dialogueOuvert = true;
            }

            $nMots = compterMots($line);
            $repliques[$currentPerso]['nb_mots'] += $nMots;
            $mots += $nMots;
            $currentScene['mots'] += $nMots;
            continue;
        }

        // Ligne d'action / didascalie ordinaire → on ne compte pas les mots
        $dialogueOuvert = false;
    }

    // Clore la dernière scène
    if (!empty($currentScene['persos']) || !empty($currentScene['repliques']) || ($dejaScript && $currentScene['slugline'] !== null)) {
        $scenes[] = $currentScene;
    }

    // Si rien détecté (texte sans format screenplay), compter les mots bruts
    if (empty($repliques)) {
        $totalMots = str_word_count($texte);
        $mots = $totalMots;
    }

    // Trier par nombre de répliques
    arsort($repliques);

    $totalRepliques = array_sum(array_column($repliques, 'nb_repliques'));
    // Estimation : ~2 minutes par page, ~175 mots/min
    $duree = max(1, (int)round($mots / 175));

    // ── Sérialiser les scènes (format allégé pour stats_json) ───────────────
    $scenesOut = [];
    foreach ($scenes as $sc) {
        // Dans un roman, un film ou une BD, une scène sans dialogue reste une scène
        if (empty($sc['persos']) && !($dejaScript && $sc['slugline'] !== null)) continue;
        $scenesOut[] = [
            'persos'    => array_values($sc['persos']),
            'repliques' => $sc['repliques'],   // [nom => nb]
            'mots'      => $sc['mots'],
            'lieu_raw'  => $sc['lieu_raw'] ?? null,
            'slugline'  => $sc['slugline'] ?? null,
        ];
    }

    return [
        'nb_repliques_total' => $totalRepliques,
        'nb_mots'            => $mots,
        'nb_scenes'          => count($scenesOut),
        'duree_estimee_min'  => $duree,
        'repliques_par_perso'=> $repliques,
        'scenes'             => $scenesOut,
    ];
}

// ===================== ANALYSE MULTI-ÉPISODES =====================

function handleAnalyse(PDO $db, array $body): void {
    $ids = array_filter(array_map('intval', $body['episode_ids'] ?? []));
    if (empty($ids)) {
        echo json_encode(['error' => 'Aucun épisode sélectionné']);
        return;
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));

    // Données épisodes
    $stmt = $db->prepare("
        SELECT e.*, s.numero as saison_numero, s.nom as saison_nom
        FROM episodes e JOIN saisons s ON s.id = e.saison_id
        WHERE e.id IN ($placeholders)
        ORDER BY s.numero, e.numero_episode
    ");
    $stmt->execute($ids);
    $episodes = $stmt->fetchAll();

    // Stats texte
    $stmt = $db->prepare("SELECT * FROM episode_stats WHERE episode_id IN ($placeholders)");
    $stmt->execute($ids);
    $statsRows = $stmt->fetchAll();
    $statsMap = array_column($statsRows, null, 'episode_id');
    $statsPersosByEpisode = fetchStatsPersonnagesByEpisode($db, $ids);
    $statsScenesByEpisode = fetchStatsScenesByEpisode($db, $ids);

    // Répliques par personnage (depuis episode_personnages + extras)
    $stmt = $db->prepare("
        SELECT p.id as personnage_id, p.prenom as nom, p.est_principal,
               ep.nb_repliques, ep.present, ep.episode_id
        FROM episode_personnages ep
        JOIN personnages p ON p.id = ep.personnage_id
        WHERE ep.episode_id IN ($placeholders)
    ");
    $stmt->execute($ids);
    $presences = $stmt->fetchAll();

    // Extras
    $stmt = $db->prepare("SELECT * FROM episode_extras WHERE episode_id IN ($placeholders)");
    $stmt->execute($ids);
    $extras = $stmt->fetchAll();

    // Thèmes
    $stmt = $db->prepare("
        SELECT et.episode_id, t.id, t.nom, t.couleur, et.intensite
        FROM episode_themes et JOIN themes t ON t.id = et.theme_id
        WHERE et.episode_id IN ($placeholders)
    ");
    $stmt->execute($ids);
    $themeRows = $stmt->fetchAll();

    // Agréger par personnage
    $parPersonnage = [];
    foreach ($presences as $pr) {
        $nom = $pr['nom'];
        if (!isset($parPersonnage[$nom])) {
            $parPersonnage[$nom] = [
                'personnage_id'  => $pr['personnage_id'],
                'nom'            => $nom,
                'total_repliques'=> 0,
                'nb_presences'   => 0,
                'est_principal'  => (int)($pr['est_principal'] ?? 0) >= 2 ? 1 : 0,
                'est_recurrent'  => (int)($pr['est_principal'] ?? 0) == 1 ? 1 : 0,
                'episodes_details' => []
            ];
        }
        if ($pr['present']) {
            $parPersonnage[$nom]['nb_presences']++;
        }
        if ($pr['nb_repliques'] > 0) {
            $parPersonnage[$nom]['total_repliques'] += (int)$pr['nb_repliques'];
            $ep = array_values(array_filter($episodes, fn($e) => $e['id'] == $pr['episode_id']))[0] ?? null;
            if ($ep) {
                $parPersonnage[$nom]['episodes_details'][] = [
                    'code' => 'S' . $ep['saison_numero'] . 'E' . str_pad($ep['numero_episode'], 2, '0', STR_PAD_LEFT),
                    'nb_repliques' => (int)$pr['nb_repliques']
                ];
            }
        }
    }

    // Charger tous les personnages pour la résolution de correspondance
    $tousPersonnages = $db->query('SELECT * FROM personnages')->fetchAll();

    /**
     * Normalise une chaîne : lowercase, sans accents, sans tirets superflus.
     * "JEAN-PAUL ÉDOUARD" → "jean paul edouard"
     * "Jean-Marc" → "jean marc"
     */
    $norm = function(string $s): string {
        $s = mb_strtolower(trim($s), 'UTF-8');
        $s = str_replace(['é','è','ê','ë'], 'e', $s);
        $s = str_replace(['à','â','ä'], 'a', $s);
        $s = str_replace(['î','ï'], 'i', $s);
        $s = str_replace(['ô','ö'], 'o', $s);
        $s = str_replace(['ù','û','ü'], 'u', $s);
        $s = str_replace(['ç'], 'c', $s);
        $s = str_replace(['-', '_'], ' ', $s);
        $s = preg_replace('/\s+/', ' ', $s);
        return trim($s);
    };

    /**
     * Trouver la clé dans $parPersonnage qui correspond au nom parsé du script.
     * Retourne le prénom DB si trouvé, null sinon.
     */
    $resolveNomParse = function(string $nomParse) use ($tousPersonnages): ?string {
        return matcherPersonnageDepuisNom($nomParse, $tousPersonnages)['prenom'] ?? null;
    };

    // Extras dans les répliques — passent par le resolver pour éviter les doublons
    foreach ($extras as $x) {
        $cleDB = $resolveNomParse($x['nom']);
        $key = ($cleDB && isset($parPersonnage[$cleDB])) ? $cleDB : $x['nom'];
        if (!isset($parPersonnage[$key])) {
            $parPersonnage[$key] = ['personnage_id' => null, 'nom' => $key, 'total_repliques' => 0, 'nb_presences' => 0, 'episodes_details' => []];
        }
        $parPersonnage[$key]['total_repliques'] += (int)$x['nb_repliques'];
    }

    // Stats des textes analysés
    $totalRepliquesTexte = 0;
    $totalMots = 0;
    $duree = 0;
    foreach ($statsMap as $epId => $st) {
        $totalRepliquesTexte += (int)$st['nb_repliques_total'];
        $totalMots           += (int)$st['nb_mots'];
        $duree               += (int)$st['duree_estimee_min'];

        $ep = array_values(array_filter($episodes, fn($e) => $e['id'] == $epId))[0] ?? null;
        $epCode = $ep ? ('S' . $ep['saison_numero'] . 'E' . str_pad($ep['numero_episode'], 2, '0', STR_PAD_LEFT)) : '?';

        foreach ($statsPersosByEpisode[(int)$epId] ?? [] as $nomParse => $data) {
            $nbRepl = (int)($data['nb_repliques'] ?? 0);
            if ($nbRepl === 0) continue;

            // Résoudre vers un personnage DB existant
            $cleDB = $resolveNomParse($nomParse);

            if ($cleDB && isset($parPersonnage[$cleDB])) {
                // Fusionner dans l'entrée DB existante — prendre la valeur parsée (source de vérité)
                if ($parPersonnage[$cleDB]['total_repliques'] === 0) {
                    $parPersonnage[$cleDB]['total_repliques'] = $nbRepl;
                } else {
                    $parPersonnage[$cleDB]['total_repliques'] = max($parPersonnage[$cleDB]['total_repliques'], $nbRepl);
                }
                // Ajouter le détail épisode si pas déjà présent
                $hasDetail = false;
                foreach ($parPersonnage[$cleDB]['episodes_details'] as $ed) {
                    if ($ed['code'] === $epCode) { $hasDetail = true; break; }
                }
                if (!$hasDetail) {
                    $parPersonnage[$cleDB]['episodes_details'][] = ['code' => $epCode, 'nb_repliques' => $nbRepl];
                }
            } else {
                // Non reconnu dans la DB → filtrer les faux personnages
                if (estFauxPersonnage($nomParse)) continue;
                if (!isset($parPersonnage[$nomParse])) {
                    $parPersonnage[$nomParse] = [
                        'personnage_id'    => null,
                        'nom'              => $nomParse,
                        'total_repliques'  => 0,
                        'nb_presences'     => 0,
                        'episodes_details' => []
                    ];
                }
                $parPersonnage[$nomParse]['total_repliques'] += $nbRepl;
                $parPersonnage[$nomParse]['episodes_details'][] = ['code' => $epCode, 'nb_repliques' => $nbRepl];
            }
        }
    }

    // Nb épisodes uploadés par saison
    $nbUploadedBySaison = [];
    foreach ($episodes as $ep) {
        $sid = $ep['saison_id'] ?? $ep['saison_numero'];
        if (!isset($nbUploadedBySaison[$ep['saison_id']])) $nbUploadedBySaison[$ep['saison_id']] = 0;
        if (isset($statsMap[$ep['id']])) $nbUploadedBySaison[$ep['saison_id']]++;
    }

    // Total répliques (combiner texte analysé et manuel) — doit être calculé AVANT les % par perso
    $totalRepliques = $totalRepliquesTexte ?: array_sum(array_column($parPersonnage, 'total_repliques'));

    // Durée totale + % présence/répliques par personnage
    $totalEpisodesSerie = (int)$db->query('SELECT COUNT(*) FROM episodes')->fetchColumn();
    foreach ($parPersonnage as &$pp) {
        if ($pp['personnage_id']) {
            $durStmt = $db->prepare("
                SELECT COALESCE(SUM(
                    CASE WHEN es.nb_repliques_total > 0
                        THEN es.duree_estimee_min * ep.nb_repliques / es.nb_repliques_total
                        ELSE 0
                    END
                ), 0)
                FROM episode_personnages ep
                JOIN episode_stats es ON es.episode_id = ep.episode_id
                WHERE ep.personnage_id = ? AND ep.episode_id IN ($placeholders) AND ep.present = 1
            ");
            $durStmt->execute(array_merge([$pp['personnage_id']], $ids));
            $pp['duree_totale_min'] = (int)round($durStmt->fetchColumn());
        } else {
            $pp['duree_totale_min'] = 0;
        }
        $pp['pct_presence']  = count($ids) > 0 ? round(($pp['nb_presences']    / count($ids))       * 100) : 0;
        $pp['pct_repliques'] = $totalRepliques  > 0 ? round(($pp['total_repliques'] / $totalRepliques) * 100) : 0;
    }
    unset($pp);

    // Trier par répliques
    usort($parPersonnage, fn($a, $b) => $b['total_repliques'] - $a['total_repliques']);

    // Thèmes agrégés
    $themeAgg = [];
    foreach ($themeRows as $t) {
        $key = $t['nom'];
        if (!isset($themeAgg[$key])) $themeAgg[$key] = ['nom' => $key, 'couleur' => $t['couleur'], 'nb_episodes' => 0];
        $themeAgg[$key]['nb_episodes']++;
    }
    usort($themeAgg, fn($a,$b) => $b['nb_episodes'] - $a['nb_episodes']);

    // Stats avancement
    $avgAvancement = count($episodes) ? (int)round(array_sum(array_column($episodes, 'avancement')) / count($episodes)) : 0;
    $totalPages = array_sum(array_column($episodes, 'nb_pages'));
    $nbFinals = count(array_filter($episodes, fn($e) => $e['jet'] === 'Final'));

    // ── Récurrences : co-présences par épisode (depuis episode_personnages) ──
    // Pour chaque épisode, on prend les personnages present=1 et on génère
    // toutes les combinaisons (duos, trios, quartets…).
    // Source : $presences déjà chargé plus haut.

    // Construire : episode_id → [noms des persos présents]
    $persosParEpisode = []; // episode_id → [nom, ...]
    foreach ($presences as $pr) {
        if (!$pr['present']) continue;
        $epId = $pr['episode_id'];
        if (!isset($persosParEpisode[$epId])) $persosParEpisode[$epId] = [];
        $persosParEpisode[$epId][] = $pr['nom']; // prénom DB direct
    }

    // Construire : episode_id → scenes[] depuis stats_json (pour nb_scenes et duree_min précis)
    // Chaque scène contient 'persos' (noms parsés) et 'mots'
    // On construit aussi un index nom_parsé → nom_DB via $resolveNomParse
    $scenesParEpisode = []; // episode_id → [['persos_db' => [...], 'mots' => int], ...]
    foreach ($statsMap as $epId => $st) {
        $scenesParEpisode[$epId] = [];
        foreach ($statsScenesByEpisode[(int)$epId] ?? [] as $sc) {
            $persosDB = [];
            foreach ($sc['persos'] as $nomParse) {
                $resolved = $resolveNomParse($nomParse);
                $persosDB[] = $resolved ?? $nomParse;
            }
            $scenesParEpisode[$epId][] = [
                'persos_db' => array_unique($persosDB),
                'mots'      => (int)($sc['mots'] ?? 0),
            ];
        }
    }

    // Fonction générant toutes les combinaisons de taille $r
    $combinaisons = function(array $arr, int $r) use (&$combinaisons): array {
        $n = count($arr);
        if ($r > $n || $r === 0) return [];
        if ($r === $n) return [$arr];
        if ($r === 1) return array_map(fn($x) => [$x], $arr);
        $result = [];
        $first = array_shift($arr);
        foreach ($combinaisons($arr, $r - 1) as $sub) {
            $result[] = array_merge([$first], $sub);
        }
        foreach ($combinaisons($arr, $r) as $sub) {
            $result[] = $sub;
        }
        return $result;
    };

    $coPresence = []; // clé = noms triés "||" → [persos[], taille, nb_episodes, nb_repliques, nb_scenes, duree_min]

    foreach ($persosParEpisode as $epId => $nomsDuEp) {
        $nomsDuEp = array_values(array_unique($nomsDuEp));
        $n = count($nomsDuEp);
        if ($n < 2) continue;

        sort($nomsDuEp);

        // Répliques totales des persos dans cet épisode (depuis episode_personnages)
        $repliquesEp = []; // nom → nb_repliques
        foreach ($presences as $pr) {
            if ($pr['episode_id'] != $epId || !$pr['present']) continue;
            $repliquesEp[$pr['nom']] = (int)$pr['nb_repliques'];
        }

        // Durée et mots totaux de l'épisode (pour calculer la proportion)
        $dureeEp  = (int)($statsMap[$epId]['duree_estimee_min'] ?? 0);
        $motsEp   = (int)($statsMap[$epId]['nb_mots'] ?? 0);
        $scenesEp = $scenesParEpisode[$epId] ?? [];

        $maxTaille = min($n, 6);
        for ($taille = 2; $taille <= $maxTaille; $taille++) {
            foreach ($combinaisons($nomsDuEp, $taille) as $combo) {
                sort($combo);
                $key = implode('||', $combo);

                if (!isset($coPresence[$key])) {
                    $coPresence[$key] = [
                        'persos'       => $combo,
                        'taille'       => $taille,
                        'nb_episodes'  => 0,
                        'nb_repliques' => 0,
                        'nb_scenes'    => 0,
                        'duree_min'    => 0,
                    ];
                }
                $coPresence[$key]['nb_episodes']++;
                foreach ($combo as $p) {
                    $coPresence[$key]['nb_repliques'] += $repliquesEp[$p] ?? 0;
                }

                // Compter les scènes où TOUS les persos de la combo sont présents
                // et calculer leur durée proportionnelle aux mots
                if ($scenesEp && $dureeEp > 0 && $motsEp > 0) {
                    foreach ($scenesEp as $sc) {
                        $comboPresente = true;
                        foreach ($combo as $p) {
                            if (!in_array($p, $sc['persos_db'])) {
                                $comboPresente = false;
                                break;
                            }
                        }
                        if ($comboPresente) {
                            $coPresence[$key]['nb_scenes']++;
                            // Durée proportionnelle aux mots de la scène
                            $coPresence[$key]['duree_min'] += $dureeEp * ($sc['mots'] / $motsEp);
                        }
                    }
                }
            }
        }
    }

    // Arrondir les durées
    foreach ($coPresence as &$cp) {
        $cp['duree_min'] = (int)round($cp['duree_min']);
    }
    unset($cp);

    // Trier par taille puis nb_episodes décroissant
    usort($coPresence, function($a, $b) {
        if ($a['taille'] !== $b['taille']) return $a['taille'] - $b['taille'];
        return $b['nb_episodes'] - $a['nb_episodes'];
    });

    // Personnages qui ne se croisent jamais (aucun épisode en commun)
    $pairesExistantes = [];
    foreach ($coPresence as $cp) {
        if ($cp['taille'] === 2) {
            $pairesExistantes[implode('||', $cp['persos'])] = true;
        }
    }
    $persosActifs = array_values(array_filter($parPersonnage, fn($p) => $p['nb_presences'] > 0));
    $jamaisEnsemble = [];
    for ($i = 0; $i < count($persosActifs); $i++) {
        for ($j = $i + 1; $j < count($persosActifs); $j++) {
            $a = $persosActifs[$i]['nom'];
            $b = $persosActifs[$j]['nom'];
            $kAB = ($a < $b) ? $a . '||' . $b : $b . '||' . $a;
            if (!isset($pairesExistantes[$kAB])) {
                $jamaisEnsemble[] = ['perso_a' => $a, 'perso_b' => $b];
            }
        }
    }

    // ── par_episode_scenes : détail des scènes par épisode (pour Densité et Timeline) ──
    // On extrait les scènes depuis stats_json déjà stocké par analyserTexte().
    // Chaque entrée : { episode_id, label, titre, scenes: [{ persos[], repliques, mots }] }
    $parEpisodeScenes = [];
    foreach ($episodes as $ep) {
        $epId  = $ep['id'];
        $st    = $statsMap[$epId] ?? null;
        if (!$st) continue;

        $storedScenes = $statsScenesByEpisode[(int)$epId] ?? [];
        if (empty($storedScenes)) continue;

        $scenes = [];
        foreach ($storedScenes as $sc) {
            // Résoudre les noms parsés vers les noms DB (même logique que les récurrences)
            $persosDB = [];
            foreach ($sc['persos'] ?? [] as $nomParse) {
                $resolved = $resolveNomParse($nomParse);
                $persosDB[] = $resolved ?? $nomParse;
            }
            // sc['repliques'] est stocké comme [nom => nb] — on somme pour obtenir un total entier
            $nbRepliques = is_array($sc['repliques'] ?? null)
                ? (int)array_sum($sc['repliques'])
                : (int)($sc['repliques'] ?? 0);
            $scenes[] = [
                'persos'    => array_values(array_unique($persosDB)),
                'repliques' => $nbRepliques,
                'mots'      => (int)($sc['mots'] ?? 0),
            ];
        }

        if (empty($scenes)) continue;

        $epCode = 'S' . $ep['saison_numero'] . 'E' . str_pad($ep['numero_episode'], 2, '0', STR_PAD_LEFT);
        $parEpisodeScenes[] = [
            'episode_id' => $epId,
            'label'      => $epCode . ($ep['titre'] ? ' — ' . $ep['titre'] : ''),
            'titre'      => $ep['titre'] ?? null,
            'scenes'     => $scenes,
        ];
    }

    // ── top_mots : fréquence des mots dans les textes uploadés des épisodes sélectionnés ──
    // On lit texte_episode directement depuis la table episodes (stocké par handleUpload).
    $stopwords = array_flip([
        // Articles, pronoms, prépositions
        'le','la','les','un','une','des','du','de','d','l','a','au','aux','en','et','ou',
        'mais','donc','or','ni','car','que','qui','quoi','dont','se','si','je','tu','il','elle',
        'nous','vous','ils','elles','me','te','lui','y','on','mon','ma','mes','ton','ta','tes',
        'son','sa','ses','notre','votre','leur','leurs','ce','cet','cette','ces','ca','c','j',
        'n','m','s','qu','ne','pas','plus','tres','bien','tout','tous','toute','toutes',
        'par','pour','sur','sous','dans','avec','sans','entre','vers','chez','apres','avant','contre',
        'meme','aussi','alors','encore','puis','deja','non','oui','ah','oh','eh','hm','bon','ben',
        'la','ici','ainsi','peu','trop','moins','comme','quand','comment','pourquoi','parce',
        'voila','va','allons','allez',
        // Pronoms et mots grammaticaux supplémentaires
        'moi','toi','soi','eux','maintenant','jamais','toujours','souvent','parfois',
        'quelque','quelques','plusieurs','chaque','quel','quelle',
        'tant','autant','assez','environ',
        'non','oui','bah','euh','hein',
        // Mots parasites de script (indications techniques et anglicismes formatage)
        'pause','string','uuid','window','name','type','gender','revision',
        'int','ext','you','the','and','for','this','that','with',
    ]);

    // Construire la liste normalisée de tous les noms/prénoms/noms d'affichage de personnages à exclure
    $nomsPersoExclus = [];
    foreach ($tousPersonnages as $p) {
        foreach (['prenom','nom','nom_affichage'] as $champ) {
            if (!empty($p[$champ])) {
                $nomsPersoExclus[] = $norm($p[$champ]); // $norm déjà défini plus haut
            }
        }
    }
    $nomsPersoExclus = array_flip(array_filter($nomsPersoExclus));

    // Seul ce que disent les personnages compte : ni didascalies, ni noms, ni métadonnées
    $freqMots = [];
    $texteStmt = $db->prepare("SELECT texte_episode FROM episodes WHERE id = ? AND texte_episode IS NOT NULL");
    foreach ($ids as $epId) {
        $texteStmt->execute([$epId]);
        $row = $texteStmt->fetch();
        if (!$row || !$row['texte_episode']) continue;

        $texte = mb_strtolower(texteDesRepliques($row['texte_episode']), 'UTF-8');
        $texte = str_replace(
            ['é','è','ê','ë','à','â','ä','î','ï','ô','ö','ù','û','ü','ç','œ','æ'],
            ['e','e','e','e','a','a','a','i','i','o','o','u','u','u','c','oe','ae'],
            $texte
        );
        $texte = preg_replace('/[^a-z\s\-\']/u', ' ', $texte);
        $mots  = preg_split('/[\s\-\']+/u', $texte, -1, PREG_SPLIT_NO_EMPTY);

        foreach ($mots as $mot) {
            $mot = trim($mot, "-'");
            if (mb_strlen($mot) < 3) continue;
            if (isset($stopwords[$mot])) continue;
            // Exclure les noms de personnages (prénoms, noms, noms d'affichage)
            if (isset($nomsPersoExclus[$mot])) continue;
            $freqMots[$mot] = ($freqMots[$mot] ?? 0) + 1;
        }
    }

    // Verbes conjugués — stopwords optionnels (toggle côté JS)
    $stopwordsVerbes = array_flip([
        'etre','avoir','est','sont','etait','etaient','sera','serait','serais','serons','seront',
        'ai','as','avons','avez','ont','avait','avaient','aura','aurait','aurais','aurons','auront',
        'eu','eue','ete',
        'fait','fais','faire','dit','dis','dire',
        'vois','voit','voyons','voyez','voient','voir',
        'veux','veut','vouloir','voulais','voulait','voulez','voulons','veulent',
        'suis','sais','sait','savoir','savais','savait',
        'peux','peut','pouvoir','pouvais','pouvait','pouvez','peuvent',
        'dois','doit','devoir','devais','devait','devez','doivent',
        'vais','vas','vont','allais','allait',
        'faut','falloir',
        'crois','croit','croire','croyais','croyait',
        'viens','vient','venir','venais','venait',
        'suis','suit','suivre',
        'avais','avait','avez','avons','aurai','aurez',
        'etais','etait','etiez','etions',
        'faisais','faisait','faisiez','faisions',
        'disais','disait','disiez','disions',
    ]);

    // Trier tous les mots par fréquence décroissante
    arsort($freqMots);

    // Top 300 pour le nuage et les barres (sans/avec verbes)
    $topMotsSansVerbes = [];
    $topMotsAvecVerbes = [];
    $iSans = 0;
    $iAvec = 0;
    foreach ($freqMots as $mot => $nb) {
        if ($iSans < 300 && !isset($stopwordsVerbes[$mot])) {
            $topMotsSansVerbes[] = ['mot' => $mot, 'nb' => $nb];
            $iSans++;
        }
        if ($iAvec < 300) {
            $topMotsAvecVerbes[] = ['mot' => $mot, 'nb' => $nb];
            $iAvec++;
        }
        if ($iSans >= 300 && $iAvec >= 300) break;
    }

    // Listes complètes pour la recherche (tous les mots, sans limite)
    $allMotsSansVerbes = [];
    $allMotsAvecVerbes = [];
    foreach ($freqMots as $mot => $nb) {
        $allMotsAvecVerbes[] = ['mot' => $mot, 'nb' => $nb];
        if (!isset($stopwordsVerbes[$mot])) {
            $allMotsSansVerbes[] = ['mot' => $mot, 'nb' => $nb];
        }
    }

    echo json_encode([
        'nb_episodes'            => count($episodes),
        'total_repliques'        => $totalRepliques,
        'total_mots'             => $totalMots,
        'duree_totale'           => $duree,
        'par_personnage'         => array_values($parPersonnage),
        'par_theme'              => array_values($themeAgg),
        'avancement_moyen'       => $avgAvancement,
        'nb_pages_total'         => $totalPages,
        'nb_finals'              => $nbFinals,
        'nb_uploaded_by_saison'  => $nbUploadedBySaison,
        'total_episodes_serie'   => $totalEpisodesSerie,
        'recurrences'            => array_values($coPresence),
        'jamais_ensemble'        => $jamaisEnsemble,
        'par_episode_scenes'     => $parEpisodeScenes,
        'top_mots'               => $topMotsSansVerbes,
        'top_mots_avec_verbes'   => $topMotsAvecVerbes,
        'all_mots'               => $allMotsSansVerbes,
        'all_mots_avec_verbes'   => $allMotsAvecVerbes,
    ]);
}
// ===================== BATCH =====================

function handleBatch(PDO $db, array $body): void {
    initJournalTable($db);

    $episodeIds = array_map('intval', $body['episode_ids'] ?? []);
    $operations = $body['operations'] ?? [];

    if (empty($operations)) {
        http_response_code(400);
        echo json_encode(['error' => 'Aucune opération définie']);
        return;
    }

    // episode_ids peut être vide uniquement si toutes les opérations sont des créations
    $toutesCreations = !empty($operations) && count(array_filter($operations, fn($o) => ($o['type'] ?? '') !== 'creer_episodes')) === 0;
    if (empty($episodeIds) && !$toutesCreations) {
        http_response_code(400);
        echo json_encode(['error' => 'Aucun épisode sélectionné']);
        return;
    }

    $resultats = [];
    $erreurs   = [];

    $db->beginTransaction();
    try {
        foreach ($operations as $op) {
            $type = $op['type'] ?? '';

            switch ($type) {

                // ── Champ simple ────────────────────────────────────────────
                case 'champ_simple': {
                    $champ  = $op['champ'] ?? '';
                    $valeur = $op['valeur'] ?? null;
                    $champsAutorisés = [
                        'jet', 'etat_episode', 'avancement', 'nb_pages',
                        'code', 'date_diege', 'date_debut_ecriture', 'date_fin_ecriture',
                        'intrigue_a', 'intrigue_b', 'intrigue_c', 'resume', 'commentaires',
                    ];
                    if (!in_array($champ, $champsAutorisés)) {
                        $erreurs[] = "Champ non autorisé : $champ";
                        break;
                    }
                    foreach ($episodeIds as $epId) {
                        // Récupérer valeur avant pour le journal
                        $avStmt = $db->prepare("SELECT $champ FROM episodes WHERE id = ?");
                        $avStmt->execute([$epId]);
                        $av = $avStmt->fetchColumn();

                        $db->prepare("UPDATE episodes SET $champ = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                           ->execute([$valeur, $epId]);

                        // Journal
                        $db->prepare("INSERT INTO journal (action, categorie, entite_label, champ, valeur_avant, valeur_apres, description) VALUES (?,?,?,?,?,?,?)")
                           ->execute(['update', 'episodes', "Épisode #$epId", $champ, $av, $valeur, "Batch — $champ mis à jour"]);
                    }
                    $resultats[] = "✓ $champ mis à jour sur " . count($episodeIds) . " épisode(s)";
                    break;
                }

                // ── Dates séquentielles ─────────────────────────────────────
                case 'dates_sequentielles': {
                    $champ     = $op['champ'] ?? 'date_diege'; // date_diege | date_debut_ecriture | date_fin_ecriture
                    $dateDebut = $op['date_debut'] ?? null;
                    $pas       = max(1, (int)($op['pas_jours'] ?? 7));
                    $champsOk  = ['date_diege', 'date_debut_ecriture', 'date_fin_ecriture'];
                    if (!in_array($champ, $champsOk) || !$dateDebut) {
                        $erreurs[] = "dates_sequentielles : champ ou date_debut invalide";
                        break;
                    }
                    $dt = new DateTime($dateDebut);
                    foreach ($episodeIds as $epId) {
                        $valeur = $dt->format('Y-m-d');
                        $db->prepare("UPDATE episodes SET $champ = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                           ->execute([$valeur, $epId]);
                        $db->prepare("INSERT INTO journal (action, categorie, entite_label, champ, valeur_avant, valeur_apres, description) VALUES (?,?,?,?,?,?,?)")
                           ->execute(['update', 'episodes', "Épisode #$epId", $champ, null, $valeur, "Batch — dates séquentielles"]);
                        $dt->modify("+$pas days");
                    }
                    $resultats[] = "✓ $champ séquentielles appliquées sur " . count($episodeIds) . " épisode(s)";
                    break;
                }

                // ── Pages individuelles ─────────────────────────────────────
                case 'pages_individuelles': {
                    // $op['valeurs'] = [ [episode_id => N, nb_pages => N], ... ]
                    $valeurs = $op['valeurs'] ?? [];
                    $count = 0;
                    foreach ($valeurs as $v) {
                        $epId   = (int)($v['episode_id'] ?? 0);
                        $pages  = (int)($v['nb_pages'] ?? 0);
                        if (!in_array($epId, $episodeIds)) continue;
                        $db->prepare("UPDATE episodes SET nb_pages = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                           ->execute([$pages, $epId]);
                        $db->prepare("INSERT INTO journal (action, categorie, entite_label, champ, valeur_avant, valeur_apres, description) VALUES (?,?,?,?,?,?,?)")
                           ->execute(['update', 'episodes', "Épisode #$epId", 'nb_pages', null, $pages, "Batch — pages individuelles"]);
                        $count++;
                    }
                    $resultats[] = "✓ nb_pages mis à jour sur $count épisode(s)";
                    break;
                }

                // ── Ajouter personnage ──────────────────────────────────────
                case 'ajouter_personnage': {
                    $pId      = (int)($op['personnage_id'] ?? 0);
                    $present  = (int)($op['present'] ?? 1);
                    $repliques = (int)($op['nb_repliques'] ?? 0);
                    if (!$pId) { $erreurs[] = "ajouter_personnage : personnage_id manquant"; break; }
                    foreach ($episodeIds as $epId) {
                        // Upsert : supprimer l'existant puis réinsérer
                        $db->prepare("DELETE FROM episode_personnages WHERE episode_id = ? AND personnage_id = ?")
                           ->execute([$epId, $pId]);
                        $db->prepare("INSERT INTO episode_personnages (episode_id, personnage_id, present, nb_repliques) VALUES (?,?,?,?)")
                           ->execute([$epId, $pId, $present, $repliques]);
                    }
                    $resultats[] = "✓ Personnage #$pId ajouté sur " . count($episodeIds) . " épisode(s)";
                    break;
                }

                // ── Retirer personnage ──────────────────────────────────────
                case 'retirer_personnage': {
                    $pId = (int)($op['personnage_id'] ?? 0);
                    if (!$pId) { $erreurs[] = "retirer_personnage : personnage_id manquant"; break; }
                    $placeholders = implode(',', array_fill(0, count($episodeIds), '?'));
                    $params = array_merge([$pId], $episodeIds);
                    $db->prepare("DELETE FROM episode_personnages WHERE personnage_id = ? AND episode_id IN ($placeholders)")
                       ->execute($params);
                    $resultats[] = "✓ Personnage #$pId retiré de " . count($episodeIds) . " épisode(s)";
                    break;
                }

                // ── Ajouter lieu ────────────────────────────────────────────
                case 'ajouter_lieu': {
                    $lId    = (int)($op['lieu_id'] ?? 0);
                    $statut = $op['statut'] ?? 'present';
                    if (!$lId) { $erreurs[] = "ajouter_lieu : lieu_id manquant"; break; }
                    foreach ($episodeIds as $epId) {
                        $db->prepare("DELETE FROM episode_lieux WHERE episode_id = ? AND lieu_id = ?")
                           ->execute([$epId, $lId]);
                        $db->prepare("INSERT INTO episode_lieux (episode_id, lieu_id, statut) VALUES (?,?,?)")
                           ->execute([$epId, $lId, $statut]);
                    }
                    $resultats[] = "✓ Lieu #$lId ajouté sur " . count($episodeIds) . " épisode(s)";
                    break;
                }

                // ── Retirer lieu ────────────────────────────────────────────
                case 'retirer_lieu': {
                    $lId = (int)($op['lieu_id'] ?? 0);
                    if (!$lId) { $erreurs[] = "retirer_lieu : lieu_id manquant"; break; }
                    $placeholders = implode(',', array_fill(0, count($episodeIds), '?'));
                    $params = array_merge([$lId], $episodeIds);
                    $db->prepare("DELETE FROM episode_lieux WHERE lieu_id = ? AND episode_id IN ($placeholders)")
                       ->execute($params);
                    $resultats[] = "✓ Lieu #$lId retiré de " . count($episodeIds) . " épisode(s)";
                    break;
                }

                // ── Ajouter thème ───────────────────────────────────────────
                case 'ajouter_theme': {
                    $tId      = (int)($op['theme_id'] ?? 0);
                    $intensite = $op['intensite'] ?? 'mention';
                    if (!$tId) { $erreurs[] = "ajouter_theme : theme_id manquant"; break; }
                    foreach ($episodeIds as $epId) {
                        $db->prepare("DELETE FROM episode_themes WHERE episode_id = ? AND theme_id = ?")
                           ->execute([$epId, $tId]);
                        $db->prepare("INSERT INTO episode_themes (episode_id, theme_id, intensite) VALUES (?,?,?)")
                           ->execute([$epId, $tId, $intensite]);
                    }
                    $resultats[] = "✓ Thème #$tId ajouté sur " . count($episodeIds) . " épisode(s)";
                    break;
                }

                // ── Retirer thème ───────────────────────────────────────────
                case 'retirer_theme': {
                    $tId = (int)($op['theme_id'] ?? 0);
                    if (!$tId) { $erreurs[] = "retirer_theme : theme_id manquant"; break; }
                    $placeholders = implode(',', array_fill(0, count($episodeIds), '?'));
                    $params = array_merge([$tId], $episodeIds);
                    $db->prepare("DELETE FROM episode_themes WHERE theme_id = ? AND episode_id IN ($placeholders)")
                       ->execute($params);
                    $resultats[] = "✓ Thème #$tId retiré de " . count($episodeIds) . " épisode(s)";
                    break;
                }

                // ── Créer épisodes ─────────────────────────────────────
                case 'creer_episodes': {
                    $saisonId = (int)($op['saison_id'] ?? 0);
                    $epDebut  = (int)($op['ep_debut']  ?? 0);
                    $epFin    = (int)($op['ep_fin']    ?? 0);
                    if (!$saisonId || !$epDebut || !$epFin || $epDebut > $epFin) {
                        $erreurs[] = "creer_episodes : paramètres invalides";
                        break;
                    }
                    $created = 0;
                    $skipped = 0;
                    for ($num = $epDebut; $num <= $epFin; $num++) {
                        // Vérifier doublon
                        $stCheck = $db->prepare("SELECT COUNT(*) FROM episodes WHERE saison_id = ? AND numero_episode = ?");
                        $stCheck->execute([$saisonId, $num]);
                        if ((int)$stCheck->fetchColumn() > 0) { $skipped++; continue; }
                        $stIns = $db->prepare("
                            INSERT INTO episodes (saison_id, numero_episode, jet, avancement, nb_pages)
                            VALUES (?, ?, '1er jet', 0, 0)
                        ");
                        $stIns->execute([$saisonId, $num]);
                        $newId = (int)$db->lastInsertId();
                        $db->prepare("INSERT INTO journal (action, categorie, entite_label, champ, valeur_avant, valeur_apres, description) VALUES (?,?,?,?,?,?,?)")
                           ->execute(['create', 'episodes', "Épisode S{$saisonId}E{$num}", null, null, null, "Batch — création en masse"]);
                        $created++;
                    }
                    $msg = "✓ $created épisode(s) créé(s)";
                    if ($skipped) $msg .= " ($skipped ignoré(s), déjà existants)";
                    $resultats[] = $msg;
                    break;
                }

                default:
                    $erreurs[] = "Type d'opération inconnu : $type";
            }
        }

        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
        return;
    }

    echo json_encode([
        'ok'        => empty($erreurs),
        'resultats' => $resultats,
        'erreurs'   => $erreurs,
        'nb_episodes' => count($episodeIds),
    ]);
}



function initJournalTable(PDO $db): void {
    $db->exec("
        CREATE TABLE IF NOT EXISTS journal (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            action TEXT NOT NULL,
            categorie TEXT NOT NULL,
            entite_label TEXT,
            champ TEXT,
            valeur_avant TEXT,
            valeur_apres TEXT,
            description TEXT NOT NULL
        )
    ");
}

function handleJournal(PDO $db, string $method, ?int $id, array $body): void {
    initJournalTable($db);

    switch ($method) {
        case 'GET':
            $rows = $db->prepare("SELECT * FROM journal ORDER BY created_at DESC");
            $rows->execute();
            echo json_encode($rows->fetchAll());
            break;

        case 'POST':
            $st = $db->prepare("
                INSERT INTO journal (action, categorie, entite_label, champ, valeur_avant, valeur_apres, description)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ");
            $st->execute([
                $body['action']        ?? 'update',
                $body['categorie']     ?? 'inconnu',
                $body['entite_label']  ?? null,
                $body['champ']         ?? null,
                $body['valeur_avant']  ?? null,
                $body['valeur_apres']  ?? null,
                $body['description']   ?? '',
            ]);
            echo json_encode(['id' => $db->lastInsertId()]);
            break;

        case 'DELETE':
            $db->exec('DELETE FROM journal');
            echo json_encode(['ok' => true]);
            break;
    }
}

// ===================== LECTEURS & RETOURS =====================

function lecteurTonalite(array $body): string {
    $tonalite = $body['tonalite'] ?? 'neutre';
    return in_array($tonalite, ['positif', 'neutre', 'negatif'], true) ? $tonalite : 'neutre';
}

function lecteurPriorite(array $body): string {
    $priorites = ['Très prioritaire', 'Prioritaire', 'Peu prioritaire', 'Pas prioritaire', 'Peut-être', 'À voir', 'Non'];
    $priorite = trim(texteCorps($body['priorite'] ?? 'À voir'));
    return in_array($priorite, $priorites, true) ? $priorite : 'À voir';
}

function getLecteurDetail(PDO $db, int $lecteurId): ?array {
    $st = $db->prepare('SELECT * FROM lecteurs WHERE id = ?');
    $st->execute([$lecteurId]);
    $lecteur = $st->fetch();
    if (!$lecteur) return null;

    $eps = $db->prepare("SELECT le.*, e.titre, e.numero_episode, s.numero AS saison_numero
        FROM lecteur_episodes le
        JOIN episodes e ON e.id = le.episode_id
        JOIN saisons s ON s.id = e.saison_id
        WHERE le.lecteur_id = ?
        ORDER BY s.numero, e.numero_episode");
    $eps->execute([$lecteurId]);
    $lecteur['episodes'] = $eps->fetchAll();
    foreach ($lecteur['episodes'] as &$episode) {
        $critiques = $db->prepare('SELECT * FROM lecteur_episode_critiques WHERE lecteur_id = ? AND episode_id = ? ORDER BY id DESC');
        $critiques->execute([$lecteurId, $episode['episode_id']]);
        $episode['critiques'] = $critiques->fetchAll();
    }
    unset($episode);

    $critiques = $db->prepare('SELECT * FROM lecteur_critiques_generales WHERE lecteur_id = ? ORDER BY id DESC');
    $critiques->execute([$lecteurId]);
    $lecteur['critiques_generales'] = $critiques->fetchAll();
    return $lecteur;
}

function handleLecteurs(PDO $db, string $method, array $parts, array $body): void {
    if (($parts[1] ?? null) === 'ordre' && $method === 'PUT') {
        $ids = $body['ids'] ?? [];
        if (!is_array($ids)) { http_response_code(422); echo json_encode(['error' => 'Ordre invalide']); return; }
        $update = $db->prepare('UPDATE lecteurs SET ordre = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        $db->beginTransaction();
        try {
            foreach (array_values($ids) as $ordre => $id) {
                if (!is_numeric($id)) continue;
                $update->execute([$ordre + 1, (int)$id]);
            }
            $db->commit();
        } catch (Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        echo json_encode(['ok' => true]);
        return;
    }

    $lecteurId = isset($parts[1]) && is_numeric($parts[1]) ? (int)$parts[1] : null;
    $section = $parts[2] ?? null;

    if (!$lecteurId) {
        if ($method === 'GET') {
            echo json_encode($db->query("SELECT l.*, COUNT(le.episode_id) AS nb_episodes, ROUND(AVG(le.note), 1) AS note_moyenne
                FROM lecteurs l LEFT JOIN lecteur_episodes le ON le.lecteur_id = l.id
                GROUP BY l.id ORDER BY l.ordre ASC, l.nom COLLATE NOCASE")->fetchAll());
            return;
        }
        if ($method === 'POST') {
            $nom = trim(texteCorps($body['nom'] ?? ''));
            if ($nom === '') { http_response_code(422); echo json_encode(['error' => 'Le nom est obligatoire']); return; }
            $priorite = lecteurPriorite($body);
            $ordre = (int)$db->query('SELECT COALESCE(MAX(ordre), 0) + 1 FROM lecteurs')->fetchColumn();
            $st = $db->prepare('INSERT INTO lecteurs (nom, email, telephone, est_prioritaire, priorite, ordre) VALUES (?, ?, ?, ?, ?, ?)');
            $st->execute([$nom, trim(texteCorps($body['email'] ?? '')) ?: null, trim(texteCorps($body['telephone'] ?? '')) ?: null, in_array($priorite, ['Très prioritaire', 'Prioritaire'], true) ? 1 : 0, $priorite, $ordre]);
            echo json_encode(['id' => $db->lastInsertId()]);
            return;
        }
    }

    if (!$lecteurId) { http_response_code(404); echo json_encode(['error' => 'Lecteur introuvable']); return; }

    if ($section === null) {
        if ($method === 'GET') {
            $lecteur = getLecteurDetail($db, $lecteurId);
            if (!$lecteur) { http_response_code(404); echo json_encode(['error' => 'Lecteur introuvable']); return; }
            echo json_encode($lecteur);
        } elseif ($method === 'PUT') {
            $priorite = lecteurPriorite($body);
            $st = $db->prepare('UPDATE lecteurs SET nom = ?, email = ?, telephone = ?, est_prioritaire = ?, priorite = ?, note_generale = ?, commentaire_general = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
            $st->execute([
                trim(texteCorps($body['nom'] ?? '')),
                trim(texteCorps($body['email'] ?? '')) ?: null,
                trim(texteCorps($body['telephone'] ?? '')) ?: null,
                in_array($priorite, ['Très prioritaire', 'Prioritaire'], true) ? 1 : 0,
                $priorite,
                ($body['note_generale'] ?? '') !== '' ? (float)$body['note_generale'] : null,
                $body['commentaire_general'] ?? null,
                $lecteurId,
            ]);
            echo json_encode(['ok' => true]);
        } elseif ($method === 'DELETE') {
            $db->prepare('DELETE FROM lecteurs WHERE id = ?')->execute([$lecteurId]);
            echo json_encode(['ok' => true]);
        }
        return;
    }

    if ($section === 'critiques') {
        $critiqueId = isset($parts[3]) && is_numeric($parts[3]) ? (int)$parts[3] : null;
        if ($method === 'POST') {
            $st = $db->prepare('INSERT INTO lecteur_critiques_generales (lecteur_id, critere, tonalite, commentaire) VALUES (?, ?, ?, ?)');
            $st->execute([$lecteurId, trim(texteCorps($body['critere'] ?? 'Général')) ?: 'Général', lecteurTonalite($body), trim(texteCorps($body['commentaire'] ?? '')) ?: null]);
            echo json_encode(['id' => $db->lastInsertId()]);
        } elseif ($method === 'DELETE' && $critiqueId) {
            $db->prepare('DELETE FROM lecteur_critiques_generales WHERE id = ? AND lecteur_id = ?')->execute([$critiqueId, $lecteurId]);
            echo json_encode(['ok' => true]);
        }
        return;
    }

    if ($section !== 'episodes') { http_response_code(404); echo json_encode(['error' => 'Section inconnue']); return; }
    $episodeId = isset($parts[3]) && is_numeric($parts[3]) ? (int)$parts[3] : null;
    $nested = $parts[4] ?? null;

    if ($nested === 'critiques' && $episodeId) {
        $critiqueId = isset($parts[5]) && is_numeric($parts[5]) ? (int)$parts[5] : null;
        if ($method === 'POST') {
            $st = $db->prepare('INSERT INTO lecteur_episode_critiques (lecteur_id, episode_id, critere, tonalite, commentaire) VALUES (?, ?, ?, ?, ?)');
            $st->execute([$lecteurId, $episodeId, trim(texteCorps($body['critere'] ?? 'Général')) ?: 'Général', lecteurTonalite($body), trim(texteCorps($body['commentaire'] ?? '')) ?: null]);
            echo json_encode(['id' => $db->lastInsertId()]);
        } elseif ($method === 'DELETE' && $critiqueId) {
            $db->prepare('DELETE FROM lecteur_episode_critiques WHERE id = ? AND lecteur_id = ? AND episode_id = ?')->execute([$critiqueId, $lecteurId, $episodeId]);
            echo json_encode(['ok' => true]);
        }
        return;
    }

    if ($method === 'POST' && !$episodeId) {
        $episodeId = (int)($body['episode_id'] ?? 0);
        if (!$episodeId) { http_response_code(422); echo json_encode(['error' => 'Épisode obligatoire']); return; }
        $st = $db->prepare('INSERT INTO lecteur_episodes (lecteur_id, episode_id, envoye_le, note, commentaire) VALUES (?, ?, ?, ?, ?) ON CONFLICT(lecteur_id, episode_id) DO UPDATE SET envoye_le=excluded.envoye_le, note=excluded.note, commentaire=excluded.commentaire, updated_at=CURRENT_TIMESTAMP');
        $st->execute([$lecteurId, $episodeId, $body['envoye_le'] ?? date('Y-m-d'), ($body['note'] ?? '') !== '' ? (float)$body['note'] : null, trim(texteCorps($body['commentaire'] ?? '')) ?: null]);
        echo json_encode(['ok' => true]);
    } elseif ($method === 'PUT' && $episodeId) {
        $st = $db->prepare('UPDATE lecteur_episodes SET envoye_le = ?, note = ?, commentaire = ?, updated_at = CURRENT_TIMESTAMP WHERE lecteur_id = ? AND episode_id = ?');
        $st->execute([$body['envoye_le'] ?? null, ($body['note'] ?? '') !== '' ? (float)$body['note'] : null, trim(texteCorps($body['commentaire'] ?? '')) ?: null, $lecteurId, $episodeId]);
        echo json_encode(['ok' => true]);
    } elseif ($method === 'DELETE' && $episodeId) {
        $db->prepare('DELETE FROM lecteur_episodes WHERE lecteur_id = ? AND episode_id = ?')->execute([$lecteurId, $episodeId]);
        echo json_encode(['ok' => true]);
    }
}
