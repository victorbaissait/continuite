<?php
// api/roman.php — Un projet Roman : la prose est relue comme un script pour que toute l'analyse s'applique
// Dialogues repérés aux tirets et aux guillemets ; qui parle, aux incises (« dit Marie »), sinon par alternance

const PROSE_VERBES = "dit|dis|disait|demanda|demandai|demande|répondit|répondis|répond|répliqua|réplique|s'écria|s'écrie|s'exclama|s'exclame|murmura|murmurai|murmure|cria|crie|lança|lance|ajouta|ajoutai|ajoute|reprit|repris|reprend|souffla|souffle|chuchota|chuchote|hurla|hurle|fit|fis|fait|poursuivit|poursuit|continua|continue|soupira|soupirai|soupire|protesta|proteste|expliqua|explique|déclara|déclare|insista|insiste|grogna|grogne|rétorqua|rétorque|objecta|observa|remarqua|annonça|annonce|conclut|avoua|admit|ironisa|plaisanta|bredouilla|balbutia|gronda|siffla|marmonna|marmonne|interrogea|coupa|coupe|lâcha|lâche|glissa|glisse|s'étonna|s'impatienta|confirma|corrigea|précisa|suggéra|rappela|commenta|enchaîna|renchérit|reconnut|nota|sourit|souris|rit|répéta|répétai|questionna|supplia|ordonna|jura|gémit|sanglota|hasarda|risqua|tenta|admit|concéda";
const PROSE_SEPARATEUR = '/^(?:(?:\*\s*){1,3}|[#~•◆◇✦⁂§°]+|-{3,}|_{3,}|={3,}|#{2,6}\s.*)$/u';
const PROSE_GUILLEMETS = '/«\s*(.+?)\s*»|“\s*(.+?)\s*”/su';

function estRoman(): bool {
    return defined('PROJET_ROMAN') && PROJET_ROMAN;
}

// Les noms des fiches et des lieux servent à reconnaître qui parle et où se passe la scène
function contexteProse(?PDO $db = null): array {
    static $ctx = ['persos' => [], 'lieux' => [], 'h' => ''];
    if ($db === null) return $ctx;
    $persos = [];
    foreach ($db->query('SELECT prenom, nom, nom_affichage, sexe FROM personnages')->fetchAll() as $p) {
        $canon = mb_strtoupper(trim($p['prenom'] ?: $p['nom']), 'UTF-8');
        if ($canon === '') continue;
        $variantes = array_filter([trim((string)$p['prenom']), trim((string)$p['nom']), trim($p['prenom'] . ' ' . $p['nom']), trim((string)$p['nom_affichage'])], fn($v) => mb_strlen($v) >= 2);
        foreach ($variantes as $v) $persos[mb_strtolower($v, 'UTF-8')] = ['n' => $canon, 's' => strtoupper((string)$p['sexe'])];
    }
    uksort($persos, fn($a, $b) => mb_strlen($b) <=> mb_strlen($a));
    $lieux = [];
    foreach ($db->query('SELECT nom FROM lieux')->fetchAll(PDO::FETCH_COLUMN) as $l) {
        $plat = mb_strtolower(trim(preg_replace("/^(le |la |les |l')/iu", '', trim((string)$l))), 'UTF-8');
        if (mb_strlen($plat) >= 3) $lieux[$plat] = mb_strtoupper(trim($l), 'UTF-8');
    }
    uksort($lieux, fn($a, $b) => mb_strlen($b) <=> mb_strlen($a));
    $ctx = ['persos' => $persos, 'lieux' => $lieux, 'h' => md5(json_encode([$persos, $lieux]))];
    return $ctx;
}

// À ajouter aux clés de cache : la lecture d'un roman change quand une fiche est créée
function empreinteProse(): string {
    return estRoman() ? 'roman' . contexteProse()['h'] : '';
}

function compterMotsProse(string $texte): int {
    $texte = preg_replace('/^#{1,6}\s.*$/mu', '', $texte);
    return preg_match_all("/[\p{L}\p{N}][\p{L}\p{N}'’-]*/u", $texte);
}

function regexNoms(array $noms): ?string {
    if (!$noms) return null;
    return '/(?<![\p{L}])(' . implode('|', array_map(fn($n) => preg_quote($n, '/'), array_keys($noms))) . ')(?![\p{L}])/iu';
}

