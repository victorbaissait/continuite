<?php
// api/formats.php — Lire un manuscrit ou un script quel que soit son format
// Le texte rendu garde un paragraphe par bloc, séparés par une ligne vide ; un titre devient « # Titre » (« ## » pour le niveau 2)

const FORMATS_TAILLE_MAX = 40 * 1024 * 1024;

function extraireTexte(string $nom, string $octets): string {
    $ext = strtolower(pathinfo($nom, PATHINFO_EXTENSION));
    switch ($ext) {
        case 'docx': case 'docm': case 'dotx': return texteDocx($octets);
        case 'odt': case 'ott': return texteOdt($octets);
        case 'epub': return texteEpub($octets);
        case 'rtf': return texteRtf($octets);
        case 'htm': case 'html': case 'xhtml': return texteHtml(decoderTexte($octets));
        case 'zip': return texteScrivener($octets);
        case 'fdx': return texteFdx(decoderTexte($octets));
        case 'twee': case 'tw': case 'tw3': return texteTwee(decoderTexte($octets));
        case 'yarn': return texteYarn(decoderTexte($octets));
        case 'ink': return texteInk(decoderTexte($octets));
        case 'json': throw new RuntimeException('Un export JSON (Articy, Ink compilé) ne garde pas assez le texte : exporte en Twine (.twee), Yarn (.yarn) ou Ink (.ink).');
        case 'highland': return texteHighland($octets);
        case 'fadein': return texteFadeIn($octets);
        case 'celtx': return texteCeltx($octets);
        case 'montage': return texteMontage($octets);
        case 'wdz': throw new RuntimeException('WriterDuet garde son texte dans un format fermé : exporte le scénario en Final Draft (.fdx) ou en Fountain.');
        case 'scw': case 'mmsw': throw new RuntimeException('Ce format de Movie Magic n\'est pas lisible : exporte le scénario en Final Draft (.fdx) ou en RTF.');
        case 'pages': throw new RuntimeException('Pages garde son texte dans un format illisible : exporte-le en Word (Fichier → Exporter vers → Word).');
        case 'doc': throw new RuntimeException('L\'ancien format .doc n\'est pas lisible : enregistre le fichier en .docx.');
        case 'gdoc': throw new RuntimeException('Un raccourci Google Docs ne contient pas le texte : passe par Fichier → Télécharger → Microsoft Word.');
        case 'txt': case 'fountain': case 'spmd': case 'md': case 'markdown': case 'text':
            return ressembleATexte($octets) ? decoderTexte($octets) : texteSelonContenu($octets);
        default: return texteSelonContenu($octets);
    }
}

function decoderTexte(string $octets): string {
    if (str_starts_with($octets, "\xEF\xBB\xBF")) $octets = substr($octets, 3);
    if (mb_check_encoding($octets, 'UTF-8')) return $octets;
    return mb_convert_encoding($octets, 'UTF-8', 'Windows-1252');
}

function ouvrirZip(string $octets): ZipArchive {
    $chemin = tempnam(sys_get_temp_dir(), 'lemenu');
    file_put_contents($chemin, $octets);
    $zip = new ZipArchive();
    if ($zip->open($chemin) !== true) throw new RuntimeException('Fichier abîmé ou qui n\'est pas une archive.');
    register_shutdown_function(fn() => @unlink($chemin));
    return $zip;
}

function lireXml(string $xml): DOMDocument {
    $doc = new DOMDocument();
    if (!@$doc->loadXML($xml, LIBXML_NONET | LIBXML_COMPACT)) throw new RuntimeException('Contenu XML illisible.');
    return $doc;
}

// Les paragraphes finissent séparés par une ligne vide, sans espaces superflus
function assemblerParagraphes(array $paragraphes): string {
    $propres = [];
    foreach ($paragraphes as [$niveau, $texte]) {
        $texte = trim(preg_replace("/[ \t\x{00A0}]+/u", ' ', $texte));
        if ($texte === '') continue;
        $propres[] = ($niveau ? str_repeat('#', min(3, $niveau)) . ' ' : '') . $texte;
    }
    return implode("\n\n", $propres);
}

// ─── Word ───────────────────────────────────────────────────────────────────

