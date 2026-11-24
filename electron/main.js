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
const { app, BrowserWindow, Menu, dialog, ipcMain, powerMonitor, safeStorage, session, shell } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { PhpServer, findPhp, checkPhp, devBundledPhp, SECRET_HEADER } = require('./php-server');
const majs = require('./updates');
const sauvegarde = require('./sauvegarde');
const verrou = require('./verrou');
const { Surveillance } = require('./surveillance');
const { LectureReseau } = require('./lecture-reseau');
const lectureReseau = new LectureReseau();
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
// La fenêtre principale (menus, mises à jour, sauvegarde), et toutes les fenêtres de l'app
let win = null;
const fenetres = new Set();
const estFenetreApp = contents => [...fenetres].some(f => !f.isDestroyed() && f.webContents === contents)
  // et seulement la page de l'app elle-même (pas l'écran du verrou ni une page de chargement)
  && Boolean(server) && String(contents.getURL()).startsWith(server.origin + '/');
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

// Une petite fenêtre qui pose une question (texte ou mot de passe) ; rappel(valeur ou null)
function ouvrirInvite(parent, message, defaut, type, rappel) {
  const invite = new BrowserWindow({
    parent: parent || undefined, modal: Boolean(parent), width: 460, height: 210, resizable: false, minimizable: false, maximizable: false,
    title: APP_NAME, show: false, autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'prompt-preload.js') },
  });
  let fini = false;
  const repondre = valeur => {
    if (fini) return;
    fini = true;
    rappel(valeur);
    if (!invite.isDestroyed()) invite.close();
  };
  const surReponse = (e, valeur) => { if (e.sender === invite.webContents) repondre(typeof valeur === 'string' ? valeur : null); };
  ipcMain.on('bureau:prompt-reponse', surReponse);
  invite.on('closed', () => { ipcMain.off('bureau:prompt-reponse', surReponse); repondre(null); });
  invite.webContents.on('will-navigate', e => e.preventDefault());
  invite.loadFile(path.join(__dirname, 'prompt.html'), { query: { m: String(message).slice(0, 500), d: String(defaut).slice(0, 2000), t: type || '' } });
  invite.once('ready-to-show', () => invite.show());
}

const demanderMotDePasse = (parent, message) => new Promise(r => ouvrirInvite(parent, message, '', 'motdepasse', r));

ipcMain.on('bureau:prompt', (event, message, defaut) => {
  ouvrirInvite(BrowserWindow.fromWebContents(event.sender), message, defaut, '', valeur => { event.returnValue = valeur; });
});

// ─── Fenêtre ───────────────────────────────────────────────────────────────

// Une commande pour la page : elle sait quoi en faire (changer d'onglet, chercher, nouvel épisode…)
// Une commande des menus va à la fenêtre de l'app qui a la main (sinon à la principale)
function commande(nom, valeur) {
  const active = BrowserWindow.getFocusedWindow();
  const cible = active && fenetres.has(active) ? active : win;
  if (cible && !cible.isDestroyed()) cible.webContents.send('bureau:commande', nom, valeur ?? null);
}

// Les raccourcis qu'on peut changer (Config → App de bureau → Raccourcis clavier), avec ceux d'origine
const RACCOURCIS = [
  ['reglages', 'Réglages', 'CmdOrCtrl+,'], ['nouvel-episode', 'Nouvel épisode', 'CmdOrCtrl+N'], ['ouvrir', 'Ouvrir un projet partagé', 'CmdOrCtrl+O'],
  ['fenetre', 'Nouvelle fenêtre', 'CmdOrCtrl+Shift+N'], ['verrouiller', 'Verrouiller', 'CmdOrCtrl+L'], ['pdf', 'Enregistrer la page en PDF', 'CmdOrCtrl+Shift+E'],
  ['sauvegarder', 'Sauvegarder tous les projets', ''], ['recherche', 'Rechercher dans la série', 'CmdOrCtrl+F'], ['palette', 'Aller à… (palette)', 'CmdOrCtrl+K'],
  ['concentration', 'Mode concentration', 'CmdOrCtrl+Shift+F'],
];
const TOUCHE_VALIDE = /^(?:(?:CmdOrCtrl|Alt|Shift|Ctrl|Cmd|Super)\+){0,3}(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|[,.;/\-=[\]']|Up|Down|Left|Right|Space|Tab|Backspace|Delete|Enter)$/;
function raccourcisChoisis() {
  const c = lireConfig(chemins().configFile).raccourcis;
  return c && typeof c === 'object' && !Array.isArray(c) ? c : {};
}
// Le raccourci d'une action : celui choisi (une chaîne vide veut dire aucun), sinon celui d'origine
function touche(id, defaut) {
  const c = raccourcisChoisis();
  if (typeof c[id] === 'string' && (c[id] === '' || TOUCHE_VALIDE.test(c[id]))) return c[id] || undefined;
  return defaut || undefined;
}
const defautDe = id => (RACCOURCIS.find(r => r[0] === id) || [])[2] || (id.startsWith('onglet-') ? `CmdOrCtrl+${ONGLETS.findIndex(o => `onglet-${o[0]}` === id) + 1}` : '');

const ONGLETS = [['episodes', 'Épisodes'], ['ecriture', 'Écriture'], ['personnages', 'Personnages'], ['decors', 'Décors'], ['frise', 'Frise'], ['themes', 'Thèmes'], ['suivi', 'Suivi'], ['analyse', 'Analyse'], ['recherche', 'Recherche']];
const DOC = 'https://github.com/victorbaissait/continuite/blob/main/docs/GUIDE.md';

function menu() {
  const mac = process.platform === 'darwin';
  const prefsMaj = majs.cleanPrefs(lireConfig(chemins().configFile).updates);
  const maj = [
    { label: 'Rechercher les mises à jour…', click: () => verifierMaj(true) },
    { label: 'Prévenir quand une version sort', type: 'checkbox', checked: prefsMaj.auto, click: item => reglerMaj({ auto: item.checked }) },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ label: APP_NAME, submenu: [
      { role: 'about', label: `À propos de ${APP_NAME}` },
      ...maj,
      { type: 'separator' },
      { label: 'Réglages…', accelerator: touche('reglages', 'CmdOrCtrl+,'), click: () => commande('onglet', 'settings') },
      { type: 'separator' },
      { role: 'hide', label: `Masquer ${APP_NAME}` }, { role: 'hideOthers', label: 'Masquer les autres' }, { role: 'unhide', label: 'Tout afficher' },
      { type: 'separator' },
      { role: 'quit', label: `Quitter ${APP_NAME}` },
    ] }] : []),
    { label: 'Fichier', submenu: [
      { label: 'Nouvel épisode', accelerator: touche('nouvel-episode', 'CmdOrCtrl+N'), click: () => commande('nouvel-episode') },
      { label: 'Ouvrir un projet partagé…', accelerator: touche('ouvrir', 'CmdOrCtrl+O'), click: choisirFichierProjet },
      { label: 'Nouvelle fenêtre', accelerator: touche('fenetre', 'CmdOrCtrl+Shift+N'), click: () => nouvelleFenetre() },
      { label: 'Verrouiller', accelerator: touche('verrouiller', 'CmdOrCtrl+L'), enabled: verrou.actif(lireConfig(chemins().configFile).verrou), click: () => verrouiller() },
      { type: 'separator' },
      { label: 'Enregistrer la page en PDF…', accelerator: touche('pdf', 'CmdOrCtrl+Shift+E'), click: () => pdfDeLaPage(BrowserWindow.getFocusedWindow() || win) },
      { label: 'Sauvegarder tous les projets maintenant', accelerator: touche('sauvegarder', ''), click: () => lancerSauvegarde('menu') },
      { type: 'separator' },
      ...(mac ? [{ role: 'close', label: 'Fermer la fenêtre' }] : [{ label: 'Réglages…', accelerator: touche('reglages', 'CmdOrCtrl+,'), click: () => commande('onglet', 'settings') }, { type: 'separator' }, { role: 'quit', label: 'Quitter' }]),
    ] },
    { label: 'Édition', submenu: [
      { role: 'undo', label: 'Annuler' }, { role: 'redo', label: 'Rétablir' },
      { type: 'separator' },
      { role: 'cut', label: 'Couper' }, { role: 'copy', label: 'Copier' }, { role: 'paste', label: 'Coller' },
      { role: 'pasteAndMatchStyle', label: 'Coller sans la mise en forme' }, { role: 'selectAll', label: 'Tout sélectionner' },
      { type: 'separator' },
      { label: 'Rechercher dans la série', accelerator: touche('recherche', 'CmdOrCtrl+F'), click: () => commande('recherche') },
      { label: 'Aller à… (palette)', accelerator: touche('palette', 'CmdOrCtrl+K'), click: () => commande('palette') },
    ] },
    { label: 'Présentation', submenu: [
      ...ONGLETS.map(([cle, nom], i) => ({ label: nom, accelerator: touche(`onglet-${cle}`, `CmdOrCtrl+${i + 1}`), click: () => commande('onglet', cle) })),
      { type: 'separator' },
      { label: 'Mode concentration', accelerator: touche('concentration', 'CmdOrCtrl+Shift+F'), click: () => commande('concentration') },
      { role: 'togglefullscreen', label: 'Plein écran' },
      { type: 'separator' },
      { role: 'resetZoom', label: 'Taille réelle' }, { role: 'zoomIn', label: 'Agrandir' }, { role: 'zoomOut', label: 'Réduire' },
      { type: 'separator' },
      { role: 'reload', label: 'Recharger' },
      { role: 'toggleDevTools', label: 'Outils de développement' },
    ] },
    { role: 'windowMenu', label: 'Fenêtre' },
    { label: 'Aide', role: 'help', submenu: [
      { label: 'Aide sur cet écran', accelerator: 'F1', click: () => commande('aide') },
      { label: `Guide de ${APP_NAME}`, click: () => shell.openExternal(DOC) },
      ...(mac ? [] : [{ type: 'separator' }, ...maj]),
      { type: 'separator' },
      { label: 'Ouvrir le dossier des données', click: () => shell.openPath(chemins().dataDir) },
      { label: 'Ouvrir le journal de PHP', click: () => shell.openPath(chemins().logFile) },
    ] },
  ]));
}

// ─── Clic droit : couper, copier, coller, et l'orthographe (suggestions, ajouter au dictionnaire) ───

function menuContextuel(contents) {
  contents.on('context-menu', (_e, p) => {
    const items = [];
    if (p.misspelledWord) {
      for (const s of (p.dictionarySuggestions || []).slice(0, 6)) items.push({ label: s, click: () => contents.replaceMisspelling(s) });
      if (!(p.dictionarySuggestions || []).length) items.push({ label: 'Aucune suggestion', enabled: false });
      items.push({ label: `Ajouter « ${p.misspelledWord} » au dictionnaire`, click: () => contents.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
      items.push({ type: 'separator' });
    }
    const f = p.editFlags || {};
    if (p.isEditable) {
      items.push({ role: 'undo', label: 'Annuler', enabled: f.canUndo }, { role: 'redo', label: 'Rétablir', enabled: f.canRedo }, { type: 'separator' },
        { role: 'cut', label: 'Couper', enabled: f.canCut }, { role: 'copy', label: 'Copier', enabled: f.canCopy },
        { role: 'paste', label: 'Coller', enabled: f.canPaste }, { role: 'selectAll', label: 'Tout sélectionner' });
    } else if (p.selectionText && p.selectionText.trim()) {
      items.push({ role: 'copy', label: 'Copier' });
    }
    const choisi = String(p.selectionText || '').trim().replace(/\s+/g, ' ');
    if (choisi && choisi.length <= 80 && estFenetreApp(contents)) {
      items.push({ type: 'separator' }, { label: `Chercher « ${choisi.length > 30 ? choisi.slice(0, 30) + '…' : choisi} » dans la série`, click: () => commande('chercher', choisi) });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: BrowserWindow.fromWebContents(contents) || undefined });
  });
}

// Ce que la page peut ouvrir : ses propres pages et les fenêtres d'impression ; le reste part dans le navigateur
// Toutes les fenêtres (la principale, l'impression, la saisie) passent par les mêmes règles
app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'window') return;
  proteger(contents);
  menuContextuel(contents);
});
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

