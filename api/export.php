<?php
// api/export.php — Exporter à la mise en page professionnelle, et réordonner les scènes au tableau de liège
// Un scénario se pagine comme dans Final Draft : Courier 12, six lignes par pouce, des largeurs fixes par élément

const MISE_EN_PAGE_DEFAUT = [
    'papier' => 'A4', 'mentions' => 'fr', 'numeros' => true, 'revision' => true, 'suite' => true, 'titre' => true,
    'auteur' => '', 'contact' => '', 'version' => '',
    'police_roman' => 'Times New Roman', 'taille_roman' => 12, 'interligne' => 2, 'signes' => 1500, 'alinea' => true, 'chapitre_page' => true, 'entete_roman' => true,
    'hmc' => 60, 'decalage' => 15, 'debut_jour' => '08:00', 'debut_nuit' => '19:00', 'premier_jour' => '', 'repos' => [0],
    'liege_couleur' => 'intrigue',
];
// Largeur en caractères Courier de chaque élément, et lignes vides avant lui
const SCENARIO_LARGEURS = ['episode' => 61, 'sequence' => 61, 'action' => 61, 'personnage' => 38, 'parenthese' => 25, 'dialogue' => 35, 'transition' => 61];
const SCENARIO_AVANT = ['episode' => 0, 'sequence' => 2, 'action' => 1, 'personnage' => 1, 'parenthese' => 0, 'dialogue' => 0, 'transition' => 1];

// Les réglages du projet ouvert, lus une fois par requête (l'analyse d'un script n'a pas la base sous la main)
function miseEnPageCourante(): array {
    static $r = null;
    if ($r === null) {
        try { $r = miseEnPage(new PDO('sqlite:' . DB_PATH)); } catch (Throwable $e) { $r = MISE_EN_PAGE_DEFAUT; }
    }
    return $r;
}

function miseEnPage(PDO $db): array {
    $brut = $db->query("SELECT valeur FROM analyse_notes WHERE cle = 'mise-en-page'")->fetchColumn();
    $r = json_decode((string)$brut, true);
    $r = array_merge(MISE_EN_PAGE_DEFAUT, is_array($r) ? $r : []);
    // Une valeur du mauvais type reprend sa valeur par défaut
    foreach (MISE_EN_PAGE_DEFAUT as $cle => $defaut) {
        if (gettype($r[$cle]) !== gettype($defaut) && !(is_numeric($r[$cle]) && is_numeric($defaut))) $r[$cle] = $defaut;
    }
    $r['papier'] = $r['papier'] === 'Letter' ? 'Letter' : 'A4';
    $r['signes'] = max(500, min(5000, (int)$r['signes']));
    $r['taille_roman'] = max(8, min(20, (int)$r['taille_roman']));
    $r['interligne'] = max(1, min(3, (float)$r['interligne']));
    return $r;
}

// Lignes par page : 1 pouce de marge en haut et en bas, six lignes par pouce
function lignesParPage(array $r): int {
    return $r['papier'] === 'Letter' ? 54 : 58;
}

// Le scénario en éléments : séquence, action, personnage, parenthèse, dialogue, transition
function blocsScenario(string $texte): array {
    $texte = preg_replace('/\/\*.*?\*\//s', '', str_replace(["\r", "\u{2019}", "\u{00A0}", "\u{202F}"], ['', "'", ' ', ' '], $texte));
    $blocs = [];
    $avantPremiere = true;
    $dialogue = false;
    $paragraphe = null;
    $lignes = explode("\n", $texte);
    $nomRe = '/^([A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ][A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ\s\'\-\d.]{0,35}?)\s*(\(.*\))?$/u';
    foreach ($lignes as $i => $ligne) {
        $ligne = trim($ligne);
        if ($ligne === '') { $dialogue = false; $paragraphe = null; continue; }
        if (estSlugline($ligne)) { $blocs[] = ['sequence', preg_replace('/\s*#[\w.-]+#\s*$/u', '', $ligne)]; $avantPremiere = false; $dialogue = false; $paragraphe = null; continue; }
        if ($avantPremiere) continue;
        if (estTransition($ligne) || (preg_match('/^[A-ZÀ-Ü\s\']+:$/u', $ligne) && mb_strlen($ligne) < 30)) { $blocs[] = ['transition', $ligne]; $paragraphe = null; continue; }
        $suivante = trim($lignes[$i + 1] ?? '');
        if (!$dialogue && $paragraphe === null && $suivante !== '' && preg_match($nomRe, $ligne, $m) && !estFauxPersonnage(trim($m[1]))) {
            $blocs[] = ['personnage', $ligne];
            $dialogue = true;
            continue;
        }
        if ($dialogue) {
            if (preg_match('/^\(.*\)$/u', $ligne)) { $blocs[] = ['parenthese', $ligne]; continue; }
            $n = count($blocs) - 1;
            if ($blocs[$n][0] === 'dialogue') $blocs[$n][1] .= ' ' . $ligne;
            else $blocs[] = ['dialogue', $ligne];
            continue;
        }
        if ($paragraphe !== null) { $blocs[$paragraphe][1] .= ' ' . $ligne; continue; }
        $blocs[] = ['action', $ligne];
        $paragraphe = count($blocs) - 1;
    }
    return $blocs;
}