function texteDocx(string $octets): string {
    $zip = ouvrirZip($octets);
    $xml = $zip->getFromName('word/document.xml');
    if ($xml === false) throw new RuntimeException('Ce fichier Word ne contient pas de texte.');
    $w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

    // Un style compte comme titre par son nom (Heading 1, Titre 2…) ou par son niveau de plan
    $niveaux = [];
    $styles = $zip->getFromName('word/styles.xml');
    if ($styles !== false) {
        $xp = new DOMXPath(lireXml($styles));
        $xp->registerNamespace('w', $w);
        foreach ($xp->query('//w:style[@w:type="paragraph"]') as $style) {
            $id = $style->getAttributeNS($w, 'styleId');
            $nomStyle = strtolower((string)$xp->evaluate('string(w:name/@w:val)', $style));
            $plan = $xp->evaluate('string(w:pPr/w:outlineLvl/@w:val)', $style);
            if (preg_match('/^(heading|titre|title)\s*(\d)?$/', $nomStyle, $m)) $niveaux[$id] = $m[1] === 'title' ? 1 : (int)($m[2] ?? 1);
            elseif ($plan !== '' && (int)$plan < 3) $niveaux[$id] = (int)$plan + 1;
        }
    }

    $xp = new DOMXPath(lireXml($xml));
    $xp->registerNamespace('w', $w);
    $lire = function (DOMNode $p) use ($xp, $w): string {
        $texte = '';
        foreach ($xp->query('.//w:t | .//w:tab | .//w:br | .//w:noBreakHyphen', $p) as $n) {
            // Le texte des notes de bas de page et des commentaires n'est pas dans le corps
            $texte .= match ($n->localName) { 't' => $n->textContent, 'tab' => "\t", 'br' => $n->getAttributeNS($w, 'type') === 'page' ? ' ' : "\n", default => '-' };
        }
        return $texte;
    };
    $paragraphes = [];
    foreach ($xp->query('//w:body/*') as $bloc) {
        // Un script de pub en tableau : une colonne IMAGE, une colonne SON, une ligne par plan
        if ($bloc->localName === 'tbl') {
            $lignes = [];
            foreach ($xp->query('w:tr', $bloc) as $tr) $lignes[] = array_map(fn($tc) => trim(implode("\n", array_map($lire, iterator_to_array($xp->query('.//w:p', $tc))))), iterator_to_array($xp->query('w:tc', $tr)));
            $entete = array_map(fn($c) => mb_strtolower($c, 'UTF-8'), $lignes[0] ?? []);
            $colImage = array_key_first(array_filter($entete, fn($c) => preg_match('/^(image|visuel|vid[ée]o)/u', $c)));
            $colSon = array_key_first(array_filter($entete, fn($c) => preg_match('/^(son|audio|texte|voix)/u', $c)));
            if ($colImage !== null && $colSon !== null) {
                foreach (array_slice($lignes, 1) as $l) {
                    $paragraphes[] = [0, 'IMAGE : ' . str_replace("\n", ' ', $l[$colImage] ?? '')];
                    foreach (array_filter(array_map('trim', explode("\n", $l[$colSon] ?? ''))) as $son) {
                        $paragraphes[] = [0, preg_match('/^[\p{Lu}][\p{Lu}\s\'’-]{1,24}\s*:/u', $son) || preg_match('/^(vo|son|sfx|musique|mention)\s*:/iu', $son) ? $son : "SON : $son"];
                    }
                }
                continue;
            }
            foreach ($xp->query('.//w:p', $bloc) as $p) $paragraphes[] = [0, $lire($p)];
            continue;
        }
        if ($bloc->localName !== 'p') continue;
        $p = $bloc;
        $style = (string)$xp->evaluate('string(w:pPr/w:pStyle/@w:val)', $p);
        $plan = (string)$xp->evaluate('string(w:pPr/w:outlineLvl/@w:val)', $p);
        $niveau = $niveaux[$style] ?? (preg_match('/^(Heading|Titre)(\d)$/i', $style, $m) ? (int)$m[2] : ($plan !== '' && (int)$plan < 3 ? (int)$plan + 1 : 0));
        $paragraphes[] = [$niveau, $lire($p)];
    }
    return assemblerParagraphes($paragraphes);
}

// ─── LibreOffice ────────────────────────────────────────────────────────────

