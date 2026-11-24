<?php
// api/noms.php — Règles sur les noms détectés dans les scripts
//   alias   : ce nom désigne un personnage de la base
//   garder  : vrai personnage, même si l'analyseur le prendrait pour une didascalie
//   ignorer : pas un personnage (didascalie, transition…)

function ensureNomsRegles(PDO $db): void {
    $db->exec("
        CREATE TABLE IF NOT EXISTS noms_regles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT NOT NULL,
            nom_normalise TEXT NOT NULL UNIQUE,
            regle TEXT NOT NULL CHECK(regle IN ('alias', 'garder', 'ignorer')),
            personnage_id INTEGER REFERENCES personnages(id) ON DELETE CASCADE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT);
    ");

    if ($db->query("SELECT 1 FROM app_meta WHERE key = 'noms_regles_seed_v1'")->fetchColumn()) return;

    // Les mots des en-têtes et des transitions de scénario ne sont jamais des personnages
    $ignorer = [
        'INT','EXT','INT.','EXT.','FIN','FONDU','FONDU AU NOIR','COUPE','COUPE SUR',
        'RETOUR SUR','FLASH-BACK','FLASH BACK','FLASH FORWARD','ON THE',
        'GÉNÉRIQUE','TITRE','ACTE','SCENE','SÉQUENCE',
        'SUITE','PLUS TARD','PLUS TARD AU','QUELQUES JOURS','LENDEMAIN','LE LENDEMAIN',
        'MÊME ENDROIT','QUELQUES MINUTES','QUELQUES HEURES',
        'NUIT','JOUR','MATIN','SOIR','APRÈS-MIDI',
        'NOTE','NOTES','DESCRIPTION','ACTION','OK',
        'FONDU À','FONDU À LA','FONDU ENCHAÎNÉ','GÉNÉRIQUE DE FIN','FONDU À LA FERMETURE',
    ];

    $insert = $db->prepare('INSERT OR IGNORE INTO noms_regles (nom, nom_normalise, regle, personnage_id) VALUES (?, ?, ?, ?)');
    $db->beginTransaction();
    foreach ($ignorer as $nom) $insert->execute([$nom, normaliserNomPersoPourMatch($nom), 'ignorer', null]);
    $db->exec("INSERT INTO app_meta (key, value) VALUES ('noms_regles_seed_v1', '1')");
    $db->commit();
}

// Règles indexées par nom normalisé, chargées une fois par requête
function reglesNoms(?PDO $db = null): array {
    static $regles = [];
    if ($db) {
        $regles = [];
        foreach ($db->query('SELECT * FROM noms_regles')->fetchAll() as $row) {
            $regles[$row['nom_normalise']] = $row;
        }
    }
    return $regles;
}

// Rapprochement approximatif, uniquement proposé à l'utilisateur : jamais appliqué seul
function suggererPersonnage(string $nomN, array $personnages): ?array {
    foreach ($personnages as $p) {
        $prenomN = normaliserNomPersoPourMatch($p['prenom'] ?? '');
        if (strlen($prenomN) >= 3 && str_starts_with($nomN, $prenomN . ' ')) return $p;
        if (strlen($nomN) >= 3 && str_starts_with($prenomN, $nomN)) return $p;
    }
    return null;
}

function getNomsNonReconnus(PDO $db, array $personnages): array {
    $regles = reglesNoms();
    $groupes = [];
    $rows = $db->query('
        SELECT nom, SUM(nb_repliques) AS nb_repliques, COUNT(DISTINCT episode_id) AS nb_episodes
        FROM episode_stat_personnages
        GROUP BY nom
    ')->fetchAll();

    foreach ($rows as $row) {
        $nomN = normaliserNomPersoPourMatch((string)$row['nom']);
        if ($nomN === '' || isset($regles[$nomN]) || matcherPersonnageDepuisNom($nomN, $personnages)) continue;
        if (!isset($groupes[$nomN])) {
            $suggestion = suggererPersonnage($nomN, $personnages);
            $groupes[$nomN] = [
                'nom' => trim($row['nom']),
                'nb_repliques' => 0,
                'nb_episodes' => 0,
                'suggestion' => $suggestion ? ['id' => (int)$suggestion['id'], 'label' => personnageLabel($suggestion)] : null,
            ];
        }
        $groupes[$nomN]['nb_repliques'] += (int)$row['nb_repliques'];
        $groupes[$nomN]['nb_episodes'] += (int)$row['nb_episodes'];
    }

    $liste = array_values($groupes);
    usort($liste, fn($a, $b) => $b['nb_repliques'] <=> $a['nb_repliques']);
    return $liste;
}

function handleNoms(PDO $db, string $method, ?int $id, array $body): void {
    switch ($method) {
        case 'GET':
            $personnages = $db->query('SELECT id, prenom, nom, nom_affichage FROM personnages ORDER BY prenom')->fetchAll();
            echo json_encode([
                'regles' => $db->query('
                    SELECT r.id, r.nom, r.regle, r.personnage_id, TRIM(p.prenom || \' \' || COALESCE(p.nom, \'\')) AS personnage
                    FROM noms_regles r
                    LEFT JOIN personnages p ON p.id = r.personnage_id
                    ORDER BY r.regle, r.nom
                ')->fetchAll(),
                'non_reconnus' => getNomsNonReconnus($db, $personnages),
            ]);
            break;

        case 'POST':
            $nom = trim(texteCorps($body['nom'] ?? ''));
            $regle = texteCorps($body['regle'] ?? '');
            $personnageId = (int)($body['personnage_id'] ?? 0) ?: null;
            $nomN = normaliserNomPersoPourMatch($nom);
            if ($nomN === '' || !in_array($regle, ['alias', 'garder', 'ignorer'], true) || ($regle === 'alias' && !$personnageId)) {
                http_response_code(400);
                echo json_encode(['error' => 'Règle incomplète']);
                return;
            }
            $db->prepare('
                INSERT INTO noms_regles (nom, nom_normalise, regle, personnage_id) VALUES (?, ?, ?, ?)
                ON CONFLICT(nom_normalise) DO UPDATE SET nom = excluded.nom, regle = excluded.regle, personnage_id = excluded.personnage_id
            ')->execute([$nom, $nomN, $regle, $regle === 'alias' ? $personnageId : null]);
            echo json_encode(['ok' => true]);
            break;

        case 'DELETE':
            $db->prepare('DELETE FROM noms_regles WHERE id = ?')->execute([$id]);
            echo json_encode(['ok' => true]);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Méthode non autorisée']);
    }
}
