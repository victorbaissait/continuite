<?php
// api/portable.php — Un projet entier dans un seul fichier .lemenu, et son retour sur une autre machine
// Le fichier est une archive zip : manifeste, base, réglages, puis les dessins, voix, photos et cartes choisis

const PORTABLE_FORMAT = 'lemenu-projet';
const PORTABLE_VERSION = 1;
// Les fichiers du projet qui voyagent toujours, à côté de la base
const PORTABLE_FICHIERS = ['projet.json', 'analyse-cache.json', 'analyse-expressions.json', 'ecriture-cache.json', 'ecriture-lignes.json'];
const PORTABLE_MEDIA = '/^[a-z0-9-]{1,80}\.(png|jpg|jpeg|webp|wav|webm|ogg|mp3|m4a|mp4)$/';
const PORTABLE_MAX = 512 * 1024 * 1024;

function dossierImports(): string {
    $dossier = PROJETS_RACINE . '/imports';
    if (!is_dir($dossier)) mkdir($dossier, 0775, true);
    return $dossier;
}

// Range chaque fichier du storyboard et des cartes : dessin, photo du casting, voix ou carte
function mediasProjet(string $slug): array {
    $dossier = dossierProjet($slug);
    $photos = [];
    try {
        foreach (ouvrirBaseProjet($slug)->query("SELECT image, donnees FROM storyboard_plans WHERE image IS NOT NULL")->fetchAll() as $r) {
            $d = json_decode((string)$r['donnees'], true);
            if (is_array($d) && !empty($d['fiche'])) $photos[basename((string)$r['image'])] = true;
        }
    } catch (Throwable $e) {
        // Un projet sans storyboard n'a pas encore la table
    }
    $medias = ['dessins' => [], 'photos' => [], 'voix' => [], 'cartes' => []];
    foreach (glob("$dossier/storyboard/*") ?: [] as $f) {
        if (!is_file($f)) continue;
        $nom = basename($f);
        $groupe = str_starts_with($nom, 'voix-') ? 'voix' : (isset($photos[$nom]) ? 'photos' : 'dessins');
        $medias[$groupe][] = "storyboard/$nom";
    }
    foreach (glob("$dossier/cartes/*") ?: [] as $f) if (is_file($f)) $medias['cartes'][] = 'cartes/' . basename($f);
    return $medias;
}

// Ce que PHP accepte vraiment d'un seul envoi (post_max_size), au plus 512 Mo
function limiteEnvoi(): int {
    $v = trim((string)ini_get('post_max_size'));
    $n = (float)$v;
    $n *= ['k' => 1024, 'm' => 1048576, 'g' => 1073741824][strtolower(substr($v, -1))] ?? 1;
    return (int)($n > 0 ? min($n, PORTABLE_MAX) : PORTABLE_MAX);
}

function taillesPortable(string $slug): array {
    $dossier = dossierProjet($slug);
    $taille = fn(array $liste) => array_sum(array_map(fn($f) => (int)@filesize("$dossier/$f"), $liste));
    $pdo = ouvrirBaseProjet($slug);
    $medias = mediasProjet($slug);
    $groupes = [];
    foreach ($medias as $g => $liste) $groupes[$g] = ['nombre' => count($liste), 'taille' => $taille($liste)];
    $textes = (int)@filesize("$dossier/sitcom.db");
    $reglages = $taille(array_filter(PORTABLE_FICHIERS, fn($f) => is_file("$dossier/$f")));
    return [
        'nom' => nomProjet($slug),
        'limite' => limiteEnvoi(),
        'textes' => ['taille' => $textes, 'episodes' => (int)$pdo->query('SELECT COUNT(*) FROM episodes')->fetchColumn()],
        'reglages' => ['taille' => $reglages],
        // Pour n'envoyer qu'une saison à un coauteur
        'saisons' => array_map(fn($r) => ['numero' => (int)$r['numero'], 'nom' => (string)$r['nom'], 'episodes' => (int)$r['n']], $pdo->query('SELECT s.numero, s.nom, COUNT(e.id) AS n FROM saisons s LEFT JOIN episodes e ON e.saison_id = s.id GROUP BY s.id ORDER BY s.numero')->fetchAll()),
    ] + $groupes;
}

