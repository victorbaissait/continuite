'use strict';
/**
 * L'app de bureau : Electron lance PHP en arrière-plan (php-server.js) et affiche l'interface dans une fenêtre.
 * Rien ne sort de l'ordinateur : PHP n'écoute que 127.0.0.1 et refuse toute requête sans le secret du lancement.
 *
 *   npm start               données dans le dossier de l'utilisateur (Mac : ~/Library/Application Support/<dossier>)
 *   npm run start:local     données = dossier data/ du projet (celui de MAMP)
 *   APP_DATA_DIR_DESKTOP=… npm start   dossier de données de ton choix
 *
 * Le nom de l'app et celui de son dossier de données se règlent dans package.json (productName, dossierDonnees).
 */
const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { PhpServer, findPhp, checkPhp, devBundledPhp, SECRET_HEADER } = require('./php-server');
const pkg = require('../package.json');

const APP_NAME = pkg.productName;
app.setName(APP_NAME);
// Dossier de l'utilisateur sans accents ni espaces : PHP, SQLite et Windows s'entendent mieux ainsi
// Essais : un profil à part (APP_USER_DATA_DESKTOP), pour ne jamais toucher à celui de l'utilisateur
app.setPath('userData', process.env.APP_USER_DATA_DESKTOP ? path.resolve(process.env.APP_USER_DATA_DESKTOP) : path.join(app.getPath('appData'), pkg.dossierDonnees));

const APP_ROOT = app.isPackaged ? path.join(process.resourcesPath, 'php-app') : path.resolve(__dirname, '..');
const BUNDLED_PHP = app.isPackaged
  ? [path.join(process.resourcesPath, 'php', process.platform === 'win32' ? 'php.exe' : 'php')]
  : [devBundledPhp()];
const useProjectData = process.argv.includes('--use-project-data');
// Là où vivait la série avant l'app de bureau : proposé au premier lancement sur ce Mac
const ANCIEN_DOSSIER = '/Applications/MAMP/htdocs/lemenu/data';

// Journal de fermeture, pendant les essais seulement
const trace = t => { if (process.env.APP_TRACE) fs.appendFileSync(process.env.APP_TRACE, `${new Date().toISOString()} ${t}\n`); };
// Pendant un essai automatique, rien ne s'ouvre dans le navigateur de l'utilisateur
const ESSAI = Boolean(process.env.APP_SINGE || process.env.APP_SELFTEST);
let server = null;
let win = null;
let quitting = false;

function chemins() {
  const userData = app.getPath('userData');
  return {
    userData,
    dataDir: process.env.APP_DATA_DIR_DESKTOP || (useProjectData ? path.join(APP_ROOT, 'data') : path.join(userData, 'data')),
    logFile: path.join(userData, 'logs', 'php.log'),
    configFile: path.join(userData, 'config.json'),
  };
}

function lireConfig(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
function ecrireConfig(file, config) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(config, null, 2)); } catch { /* rien */ }
}

// Premier lancement sans données : reprendre la série de MAMP, si elle est là (copie : l'original ne bouge pas)
async function reprendreAnciennesDonnees(dataDir) {
  if (useProjectData || process.env.APP_DATA_DIR_DESKTOP) return;
  if (fs.existsSync(path.join(dataDir, 'sitcom.db')) || !fs.existsSync(path.join(ANCIEN_DOSSIER, 'sitcom.db'))) return;
  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Reprendre mes projets', 'Commencer à vide'],
    defaultId: 0,
    cancelId: 1,
    message: 'Reprendre les projets de MAMP ?',
    detail: `Tes projets sont dans ${ANCIEN_DOSSIER}. ${APP_NAME} peut en faire une copie dans son propre dossier : l'original reste où il est, intact.\n\nFerme d'abord l'onglet du navigateur qui l'utilise, pour copier une version à jour.`,
  });
  if (response !== 0) return;
  fs.mkdirSync(dataDir, { recursive: true });
  fs.cpSync(ANCIEN_DOSSIER, dataDir, { recursive: true, filter: src => !/\.htaccess$|\.DS_Store$/.test(src) });
}

// ─── prompt() : Electron ne l'affiche pas, une petite fenêtre le remplace ───