function couperLignes(string $texte, int $largeur): array {
    // Au caractère près, accents compris (wordwrap compte les octets)
    $sortie = [];
    $courante = '';
    foreach (preg_split('/\s+/u', trim($texte)) as $mot) {
        if ($courante === '') { $courante = $mot; continue; }
        if (mb_strlen($courante . ' ' . $mot) <= $largeur) $courante .= ' ' . $mot;
        else { $sortie[] = $courante; $courante = $mot; }
    }
    if ($courante !== '') $sortie[] = $courante;
    return $sortie ?: [''];
}

// Les pages, ligne par ligne, et la place de chaque séquence pour en compter les huitièmes
function paginerScenario(array $blocs, array $r): array {
    $lpp = lignesParPage($r);
    $suite = $r['mentions'] === 'en' ? ['(MORE)', " (CONT'D)"] : ['(SUITE)', ' (SUITE)'];
    $pages = [[]];
    $seqs = [];
    $num = 0;
    $place = function () use (&$pages) { return count($pages[count($pages) - 1]); };
    $nouvellePage = function () use (&$pages) { $pages[] = []; };
    $ajouter = function (string $type, string $texte, $n = null) use (&$pages) { $pages[count($pages) - 1][] = [$type, $texte, $n]; };
    $abs = function () use (&$pages, $lpp, $place) { return (count($pages) - 1) * $lpp + $place(); };
    $n = count($blocs);
    for ($i = 0; $i < $n; $i++) {
        [$type, $texte] = $blocs[$i];
        // Chaque épisode d'une série repart en haut d'une page, sous son titre
        if ($type === 'episode') {
            if ($place() > 0) $nouvellePage();
            $ajouter('episode', mb_strtoupper($texte, 'UTF-8'));
            $ajouter('vide', '');
            continue;
        }
        $vides = $place() === 0 ? 0 : SCENARIO_AVANT[$type];
        if ($type === 'personnage') {
            // Le nom, ses parenthèses et sa réplique forment un bloc ; la réplique se coupe avec (SUITE)
            $groupe = [['personnage', mb_strtoupper($texte, 'UTF-8')]];
            for ($j = $i + 1; $j < $n && in_array($blocs[$j][0], ['parenthese', 'dialogue'], true); $j++) {
                foreach (couperLignes($blocs[$j][1], SCENARIO_LARGEURS[$blocs[$j][0]]) as $l) $groupe[] = [$blocs[$j][0], $l];
            }
            $i = $j - 1;
            $libre = $lpp - $place() - $vides;
            if (count($groupe) <= $libre) {
                for ($k = 0; $k < $vides; $k++) $ajouter('vide', '');
                foreach ($groupe as [$t, $l]) $ajouter($t, $l);
                continue;
            }
            // Au moins le nom et deux lignes de réplique en bas de page, sinon tout passe à la page suivante
            $avant = $libre - 1;
            if ($avant >= 3 && count($groupe) - $avant >= 2 && $r['suite']) {
                for ($k = 0; $k < $vides; $k++) $ajouter('vide', '');
                foreach (array_slice($groupe, 0, $avant) as [$t, $l]) $ajouter($t, $l);
                $ajouter('suite', $suite[0]);
                $nouvellePage();
                $ajouter('personnage', $groupe[0][1] . $suite[1]);
                $reste = array_slice($groupe, $avant);
            } else {
                $nouvellePage();
                $reste = $groupe;
            }
            foreach ($reste as [$t, $l]) {
                if ($place() >= $lpp) $nouvellePage();
                $ajouter($t, $l);
            }
            continue;
        }
        $lignes = couperLignes($type === 'sequence' || $type === 'transition' ? mb_strtoupper($texte, 'UTF-8') : $texte, SCENARIO_LARGEURS[$type]);
        // Une séquence ne commence jamais seule en bas de page : il lui faut deux lignes de ce qui suit
        $besoin = $vides + count($lignes) + ($type === 'sequence' ? 3 : 0);
        if ($place() + min($besoin, $type === 'action' ? $vides + 2 : $besoin) > $lpp) { $nouvellePage(); $vides = 0; }
        if ($type === 'sequence') {
            $num++;
            $seqs[] = ['debut' => $abs() + $vides];
            if (count($seqs) > 1) $seqs[count($seqs) - 2]['fin'] = $abs() + $vides;
        }
        for ($k = 0; $k < $vides; $k++) $ajouter('vide', '');
        foreach ($lignes as $l) {
            if ($place() >= $lpp) $nouvellePage();
            $ajouter($type, $l, $type === 'sequence' ? $num : null);
        }
    }
    if ($seqs) $seqs[count($seqs) - 1]['fin'] = $abs();
    if ($pages[count($pages) - 1] === [] && count($pages) > 1) array_pop($pages);
    $total = count($pages) === 1 && !$pages[0] ? 0 : (count($pages) - 1) + $place() / $lpp;
    return [
        'pages' => $pages, 'lpp' => $lpp, 'total' => count($pages),
        'sequences' => array_map(fn($s) => max(0.125, round(($s['fin'] - $s['debut']) / $lpp * 8) / 8), $seqs),
        'exact' => $total,
    ];
}

