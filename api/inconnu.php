<?php
// api/inconnu.php — Un fichier d'un format qu'on ne connaît pas : on regarde ce qu'il y a dedans plutôt que son nom.
// D'abord on reconnaît le contenu (Word, Celtx, Montage, RTF, HTML, Final Draft… même mal nommés),
// sinon on récupère les morceaux de texte lisibles. Le résultat passe toujours par l'aperçu avant d'être gardé.

const INCONNU_ZIP_MAX = 40 * 1024 * 1024;

// Du texte ordinaire ? (peu de caractères de contrôle, encodage cohérent)
function ressembleATexte(string $o): bool {
    $echantillon = substr($o, 0, 65536);
    if ($echantillon === '') return true;
    if (str_contains($echantillon, "\0")) return false;
    $controle = preg_match_all('/[\x00-\x08\x0E-\x1F\x7F]/', $echantillon);
    if ($controle / strlen($echantillon) >= 0.01) return false;
    // Encore faut-il assez de lettres et d'espaces : sinon ce sont des octets qui ne veulent rien dire
    $texte = mb_check_encoding($echantillon, 'UTF-8') ? $echantillon : mb_convert_encoding($echantillon, 'UTF-8', 'Windows-1252');
    $total = max(1, mb_strlen($texte));
    return preg_match_all('/[\p{L}\p{N}\s]/u', $texte) / $total >= 0.6;
}

// Le format, d'après les premiers octets
function formatReconnu(string $o): string {
    $debut = ltrim(substr($o, 0, 512), "\xEF\xBB\xBF \t\r\n");
    if (str_starts_with($o, 'bplist00')) return 'bplist';
    if (str_starts_with($o, "PK\x03\x04")) return 'zip';
    if (str_starts_with($o, "\xFF\xFE") || str_starts_with($o, "\xFE\xFF")) return 'utf16';
    if (str_starts_with($debut, '{\\rtf')) return 'rtf';
    if (str_starts_with($o, '%PDF')) return 'pdf';
    if (str_starts_with($o, 'SQLite format 3')) return 'sqlite';
    if (str_starts_with($o, "\xD0\xCF\x11\xE0")) return 'ole';
    if (preg_match('/^<\?xml|^<FinalDraft|^<!DOCTYPE|^<html|^<[a-z]/i', $debut)) {
        if (stripos($debut . substr($o, 512, 2048), '<FinalDraft') !== false) return 'fdx';
        return preg_match('/<html|<!DOCTYPE html|<body/i', substr($o, 0, 4096)) ? 'html' : 'xml';
    }
    return ressembleATexte($o) ? 'texte' : 'binaire';
}

// Le texte d'un XML quelconque : un paragraphe par élément qui porte du texte
function texteXmlQuelconque(string $xml): string {
    $doc = new DOMDocument();
    if (!@$doc->loadXML($xml, LIBXML_NONET | LIBXML_COMPACT)) return texteHtml($xml);
    $paras = [];
    $xp = new DOMXPath($doc);
    foreach ($xp->query('//text()[normalize-space()]') as $t) $paras[] = [0, $t->nodeValue];
    return assemblerParagraphes($paras);
}

// Une archive : on cherche ce qu'elle contient de connu, sinon le plus gros texte
function texteZipInconnu(string $octets): string {
    if (strlen($octets) > INCONNU_ZIP_MAX) throw new RuntimeException('Archive trop grosse pour être examinée.');
    $zip = ouvrirZip($octets);
    $noms = [];
    for ($i = 0; $i < min($zip->numFiles, 5000); $i++) {
        $s = $zip->statIndex($i);
        if ($s && !str_contains($s['name'], '__MACOSX')) $noms[$s['name']] = $s['size'];
    }
    $a = fn(string $re) => (bool)preg_grep($re, array_keys($noms));
    if (isset($noms['word/document.xml'])) return texteDocx($octets);
    if (isset($noms['META-INF/container.xml'])) return texteEpub($octets);
    if (isset($noms['content.xml'])) return texteOdt($octets);
    if ($a('/\.scrivx$/i')) return texteScrivener($octets);
    if ($a('/(^|\/)script.*\.html?$/i') && $a('/project\.rdf$/i')) return texteCeltx($octets);
    if ($a('/text\.(fountain|md|markdown|txt)$/i')) return texteHighland($octets);
    // Sinon : le plus gros fichier texte, HTML ou XML de l'archive
    arsort($noms);
    foreach ($noms as $nom => $taille) {
        if ($taille > 20 * 1024 * 1024 || !preg_match('/\.(txt|fountain|md|markdown|html?|xhtml|xml|fdx|rtf)$/i', $nom)) continue;
        $contenu = $zip->getFromName($nom);
        if ($contenu === false) continue;
        $texte = trim(texteSelonContenu($contenu, 1));
        if (mb_strlen($texte) > 40) return $texte;
    }
    throw new RuntimeException('Cette archive ne contient pas de texte reconnaissable.');
}