ipcMain.on('bureau:prompt', (event, message, defaut) => {
  const parent = BrowserWindow.fromWebContents(event.sender);
  const invite = new BrowserWindow({
    parent, modal: true, width: 460, height: 210, resizable: false, minimizable: false, maximizable: false,
    title: APP_NAME, show: false, autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'prompt-preload.js') },
  });
  let fini = false;
  const repondre = valeur => {
    if (fini) return;
    fini = true;
    event.returnValue = valeur;
    if (!invite.isDestroyed()) invite.close();
  };
  const surReponse = (e, valeur) => { if (e.sender === invite.webContents) repondre(typeof valeur === 'string' ? valeur : null); };
  ipcMain.on('bureau:prompt-reponse', surReponse);
  invite.on('closed', () => { ipcMain.off('bureau:prompt-reponse', surReponse); repondre(null); });
  invite.webContents.on('will-navigate', e => e.preventDefault());
  invite.loadFile(path.join(__dirname, 'prompt.html'), { query: { m: String(message).slice(0, 500), d: String(defaut).slice(0, 2000) } });
  invite.once('ready-to-show', () => invite.show());
});

// ─── Fenêtre ───────────────────────────────────────────────────────────────

function menu() {
  const mac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu', label: 'Fichier' },
    { role: 'editMenu', label: 'Édition' },
    { label: 'Présentation', submenu: [
      { role: 'reload', label: 'Recharger' },
      { role: 'toggleDevTools', label: 'Outils de développement' },
      { type: 'separator' },
      { role: 'resetZoom', label: 'Taille réelle' },
      { role: 'zoomIn', label: 'Agrandir' },
      { role: 'zoomOut', label: 'Réduire' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Plein écran' },
    ] },
    { role: 'windowMenu', label: 'Fenêtre' },
    { label: 'Aide', role: 'help', submenu: [
      { label: 'Ouvrir le dossier des données', click: () => shell.openPath(chemins().dataDir) },
      { label: 'Ouvrir le journal de PHP', click: () => shell.openPath(chemins().logFile) },
    ] },
  ]));
}

// Ce que la page peut ouvrir : ses propres pages et les fenêtres d'impression ; le reste part dans le navigateur
// Toutes les fenêtres (la principale, l'impression, la saisie) passent par les mêmes règles
app.on('web-contents-created', (_e, contents) => { if (contents.getType() === 'window') proteger(contents); });
const origine = () => (server ? server.origin : 'http://app.invalid');
function proteger(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if ((url === 'about:blank' && !ESSAI) || url.startsWith(origine() + '/')) {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } } };
    }
    if (/^https?:\/\//.test(url) && !ESSAI) shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (url.startsWith(origine() + '/')) return;
    event.preventDefault();
    if (/^https?:\/\//.test(url) && !ESSAI) shell.openExternal(url);
  });
}

function creerFenetre() {
  const p = chemins();
  const config = lireConfig(p.configFile);
  const b = config.fenetre || {};
  win = new BrowserWindow({
    width: b.width || 1440, height: b.height || 900, x: b.x, y: b.y, minWidth: 900, minHeight: 600,
    title: APP_NAME, backgroundColor: '#0a0a0a', show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true, preload: path.join(__dirname, 'preload.js') },
  });
  win.once('ready-to-show', () => win.show());
  // La page change son titre selon le projet : la fenêtre garde celui de l'app
  win.on('page-title-updated', event => event.preventDefault());
  win.on('close', () => ecrireConfig(p.configFile, { ...lireConfig(p.configFile), fenetre: win.getBounds() }));
  win.on('closed', () => { win = null; });
  win.loadFile(path.join(__dirname, 'loading.html')).catch(() => {});
}

