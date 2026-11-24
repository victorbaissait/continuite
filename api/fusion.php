<?php
// api/fusion.php — Comparer un projet reçu (un coauteur, une sauvegarde) avec le projet ouvert, puis fusionner :
// épisode par épisode, on garde le sien ou on prend l'autre ; les personnages et les lieux qui manquent s'ajoutent.
// Le projet reçu n'est jamais exécuté ni modifié : sa base est ouverte en lecture seule.

const FUSION_CHAMPS = [
    'titre' => 'Titre', 'resume' => 'Résumé', 'intrigue_a' => 'Intrigue A', 'intrigue_b' => 'Intrigue B', 'intrigue_c' => 'Intrigue C',
    'commentaires' => 'Commentaires', 'date_diege' => 'Date', 'jet' => 'Jet', 'avancement' => 'Avancement', 'texte_episode' => 'Script',
];

// La base du projet reçu, sortie de l'archive une seule fois et ouverte en lecture seule
function baseRecue(string $jeton): PDO {
    if (!preg_match('/^[a-f0-9]{24}$/', $jeton)) throw new RuntimeException('Envoie d\'abord le fichier.');
    $archive = dossierImports() . "/$jeton.lemenu";
    if (!is_file($archive)) throw new RuntimeException('Envoie d\'abord le fichier : celui-ci n\'est plus là.');
    $base = dossierImports() . "/$jeton.base.db";
    if (!is_file($base)) {
        $zip = new ZipArchive();
        if ($zip->open($archive) !== true) throw new RuntimeException('Ce fichier n\'est pas un projet ' . NOM_APP . '.');
        $in = $zip->getStream('sitcom.db');
        if (!$in) { $zip->close(); throw new RuntimeException('La base du projet manque.'); }
        $out = fopen($base . '.part', 'wb');
        $ecrit = (int)stream_copy_to_stream($in, $out, PORTABLE_MAX + 1);
        fclose($in);
        fclose($out);
        $zip->close();
        if ($ecrit > PORTABLE_MAX) { @unlink($base . '.part'); throw new RuntimeException('Le projet décompressé dépasse 512 Mo.'); }
        rename($base . '.part', $base);
    }
    // En lecture seule. PHP 8.5 range ces réglages dans Pdo\Sqlite (les anciens noms y sont dépréciés) ; MAMP a souvent PHP 8.3
    $lectureSeule = class_exists('Pdo\Sqlite')
        ? [constant('Pdo\Sqlite::ATTR_OPEN_FLAGS') => constant('Pdo\Sqlite::OPEN_READONLY')]
        : [constant('PDO::SQLITE_ATTR_OPEN_FLAGS') => constant('PDO::SQLITE_OPEN_READONLY')];
    $pdo = new PDO('sqlite:' . $base, null, null, $lectureSeule);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    return $pdo;
}

// Lecture prudente : une base ancienne ou abîmée peut manquer d'une table ou d'une colonne
function lignesSures(PDO $db, string $sql): array {
    try { return $db->query($sql)->fetchAll(); } catch (Throwable $e) { return []; }
}

function episodesParCle(PDO $db): array {
    $notes = [];
    foreach (lignesSures($db, "SELECT cle, valeur FROM analyse_notes WHERE cle LIKE 'brouillon:%'") as $n) $notes[(int)substr($n['cle'], 10)] = (string)$n['valeur'];
    $eps = [];
    foreach (lignesSures($db, 'SELECT e.*, s.numero AS saison_numero, s.nom AS saison_nom, s.couleur AS saison_couleur FROM episodes e JOIN saisons s ON s.id = e.saison_id') as $e) {
        $e['brouillon'] = $notes[(int)$e['id']] ?? '';
        $eps[(int)$e['saison_numero'] . ':' . (int)$e['numero_episode']] = $e;
    }
    uksort($eps, fn($a, $b) => array_map('intval', explode(':', $a)) <=> array_map('intval', explode(':', $b)));
    return $eps;
}

function nbMots(string $t): int {
    return count(preg_split('/\s+/u', trim($t), -1, PREG_SPLIT_NO_EMPTY));
}