function creerFenetre(principale = true) {
  const p = chemins();
  const config = lireConfig(p.configFile);
  const b = principale ? config.fenetre || {} : {};
  // Une fenêtre en plus s'ouvre un peu décalée de celle qui a la main
  const depuis = !principale && BrowserWindow.getFocusedWindow();
  const pos = depuis ? depuis.getBounds() : null;
  const f = new BrowserWindow({
    width: b.width || (pos ? pos.width : 1440), height: b.height || (pos ? pos.height : 900),
    x: pos ? pos.x + 40 : b.x, y: pos ? pos.y + 40 : b.y, minWidth: 900, minHeight: 600,
    title: APP_NAME, backgroundColor: '#0a0a0a', show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true, preload: path.join(__dirname, 'preload.js') },
  });
  fenetres.add(f);
  f.once('ready-to-show', () => f.show());
  // La page change son titre selon le projet : la fenêtre garde celui de l'app
  f.on('page-title-updated', event => event.preventDefault());
  if (principale) f.on('close', () => ecrireConfig(p.configFile, { ...lireConfig(p.configFile), fenetre: f.getBounds() }));
  f.on('closed', () => {
    fenetres.delete(f);
    // La principale fermée, une autre prend sa place
    if (win === f) win = [...fenetres][0] || null;
  });
  if (principale) {
    win = f;
    f.loadFile(path.join(__dirname, 'loading.html')).catch(() => {});
  }
  return f;
}

// Une fenêtre en plus, sur la même app : pour relire un épisode pendant qu'on écrit le suivant
function nouvelleFenetre(options = {}) {
  if (!server || !pageChargee || verrouille) return null;
  const f = creerFenetre(false);
  const episode = Number(options.episode);
  f.loadURL(server.origin + '/' + (Number.isInteger(episode) && episode > 0 ? `#brouillon=${episode}` : ''));
  return f;
}
ipcMain.handle('bureau:fenetre', (event, options) => {
  if (!estFenetreApp(event.sender)) return false;
  return Boolean(nouvelleFenetre(options && typeof options === 'object' ? options : {}));
});

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
  fichiersEnAttente.push(...fichiersDansArguments(process.argv));
  // Avec un mot de passe, l'écran du verrou d'abord : la page de l'app n'est chargée qu'au bon mot de passe
  if (verrou.actif(reglagesVerrou()) && !process.env.APP_SELFTEST && !process.env.APP_SINGE) await afficherVerrou();
  else await chargerApp();
  // Verrouillage automatique : après l'inactivité choisie, et quand l'ordinateur se met en veille ou se verrouille
  setInterval(() => {
    const v = reglagesVerrou();
    if (verrou.actif(v) && v.minutes && !verrouille && powerMonitor.getSystemIdleTime() >= v.minutes * 60) verrouiller();
  }, 30000);
  for (const evenement of ['lock-screen', 'suspend']) {
    powerMonitor.on(evenement, () => { const v = reglagesVerrou(); if (verrou.actif(v) && v.veille && !verrouille) verrouiller(); });
  }
  demarrerSurveillance();
  if (!ESSAI) {
    // La sauvegarde du jour au lancement, puis une vérification chaque heure ; les mises à jour un peu après le démarrage
    if (sauvegarde.aFaire(reglagesSauvegarde(), 'jour')) lancerSauvegarde('jour');
    setInterval(() => { if (sauvegarde.aFaire(reglagesSauvegarde(), 'jour')) lancerSauvegarde('jour'); }, 3600 * 1000);
    if (app.isPackaged) setTimeout(() => verifierMaj(false), 8000);
  }
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
  // Un projet passé au lancement (double-clic quand l'app était fermée) : l'aperçu d'import doit l'attendre
  let auLancement = null;
  for (let i = 0; i < 20; i++) {
    auLancement = await win.webContents.executeJavaScript(`[document.querySelector('.nav-btn.active')?.dataset.tab, typeof Portable !== 'undefined' && Portable.recu ? Portable.recu.nom : null]`).catch(() => null);
    if (auLancement && auLancement[1]) break;
    await attendre(500);
  }
  const etat = await win.webContents.executeJavaScript(`({ prompt: typeof window.bureau?.promptSync, api: API_BASE, onglets: document.querySelectorAll('.nav-btn').length, titre: document.title })`);
  for (const [i, onglet] of ['personnages', 'analyse'].entries()) {
    await win.webContents.executeJavaScript(`document.querySelector('[data-tab="${onglet}"]')?.click()`);
    await attendre(4000);
    await capturer(`${i + 2}-${onglet}`);
  }
  etat.fichierAuLancement = auLancement;
  etat.securite = await essaiSecurite();
  etat.bureau = await essaiBureau(dossier);
  etat.nouveautes = await essaiNouveautes(dossier);
  fs.writeFileSync(path.join(dossier, 'etat.json'), JSON.stringify(etat, null, 2));
  app.quit();
}

// Ce que l'app de bureau ajoute : commandes des menus, PDF, projets ouverts par fichier ou glissés, sauvegarde, clic droit
async function essaiBureau(dossier) {
  const attendre = ms => new Promise(r => setTimeout(r, ms));
  const wc = win.webContents;
  const js = code => Promise.race([wc.executeJavaScript(code).catch(e => 'exception : ' + e.message), attendre(15000).then(() => 'délai dépassé')]);
  const r = {};
  const ok = (cle, vrai, detail) => { r[cle] = vrai ? 'ok' : `KO ${detail === undefined ? '' : JSON.stringify(detail).slice(0, 300)}`; };
  const actif = () => js(`document.querySelector('.nav-btn.active')?.dataset.tab`);

  // Les commandes des menus et des raccourcis
  commande('onglet', 'analyse'); await attendre(2500);
  ok('commande_onglet', (await actif()) === 'analyse', await actif());
  commande('chercher', 'essai-recherche'); await attendre(1500);
  const recherche = await js(`[document.querySelector('.nav-btn.active')?.dataset.tab, Recherche.query, Boolean(document.getElementById('rs-zone'))]`);
  ok('commande_chercher', recherche[0] === 'recherche' && recherche[1] === 'essai-recherche', recherche);
  ok('remplacer_dans_la_serie_present', recherche[2] === true);
  commande('nouvel-episode'); await attendre(2000);
  const modale = await js(`document.querySelector('.modal-title')?.textContent || ''`);
  ok('commande_nouvel_episode', /Nouvel épisode/.test(modale), modale);
  await js(`typeof modal !== 'undefined' && modal.close && modal.close()`);
  commande('concentration'); await attendre(800);
  ok('commande_concentration_hors_brouillon', /brouillon/i.test(await js(`[...document.querySelectorAll('.toast')].map(t => t.textContent).join(' ')`)));
  const accels = [];
  (function parcourir(items) { for (const i of items) { if (i.accelerator) accels.push(i.accelerator); if (i.submenu) parcourir(i.submenu.items); } })(Menu.getApplicationMenu().items);
  ok('raccourcis', ['CmdOrCtrl+1', 'CmdOrCtrl+9', 'CmdOrCtrl+F', 'CmdOrCtrl+N', 'CmdOrCtrl+O', 'CmdOrCtrl+Shift+F', 'CmdOrCtrl+Shift+E', 'CmdOrCtrl+,'].every(a => accels.includes(a)), accels);

  // PDF : un document préparé par la page (feuille de service, script…), puis la page elle-même
  const pdfDoc = path.join(dossier, 'document.pdf');
  const pdfPage = path.join(dossier, 'page.pdf');
  process.env.APP_PDF = pdfDoc;
  await js(`(() => { const f = window.open('', '_blank'); f.document.write('<!doctype html><html><head><title>Essai PDF</title><script>window.onload = () => print()<\/script></head><body><h1>Feuille de service</h1><p>Jour 1</p></body></html>'); f.document.close(); f.print(); return 1; })()`);
  await attendre(4000);
  const tete = f => { try { return fs.readFileSync(f).subarray(0, 5).toString(); } catch { return ''; } };
  ok('pdf_document', tete(pdfDoc) === '%PDF-', tete(pdfDoc));
  process.env.APP_PDF = pdfPage;
  await js(`window.print()`);
  await attendre(4000);
  ok('pdf_page', tete(pdfPage) === '%PDF-' && fs.statSync(pdfPage).size > 2000, tete(pdfPage));
  delete process.env.APP_PDF;

  // Un projet partagé : exporté, puis rouvert par fichier (double-clic, menu) et glissé sur la fenêtre
  const fichier = path.join(dossier, 'Projet partagé.continuite');
  const exp = await server.request('/api/index.php?path=projets/exporter&slug=&portee=tout', { timeout: 120000 });
  fs.writeFileSync(fichier, exp.body);
  await js(`Portable.recu = null`);
  await ouvrirFichierProjet(fichier);
  await attendre(3000);
  const recu = await js(`[document.querySelector('.nav-btn.active')?.dataset.tab, Portable.recu && Portable.recu.nom, Boolean(Portable.recu && Portable.recu.jeton)]`);
  ok('ouvrir_par_fichier', recu[0] === 'settings' && recu[2] === true, recu);
  await js(`Portable.recu = null; document.querySelector('[data-tab="episodes"]').click()`);
  await attendre(1500);
  const glisse = await js(`(async () => {
    const r = await fetch(API_BASE + 'projets/exporter&slug=' + encodeURIComponent(PROJET) + '&portee=bible');
    const dt = new DataTransfer();
    dt.items.add(new File([await r.blob()], 'Glissé.continuite'));
    document.querySelector('main, body').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    for (let i = 0; i < 100 && !(Portable.recu && Portable.recu.jeton); i++) await new Promise(x => setTimeout(x, 100));
    return [document.querySelector('.nav-btn.active')?.dataset.tab, Boolean(Portable.recu && Portable.recu.jeton)];
  })()`);
  ok('glisser_deposer', glisse[0] === 'settings' && glisse[1] === true, glisse);

  // La sauvegarde automatique, réglée depuis Config
  const dossierSauvegarde = path.join(dossier, 'sauvegardes');
  fs.mkdirSync(dossierSauvegarde, { recursive: true });
  process.env.APP_DOSSIER_SAUVEGARDE = dossierSauvegarde;
  await js(`Bureau._rendreCarte('choisir')`);
  await js(`Bureau._rendreCarte('regler', { frequence: 'fermeture', garder: 3 })`);
  await js(`Bureau._rendreCarte('maintenant')`);
  await attendre(1500);
  const carte = await js(`document.getElementById('bureau-panel')?.textContent || ''`);
  const copies = fs.readdirSync(dossierSauvegarde, { recursive: true }).filter(f => String(f).endsWith('.continuite'));
  ok('sauvegarde_depuis_config', copies.length > 0 && /Dernière sauvegarde/.test(carte) && reglagesSauvegarde().frequence === 'fermeture', { copies: copies.length, carte: carte.slice(0, 200) });
  delete process.env.APP_DOSSIER_SAUVEGARDE;

  // Clic droit : sur un mot mal écrit, puis dans un champ, puis sur du texte sélectionné
  const construire = Menu.buildFromTemplate;
  const menus = [];
  Menu.buildFromTemplate = modele => { menus.push(modele.map(i => i.label || i.role || i.type)); return { popup: () => {} }; };
  try {
    wc.emit('context-menu', {}, { misspelledWord: 'bonjoure', dictionarySuggestions: ['bonjour'], isEditable: true, selectionText: '', editFlags: { canCut: true, canCopy: true, canPaste: true, canUndo: true, canRedo: false } });
    wc.emit('context-menu', {}, { misspelledWord: '', dictionarySuggestions: [], isEditable: true, selectionText: '', editFlags: { canPaste: true } });
    wc.emit('context-menu', {}, { misspelledWord: '', dictionarySuggestions: [], isEditable: false, selectionText: 'Paul', editFlags: {} });
  } finally {
    Menu.buildFromTemplate = construire;
  }
  ok('clic_droit_orthographe', menus[0] && menus[0][0] === 'bonjour' && menus[0].some(l => /Ajouter « bonjoure »/.test(l)) && menus[0].includes('Coller'), menus[0]);
  ok('clic_droit_champ', menus[1] && ['Couper', 'Copier', 'Coller', 'Tout sélectionner'].every(x => menus[1].includes(x)), menus[1]);
  ok('clic_droit_selection', menus[2] && menus[2].includes('Copier') && menus[2].some(l => /Chercher « Paul »/.test(l)), menus[2]);
  r.correcteur = { langues: wc.session.getSpellCheckerLanguages(), actif: wc.session.isSpellCheckerEnabled() };
  return r;
}