function texteOdt(string $octets): string {
    $xml = ouvrirZip($octets)->getFromName('content.xml');
    if ($xml === false) throw new RuntimeException('Ce fichier LibreOffice ne contient pas de texte.');
    $doc = lireXml($xml);
    $t = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
    $paragraphes = [];
    $enLigne = function (DOMNode $n) use (&$enLigne, $t): string {
        $s = '';
        foreach ($n->childNodes as $c) {
            if ($c instanceof DOMText) { $s .= $c->data; continue; }
            if (!$c instanceof DOMElement || $c->namespaceURI !== $t) { $s .= $c->textContent; continue; }
            $s .= match ($c->localName) {
                's' => str_repeat(' ', max(1, (int)$c->getAttributeNS($t, 'c'))),
                'tab' => "\t", 'line-break' => "\n",
                'note', 'annotation', 'bookmark', 'bookmark-start', 'bookmark-end' => '',
                default => $enLigne($c),
            };
        }
        return $s;
    };
    $parcourir = function (DOMNode $n) use (&$parcourir, &$paragraphes, $enLigne, $t): void {
        foreach ($n->childNodes as $c) {
            if (!$c instanceof DOMElement) continue;
            if ($c->namespaceURI === $t && $c->localName === 'h') $paragraphes[] = [max(1, (int)$c->getAttributeNS($t, 'outline-level') ?: 1), $enLigne($c)];
            elseif ($c->namespaceURI === $t && $c->localName === 'p') $paragraphes[] = [0, $enLigne($c)];
            elseif (!in_array($c->localName, ['tracked-changes', 'sequence-decls', 'note'], true)) $parcourir($c);
        }
    };
    $corps = $doc->getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:office:1.0', 'text')->item(0);
    if ($corps) $parcourir($corps);
    return assemblerParagraphes($paragraphes);
}

// ─── HTML et ePub ───────────────────────────────────────────────────────────