// Les lignes ajoutées et retirées entre deux textes (en comptant les lignes répétées)
function ecartLignes(string $ici, string $la): array {
    $compter = function (string $t) {
        $c = [];
        foreach (preg_split('/\R/u', $t) as $l) { $l = trim($l); if ($l !== '') $c[$l] = ($c[$l] ?? 0) + 1; }
        return $c;
    };
    $a = $compter($ici); $b = $compter($la);
    $ajoutees = []; $retirees = 0;
    foreach ($b as $l => $n) { $d = $n - ($a[$l] ?? 0); if ($d > 0) { for ($i = 0; $i < $d; $i++) $ajoutees[] = $l; } }
    foreach ($a as $l => $n) $retirees += max(0, $n - ($b[$l] ?? 0));
    return ['ajoutees' => count($ajoutees), 'retirees' => $retirees, 'exemple' => mb_substr($ajoutees[0] ?? '', 0, 140)];
}

function comparerProjets(PDO $ici, PDO $la): array {
    $a = episodesParCle($ici);
    $b = episodesParCle($la);
    $episodes = [];
    foreach (array_unique(array_merge(array_keys($a), array_keys($b))) as $cle) {
        $x = $a[$cle] ?? null;
        $y = $b[$cle] ?? null;
        [$s, $n] = array_map('intval', explode(':', $cle));
        $ligne = ['cle' => $cle, 'saison' => $s, 'numero' => $n, 'titre_ici' => $x['titre'] ?? null, 'titre_la' => $y['titre'] ?? null];
        if (!$y) { $episodes[] = $ligne + ['etat' => 'ici']; continue; }
        if (!$x) { $episodes[] = $ligne + ['etat' => 'la', 'mots_la' => nbMots((string)($y['texte_episode'] ?? ''))]; continue; }
        $champs = [];
        foreach (FUSION_CHAMPS as $c => $label) if ((string)($x[$c] ?? '') !== (string)($y[$c] ?? '')) $champs[] = $label;
        if ($x['brouillon'] !== $y['brouillon']) $champs[] = 'Brouillon';
        if (!$champs) { $episodes[] = $ligne + ['etat' => 'identique']; continue; }
        $episodes[] = $ligne + ['etat' => 'different', 'champs' => $champs,
            'mots_ici' => nbMots((string)$x['texte_episode']), 'mots_la' => nbMots((string)$y['texte_episode']),
            'script' => in_array('Script', $champs, true) ? ecartLignes((string)$x['texte_episode'], (string)$y['texte_episode']) : null];
    }
    // Les fiches qui n'existent que dans le projet reçu
    $nomsIci = array_flip(array_map(fn($p) => mb_strtolower(trim($p['prenom'] . ' ' . ($p['nom'] ?? ''))), lignesSures($ici, 'SELECT prenom, nom FROM personnages')));
    $personnages = [];
    foreach (lignesSures($la, 'SELECT * FROM personnages ORDER BY est_principal DESC, prenom') as $p) {
        $nom = trim((string)$p['prenom'] . ' ' . (string)($p['nom'] ?? ''));
        if ($nom !== '' && !isset($nomsIci[mb_strtolower($nom)])) $personnages[] = $nom;
    }
    $lieuxIci = array_flip(array_map(fn($l) => mb_strtolower(trim((string)$l['nom'])), lignesSures($ici, 'SELECT nom FROM lieux')));
    $lieux = [];
    foreach (lignesSures($la, 'SELECT nom FROM lieux ORDER BY est_principal DESC, nom') as $l) {
        $nom = trim((string)$l['nom']);
        if ($nom !== '' && !isset($lieuxIci[mb_strtolower($nom)])) $lieux[] = $nom;
    }
    return ['episodes' => $episodes, 'personnages' => array_values(array_unique($personnages)), 'lieux' => array_values(array_unique($lieux))];
}