// Palette, À revoir, thème du système, deux fenêtres, envoi à un lecteur, restauration, fusion, verrou
async function essaiNouveautes(dossier) {
  const attendre = ms => new Promise(r => setTimeout(r, ms));
  const js = (code, w = win) => Promise.race([w.webContents.executeJavaScript(code).catch(e => 'exception : ' + e.message), attendre(20000).then(() => 'délai dépassé')]);
  const r = {};
  const ok = (cle, vrai, detail) => { r[cle] = vrai ? 'ok' : `KO ${detail === undefined ? '' : JSON.stringify(detail).slice(0, 400)}`; };
  await js(`typeof modal !== 'undefined' && modal.close && modal.close(); Portable.recu = null; 1`);
  // Un projet vide (utilisateur neuf) reçoit deux épisodes avec script, pour que chaque fonction ait de quoi travailler
  r.preparation = await js(`(async () => {
    const eps = await api.get('episodes');
    if (eps.some(e => e.has_texte)) return 'déjà';
    const s = await api.post('saisons', { numero: 1, nom: 'Saison 1' });
    for (const n of [1, 2]) {
      const e = await api.post('episodes', { saison_id: Number(s.id), numero_episode: n, titre: 'Essai ' + n });
      const fd = new FormData(); fd.append('episode_id', e.id); fd.append('texte', 'INT. CUISINE — JOUR\\n\\nPAUL\\nBonjour.\\n\\nMARIE\\nSalut.\\n');
      await api.upload(fd);
    }
    window.DataStore?.invalidateForMutation('upload');
    return 'créés';
  })().catch(e => 'échec : ' + e.message)`);

  // Les noms de la série dans le dictionnaire du correcteur
  const dico = await js(`(async () => {
    const p = await api.post('personnages', { prenom: 'Zéphyrine', nom: 'Quarteau-Vlinsky' });
    window.DataStore?.invalidateForMutation('personnages');
    const n = await Bureau._envoyerDictionnaire(true);
    await api.delete('personnages/' + p.id).catch(() => {});
    window.DataStore?.invalidateForMutation('personnages');
    return n;
  })().catch(e => 'échec : ' + e.message)`);
  const motsDico = await win.webContents.session.listWordsInSpellCheckerDictionary().catch(() => []);
  ok('dictionnaire', motsDico.includes('Zéphyrine') && motsDico.includes('Quarteau-Vlinsky'), { dico, trouves: motsDico.filter(m => /Zéphyrine|Quarteau/.test(m)) });
  for (const m of ['Zéphyrine', 'Quarteau-Vlinsky']) win.webContents.session.removeWordFromSpellCheckerDictionary(m);

  // Un fichier Montage déposé sur la fiche d'un épisode : le texte arrive dans la zone, à relire avant de l'analyser
  const exempleMontage = path.join(__dirname, 'essais', 'exemple.montage');
  if (fs.existsSync(exempleMontage)) {
    const b64 = fs.readFileSync(exempleMontage).toString('base64');
    const dep = await js(`(async () => {
      const eps = await api.get('episodes'); const e = eps[0];
      await ouvrirOnglet('episodes'); await Episodes.openDetail(e.id);
      for (let i = 0; i < 40 && !document.getElementById('texte-direct-' + e.id); i++) await new Promise(x => setTimeout(x, 100));
      const octets = Uint8Array.from(atob('${b64}'), c => c.charCodeAt(0));
      await Episodes._deposer(new File([octets], 'Saison 1 episode 1.montage'), e.id);
      const v = document.getElementById('texte-direct-' + e.id)?.value || '';
      for (let i = 0; i < 30 && !document.getElementById('roles-' + e.id)?.textContent.includes('ALICE'); i++) await new Promise(x => setTimeout(x, 100));
      const roles = document.getElementById('roles-' + e.id)?.textContent || '';
      modal.close();
      return [v.includes('INT. ATELIER'), v.includes('(à voix basse)'), v.length, roles.includes('ALICE') && roles.includes('Bricoleuse')];
    })().catch(e => 'échec : ' + e.message)`);
    ok('montage_fiche_episode', Array.isArray(dep) && dep[0] && dep[1], dep);
    ok('montage_roles_proposes', Array.isArray(dep) && dep[3] === true, dep);
  }

  // Le dossier surveillé : au choix, seuls les épisodes vides sont remplis ; un fichier modifié ensuite est repris
  const dossierSurv = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'continuite-surv-'));
  try {
    const passe = Date.now() / 1000 - 120;
    const poser = (nom, texte, age) => { const f = path.join(dossierSurv, nom); fs.writeFileSync(f, texte); fs.utimesSync(f, passe + age, passe + age); };
    poser('S1E01.fountain', 'INT. GARE — JOUR\n\nPAUL\nVersion écrite ailleurs.\n', 0);
    poser('S7E03 Le retour.fountain', 'INT. PORT — NUIT\n\nMARIE\nUn épisode tout neuf.\n', 0);
    process.env.APP_DOSSIER_SURVEILLE = dossierSurv;
    const avant = await js(`(async () => (await api.get('episodes/' + (await api.get('episodes')).find(e => e.saison_numero == 1 && e.numero_episode == 1).id)).texte_episode)()`);
    const choix = await js(`(async () => { await ouvrirOnglet('settings'); await new Promise(x => setTimeout(x, 800)); await Bureau._surveiller('choisir'); return Bureau.surveille; })()`);
    const apres1 = await js(`(async () => { DataStore.invalidateForMutation('upload'); const eps = await api.get('episodes'); const e1 = eps.find(e => e.saison_numero == 1 && e.numero_episode == 1); const e7 = eps.find(e => e.saison_numero == 7 && e.numero_episode == 3);
      return [(await api.get('episodes/' + e1.id)).texte_episode, e7 ? e7.titre : null, e1.id]; })()`);
    ok('surveillance_premier_passage', choix && choix.dossier === dossierSurv && apres1[0] === avant && apres1[1] === 'Le retour', { choix, apres1: [String(apres1[0]).slice(0, 40), apres1[1]] });
    poser('S1E01.fountain', 'INT. GARE — JOUR\n\nPAUL\nVersion réécrite dans un autre logiciel.\n', 60);
    const repris = await js(`(async () => { await Bureau._surveiller('maintenant'); const e = await api.get('episodes/${apres1[2]}'); const v = await api.get('ecriture_versions&episode=${apres1[2]}');
      return [e.texte_episode.includes('autre logiciel'), v.some(x => /S1E01\.fountain/.test(x.motif)), (Bureau.surveille.journal || []).map(j => j.statut)]; })()`);
    ok('surveillance_reprise', repris[0] === true && repris[1] === true && repris[2][0] === 'remplace', repris);
    await js(`Bureau._surveiller('retirer').then(() => Bureau.surveille.dossier === null)`);
  } finally {
    delete process.env.APP_DOSSIER_SURVEILLE;
    fs.rmSync(dossierSurv, { recursive: true, force: true });
  }

  // La palette : ouvrir, filtrer, lancer
  commande('palette'); await attendre(1500);
  const pal = await js(`(async () => {
    const champ = document.getElementById('pa-q'); if (!champ) return ['fermée'];
    champ.value = 'analyse rythme'; champ.dispatchEvent(new Event('input'));
    const premier = Palette.filtres[0] && Palette.filtres[0].label;
    champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    for (let i = 0; i < 60 && Analyse.vue !== 'rythme'; i++) await new Promise(x => setTimeout(x, 100));
    return [premier, document.querySelector('.nav-btn.active')?.dataset.tab, Analyse.vue, Boolean(document.getElementById('pa-fond'))];
  })()`);
  ok('palette', pal[0] === 'Analyse → Rythme' && pal[1] === 'analyse' && pal[2] === 'rythme' && pal[3] === false, pal);
  const nbPalette = await js(`(async () => { await Palette.ouvrir(); for (let i = 0; i < 50 && !Palette.elements.length; i++) await new Promise(x => setTimeout(x, 100)); const n = { tout: Palette.elements.length, episodes: Palette.elements.filter(e => e.groupe === 'Épisode').length }; Palette.fermer(); return n; })()`);
  ok('palette_contenu', nbPalette.tout > 30 && nbPalette.episodes > 0, nbPalette);

  // À revoir : un commentaire laissé dans un brouillon apparaît dans la liste de la série, « Fait » le retire
  const revoir = await js(`(async () => {
    const eps = await api.get('episodes'); const e = eps.find(x => x.has_texte) || eps[0];
    await api.put('analyse_notes', { cle: 'brouillon:' + e.id, valeur: 'INT. CUISINE — JOUR\\n\\nPAUL\\nUne ligne à revoir.' });
    await api.put('analyse_notes', { cle: 'commentaires:' + e.id, valeur: JSON.stringify([{ a: 'Une ligne à revoir.', n: 3, t: 'Trop long, à couper' }]) });
    await ouvrirOnglet('ecriture'); await Ecriture.init();
    Ecriture.portee = 'serie'; Ecriture.vue = 'arevoir'; Ecriture.rendre();
    await new Promise(x => setTimeout(x, 500));
    const avant = document.querySelector('.ec-revoir')?.textContent || '';
    const bouton = [...document.querySelectorAll('.ec-revoir .ec-lien')].find(b => b.textContent === 'Fait');
    bouton && bouton.click();
    await new Promise(x => setTimeout(x, 800));
    return [avant.includes('Trop long, à couper') && avant.includes('ligne 4'), Ecriture.notes['commentaires:' + e.id] === undefined, e.id];
  })()`);
  ok('a_revoir', revoir[0] === true && revoir[1] === true, revoir);
  const idEpisode = revoir[2];

  // Le thème du système
  const theme = await js(`(() => { Interface.setTheme('systeme'); const t = [Interface.config.suivreSysteme, Interface.config.theme, matchMedia('(prefers-color-scheme: light)').matches ? 'clair' : 'sombre', document.documentElement.dataset.theme]; Interface.setTheme('sombre'); return t; })()`);
  ok('theme_systeme', theme[0] === true && theme[1] === theme[2] && theme[3] === theme[2], theme);

  // Deux fenêtres : la seconde s'ouvre sur le brouillon ; ce qui y est écrit se retrouve dans la première
  await js(`(async () => { await ouvrirOnglet('ecriture'); Ecriture.ouvrirBrouillon(${idEpisode}); return 1; })()`);
  await attendre(1500);
  const seconde = nouvelleFenetre({ episode: idEpisode });
  await attendre(6000);
  const vueSeconde = seconde ? await js(`[Ecriture.epId, Ecriture.vue, Boolean(document.getElementById('ec-brouillon'))]`, seconde) : null;
  ok('seconde_fenetre', fenetres.size === 2 && vueSeconde && vueSeconde[0] === idEpisode && vueSeconde[1] === 'brouillon' && vueSeconde[2], { fenetres: fenetres.size, vueSeconde });
  if (seconde) {
    await js(`(async () => { const c = document.getElementById('ec-brouillon'); c.value = 'INT. SALON — NUIT\\n\\nMARIE\\nÉcrit dans la seconde fenêtre.'; Ecriture.ecrire(c.value); await Ecriture.viderNotes(); return 1; })()`, seconde);
    const synchro = await js(`(async () => { await Bureau._resynchroniser(); return document.getElementById('ec-brouillon')?.value || ''; })()`);
    ok('synchro_entre_fenetres', String(synchro).includes('seconde fenêtre'), synchro);
    seconde.destroy();
    await attendre(300);
  }

  // Envoyer à un lecteur : un seul PDF des scripts choisis, et l'envoi noté
  const pdfLecteur = path.join(dossier, 'lecteur.pdf');
  process.env.APP_PDF = pdfLecteur;
  const envoi = await js(`(async () => {
    const l = await api.post('lecteurs', { nom: 'Lecteur d\\'essai' });
    await ouvrirOnglet('lecteurs'); await Lecteurs.init?.(); await Lecteurs.select?.(Number(l.id));
    for (let i = 0; i < 50 && !(Lecteurs.detail && Lecteurs.detail.id == l.id); i++) await new Promise(x => setTimeout(x, 100));
    const ids = Lecteurs.episodes.slice(0, 2).map(e => Number(e.id));
    ids.forEach(id => Lecteurs.envoiChoisis.add(id));
    await Lecteurs.envoyer();
    await new Promise(x => setTimeout(x, 3000));
    const detail = await api.get('lecteurs/' + l.id);
    return [ids.length, (detail.episodes || []).length, Boolean(document.querySelector('.le-envoi'))];
  })()`);
  await attendre(1500);
  const tete = f => { try { return fs.readFileSync(f).subarray(0, 5).toString(); } catch { return ''; } };
  ok('envoi_lecteur', tete(pdfLecteur) === '%PDF-' && envoi[2] === true && envoi[1] >= 1, { envoi, pdf: tete(pdfLecteur) });
  // La version de lecture : un seul fichier HTML, téléchargé (en essai, enregistré dans le dossier de l'essai)
  const telecharges = [];
  const surTelechargement = (_e, item) => { const f = path.join(dossier, item.getFilename()); item.setSavePath(f); telecharges.push(f); };
  win.webContents.session.on('will-download', surTelechargement);
  await js(`(async () => { Lecteurs.envoiChoisis = new Set(Lecteurs.episodes.slice(0, 2).map(e => Number(e.id))); await Lecteurs.envoyer('lecture'); return 1; })()`);
  await attendre(2500);
  win.webContents.session.removeListener('will-download', surTelechargement);
  const lecture = telecharges[0] && fs.existsSync(telecharges[0]) ? fs.readFileSync(telecharges[0], 'utf8') : '';
  ok('version_lecture', /\.html$/.test(telecharges[0] || '') && lecture.includes('name="viewport"') && lecture.includes('Sommaire') && (lecture.match(/<section id="ep-/g) || []).length === 2 && !/<script/i.test(lecture),
    { fichier: telecharges[0] && path.basename(telecharges[0]), taille: lecture.length });

  // L'accueil du projet (« Reprendre ») : fils ouverts, commentaires à revoir, sauvegarde, dernier envoi aux lecteurs
  const accueil = await js(`(async () => {
    await ouvrirOnglet('ecriture'); await Ecriture.init(); Ecriture.portee = 'serie'; Ecriture.vue = 'reprendre'; Ecriture._accueil = null; Ecriture.rendre();
    for (let i = 0; i < 50 && !document.querySelector('[aria-label="Le projet en un coup d\\'œil"]'); i++) await new Promise(x => setTimeout(x, 100));
    return document.querySelector('[aria-label="Le projet en un coup d\\'œil"]')?.innerText || '';
  })()`);
  ok('accueil_projet', /Fils ouverts/.test(accueil) && /Commentaires à revoir/.test(accueil) && /Dernière sauvegarde/.test(accueil) && /Dernier envoi aux lecteurs/.test(accueil) && !/aucun/.test(accueil), accueil);

  // Feuille de style, éditeur, courbe d'écriture, dossier entier, raccourcis, réglages dans un fichier
  const style = await js(`(async () => {
    Ecriture.portee = 'serie'; Ecriture.vue = 'style'; Ecriture.rendre();
    for (let i = 0; i < 50 && !document.querySelector('#ec-style .an-carte'); i++) await new Promise(x => setTimeout(x, 100));
    return document.getElementById('ec-style')?.innerText || '';
  })()`);
  ok('feuille_style', /Typographie/i.test(style) && /Graphies/i.test(style) && /Vérifier/i.test(style), String(style).slice(0, 200));
  const editeur = await js(`(async () => {
    Interface.setAccessibilite('edTaille', 19); Interface.setAccessibilite('edPolice', 'Georgia');
    const eps = await api.get('episodes'); await Ecriture.ouvrirBrouillon(eps[0].id);
    for (let i = 0; i < 50 && !document.getElementById('ec-brouillon'); i++) await new Promise(x => setTimeout(x, 100));
    const ta = document.getElementById('ec-brouillon'), pre = document.getElementById('ec-miroir');
    const r = [getComputedStyle(ta).fontSize, getComputedStyle(pre).fontSize, getComputedStyle(ta).fontFamily.includes('Georgia')];
    Interface.setAccessibilite('edTaille', 13); Interface.setAccessibilite('edPolice', '');
    return r;
  })()`);
  ok('editeur_reglable', editeur[0] === '19px' && editeur[1] === '19px' && editeur[2] === true, editeur);
  const courbe = await js(`(async () => {
    const j = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    Ecriture.notes.seances = JSON.stringify({ [j(1)]: 300, [j(20)]: 500, [j(70)]: 800 });
    Ecriture.portee = 'serie'; Ecriture.vue = 'objectifs'; Ecriture.rendre();
    for (let i = 0; i < 30 && !document.querySelector('#ec-objectifs .ec-mois'); i++) await new Promise(x => setTimeout(x, 100));
    return document.getElementById('ec-objectifs')?.innerText || '';
  })()`);
  ok('courbe_ecriture', /par semaine, sur six mois/i.test(courbe) && /Par mois/i.test(courbe), String(courbe).slice(0, 200));
  const dossierSerie = await js(`(async () => {
    const f = (chemin, age) => { const x = new File(['INT. A — JOUR'], chemin.split('/').pop(), { lastModified: Date.now() - age }); Object.defineProperty(x, 'webkitRelativePath', { value: chemin }); return x; };
    await Projets.choisirDossier([f('Serie/Saison 2/Episode 3.fdx', 1000), f('Serie/Saison 2/Episode 3 old.fdx', 0), f('Serie/S1E02.fountain', 5000), f('Serie/S1E02 v2.fountain', 10), f('Serie/.cache/S1E09.txt', 0), f('Serie/notes.png', 0)]);
    return Projets.fichiers.map(x => x.saison + ':' + x.numero + ' ' + x.fichier.name);
  })().catch(e => 'échec : ' + e.message)`);
  ok('import_dossier', Array.isArray(dossierSerie) && dossierSerie.join('|') === '1:2 S1E02 v2.fountain|2:3 Episode 3.fdx', dossierSerie);
  const r1 = await js(`window.bureau.raccourcis('regler', { id: 'palette', touches: 'CmdOrCtrl+Shift+P' })`);
  const r2 = await js(`window.bureau.raccourcis('regler', { id: 'recherche', touches: 'CmdOrCtrl+Shift+P' })`);
  const itemPalette = Menu.getApplicationMenu()?.items.flatMap(m => m.submenu ? m.submenu.items : []).find(x => /palette/.test(x.label));
  ok('raccourcis', !r1.error && /Déjà pris/.test(r2.error || '') && itemPalette && itemPalette.accelerator === 'CmdOrCtrl+Shift+P', { r2, acc: itemPalette && itemPalette.accelerator });
  await js(`window.bureau.raccourcis('defaut', { id: '' })`);
  const telech2 = [];
  const surT2 = (_e, item) => { const f = path.join(dossier, item.getFilename()); item.setSavePath(f); telech2.push(f); };
  win.webContents.session.on('will-download', surT2);
  await js(`Bureau.exporterReglages().then(() => 1)`);
  await attendre(1500);
  win.webContents.session.removeListener('will-download', surT2);
  let reglages = null;
  try { reglages = JSON.parse(fs.readFileSync(telech2[0], 'utf8')); } catch { /* absent */ }
  ok('reglages_fichier', reglages && reglages.format === 'continuite-reglages' && typeof reglages.notes.interface === 'string' && !JSON.stringify(reglages).includes('texte_episode'), reglages && Object.keys(reglages.notes));
  // Révisions en couleur dans le brouillon ; l'envoi à un lecteur en a déjà figé une
  const revs = await js(`(async () => {
    const eps = await api.get('episodes'); const e = eps.find(x => x.has_texte) || eps[0];
    await Ecriture.ouvrirBrouillon(e.id);
    for (let i = 0; i < 50 && !document.getElementById('ec-brouillon'); i++) await new Promise(x => setTimeout(x, 100));
    const champ = document.getElementById('ec-brouillon');
    const avant = Ecriture._revisionsEp(e.id).length;
    const r1 = await Ecriture.figerRevisionEpisode(e.id, champ.value, 'essai');
    champ.value = champ.value + '\\n\\nINT. GRENIER — NUIT\\n\\nPAUL\\nUne scène ajoutée.\\n';
    Ecriture._majScenes();
    const changee = document.querySelectorAll('#ec-scenes .ec-rev.nouvelle').length;
    const ligne = document.querySelector('.ec-rev-ligne')?.textContent || '';
    return [avant, r1.revs.length, changee, /changée/.test(ligne)];
  })().catch(e => 'échec : ' + e.message)`);
  ok('revisions_couleur', Array.isArray(revs) && revs[2] === 1 && revs[3] === true && revs[1] >= 1, revs);
  const parcours = await js(`(async () => {
    if (!(await api.get('personnages')).length) await api.post('personnages', { prenom: 'Paul' });
    window.DataStore?.invalidateForMutation('personnages');
    await ouvrirOnglet('personnages'); await Personnages.init(); Personnages.choisirVue('parcours');
    for (let i = 0; i < 60 && !document.querySelector('#parcours-corps section'); i++) await new Promise(x => setTimeout(x, 100));
    return document.getElementById('parcours-vue')?.innerText || '';
  })()`);
  ok('parcours_personnage', /Épisode par épisode/i.test(parcours) && /Première fois/i.test(parcours), String(parcours).slice(0, 200));
  const ensemble = await js(`(async () => {
    await ouvrirOnglet('lecteurs'); await Lecteurs.basculerEnsemble(true);
    const t = document.querySelector('.lecteurs-ensemble')?.innerText || '';
    await Lecteurs.basculerEnsemble(false);
    return t;
  })()`);
  ok('lecteurs_ensemble', /Qui a lu quoi/i.test(ensemble) && /À relancer/i.test(ensemble) && /Lecteur d'essai/i.test(ensemble), String(ensemble).slice(0, 200));
  const ecoute = await js(`(async () => {
    const eps = await api.get('episodes'); await ouvrirOnglet('ecriture'); await Ecriture.ouvrirBrouillon((eps.find(x => x.has_texte) || eps[0]).id);
    for (let i = 0; i < 50 && !document.getElementById('ec-brouillon'); i++) await new Promise(x => setTimeout(x, 100));
    const champ = document.getElementById('ec-brouillon'); champ.setSelectionRange(0, 0);
    Ecriture.ecouter();
    await new Promise(x => setTimeout(x, 1200));
    const r = [Lecture.lignes.length, Lecture.lignes.some(l => l.qui), document.querySelector('.ec-ecouter-btn')?.textContent];
    if (Lecture.enCours) Ecriture.ecouter();
    return r;
  })().catch(e => 'échec : ' + e.message)`);
  ok('ecouter_brouillon', Array.isArray(ecoute) && ecoute[0] > 0 && ecoute[1] === true, ecoute);
  const aide = await js(`(async () => {
    await ouvrirOnglet('ecriture'); Ecriture.portee = 'serie'; Ecriture.vue = 'style'; Ecriture.rendre();
    await Aide.ouvrir();
    for (let i = 0; i < 30 && !document.querySelector('.aide-texte'); i++) await new Promise(x => setTimeout(x, 100));
    const t = [document.querySelector('.aide-entete')?.innerText || '', Boolean(document.querySelector('.aide-ici')), document.querySelector('.aide-texte')?.innerText.length || 0];
    modal.close();
    return t;
  })().catch(e => 'échec : ' + e.message)`);
  ok('aide_integree', Array.isArray(aide) && /Feuille de style/.test(aide[0]) && aide[1] === true && aide[2] > 200, aide);

  // Les outils pour se relire autrement
  const aveugle = await js(`(async () => {
    const eps = await api.get('episodes'); const e = eps.find(x => x.has_texte) || eps[0];
    let t = 'INT. SALLE — JOUR\\n\\n';
    for (let n = 0; n < 12; n++) t += 'PAUL\\nUne réplique assez longue pour jouer au jeu, numéro ' + n + '.\\n\\nMARIE\\nEt moi je réponds par une autre réplique bien longue, ' + n + '.\\n\\n';
    t += 'Il pose une MALLETTE sur la table.\\n';
    const fd = new FormData(); fd.append('episode_id', e.id); fd.append('texte', t); await api.upload(fd);
    window.DataStore?.invalidateForMutation('upload');
    await ouvrirOnglet('personnages'); await Personnages.init(); Personnages.choisirVue('aveugle');
    for (let i = 0; i < 50 && !document.querySelector('.aveugle'); i++) await new Promise(x => setTimeout(x, 100));
    const premiere = document.querySelector('.aveugle-replique')?.textContent || '';
    const n = Aveugle.d.questions.length;
    for (let k = 0; k < n; k++) Aveugle.repondre(Aveugle.d.personnages[0].id);
    return [premiere.length > 20, Aveugle.d.personnages.length, /sur/i.test(document.getElementById('aveugle-vue')?.innerText || '')];
  })().catch(e => 'échec : ' + e.message)`);
  ok('qui_parle', Array.isArray(aveugle) && aveugle[0] === true && aveugle[1] >= 2 && aveugle[2] === true, aveugle);
  const annee = await js(`(async () => {
    await ouvrirOnglet('ecriture'); Ecriture.portee = 'serie'; Ecriture.vue = 'annee'; Ecriture.rendre();
    for (let i = 0; i < 50 && !document.querySelector('.annee'); i++) await new Promise(x => setTimeout(x, 100));
    return document.querySelector('.annee')?.innerText || '';
  })()`);
  ok('ton_annee', /Ton année/i.test(annee) && /versions gardées/i.test(annee), String(annee).slice(0, 160));
  const objets = await js(`(async () => {
    Ecriture._objets = null; Ecriture.vue = 'memoire'; Ecriture.memFiltre = 'objets'; Ecriture.rendre();
    for (let i = 0; i < 60 && !document.querySelector('#ec-objets .an-titre'); i++) await new Promise(x => setTimeout(x, 100));
    return document.getElementById('ec-objets')?.innerText || '';
  })()`);
  ok('objets_oublies', /jamais revenus/i.test(objets) && /mallette/i.test(objets), String(objets).slice(0, 160));
  const film = await js(`(async () => {
    const eps = await api.get('episodes'); const e = eps.find(x => x.has_texte) || eps[0];
    await api.post('ecriture_versions', { episode_id: e.id, texte: 'INT. A — JOUR\\n\\nPAUL\\nUn.\\n', motif: 'essai 1' });
    await api.post('ecriture_versions', { episode_id: e.id, texte: 'INT. A — JOUR\\n\\nPAUL\\nDeux.\\n\\nINT. B — NUIT\\n\\nMARIE\\nTrois.\\n', motif: 'essai 2' });
    Ecriture.epId = e.id; Ecriture.portee = 'episode'; Ecriture.vue = 'versions'; Ecriture.rendre();
    for (let i = 0; i < 50 && !document.querySelector('.ver-barre'); i++) await new Promise(x => setTimeout(x, 100));
    await Versions.film();
    Versions.aller(Versions.images.findIndex(x => /essai 2/.test(x.titre)));
    const r = [Versions.images.length, document.querySelectorAll('.film-scenes li.nouvelle').length, document.querySelectorAll('.film-scenes li.changee').length];
    Versions.quitterFilm();
    return r;
  })().catch(e => 'échec : ' + e.message)`);
  ok('film_ecriture', Array.isArray(film) && film[0] >= 3 && film[1] === 1 && film[2] === 1, film);
  const outils = await js(`(async () => {
    const eps = await api.get('episodes'); await Ecriture.ouvrirBrouillon((eps.find(x => x.has_texte) || eps[0]).id);
    for (let i = 0; i < 50 && !document.getElementById('ec-brouillon'); i++) await new Promise(x => setTimeout(x, 100));
    const champ = document.getElementById('ec-brouillon');
    champ.value = 'INT. SALLE — JOUR\\n\\nPAUL\\nTu viens ?\\n\\nMARIE\\nNon, vraiment pas, je reste ici ce soir.\\n';
    await Ecriture.note('contraintes:' + Ecriture.epId, JSON.stringify([{ type: 'questions', valeur: 'Paul' }, { type: 'sansMot', valeur: 'vraiment' }, { type: 'maxRepliques', valeur: '5' }]));
    Ecriture._majContraintes();
    const ct = [...document.querySelectorAll('#ec-contraintes li')].map(li => li.classList.contains('ec-orange') ? 'non' : 'oui');
    await Ecriture.note('contraintes:' + Ecriture.epId, '');
    Prompteur.depuisTexte(champ.value, 'Essai');
    const pr = [Boolean(document.getElementById('prompteur')), document.querySelectorAll('.prompteur-texte p').length];
    Prompteur.action('lire'); await new Promise(x => setTimeout(x, 400)); Prompteur.fermer();
    Ecriture.basculerFocus(); Ambiance.jouer('pluie'); const son = [Ambiance.noeuds.length > 0, document.getElementById('ec-ambiance')?.textContent];
    Ecriture.basculerFocus(); const coupe = Ambiance.noeuds.length === 0;
    return [ct.join(','), pr, son, coupe, Boolean(document.getElementById('prompteur'))];
  })().catch(e => 'échec : ' + e.message)`);
  ok('contraintes_prompteur_ambiance', Array.isArray(outils) && outils[0] === 'oui,non,oui' && outils[1][0] === true && outils[1][1] >= 3 && outils[2][0] === true && outils[3] === true && outils[4] === false, outils);
  const reseau = await js(`(async () => {
    Ecriture.portee = 'episode'; Ecriture.vue = 'lecture'; Ecriture.rendre();
    for (let i = 0; i < 50 && !(Lecture.lignes && Lecture.lignes.length); i++) await new Promise(x => setTimeout(x, 100));
    await Lecture.partager();
    return Lecture.reseau;
  })().catch(e => 'échec : ' + e.message)`);
  let pageReseau = 0;
  if (reseau && reseau.actif) {
    const port = lectureReseau.serveur.address().port;
    pageReseau = await new Promise(resolve => http.get({ host: '127.0.0.1', port, path: `/t/${lectureReseau.jeton}/etat` }, res => { let c = ''; res.on('data', x => { c += x; }); res.on('end', () => { try { resolve(JSON.parse(c).lignes.length); } catch { resolve(-1); } }); }).on('error', () => resolve(-2)));
  }
  await js(`Lecture.arreterPartage().then(() => 1)`);
  ok('lecture_reseau', reseau && reseau.actif === true && pageReseau > 0 && !lectureReseau.actif(), { urls: reseau && reseau.urls && reseau.urls.length, pageReseau });

  // Les outils des autres genres : roman, scénario, BD, théâtre
  const genres = await js(`(async () => {
    await ouvrirOnglet('ecriture'); Ecriture.portee = 'serie';
    // Les cinq sens ne sont proposés qu'à un roman : on monte la vue à la main dans ce projet de série
    const boite = document.createElement('div'); boite.innerHTML = Ecriture.vueSens(); document.body.appendChild(boite);
    await Ecriture._chargerSens();
    const sens = document.getElementById('ec-sens')?.innerText || '';
    boite.remove();
    Ecriture.vue = 'lisibilite'; Ecriture.rendre();
    for (let i = 0; i < 60 && !document.querySelector('#ec-lisibilite .an-carte'); i++) await new Promise(x => setTimeout(x, 100));
    const lis = document.getElementById('ec-lisibilite')?.innerText || '';
    const planche = (cases, mots) => ({ e: { sa: 1, n: 1, id: 1 }, cases: Array.from({ length: cases }, () => ({})), mots });
    const bd = Ecriture._tempsLecture([planche(6, 120), planche(6, 110), planche(8, 600), planche(2, 0)]);
    const sc = (n, presents, tirade, sorties = []) => ({ n, presents, parle: {}, tirade, sorties, mots: 400, mots_did: 40 });
    const th = Genres._fatigue([{ n: 1, scenes: [sc(1, ['ROSE', 'PAUL'], { PAUL: 300 }), sc(2, ['ROSE'], { ROSE: 20 }), sc(3, ['ROSE'], {}), sc(4, ['ROSE', 'PAUL'], {})] }], ['ROSE', 'PAUL']);
    return [/cinq sens/i.test(sens), /tics/i.test(sens), /pavés/i.test(lis), /Temps de lecture/.test(bd) && /Lentes/.test(bd), /fatigue/i.test(th) && /300 mots/.test(th) && /4 scène/.test(th)];
  })().catch(e => 'échec : ' + e.message)`);
  ok('outils_genres', Array.isArray(genres) && genres.every(Boolean), genres);
  const genres2 = await js(`(async () => {
    const monter = async (html, charger, id) => { const b = document.createElement('div'); b.innerHTML = html; document.body.appendChild(b); await charger(); const t = document.getElementById(id)?.innerText || ''; b.remove(); return t; };
    const portraits = await monter(Ecriture.vuePortraits(), () => Ecriture._chargerPortraits(), 'ec-portraits');
    const conduite = await monter(Ecriture.vueConduite(), () => Ecriture._chargerConduite(), 'ec-conduite');
    Ecriture.portee = 'serie'; Ecriture.vue = 'accroches'; Ecriture.rendre();
    for (let i = 0; i < 60 && !document.querySelector('#ec-accroches .an-carte'); i++) await new Promise(x => setTimeout(x, 100));
    const ouvertures = document.getElementById('ec-accroches')?.innerText || '';
    const debut = Ecriture._htmlDebut({ pages: 40, premiere_replique: 6, scenes: 3, action: 80, principaux: [{ nom: 'Paul', page: 7, repliques: 30 }] });
    const sons = Ecriture._bruitages([{ e: { sa: 1, n: 1, id: 1 }, cases: [{ bulles: [['SFX', 'BAM !', 1, 'son'], ['SFX', 'BAM!', 1, 'son'], ['SFX', 'Bam', 1, 'son'], ['SFX', 'BAM', 1, 'son'], ['PAUL', 'Aïe', 1, 'bulle']] }] }]);
    Ecriture.notes['pub-marque'] = 'Bulle';
    const marque = Genres._marque({ plans: [{ debut: 0, duree: 5, image: 'Une plage', sons: [] }, { debut: 5, duree: 10, image: 'La bouteille Bulle', sons: [['vo', 'VO', 'Bulle, la soif']] }] }, {});
    Genres.donnees = { jeu: { chapitres: [{ n: 1, lieux: [{ nom: 'Le port', description: 'Un port calme', objets: ['corde'], dialogue: [{ qui: 'MARIN', texte: 'Bonjour à toi', type: 'dit' }, { qui: 'JOUEUR', texte: 'Salut', type: 'choix' }] }] }] } };
    const traduire = Genres._aTraduire();
    return [/contradiction|description/i.test(portraits), /Conduite/i.test(conduite), /ouverture/i.test(ouvertures), /page 7/.test(debut) && /Première réplique/.test(debut), /BAM/.test(sons) && /4 fois/.test(sons), /Première apparition à <strong>5 s/.test(marque), /Mots à traduire/.test(traduire) && /MARIN 3/.test(traduire)];
  })().catch(e => 'échec : ' + e.message)`);
  ok('outils_genres_2', Array.isArray(genres2) && genres2.every(Boolean), genres2);
  const rangement = await js(`(async () => {
    await ouvrirOnglet('ecriture'); Ecriture.portee = 'serie'; Ecriture.vue = 'reprendre'; Ecriture.rendre();
    await new Promise(x => setTimeout(x, 300));
    const familles = [...document.querySelectorAll('#ec-vues .ec-famille')].map(f => f.getAttribute('aria-label') + ':' + f.querySelectorAll('button').length);
    const boutons = document.querySelectorAll('#ec-vues button').length;
    const visibles = Interface.vuesEcritureVisibles('serie').length;
    await ouvrirOnglet('personnages'); await Personnages.init();
    const p = Personnages.tous[0];
    const c = document.createElement('canvas'); c.width = 600; c.height = 400; c.getContext('2d').fillRect(0, 0, 600, 400);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    await Personnages.choisirPhoto(p.id, new File([blob], 'photo.png', { type: 'image/png' }));
    const photo = [Boolean(document.querySelector('#modal-content .perso-photo')), (Personnages.photos[p.id] || '').length < 40000];
    await Personnages.retirerPhoto(p.id); modal.close();
    const boite = document.createElement('div'); boite.innerHTML = '<section id="ec-tension"></section>'; document.body.appendChild(boite);
    await Ecriture._chargerTension(); const tension = /La tension/i.test(document.getElementById('ec-tension')?.innerText || ''); boite.remove();
    await Projets._rafraichir?.().catch(() => {});
    Projets.liste = Projets.liste || await api.get('projets');
    Projets._decoupe = { slug: 'x', d: { chapitres: [{ code: 'C1', mots: 1000, fin: 'Et alors ?' }, { code: 'C2', mots: 1000, fin: 'Fin.' }, { code: 'C3', mots: 1000, fin: 'Qui était là ?' }, { code: 'C4', mots: 1000, fin: 'Fin.' }] } };
    await Projets.decouper('x', 2);
    const decoupe = [document.querySelectorAll('.decoupe-liste li').length, /C1 → C2/.test(document.querySelector('.decoupe-liste')?.innerText || '')];
    modal.close();
    return [familles, boutons === visibles, photo, tension, decoupe];
  })().catch(e => 'échec : ' + e.message)`);
  ok('rangement_et_ajouts', Array.isArray(rangement) && rangement[0].length >= 3 && rangement[1] === true && rangement[2][0] && rangement[2][1] && rangement[3] === true && rangement[4][0] === 2 && rangement[4][1], rangement);
  // Chutier, sprint, PDF à annoter, dossier de présentation
  const pdfAnnoter = path.join(dossier, 'annoter.pdf');
  const pdfDossier = path.join(dossier, 'dossier.pdf');
  process.env.APP_PDF = pdfAnnoter;
  const docs = await js(`(async () => {
    const eps = await api.get('episodes'); const e = eps.find(x => x.has_texte);
    await api.post('ecriture_versions', { episode_id: e.id, texte: 'INT. GRENIER OUBLIÉ — NUIT\\n\\nPAUL\\nUne scène qui ne sert plus à rien dans cet épisode.\\n', motif: 'chute' });
    await ouvrirOnglet('ecriture'); Ecriture.epId = e.id; Ecriture.portee = 'episode'; Ecriture.vue = 'versions'; Ecriture.rendre();
    for (let i = 0; i < 50 && !document.querySelector('.ver-barre'); i++) await new Promise(x => setTimeout(x, 100));
    await Versions.chutier();
    const chute = [...document.querySelectorAll('.chute summary')].some(x => /GRENIER OUBLIÉ/.test(x.textContent));
    Versions.chute = null;
    await Ecriture.ouvrirBrouillon(e.id); for (let i = 0; i < 50 && !document.getElementById('ec-brouillon'); i++) await new Promise(x => setTimeout(x, 100));
    Ecriture.basculerFocus(); Sprint.basculer(); await new Promise(x => setTimeout(x, 1200));
    const encours = document.getElementById('ec-sprint')?.textContent || '';
    Sprint.debut -= 5 * 60000; document.getElementById('ec-brouillon').value += ' un deux trois quatre';
    Sprint.terminer(true); Ecriture.basculerFocus();
    await new Promise(x => setTimeout(x, 400));
    const sprints = JSON.parse(Ecriture.notes.sprints || '[]');
    Ecriture.portee = 'serie'; Ecriture.vue = 'export'; Ecriture.rendre();
    for (let i = 0; i < 60 && !document.querySelector('#ec-export .an-carte'); i++) await new Promise(x => setTimeout(x, 100));
    await Export.pdfAnnoter();
    return [chute, /⏱ \\d+:\\d\\d/.test(encours), sprints.length >= 1 && sprints[sprints.length - 1].mots >= 4];
  })().catch(e => 'échec : ' + e.message)`);
  await attendre(3500);
  process.env.APP_PDF = pdfDossier;
  await js(`(async () => { Export.dossier(); document.getElementById('pres-accroche').value = 'Une idée en une phrase.'; await Export.imprimerDossier(); return 1; })()`);
  await attendre(3500);
  delete process.env.APP_PDF;
  const tetePdf = f => { try { return fs.readFileSync(f).subarray(0, 5).toString(); } catch { return ''; } };
  ok('chutier_sprint_documents', Array.isArray(docs) && docs.every(Boolean) && tetePdf(pdfAnnoter) === '%PDF-' && tetePdf(pdfDossier) === '%PDF-', { docs, annoter: tetePdf(pdfAnnoter), dossier: tetePdf(pdfDossier) });
  // La palette trouve les fonctions ; la démonstration se crée ; registres et PDF d'un rôle
  const pdfRole = path.join(dossier, 'role.pdf');
  process.env.APP_PDF = pdfRole;
  const derniers = await js(`(async () => {
    await Palette.ouvrir(); for (let i = 0; i < 50 && !Palette.elements.length; i++) await new Promise(x => setTimeout(x, 100));
    const champ = document.getElementById('pa-q');
    const cherche = q => { champ.value = q; Palette.filtrer(q); return Palette.filtres[0]?.label || ''; };
    const trouve = [cherche('chutier'), cherche('anachronisme'), cherche('pomodoro'), cherche('tutoiement')];
    Palette.fermer();
    const demo = await DEMO.creer();
    const epsDemo = await fetch('api/index.php?projet=' + encodeURIComponent(demo.slug) + '&path=episodes').then(r => r.json());
    const chuteDemo = await fetch('api/index.php?projet=' + encodeURIComponent(demo.slug) + '&path=chutier').then(r => r.json());
    // La carte des registres, montée à part (l'onglet Analyse peut n'avoir aucun épisode coché à ce moment de l'essai)
    const boiteReg = document.createElement('div'); boiteReg.innerHTML = '<section id="an-registres"></section>'; document.body.appendChild(boiteReg);
    Analyse._registres = null; await Analyse._chargerRegistres();
    const registres = /Registres/i.test(document.getElementById('an-registres')?.textContent || '');
    boiteReg.remove();
    await ouvrirOnglet('ecriture'); Ecriture.portee = 'serie'; Ecriture.vue = 'export'; Ecriture.rendre();
    for (let i = 0; i < 60 && !document.getElementById('exp-role'); i++) await new Promise(x => setTimeout(x, 100));
    await Export.pdfRole(document.getElementById('exp-role')?.value || 'PAUL');
    return [trouve, epsDemo.length === 3 && epsDemo.every(e => e.has_texte), (chuteDemo.scenes || []).length >= 1, registres];
  })().catch(e => 'échec : ' + e.message)`);
  await attendre(3500);
  delete process.env.APP_PDF;
  ok('palette_demo_registres_role', Array.isArray(derniers) && /Chutier/.test(derniers[0][0]) && /Anachronismes/.test(derniers[0][1]) && /Sprint/.test(derniers[0][2]) && /Registres/.test(derniers[0][3]) && derniers[1] && derniers[2] && derniers[3] === true && tetePdf(pdfRole) === '%PDF-', { derniers, pdf: tetePdf(pdfRole) });

  delete process.env.APP_PDF;

  // Restaurer : la liste des sauvegardes, puis une sauvegarde rouverte dans l'aperçu d'import ; la fusion la compare
  process.env.APP_DOSSIER_SAUVEGARDE = path.join(dossier, 'sauvegardes');
  const resto = await js(`(async () => {
    const l = await window.bureau.sauvegarde('liste');
    if (!l.liste.length) return ['vide'];
    Portable.recu = null;
    await window.bureau.sauvegarde('ouvrir', { fichier: l.liste[0].fichier });
    for (let i = 0; i < 80 && !(Portable.recu && Portable.recu.jeton); i++) await new Promise(x => setTimeout(x, 100));
    Portable.choisirMode('fusionner');
    for (let i = 0; i < 80 && (!Portable.comparaison || Portable.comparaison === 'chargement'); i++) await new Promise(x => setTimeout(x, 100));
    return [l.liste.length, Boolean(Portable.recu && Portable.recu.jeton), Array.isArray(Portable.comparaison && Portable.comparaison.episodes), Boolean(document.querySelector('#portable-panel .fu-table, #portable-panel .an-note'))];
  })()`);
  ok('restaurer_et_comparer', resto[0] > 0 && resto[1] === true && resto[2] === true && resto[3] === true, resto);

  // Sauvegardes chiffrées : on chiffre, on sauvegarde, la copie chiffrée se rouvre (mot de passe du trousseau), on arrête
  process.env.APP_MDP_ESSAI = 'un mot de passe pour les essais';
  const chiffre = await js(`(async () => {
    const r = await window.bureau.sauvegarde('chiffrer');
    await window.bureau.sauvegarde('maintenant');
    const l = await window.bureau.sauvegarde('liste');
    const c = l.liste.find(x => x.chiffre);
    if (!c) return [r.chiffre, false];
    Portable.recu = null;
    await window.bureau.sauvegarde('ouvrir', { fichier: c.fichier });
    for (let i = 0; i < 80 && !(Portable.recu && Portable.recu.jeton); i++) await new Promise(x => setTimeout(x, 100));
    const rouvert = Boolean(Portable.recu && Portable.recu.jeton);
    const fin = await window.bureau.sauvegarde('dechiffrer');
    return [r.chiffre, true, rouvert, fin.chiffre];
  })().catch(e => 'échec : ' + e.message)`);
  delete process.env.APP_MDP_ESSAI;
  ok('sauvegarde_chiffree', Array.isArray(chiffre) && chiffre[0] === true && chiffre[1] === true && chiffre[2] === true && chiffre[3] === false, chiffre);
  await js(`Portable.annuler(); 1`);
  delete process.env.APP_DOSSIER_SAUVEGARDE;

  // Le verrou : mot de passe, verrouillage, mauvais puis bon mot de passe, puis retrait
  const defini = await js(`window.bureau.verrou('changer', { nouveau: 'essai-mdp' })`);
  ok('verrou_defini', defini && defini.actif === true, defini);
  await verrouiller();
  await attendre(800);
  const surVerrou = String(win.webContents.getURL()).endsWith('/verrou.html');
  const ipcBloque = await js(`window.bureau.sauvegarde('liste').then(x => x === null ? 'refusé' : 'accepté')`);
  const faux = await js(`window.bureau.deverrouiller('pas-le-bon')`);
  // Plusieurs mauvais mots de passe : il faut attendre avant de réessayer
  let frein = null;
  for (let i = 0; i < 4; i++) frein = await js(`window.bureau.deverrouiller('toujours-pas')`);
  const pendantAttente = await js(`window.bureau.deverrouiller('essai-mdp')`);
  await attendre((frein && frein.attente) || 0);
  // Le bon mot de passe recharge la page de l'app : la réponse n'arrive pas à l'écran du verrou, qui disparaît
  await js(`window.bureau.deverrouiller('essai-mdp'); 'envoyé'`);
  await attendre(4000);
  const rouvert = String(win.webContents.getURL()).startsWith(server.origin);
  ok('verrou', surVerrou && ipcBloque === 'refusé' && faux && faux.ok === false && frein && frein.attente > 0 && pendantAttente && pendantAttente.ok === false && rouvert,
    { surVerrou, ipcBloque, faux, frein, pendantAttente, rouvert });
  for (let i = 0; i < 5; i++) await js(`window.bureau.verrou('etat')`);
  const retire = await js(`window.bureau.verrou('changer', { ancien: 'essai-mdp', retirer: true })`);
  ok('verrou_retire', retire && retire.actif === false, retire);

  // Les captures des écrans récents, pour les regarder (APP_CAPTURES=1)
  if (process.env.APP_CAPTURES) {
    await attendre(1500);
    const cap = async (nom, code) => {
      await js(code);
      await attendre(1800);
      const image = await Promise.race([win.webContents.capturePage().catch(() => null), attendre(5000).then(() => null)]);
      if (image) fs.writeFileSync(path.join(dossier, `n-${nom}.png`), image.toPNG());
    };
    await cap('style', `(async () => { await ouvrirOnglet('ecriture'); Ecriture.portee = 'serie'; Ecriture.vue = 'style'; Ecriture.rendre(); await new Promise(x => setTimeout(x, 800)); FeuilleStyle.style.typo.apostrophe = true; await FeuilleStyle._enregistrer(); await FeuilleStyle.verifier(); return 1; })()`);
    await cap('objectifs', `(async () => { const j = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }; const s = {}; for (let i = 0; i < 160; i += 2) s[j(i)] = 200 + (i * 37) % 900; Ecriture.notes.seances = JSON.stringify(s); Ecriture.vue = 'objectifs'; Ecriture.rendre(); return 1; })()`);
    await cap('brouillon', `(async () => { const eps = await api.get('episodes'); await Ecriture.ouvrirBrouillon((eps.find(x => x.has_texte) || eps[0]).id); return 1; })()`);
    await cap('parcours', `(async () => { await ouvrirOnglet('personnages'); await Personnages.init(); Personnages.choisirVue('parcours'); return 1; })()`);
    await cap('lecteurs', `(async () => { await ouvrirOnglet('lecteurs'); await Lecteurs.basculerEnsemble(true); return 1; })()`);
    await cap('reglages', `(async () => { await Lecteurs.basculerEnsemble(false); await ouvrirOnglet('settings'); await new Promise(x => setTimeout(x, 1000)); Bureau._raccourcisOuvert = true; await Bureau._rendreCarte(); document.getElementById('bureau-panel')?.scrollIntoView(); return 1; })()`);
    await cap('editeur', `(async () => { document.getElementById('accessibilite-panel')?.scrollIntoView({ block: 'end' }); return 1; })()`);
    await cap('aide', `(async () => { await ouvrirOnglet('ecriture'); Ecriture.portee = 'serie'; Ecriture.vue = 'style'; Ecriture.rendre(); await Aide.ouvrir(); return 1; })()`);
    await cap('projets', `(async () => { modal.close(); await ouvrirOnglet('settings'); document.querySelector('.projets-formulaire')?.scrollIntoView(); return 1; })()`);
  }
  return r;
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


// ─── PDF : une page de l'app (ou un document préparé par elle) enregistré directement en PDF ───

async function enregistrerPdf(contents, nom) {
  const defaut = path.join(app.getPath('documents'), `${String(nom || APP_NAME).replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 100) || APP_NAME}.pdf`);
  const parent = BrowserWindow.fromWebContents(contents) || win;
  if (ESSAI && !process.env.APP_PDF) return { ok: false, annule: true };
  const { canceled, filePath } = ESSAI
    ? { canceled: false, filePath: process.env.APP_PDF }
    : await dialog.showSaveDialog(parent, { title: 'Enregistrer en PDF', defaultPath: defaut, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (canceled || !filePath) return { ok: false, annule: true };
  const donnees = await contents.printToPDF({ printBackground: true, preferCSSPageSize: true });
  fs.writeFileSync(filePath, donnees);
  if (!ESSAI) shell.openPath(filePath);
  return { ok: true, chemin: filePath, octets: donnees.length };
}

function pdfDeLaPage(fenetre) {
  if (!fenetre || fenetre.isDestroyed()) return null;
  return enregistrerPdf(fenetre.webContents, fenetre.webContents.getTitle() || APP_NAME).catch(e => dialog.showErrorBox(APP_NAME, `PDF impossible : ${e.message}`));
}

// La page prépare un document (feuille de service, script, storyboard) : il est mis en page sans JavaScript, puis enregistré
ipcMain.handle('bureau:pdf', async (event, html, nom) => {
  if (!server || !estFenetreApp(event.sender)) return { ok: false };
  if (html === null || html === undefined) return enregistrerPdf(event.sender, nom);
  const doc = String(html).slice(0, 50 * 1024 * 1024).replace(/<script[\s\S]*?<\/script>/gi, '');
  const avecBase = /<head[^>]*>/i.test(doc) ? doc.replace(/<head[^>]*>/i, m => `${m}<base href="${server.origin}/">`) : `<base href="${server.origin}/">${doc}`;
  const cache = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
  try {
    await cache.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(avecBase));
    return await enregistrerPdf(cache.webContents, nom);
  } finally {
    cache.destroy();
  }
});

// ─── Ouvrir un projet partagé : double-clic sur un fichier .continuite, glisser sur l'icône, ou menu Fichier ───

const EXTENSIONS_PROJET = ['.continuite', '.lemenu'];
let fichiersEnAttente = [];
let pageChargee = false;

function estFichierProjet(chemin) {
  return typeof chemin === 'string' && EXTENSIONS_PROJET.includes(path.extname(chemin).toLowerCase()) && fs.existsSync(chemin);
}

async function choisirFichierProjet() {
  if (ESSAI) return;
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Ouvrir un projet partagé', properties: ['openFile'],
    filters: [{ name: `Projet ${APP_NAME}`, extensions: ['continuite', 'lemenu'] }],
  });
  if (!canceled && filePaths[0]) ouvrirFichierProjet(filePaths[0]);
}

// Le fichier est envoyé au serveur depuis le disque (jamais tout en mémoire) ; la page affiche ensuite l'aperçu d'import
function envoyerAuServeur(chemin) {
  return new Promise((resolve, reject) => {
    const taille = fs.statSync(chemin).size;
    const req = http.request({ host: '127.0.0.1', port: server.port, method: 'POST', path: '/api/index.php?path=projets/apercu_import', agent: false,
      headers: { [SECRET_HEADER]: server.secret, 'content-type': 'application/octet-stream', 'content-length': taille } }, res => {
      let corps = '';
      res.setEncoding('utf8');
      res.on('data', c => { corps += c; });
      res.on('end', () => { try { resolve(JSON.parse(corps)); } catch { reject(new Error(`réponse ${res.statusCode} illisible`)); } });
    });
    req.on('error', reject);
    fs.createReadStream(chemin).on('error', reject).pipe(req);
  });
}

async function ouvrirFichierProjet(chemin) {
  if (!estFichierProjet(chemin)) return;
  if (!server || !pageChargee || verrouille) { fichiersEnAttente.push(chemin); return; }
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  let temporaire = null;
  const nomFichier = path.basename(chemin);
  try {
    // Une sauvegarde chiffrée : le mot de passe enregistré d'abord, sinon on le demande (trois essais)
    if (sauvegarde.estChiffre(chemin)) {
      temporaire = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'continuite-'));
      const clair = path.join(temporaire, 'projet.continuite');
      let ouvert = false;
      const essayer = async mdp => { try { await sauvegarde.dechiffrerFichier(chemin, clair, mdp); return true; } catch { return false; } };
      const connu = motDePasseSauvegarde();
      if (connu) ouvert = await essayer(connu);
      for (let i = 0; i < 3 && !ouvert; i++) {
        const mdp = ESSAI ? process.env.APP_MDP_ESSAI || null : await demanderMotDePasse(win, i ? 'Mot de passe incorrect. Réessaie :' : `« ${path.basename(chemin)} » est chiffré. Son mot de passe :`);
        if (mdp === null) return;
        ouvert = await essayer(mdp);
        if (ESSAI) break;
      }
      if (!ouvert) { dialog.showErrorBox(APP_NAME, 'Mot de passe incorrect : la sauvegarde reste fermée.'); return; }
      chemin = clair;
    }
    const apercu = await envoyerAuServeur(chemin);
    commande('fichier-projet', { ...apercu, fichier: nomFichier });
  } catch (e) {
    dialog.showErrorBox(APP_NAME, `Ce fichier n'a pas pu être ouvert : ${e.message}`);
  } finally {
    if (temporaire) fs.rmSync(temporaire, { recursive: true, force: true });
  }
}