// Si l'app a été tuée (plantage, arrêt forcé), ses PHP ont pu lui survivre : ils gardent le port habituel,
// l'adresse change et l'interface perd ses préférences. Leurs numéros sont notés pour les arrêter au lancement suivant.
function fichierPids() { return path.join(app.getPath('userData'), 'php.pids'); }
function arreterOrphelins(phpPath) {
  let pids = [];
  try { pids = JSON.parse(fs.readFileSync(fichierPids(), 'utf8')); } catch { return; }
  for (const pid of Array.isArray(pids) ? pids : []) {
    if (!Number.isInteger(pid) || pid <= 1) continue;
    // Seulement un PHP de l'app : un numéro réutilisé par un autre programme n'est jamais touché
    let commande = '';
    try {
      commande = process.platform === 'win32'
        ? require('node:child_process').execFileSync('wmic', ['process', 'where', `ProcessId=${pid}`, 'get', 'ExecutablePath'], { encoding: 'utf8', windowsHide: true })
        : require('node:child_process').execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
    } catch { continue; }
    if (commande.includes(phpPath) || commande.includes(path.basename(path.dirname(phpPath)) + path.sep + path.basename(phpPath))) {
      try { process.kill(pid); } catch { /* déjà arrêté */ }
    }
  }
  try { fs.unlinkSync(fichierPids()); } catch { /* rien */ }
}
function noterPids() {
  const pids = server ? server.backends.map(b => b.child && b.child.pid).filter(Boolean) : [];
  try { fs.writeFileSync(fichierPids(), JSON.stringify(pids)); } catch { /* rien */ }
}

async function demarrer() {
  menu();
  creerFenetre();
  const p = chemins();
  const phpPath = findPhp(BUNDLED_PHP);
  if (!phpPath) {
    dialog.showErrorBox(APP_NAME, 'PHP est introuvable. En développement : npm run fetch:php.');
    app.quit();
    return;
  }
  const verif = checkPhp(phpPath);
  if (!verif.ok) {
    dialog.showErrorBox(APP_NAME, `Ce PHP ne convient pas : ${verif.error || 'il manque ' + verif.missing.join(', ')}.`);
    app.quit();
    return;
  }
  arreterOrphelins(phpPath);
  await reprendreAnciennesDonnees(p.dataDir);
  const config = lireConfig(p.configFile);
  server = new PhpServer({ phpPath, appRoot: APP_ROOT, dataDir: p.dataDir, logFile: p.logFile, preferredPort: config.port, pool: 3 });
  server.on('fatal', err => {
    if (quitting) return;
    dialog.showErrorBox(APP_NAME, `PHP s'est arrêté : ${err.message}\nLe journal est dans ${p.logFile}.`);
    app.quit();
  });
  try {
    await server.start();
  } catch (err) {
    dialog.showErrorBox(APP_NAME, `Impossible de démarrer PHP : ${err.message}\nLe journal est dans ${p.logFile}.`);
    app.quit();
    return;
  }
  noterPids();
  server.on('restarted', noterPids);
  // Même port d'un lancement à l'autre : l'adresse ne change pas et l'interface garde ses préférences
  ecrireConfig(p.configFile, { ...lireConfig(p.configFile), port: server.port });
  // Ni caméra, ni micro, ni position, ni notifications : l'app n'en a pas besoin
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [server.origin + '/*'] }, (details, callback) => {
    details.requestHeaders[SECRET_HEADER] = server.secret;
    callback({ requestHeaders: details.requestHeaders });
  });
  if (win) await win.loadURL(server.origin + '/');
  if (process.env.APP_SELFTEST) {
    try {
      await essaiAutomatique(process.env.APP_SELFTEST);
    } catch (e) {
      fs.writeFileSync(path.join(process.env.APP_SELFTEST, 'erreur.txt'), String(e && e.stack || e));
      app.quit();
    }
  }
  // Essai « utilisateur qui fait n'importe quoi » : développement seulement (le fichier n'est pas dans l'app livrée)
  if (process.env.APP_SINGE && !app.isPackaged) {
    try {
      await require('./essai-singe')(win, process.env.APP_SINGE, { actions: Number(process.env.APP_SINGE_ACTIONS) || 800 });
    } catch (e) {
      trace('essai interrompu : ' + (e && e.stack || e));
    } finally {
      trace('demande de fermeture');
      app.quit();
    }
  }
}