// Applique les choix : « la » pour un épisode prend la version reçue ; les anciens textes partent dans les Versions
function fusionnerProjets(PDO $db, PDO $la, array $choix, array $personnages, array $lieux): array {
    $a = episodesParCle($db);
    $b = episodesParCle($la);
    $bilan = ['remplaces' => 0, 'ajoutes' => 0, 'personnages' => 0, 'lieux' => 0];
    $db->beginTransaction();
    try {
        foreach ($choix as $cle => $quoi) {
            if ($quoi !== 'la' || !is_string($cle) || !isset($b[$cle])) continue;
            $y = $b[$cle];
            $valeurs = [];
            foreach (array_keys(FUSION_CHAMPS) as $c) if ($c !== 'texte_episode') $valeurs[$c] = $y[$c] ?? null;
            $valeurs['avancement'] = (int)($valeurs['avancement'] ?? 0);
            if (isset($a[$cle])) {
                $x = $a[$cle];
                $id = (int)$x['id'];
                $motif = 'Avant la fusion avec un projet reçu';
                if (trim((string)$x['texte_episode']) !== '') versionsBrouillon($db, 'POST', ['episode_id' => $id, 'texte' => (string)$x['texte_episode'], 'motif' => $motif]);
                if (trim($x['brouillon']) !== '' && $x['brouillon'] !== $y['brouillon']) versionsBrouillon($db, 'POST', ['episode_id' => $id, 'texte' => $x['brouillon'], 'motif' => "$motif (brouillon)"]);
                $sets = implode(', ', array_map(fn($c) => "$c = ?", array_keys($valeurs)));
                $db->prepare("UPDATE episodes SET $sets WHERE id = ?")->execute([...array_values($valeurs), $id]);
                $bilan['remplaces']++;
            } else {
                [$s, $n] = array_map('intval', explode(':', $cle));
                $st = $db->prepare('SELECT id FROM saisons WHERE numero = ?');
                $st->execute([$s]);
                $saison = (int)$st->fetchColumn();
                if (!$saison) {
                    $db->prepare('INSERT INTO saisons (numero, nom, couleur) VALUES (?, ?, ?)')->execute([$s, $y['saison_nom'] ?? "Saison $s", $y['saison_couleur'] ?? '#e74c3c']);
                    $saison = (int)$db->lastInsertId();
                }
                $colonnes = ['saison_id', 'numero_episode', ...array_keys($valeurs)];
                $db->prepare('INSERT INTO episodes (' . implode(', ', $colonnes) . ') VALUES (' . implode(', ', array_fill(0, count($colonnes), '?')) . ')')
                    ->execute([$saison, $n, ...array_values($valeurs)]);
                $id = (int)$db->lastInsertId();
                $bilan['ajoutes']++;
            }
            $texte = (string)($y['texte_episode'] ?? '');
            if (trim($texte) !== '') enregistrerScriptEpisode($db, $id, $texte);
            else $db->prepare('UPDATE episodes SET texte_episode = ? WHERE id = ?')->execute([$texte, $id]);
            if ($y['brouillon'] !== '') ecrireNoteBrute($db, "brouillon:$id", $y['brouillon']);
            else $db->prepare('DELETE FROM analyse_notes WHERE cle = ?')->execute(["brouillon:$id"]);
        }
        $voulus = array_flip(array_map('mb_strtolower', array_map('strval', $personnages)));
        $deja = array_flip(array_map(fn($p) => mb_strtolower(trim($p['prenom'] . ' ' . ($p['nom'] ?? ''))), lignesSures($db, 'SELECT prenom, nom FROM personnages')));
        foreach (lignesSures($la, 'SELECT * FROM personnages') as $p) {
            $nom = mb_strtolower(trim((string)$p['prenom'] . ' ' . (string)($p['nom'] ?? '')));
            if (!isset($voulus[$nom]) || isset($deja[$nom]) || trim((string)$p['prenom']) === '') continue;
            $db->prepare('INSERT INTO personnages (prenom, nom, couleur_identite, est_principal, sexe, age, date_naissance, profession, caracteristiques, nom_affichage) VALUES (?,?,?,?,?,?,?,?,?,?)')
                ->execute([$p['prenom'], $p['nom'] ?? null, $p['couleur_identite'] ?? '#888888', (int)($p['est_principal'] ?? 0), $p['sexe'] ?? null, $p['age'] ?? null, $p['date_naissance'] ?? null, $p['profession'] ?? null, $p['caracteristiques'] ?? null, $p['nom_affichage'] ?? null]);
            $deja[$nom] = true;
            $bilan['personnages']++;
        }
        $voulus = array_flip(array_map('mb_strtolower', array_map('strval', $lieux)));
        $deja = array_flip(array_map(fn($l) => mb_strtolower(trim((string)$l['nom'])), lignesSures($db, 'SELECT nom FROM lieux')));
        foreach (lignesSures($la, 'SELECT * FROM lieux') as $l) {
            $nom = mb_strtolower(trim((string)$l['nom']));
            if (!isset($voulus[$nom]) || isset($deja[$nom]) || $nom === '') continue;
            $db->prepare('INSERT INTO lieux (nom, description, est_principal, nom_affichage) VALUES (?, ?, ?, ?)')
                ->execute([$l['nom'], $l['description'] ?? null, (int)($l['est_principal'] ?? 0), $l['nom_affichage'] ?? null]);
            $deja[$nom] = true;
            $bilan['lieux']++;
        }
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }
    return $bilan;
}