function fichiersDansArguments(argv) {
  return (argv || []).slice(1).filter(estFichierProjet);
}

// macOS : un double-clic arrive par open-file, parfois avant que l'app soit prête
app.on('open-file', (event, chemin) => {
  event.preventDefault();
  ouvrirFichierProjet(chemin);
});

// ─── Mises à jour : une question à GitHub au plus une fois par jour, rien d'installé sans l'accord de l'utilisateur ───

const systemeMaj = () => ({ platform: process.platform, arch: app.runningUnderARM64Translation ? 'arm64' : process.arch, format: majs.currentFormat() });
const prefsMaj = () => majs.cleanPrefs(lireConfig(chemins().configFile).updates);
function enregistrerPrefsMaj(p) {
  const f = chemins().configFile;
  ecrireConfig(f, { ...lireConfig(f), updates: majs.cleanPrefs(p) });
}
function reglerMaj(changement) {
  enregistrerPrefsMaj({ ...prefsMaj(), ...changement });
  menu();
}
let majEnCours = false;

async function verifierMaj(demandee) {
  // Pendant un essai automatique : ni réseau, ni fenêtre de dialogue
  if (majEnCours || ESSAI || verrouille) return;
  majEnCours = true;
  try {
    const r = await majs.check({ current: app.getVersion(), prefs: prefsMaj(), force: demandee, sys: systemeMaj() });
    enregistrerPrefsMaj(r.prefs);
    const info = r.info;
    if (!info.ok) { if (demandee) dialog.showMessageBox(win, { type: 'info', message: 'Mises à jour', detail: info.error }); return; }
    if (!info.newer) { if (demandee) dialog.showMessageBox(win, { type: 'info', message: `Tu as la dernière version (${info.current}).` }); return; }
    if (!demandee && !majs.shouldNotify(info, r.prefs)) return;
    const notes = String(info.notes || '').replace(/\r/g, '').trim().slice(0, 700);
    const { response } = await dialog.showMessageBox(win, {
      type: 'info', buttons: ['Télécharger', 'Plus tard', 'Ignorer cette version'], defaultId: 0, cancelId: 1,
      message: `${APP_NAME} ${info.latest} est disponible`,
      detail: `Tu as la version ${info.current}.${notes ? `\n\n${notes}` : ''}\n\nL'installateur sera téléchargé dans « Téléchargements » et vérifié avant d'être ouvert. Tes projets ne sont pas touchés.`,
    });
    if (response === 1) { reglerMaj({ laterUntil: Date.now() + majs.DAY }); return; }
    if (response === 2) { reglerMaj({ skip: info.latest }); return; }
    if (!info.asset) { shell.openExternal(info.page); return; }
    win.setProgressBar(0.01);
    const res = await majs.download({ release: prefsMaj().release, sys: systemeMaj(), dir: app.getPath('downloads'),
      onProgress: (recu, total) => { if (win && total) win.setProgressBar(Math.min(1, recu / total)); } });
    win.setProgressBar(-1);
    if (!res.ok) { dialog.showErrorBox(APP_NAME, res.error); return; }
    const fin = await dialog.showMessageBox(win, {
      type: 'info', buttons: ['Ouvrir l\'installateur', 'Plus tard'], defaultId: 0, cancelId: 1,
      message: 'Mise à jour téléchargée et vérifiée',
      detail: `${res.name} est dans « Téléchargements ». Quitte ${APP_NAME}, puis installe la nouvelle version : tes projets restent où ils sont.`,
    });
    if (fin.response === 0) shell.openPath(res.file);
    else shell.showItemInFolder(res.file);
  } catch (e) {
    if (demandee) dialog.showErrorBox(APP_NAME, `Mise à jour impossible : ${e.message}`);
  } finally {
    majEnCours = false;
    if (win && !win.isDestroyed()) win.setProgressBar(-1);
  }
}

