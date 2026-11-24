<?php
// api/genres.php — Théâtre, campagne de pub, jeu vidéo : chaque texte est lu selon ses usages, puis relu en script
// Théâtre : actes (saisons) et scènes (épisodes) ; pub : campagnes et spots ; jeu : chapitres et lieux

const THEATRE_ENTRE = "entre|entrent|arrive|arrivent|para[iî]t|paraissent|appara[iî]t|revient|reviennent|rentre|rentrent|surgit|se pr[ée]sente";
const THEATRE_SORT = "sort|sortent|part|partent|s'en va|s'en vont|s'[ée]loigne|s'[ée]loignent|dispara[iî]t|disparaissent|quitte la sc[èe]ne|quittent la sc[èe]ne";
const PUB_DEBIT = 2.5;       // mots par seconde, pour une voix off posée
const PUB_MENTION = 4;       // mots par seconde qu'on lit à l'écran
const JEU_MINUTES_LIEU = 3;  // temps de jeu de base d'un lieu
const JEU_MINUTES_ENIGME = 4;

function estTheatre(): bool { return defined('PROJET_TYPE') && PROJET_TYPE === 'theatre'; }
function estPub(): bool { return defined('PROJET_TYPE') && PROJET_TYPE === 'pub'; }
function estJeu(): bool { return defined('PROJET_TYPE') && PROJET_TYPE === 'jeu'; }
function genreTexte(): bool { return estTheatre() || estPub() || estJeu(); }

function motsGenre(string $t): int {
    return preg_match_all("/[\p{L}\p{N}][\p{L}\p{N}'’-]*/u", $t);
}

function lignesPropres(string $texte): array {
    return explode("\n", str_replace(["\r", "\u{2019}", "\u{00A0}", "\u{202F}"], ['', "'", ' ', ' '], $texte));
}

// Une ligne sans minuscule qui ressemble à un nom de personnage
function estNomGenre(string $nom): bool {
    $nom = trim($nom);
    return $nom !== '' && mb_strlen($nom) <= 30 && mb_strtoupper($nom, 'UTF-8') === $nom && preg_match('/\p{Lu}{2}/u', $nom) && !estFauxPersonnage($nom);
}

// ─── Théâtre ─────────────────────────────────────────────────────────────────

// Une scène en événements, dans l'ordre : qui parle, qui entre, qui sort, et les didascalies
function lireTheatre(string $texte): array {
    $ev = [];
    $courant = null;
    $debut = [];
    // La liste des présents vient sous le titre de la scène, ou tout en haut quand l'import a retiré le titre
    $apresTitre = true;
    foreach (lignesPropres($texte) as $ligne) {
        $l = trim(preg_replace('/^#{1,6}\s+/u', '', $ligne));
        if ($l === '') { $courant = null; continue; }
        if (preg_match('/^(acte|sc[èe]ne|tableau)\b/iu', $l) && mb_strlen($l) < 60) { $apresTitre = true; continue; }
        // Juste sous le titre de la scène, la liste des personnages présents
        if ($apresTitre && preg_match('/^[\p{Lu}\s,\'’.-]+$/u', $l) && str_contains($l, ',')) {
            $debut = array_values(array_filter(array_map('trim', explode(',', rtrim($l, '.'))), 'estNomGenre'));
            $apresTitre = false;
            continue;
        }
        $apresTitre = false;
        // Une didascalie seule : entre parenthèses, ou en italique
        if (preg_match('/^\((.*)\)\.?$/su', $l, $m) || preg_match('/^[_*](.+)[_*]$/u', $l, $m)) { $ev[] = ['did', trim($m[1]), null]; $courant = null; continue; }
        // « JULIETTE. — Texte », « JULIETTE, à part. Texte », « JULIETTE : Texte »
        if (preg_match('/^([\p{Lu}][\p{Lu}\s\'’-]{1,28}?)(?:\s*,\s*([^.:—]{1,60}))?\s*(?:\.\s*[—–-]?|:|—|–)\s*(.+)$/u', $l, $m) && estNomGenre($m[1])) {
            $courant = trim($m[1]);
            if (!empty($m[2])) $ev[] = ['did', trim($m[2]), $courant];
            theatreReplique($ev, $courant, $m[3]);
            continue;
        }
        // Le nom seul sur sa ligne, la réplique dessous
        if (estNomGenre(preg_replace('/\s*\(.*\)$/u', '', $l)) && !preg_match('/[.!?]$/u', $l)) { $courant = trim(preg_replace('/\s*\(.*\)$/u', '', $l)); continue; }
        if ($courant !== null) { theatreReplique($ev, $courant, $l); continue; }
        $ev[] = ['did', $l, null];
    }
    return ['debut' => $debut, 'evenements' => $ev];
}

