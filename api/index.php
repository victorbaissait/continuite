<?php
// api/index.php — Routeur API principal

header('Content-Type: application/json; charset=utf-8');

// Seulement depuis cet ordinateur : un site qui détournerait son nom de domaine vers 127.0.0.1 (rebinding DNS)
// arrive avec son propre nom dans Host, et le réseau local n'atteint pas la série
$hote = strtolower(preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? '')));
if (!in_array($hote, ['localhost', '127.0.0.1', '[::1]'], true) && !str_ends_with($hote, '.localhost')) {
    http_response_code(403);
    echo json_encode(['error' => 'Accessible seulement depuis cet ordinateur (localhost)']);
    exit;
}

// L'interface est servie par la même origine : on refuse les appels venant d'un autre site
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && preg_replace('#^https?://#', '', $origin) !== ($_SERVER['HTTP_HOST'] ?? '')) {
    http_response_code(403);
    echo json_encode(['error' => 'Origine non autorisée']);
    exit;
}

require_once __DIR__ . '/projets.php';

// Une requête mal formée (champ obligatoire absent, mauvais type) : réponse 400, pas une erreur serveur
class RequeteInvalide extends RuntimeException {}

function exigerTexte(array $body, string $cle): string {
    $v = $body[$cle] ?? null;
    if (!is_scalar($v) || trim((string)$v) === '') throw new RequeteInvalide("Le champ « $cle » est obligatoire.");
    return (string)$v;
}

// Chemin de la BDD SQLite du projet ouvert : les caches et sauvegardes vivent à côté
$projet = projetDemande();
define('PROJET_ORIGINE', ($projet ?? '') === '');
define('DB_PATH', dossierProjet($projet ?? '') . '/sitcom.db');
define('PROJET_TYPE', $projet !== null ? infosProjet($projet)['type'] : 'serie');
define('PROJET_ROMAN', PROJET_TYPE === 'roman');

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/routes.php';
require_once __DIR__ . '/noms.php';
require_once __DIR__ . '/sauvegardes.php';
require_once __DIR__ . '/analyse_data.php';
require_once __DIR__ . '/ecriture.php';
require_once __DIR__ . '/formats.php';
require_once __DIR__ . '/roman.php';
require_once __DIR__ . '/film.php';
require_once __DIR__ . '/bd.php';
require_once __DIR__ . '/storyboard.php';
require_once __DIR__ . '/export.php';
require_once __DIR__ . '/genres.php';
require_once __DIR__ . '/atelier.php';
require_once __DIR__ . '/cartes.php';
require_once __DIR__ . '/secrets.php';
require_once __DIR__ . '/calendrier.php';
require_once __DIR__ . '/dramaturgie.php';
require_once __DIR__ . '/fusion.php';
require_once __DIR__ . '/montage.php';
require_once __DIR__ . '/inconnu.php';
require_once __DIR__ . '/style.php';
require_once __DIR__ . '/parcours.php';
require_once __DIR__ . '/creatif.php';

$path = $_GET['path'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// Corps JSON
$body = [];
// Un projet envoyé en entier se lit par morceaux plus loin, jamais d'un bloc en mémoire
if (in_array($method, ['POST', 'PUT']) && trim($path, '/') !== 'projets/apercu_import') {
    $raw = file_get_contents('php://input');
    if ($raw) $body = json_decode($raw, true) ?? [];
    // FormData (upload)
    if (empty($body) && !empty($_POST)) $body = $_POST;
}

try {
    if (explode('/', trim($path, '/'))[0] === 'projets') {
        handleProjets($method, explode('/', trim($path, '/')), $body);
        exit;
    }
    if ($projet === null) {
        http_response_code(404);
        echo json_encode(['error' => 'Projet introuvable']);
        exit;
    }
    $db = getDB();
    if (PROJET_ROMAN || in_array(PROJET_TYPE, ['bd', 'theatre', 'jeu'], true)) contexteProse($db);
    route($db, $method, $path, $body);
} catch (Throwable $e) {
    error_log((string)$e);
    // Données invalides : la faute vient de la requête, pas du serveur
    $contrainte = $e instanceof PDOException && str_starts_with((string)$e->getCode(), '23');
    if ($e instanceof RequeteInvalide || $e instanceof TypeError || $e instanceof ValueError || $e instanceof JsonException || $contrainte) {
        http_response_code(400);
        $message = $e instanceof RequeteInvalide ? $e->getMessage()
            : ($contrainte ? 'Données invalides : un champ obligatoire manque, ou un élément lié n\'existe plus.' : 'Requête invalide.');
        echo json_encode(['error' => $message]);
        exit;
    }
    http_response_code(500);
    $enLocal = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
    // Jamais le chemin des fichiers de l'app dans un message
    $message = str_replace([dirname(__DIR__) . DIRECTORY_SEPARATOR, dirname(__DIR__)], '', $e->getMessage());
    echo json_encode(['error' => $enLocal ? $message : 'Erreur serveur']);
}
