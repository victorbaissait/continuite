<?php
// api/montage.php — Lire les fichiers de Montage (Mariner Software, logiciel de scénario pour Mac qui n'existe plus).
// Un .montage est une liste de propriétés binaire d'Apple (bplist) produite par NSKeyedArchiver : on la décode
// nous-mêmes, prudemment (un fichier abîmé ou piégé ne doit rien casser), puis on reconstitue le script.

const MONTAGE_OBJETS_MAX = 2000000;

// ─── Liste de propriétés binaire (bplist00) ──────────────────────────────

final class Bplist {
    private string $d;
    private int $tailleRef;
    private int $tailleOffset;
    private array $offsets = [];
    private array $cache = [];

    public function __construct(string $octets) {
        if (strlen($octets) < 40 || substr($octets, 0, 8) !== 'bplist00') throw new RuntimeException('Ce fichier n\'est pas un fichier Montage lisible.');
        $this->d = $octets;
        $fin = substr($octets, -32);
        $this->tailleOffset = ord($fin[6]);
        $this->tailleRef = ord($fin[7]);
        $nb = $this->entier(substr($fin, 8, 8));
        $debutTable = $this->entier(substr($fin, 24, 8));
        if ($this->tailleOffset < 1 || $this->tailleOffset > 8 || $this->tailleRef < 1 || $this->tailleRef > 8
            || $nb < 1 || $nb > MONTAGE_OBJETS_MAX || $debutTable + $nb * $this->tailleOffset > strlen($octets) - 32) {
            throw new RuntimeException('Fichier Montage abîmé.');
        }
        for ($i = 0; $i < $nb; $i++) $this->offsets[] = $this->entier(substr($octets, $debutTable + $i * $this->tailleOffset, $this->tailleOffset));
        $this->racine = $this->entier(substr($fin, 16, 8));
    }

    public int $racine = 0;

    // Toutes les chaînes de la liste (pour fouiller un fichier inconnu)
    public function chaines(): array {
        $sortie = [];
        foreach (array_keys($this->offsets) as $i) {
            try { $v = $this->objet($i); } catch (RuntimeException $e) { continue; }
            if (is_string($v)) $sortie[] = $v;
        }
        return $sortie;
    }

    private function entier(string $o): int {
        $v = 0;
        for ($i = 0; $i < strlen($o); $i++) $v = ($v << 8) | ord($o[$i]);
        return $v;
    }

    private function lire(int $pos, int $n): string {
        if ($pos < 0 || $n < 0 || $pos + $n > strlen($this->d)) throw new RuntimeException('Fichier Montage abîmé.');
        return substr($this->d, $pos, $n);
    }

    // Longueur d'un objet : dans les 4 bits bas, ou un entier qui suit quand ils valent 0xF
    private function longueur(int $info, int &$pos): int {
        if ($info !== 0x0F) return $info;
        $m = ord($this->lire($pos, 1));
        if (($m >> 4) !== 0x1) throw new RuntimeException('Fichier Montage abîmé.');
        $n = 1 << ($m & 0x0F);
        $v = $this->entier($this->lire($pos + 1, $n));
        $pos += 1 + $n;
        return $v;
    }

    // Un objet, décodé à la demande ; les références restent des références (pas de boucle possible)
    public function objet(int $i) {
        if (array_key_exists($i, $this->cache)) return $this->cache[$i];
        if (!isset($this->offsets[$i])) throw new RuntimeException('Fichier Montage abîmé.');
        $pos = $this->offsets[$i];
        $m = ord($this->lire($pos, 1));
        $type = $m >> 4;
        $info = $m & 0x0F;
        $pos++;
        switch ($type) {
            case 0x0: $v = $info === 0x09 ? true : ($info === 0x08 ? false : null); break;
            case 0x1: $n = 1 << $info; $v = $this->entier($this->lire($pos, min($n, 8))); break;
            case 0x2: $o = $this->lire($pos, 1 << $info); $v = $info === 3 ? unpack('E', $o)[1] : ($info === 2 ? unpack('G', $o)[1] : 0.0); break;
            case 0x3: $v = unpack('E', $this->lire($pos, 8))[1]; break;
            case 0x4: $n = $this->longueur($info, $pos); $v = ['$data' => $this->lire($pos, $n)]; break;
            case 0x5: $n = $this->longueur($info, $pos); $v = $this->lire($pos, $n); break;
            case 0x6: $n = $this->longueur($info, $pos); $v = mb_convert_encoding($this->lire($pos, $n * 2), 'UTF-8', 'UTF-16BE'); break;
            case 0x8: $v = ['$uid' => $this->entier($this->lire($pos, $info + 1))]; break;
            case 0xA: case 0xC:
                $n = $this->longueur($info, $pos);
                $v = ['$liste' => []];
                for ($k = 0; $k < $n; $k++) $v['$liste'][] = $this->entier($this->lire($pos + $k * $this->tailleRef, $this->tailleRef));
                break;
            case 0xD:
                $n = $this->longueur($info, $pos);
                $v = ['$dict' => []];
                for ($k = 0; $k < $n; $k++) {
                    $cle = $this->objet($this->entier($this->lire($pos + $k * $this->tailleRef, $this->tailleRef)));
                    $v['$dict'][is_string($cle) ? $cle : (string)$k] = $this->entier($this->lire($pos + ($n + $k) * $this->tailleRef, $this->tailleRef));
                }
                break;
            default: $v = null;
        }
        return $this->cache[$i] = $v;
    }
}

