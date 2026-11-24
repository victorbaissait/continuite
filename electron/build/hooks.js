'use strict';
/**
 * Étapes ajoutées à la fabrication des installateurs (electron-builder, voir « build » dans package.json).
 *
 *  afterPack : 1) copie le PHP embarqué du bon système dans resources/php ;
 *              2) GARDE-FOU : inspecte l'app fabriquée et ARRÊTE TOUT si elle contient une base de données,
 *                 une sauvegarde, un cache ou un dossier de données. La série ne doit jamais partir dans un logiciel distribué.
 */
const fs = require('node:fs');
const path = require('node:path');
const { phpRuntimeKey } = require('../php-server');

// electron-builder : Arch.x64 = 1, Arch.arm64 = 3 (voir builder-util)
const ARCH_NAMES = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' };

function resourcesDir(context) {
  if (context.electronPlatformName === 'darwin') {
    const app = fs.readdirSync(context.appOutDir).find(n => n.endsWith('.app'));
    return path.join(context.appOutDir, app, 'Contents', 'Resources');
  }
  return path.join(context.appOutDir, 'resources');
}

function copierPhp(context) {
  const arch = ARCH_NAMES[context.arch] || String(context.arch);
  const key = phpRuntimeKey(context.electronPlatformName, arch);
  const from = path.resolve(__dirname, '..', '..', 'vendor', 'php', key);
  if (!fs.existsSync(path.join(from, 'runtime.json'))) {
    throw new Error(`PHP embarqué absent pour ${key} : lance d'abord « node electron/fetch-php.js ${key} »`);
  }
  const to = path.join(resourcesDir(context), 'php');
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true, verbatimSymlinks: true });
  console.log(`  • PHP embarqué : ${key} → resources/php`);
}

// ─── Garde-fou ──────────────────────────────────────────────────────────────
const INTERDIT = /\.(db|db-wal|db-shm|sqlite|sqlite-wal|sqlite-shm|zip|menu)$|(^|[\\/])(projet\.json|analyse-cache\.json|analyse-expressions\.json|ecriture-[a-z]+\.json|secrets-scenes\.json)$/i;
const DOSSIERS_INTERDITS = new Set(['data', 'backups', 'projets', 'corbeille', 'imports', 'uploads', 'storyboard', 'cartes']);

function parcourir(dir, visite) {
  for (const entree of fs.readdirSync(dir, { withFileTypes: true })) {
    const complet = path.join(dir, entree.name);
    visite(complet, entree);
    if (entree.isDirectory() && !entree.isSymbolicLink()) parcourir(complet, visite);
  }
}

function gardeFou(context) {
  const app = path.join(resourcesDir(context), 'php-app');
  const problemes = [];
  parcourir(app, (complet, entree) => {
    if (entree.isDirectory() && DOSSIERS_INTERDITS.has(entree.name)) problemes.push('dossier de données : ' + complet);
    else if (entree.isFile() && INTERDIT.test(entree.name)) problemes.push('fichier de données : ' + complet);
  });
  if (problemes.length) {
    throw new Error('GARDE-FOU : des données de la série se trouvent dans l\'app fabriquée. Rien n\'est produit.\n  ' + problemes.join('\n  '));
  }
  console.log('  • garde-fou : aucune donnée de la série dans l\'app');
}

exports.default = async function afterPack(context) {
  copierPhp(context);
  gardeFou(context);
};
