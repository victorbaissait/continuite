<?php
// api/atelier.php — Continuité : ce qui se contredit entre les fiches et le texte, d'un épisode à l'autre
// Noms écrits de deux façons, personnage mort qui reparle, âge qui ne colle pas, dates qui reculent

function sansAccents(string $t): string {
    return strtolower((string)iconv('UTF-8', 'ASCII//TRANSLIT', $t));
}

// Distance d'édition au caractère près (levenshtein compte les octets, pas les lettres accentuées)
function distanceNoms(string $a, string $b): int {
    $a = preg_split('//u', $a, -1, PREG_SPLIT_NO_EMPTY);
    $b = preg_split('//u', $b, -1, PREG_SPLIT_NO_EMPTY);
    $prec = range(0, count($b));
    foreach ($a as $i => $ca) {
        $cour = [$i + 1];
        foreach ($b as $j => $cb) $cour[] = min($prec[$j + 1] + 1, $cour[$j] + 1, $prec[$j] + ($ca === $cb ? 0 : 1));
        $prec = $cour;
    }
    return end($prec);
}

function continuite(PDO $db): array {
    $lignes = lignesEcriture($db);
    $ordre = array_keys($lignes);
    $rang = array_flip($ordre);
    $fiches = $db->query('SELECT id, prenom, nom, nom_affichage, age, date_naissance FROM personnages')->fetchAll();
    $episodes = [];
    foreach ($db->query('SELECT id, date_diege, COALESCE(est_flashback, 0) AS flash FROM episodes')->fetchAll() as $e) $episodes[(int)$e['id']] = $e;
    $notes = json_decode((string)$db->query("SELECT valeur FROM analyse_notes WHERE cle = 'continuite-morts'")->fetchColumn(), true);
    $morts = is_array($notes) ? $notes : [];
    $ignores = json_decode((string)$db->query("SELECT valeur FROM analyse_notes WHERE cle = 'continuite-ignores'")->fetchColumn(), true);
    $ignores = is_array($ignores) ? $ignores : [];

    // Qui parle, où, et combien de fois
    $parle = [];
    foreach ($lignes as $id => $lu) foreach ($lu['lignes'] as [$sc, $qui, $t]) {
        if ($qui === null) continue;
        $parle[$qui][$id] = ($parle[$qui][$id] ?? 0) + 1;
    }
    $alertes = [];
    $ajouter = function (string $cle, string $type, string $texte, ?int $ep = null, string $nom = '') use (&$alertes, $ignores) {
        if (in_array($cle, $ignores, true)) return;
        $alertes[] = ['cle' => $cle, 'type' => $type, 'texte' => $texte, 'episode' => $ep, 'nom' => $nom];
    };

    // 1. Le même personnage écrit de deux façons : JULIETTE / JULLIETTE, MARC / MARCK
    $noms = array_keys($parle);
    $vu = [];
    foreach ($noms as $i => $a) foreach (array_slice($noms, $i + 1) as $b) {
        $na = sansAccents($a); $nb = sansAccents($b);
        $proche = $na === $nb || (mb_strlen($a) >= 5 && distanceNoms($na, $nb) === 1 && !preg_match('/\d/', $a . $b));
        if (!$proche || isset($vu["$a|$b"])) continue;
        $vu["$a|$b"] = true;
        [$rare, $courant] = array_sum($parle[$a]) < array_sum($parle[$b]) ? [$a, $b] : [$b, $a];
        $ep = array_key_first($parle[$rare]);
        $ajouter("nom:$rare|$courant", 'Nom écrit de deux façons', "« $rare » (" . array_sum($parle[$rare]) . " réplique(s)) ressemble à « $courant » (" . array_sum($parle[$courant]) . ") : la même personne ?", $ep, $rare);
    }

    // 2. Un personnage mort qui reparle plus tard, hors flashback
    foreach ($morts as $nom => $epMort) {
        if (!isset($rang[(int)$epMort])) continue;
        foreach ($parle[$nom] ?? [] as $id => $n) {
            if ($rang[$id] <= $rang[(int)$epMort] || !empty($episodes[$id]['flash'])) continue;
            $ajouter("mort:$nom:$id", 'Mort qui reparle', "$nom est mort plus tôt, et reparle ici ($n réplique(s)) sans que l'épisode soit marqué comme flashback.", $id, $nom);
        }
    }

    // 3. L'âge dit dans le texte, comparé à la fiche (date de naissance et date dans l'histoire)
    foreach ($fiches as $f) {
        $nom = mb_strtoupper(trim($f['prenom'] ?: $f['nom']), 'UTF-8');
        if ($nom === '' || empty($parle[$nom])) continue;
        foreach (array_keys($parle[$nom]) as $id) {
            foreach ($lignes[$id]['lignes'] as [$sc, $qui, $t]) {
                if ($qui !== $nom || !preg_match("/\\bj'ai\\s+(\\d{1,3})\\s+ans\\b/iu", $t, $m)) continue;
                $dit = (int)$m[1];
                $attendu = null;
                if ($f['date_naissance'] && !empty($episodes[$id]['date_diege'])) {
                    $attendu = (int)date_diff(date_create($f['date_naissance']), date_create($episodes[$id]['date_diege']))->y;
                } elseif ((int)$f['age'] > 0) {
                    $attendu = (int)$f['age'];
                }
                if ($attendu !== null && abs($attendu - $dit) > 1) $ajouter("age:$nom:$id", 'Âge qui ne colle pas', "$nom dit avoir $dit ans ; d'après sa fiche, il ou elle en a $attendu à ce moment de l'histoire.", $id, $nom);
            }
        }
    }

    // 4. Les dates de l'histoire qui reculent sans flashback
    $plusTard = null;
    foreach ($ordre as $id) {
        $d = $episodes[$id]['date_diege'] ?? null;
        if (!$d) continue;
        if ($plusTard && $d < $plusTard && empty($episodes[$id]['flash'])) $ajouter("date:$id", 'Date qui recule', "Cet épisode est daté du $d, avant un épisode déjà vu (le $plusTard), sans être marqué comme flashback.", $id);
        if (empty($episodes[$id]['flash']) && (!$plusTard || $d > $plusTard)) $plusTard = $d;
    }

    // 5. Un nom qui parle souvent sans fiche, alors qu'une fiche porte un nom proche
    $avecFiche = [];
    foreach ($fiches as $f) foreach ([$f['prenom'], $f['nom'], trim($f['prenom'] . ' ' . $f['nom']), $f['nom_affichage']] as $v) if (trim((string)$v) !== '') $avecFiche[sansAccents(trim($v))] = trim($f['prenom'] . ' ' . $f['nom']);
    foreach ($parle as $nom => $eps) {
        $n = sansAccents($nom);
        // « JOURNALISTE 1 » et « JOURNALISTE 2 » sont deux rôles, pas une faute
        if (isset($avecFiche[$n]) || array_sum($eps) < 3 || preg_match('/\d/', $nom)) continue;
        // Déjà signalé comme variante d'un autre nom : une seule alerte suffit
        if (array_filter($alertes, fn($x) => $x['nom'] === $nom)) continue;
        foreach ($avecFiche as $cle => $fiche) {
            if (mb_strlen($cle) >= 4 && !preg_match('/\d/', $cle) && distanceNoms($n, $cle) === 1) { $ajouter("fiche:$nom", 'Sans fiche', "« $nom » parle " . array_sum($eps) . " fois mais n'a pas de fiche ; la fiche « $fiche » a un nom presque identique.", array_key_first($eps), $nom); break; }
        }
    }
    return ['alertes' => $alertes, 'personnages' => array_keys($parle), 'morts' => (object)$morts];
}