// ─── NSKeyedArchiver : les objets s'appellent entre eux par « UID » ──────

final class ArchiveCles {
    private Bplist $p;
    private array $objets;

    public function __construct(string $octets) {
        $this->p = new Bplist($octets);
        $racine = $this->dict($this->p->objet($this->p->racine));
        if (!isset($racine['$objects'], $racine['$top'])) throw new RuntimeException('Ce fichier n\'est pas un fichier Montage lisible.');
        $this->objets = $this->p->objet($racine['$objects'])['$liste'] ?? [];
        $this->top = $this->dict($this->p->objet($racine['$top']));
    }

    public array $top = [];

    private function dict($v): array {
        return is_array($v) && isset($v['$dict']) ? $v['$dict'] : [];
    }

    // Un objet de l'archive (par UID) : un dictionnaire d'archive devient un tableau de champs → références
    public function obj($ref) {
        if (is_int($ref)) $ref = $this->p->objet($ref);
        if (is_array($ref) && isset($ref['$uid'])) {
            $i = $ref['$uid'];
            if (!isset($this->objets[$i])) return null;
            $v = $this->p->objet($this->objets[$i]);
            return $v === '$null' ? null : $v;
        }
        return $ref;
    }

    public function champ($o, string $cle) {
        $d = $this->dict($o);
        return isset($d[$cle]) ? $this->obj($d[$cle]) : null;
    }

    public function nomClasse($o): string {
        $c = $this->champ($o, '$class');
        $n = $this->champ($c, '$classname');
        return is_string($n) ? $n : '';
    }

    // Les éléments d'un NSArray / NSMutableArray, ou les UID bruts (pour reconnaître un même objet)
    public function uids($o): array {
        $l = $this->dict($o)['NS.objects'] ?? null;
        if ($l === null) return [];
        $l = $this->p->objet($l);
        $sortie = [];
        foreach ($l['$liste'] ?? [] as $r) { $u = $this->p->objet($r); if (isset($u['$uid'])) $sortie[] = $u['$uid']; }
        return $sortie;
    }

    // Tous les objets d'une classe (les rôles, par exemple), dans l'ordre de l'archive
    public function objetsDeClasse(string $classe, int $max = 5000): array {
        $sortie = [];
        foreach (array_keys($this->objets) as $u) {
            if (count($sortie) >= $max) break;
            try { $o = $this->parUid($u); } catch (RuntimeException $e) { continue; }
            if (is_array($o) && isset($o['$dict']['$class']) && $this->nomClasse($o) === $classe) $sortie[] = $o;
        }
        return $sortie;
    }

    public function parUid(int $u) {
        return $this->obj(['$uid' => $u]);
    }

    public function chaine($o): string {
        if (is_string($o)) return $o;
        $s = $this->champ($o, 'NS.string');
        return is_string($s) ? $s : '';
    }

    public function donnees($o): string {
        $d = $this->champ($o, 'NS.data');
        return is_array($d) && isset($d['$data']) ? $d['$data'] : '';
    }

    public function dictionnaire($o): array {
        $d = $this->dict($o);
        $cles = isset($d['NS.keys']) ? ($this->p->objet($d['NS.keys'])['$liste'] ?? []) : [];
        $vals = isset($d['NS.objects']) ? ($this->p->objet($d['NS.objects'])['$liste'] ?? []) : [];
        $sortie = [];
        foreach ($cles as $k => $rc) {
            $cle = $this->obj($rc);
            if (is_string($cle) && isset($vals[$k])) $sortie[$cle] = $this->obj($vals[$k]);
        }
        return $sortie;
    }
}

// Des entiers à longueur variable (7 bits par octet) : la carte des attributs d'un texte Cocoa
function varintsMontage(string $o): array {
    $sortie = [];
    $v = 0; $decalage = 0;
    for ($i = 0; $i < strlen($o); $i++) {
        $c = ord($o[$i]);
        $v |= ($c & 0x7F) << $decalage;
        $decalage += 7;
        if ($c < 0x80) { $sortie[] = $v; $v = 0; $decalage = 0; }
        if ($decalage > 56) break;
    }
    return $sortie;
}