// ─── Sauvegarde automatique ───

const reglagesSauvegarde = () => sauvegarde.nettoyerReglages(lireConfig(chemins().configFile).sauvegarde);
// Le mot de passe des sauvegardes chiffrées : rangé par le trousseau du système (Keychain, Windows, trousseau Linux),
// jamais en clair. Pendant les essais automatiques, il ne vit qu'en mémoire.
let mdpEssai = null;
function motDePasseSauvegarde() {
  if (ESSAI) return mdpEssai;
  const brut = lireConfig(chemins().configFile).sauvegardeMdp;
  if (typeof brut !== 'string' || !brut || !safeStorage.isEncryptionAvailable()) return null;
  try { return safeStorage.decryptString(Buffer.from(brut, 'base64')); } catch { return null; }
}
function enregistrerMotDePasseSauvegarde(mdp) {
  const f = chemins().configFile;
  if (ESSAI) { mdpEssai = mdp; return true; }
  if (mdp === null) { const c = lireConfig(f); delete c.sauvegardeMdp; ecrireConfig(f, c); return true; }
  if (!safeStorage.isEncryptionAvailable()) return false;
  ecrireConfig(f, { ...lireConfig(f), sauvegardeMdp: safeStorage.encryptString(mdp).toString('base64') });
  return true;
}
function enregistrerSauvegarde(r) {
  const f = chemins().configFile;
  ecrireConfig(f, { ...lireConfig(f), sauvegarde: sauvegarde.nettoyerReglages(r) });
}
let sauvegardeEnCours = null;

