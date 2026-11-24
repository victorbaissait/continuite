'use strict';
/**
 * Essai du serveur PHP de l'app, sans Electron :  npm run test:serveur
 * Sur un dossier de données vide et temporaire : vérifie que rien ne passe sans le secret,
 * que les dossiers de données ne se servent jamais, et que l'interface et l'API répondent.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PhpServer, findPhp, checkPhp, devBundledPhp } = require('./php-server');

(async () => {
  const php = findPhp([devBundledPhp()]);
  if (!php) throw new Error('PHP introuvable : npm run fetch:php');
  const c = checkPhp(php);
  if (!c.ok) throw new Error('PHP incomplet : ' + (c.error || c.missing.join(', ')));
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'continuite-essai-'));
  const s = new PhpServer({ phpPath: php, appRoot: path.resolve(__dirname, '..'), dataDir: path.join(dossier, 'data'), logFile: path.join(dossier, 'php.log'), pool: 1 });
  await s.start();
  const echecs = [];
  const attendre = async (nom, req, statut, verif = () => true) => {
    const r = await req;
    const ok = r.status === statut && verif(r);
    console.log(`${ok ? 'OK' : 'KO'} ${nom} — ${r.status}`);
    if (!ok) echecs.push(nom);
  };
  try {
    // App toute neuve : la liste des projets est souvent la première requête, avant toute base
    await attendre('app neuve : liste des projets', s.request('/api/index.php?path=projets'), 200);
    await attendre('app neuve : notes', s.request('/api/index.php?path=analyse_notes'), 200);
    await attendre('app neuve : nouveau projet', s.request('/api/index.php?path=projets/creer', { method: 'POST', body: JSON.stringify({ nom: 'Essai', type: 'roman' }), headers: { 'content-type': 'application/json' } }), 200);
    await attendre('origine inconnue refusée (rebinding DNS)', s.request('/api/index.php?path=episodes', { headers: { host: 'evil.example:80' } }), 403);
    await attendre('sans le secret, rien ne passe', s.request('/api/index.php?path=episodes', { withSecret: false }), 403);
    await attendre('page sans le secret', s.request('/', { withSecret: false }), 403);
    await attendre('interface', s.request('/'), 200, r => r.body.toString().includes('<html'));
    await attendre('API : épisodes (projet vide)', s.request('/api/index.php?path=episodes'), 200, r => Array.isArray(JSON.parse(r.body.toString())));
    await attendre('API : projets', s.request('/api/index.php?path=projets'), 200);
    await attendre('base de données jamais servie', s.request('/data/sitcom.db'), 404);
    await attendre('code électron jamais servi', s.request('/electron/main.js'), 404);
    await attendre('fichiers cachés jamais servis', s.request('/.gitignore'), 404);
    await attendre('remontée de dossier refusée', s.request('/assets/../data/sitcom.db'), 404);
    await attendre('base créée dans le dossier choisi', Promise.resolve({ status: fs.existsSync(path.join(dossier, 'data', 'sitcom.db')) ? 200 : 0 }), 200);
  } finally {
    await s.stop();
    fs.rmSync(dossier, { recursive: true, force: true });
  }
  if (echecs.length) { console.error(`\n${echecs.length} échec(s)`); process.exit(1); }
  console.log('\nServeur PHP : tout est bon.');
})().catch(e => { console.error('✗ ' + e.message); process.exit(1); });