// Essai automatique (APP_SELFTEST=dossier) : l'app ouvre quelques onglets, en fait des captures, puis se ferme
async function essaiAutomatique(dossier) {
  const attendre = ms => new Promise(r => setTimeout(r, ms));
  const capturer = async nom => {
    const image = await Promise.race([win.webContents.capturePage().catch(() => null), attendre(5000).then(() => null)]);
    if (image) fs.writeFileSync(path.join(dossier, nom + '.png'), image.toPNG());
  };
  fs.mkdirSync(dossier, { recursive: true });
  await attendre(4000);
  await capturer('1-accueil');
  const etat = await win.webContents.executeJavaScript(`({ prompt: typeof window.bureau?.promptSync, api: API_BASE, onglets: document.querySelectorAll('.nav-btn').length, titre: document.title })`);
  for (const [i, onglet] of ['personnages', 'analyse'].entries()) {
    await win.webContents.executeJavaScript(`document.querySelector('[data-tab="${onglet}"]')?.click()`);
    await attendre(4000);
    await capturer(`${i + 2}-${onglet}`);
  }
  etat.securite = await essaiSecurite();
  fs.writeFileSync(path.join(dossier, 'etat.json'), JSON.stringify(etat, null, 2));
  app.quit();
}

// Ce qu'une page piégée tenterait : sortir de l'app, lire un fichier, appeler Internet, ouvrir le micro
async function essaiSecurite() {
  const attendre = ms => new Promise(r => setTimeout(r, ms));
  const wc = win.webContents;
  const r = {};
  const js = code => Promise.race([wc.executeJavaScript(code).catch(e => 'exception : ' + e.message), attendre(8000).then(() => 'délai dépassé')]);
  // La fenêtre de saisie : une réponse, puis une annulation
  const autres = () => BrowserWindow.getAllWindows().filter(w => w !== win && !w.isDestroyed());
  for (const [cas, action, attendu] of [['ok', "document.getElementById('valeur').value = 'réponse ✓'; document.getElementById('ok').click()", 'réponse ✓'], ['annuler', "document.getElementById('annuler').click()", null]]) {
    const question = js(`prompt('Question d\\'essai ?', 'défaut')`);
    await attendre(1500);
    const invite = autres()[0];
    const defaut = invite ? await Promise.race([invite.webContents.executeJavaScript("document.getElementById('valeur').value").catch(() => null), attendre(3000).then(() => 'délai')]) : null;
    if (invite) await Promise.race([invite.webContents.executeJavaScript(action).catch(() => {}), attendre(3000)]);
    const reponse = await Promise.race([question, attendre(5000).then(() => 'délai')]);
    r[`prompt_${cas}`] = invite && defaut === 'défaut' && reponse === attendu ? 'ok' : `KO (fenêtre ${!!invite}, défaut ${defaut}, réponse ${reponse})`;
  }
  const origine = server.origin + '/';
  await js(`location.href = 'https://example.com/'`);
  await attendre(1500);
  r.navigation_externe = wc.getURL().startsWith(origine) ? 'bloquée' : 'KO : ' + wc.getURL();
  await js(`location.href = 'file:///etc/passwd'`);
  await attendre(1000);
  r.navigation_fichier = wc.getURL().startsWith(origine) ? 'bloquée' : 'KO : ' + wc.getURL();
  const avant = autres().length;
  r.fenetre_fichier = (await js(`String(window.open('file:///etc/passwd'))`)) === 'null' ? 'bloquée' : 'KO';
  r.fenetre_externe = (await js(`String(window.open('https://example.com/'))`)) === 'null' ? 'bloquée' : 'KO';
  await attendre(500);
  r.fenetres_ouvertes = autres().length - avant;
  r.reseau_externe = await js(`fetch('https://example.com/').then(() => 'KO : la requête est partie', () => 'bloqué')`);
  r.micro = await js(`navigator.mediaDevices ? navigator.mediaDevices.getUserMedia({ audio: true }).then(() => 'KO : accordé', e => 'refusé (' + e.name + ')') : 'absent'`);
  r.node = await js(`[typeof require, typeof process, typeof module].join(',')`);
  r.pont = await js(`Object.keys(window.bureau || {}).join(',')`);
  return r;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(demarrer);
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    trace('before-quit');
    if (quitting || !server) return;
    event.preventDefault();
    quitting = true;
    // PHP a 5 secondes pour s'arrêter proprement ; l'app se ferme ensuite dans tous les cas
    const fermer = () => {
      trace('fermeture');
      try { fs.unlinkSync(fichierPids()); } catch { /* rien */ }
      app.exit(0);
    };
    const secours = setTimeout(() => {
      for (const b of server.backends) { try { b.child && b.child.kill('SIGKILL'); } catch { /* déjà arrêté */ } }
      fermer();
    }, 5000);
    server.stop().catch(() => {}).finally(() => { clearTimeout(secours); fermer(); });
  });
}