// Les paragraphes d'une scène, chacun avec l'élément de scénario Montage de son premier caractère
function paragraphesSceneMontage(ArchiveCles $a, $texte): array {
    $chaine = $a->chaine($a->champ($texte, 'NSString'));
    if (trim($chaine) === '') return [];
    $u16 = mb_convert_encoding($chaine, 'UTF-16LE', 'UTF-8');
    $total = intdiv(strlen($u16), 2);
    $attrs = $a->champ($texte, 'NSAttributes');
    $elements = [];
    $runs = [];
    $nomElement = function (array $d) use ($a): string {
        $el = $d['AVNRscriptElementAttributeName'] ?? null;
        $n = $el ? $a->champ($el, 'scriptElementName') : null;
        return is_string($n) ? $n : '';
    };
    if ($attrs === null) {
        $runs = [[$total, '']];
    } elseif (in_array($a->nomClasse($attrs), ['NSArray', 'NSMutableArray'], true)) {
        foreach ($a->uids($attrs) as $u) $elements[] = $nomElement($a->dictionnaire($a->parUid($u)));
        $info = varintsMontage($a->donnees($a->champ($texte, 'NSAttributeInfo')));
        for ($k = 0; $k + 1 < count($info); $k += 2) $runs[] = [$info[$k], $elements[$info[$k + 1]] ?? ''];
    } else {
        $runs = [[$total, $nomElement($a->dictionnaire($attrs))]];
    }
    // Élément à chaque position (en unités UTF-16, comme Cocoa)
    $elementA = function (int $pos) use ($runs): string {
        $p = 0;
        foreach ($runs as [$n, $el]) { if ($pos < $p + $n) return $el; $p += $n; }
        return $runs ? end($runs)[1] : '';
    };
    $paras = [];
    $pos = 0;
    foreach (explode("\n", str_replace("\r", '', $chaine)) as $ligne) {
        $longueur = intdiv(strlen(mb_convert_encoding($ligne, 'UTF-16LE', 'UTF-8')), 2);
        if (trim($ligne) !== '') {
            $premier = $pos + (intdiv(strlen(mb_convert_encoding(substr($ligne, 0, strlen($ligne) - strlen(ltrim($ligne))), 'UTF-16LE', 'UTF-8')), 2));
            $paras[] = [$elementA($premier), $ligne];
        }
        $pos += $longueur + 1;
    }
    return $paras;
}

function typeBlocMontage(string $element, string $texte): string {
    $t = trim($texte);
    if (preg_match('/^(INT|EXT|I\/E)[\.\/ ]/iu', $t)) return 'sequence';
    $e = mb_strtolower($element);
    if (in_array($e, ['show/episode title', 'act', 'end of act', 'cast list', 'shot'], true)) return 'action';
    if ($e === 'act heading') return 'action';
    return typeBlocScenario($element);
}

/**
 * Le script d'un fichier Montage. Montage range ses scènes dans une liste qu'il allonge à chaque enregistrement :
 * le script actuel est le premier tour de cette liste (jusqu'à la première scène qui revient), lu à l'envers.
 * Le reste, ce sont d'anciennes scènes (d'un modèle, d'un épisode copié) qu'on laisse de côté.
 */
function texteMontage(string $octets): string {
    // Un projet Celtx renommé en .montage (ça arrive) : on le lit comme un Celtx
    if (substr($octets, 0, 2) === 'PK' && function_exists('texteCeltx')) return texteCeltx($octets);
    $a = new ArchiveCles($octets);
    $script = $a->obj($a->top['script'] ?? null);
    if ($a->nomClasse($script) !== 'AVNRscript') throw new RuntimeException('Ce fichier Montage ne contient pas de script.');
    $tour = [];
    foreach ($a->uids($a->champ($script, 'scenesInScript')) as $u) {
        if (in_array($u, $tour, true)) break;
        $tour[] = $u;
    }
    $blocs = [];
    foreach (array_reverse($tour) as $u) {
        $scene = $a->parUid($u);
        foreach (paragraphesSceneMontage($a, $a->champ($scene, 'text')) as [$element, $ligne]) {
            $blocs[] = [typeBlocMontage($element, $ligne), $ligne];
        }
    }
    if (!$blocs) throw new RuntimeException('Ce fichier Montage est vide : il ne contient que la page de titre du modèle.');
    return assemblerScenario($blocs);
}

/**
 * Les rôles d'un fichier Montage : le nom et les notes qu'on y avait prises.
 * Un même rôle peut revenir plusieurs fois (copié d'un épisode à l'autre) : on garde la note la plus longue.
 */
function rolesMontage(string $octets): array {
    if (substr($octets, 0, 8) !== 'bplist00') return [];
    $a = new ArchiveCles($octets);
    $roles = [];
    foreach ($a->objetsDeClasse('AVNRactor') as $acteur) {
        $nom = trim(preg_replace('/\s+/u', ' ', $a->chaine($a->champ($acteur, 'name'))));
        $nom = rtrim($nom, ' .:');
        if ($nom === '' || mb_strlen($nom) > 80) continue;
        $notes = $a->champ($acteur, 'notes');
        $texte = is_string($notes) ? ($notes === '$null' ? '' : $notes) : $a->chaine($a->champ($notes, 'NSString') ?? $notes);
        $texte = trim(str_replace("\r", '', mb_substr($texte, 0, 5000)));
        $cle = mb_strtolower($nom);
        if (!isset($roles[$cle]) || mb_strlen($texte) > mb_strlen($roles[$cle]['notes'])) $roles[$cle] = ['nom' => $nom, 'notes' => $texte];
    }
    return array_values($roles);
}