// Construit l'archive dans un fichier temporaire et renvoie son chemin
// Une copie partielle : une seule saison, ou la bible sans aucun épisode. Tout ce qui pointe vers un
// épisode retiré part avec lui ; un décor garde sa fiche mais perd sa « première apparition »
function reduirePortable(PDO $copie, string $portee): void {
    if ($portee === 'tout') return;
    $copie->exec('PRAGMA foreign_keys = ON');
    if ($portee === 'bible') $copie->exec('DELETE FROM episodes');
    else $copie->prepare('DELETE FROM saisons WHERE numero != ?')->execute([(int)substr($portee, 1)]);
    foreach ($copie->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")->fetchAll(PDO::FETCH_COLUMN) as $table) {
        if ($table === 'episodes') continue;
        foreach ($copie->query('PRAGMA table_info("' . str_replace('"', '""', $table) . '")')->fetchAll() as $col) {
            $c = (string)$col['name'];
            if (!preg_match('/^(.*_)?episode(_[a-z]+)?_id$/', $c)) continue;
            $t = '"' . str_replace('"', '""', $table) . '"';
            $q = '"' . str_replace('"', '""', $c) . '"';
            if (str_starts_with($c, 'premiere')) $copie->exec("UPDATE $t SET $q = NULL WHERE $q IS NOT NULL AND $q NOT IN (SELECT id FROM episodes)");
            else $copie->exec("DELETE FROM $t WHERE $q IS NOT NULL AND $q NOT IN (SELECT id FROM episodes)");
        }
    }
    // Un secret appris dans un épisode absent redevient « à noter »
    $note = $copie->query("SELECT valeur FROM analyse_notes WHERE cle = 'secrets'")->fetchColumn();
    $d = json_decode((string)$note, true);
    if (is_array($d['secrets'] ?? null)) {
        $ids = array_flip($copie->query('SELECT id FROM episodes')->fetchAll(PDO::FETCH_COLUMN));
        foreach ($d['secrets'] as &$sec) {
            if (!is_array($sec['savent'] ?? null)) continue;
            foreach ($sec['savent'] as $nom => $q) if (is_array($q) && !isset($ids[(int)($q['ep'] ?? 0)])) unset($sec['savent'][$nom]);
            $sec['savent'] = (object)$sec['savent'];
            if (is_array($sec['public'] ?? null) && !isset($ids[(int)($sec['public']['ep'] ?? 0)])) $sec['public'] = null;
        }
        unset($sec);
        $copie->prepare("UPDATE analyse_notes SET valeur = ? WHERE cle = 'secrets'")->execute([json_encode($d, JSON_UNESCAPED_UNICODE)]);
    }
    // Un état qui commence dans un épisode absent part avec lui ; s'il cesse dans un épisode absent, il dure jusqu'au bout
    $d = json_decode((string)$copie->query("SELECT valeur FROM analyse_notes WHERE cle = 'etats'")->fetchColumn(), true);
    if (is_array($d['etats'] ?? null)) {
        $ids = array_flip($copie->query('SELECT id FROM episodes')->fetchAll(PDO::FETCH_COLUMN));
        $etats = [];
        foreach ($d['etats'] as $e) {
            if (!is_array($e) || !isset($ids[(int)($e['debut'] ?? 0)])) continue;
            if (isset($e['fin']) && !isset($ids[(int)$e['fin']])) $e['fin'] = null;
            $etats[] = $e;
        }
        $copie->prepare("UPDATE analyse_notes SET valeur = ? WHERE cle = 'etats'")->execute([json_encode(['etats' => $etats], JSON_UNESCAPED_UNICODE)]);
    }
}