// ─── Formats ──────────────────────────────────────────────────────────────────

// Les caractères de contrôle collés depuis un autre logiciel rendraient le fichier illisible : on les retire
function xmlEchappe(string $t): string {
    $t = preg_replace('/[^\x{9}\x{A}\x{D}\x{20}-\x{D7FF}\x{E000}-\x{FFFD}\x{10000}-\x{10FFFF}]/u', '', mb_scrub($t, 'UTF-8')) ?? '';
    return htmlspecialchars($t, ENT_XML1 | ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function exportFdx(array $blocs, array $r, string $titre): string {
    $types = ['episode' => 'New Act', 'sequence' => 'Scene Heading', 'action' => 'Action', 'personnage' => 'Character', 'parenthese' => 'Parenthetical', 'dialogue' => 'Dialogue', 'transition' => 'Transition'];
    $num = 0;
    $paras = array_map(function ($b) use ($types, &$num, $r) {
        $attr = $b[0] === 'sequence' && $r['numeros'] ? ' Number="' . (++$num) . '"' : '';
        return '<Paragraph Type="' . $types[$b[0]] . '"' . $attr . '><Text>' . xmlEchappe($b[1]) . '</Text></Paragraph>';
    }, $blocs);
    $titrePage = '<TitlePage><Content><Paragraph Alignment="Center"><Text>' . xmlEchappe(mb_strtoupper($titre, 'UTF-8')) . '</Text></Paragraph>'
        . ($r['auteur'] ? '<Paragraph Alignment="Center"><Text>' . xmlEchappe(($r['mentions'] === 'en' ? 'Written by ' : 'Écrit par ') . $r['auteur']) . '</Text></Paragraph>' : '')
        . ($r['contact'] ? '<Paragraph Alignment="Left"><Text>' . xmlEchappe($r['contact']) . '</Text></Paragraph>' : '') . '</Content></TitlePage>';
    return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\" ?>\n<FinalDraft DocumentType=\"Script\" Template=\"No\" Version=\"5\">\n<Content>\n" . implode("\n", $paras) . "\n</Content>\n" . ($r['titre'] ? $titrePage : '') . "\n</FinalDraft>\n";
}

function exportFountain(array $blocs, array $r, string $titre): string {
    $tete = $r['titre'] ? "Title: $titre\n" . ($r['auteur'] ? "Author: {$r['auteur']}\n" : '') . ($r['contact'] ? "Contact: {$r['contact']}\n" : '') . ($r['version'] ? "Draft date: {$r['version']}\n" : '') . "\n" : '';
    $sortie = '';
    $prec = null;
    $num = 0;
    foreach ($blocs as [$t, $x]) {
        $colle = in_array($t, ['parenthese', 'dialogue'], true) && in_array($prec, ['personnage', 'parenthese', 'dialogue'], true);
        if ($t === 'episode') $x = "===\n\n# $x";
        if ($t === 'sequence') $x = mb_strtoupper($x, 'UTF-8') . ($r['numeros'] ? ' #' . (++$num) . '#' : '');
        if ($t === 'transition') $x = '> ' . mb_strtoupper($x, 'UTF-8');
        if ($t === 'personnage') $x = mb_strtoupper($x, 'UTF-8');
        $sortie .= ($sortie === '' ? '' : ($colle ? "\n" : "\n\n")) . $x;
        $prec = $t;
    }
    return $tete . $sortie . "\n";
}

// Un .docx minimal : un document, des styles, et rien d'autre
function docxMinimal(string $corps, string $styles, string $marges = '1440'): string {
    $chemin = tempnam(sys_get_temp_dir(), 'docx');
    $zip = new ZipArchive();
    $zip->open($chemin, ZipArchive::OVERWRITE);
    $zip->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
    $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    $zip->addFromString('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    $zip->addFromString('word/styles.xml', '<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' . $styles . '</w:styles>');
    $zip->addFromString('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' . $corps . '<w:sectPr><w:pgMar w:top="1440" w:bottom="1440" w:left="' . $marges . '" w:right="1440"/></w:sectPr></w:body></w:document>');
    $zip->close();
    $octets = file_get_contents($chemin);
    @unlink($chemin);
    return $octets;
}

function paraDocx(string $style, string $texte, bool $sautAvant = false): string {
    return '<w:p><w:pPr><w:pStyle w:val="' . $style . '"/>' . ($sautAvant ? '<w:pageBreakBefore/>' : '') . '</w:pPr><w:r><w:t xml:space="preserve">' . xmlEchappe($texte) . '</w:t></w:r></w:p>';
}

function exportDocxScenario(array $blocs, array $r, string $titre): string {
    // Retraits en vingtièmes de point, depuis la marge gauche de 1,5 pouce
    $style = fn($id, $gauche, $droite, $avant, $caps = false, $aligne = 'left') => '<w:style w:type="paragraph" w:styleId="' . $id . '"><w:name w:val="' . $id . '"/><w:pPr><w:spacing w:before="' . $avant . '" w:after="0" w:line="240" w:lineRule="exact"/><w:ind w:left="' . $gauche . '" w:right="' . $droite . '"/><w:jc w:val="' . $aligne . '"/></w:pPr><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="24"/>' . ($caps ? '<w:caps/>' : '') . '</w:rPr></w:style>';
    $styles = $style('Sequence', 0, 0, 480, true) . $style('Action', 0, 0, 240) . $style('Personnage', 3168, 0, 240, true) . $style('Parenthese', 2304, 2880, 0) . $style('Dialogue', 1440, 2160, 0) . $style('Transition', 0, 0, 240, true, 'right') . $style('Titre', 0, 0, 0, true, 'center');
    $noms = ['episode' => 'Titre', 'sequence' => 'Sequence', 'action' => 'Action', 'personnage' => 'Personnage', 'parenthese' => 'Parenthese', 'dialogue' => 'Dialogue', 'transition' => 'Transition'];
    $corps = '';
    if ($r['titre']) {
        $corps .= str_repeat(paraDocx('Titre', ''), 18) . paraDocx('Titre', $titre) . ($r['auteur'] ? paraDocx('Titre', '') . paraDocx('Titre', $r['auteur']) : '') . ($r['contact'] ? paraDocx('Action', $r['contact']) : '');
    }
    foreach ($blocs as $k => [$t, $x]) $corps .= paraDocx($noms[$t], $x, ($r['titre'] && $k === 0) || ($t === 'episode' && $k > 0));
    return docxMinimal($corps, $styles, '2160');
}

// La pièce, acte par acte : pour chaque scène, les présents puis les répliques et les didascalies dans l'ordre
function pieceTheatre(PDO $db, array $ids): array {
    $actes = [];
    foreach (episodesExport($db, $ids) as $e) {
        $lu = lireTheatre((string)$e['texte_episode']);
        $actes[(int)$e['livre']][] = ['n' => (int)$e['numero_episode'], 'titre' => (string)$e['titre'], 'presents' => $lu['debut'], 'evenements' => $lu['evenements']];
    }
    return array_map(fn($sc, $n) => ['n' => $n, 'scenes' => $sc], $actes, array_keys($actes));
}

function romain(int $n): string {
    $s = '';
    foreach (['M' => 1000, 'CM' => 900, 'D' => 500, 'CD' => 400, 'C' => 100, 'XC' => 90, 'L' => 50, 'XL' => 40, 'X' => 10, 'IX' => 9, 'V' => 5, 'IV' => 4, 'I' => 1] as $r => $v) while ($n >= $v) { $s .= $r; $n -= $v; }
    return $s;
}

// Le format de l'édition théâtrale : noms centrés en capitales, didascalies en italique
function exportDocxTheatre(array $piece, array $r, string $titre): string {
    $police = xmlEchappe($r['police_roman']);
    $style = fn($id, $aligne, $avant, $gras = false, $italique = false, $caps = false, $retrait = 0) => '<w:style w:type="paragraph" w:styleId="' . $id . '"><w:name w:val="' . $id . '"/><w:pPr><w:spacing w:before="' . $avant . '" w:after="60" w:line="276" w:lineRule="auto"/><w:ind w:left="' . $retrait . '"/><w:jc w:val="' . $aligne . '"/></w:pPr><w:rPr><w:rFonts w:ascii="' . $police . '" w:hAnsi="' . $police . '"/><w:sz w:val="24"/>' . ($gras ? '<w:b/>' : '') . ($italique ? '<w:i/>' : '') . ($caps ? '<w:caps/>' : '') . '</w:rPr></w:style>';
    $styles = $style('Acte', 'center', 480, true, false, true) . $style('Scene', 'center', 360, true) . $style('Presents', 'center', 60, false, true, true) . $style('Nom', 'center', 240, false, false, true) . $style('Replique', 'both', 0) . $style('Didascalie', 'left', 120, false, true, false, 720) . $style('Centre', 'center', 0, true, false, true);
    $corps = $r['titre'] ? str_repeat(paraDocx('Centre', ''), 12) . paraDocx('Centre', mb_strtoupper($titre, 'UTF-8')) . ($r['auteur'] ? paraDocx('Presents', $r['auteur']) : '') : '';
    foreach ($piece as $k => $a) {
        $corps .= paraDocx('Acte', 'Acte ' . romain($a['n']), $k > 0 || $r['titre']);
        foreach ($a['scenes'] as $sc) {
            $corps .= paraDocx('Scene', 'Scène ' . romain($sc['n']) . ($sc['titre'] ? ' — ' . $sc['titre'] : ''));
            if ($sc['presents']) $corps .= paraDocx('Presents', implode(', ', $sc['presents']));
            $dernier = null;
            foreach ($sc['evenements'] as [$type, $t, $qui]) {
                if ($type === 'did') { $corps .= paraDocx('Didascalie', $t); continue; }
                if ($qui !== $dernier) $corps .= paraDocx('Nom', $qui);
                $corps .= paraDocx('Replique', $t);
                $dernier = $qui;
            }
        }
    }
    return docxMinimal($corps, $styles);
}

// Les chapitres d'un roman, en paragraphes ; *** sépare les scènes
function chapitresManuscrit(PDO $db, array $ids): array {
    $chapitres = [];
    foreach (episodesExport($db, $ids) as $e) {
        $paras = [];
        foreach (paragraphesBruts((string)$e['texte_episode']) as $p) {
            if (preg_match('/^#\s/u', $p)) continue;
            $paras[] = preg_match(PROSE_SEPARATEUR, $p) ? '***' : preg_replace('/(\*\*|__|\*|_)(?=\S)(.+?)(?<=\S)\1/u', '$2', $p);
        }
        $chapitres[] = ['n' => (int)$e['numero_episode'], 'livre' => (int)$e['livre'], 'titre' => (string)$e['titre'], 'paragraphes' => $paras];
    }
    return $chapitres;
}

function exportDocxRoman(array $chapitres, array $r, string $titre): string {
    $ligne = (int)round(240 * (float)$r['interligne']);
    $taille = (int)$r['taille_roman'] * 2;
    $police = xmlEchappe($r['police_roman']);
    $style = fn($id, $aligne, $retrait, $avant) => '<w:style w:type="paragraph" w:styleId="' . $id . '"><w:name w:val="' . $id . '"/><w:pPr><w:spacing w:before="' . $avant . '" w:after="0" w:line="' . $ligne . '" w:lineRule="auto"/><w:ind w:firstLine="' . $retrait . '"/><w:jc w:val="' . $aligne . '"/></w:pPr><w:rPr><w:rFonts w:ascii="' . $police . '" w:hAnsi="' . $police . '"/><w:sz w:val="' . $taille . '"/></w:rPr></w:style>';
    $styles = $style('Texte', 'both', $r['alinea'] ? 567 : 0, 0) . $style('Chapitre', 'center', 0, $r['chapitre_page'] ? 2880 : 480) . $style('Centre', 'center', 0, 0);
    $corps = $r['titre'] ? str_repeat(paraDocx('Centre', ''), 10) . paraDocx('Centre', mb_strtoupper($titre, 'UTF-8')) . ($r['auteur'] ? paraDocx('Centre', $r['auteur']) : '') : '';
    foreach ($chapitres as $k => $c) {
        $corps .= paraDocx('Chapitre', 'Chapitre ' . $c['n'] . ($c['titre'] ? ' — ' . $c['titre'] : ''), $r['chapitre_page'] && ($k > 0 || $r['titre']));
        foreach ($c['paragraphes'] as $p) $corps .= paraDocx($p === '***' ? 'Centre' : 'Texte', $p);
    }
    return docxMinimal($corps, $styles);
}

function exportEpub(array $chapitres, array $r, string $titre): string {
    $chemin = tempnam(sys_get_temp_dir(), 'epub');
    $zip = new ZipArchive();
    $zip->open($chemin, ZipArchive::OVERWRITE);
    $zip->addFromString('mimetype', 'application/epub+zip');
    $zip->setCompressionName('mimetype', ZipArchive::CM_STORE);
    $zip->addFromString('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    $id = 'urn:uuid:' . md5($titre . count($chapitres));
    $items = $spine = $nav = '';
    foreach ($chapitres as $k => $c) {
        $nom = 'chapitre-' . ($k + 1) . '.xhtml';
        $intitule = 'Chapitre ' . $c['n'] . ($c['titre'] ? ' — ' . $c['titre'] : '');
        $corps = implode("\n", array_map(fn($p) => $p === '***' ? '<p class="sep">* * *</p>' : '<p>' . xmlEchappe($p) . '</p>', $c['paragraphes']));
        $zip->addFromString("OEBPS/$nom", '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="fr"><head><title>' . xmlEchappe($intitule) . '</title><link rel="stylesheet" href="style.css"/></head><body><h1>' . xmlEchappe($intitule) . "</h1>\n$corps</body></html>");
        $items .= '<item id="c' . $k . '" href="' . $nom . '" media-type="application/xhtml+xml"/>';
        $spine .= '<itemref idref="c' . $k . '"/>';
        $nav .= '<li><a href="' . $nom . '">' . xmlEchappe($intitule) . '</a></li>';
    }
    $zip->addFromString('OEBPS/style.css', 'body{font-family:serif;line-height:1.5}p{text-indent:1.5em;margin:0;text-align:justify}h1{text-align:center;margin:3em 0 2em}.sep{text-align:center;text-indent:0;margin:1em 0}');
    $zip->addFromString('OEBPS/nav.xhtml', '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="fr"><head><title>Table des matières</title></head><body><nav epub:type="toc"><h1>Table des matières</h1><ol>' . $nav . '</ol></nav></body></html>');
    $zip->addFromString('OEBPS/content.opf', '<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">' . $id . '</dc:identifier><dc:title>' . xmlEchappe($titre) . '</dc:title><dc:language>fr</dc:language>' . ($r['auteur'] ? '<dc:creator>' . xmlEchappe($r['auteur']) . '</dc:creator>' : '') . '<meta property="dcterms:modified">' . gmdate('Y-m-d\TH:i:s\Z') . '</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>' . $items . '</manifest><spine>' . $spine . '</spine></package>');
    $zip->close();
    $octets = file_get_contents($chemin);
    @unlink($chemin);
    return $octets;
}

function episodesExport(PDO $db, array $ids): array {
    $rows = $db->query("
        SELECT e.id, e.numero_episode, e.titre, e.texte_episode, sa.numero AS livre FROM episodes e JOIN saisons sa ON sa.id = e.saison_id
        WHERE COALESCE(TRIM(e.texte_episode), '') != '' ORDER BY sa.numero, e.numero_episode
    ")->fetchAll();
    return $ids ? array_values(array_filter($rows, fn($e) => in_array((int)$e['id'], $ids, true))) : $rows;
}

function handleExport(PDO $db): array {
    $r = miseEnPage($db);
    $format = (string)($_GET['format'] ?? '');
    $ids = array_values(array_filter(array_map('intval', explode(',', (string)($_GET['ids'] ?? '')))));
    $titre = nomProjet(projetDemande() ?? '');
    // Les accents perdus proprement : iconv sur macOS écrit « th'eatre » pour « théâtre »
    $plat = strtr(mb_strtolower($titre, 'UTF-8'), ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'ç' => 'c', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'œ' => 'oe', 'æ' => 'ae', 'ñ' => 'n']);
    $fichier = trim(preg_replace('/[^a-z0-9]+/', '-', $plat), '-') ?: 'export';
    if (estJeu()) {
        $chapitres = analyseJeu($db)['chapitres'];
        return match ($format) {
            'ink' => ['nom' => "$fichier.ink", 'type' => 'text/plain', 'texte' => exportInk($chapitres, $titre)],
            default => ['nom' => "$fichier.twee", 'type' => 'text/plain', 'texte' => exportTwee($chapitres, $titre)],
        };
    }
    if (estTheatre()) {
        $piece = pieceTheatre($db, $ids);
        return match ($format) {
            'docx' => ['nom' => "$fichier.docx", 'type' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'donnees' => base64_encode(exportDocxTheatre($piece, $r, $titre))],
            default => ['titre' => $titre, 'reglages' => $r, 'piece' => $piece, 'mots' => array_sum(array_map(fn($a) => array_sum(array_map(fn($sc) => array_sum(array_map(fn($e) => motsGenre($e[1]), $sc['evenements'])), $a['scenes'])), $piece))],
        };
    }
    if (estRoman()) {
        $chapitres = chapitresManuscrit($db, $ids);
        $signes = array_sum(array_map(fn($c) => array_sum(array_map(fn($p) => mb_strlen($p), $c['paragraphes'])), $chapitres));
        return match ($format) {
            'docx' => ['nom' => "$fichier.docx", 'type' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'donnees' => base64_encode(exportDocxRoman($chapitres, $r, $titre))],
            'epub' => ['nom' => "$fichier.epub", 'type' => 'application/epub+zip', 'donnees' => base64_encode(exportEpub($chapitres, $r, $titre))],
            'md' => ['nom' => "$fichier.md", 'type' => 'text/markdown', 'texte' => "# $titre\n\n" . implode("\n\n", array_map(fn($c) => '## Chapitre ' . $c['n'] . ($c['titre'] ? ' — ' . $c['titre'] : '') . "\n\n" . implode("\n\n", $c['paragraphes']), $chapitres)) . "\n"],
            default => ['titre' => $titre, 'reglages' => $r, 'chapitres' => $chapitres, 'signes' => $signes, 'pages' => (int)ceil($signes / max(500, (int)$r['signes'])) + count($chapitres)],
        };
    }
    // Film et série : un scénario ; chaque épisode d'une série repart sur une nouvelle page
    $eps = episodesExport($db, $ids);
    $blocs = [];
    foreach ($eps as $e) {
        if (!estFilm() && count($eps) > 1) $blocs[] = ['episode', sprintf('S%dE%02d', $e['livre'], $e['numero_episode']) . ($e['titre'] ? ' — ' . $e['titre'] : '')];
        array_push($blocs, ...blocsScenario((string)$e['texte_episode']));
    }
    return match ($format) {
        'fdx' => ['nom' => "$fichier.fdx", 'type' => 'application/xml', 'texte' => exportFdx($blocs, $r, $titre)],
        'fountain' => ['nom' => "$fichier.fountain", 'type' => 'text/plain', 'texte' => exportFountain($blocs, $r, $titre)],
        'docx' => ['nom' => "$fichier.docx", 'type' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'donnees' => base64_encode(exportDocxScenario($blocs, $r, $titre))],
        default => ['titre' => $titre, 'reglages' => $r] + paginerScenario($blocs, $r),
    };
}

// ─── Tableau de liège : les scènes d'un ou plusieurs épisodes, dans un nouvel ordre ─

// Le texte en morceaux qu'on peut déplacer : séquences (INT./EXT.), scènes d'un roman (séparateurs), cases d'une BD
// Le texte est coupé tel quel, sans retoucher les apostrophes ni les espaces : réordonner ne change aucun caractère
function unitesTexte(string $texte): array {
    $texte = str_replace("\r", '', $texte);
    $avant = '';
    $unites = [];
    // Chaque unité garde la ligne qui l'ouvre (en-tête, séparateur de scène, CASE n)
    $ouvre = estRoman()
        ? fn(string $l) => (bool)preg_match(PROSE_SEPARATEUR, $l)
        : (estBD() ? fn(string $l) => (bool)preg_match(BD_CASE, preg_replace('/^#{1,6}\s+|\*\*|__/u', '', $l)) : fn(string $l) => estSlugline(str_replace("\u{00A0}", ' ', $l)));
    foreach (explode("\n", $texte) as $l) {
        if ($ouvre(trim($l))) { $unites[] = $l . "\n"; continue; }
        if ($unites) $unites[count($unites) - 1] .= $l . "\n";
        else $avant .= $l . "\n";
    }
    // Dans un roman, le texte d'avant le premier séparateur est la première scène
    if (estRoman() && trim($avant) !== '') { array_unshift($unites, $avant); $avant = ''; }
    return ['avant' => $avant, 'unites' => array_map('rtrim', $unites)];
}

// L'empreinte d'une carte ne dépend pas de son numéro de case : renuméroter une BD garde ses notes
function empreinteUnite(string $texte): string {
    return empreinteSequence(preg_replace('/^(\s*(?:case|vignette|panel|panneau|image|cadre)\s*)\d+/iu', '$1', $texte));
}

function cartesLiege(PDO $db, array $ids): array {
    $cartes = [];
    foreach (episodesExport($db, $ids) as $e) {
        $u = unitesTexte((string)$e['texte_episode']);
        foreach ($u['unites'] as $k => $texte) {
            $lignes = array_values(array_filter(array_map('trim', explode("\n", $texte)), fn($l) => $l !== ''));
            $titre = $lignes[0] ?? '';
            $persos = [];
            if (estRoman()) {
                foreach (lireProse($texte) as $b) if ($b['type'] === 'dialogue' && !in_array($b['qui'], ['INCONNU', 'NARRATEUR'], true)) $persos[$b['qui']] = ($persos[$b['qui']] ?? 0) + 1;
                $titre = mb_substr(trim(preg_replace('/\s+/u', ' ', preg_replace(PROSE_SEPARATEUR . 'm', '', $texte))), 0, 60);
            } elseif (estBD()) {
                foreach (lireBD($texte) as $c) {
                    foreach ($c['bulles'] as $b) if ($b['type'] === 'bulle') $persos[$b['qui']] = ($persos[$b['qui']] ?? 0) + 1;
                    $titre = mb_substr($c['desc'] ?: ($c['bulles'][0]['texte'] ?? ''), 0, 60);
                }
            } else {
                foreach ((lireLignesEpisode($texte)['lignes'] ?? []) as $l) if ($l[1] !== null) $persos[$l[1]] = ($persos[$l[1]] ?? 0) + 1;
            }
            arsort($persos);
            $corps = trim(implode(' ', array_slice($lignes, 1)));
            $cartes[] = [
                'e' => (int)$e['id'], 'k' => $k, 'h' => empreinteUnite($texte),
                'titre' => $titre, 'extrait' => mb_substr($corps, 0, 140),
                'mots' => preg_match_all("/[\p{L}\p{N}][\p{L}\p{N}'’-]*/u", $texte),
                'pages' => estRoman() || estBD() ? null : pagesScenario($texte),
                'persos' => array_slice(array_keys($persos), 0, 4),
            ];
        }
    }
    return $cartes;
}

// La signature de chaque scène du storyboard : son contenu, sans son numéro
function signaturesStoryboard(string $texte): array {
    $sig = [];
    foreach ($texte === '' ? [] : scenesStoryboard($texte) as $s) {
        $sig[$s['i']] = md5(json_encode([estBD() ? ($s['desc'] ?? '') : $s['slug'], array_map(fn($l) => [$l['qui'], $l['texte']], $s['lignes'])]));
    }
    return $sig;
}

// Le nouvel ordre : chaque épisode reçoit ses unités dans l'ordre donné ; aucune ne se perd ni ne se double
// Tout est vérifié avant d'écrire quoi que ce soit
function reordonnerLiege(PDO $db, array $body): array {
    $ordre = $body['ordre'] ?? null;
    if (!is_array($ordre) || !$ordre) return ['error' => 'Ordre vide : rien n\'a été changé.'];
    // Chaque entrée : [épisode qui reçoit, rang de la scène dans son épisode d'origine, épisode d'origine, empreinte]
    $propre = [];
    foreach ($ordre as $x) {
        if (!is_array($x) || count($x) < 3) return ['error' => 'Ordre invalide : rien n\'a été changé.'];
        $x = array_values($x);
        foreach ([0, 1, 2] as $n) if (!is_int($x[$n]) && !(is_string($x[$n]) && ctype_digit($x[$n]))) return ['error' => 'Ordre invalide : rien n\'a été changé.'];
        $propre[] = [(int)$x[0], (int)$x[1], (int)$x[2], is_string($x[3] ?? null) ? $x[3] : null];
    }
    $concernes = array_values(array_unique(array_merge(array_column($propre, 0), array_column($propre, 2))));
    $eps = [];
    foreach (episodesExport($db, $concernes) as $e) $eps[(int)$e['id']] = $e;
    if (count($eps) !== count($concernes)) return ['error' => 'Épisode inconnu : rien n\'a été changé.'];
    $decoupes = array_map(fn($e) => unitesTexte((string)$e['texte_episode']), $eps);
    $attendu = array_sum(array_map(fn($d) => count($d['unites']), $decoupes));
    $vus = [];
    $nouveaux = array_fill_keys(array_keys($eps), []);
    foreach ($propre as [$cible, $k, $src, $h]) {
        $cle = "$src:$k";
        if (isset($vus[$cle]) || !isset($decoupes[$src]['unites'][$k])) return ['error' => 'Ordre incomplet ou invalide : rien n\'a été changé.'];
        // Le texte a changé depuis l'ouverture du tableau (autre onglet, brouillon validé) : on ne devine pas
        if ($h !== null && empreinteUnite($decoupes[$src]['unites'][$k]) !== $h) return ['error' => 'Le texte a changé depuis l\'ouverture du tableau : recharge-le, rien n\'a été changé.'];
        $vus[$cle] = true;
        $nouveaux[$cible][] = $decoupes[$src]['unites'][$k];
    }
    if (count($vus) !== $attendu) return ['error' => 'Une scène manque dans le nouvel ordre : rien n\'a été changé.'];
    foreach ($nouveaux as $unites) if (!$unites) return ['error' => 'Chaque épisode doit garder au moins une scène : rien n\'a été changé.'];

    $textes = [];
    foreach ($nouveaux as $id => $unites) {
        if (estBD()) $unites = array_map(fn($u, $n) => preg_replace('/^(\s*(?:#{1,6}\s+)?(?:\*\*|__)?\s*(?:case|vignette|panel|panneau|image|cadre)\s*)\d+/iu', '${1}' . ($n + 1), $u, 1), $unites, array_keys($unites));
        // Une scène de roman qui n'avait pas de séparateur en prend un si elle n'est plus la première
        // et la première perd un simple *** devenu inutile (un titre de scène, lui, reste)
        if (estRoman()) $unites = array_map(function ($u, $n) {
            $tete = trim(strtok($u, "\n"));
            if ($n === 0 && preg_match(PROSE_SEPARATEUR, $tete) && !preg_match('/^#/u', $tete)) return ltrim(substr($u, strlen(strtok($u, "\n"))));
            return $n > 0 && !preg_match(PROSE_SEPARATEUR, $tete) ? "***\n\n" . $u : $u;
        }, $unites, array_keys($unites));
        $avant = trim($decoupes[$id]['avant']) !== '' ? rtrim($decoupes[$id]['avant']) . "\n\n" : '';
        $textes[$id] = $avant . implode("\n\n", $unites) . "\n";
    }
    // Les scènes du storyboard, avant et après, reconnues à leur contenu
    $avantSig = array_map(fn($e) => signaturesStoryboard((string)$e['texte_episode']), $eps);
    $apresSig = [];
    foreach ($textes as $id => $t) $apresSig[$id] = signaturesStoryboard($t);
    $libres = [];
    foreach ($apresSig as $id => $sigs) foreach ($sigs as $i => $sig) $libres[$sig][] = [$id, $i];
    $deplacements = [];
    foreach ($avantSig as $id => $sigs) foreach ($sigs as $i => $sig) {
        if (empty($libres[$sig])) continue;
        [$vers, $j] = array_shift($libres[$sig]);
        if ($vers !== $id || $j !== $i) $deplacements[] = [$id, $i, $vers, $j];
    }

    foreach ($textes as $id => $texte) {
        if ($texte === (string)$eps[$id]['texte_episode']) continue;
        ob_start();
        handleUpload($db, ['episode_id' => $id, 'texte' => $texte]);
        ob_end_clean();
    }
    if (!$deplacements) return ['ok' => true];
    // Les plans, les voix et le plan au sol suivent leur scène ; les fiches de personnage ne bougent pas
    assurerStoryboard($db);
    $db->beginTransaction();
    try {
        $plans = $db->prepare('UPDATE storyboard_plans SET episode_id = ?, scene = ? WHERE episode_id = ? AND scene = ?');
        $sons = $db->prepare('UPDATE storyboard_sons SET episode_id = ?, scene = ? WHERE episode_id = ? AND scene = ?');
        foreach ($deplacements as $n => [$src, $i]) { $plans->execute([-1 - $n, 0, $src, $i]); $sons->execute([-1 - $n, 0, $src, $i]); }
        foreach ($deplacements as $n => [, , $vers, $j]) { $plans->execute([$vers, $j, -1 - $n, 0]); $sons->execute([$vers, $j, -1 - $n, 0]); }
        $lire = $db->prepare('SELECT valeur FROM analyse_notes WHERE cle = ?');
        $suppr = $db->prepare('DELETE FROM analyse_notes WHERE cle = ?');
        $ajout = $db->prepare('INSERT OR REPLACE INTO analyse_notes (cle, valeur) VALUES (?, ?)');
        $sol = [];
        foreach ($deplacements as [$src, $i]) {
            $lire->execute(["sb-sol:$src:$i"]);
            $sol["$src:$i"] = $lire->fetchColumn();
        }
        foreach ($deplacements as [$src, $i]) if ($sol["$src:$i"] !== false) $suppr->execute(["sb-sol:$src:$i"]);
        foreach ($deplacements as [$src, $i, $vers, $j]) if ($sol["$src:$i"] !== false) $ajout->execute(["sb-sol:$vers:$j", $sol["$src:$i"]]);
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }
    return ['ok' => true];
}
