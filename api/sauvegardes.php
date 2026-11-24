<?php
// api/sauvegardes.php — Copies datées de la base dans data/backups/

function dossierSauvegardes(): string {
    return dirname(DB_PATH) . '/backups';
}

function listerSauvegardes(): array {
    $liste = [];
    foreach (glob(dossierSauvegardes() . '/sitcom-*.db') ?: [] as $chemin) {
        $images = preg_replace('/^sitcom-(.*)\.db$/', 'storyboard-$1.zip', basename($chemin));
        $liste[] = ['fichier' => basename($chemin), 'taille' => filesize($chemin), 'date' => date('c', filemtime($chemin)), 'images' => is_file(dossierSauvegardes() . "/$images") ? $images : null];
    }
    usort($liste, fn($a, $b) => strcmp($b['date'], $a['date']));
    return $liste;
}

function handleSauvegardes(PDO $db, string $method, array $parts): void {
    if ($method === 'GET' && ($parts[1] ?? '') === 'telecharger') {
        $fichier = (string)($_GET['fichier'] ?? '');
        $chemin = dossierSauvegardes() . '/' . $fichier;
        if (!preg_match('/^(sitcom-\d{8}-\d{6}(-\d{1,3})?\.db|storyboard-\d{8}-\d{6}(-\d{1,3})?\.zip)$/', $fichier) || !is_file($chemin)) {
            http_response_code(404);
            echo json_encode(['error' => 'Sauvegarde introuvable']);
            return;
        }
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="' . $fichier . '"');
        header('Content-Length: ' . filesize($chemin));
        readfile($chemin);
        return;
    }

    if ($method === 'GET') {
        echo json_encode(listerSauvegardes());
        return;
    }

    if ($method === 'POST') {
        $dossier = dossierSauvegardes();
        if (!is_dir($dossier)) mkdir($dossier, 0775, true);
        $chemin = $dossier . '/sitcom-' . date('Ymd-His') . '.db';
        // Deux sauvegardes dans la même seconde : la seconde prend un suffixe
        for ($n = 2; file_exists($chemin); $n++) $chemin = $dossier . '/sitcom-' . date('Ymd-His') . "-$n.db";
        // VACUUM INTO produit une copie cohérente même si la base est en WAL
        $db->exec('VACUUM INTO ' . $db->quote($chemin));
        // Les dessins et les voix du storyboard ne sont pas dans la base : ils partent dans une archive à côté
        $images = null;
        $source = dirname(DB_PATH) . '/storyboard';
        $fichiers = is_dir($source) ? (glob("$source/*") ?: []) : [];
        if ($fichiers && class_exists('ZipArchive')) {
            $images = preg_replace('/^sitcom-(.*)\.db$/', 'storyboard-$1.zip', basename($chemin));
            $zip = new ZipArchive();
            $zip->open("$dossier/$images", ZipArchive::CREATE);
            foreach ($fichiers as $f) $zip->addFile($f, 'storyboard/' . basename($f));
            $zip->close();
        }
        echo json_encode(['fichier' => basename($chemin), 'taille' => filesize($chemin), 'date' => date('c'), 'images' => $images]);
        return;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Méthode non autorisée']);
}