function construirePortable(string $slug, array $garder, string $portee = 'tout'): string {
    $dossier = dossierProjet($slug);
    $base = tempnam(sys_get_temp_dir(), 'lemenu-db');
    @unlink($base);
    ouvrirBaseProjet($slug)->prepare('VACUUM INTO ?')->execute([$base]);
    $medias = mediasProjet($slug);
    $copie = new PDO('sqlite:' . $base);
    $copie->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    reduirePortable($copie, $portee);
    // Une copie partielle n'emporte que les dessins et les voix des épisodes qu'elle garde
    if ($portee !== 'tout') {
        $utiles = [];
        foreach (['SELECT image FROM storyboard_plans WHERE image IS NOT NULL', 'SELECT fichier FROM storyboard_sons'] as $sql) {
            try { foreach ($copie->query($sql)->fetchAll(PDO::FETCH_COLUMN) as $f) $utiles['storyboard/' . basename((string)$f)] = true; } catch (Throwable $e) {}
        }
        foreach (['dessins', 'photos', 'voix'] as $g) $medias[$g] = array_values(array_filter($medias[$g], fn($f) => isset($utiles[$f])));
    }
    // Un dessin ou une voix laissé à la maison ne doit pas laisser un lien cassé dans la copie
    foreach (['dessins', 'photos'] as $g) {
        if (!empty($garder[$g])) continue;
        $retirer = $copie->prepare('UPDATE storyboard_plans SET image = NULL WHERE image = ?');
        foreach ($medias[$g] as $f) $retirer->execute([basename($f)]);
    }
    if (empty($garder['voix'])) {
        try { $copie->exec('DELETE FROM storyboard_sons'); } catch (Throwable $e) {}
    }
    // Sans les images des cartes, les cartes restent avec leurs épingles et leurs fiches, mais sans image à afficher
    if (empty($garder['cartes'])) {
        $note = $copie->query("SELECT valeur FROM analyse_notes WHERE cle = 'cartes'")->fetchColumn();
        $d = json_decode((string)$note, true);
        if (is_array($d['cartes'] ?? null)) {
            foreach ($d['cartes'] as &$c) if (is_array($c)) $c['fichier'] = null;
            unset($c);
            $copie->prepare("UPDATE analyse_notes SET valeur = ? WHERE cle = 'cartes'")->execute([json_encode($d, JSON_UNESCAPED_UNICODE)]);
        }
    }
    if ($portee !== 'tout') $copie->exec('VACUUM');
    $copie = null;

    $infos = infosProjet($slug);
    $lu = new PDO('sqlite:' . $base);
    $manifeste = [
        'format' => PORTABLE_FORMAT, 'version' => PORTABLE_VERSION, 'date' => date('c'),
        'nom' => $infos['nom'], 'type' => $infos['type'], 'portee' => $portee,
        'episodes' => (int)$lu->query('SELECT COUNT(*) FROM episodes')->fetchColumn(),
        'scripts' => (int)$lu->query("SELECT COUNT(*) FROM episodes WHERE COALESCE(TRIM(texte_episode), '') != ''")->fetchColumn(),
        'contenu' => [],
    ];
    $lu = null;
    $zipChemin = tempnam(sys_get_temp_dir(), 'lemenu-zip');
    $zip = new ZipArchive();
    $zip->open($zipChemin, ZipArchive::OVERWRITE);
    $zip->addFile($base, 'sitcom.db');
    // Les caches d'analyse parlent de tous les épisodes : une copie partielle les recalculera
    foreach (PORTABLE_FICHIERS as $f) if (is_file("$dossier/$f") && ($portee === 'tout' || $f === 'projet.json')) $zip->addFile("$dossier/$f", $f);
    $elements = 1;
    foreach ($medias as $g => $liste) {
        if (empty($garder[$g])) continue;
        foreach ($liste as $f) {
            $zip->addFile("$dossier/$f", $f);
            // Les images et les sons sont déjà compressés
            $zip->setCompressionName($f, ZipArchive::CM_STORE);
        }
        $manifeste['contenu'][$g] = count($liste);
        $elements += count($liste);
    }
    $manifeste['elements'] = $elements;
    $zip->addFromString('manifeste.json', json_encode($manifeste, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    $zip->close();
    @unlink($base);
    return $zipChemin;
}

function nomFichierPortable(string $nom): string {
    $propre = trim((string)preg_replace('/[\\\\\/:*?"<>|\x00-\x1f]+/u', ' ', $nom));
    return ($propre !== '' ? $propre : 'projet') . '.lemenu';
}

// Lit une archive reçue sans rien extraire : ce qu'elle contient, et si elle est sûre
function lirePortable(string $chemin): array {
    $zip = new ZipArchive();
    if ($zip->open($chemin) !== true) throw new RuntimeException('Ce fichier n\'est pas un projet ' . NOM_APP . '.');
    // Le manifeste est un petit fichier : un manifeste énorme (archive piégée) n'est même pas décompressé
    $infos = $zip->statName('manifeste.json');
    $manifeste = $infos && $infos['size'] <= 1024 * 1024 ? json_decode((string)$zip->getFromName('manifeste.json'), true) : null;
    if (!is_array($manifeste) || ($manifeste['format'] ?? '') !== PORTABLE_FORMAT) {
        $zip->close();
        throw new RuntimeException('Ce fichier n\'est pas un projet ' . NOM_APP . '.');
    }
    if ((int)($manifeste['version'] ?? 0) > PORTABLE_VERSION) {
        $zip->close();
        throw new RuntimeException('Ce projet vient d\'une version plus récente de ' . NOM_APP . '.');
    }
    $total = 0;
    $refuses = [];
    $aBase = false;
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $st = $zip->statIndex($i);
        $nom = (string)$st['name'];
        $total += (int)$st['size'];
        if ($nom === 'sitcom.db') { $aBase = true; continue; }
        if ($nom === 'manifeste.json' || in_array($nom, PORTABLE_FICHIERS, true)) continue;
        if (preg_match('#^(storyboard|cartes)/(.+)$#', $nom, $m) && preg_match(PORTABLE_MEDIA, $m[2])) continue;
        $refuses[] = $nom;
    }
    $zip->close();
    if (!$aBase) throw new RuntimeException('Le fichier est incomplet : la base du projet manque.');
    if ($total > PORTABLE_MAX) throw new RuntimeException('Le projet décompressé dépasse 512 Mo.');
    return [
        'nom' => mb_substr(trim(texteCorps($manifeste['nom'] ?? '')), 0, 80) ?: 'Projet importé',
        'type' => in_array($manifeste['type'] ?? '', PROJET_TYPES, true) ? $manifeste['type'] : 'serie',
        'date' => texteCorps($manifeste['date'] ?? ''),
        'episodes' => (int)($manifeste['episodes'] ?? 0),
        'scripts' => (int)($manifeste['scripts'] ?? 0),
        'contenu' => array_map('intval', array_intersect_key((array)($manifeste['contenu'] ?? []), array_flip(['dessins', 'photos', 'voix', 'cartes']))),
        'elements' => (int)($manifeste['elements'] ?? 0),
        'ignores' => count($refuses),
    ];
}

// Extrait une archive vérifiée dans un dossier vide, fichier par fichier, sans suivre les chemins écrits dedans
function extrairePortable(string $chemin, string $cible): void {
    $zip = new ZipArchive();
    $zip->open($chemin);
    foreach (['storyboard', 'cartes'] as $sous) if (!is_dir("$cible/$sous")) mkdir("$cible/$sous", 0775, true);
    // Les tailles écrites dans une archive peuvent mentir : on compte ce qui sort vraiment
    $reste = PORTABLE_MAX;
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $nom = (string)$zip->getNameIndex($i);
        $dest = null;
        if ($nom === 'sitcom.db' || in_array($nom, PORTABLE_FICHIERS, true)) $dest = "$cible/$nom";
        elseif (preg_match('#^(storyboard|cartes)/(.+)$#', $nom, $m) && preg_match(PORTABLE_MEDIA, $m[2])) $dest = "$cible/{$m[1]}/{$m[2]}";
        if ($dest === null) continue;
        $in = $zip->getStream($nom);
        if (!$in) continue;
        $out = fopen($dest, 'wb');
        $ecrit = (int)stream_copy_to_stream($in, $out, $reste + 1);
        fclose($in);
        fclose($out);
        $reste -= $ecrit;
        if ($reste < 0) {
            $zip->close();
            throw new RuntimeException('Le projet décompressé dépasse 512 Mo : l\'import est annulé.');
        }
    }
    $zip->close();
    // La base doit être une vraie base de projet, sinon rien n'est gardé
    try {
        $pdo = new PDO('sqlite:' . "$cible/sitcom.db");
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        if ($pdo->query('PRAGMA quick_check')->fetchColumn() !== 'ok') throw new RuntimeException();
        $pdo->query('SELECT COUNT(*) FROM episodes')->fetchColumn();
        migrateSchema($pdo);
    } catch (Throwable $e) {
        throw new RuntimeException('La base du projet est abîmée : l\'import est annulé.');
    }
}