// Les lignes coupées en plein milieu d'une phrase (PDF, texte brut) sont recollées
function paragraphesBruts(string $texte): array {
    $texte = str_replace(["\u{2019}", "\u{00A0}", "\u{202F}", "\r"], ["'", ' ', ' ', ''], $texte);
    $paras = [];
    $tampon = '';
    foreach (explode("\n", $texte) as $ligne) {
        $ligne = trim($ligne);
        if ($ligne === '') {
            if ($tampon !== '') $paras[] = $tampon;
            $tampon = '';
            continue;
        }
        if ($tampon !== '' && !preg_match('/[.!?»”:…"\)]$/u', $tampon) && preg_match('/^\p{Ll}/u', $ligne)) $tampon .= ' ' . $ligne;
        else {
            if ($tampon !== '') $paras[] = $tampon;
            $tampon = $ligne;
        }
    }
    if ($tampon !== '') $paras[] = $tampon;
    return $paras;
}

// Découpe la prose : scènes, narration et dialogues, avec la personne qui parle
function lireProse(string $texte): array {
    $ctx = contexteProse();
    $reNoms = regexNoms($ctx['persos']);
    $reLieux = regexNoms($ctx['lieux']);
    $verbes = PROSE_VERBES;
    $reIncisePronom = "/(?:^|[\s,!?…»”])($verbes)(?:-t-|-)(je|il|elle|iel|on)\b/iu";
    $reInciseNom = "/(?:^|[,!?…»”]\s*|\s)($verbes)\s+((?:(?:le|la|les|l'|madame|monsieur|mme|m\.|mlle|docteur|maître|tante|oncle|la petite|le petit|la vieille|le vieux)\s*)?\p{Lu}[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+)?|(?:le|la|l'|un|une)\s*\p{Ll}[\p{L}-]+)/u";

    $sortie = [['type' => 'scene', 'lieu' => null]];
    $iScene = 0;
    $derniers = [];
    $vusScene = [];
    $parGenre = [];
    $precedent = null;
    $connu = function (string $nom) use ($ctx): ?array {
        return $ctx['persos'][mb_strtolower(trim($nom), 'UTF-8')] ?? null;
    };
    $mentionner = function (string $texte) use ($reNoms, $ctx, &$parGenre, &$vusScene): ?string {
        if (!$reNoms || !preg_match_all($reNoms, $texte, $m, PREG_OFFSET_CAPTURE)) return null;
        foreach ($m[1] as [$nom]) {
            $p = $ctx['persos'][mb_strtolower($nom, 'UTF-8')];
            if ($p['s']) $parGenre[$p['s']] = $p['n'];
            $vusScene = array_values(array_unique([$p['n'], ...$vusScene]));
        }
        return $ctx['persos'][mb_strtolower($m[1][0][0], 'UTF-8')]['n'];
    };

    foreach (paragraphesBruts($texte) as $para) {
        if (preg_match('/^#\s/u', $para)) continue;
        if (preg_match(PROSE_SEPARATEUR, $para)) {
            $sortie[] = ['type' => 'scene', 'lieu' => null];
            $iScene = count($sortie) - 1;
            $derniers = [];
            $vusScene = [];
            $precedent = null;
            continue;
        }
        $para = preg_replace('/(\*\*|__|\*|_)(?=\S)(.+?)(?<=\S)\1/u', '$2', $para);
        if ($sortie[$iScene]['lieu'] === null && $reLieux && preg_match($reLieux, $para, $m)) $sortie[$iScene]['lieu'] = $ctx['lieux'][mb_strtolower($m[1], 'UTF-8')];

        $tiret = preg_match('/^[—–-]\s*(.*)$/su', $para, $mt);
        $guillemets = preg_match_all(PROSE_GUILLEMETS, $para, $mg, PREG_SET_ORDER);
        if (!$tiret && !$guillemets) {
            $sujet = $mentionner($para);
            $sortie[] = ['type' => 'narration', 'texte' => $para];
            $precedent = ['narration', preg_match('/^\P{L}*(\p{Lu}[\p{L}\'-]+)/u', $para, $ms) && $connu($ms[1]) ? $connu($ms[1])['n'] : ($sujet && mb_stripos(mb_substr($para, 0, 40), $sujet) !== false ? $sujet : null)];
            continue;
        }
        if ($tiret) {
            $parole = $mt[1];
            $reste = $parole;
        } else {
            $parole = implode(' ', array_map(fn($g) => $g[1] !== '' ? $g[1] : ($g[2] ?? ''), $mg));
            $reste = trim(preg_replace(PROSE_GUILLEMETS, ' ', $para));
            if (preg_match('/^\P{L}*\p{L}/u', $reste) && !preg_match("/^[\s,]*($verbes)\b/iu", $reste) && mb_strlen($reste) > 40) {
                $sortie[] = ['type' => 'narration', 'texte' => $reste];
            }
        }

        $qui = null;
        if (preg_match($reInciseNom, $reste, $mi) && !preg_match('/^(je|il|elle|on|iel)$/iu', $mi[2])) {
            $nom = trim($mi[2]);
            $qui = $connu($nom)['n'] ?? mb_strtoupper($nom, 'UTF-8');
        } elseif (preg_match($reIncisePronom, $reste, $mi)) {
            $pronom = mb_strtolower($mi[2], 'UTF-8');
            if ($pronom === 'je') $qui = 'NARRATEUR';
            elseif ($pronom === 'il' && isset($parGenre['M'])) $qui = $parGenre['M'];
            elseif ($pronom === 'elle' && isset($parGenre['F'])) $qui = $parGenre['F'];
        }
        if ($qui === null && !$tiret && preg_match('/^\P{L}*(\p{Lu}[\p{L}\'-]+)/u', $reste, $ms) && $connu($ms[1])) $qui = $connu($ms[1])['n'];
        if ($qui === null && $precedent && $precedent[0] === 'narration' && $precedent[1]) $qui = $precedent[1];
        if ($qui === null && $precedent && $precedent[0] === 'dialogue' && count($derniers) >= 2) $qui = $derniers[0] === $precedent[1] ? $derniers[1] : $derniers[0];
        // Une seule voix entendue jusque-là : répond la dernière personne présente dans la scène
        if ($qui === null && $precedent && $precedent[0] === 'dialogue') $qui = array_values(array_diff($vusScene, [$precedent[1]]))[0] ?? null;
        $qui ??= 'INCONNU';

        // L'incise n'est pas dite : « Je pars, dit Marie. Tu viens ? » garde « Je pars. Tu viens ? »
        $parole = preg_replace("/\s*(?:,|(?<=[?!…]))\s*($verbes)(?:(?:-t-|-)(?:je|il|elle|iel|on)|\s+[^.,;!?…»]+)[^.;!?…»]*/iu", '', $parole);
        $parole = trim(preg_replace(['/[«»“”]/u', '/([?!…])\s*\./u'], ['', '$1'], $parole));
        if ($parole === '') continue;
        $sortie[] = ['type' => 'dialogue', 'qui' => $qui, 'texte' => $parole];
        if ($p = $connu($qui)) { if ($p['s']) $parGenre[$p['s']] = $p['n']; }
        $vusScene = array_values(array_unique([$qui, ...$vusScene]));
        if (($derniers[0] ?? null) !== $qui) $derniers = array_slice(array_values(array_unique([$qui, ...$derniers])), 0, 2);
        $precedent = ['dialogue', $qui];
    }
    return $sortie;
}

