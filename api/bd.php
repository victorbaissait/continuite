<?php
// api/bd.php — Un projet BD : des albums (les saisons), des planches (les épisodes), des cases (les scènes)
// Un scénario de BD s'écrit « CASE 2 », la description de l'image, puis « MARIE : » pour chaque bulle

const BD_CASE = '/^(?:case|vignette|panel|panneau|image|cadre)\s*(\d+)\b\s*[:.—–-]?\s*(.*)$/iu';
const BD_PLANCHE = '/^(?:planche|page|pl\.)\s*\d+\b.*$/iu';
const BD_BULLE = '/^(?:bulle\s*\d*\s*[:.—–-]?\s*)?([\p{Lu}\p{Lt}][\p{L}\'’ .-]{0,28}?)\s*(\([^)]{0,40}\))?\s*:\s*(.+)$/u';
const BD_RECITATIF = '/^(r[ée]citatif|cartouche|narration|narrateur|l[ée]gende|texte|caption|off)$/iu';
const BD_SON = '/^(sfx|son|sons|onomatop[ée]e|onomatop[ée]es|bruit|bruitage|fx)$/iu';
// « Plan large : le port » décrit l'image, ce n'est pas quelqu'un qui parle
const BD_PAS_NOM = '/^(plan|gros|tr[èe]s gros|vue|plong[ée]e|contre|champ|cadrage|cadre|d[ée]cor|description|action|ambiance|lieu|moment|note|notes|insert|d[ée]tail|zoom|travelling|panoramique|ext|int|jour|nuit|dessin|couleur|couleurs|lumi[èe]re)\b/iu';
// Limite de mots d'une bulle, selon le format des pages
const BD_MOTS_BULLE = ['fb' => 25, 'rg' => 30, 'manga' => 15, 'comics' => 25];

function estBD(): bool {
    return defined('PROJET_TYPE') && PROJET_TYPE === 'bd';
}

function compterMotsBD(string $texte): int {
    return preg_match_all("/[\p{L}\p{N}][\p{L}\p{N}'’-]*/u", $texte);
}

// Les cases d'une planche, chacune avec sa description et ses bulles dans l'ordre
function lireBD(string $texte): array {
    $texte = str_replace(["\r", "\u{2019}", "\u{00A0}", "\u{202F}"], ['', "'", ' ', ' '], $texte);
    $ctx = contexteProse();
    $reLieux = regexNoms($ctx['lieux'] ?? []);
    $cases = [];
    $courante = null;
    $bulle = false;
    $ouvrir = function (int $numero, string $debut) use (&$cases, &$courante): void {
        if ($courante !== null) $cases[] = $courante;
        $courante = ['n' => $numero, 'desc' => trim($debut), 'bulles' => [], 'lieu' => null];
    };
    foreach (explode("\n", $texte) as $ligne) {
        $ligne = trim(preg_replace('/^#{1,6}\s+|\*\*|__/u', '', $ligne));
        if ($ligne === '') { $bulle = false; continue; }
        if (preg_match(BD_PLANCHE, $ligne)) continue;
        if (preg_match(BD_CASE, $ligne, $m)) {
            $ouvrir((int)$m[1], $m[2]);
            $bulle = false;
            continue;
        }
        if ($courante === null) $ouvrir(1, '');
        if (preg_match(BD_BULLE, $ligne, $m) && !preg_match('/\s(de|du|des|et|à|en|sur|dans)\s/iu', ' ' . $m[1] . ' ') && !preg_match(BD_PAS_NOM, $m[1])) {
            $qui = trim($m[1]);
            $type = preg_match(BD_RECITATIF, $qui) ? 'recitatif' : (preg_match(BD_SON, $qui) ? 'son' : 'bulle');
            $courante['bulles'][] = ['qui' => mb_strtoupper($qui, 'UTF-8'), 'note' => trim($m[2] ?? '', '() '), 'texte' => trim($m[3]), 'type' => $type];
            $bulle = true;
            continue;
        }
        if ($bulle) {
            $courante['bulles'][count($courante['bulles']) - 1]['texte'] .= ' ' . $ligne;
            continue;
        }
        $courante['desc'] = trim($courante['desc'] . ' ' . $ligne);
    }
    if ($courante !== null) $cases[] = $courante;
    foreach ($cases as &$c) {
        if ($reLieux && preg_match($reLieux, $c['desc'], $m)) $c['lieu'] = $ctx['lieux'][mb_strtolower($m[1], 'UTF-8')];
        foreach ($c['bulles'] as &$b) $b['mots'] = compterMotsBD($b['texte']);
        unset($b);
        $c['mots'] = array_sum(array_column($c['bulles'], 'mots'));
    }
    unset($c);
    return $cases;
}

// La planche réécrite au format que lit l'analyse des scripts : une case par scène, une bulle par réplique
function bdVersScript(string $texte): string {
    $lignes = [];
    foreach (lireBD($texte) as $c) {
        $lignes[] = 'INT. ' . ($c['lieu'] ?? '');
        // Une description en capitales serait lue comme un nom de personnage
        if ($c['desc'] !== '') $lignes[] = mb_strtoupper($c['desc'], 'UTF-8') === $c['desc'] ? mb_convert_case($c['desc'], MB_CASE_TITLE, 'UTF-8') : $c['desc'];
        foreach ($c['bulles'] as $b) {
            if ($b['type'] === 'bulle') $lignes[] = $b['qui'] . "\n" . $b['texte'];
            else $lignes[] = mb_convert_case(mb_strtolower($b['qui'], 'UTF-8'), MB_CASE_TITLE, 'UTF-8') . ' — ' . $b['texte'];
        }
    }
    return implode("\n\n", $lignes);
}

// Comment finit la dernière case : ce qui pousse, ou non, à tourner la page
function finCaseBD(?array $case): string {
    if (!$case) return 'plate';
    $dernier = $case['bulles'] ? end($case['bulles'])['texte'] : $case['desc'];
    $dernier = rtrim($dernier, " \t»”\"");
    if (str_ends_with($dernier, '?')) return 'question';
    if (str_ends_with($dernier, '…') || str_ends_with($dernier, '...') || str_ends_with($dernier, '!')) return 'suspens';
    return 'plate';
}

function planchesBD(PDO $db): array {
    $rows = $db->query("
        SELECT e.id, e.texte_episode FROM episodes e JOIN saisons sa ON sa.id = e.saison_id
        WHERE COALESCE(TRIM(e.texte_episode), '') != '' ORDER BY sa.numero, e.numero_episode
    ")->fetchAll();
    $format = infosProjet(projetDemande() ?? '')['format'];
    $resultat = ['limite' => BD_MOTS_BULLE[$format] ?? 25, 'format' => $format, 'planches' => []];
    foreach ($rows as $r) {
        $cases = lireBD((string)$r['texte_episode']);
        $resultat['planches'][(int)$r['id']] = [
            'cases' => array_map(fn($c) => ['n' => $c['n'], 'mots' => $c['mots'], 'desc' => mb_substr($c['desc'], 0, 200), 'bulles' => array_map(fn($b) => [$b['qui'], $b['texte'], $b['mots'], $b['type']], $c['bulles'])], $cases),
            'mots' => array_sum(array_column($cases, 'mots')),
            'fin' => finCaseBD($cases ? end($cases) : null),
        ];
    }
    return $resultat;
}