// Les didascalies glissées dans une réplique en sont retirées : « (Il sort.) »
function theatreReplique(array &$ev, string $qui, string $texte): void {
    $parle = trim(preg_replace('/\s*\(([^)]*)\)\s*/u', ' ', $texte));
    if ($parle !== '') $ev[] = ['dit', $parle, $qui];
    if (preg_match_all('/\(([^)]*)\)/u', $texte, $m)) foreach ($m[1] as $d) $ev[] = ['did', trim($d), $qui];
}

// Qui entre ou sort dans une didascalie : un nom connu, ou « il / elle » pour celui qui parle
function mouvementsTheatre(string $did, ?string $qui, array $noms): array {
    $res = ['entre' => [], 'sort' => [], 'tous' => false];
    if (preg_match('/\b(tous|toutes|tout le monde)\b.{0,20}\b(' . THEATRE_SORT . ')\b/iu', $did)) { $res['tous'] = true; return $res; }
    $cites = [];
    foreach ($noms as $n) if (preg_match('/(?<![\p{L}])' . preg_quote(mb_strtolower($n, 'UTF-8'), '/') . '(?![\p{L}])/u', mb_strtolower($did, 'UTF-8'))) $cites[] = $n;
    if (!$cites && $qui !== null && preg_match('/^(il|elle|ils|elles)\b/iu', $did)) $cites = [$qui];
    if (!$cites) return $res;
    if (preg_match('/\b(' . THEATRE_SORT . ')\b/iu', $did)) $res['sort'] = $cites;
    elseif (preg_match('/\b(' . THEATRE_ENTRE . ')\b/iu', $did)) $res['entre'] = $cites;
    return $res;
}

function theatreVersScript(string $texte): string {
    $lignes = ['INT. SCÈNE'];
    foreach (lireTheatre($texte)['evenements'] as [$type, $t, $qui]) {
        if ($type === 'dit') $lignes[] = "$qui\n$t";
        else $lignes[] = mb_strtoupper($t, 'UTF-8') === $t ? mb_convert_case($t, MB_CASE_TITLE, 'UTF-8') : $t;
    }
    return implode("\n\n", $lignes);
}