function supprimerDossier(string $dossier): void {
    if (!is_dir($dossier)) return;
    foreach (scandir($dossier) ?: [] as $f) {
        if ($f === '.' || $f === '..') continue;
        is_dir("$dossier/$f") && !is_link("$dossier/$f") ? supprimerDossier("$dossier/$f") : @unlink("$dossier/$f");
    }
    @rmdir($dossier);
}

// Ce que remplace un import : les fichiers du projet, jamais les autres projets rangés à côté du projet d'origine
function fichiersRemplaces(string $slug): array {
    $dossier = dossierProjet($slug);
    $liste = array_merge(['sitcom.db', 'sitcom.db-wal', 'sitcom.db-shm'], PORTABLE_FICHIERS, ['storyboard', 'cartes']);
    return array_values(array_filter($liste, fn($f) => file_exists("$dossier/$f")));
}

function importerPortable(string $jeton, string $mode, ?string $slug, string $nom): array {
    $chemin = dossierImports() . "/$jeton.lemenu";
    $infos = lirePortable($chemin);
    $nom = $nom !== '' ? $nom : $infos['nom'];
    $tmp = PROJETS_RACINE . '/imports/' . $jeton;
    supprimerDossier($tmp);
    mkdir($tmp, 0775, true);
    try {
        extrairePortable($chemin, $tmp);
    } catch (Throwable $e) {
        supprimerDossier($tmp);
        @unlink($chemin);
        throw $e;
    }
    if ($mode === 'remplacer') {
        // L'ancienne version part dans la corbeille : on peut la restaurer
        $corbeille = PROJETS_RACINE . '/corbeille/' . ($slug === '' ? 'origine' : $slug) . '-' . date('Ymd-His');
        mkdir($corbeille, 0775, true);
        foreach (fichiersRemplaces($slug) as $f) rename(dossierProjet($slug) . "/$f", "$corbeille/$f");
        foreach (scandir($tmp) ?: [] as $f) if ($f !== '.' && $f !== '..') rename("$tmp/$f", dossierProjet($slug) . "/$f");
        rmdir($tmp);
        ecrireInfosProjet($slug, ['nom' => nomProjet($slug)]);
        $cible = $slug;
    } else {
        $cible = nouveauSlug($nom);
        if (!is_dir(PROJETS_RACINE . '/projets')) mkdir(PROJETS_RACINE . '/projets', 0775);
        rename($tmp, dossierProjet($cible));
        $ancien = nomProjet($cible);
        ecrireNomProjet($cible, $nom);
        renommerTitre(ouvrirBaseProjet($cible), $ancien, $nom);
    }
    @unlink($chemin);
    return resumeProjet($cible);
}

