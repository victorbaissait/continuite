<?php
// api/db.php — Connexion et initialisation de la base SQLite

function getDB(): PDO {
    $pdo = new PDO('sqlite:' . DB_PATH);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    // Plusieurs requêtes arrivent ensemble (l'app de bureau en traite plusieurs à la fois) : on attend son tour
    $pdo->exec('PRAGMA busy_timeout = 5000');
    $pdo->exec('PRAGMA foreign_keys = ON');

    mettreAJourSchema($pdo, DB_PATH);
    return $pdo;
}

// L'empreinte du code qui décrit la base : quand un fichier de l'API change, les migrations repassent une fois
function versionSchema(): string {
    static $v = null;
    if ($v === null) {
        $t = '';
        foreach (glob(__DIR__ . '/*.php') ?: [] as $f) $t .= basename($f) . filemtime($f) . filesize($f);
        $v = md5($t);
    }
    return $v;
}

// Structure et migrations : une seule fois par version du code, et un seul processus à la fois.
// Avant, elles tournaient à chaque requête : deux requêtes simultanées ajoutaient la même colonne ensemble.
function mettreAJourSchema(PDO $pdo, string $chemin): void {
    $aJour = function () use ($pdo): bool {
        try { return $pdo->query("SELECT value FROM app_meta WHERE key = 'schema_version'")->fetchColumn() === versionSchema(); }
        catch (Throwable $e) { return false; }
    };
    if ($aJour()) return;
    $verrou = fopen($chemin . '.verrou', 'c');
    if ($verrou) flock($verrou, LOCK_EX);
    try {
        if ($aJour()) return;
        // Le mode WAL reste acquis une fois posé ; deux processus qui le posent ensemble se gênent
        $pdo->exec('PRAGMA journal_mode = WAL');
        // Une base neuve se reconnaît à ses tables, pas à son fichier : la liste des projets peut avoir créé un fichier vide
        preparerSchema($pdo);
        migrateSchema($pdo);
        // Les structures que les routes ajoutaient elles-mêmes, à chaque requête : ici une seule fois
        foreach (['ensureEpisodesSchema', 'ensureFriseSchema', 'ensurePersonnageEditorialSchema', 'ensureBibleNotes', 'ensurePromessesNarratives', 'ensureAnalyseNotes', 'ensureStatsTablesBackfilled'] as $f) {
            if (function_exists($f)) $f($pdo);
        }
        $pdo->exec('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)');
        $pdo->prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_version', ?)")->execute([versionSchema()]);
    } finally {
        if ($verrou) { flock($verrou, LOCK_UN); fclose($verrou); }
    }
}