// La pièce acte par acte : qui est en scène dans chaque scène, qui parle, qui reste muet
function donneesTheatre(PDO $db): array {
    $rows = $db->query("
        SELECT e.id, e.numero_episode, e.titre, e.texte_episode, sa.numero AS acte FROM episodes e JOIN saisons sa ON sa.id = e.saison_id
        WHERE COALESCE(TRIM(e.texte_episode), '') != '' ORDER BY sa.numero, e.numero_episode
    ")->fetchAll();
    $lus = array_map(fn($r) => lireTheatre((string)$r['texte_episode']), $rows);
    $noms = [];
    foreach ($lus as $l) foreach ($l['evenements'] as $e) if ($e[0] === 'dit') $noms[$e[2]] = true;
    foreach ($lus as $l) foreach ($l['debut'] as $n) $noms[$n] = true;
    $noms = array_keys($noms);
    $actes = [];
    $etat = [];
    $acte = null;
    foreach ($rows as $i => $r) {
        if ($r['acte'] !== $acte) { $acte = $r['acte']; $etat = []; }
        $lu = $lus[$i];
        if ($lu['debut']) $etat = array_fill_keys($lu['debut'], true);
        $presents = $etat;
        $parle = [];
        $tirade = [];
        $entrees = $sorties = [];
        $sansEntree = [];
        $motsDid = 0;
        foreach ($lu['evenements'] as [$type, $t, $qui]) {
            if ($type === 'dit') {
                if (!isset($etat[$qui])) $sansEntree[$qui] = true;
                $etat[$qui] = true;
                $presents[$qui] = true;
                $parle[$qui] = ($parle[$qui] ?? 0) + motsGenre($t);
                $tirade[$qui] = max($tirade[$qui] ?? 0, motsGenre($t));
                continue;
            }
            $motsDid += motsGenre($t);
            $mv = mouvementsTheatre($t, $qui, $noms);
            if ($mv['tous']) { $sorties = array_merge($sorties, array_keys($etat)); $etat = []; continue; }
            foreach ($mv['entre'] as $n) { $etat[$n] = true; $presents[$n] = true; $entrees[] = $n; }
            foreach ($mv['sort'] as $n) { $presents[$n] = true; unset($etat[$n]); $sorties[] = $n; }
        }
        $actes[(int)$r['acte']][] = [
            'id' => (int)$r['id'], 'n' => (int)$r['numero_episode'], 'titre' => (string)$r['titre'],
            'presents' => array_keys($presents), 'parle' => $parle, 'muets' => array_values(array_diff(array_keys($presents), array_keys($parle))),
            'entrees' => array_values(array_unique($entrees)), 'sorties' => array_values(array_unique($sorties)),
            'sans_entree' => array_keys($sansEntree), 'mots' => array_sum($parle), 'mots_did' => $motsDid, 'tirade' => (object)$tirade,
        ];
    }
    return ['noms' => $noms, 'actes' => array_map(fn($a, $n) => ['n' => $n, 'scenes' => $a], $actes, array_keys($actes))];
}

// ─── Campagne de pub ─────────────────────────────────────────────────────────

// Un spot en plans : « IMAGE : » ouvre un plan, puis « VO : », « SON : », « MENTION : », « NOM : » pour le son
function lirePub(string $texte): array {
    $plans = [];
    $courant = null;
    $ouvrir = function () use (&$plans, &$courant) {
        if ($courant !== null) $plans[] = $courant;
        $courant = ['image' => '', 'sons' => [], 'fixe' => 0, 'garder' => false];
    };
    foreach (lignesPropres($texte) as $ligne) {
        $l = trim(preg_replace('/^#{1,6}\s+|^[-*•]\s+/u', '', $ligne));
        if ($l === '' || preg_match('/^(spot|campagne)\b/iu', $l)) continue;
        if (preg_match('/^plan\s*\d+\b\s*[:.—–-]?\s*(.*)$/iu', $l, $m)) { $ouvrir(); $l = $m[1]; if ($l === '') continue; }
        if (preg_match('/^(image|visuel|img)\s*:\s*(.*)$/iu', $l, $m)) {
            if ($courant === null || $courant['image'] !== '' || $courant['sons']) $ouvrir();
            $l = $m[2];
            if (preg_match('/[\[(](\d+(?:[.,]\d+)?)\s*s(?:ec\w*)?[\])]/iu', $l, $d)) { $courant['fixe'] = (float)str_replace(',', '.', $d[1]); $l = trim(str_replace($d[0], '', $l)); }
            if (preg_match('/\[(garder|à garder|court)\]/iu', $l, $g)) { $courant['garder'] = true; $l = trim(str_replace($g[0], '', $l)); }
            $courant['image'] = $l;
            continue;
        }
        if ($courant === null) $ouvrir();
        if (preg_match('/^(vo|voix off|off)\s*:\s*(.+)$/iu', $l, $m)) { $courant['sons'][] = ['vo', 'VOIX OFF', $m[2]]; continue; }
        if (preg_match('/^(mention|mentions|légal|mention légale)\s*:\s*(.+)$/iu', $l, $m)) { $courant['sons'][] = ['mention', 'MENTION', $m[2]]; continue; }
        if (preg_match('/^(son|sfx|musique|bruit|ambiance)\s*:\s*(.+)$/iu', $l, $m)) { $courant['sons'][] = ['son', mb_strtoupper($m[1], 'UTF-8'), $m[2]]; continue; }
        if (preg_match('/^([\p{Lu}][\p{Lu}\s\'’-]{1,24}?)\s*:\s*(.+)$/u', $l, $m) && estNomGenre($m[1])) { $courant['sons'][] = ['dit', trim($m[1]), $m[2]]; continue; }
        // Une ligne libre complète l'image du plan
        $courant['image'] = trim($courant['image'] . ' ' . $l);
    }
    if ($courant !== null) $plans[] = $courant;
    $t = 0;
    foreach ($plans as &$p) {
        $parle = array_sum(array_map(fn($s) => in_array($s[0], ['vo', 'dit'], true) ? motsGenre($s[2]) : 0, $p['sons']));
        $mention = array_sum(array_map(fn($s) => $s[0] === 'mention' ? motsGenre($s[2]) : 0, $p['sons']));
        $p['mots'] = $parle;
        $p['mots_mention'] = $mention;
        $p['duree'] = max($p['fixe'], $parle ? ceil($parle / PUB_DEBIT) : ($p['fixe'] ?: 2), $mention ? ceil($mention / PUB_MENTION) : 0);
        $p['debut'] = $t;
        $t += $p['duree'];
        $p['packshot'] = (bool)preg_match('/packshot|logo|produit final/iu', $p['image']);
        $p['large'] = (bool)preg_match('/plan large|panoramique|grand angle|plan général|plan d\'ensemble/iu', $p['image']);
    }
    unset($p);
    return ['plans' => $plans, 'total' => $t];
}

function pubVersScript(string $texte): string {
    $lignes = [];
    foreach (lirePub($texte)['plans'] as $n => $p) {
        $lignes[] = 'INT. PLAN ' . ($n + 1);
        // « PACKSHOT : le pain » décrit l'image : ce n'est pas un personnage qui parle
        $image = str_replace(' : ', ' — ', $p['image']);
        if ($image !== '') $lignes[] = mb_strtoupper($image, 'UTF-8') === $image ? mb_convert_case($image, MB_CASE_TITLE, 'UTF-8') : $image;
        foreach ($p['sons'] as [$type, $qui, $t]) $lignes[] = in_array($type, ['vo', 'dit'], true) ? "$qui\n$t" : mb_convert_case(mb_strtolower($qui, 'UTF-8'), MB_CASE_TITLE, 'UTF-8') . ' — ' . $t;
    }
    return implode("\n\n", $lignes);
}

function donneesPub(PDO $db): array {
    $rows = $db->query("
        SELECT e.id, e.texte_episode FROM episodes e JOIN saisons sa ON sa.id = e.saison_id
        WHERE COALESCE(TRIM(e.texte_episode), '') != '' ORDER BY sa.numero, e.numero_episode
    ")->fetchAll();
    $spots = [];
    foreach ($rows as $r) $spots[(int)$r['id']] = lirePub((string)$r['texte_episode']);
    return ['debit' => PUB_DEBIT, 'mention' => PUB_MENTION, 'spots' => (object)$spots];
}

// ─── Jeu vidéo ───────────────────────────────────────────────────────────────

function listeObjets(string $t): array {
    return array_values(array_filter(array_map(fn($x) => mb_strtolower(trim($x, " \t.[]"), 'UTF-8'), preg_split('/\s*(?:\+|,|\bet\b)\s*/u', $t))));
}

// Un lieu : description, objets, sorties (avec leur condition), combinaisons, dialogues à choix
function lireJeu(string $texte): array {
    $lieu = ['nom' => '', 'description' => '', 'objets' => [], 'sorties' => [], 'combos' => [], 'dialogue' => [], 'donne' => [], 'persos' => []];
    $niveauChoix = -1;
    $siChoix = [];
    // [si corde] demande un objet ; [utilise corde] le demande et le fait disparaître
    $consomme = [];
    $condition = function (string &$t) use (&$consomme): array {
        if (!preg_match('/\[\s*(si|utilise|utiliser|consomme)\s*:?\s*([^\]]+)\]/iu', $t, $m)) return [];
        $t = trim(str_replace($m[0], '', $t));
        $objets = listeObjets($m[2]);
        if (mb_strtolower($m[1], 'UTF-8') !== 'si') $consomme = array_merge($consomme, $objets);
        return $objets;
    };
    foreach (lignesPropres($texte) as $ligne) {
        if (trim($ligne) === '') continue;
        $retrait = strlen($ligne) - strlen(ltrim($ligne, " \t"));
        $l = trim(preg_replace('/^#{1,6}\s+/u', '', $ligne));
        // Chaque sortie d'une liste garde sa propre condition : « Le port, La falaise [si corde] »
        if (preg_match('/^(sortie|sorties|aller|vers|->|→)\s*:?\s*(.+)$/iu', $l, $m) && !preg_match('/^->\s*$/u', $l)) {
            foreach (preg_split('/\s*,\s*(?![^\[]*\])/u', $m[2]) as $v) {
                $si = $condition($v);
                if (trim($v) !== '') $lieu['sorties'][] = ['vers' => trim($v), 'si' => $si];
            }
            continue;
        }
        $si = $condition($l);
        // Sous un choix, ce qui est en retrait dépend de la condition du choix
        if ($niveauChoix >= 0 && $retrait > $niveauChoix) $si = array_values(array_unique(array_merge($siChoix, $si)));
        elseif ($retrait <= $niveauChoix) { $niveauChoix = -1; $siChoix = []; }
        if (preg_match('/^lieu\s*:\s*(.+)$/iu', $l, $m)) { $lieu['nom'] = trim($m[1]); continue; }
        if (preg_match('/^(objets?|ramasser|trouve)\s*:\s*(.+)$/iu', $l, $m)) { $lieu['objets'] = array_merge($lieu['objets'], listeObjets($m[2])); continue; }
        if (preg_match('/^(énigme|enigme|combiner|combinaison|utiliser)\s*:\s*(.+)$/iu', $l, $m)) {
            [$gauche, $resultat] = array_pad(preg_split('/\s*(?:->|→|=>|=)\s*/u', $m[2], 2), 2, '');
            $titre = '';
            if (str_contains($gauche, ':')) [$titre, $gauche] = array_map('trim', explode(':', $gauche, 2));
            $lieu['combos'][] = ['titre' => $titre ?: $m[2], 'entree' => listeObjets($gauche), 'resultat' => mb_strtolower(trim($resultat, " ."), 'UTF-8')];
            continue;
        }
        if (preg_match('/^(donne|recevoir|reçoit)\s*:\s*(.+)$/iu', $l, $m)) {
            foreach (listeObjets($m[2]) as $o) $lieu['donne'][] = ['objet' => $o, 'si' => $si, 'choix' => $niveauChoix >= 0 && $retrait > $niveauChoix];
            continue;
        }
        if (preg_match('/^(>>|»|\*|\+)\s*(.+)$/u', $l, $m)) {
            $niveauChoix = $retrait;
            $siChoix = $si;
            $lieu['dialogue'][] = ['niv' => intdiv($retrait, 2), 'type' => 'choix', 'qui' => 'JOUEUR', 'texte' => $m[2], 'si' => $si];
            continue;
        }
        if (preg_match('/^([\p{Lu}][\p{L}\s\'’-]{1,24}?)\s*:\s*(.+)$/u', $l, $m) && preg_match('/^\p{Lu}/u', $m[1]) && !preg_match('/\s(de|du|des|la|le|les)\s/iu', " {$m[1]} ")) {
            $qui = mb_strtoupper(trim($m[1]), 'UTF-8');
            $lieu['persos'][$qui] = true;
            $lieu['dialogue'][] = ['niv' => intdiv($retrait, 2), 'type' => 'ligne', 'qui' => $qui, 'texte' => $m[2], 'si' => $si];
            continue;
        }
        if ($retrait > 0 && $lieu['dialogue']) { $lieu['dialogue'][count($lieu['dialogue']) - 1]['texte'] .= ' ' . $l; continue; }
        $lieu['description'] = trim($lieu['description'] . ' ' . $l);
    }
    $lieu['objets'] = array_values(array_unique($lieu['objets']));
    $lieu['persos'] = array_keys($lieu['persos']);
    // Une combinaison consomme ses objets, comme dans la plupart des point and click
    foreach ($lieu['combos'] as $c) $consomme = array_merge($consomme, $c['entree']);
    $lieu['consomme'] = array_values(array_unique($consomme));
    return $lieu;
}

function jeuVersScript(string $texte): string {
    $j = lireJeu($texte);
    $lignes = ['INT. ' . mb_strtoupper($j['nom'], 'UTF-8')];
    if ($j['description'] !== '') $lignes[] = $j['description'];
    foreach ($j['dialogue'] as $d) $lignes[] = $d['qui'] . "\n" . $d['texte'];
    return implode("\n\n", $lignes);
}

// Ce que le joueur peut atteindre : on avance tant qu'un passage s'ouvre ou qu'une combinaison donne un objet
function analyseJeu(PDO $db): array {
    $rows = $db->query("
        SELECT e.id, e.numero_episode, e.titre, e.texte_episode, sa.numero AS chapitre FROM episodes e JOIN saisons sa ON sa.id = e.saison_id
        WHERE COALESCE(TRIM(e.texte_episode), '') != '' ORDER BY sa.numero, e.numero_episode
    ")->fetchAll();
    $chapitres = [];
    foreach ($rows as $r) {
        $j = lireJeu((string)$r['texte_episode']);
        $j['id'] = (int)$r['id'];
        $j['nom'] = $j['nom'] ?: (trim((string)$r['titre']) ?: 'Lieu ' . $r['numero_episode']);
        $chapitres[(int)$r['chapitre']][] = $j;
    }
    $sortie = [];
    foreach ($chapitres as $n => $lieux) {
        $cle = fn($nom) => mb_strtolower(trim($nom), 'UTF-8');
        $index = [];
        foreach ($lieux as $i => $l) $index[$cle($l['nom'])] = $i;
        $atteint = [0 => 0];
        $inv = [];
        $etapes = [];
        $ouvert = [];
        $faits = [];
        // Par référence : l'inventaire grandit pendant qu'on avance
        $possede = function (array $liste) use (&$inv): bool { return !array_diff($liste, array_keys($inv)); };
        for ($tour = 0, $change = true; $change && $tour < 200; $tour++) {
            $change = false;
            foreach (array_keys($atteint) as $i) {
                $l = $lieux[$i];
                foreach ($l['objets'] as $o) if (!isset($inv[$o])) { $inv[$o] = $l['nom']; $change = true; }
                foreach ($l['donne'] as $d) if (!isset($inv[$d['objet']]) && $possede($d['si'])) { $inv[$d['objet']] = $l['nom'] . ' (dialogue)'; $change = true; }
                foreach ($l['combos'] as $k => $c) {
                    if (isset($faits["$i:$k"]) || !$c['entree'] || !$possede($c['entree'])) continue;
                    $faits["$i:$k"] = true;
                    if ($c['resultat'] !== '') $inv[$c['resultat']] = $l['nom'];
                    $etapes[] = ['type' => 'combo', 'lieu' => $l['nom'], 'texte' => $c['titre'], 'avec' => $c['entree'], 'donne' => $c['resultat']];
                    $change = true;
                }
                foreach ($l['sorties'] as $k => $s) {
                    $j = $index[$cle($s['vers'])] ?? null;
                    if ($j === null || isset($atteint[$j]) || !$possede($s['si'])) continue;
                    $atteint[$j] = count($atteint);
                    if ($s['si']) $etapes[] = ['type' => 'passage', 'lieu' => $l['nom'], 'texte' => 'Aller à ' . $lieux[$j]['nom'], 'avec' => $s['si'], 'donne' => ''];
                    $change = true;
                }
            }
        }
        // Les objets demandés quelque part, et ceux qu'on ne peut jamais avoir
        $demandes = [];
        foreach ($lieux as $l) {
            foreach ($l['sorties'] as $s) foreach ($s['si'] as $o) $demandes[$o][] = $l['nom'];
            foreach ($l['combos'] as $c) foreach ($c['entree'] as $o) $demandes[$o][] = $l['nom'];
            foreach ($l['dialogue'] as $d) foreach ($d['si'] as $o) $demandes[$o][] = $l['nom'];
            foreach ($l['donne'] as $d) foreach ($d['si'] as $o) $demandes[$o][] = $l['nom'];
        }
        $trouves = [];
        foreach ($lieux as $l) {
            foreach ($l['objets'] as $o) $trouves[$o][] = $l['nom'];
            foreach ($l['donne'] as $d) $trouves[$d['objet']][] = $l['nom'] . ' (dialogue)';
            foreach ($l['combos'] as $c) if ($c['resultat'] !== '') $trouves[$c['resultat']][] = $l['nom'] . ' (combinaison)';
        }
        $objets = [];
        foreach (array_unique(array_merge(array_keys($demandes), array_keys($trouves))) as $o) {
            $objets[] = ['nom' => $o, 'trouve' => array_values(array_unique($trouves[$o] ?? [])), 'sert' => array_values(array_unique($demandes[$o] ?? [])), 'obtenu' => isset($inv[$o])];
        }
        // Un objet qui disparaît à sa première utilisation alors qu'il sert ailleurs : le joueur peut se bloquer
        $blocages = [];
        $consommes = [];
        foreach ($lieux as $l) foreach ($l['consomme'] as $o) $consommes[$o][] = $l['nom'];
        foreach ($consommes as $o => $ou) {
            $usages = $demandes[$o] ?? [];
            $sources = count($trouves[$o] ?? []);
            if (count($usages) > 1 && $sources <= 1) $blocages[] = ['objet' => $o, 'usages' => array_values(array_unique($usages)), 'consomme' => array_values(array_unique($ou))];
        }
        // Sorties vers un lieu qui n'existe pas
        $orphelines = [];
        foreach ($lieux as $l) foreach ($l['sorties'] as $s) if (!isset($index[$cle($s['vers'])])) $orphelines[] = ['de' => $l['nom'], 'vers' => $s['vers']];
        $lignes = array_sum(array_map(fn($l) => count($l['dialogue']), $lieux));
        $combos = array_sum(array_map(fn($l) => count($l['combos']), $lieux));
        $sortie[] = [
            'n' => $n,
            'lieux' => array_map(fn($l, $i) => [
                'id' => $l['id'], 'nom' => $l['nom'], 'description' => mb_substr($l['description'], 0, 240), 'objets' => $l['objets'],
                'sorties' => array_map(fn($s) => ['vers' => $s['vers'], 'si' => $s['si'], 'existe' => isset($index[$cle($s['vers'])])], $l['sorties']),
                'persos' => $l['persos'], 'combos' => $l['combos'], 'dialogue' => $l['dialogue'], 'donne' => $l['donne'],
                'atteint' => isset($atteint[$i]), 'ordre' => $atteint[$i] ?? null,
            ], $lieux, array_keys($lieux)),
            'etapes' => $etapes, 'objets' => $objets, 'orphelines' => $orphelines, 'inventaire' => array_keys($inv), 'blocages' => $blocages,
            'minutes' => count($lieux) * JEU_MINUTES_LIEU + $combos * JEU_MINUTES_ENIGME + (int)round($lignes * 5 / 60),
        ];
    }
    return ['chapitres' => $sortie];
}

// ─── Communs ─────────────────────────────────────────────────────────────────

function genreVersScript(string $texte): string {
    if (estTheatre()) return theatreVersScript($texte);
    if (estPub()) return pubVersScript($texte);
    return jeuVersScript($texte);
}

// La durée d'une unité : la représentation (150 mots par minute), le spot (en secondes, arrondi à la minute), le temps de jeu
function dureeGenre(string $texte): int {
    if (estTheatre()) {
        $mots = array_sum(array_map(fn($e) => $e[0] === 'dit' ? motsGenre($e[1]) : 0, lireTheatre($texte)['evenements']));
        return max(1, (int)round($mots / 150));
    }
    if (estPub()) return max(1, (int)ceil(lirePub($texte)['total'] / 60));
    $j = lireJeu($texte);
    return JEU_MINUTES_LIEU + count($j['combos']) * JEU_MINUTES_ENIGME + (int)round(count($j['dialogue']) * 5 / 60);
}

// ─── Export vers les moteurs de jeu ─────────────────────────────────────────

function slugJeu(string $t): string {
    $plat = strtr(mb_strtolower($t, 'UTF-8'), ['à' => 'a', 'â' => 'a', 'ç' => 'c', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'œ' => 'oe']);
    return trim(preg_replace('/[^a-z0-9]+/', '_', $plat), '_') ?: 'lieu';
}

// Twine (Twee 3) : un passage par lieu, ses sorties en liens ; les conditions restent écrites en commentaire
function exportTwee(array $chapitres, string $titre): string {
    $sortie = [":: StoryTitle\n$titre", ":: Init [startup]\n(set: \$inventaire to (a:))", ':: StoryData' . "\n" . json_encode(['ifid' => strtoupper(substr(md5($titre), 0, 8) . '-0000-4000-8000-' . substr(md5($titre), 8, 12)), 'format' => 'Harlowe', 'format-version' => '3.3.8'], JSON_PRETTY_PRINT)];
    foreach ($chapitres as $c) foreach ($c['lieux'] as $l) {
        $p = [":: {$l['nom']}"];
        if ($l['description'] !== '') $p[] = $l['description'];
        if ($l['objets']) $p[] = '(set: $inventaire to it + (a: "' . implode('", "', $l['objets']) . '"))';
        foreach ($l['dialogue'] as $d) $p[] = ($d['type'] === 'choix' ? '- ' : "''{$d['qui']}'' : ") . $d['texte'] . ($d['si'] ? ' <!-- si ' . implode(' + ', $d['si']) . ' -->' : '');
        foreach ($l['sorties'] as $s) $p[] = ($s['si'] ? '(if: $inventaire contains "' . implode('" and $inventaire contains "', $s['si']) . '")[' : '') . "[[{$s['vers']}]]" . ($s['si'] ? ']' : '');
        $sortie[] = implode("\n", $p);
    }
    return implode("\n\n", $sortie) . "\n";
}

// Ink : un nœud par lieu, les choix du joueur en options, les sorties en détours
function exportInk(array $chapitres, string $titre): string {
    // Une liste Ink déclare d'avance tous les objets du jeu
    $objets = [];
    foreach ($chapitres as $c) foreach ($c['objets'] as $o) $objets[slugJeu($o['nom'])] = true;
    $knots = [];
    foreach ($chapitres as $c) foreach ($c['lieux'] as $l) $knots[slugJeu($l['nom'])] = true;
    $lignes = ["// $titre", 'LIST inventaire = ' . (implode(', ', array_keys($objets)) ?: 'rien')];
    $premier = $chapitres[0]['lieux'][0]['nom'] ?? null;
    if ($premier) $lignes[] = '-> ' . slugJeu($premier);
    foreach ($chapitres as $c) foreach ($c['lieux'] as $l) {
        $lignes[] = '';
        $lignes[] = '=== ' . slugJeu($l['nom']) . ' ===';
        if ($l['description'] !== '') $lignes[] = $l['description'];
        foreach ($l['objets'] as $o) $lignes[] = '~ inventaire += ' . slugJeu($o);
        foreach ($l['dialogue'] as $d) $lignes[] = ($d['type'] === 'choix' ? str_repeat('*', max(1, $d['niv'] + 1)) . ' [' . $d['texte'] . ']' : "{$d['qui']}: {$d['texte']}");
        // Une sortie vers un lieu qui n'existe pas casserait la compilation : elle reste en commentaire
        foreach ($l['sorties'] as $s) if (!isset($knots[slugJeu($s['vers'])])) $lignes[] = "// sortie vers « {$s['vers']} » : ce lieu n'existe pas";
        foreach (array_filter($l['sorties'], fn($s) => isset($knots[slugJeu($s['vers'])])) as $s) $lignes[] = '+ ' . ($s['si'] ? '{' . implode(' && ', array_map(fn($o) => 'inventaire ? ' . slugJeu($o), $s['si'])) . '} ' : '') . "[Aller à {$s['vers']}] -> " . slugJeu($s['vers']);
        if (!array_filter($l['sorties'], fn($s) => isset($knots[slugJeu($s['vers'])]))) $lignes[] = '-> END';
    }
    return implode("\n", $lignes) . "\n";
}