// Une liste de propriétés d'Apple : un script Montage, sinon toutes les phrases qu'elle contient
function texteBplistInconnu(string $octets): string {
    try { return texteMontage($octets); } catch (RuntimeException $e) {
        // Un vrai Montage vide : on le dit, plutôt que de sortir la liste des styles du modèle
        if (str_contains($e->getMessage(), 'vide')) throw $e;
    }
    $p = new Bplist($octets);
    $phrases = [];
    foreach ($p->chaines() as $s) {
        $s = trim($s);
        if (mb_strlen($s) >= 3 && preg_match('/\p{L}.*\s.*\p{L}/su', $s) && !preg_match('/^(NS|\$|AVNR|com\.|https?:)/', $s)) $phrases[$s] = true;
    }
    if (!$phrases) throw new RuntimeException('Aucun texte trouvé dans ce fichier.');
    return implode("\n\n", array_keys($phrases));
}

// Dernier recours : les suites de caractères lisibles, en UTF-8 et en UTF-16 (comme la commande « strings »)
function morceauxLisibles(string $o): string {
    $o = substr($o, 0, 30 * 1024 * 1024);
    $morceaux = [];
    $ajouter = function (string $s) use (&$morceaux) {
        $s = trim(preg_replace('/\s+/u', ' ', $s));
        // Au moins trois mots d'au moins deux lettres : on écarte le bruit binaire
        if (preg_match_all('/\p{L}{2,}/u', $s) >= 3 && preg_match_all('/\p{L}/u', $s) >= mb_strlen($s) * 0.5) $morceaux[$s] = true;
    };
    if (preg_match_all('/(?:[\x20-\x7E\t\r\n]|[\xC2-\xDF][\x80-\xBF]|[\xE0-\xEF][\x80-\xBF]{2}){12,}/', $o, $m)) foreach ($m[0] as $s) $ajouter($s);
    foreach (['UTF-16LE' => '/(?:[\x20-\x7E\xA0-\xFF\t\r\n]\x00){12,}/', 'UTF-16BE' => '/(?:\x00[\x20-\x7E\xA0-\xFF\t\r\n]){12,}/'] as $enc => $re) {
        if (preg_match_all($re, $o, $m)) foreach ($m[0] as $s) $ajouter(mb_convert_encoding($s, 'UTF-8', $enc));
    }
    if (!$morceaux) throw new RuntimeException('Format inconnu : aucun texte lisible n\'a été trouvé dans ce fichier.');
    // Un même texte lu deux fois (décalé d'un octet en UTF-16) : on garde le plus long
    $liste = array_keys($morceaux);
    usort($liste, fn($a, $b) => mb_strlen($b) <=> mb_strlen($a));
    $gardes = [];
    foreach ($liste as $m) {
        $double = false;
        foreach ($gardes as $g) if (str_contains($g, $m)) { $double = true; break; }
        if (!$double) $gardes[] = $m;
    }
    $gardes = array_values(array_filter(array_keys($morceaux), fn($m) => in_array($m, $gardes, true)));
    return implode("\n\n", $gardes);
}

// Le texte d'un fichier, d'après son contenu seulement
function texteSelonContenu(string $octets, int $profondeur = 0): string {
    switch (formatReconnu($octets)) {
        case 'bplist': return texteBplistInconnu($octets);
        case 'zip': if ($profondeur > 0) break; return texteZipInconnu($octets);
        case 'utf16': return mb_convert_encoding(substr($octets, 2), 'UTF-8', str_starts_with($octets, "\xFF\xFE") ? 'UTF-16LE' : 'UTF-16BE');
        case 'rtf': return texteRtf($octets);
        case 'fdx': return texteFdx(decoderTexte($octets));
        case 'html': return texteHtml(decoderTexte($octets));
        case 'xml': return texteXmlQuelconque(decoderTexte($octets));
        case 'pdf': throw new RuntimeException('Le texte d\'un PDF n\'est pas lisible ici : copie-le depuis Aperçu, ou exporte l\'original en Word ou en Fountain.');
        case 'ole': throw new RuntimeException('Ancien format Office : enregistre le fichier en .docx depuis Word ou LibreOffice.');
        case 'texte': return decoderTexte($octets);
    }
    return morceauxLisibles($octets);
}