function migrateSchema(PDO $pdo): void {
    // lieux : est_principal + nom_affichage + première apparition
    $cols = array_column($pdo->query("PRAGMA table_info(lieux)")->fetchAll(PDO::FETCH_ASSOC), 'name');
    if (!in_array('est_principal', $cols))  $pdo->exec("ALTER TABLE lieux ADD COLUMN est_principal INTEGER DEFAULT 0");
    if (!in_array('nom_affichage', $cols))  $pdo->exec("ALTER TABLE lieux ADD COLUMN nom_affichage TEXT");
    $colsE = array_column($pdo->query("PRAGMA table_info(episodes)")->fetchAll(PDO::FETCH_ASSOC), 'name');
    // Colonnes ajoutées à la main sur les premières bases : une base neuve les reçoit aussi
    foreach (['titre_fr' => 'TEXT', 'resume' => 'TEXT'] as $colonne => $type) {
        if (!in_array($colonne, $colsE)) $pdo->exec("ALTER TABLE episodes ADD COLUMN $colonne $type");
    }
    foreach (['etat_episode' => 'TEXT DEFAULT NULL', 'date_debut_ecriture' => 'TEXT DEFAULT NULL', 'date_debut_qual' => "TEXT DEFAULT 'exacte'", 'date_fin_ecriture' => 'TEXT DEFAULT NULL', 'date_fin_qual' => "TEXT DEFAULT 'exacte'"] as $colonne => $type) {
        if (!in_array($colonne, $colsE)) $pdo->exec("ALTER TABLE episodes ADD COLUMN $colonne $type");
    }

    if (!in_array('premiere_apparition_episode_id', $cols))  $pdo->exec("ALTER TABLE lieux ADD COLUMN premiere_apparition_episode_id INTEGER DEFAULT NULL REFERENCES episodes(id) ON DELETE SET NULL");

    // personnages : nom_affichage
    $colsP = array_column($pdo->query("PRAGMA table_info(personnages)")->fetchAll(PDO::FETCH_ASSOC), 'name');
    if (!in_array('nom_affichage', $colsP)) $pdo->exec("ALTER TABLE personnages ADD COLUMN nom_affichage TEXT");
    if (!in_array('est_recurrent', $colsP)) $pdo->exec("ALTER TABLE personnages ADD COLUMN est_recurrent INTEGER DEFAULT 0");

    ensureStatsTables($pdo);
    ensureLecteursTables($pdo);
    ensureNomsRegles($pdo);
    ensureAnalyseNotes($pdo);
    $pdo->exec('
        CREATE TABLE IF NOT EXISTS episode_intrigues (
            episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
            lettre TEXT NOT NULL,
            texte TEXT NOT NULL,
            PRIMARY KEY (episode_id, lettre)
        )
    ');
    ensureIndexes($pdo);
}

function ensureLecteursTables(PDO $pdo): void {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS lecteurs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT NOT NULL,
            email TEXT,
            telephone TEXT,
            est_prioritaire INTEGER NOT NULL DEFAULT 0,
            priorite TEXT NOT NULL DEFAULT 'À voir',
            ordre INTEGER NOT NULL DEFAULT 0,
            note_generale REAL,
            commentaire_general TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS lecteur_episodes (
            lecteur_id INTEGER NOT NULL REFERENCES lecteurs(id) ON DELETE CASCADE,
            episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
            envoye_le TEXT DEFAULT CURRENT_DATE,
            note REAL,
            commentaire TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (lecteur_id, episode_id)
        );

        CREATE TABLE IF NOT EXISTS lecteur_episode_critiques (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lecteur_id INTEGER NOT NULL REFERENCES lecteurs(id) ON DELETE CASCADE,
            episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
            critere TEXT NOT NULL,
            tonalite TEXT NOT NULL CHECK(tonalite IN ('positif', 'neutre', 'negatif')),
            commentaire TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS lecteur_critiques_generales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lecteur_id INTEGER NOT NULL REFERENCES lecteurs(id) ON DELETE CASCADE,
            critere TEXT NOT NULL,
            tonalite TEXT NOT NULL CHECK(tonalite IN ('positif', 'neutre', 'negatif')),
            commentaire TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    $cols = array_column($pdo->query("PRAGMA table_info(lecteurs)")->fetchAll(PDO::FETCH_ASSOC), 'name');
    if (!in_array('telephone', $cols)) $pdo->exec("ALTER TABLE lecteurs ADD COLUMN telephone TEXT");
    if (!in_array('priorite', $cols)) {
        $pdo->exec("ALTER TABLE lecteurs ADD COLUMN priorite TEXT NOT NULL DEFAULT 'À voir'");
        $pdo->exec("UPDATE lecteurs SET priorite = CASE WHEN est_prioritaire = 1 THEN 'Prioritaire' ELSE 'À voir' END");
    }
    if (!in_array('ordre', $cols)) $pdo->exec("ALTER TABLE lecteurs ADD COLUMN ordre INTEGER NOT NULL DEFAULT 0");
    // L'empreinte du script envoyé : pour savoir s'il a changé depuis que le lecteur l'a reçu
    $colsEp = array_column($pdo->query("PRAGMA table_info(lecteur_episodes)")->fetchAll(PDO::FETCH_ASSOC), 'name');
    if (!in_array('empreinte', $colsEp)) $pdo->exec("ALTER TABLE lecteur_episodes ADD COLUMN empreinte TEXT");
}

function ensureStatsTables(PDO $pdo): void {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS episode_stat_personnages (
            episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
            nom TEXT NOT NULL,
            nb_repliques INTEGER DEFAULT 0,
            nb_mots INTEGER DEFAULT 0,
            type TEXT,
            PRIMARY KEY (episode_id, nom)
        );

        CREATE TABLE IF NOT EXISTS episode_stat_lieux (
            episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
            lieu_id INTEGER NOT NULL REFERENCES lieux(id) ON DELETE CASCADE,
            nom TEXT,
            nb_scenes INTEGER DEFAULT 0,
            nb_repliques INTEGER DEFAULT 0,
            nb_mots INTEGER DEFAULT 0,
            duree_min INTEGER DEFAULT 0,
            personnages_json TEXT,
            PRIMARY KEY (episode_id, lieu_id)
        );

        CREATE TABLE IF NOT EXISTS episode_stat_scenes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
            scene_index INTEGER NOT NULL,
            lieu_raw TEXT,
            slugline TEXT,
            nb_mots INTEGER DEFAULT 0,
            nb_repliques INTEGER DEFAULT 0,
            persos_json TEXT,
            repliques_json TEXT,
            lieux_detectes_json TEXT,
            UNIQUE (episode_id, scene_index)
        );

        CREATE TABLE IF NOT EXISTS episode_stat_copresences (
            episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
            type TEXT NOT NULL DEFAULT 'personnages',
            taille INTEGER NOT NULL,
            cle TEXT NOT NULL,
            membres_json TEXT,
            nb_scenes INTEGER DEFAULT 0,
            nb_repliques INTEGER DEFAULT 0,
            PRIMARY KEY (episode_id, type, taille, cle)
        );
    ");
}

function ensureIndexes(PDO $pdo): void {
    $indexes = [
        'CREATE INDEX IF NOT EXISTS idx_saisons_numero ON saisons(numero)',
        'CREATE INDEX IF NOT EXISTS idx_episodes_saison_numero ON episodes(saison_id, numero_episode)',
        'CREATE INDEX IF NOT EXISTS idx_episode_personnages_personnage ON episode_personnages(personnage_id, episode_id)',
        'CREATE INDEX IF NOT EXISTS idx_episode_personnages_present ON episode_personnages(episode_id, present)',
        'CREATE INDEX IF NOT EXISTS idx_episode_extras_episode ON episode_extras(episode_id)',
        'CREATE INDEX IF NOT EXISTS idx_episode_lieux_lieu ON episode_lieux(lieu_id, episode_id)',
        'CREATE INDEX IF NOT EXISTS idx_episode_lieux_statut ON episode_lieux(statut, lieu_id)',
        'CREATE INDEX IF NOT EXISTS idx_episode_themes_theme ON episode_themes(theme_id, episode_id)',
        'CREATE INDEX IF NOT EXISTS idx_relations_personnage ON relations(personnage_id)',
        'CREATE INDEX IF NOT EXISTS idx_relations_autre ON relations(autre_id)',
        'CREATE INDEX IF NOT EXISTS idx_episode_stats_analysed ON episode_stats(analysed_at)',
        'CREATE INDEX IF NOT EXISTS idx_episode_stat_personnages_nom ON episode_stat_personnages(nom)',
        'CREATE INDEX IF NOT EXISTS idx_episode_stat_lieux_lieu ON episode_stat_lieux(lieu_id, episode_id)',
        'CREATE INDEX IF NOT EXISTS idx_episode_stat_scenes_episode ON episode_stat_scenes(episode_id, scene_index)',
        'CREATE INDEX IF NOT EXISTS idx_episode_stat_copresences_key ON episode_stat_copresences(type, taille, cle)',
        'CREATE INDEX IF NOT EXISTS idx_lieux_premiere_apparition ON lieux(premiere_apparition_episode_id)',
        'CREATE INDEX IF NOT EXISTS idx_lieux_principal ON lieux(est_principal)',
        'CREATE INDEX IF NOT EXISTS idx_personnages_principal ON personnages(est_principal)',
        'CREATE INDEX IF NOT EXISTS idx_themes_nom ON themes(nom)',
        'CREATE INDEX IF NOT EXISTS idx_episode_plages_episode ON episode_plages(episode_id)',
        'CREATE INDEX IF NOT EXISTS idx_episode_liens_episode ON episode_liens(episode_id)',
        'CREATE INDEX IF NOT EXISTS idx_episode_liens_lie ON episode_liens(episode_lie_id)',
        'CREATE INDEX IF NOT EXISTS idx_episode_mentions_episode ON episode_mentions(episode_id)',
        'CREATE INDEX IF NOT EXISTS idx_episode_mentions_mentionne ON episode_mentions(episode_mentionne_id)',
        'CREATE INDEX IF NOT EXISTS idx_personnage_moments_personnage ON personnage_moments_decisifs(personnage_id, episode_id)',
        'CREATE INDEX IF NOT EXISTS idx_personnage_signatures_personnage ON personnage_signatures(personnage_id, episode_id)',
        'CREATE INDEX IF NOT EXISTS idx_bible_notes_saison ON bible_notes(saison_id)',
        'CREATE INDEX IF NOT EXISTS idx_promesses_source ON promesses_narratives(episode_source_id)',
        'CREATE INDEX IF NOT EXISTS idx_promesse_episodes_promesse ON promesse_episodes(promesse_id)',
        'CREATE INDEX IF NOT EXISTS idx_promesse_episodes_episode ON promesse_episodes(episode_id)',
        'CREATE INDEX IF NOT EXISTS idx_journal_created ON journal(created_at)',
        'CREATE INDEX IF NOT EXISTS idx_lecteurs_priorite ON lecteurs(est_prioritaire)',
        'CREATE INDEX IF NOT EXISTS idx_lecteurs_ordre ON lecteurs(ordre)',
        'CREATE INDEX IF NOT EXISTS idx_lecteur_episodes_episode ON lecteur_episodes(episode_id)',
        'CREATE INDEX IF NOT EXISTS idx_lecteur_episode_critiques ON lecteur_episode_critiques(lecteur_id, episode_id)',
        'CREATE INDEX IF NOT EXISTS idx_lecteur_critiques_generales ON lecteur_critiques_generales(lecteur_id)',
    ];

    foreach ($indexes as $sql) {
        try {
            $pdo->exec($sql);
        } catch (Throwable $e) {
            // Certaines tables sont créées à la première utilisation de leur module
            if (!str_contains($e->getMessage(), 'no such table')) error_log("Index non créé : {$e->getMessage()}");
        }
    }
}

// La structure d'une base neuve, créée une seule fois même si plusieurs requêtes arrivent en même temps
function preparerSchema(PDO $pdo): void {
    $existe = fn() => (bool)$pdo->query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'episodes'")->fetchColumn();
    if ($existe()) return;
    $pdo->exec('BEGIN IMMEDIATE');
    try {
        if (!$existe()) initSchema($pdo);
        $pdo->exec('COMMIT');
    } catch (Throwable $e) {
        $pdo->exec('ROLLBACK');
        throw $e;
    }
}

function initSchema(PDO $pdo): void {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS saisons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero INTEGER NOT NULL,
            nom TEXT,
            couleur TEXT DEFAULT '#e74c3c',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS episodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            saison_id INTEGER NOT NULL REFERENCES saisons(id) ON DELETE CASCADE,
            numero_episode INTEGER NOT NULL,
            titre TEXT,
            date_diege DATE,
            code TEXT,
            jet TEXT DEFAULT '1er jet',
            avancement INTEGER DEFAULT 0,
            nb_pages INTEGER DEFAULT 0,
            intrigue_a TEXT,
            intrigue_b TEXT,
            intrigue_c TEXT,
            faux_site_web TEXT,
            commentaires TEXT,
            lieux_autres TEXT,
            texte_episode TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS personnages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prenom TEXT NOT NULL,
            nom TEXT,
            couleur_identite TEXT DEFAULT '#888888',
            est_principal INTEGER DEFAULT 0,
            sexe TEXT,
            age INTEGER,
            date_naissance DATE,
            profession TEXT,
            caracteristiques TEXT,
            nom_affichage TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS relations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            personnage_id INTEGER NOT NULL REFERENCES personnages(id) ON DELETE CASCADE,
            autre_id INTEGER NOT NULL REFERENCES personnages(id) ON DELETE CASCADE,
            type_relation TEXT,
            description TEXT
        );

        CREATE TABLE IF NOT EXISTS lieux (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT NOT NULL,
            description TEXT,
            est_principal INTEGER DEFAULT 0,
            nom_affichage TEXT,
            premiere_apparition_episode_id INTEGER DEFAULT NULL REFERENCES episodes(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS themes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT NOT NULL,
            couleur TEXT DEFAULT '#ff6b6b',
            description TEXT
        );

        CREATE TABLE IF NOT EXISTS episode_personnages (
            episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
            personnage_id INTEGER NOT NULL REFERENCES personnages(id) ON DELETE CASCADE,
            present INTEGER DEFAULT 0,
            nb_repliques INTEGER DEFAULT 0,
            PRIMARY KEY (episode_id, personnage_id)
        );

        CREATE TABLE IF NOT EXISTS episode_extras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
            nom TEXT NOT NULL,
            nb_repliques INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS episode_lieux (
            episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
            lieu_id INTEGER NOT NULL REFERENCES lieux(id) ON DELETE CASCADE,
            statut TEXT DEFAULT 'absent',
            PRIMARY KEY (episode_id, lieu_id)
        );

        CREATE TABLE IF NOT EXISTS episode_themes (
            episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
            theme_id INTEGER NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
            intensite TEXT DEFAULT 'mention',
            PRIMARY KEY (episode_id, theme_id)
        );

        CREATE TABLE IF NOT EXISTS episode_stats (
            episode_id INTEGER PRIMARY KEY REFERENCES episodes(id) ON DELETE CASCADE,
            nb_repliques_total INTEGER DEFAULT 0,
            nb_mots INTEGER DEFAULT 0,
            duree_estimee_min INTEGER DEFAULT 0,
            stats_json TEXT,
            analysed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");
}