function paragraphesHtml(string $html): array {
    $doc = new DOMDocument();
    @$doc->loadHTML('<?xml encoding="UTF-8">' . $html, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
    $paragraphes = [];
    $blocs = ['p', 'div', 'li', 'blockquote', 'pre', 'section', 'article', 'td', 'dd', 'dt', 'figcaption'];
    $parcourir = function (DOMNode $n) use (&$parcourir, &$paragraphes, $blocs): void {
        foreach ($n->childNodes as $c) {
            if (!$c instanceof DOMElement) continue;
            $tag = strtolower($c->localName);
            if (in_array($tag, ['script', 'style', 'nav', 'head', 'aside', 'sup'], true)) continue;
            if (preg_match('/^h([1-6])$/', $tag, $m)) { $paragraphes[] = [(int)$m[1], $c->textContent]; continue; }
            if ($tag === 'hr') { $paragraphes[] = [0, '***']; continue; }
            if (in_array($tag, $blocs, true)) {
                // Un bloc qui contient d'autres blocs est parcouru, sinon il forme un paragraphe
                $interieur = false;
                foreach ($c->childNodes as $e) if ($e instanceof DOMElement && (in_array(strtolower($e->localName), $blocs, true) || preg_match('/^h[1-6]$/', strtolower($e->localName)))) { $interieur = true; break; }
                if ($interieur) { $parcourir($c); continue; }
                $texte = '';
                foreach ($c->childNodes as $e) $texte .= $e instanceof DOMElement && strtolower($e->localName) === 'br' ? "\n" : $e->textContent;
                $paragraphes[] = [0, $texte];
                continue;
            }
            $parcourir($c);
        }
    };
    $corps = $doc->getElementsByTagName('body')->item(0) ?? $doc;
    $parcourir($corps);
    return $paragraphes;
}

function texteHtml(string $html): string {
    return assemblerParagraphes(paragraphesHtml($html));
}

function texteEpub(string $octets): string {
    $zip = ouvrirZip($octets);
    $conteneur = $zip->getFromName('META-INF/container.xml');
    if ($conteneur === false) throw new RuntimeException('Ce fichier ePub n\'a pas de table des matières.');
    $opfChemin = (string)(new DOMXPath(lireXml($conteneur)))->evaluate('string(//*[local-name()="rootfile"]/@full-path)');
    $opf = $zip->getFromName($opfChemin);
    if ($opf === false) throw new RuntimeException('Ce fichier ePub est incomplet.');
    $xp = new DOMXPath(lireXml($opf));
    $dossier = str_contains($opfChemin, '/') ? dirname($opfChemin) . '/' : '';
    $fichiers = [];
    foreach ($xp->query('//*[local-name()="manifest"]/*[local-name()="item"]') as $item) {
        if (str_contains((string)$item->getAttribute('properties'), 'nav')) continue;
        $fichiers[$item->getAttribute('id')] = $dossier . rawurldecode($item->getAttribute('href'));
    }
    $parties = [];
    foreach ($xp->query('//*[local-name()="spine"]/*[local-name()="itemref"]') as $ref) {
        $chemin = $fichiers[$ref->getAttribute('idref')] ?? null;
        $html = $chemin ? $zip->getFromName($chemin) : false;
        if ($html === false) continue;
        $p = paragraphesHtml($html);
        if (!array_filter($p, fn($x) => trim($x[1]) !== '')) continue;
        $titre = preg_match('#<title[^>]*>(.*?)</title>#is', $html, $m) ? trim(html_entity_decode(strip_tags($m[1]), ENT_QUOTES, 'UTF-8')) : '';
        $parties[] = ['p' => $p, 'titre' => $titre];
    }
    // Sans aucun titre dans le livre, chaque fichier du livre devient un chapitre
    $avecTitres = false;
    foreach ($parties as $partie) foreach ($partie['p'] as $x) if ($x[0]) $avecTitres = true;
    $paragraphes = [];
    foreach ($parties as $i => $partie) {
        if (!$avecTitres) $paragraphes[] = [1, $partie['titre'] ?: 'Chapitre ' . ($i + 1)];
        array_push($paragraphes, ...$partie['p']);
    }
    return assemblerParagraphes($paragraphes);
}

// ─── RTF ────────────────────────────────────────────────────────────────────

function texteRtf(string $rtf): string {
    $ignorees = ['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'headerl', 'headerr', 'headerf', 'footer', 'footerl', 'footerr', 'footerf', 'footnote', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'filetbl', 'revtbl', 'object', 'fldinst', 'annotation', 'atnid', 'atnauthor', 'bkmkstart', 'bkmkend', 'field'];
    $speciaux = ['emdash' => '—', 'endash' => '–', 'lquote' => '‘', 'rquote' => "'", 'ldblquote' => '“', 'rdblquote' => '”', 'bullet' => '•', 'tab' => "\t", 'line' => "\n"];
    $pile = [];
    $ignorer = false;
    $uc = 1;
    $sauter = 0;
    $paragraphes = [];
    $courant = '';
    $niveau = 0;
    $octets = '';
    $vider = function () use (&$octets, &$courant) {
        if ($octets !== '') { $courant .= mb_convert_encoding($octets, 'UTF-8', 'Windows-1252'); $octets = ''; }
    };
    $n = strlen($rtf);
    for ($i = 0; $i < $n; $i++) {
        $c = $rtf[$i];
        if ($c === '{') { $pile[] = [$ignorer, $uc]; continue; }
        if ($c === '}') { [$ignorer, $uc] = array_pop($pile) ?? [false, 1]; continue; }
        if ($c === "\r" || $c === "\n") continue;
        if ($c !== '\\') {
            if ($sauter > 0) { $sauter--; continue; }
            if (!$ignorer) $octets .= $c;
            continue;
        }
        $suivant = $rtf[$i + 1] ?? '';
        if ($suivant === "'") {
            $i += 3;
            if ($sauter > 0) { $sauter--; continue; }
            if (!$ignorer) $octets .= chr(hexdec(substr($rtf, $i - 1, 2)));
            continue;
        }
        if ($suivant === '*') { $ignorer = true; $i++; continue; }
        if (!ctype_alpha($suivant)) {
            $i++;
            if ($ignorer) continue;
            $vider();
            $courant .= match ($suivant) { '~' => ' ', '_' => '-', '-' => '', "\n", "\r" => "\n", default => $suivant };
            continue;
        }
        preg_match('/\G([a-z]+)(-?\d+)? ?/i', $rtf, $m, 0, $i + 1);
        $i += strlen($m[0]);
        [$mot, $param] = [$m[1], isset($m[2]) ? (int)$m[2] : null];
        if (in_array($mot, $ignorees, true)) { $ignorer = true; continue; }
        if ($ignorer) continue;
        if ($mot === 'uc') { $uc = $param ?? 1; continue; }
        if ($mot === 'u') {
            $vider();
            $courant .= mb_chr($param < 0 ? $param + 65536 : $param, 'UTF-8');
            $sauter = $uc;
            continue;
        }
        if ($mot === 'par' || $mot === 'sect' || $mot === 'page') {
            $vider();
            $paragraphes[] = [$niveau, $courant];
            $courant = '';
            continue;
        }
        if ($mot === 'pard') { $niveau = 0; continue; }
        if ($mot === 'outlinelevel') { $niveau = min(3, ($param ?? 0) + 1); continue; }
        if (isset($speciaux[$mot])) { $vider(); $courant .= $speciaux[$mot]; }
    }
    $vider();
    $paragraphes[] = [$niveau, $courant];
    return assemblerParagraphes($paragraphes);
}

// ─── Scrivener (dossier .scriv compressé en .zip) ───────────────────────────

function texteScrivener(string $octets): string {
    $zip = ouvrirZip($octets);
    $scrivx = null;
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $nom = $zip->getNameIndex($i);
        if (str_ends_with(strtolower($nom), '.scrivx') && !str_contains($nom, '__MACOSX')) { $scrivx = $nom; break; }
    }
    if ($scrivx === null) throw new RuntimeException('Cette archive ne contient pas de projet Scrivener (.scrivx).');
    $racine = str_contains($scrivx, '/') ? dirname($scrivx) . '/' : '';
    $xp = new DOMXPath(lireXml($zip->getFromName($scrivx)));
    $brouillon = $xp->query('//BinderItem[@Type="DraftFolder"]')->item(0);
    if (!$brouillon) throw new RuntimeException('Le projet Scrivener n\'a pas de dossier Manuscrit.');

    $contenu = function (DOMElement $item) use ($zip, $racine): string {
        foreach ([$racine . 'Files/Data/' . $item->getAttribute('UUID') . '/content.rtf', $racine . 'Files/Docs/' . $item->getAttribute('ID') . '.rtf'] as $chemin) {
            $rtf = $zip->getFromName($chemin);
            if ($rtf !== false) return texteRtf($rtf);
        }
        return '';
    };
    // Le modèle Roman de Scrivener : Manuscrit > chapitres (dossiers) > scènes (textes)
    // Un dossier qui contient des dossiers, ou des textes titrés « Chapitre … », est un livre
    $chapitreTitre = fn(string $t) => (bool)preg_match('/^(chapitre|chap\.|prologue|épilogue|epilogue)\b/iu', $t);
    $morceaux = [];
    $parcourir = function (DOMElement $parent, int $profondeur, bool $dansLivre) use (&$parcourir, &$morceaux, $xp, $contenu, $chapitreTitre): void {
        $precedentTexte = false;
        foreach ($xp->query('Children/BinderItem', $parent) as $item) {
            $titre = trim((string)$xp->evaluate('string(Title)', $item)) ?: 'Sans titre';
            $enfants = iterator_to_array($xp->query('Children/BinderItem', $item));
            $dossier = $item->getAttribute('Type') === 'Folder' || $enfants;
            if ($dossier) {
                $livre = !$dansLivre && array_filter($enfants, fn($e) => $e->getAttribute('Type') === 'Folder' || $chapitreTitre(trim((string)$xp->evaluate('string(Title)', $e))));
                $morceaux[] = ($livre || !$dansLivre ? '# ' : '## ') . $titre;
                $texte = $contenu($item);
                if (trim($texte) !== '') $morceaux[] = $texte;
                $parcourir($item, $profondeur + 1, $dansLivre || (bool)$livre);
                $precedentTexte = false;
                continue;
            }
            $texte = $contenu($item);
            if ($profondeur === 1 || $chapitreTitre($titre)) $morceaux[] = ($dansLivre ? '## ' : '# ') . $titre;
            elseif ($precedentTexte) $morceaux[] = '***';
            if (trim($texte) !== '') $morceaux[] = $texte;
            $precedentTexte = !($profondeur === 1 || $chapitreTitre($titre));
        }
    };
    $parcourir($brouillon, 1, false);
    return implode("\n\n", $morceaux);
}

// ─── Jeux : Twine, Yarn, Ink → un lieu par passage ──────────────────────────
// Chaque passage devient « # Nom », ses liens des sorties, ses options des choix de dialogue

function texteTwee(string $t): string {
    $sortie = [];
    foreach (preg_split('/^::\s*/mu', $t) as $passage) {
        if (trim($passage) === '') continue;
        [$tete, $corps] = array_pad(explode("\n", $passage, 2), 2, '');
        $nom = trim(preg_replace('/\s*[\[{].*$/u', '', $tete));
        if ($nom === '' || in_array($nom, ['StoryTitle', 'StoryData', 'StoryInit', 'UserScript', 'UserStylesheet'], true)) continue;
        $lignes = ["# $nom", "LIEU : $nom"];
        $corps = preg_replace_callback('/\[\[([^\]]+)\]\]/u', function ($m) use (&$lignes) {
            $l = $m[1];
            if (str_contains($l, '->')) [$label, $cible] = array_map('trim', explode('->', $l, 2));
            elseif (str_contains($l, '<-')) [$cible, $label] = array_map('trim', explode('<-', $l, 2));
            elseif (str_contains($l, '|')) [$label, $cible] = array_map('trim', explode('|', $l, 2));
            else $label = $cible = trim($l);
            $lignes[] = ">> $label";
            $lignes[] = "SORTIE : $cible";
            return $label;
        }, $corps);
        array_splice($lignes, 2, 0, [trim(preg_replace('/<<[^>]*>>|\(\w+:[^)]*\)/u', '', $corps))]);
        $sortie[] = implode("\n", array_filter($lignes, fn($x) => $x !== ''));
    }
    if (!$sortie) throw new RuntimeException('Aucun passage Twine (« :: Nom ») dans ce fichier.');
    return implode("\n\n", $sortie);
}

function texteYarn(string $t): string {
    $sortie = [];
    foreach (preg_split('/^===\s*$/mu', $t) as $noeud) {
        if (!preg_match('/^title:\s*(.+)$/mu', $noeud, $m)) continue;
        $nom = trim($m[1]);
        $corps = explode("\n---", $noeud, 2)[1] ?? '';
        $lignes = ["# $nom", "LIEU : $nom"];
        foreach (explode("\n", $corps) as $l) {
            $retrait = str_repeat(' ', strlen($l) - strlen(ltrim($l)));
            $l = trim($l);
            if ($l === '') continue;
            if (preg_match('/<<\s*jump\s+([^>]+)>>/u', $l, $j) || preg_match('/^\[\[(?:[^|\]]*\|)?([^\]]+)\]\]$/u', $l, $j)) { $lignes[] = $retrait . 'SORTIE : ' . trim($j[1]); continue; }
            if (preg_match('/^->\s*(.+)$/u', $l, $o)) { $lignes[] = $retrait . '>> ' . trim(preg_replace('/<<[^>]*>>/u', '', $o[1])); continue; }
            if (str_starts_with($l, '<<')) continue;
            if (preg_match('/^([^:]{1,30}):\s*(.+)$/u', $l, $d)) { $lignes[] = $retrait . mb_strtoupper(trim($d[1]), 'UTF-8') . ' : ' . $d[2]; continue; }
            $lignes[] = $retrait . $l;
        }
        $sortie[] = implode("\n", $lignes);
    }
    if (!$sortie) throw new RuntimeException('Aucun nœud Yarn (« title: … ») dans ce fichier.');
    return implode("\n\n", $sortie);
}

function texteInk(string $t): string {
    $sortie = [];
    $courant = null;
    $fermer = function () use (&$courant, &$sortie) { if ($courant) $sortie[] = implode("\n", $courant); };
    foreach (explode("\n", str_replace("\r", '', $t)) as $l) {
        $l = rtrim($l);
        if (preg_match('/^\s*={2,}\s*(\w[\w ]*)\s*=*\s*$/u', $l, $m)) { $fermer(); $nom = trim($m[1]); $courant = ["# $nom", "LIEU : $nom"]; continue; }
        if ($courant === null) $courant = ['# Début', 'LIEU : Début'];
        $t2 = trim($l);
        if ($t2 === '' || str_starts_with($t2, '//') || str_starts_with($t2, 'VAR ') || str_starts_with($t2, '~')) continue;
        if (preg_match('/^([*+]+)\s*(?:\[([^\]]*)\])?\s*([^-]*?)\s*(?:->\s*(\w+))?$/u', $t2, $c)) {
            $retrait = str_repeat('  ', strlen($c[1]) - 1);
            $courant[] = $retrait . '>> ' . trim(($c[2] ?? '') . ' ' . ($c[3] ?? ''));
            if (!empty($c[4]) && $c[4] !== 'END' && $c[4] !== 'DONE') $courant[] = "$retrait  SORTIE : " . $c[4];
            continue;
        }
        if (preg_match('/^->\s*(\w+)/u', $t2, $d)) { if (!in_array($d[1], ['END', 'DONE'], true)) $courant[] = 'SORTIE : ' . $d[1]; continue; }
        $courant[] = $t2;
    }
    $fermer();
    return implode("\n\n", $sortie);
}