function lancerSauvegarde(origine) {
  if (sauvegardeEnCours) return sauvegardeEnCours;
  const r = reglagesSauvegarde();
  if (!server) return Promise.resolve(null);
  if (!r.dossier) {
    if (origine === 'menu') commande('onglet', 'settings');
    return Promise.resolve(null);
  }
  if (win && !win.isDestroyed()) win.setProgressBar(2);
  sauvegardeEnCours = sauvegarde.sauvegarder(server, r, new Date(), r.chiffre ? motDePasseSauvegarde() : null).then(bilan => {
    enregistrerSauvegarde({ ...reglagesSauvegarde(), derniere: bilan.date, resultat: bilan });
    commande('sauvegarde-faite', bilan);
    if (!bilan.ok && origine !== 'fermeture' && !ESSAI) dialog.showMessageBox(win, { type: 'warning', message: 'Sauvegarde incomplète', detail: bilan.erreurs.join('\n') });
    return bilan;
  }).catch(e => {
    const bilan = { ok: false, projets: 0, octets: 0, effaces: 0, erreurs: [e.message], date: Date.now() };
    enregistrerSauvegarde({ ...reglagesSauvegarde(), resultat: bilan });
    return bilan;
  }).finally(() => {
    sauvegardeEnCours = null;
    if (win && !win.isDestroyed()) win.setProgressBar(-1);
  });
  return sauvegardeEnCours;
}