// Les envois de plus d'un jour sont oubliés
function nettoyerImports(): void {
    foreach (glob(dossierImports() . '/*') ?: [] as $f) {
        if (filemtime($f) > time() - 86400) continue;
        is_dir($f) ? supprimerDossier($f) : @unlink($f);
    }
}

function handlePortable(string $method, string $action, ?string $slug, array $body, callable $erreur, callable $slugValide): bool {
    if (!in_array($action, ['portable', 'exporter', 'apercu_import', 'importer'], true)) return false;
    if (!class_exists('ZipArchive')) { $erreur('PHP n\'a pas l\'extension zip : le projet portable est indisponible.', 500); return true; }

    if ($action === 'portable' || $action === 'exporter') {
        $slug = isset($_GET['slug']) && is_string($_GET['slug']) ? $_GET['slug'] : null;
        if (!$slugValide($slug)) { $erreur('Projet inconnu.', 404); return true; }
        if ($action === 'portable') { echo json_encode(taillesPortable($slug), JSON_UNESCAPED_UNICODE); return true; }
        $garder = [];
        foreach (['dessins', 'photos', 'voix', 'cartes'] as $g) $garder[$g] = ($_GET[$g] ?? '1') !== '0';
        $portee = texteCorps($_GET['portee'] ?? 'tout');
        if (!preg_match('/^(tout|bible|s-?\d{1,4})$/', $portee)) $portee = 'tout';
        if ($portee[0] === 's') {
            $st = ouvrirBaseProjet($slug)->prepare('SELECT 1 FROM saisons WHERE numero = ?');
            $st->execute([(int)substr($portee, 1)]);
            if (!$st->fetchColumn()) { $erreur('Cette saison n\'existe pas.', 404); return true; }
        }
        $zip = construirePortable($slug, $garder, $portee);
        $suffixe = $portee === 'tout' ? '' : ($portee === 'bible' ? ' - bible' : ' - S' . (int)substr($portee, 1));
        $nomFichier = nomFichierPortable(nomProjet($slug) . $suffixe);
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="' . addcslashes(preg_replace('/[^\x20-\x7e]/', '_', $nomFichier), '"\\') . '"; filename*=UTF-8\'\'' . rawurlencode($nomFichier));
        header('Content-Length: ' . filesize($zip));
        readfile($zip);
        @unlink($zip);
        return true;
    }

    if ($method !== 'POST') { $erreur('Méthode non autorisée', 405); return true; }

    if ($action === 'apercu_import') {
        nettoyerImports();
        $jeton = bin2hex(random_bytes(12));
        $chemin = dossierImports() . "/$jeton.lemenu";
        $entree = fopen('php://input', 'rb');
        $sortie = fopen($chemin, 'wb');
        $copie = stream_copy_to_stream($entree, $sortie, PORTABLE_MAX + 1);
        fclose($entree);
        fclose($sortie);
        if (!$copie) { @unlink($chemin); $erreur('Le fichier est vide.'); return true; }
        if ($copie > PORTABLE_MAX) { @unlink($chemin); $erreur('Le fichier dépasse 512 Mo.'); return true; }
        if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > $copie) { @unlink($chemin); $erreur('Le fichier n\'est pas arrivé en entier (limite post_max_size de PHP ?).'); return true; }
        try {
            $infos = lirePortable($chemin);
        } catch (RuntimeException $e) {
            @unlink($chemin);
            $erreur($e->getMessage(), 422);
            return true;
        }
        $nomsPris = array_map('nomProjet', slugsProjets());
        echo json_encode($infos + ['jeton' => $jeton, 'taille' => $copie, 'existe' => in_array($infos['nom'], $nomsPris, true)], JSON_UNESCAPED_UNICODE);
        return true;
    }

    // importer
    $jeton = texteCorps($body['jeton'] ?? '');
    if (!preg_match('/^[a-f0-9]{24}$/', $jeton) || !is_file(dossierImports() . "/$jeton.lemenu")) { $erreur('Envoie d\'abord le fichier : celui-ci n\'est plus là.', 404); return true; }
    $mode = ($body['mode'] ?? '') === 'remplacer' ? 'remplacer' : 'nouveau';
    if ($mode === 'remplacer' && !$slugValide($slug)) { $erreur('Projet à remplacer inconnu.', 404); return true; }
    $nom = trim(texteCorps($body['nom'] ?? ''));
    if (mb_strlen($nom) > 80) { $erreur('Le nom fait 80 caractères au plus.'); return true; }
    try {
        echo json_encode(importerPortable($jeton, $mode, $mode === 'remplacer' ? $slug : null, $nom), JSON_UNESCAPED_UNICODE);
    } catch (RuntimeException $e) {
        $erreur($e->getMessage(), 422);
    }
    return true;
}