// La prose réécrite au format que lit l'analyse des scripts
function proseVersScript(string $texte): string {
    $lignes = [];
    foreach (lireProse($texte) as $bloc) {
        if ($bloc['type'] === 'scene') $lignes[] = 'INT. ' . ($bloc['lieu'] ?? '');
        elseif ($bloc['type'] === 'dialogue') $lignes[] = $bloc['qui'] . "\n" . $bloc['texte'];
        else {
            // Une phrase en capitales serait lue comme un nom de personnage
            $t = $bloc['texte'];
            $lignes[] = mb_strtoupper($t, 'UTF-8') === $t ? mb_convert_case($t, MB_CASE_TITLE, 'UTF-8') : $t;
        }
    }
    return implode("\n\n", $lignes);
}

// ─── Données des vues Roman ─────────────────────────────────────────────────

function finProposee(string $phrase): string {
    $phrase = rtrim($phrase, " \t»”\"");
    if (str_ends_with($phrase, '?')) return 'question';
    if (str_ends_with($phrase, '…') || str_ends_with($phrase, '...') || str_ends_with($phrase, '!')) return 'suspens';
    return 'plate';
}

function chapitresRoman(PDO $db): array {
    $ctx = contexteProse();
    $reNoms = regexNoms($ctx['persos']);
    $rows = $db->query("
        SELECT e.id, e.texte_episode, st.stats_json
        FROM episodes e JOIN saisons sa ON sa.id = e.saison_id
        LEFT JOIN episode_stats st ON st.episode_id = e.id
        WHERE COALESCE(TRIM(e.texte_episode), '') != ''
        ORDER BY sa.numero, e.numero_episode
    ")->fetchAll();
    $resultat = [];
    foreach ($rows as $r) {
        $blocs = lireProse($r['texte_episode']);
        $narration = implode(' ', array_map(fn($b) => $b['texte'], array_filter($blocs, fn($b) => $b['type'] === 'narration')));
        $motsNarration = max(1, compterMotsProse($narration));
        $je = preg_match_all("/(?<![\p{L}])(je|j'|me|m'|moi|mon|ma|mes)(?![\p{L}])/iu", $narration);
        $comptes = [];
        if ($reNoms && preg_match_all($reNoms, $narration, $m)) {
            foreach ($m[1] as $nom) {
                $n = $ctx['persos'][mb_strtolower($nom, 'UTF-8')]['n'];
                $comptes[$n] = ($comptes[$n] ?? 0) + 1;
            }
        }
        arsort($comptes);
        $pov = $je / $motsNarration >= 0.015 ? 'Je' : (($comptes && reset($comptes) >= 3) ? mb_convert_case(array_key_first($comptes), MB_CASE_TITLE, 'UTF-8') : '');
        $textes = array_values(array_filter($blocs, fn($b) => $b['type'] !== 'scene'));
        $dernier = $textes ? end($textes)['texte'] : '';
        $phrases = preg_split('/(?<=[.!?…])\s+/u', trim($dernier));
        $phrase = end($phrases) ?: '';
        $stats = json_decode((string)$r['stats_json'], true) ?: [];
        $mots = compterMotsProse($r['texte_episode']);
        $resultat[(int)$r['id']] = [
            'mots' => $mots,
            'dialogue' => $mots ? (int)round(100 * ($stats['nb_mots_dialogue'] ?? 0) / $mots) : 0,
            'inconnu' => (int)(($stats['repliques_par_perso']['INCONNU']['nb_repliques'] ?? 0)),
            'repliques' => (int)($stats['nb_repliques_total'] ?? 0),
            'pov' => $pov,
            'fin' => finProposee($phrase),
            'phrase' => mb_substr($phrase, -220),
        ];
    }
    return $resultat;
}

// Le roman réécrit en scénario : une séquence par scène, la narration en didascalies, les dialogues en répliques
function adapterRoman(PDO $db): array {
    if (!estRoman()) return ['error' => 'Seul un roman s\'adapte en scénario.'];
    $rows = $db->query("
        SELECT e.numero_episode, sa.numero AS livre, e.titre, e.texte_episode FROM episodes e JOIN saisons sa ON sa.id = e.saison_id
        WHERE COALESCE(TRIM(e.texte_episode), '') != '' ORDER BY sa.numero, e.numero_episode
    ")->fetchAll();
    $sortie = [];
    $sequences = 0;
    foreach ($rows as $r) {
        $scene = 0;
        foreach (lireProse((string)$r['texte_episode']) as $bloc) {
            if ($bloc['type'] === 'scene') {
                $scene++;
                $sequences++;
                $sortie[] = 'INT. ' . ($bloc['lieu'] ?: 'LIEU À PRÉCISER') . ' — CH. ' . $r['numero_episode'] . ($scene > 1 ? '.' . $scene : '');
                continue;
            }
            if ($bloc['type'] === 'dialogue') {
                $qui = $bloc['qui'] === 'NARRATEUR' ? 'NARRATEUR (OFF)' : $bloc['qui'];
                $sortie[] = $qui . "\n" . $bloc['texte'];
                continue;
            }
            // Une didascalie dit ce qu'on voit : la narration est gardée telle quelle, à resserrer ensuite
            $t = $bloc['texte'];
            $sortie[] = mb_strtoupper($t, 'UTF-8') === $t ? mb_convert_case($t, MB_CASE_TITLE, 'UTF-8') : $t;
        }
    }
    return ['texte' => implode("\n\n", $sortie), 'chapitres' => count($rows), 'sequences' => $sequences];
}

function handleExtraire(array $body): array {
    $nom = basename(texteCorps($body['nom'] ?? ''));
    $octets = base64_decode(texteCorps($body['donnees'] ?? ''), true);
    if ($nom === '' || $octets === false || $octets === '') return ['error' => 'Fichier vide ou illisible.'];
    if (strlen($octets) > FORMATS_TAILLE_MAX) return ['error' => 'Fichier trop lourd (40 Mo au plus).'];
    try {
        $sortie = ['texte' => extraireTexte($nom, $octets)];
        // Un fichier Montage garde aussi ses rôles et leurs notes : proposés ensuite pour les fiches personnages
        if (str_starts_with($octets, 'bplist00')) {
            try { $roles = rolesMontage($octets); if ($roles) $sortie['roles'] = $roles; } catch (RuntimeException $e) { /* sans rôles */ }
        }
        return $sortie;
    } catch (RuntimeException $e) {
        return ['error' => $e->getMessage()];
    }
}