ipcMain.handle('bureau:sauvegarde', async (event, action, valeur) => {
  if (!estFenetreApp(event.sender)) return null;
  if (action === 'choisir') {
    const { canceled, filePaths } = ESSAI
      ? { canceled: !process.env.APP_DOSSIER_SAUVEGARDE, filePaths: [process.env.APP_DOSSIER_SAUVEGARDE] }
      : await dialog.showOpenDialog(win, { title: 'Dossier des sauvegardes', properties: ['openDirectory', 'createDirectory'], buttonLabel: 'Choisir ce dossier' });
    if (!canceled && filePaths[0]) enregistrerSauvegarde({ ...reglagesSauvegarde(), dossier: filePaths[0], frequence: reglagesSauvegarde().frequence === 'non' ? 'jour' : reglagesSauvegarde().frequence });
  } else if (action === 'regler' && valeur && typeof valeur === 'object') {
    const r = reglagesSauvegarde();
    if (sauvegarde.FREQUENCES.includes(valeur.frequence)) r.frequence = valeur.frequence;
    if (Number.isFinite(Number(valeur.garder))) r.garder = Number(valeur.garder);
    enregistrerSauvegarde(r);
  } else if (action === 'chiffrer') {
    // Le mot de passe est demandé deux fois dans une fenêtre à part : il ne passe jamais par la page
    const parent = BrowserWindow.fromWebContents(event.sender) || win;
    const a = ESSAI ? process.env.APP_MDP_ESSAI || null : await demanderMotDePasse(parent, 'Mot de passe des sauvegardes (10 caractères au moins). Sans lui, elles ne pourront plus être ouvertes :');
    if (a === null) return { ...reglagesSauvegarde(), annule: true };
    if (a.length < 10) return { ...reglagesSauvegarde(), error: 'Le mot de passe doit faire 10 caractères au moins.' };
    const b = ESSAI ? a : await demanderMotDePasse(parent, 'Le même mot de passe, encore une fois :');
    if (b !== a) return { ...reglagesSauvegarde(), error: 'Les deux mots de passe ne sont pas les mêmes.' };
    if (!enregistrerMotDePasseSauvegarde(a)) return { ...reglagesSauvegarde(), error: 'Le trousseau de ce système n\'est pas disponible : impossible de garder le mot de passe en sûreté.' };
    enregistrerSauvegarde({ ...reglagesSauvegarde(), chiffre: true });
  } else if (action === 'dechiffrer') {
    enregistrerMotDePasseSauvegarde(null);
    enregistrerSauvegarde({ ...reglagesSauvegarde(), chiffre: false });
  } else if (action === 'maintenant') {
    await lancerSauvegarde('page');
  } else if (action === 'liste') {
    return { liste: sauvegarde.lister(reglagesSauvegarde()) };
  } else if (action === 'ouvrir') {
    // Une sauvegarde rouverte passe par l'aperçu d'import : nouveau projet, remplacer, ou comparer et fusionner
    const chemin = sauvegarde.cheminSur(reglagesSauvegarde(), valeur && valeur.fichier);
    if (!chemin) return { error: 'Cette sauvegarde est introuvable.' };
    await ouvrirFichierProjet(chemin);
    return { ok: true };
  } else if (action === 'montrer') {
    const r = reglagesSauvegarde();
    if (r.dossier && !ESSAI) shell.openPath(r.dossier);
  }
  const r = reglagesSauvegarde();
  return { ...r, enCours: Boolean(sauvegardeEnCours) };
});

