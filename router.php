<?php
// router.php — Routeur du serveur PHP intégré de l'app de bureau :  php -S 127.0.0.1:PORT -t . router.php
// Refuse toute requête sans le secret du lancement (aucun autre programme de l'ordinateur ne peut lire la série),
// interdit les dossiers qui ne sont pas l'interface, et laisse PHP servir le reste.

// Sous Apache (MAMP), ce fichier n'a rien à faire
if (PHP_SAPI !== 'cli-server') { http_response_code(404); exit; }

$secret = (string)getenv('APP_SECRET');
$donne = (string)($_SERVER['HTTP_X_APP_SECRET'] ?? '');
if ($secret === '' || !hash_equals($secret, $donne)) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Accès refusé';
    return true;
}

$chemin = rawurldecode((string)parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
if ($chemin === '/__sante') { header('Content-Type: text/plain'); echo 'ok'; return true; }

// Seuls l'interface et l'API se servent : jamais les données, les outils ni les fichiers cachés
$autorise = $chemin === '/' || $chemin === '/index.html' || $chemin === '/journal.css' || $chemin === '/docs/GUIDE.md'
    || str_starts_with($chemin, '/assets/') || $chemin === '/api/index.php';
if (!$autorise || str_contains($chemin, '..') || preg_match('#/\.#', $chemin)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Introuvable';
    return true;
}
return false;