// Les noms de la série : le correcteur ne les souligne plus. Un mot n'est ajouté qu'une fois par lancement.
const motsAjoutes = new Set();
ipcMain.handle('bureau:dictionnaire', (event, mots) => {
  if (!estFenetreApp(event.sender) || !Array.isArray(mots)) return 0;
  let n = 0;
  for (const brut of mots.slice(0, 5000)) {
    const mot = String(brut).normalize('NFC').trim();
    if (!/^\p{L}[\p{L}'’-]{1,39}$/u.test(mot) || motsAjoutes.has(mot)) continue;
    motsAjoutes.add(mot);
    if (event.sender.session.addWordToSpellCheckerDictionary(mot)) n++;
  }
  return n;
});

// ─── Le dossier surveillé : les scripts écrits ailleurs (Final Draft, Word, Fountain, Montage) reviennent tout seuls ───

const fichierSurveillance = () => path.join(chemins().userData, 'surveillance.json');
let surveillance = null;
const slugValide = projet => typeof projet === 'string' && /^[a-z0-9-]{0,80}$/.test(projet);

async function importerSurveille({ projet, nom, octets, saison, numero, titre, remplacer }) {
  const base = `/api/index.php?${projet ? `projet=${encodeURIComponent(projet)}&` : ''}path=`;
  const poster = async (route, corps) => {
    const r = await server.request(base + route, { method: 'POST', timeout: 180000, headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) });
    let json = {};
    try { json = JSON.parse(r.body.toString() || '{}'); } catch { /* réponse vide */ }
    if (r.status === 404) throw new Error('Ce projet n\'existe plus.');
    if (r.status >= 400 || json.error) throw new Error(json.error || `Erreur ${r.status}`);
    return json;
  };
  let texte;
  if (/\.(txt|fountain|md)$/i.test(nom)) {
    texte = octets.toString('utf8');
    if (texte.includes('�')) texte = octets.toString('latin1');
  } else {
    texte = String((await poster('ecriture_extraire', { nom, donnees: octets.toString('base64') })).texte || '').replace(/^#{1,6}\s+/gm, '');
  }
  if (!texte.trim()) return { statut: 'vide' };
  return poster('ecriture_import', { saison, numero, titre, texte, remplacer, motif: `Avant la reprise de « ${nom.slice(0, 120)} »` });
}

function demarrerSurveillance() {
  let etat = {};
  try { etat = JSON.parse(fs.readFileSync(fichierSurveillance(), 'utf8')); } catch { /* première fois */ }
  surveillance = new Surveillance({
    etat,
    importer: importerSurveille,
    actif: () => Boolean(server) && pageChargee && !verrouille && !quitting,
    enregistrer: e => { try { fs.writeFileSync(fichierSurveillance(), JSON.stringify(e)); } catch { /* rien */ } },
    // Toutes les fenêtres sont prévenues : chacune recharge ce qu'elle montre si c'est son projet
    prevenir: ev => { for (const f of fenetres) if (!f.isDestroyed() && estFenetreApp(f.webContents)) f.webContents.send('bureau:commande', 'surveillance', ev); },
  });
  surveillance.demarrer().catch(() => {});
}

ipcMain.handle('bureau:surveillance', async (event, action, projet) => {
  if (!estFenetreApp(event.sender) || !surveillance || !slugValide(projet)) return null;
  if (action === 'choisir') {
    const { canceled, filePaths } = ESSAI
      ? { canceled: !process.env.APP_DOSSIER_SURVEILLE, filePaths: [process.env.APP_DOSSIER_SURVEILLE] }
      : await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender) || win, { title: 'Dossier des scripts à surveiller', properties: ['openDirectory'], buttonLabel: 'Surveiller ce dossier' });
    if (!canceled && filePaths[0]) await surveillance.choisir(projet, filePaths[0]);
  } else if (action === 'retirer') {
    surveillance.retirer(projet);
  } else if (action === 'maintenant') {
    await surveillance.verifier();
  } else if (action === 'montrer') {
    const d = surveillance.dossier(projet);
    if (d) shell.openPath(d);
  }
  return { dossier: surveillance.dossier(projet), journal: surveillance.journal(projet) };
});

// Les raccourcis : la liste (action, nom, touches actuelles, touches d'origine) ; en changer un refait les menus
ipcMain.handle('bureau:raccourcis', (event, action, valeur) => {
  if (!estFenetreApp(event.sender)) return null;
  const f = chemins().configFile;
  const choisis = { ...raccourcisChoisis() };
  const liste = () => [...RACCOURCIS.map(([id, nom]) => [id, nom]), ...ONGLETS.map(([cle, nom]) => [`onglet-${cle}`, `Onglet ${nom}`])]
    .map(([id, nom]) => ({ id, nom, touches: touche(id, defautDe(id)) || '', defaut: defautDe(id) }));
  if (action === 'regler' && valeur && typeof valeur === 'object') {
    const id = String(valeur.id || '');
    const touches = String(valeur.touches ?? '');
    if (!liste().some(r => r.id === id)) return { error: 'Action inconnue.' };
    if (touches && !TOUCHE_VALIDE.test(touches)) return { error: 'Ce raccourci n\'est pas possible.' };
    const pris = touches && liste().find(r => r.id !== id && r.touches === touches);
    if (pris) return { error: `Déjà pris par « ${pris.nom} ».` };
    choisis[id] = touches;
    ecrireConfig(f, { ...lireConfig(f), raccourcis: choisis });
    menu();
  } else if (action === 'defaut') {
    const id = String(valeur && valeur.id || '');
    if (id) delete choisis[id];
    ecrireConfig(f, { ...lireConfig(f), raccourcis: id ? choisis : {} });
    menu();
  }
  return { liste: liste() };
});

// La lecture à la table en réseau : seulement à la demande, seulement un épisode, en lecture seule
ipcMain.handle('bureau:reseau', async (event, action, valeur) => {
  if (!estFenetreApp(event.sender)) return null;
  try {
    if (action === 'demarrer' && valeur && typeof valeur === 'object') return await lectureReseau.demarrer({ titre: valeur.titre, lignes: valeur.lignes });
    if (action === 'position') { lectureReseau.position(valeur && valeur.i); return null; }
    if (action === 'arreter') await lectureReseau.arreter();
  } catch (e) {
    return { actif: false, error: e.message };
  }
  return lectureReseau.etat();
});

ipcMain.handle('bureau:infos', event => (estFenetreApp(event.sender)
  ? { version: app.getVersion(), plateforme: process.platform, majAuto: prefsMaj().auto }
  : null));
ipcMain.handle('bureau:maj', (event, action, valeur) => {
  if (!estFenetreApp(event.sender)) return null;
  if (action === 'verifier') verifierMaj(true);
  if (action === 'auto') reglerMaj({ auto: valeur === true });
  return { majAuto: prefsMaj().auto };
});

// ─── Verrou : un mot de passe pour ouvrir l'app ───

let verrouille = false;
let echecsVerrou = 0;
let prochainEssai = 0;
let premierChargement = true;
const reglagesVerrou = () => verrou.nettoyer(lireConfig(chemins().configFile).verrou);
function enregistrerVerrou(v) {
  const f = chemins().configFile;
  ecrireConfig(f, { ...lireConfig(f), verrou: verrou.nettoyer(v) });
  menu();
}

async function chargerApp() {
  if (!win || win.isDestroyed()) return;
  await win.loadURL(server.origin + '/');
  pageChargee = true;
  premierChargement = false;
  const enAttente = fichiersEnAttente;
  fichiersEnAttente = [];
  for (const f of enAttente) await ouvrirFichierProjet(f);
}

async function afficherVerrou() {
  verrouille = true;
  pageChargee = false;
  if (win && !win.isDestroyed()) await win.loadFile(path.join(__dirname, 'verrou.html'));
}

async function verrouiller() {
  if (!verrou.actif(reglagesVerrou()) || verrouille || !win) return;
  // Ce qui attendait d'être enregistré part d'abord, dans toutes les fenêtres ; les fenêtres en plus se ferment
  await Promise.all([...fenetres].filter(f => !f.isDestroyed() && estFenetreApp(f.webContents)).map(f =>
    Promise.race([f.webContents.executeJavaScript('typeof Ecriture !== "undefined" && Ecriture.viderNotes ? Ecriture.viderNotes().then(() => 1) : 1').catch(() => 0), new Promise(r => setTimeout(r, 2000))])));
  for (const f of [...fenetres]) if (f !== win && !f.isDestroyed()) f.destroy();
  await afficherVerrou();
}

ipcMain.handle('bureau:deverrouiller', async (event, mdp) => {
  // Seulement depuis l'écran du verrou de la fenêtre principale
  if (!win || event.sender !== win.webContents || !String(event.sender.getURL()).endsWith('/verrou.html') || !verrouille) return { ok: false };
  const maintenant = Date.now();
  if (maintenant < prochainEssai) return { ok: false, attente: prochainEssai - maintenant };
  if (!verrou.verifier(reglagesVerrou(), String(mdp || '').slice(0, 200))) {
    echecsVerrou++;
    const attente = verrou.delai(echecsVerrou);
    prochainEssai = Date.now() + attente;
    return { ok: false, attente };
  }
  echecsVerrou = 0;
  verrouille = false;
  await chargerApp();
  return { ok: true };
});

ipcMain.handle('bureau:verrou', async (event, action, valeur) => {
  if (!estFenetreApp(event.sender)) return null;
  if (action === 'verrouiller') { await verrouiller(); return { ok: true }; }
  if (action === 'changer' && valeur && typeof valeur === 'object') {
    const r = verrou.changer(reglagesVerrou(), {
      ancien: typeof valeur.ancien === 'string' ? valeur.ancien : undefined,
      nouveau: valeur.retirer === true ? null : (typeof valeur.nouveau === 'string' && valeur.nouveau !== '' ? valeur.nouveau : undefined),
      minutes: valeur.minutes, veille: valeur.veille,
    });
    if (r.error) return { error: r.error };
    enregistrerVerrou(r.verrou);
  }
  const v = reglagesVerrou();
  return { actif: verrou.actif(v), minutes: v.minutes, veille: v.veille };
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    for (const f of fichiersDansArguments(argv)) ouvrirFichierProjet(f);
  });
  app.whenReady().then(demarrer);
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    trace('before-quit');
    if (quitting || !server) return;
    event.preventDefault();
    quitting = true;
    surveillance?.arreter();
    lectureReseau.arreter().catch(() => {});
    const arreter = () => arreterEtFermer();
    if (sauvegarde.aFaire(reglagesSauvegarde(), 'fermeture') || sauvegardeEnCours) {
      trace('sauvegarde avant fermeture');
      Promise.race([sauvegardeEnCours || lancerSauvegarde('fermeture'), new Promise(r => setTimeout(r, 120000))]).finally(arreter);
      return;
    }
    arreter();
  });
}

function arreterEtFermer() {
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
}
