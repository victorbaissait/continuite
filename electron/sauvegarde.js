'use strict';
/**
 * Sauvegarde automatique : chaque projet exporté en fichier complet (.continuite : textes, réglages, dessins, voix,
 * cartes) dans un dossier choisi par l'utilisateur (iCloud, Dropbox, un disque externe…). Ce fichier se rouvre d'un
 * double-clic. On garde les N dernières copies de chaque projet ; les plus anciennes sont effacées.
 * Aucune dépendance à Electron : se teste seul (electron/test-sauvegarde.js).
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');

const EXTENSION = '.continuite';
const FREQUENCES = ['non', 'fermeture', 'jour'];
const JOUR = 24 * 3600 * 1000;

function nettoyerReglages(r) {
  const o = r && typeof r === 'object' ? r : {};
  return {
    dossier: typeof o.dossier === 'string' ? o.dossier : '',
    frequence: FREQUENCES.includes(o.frequence) ? o.frequence : 'non',
    garder: Math.min(100, Math.max(1, Math.floor(Number(o.garder) || 10))),
    derniere: Number.isFinite(Number(o.derniere)) ? Number(o.derniere) : 0,
    resultat: o.resultat && typeof o.resultat === 'object' ? o.resultat : null,
    chiffre: o.chiffre === true,
  };
}

// ─── Chiffrement : AES-256-GCM, clé tirée du mot de passe par scrypt. Le fichier garde son extension .continuite ;
// il commence par une signature, puis le sel, le vecteur d'initialisation, le contenu chiffré et l'étiquette. ───

const SIGNATURE = Buffer.from('CONTINUITE-CHIFFRE-1\n');
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };

function cle(motDePasse, sel) {
  return crypto.scryptSync(String(motDePasse).normalize('NFC'), sel, 32, SCRYPT);
}

function estChiffre(fichier) {
  try {
    const fd = fs.openSync(fichier, 'r');
    const tete = Buffer.alloc(SIGNATURE.length);
    const lus = fs.readSync(fd, tete, 0, tete.length, 0);
    fs.closeSync(fd);
    return lus === SIGNATURE.length && tete.equals(SIGNATURE);
  } catch { return false; }
}

async function chiffrerFichier(source, destination, motDePasse) {
  const sel = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const chiffreur = crypto.createCipheriv('aes-256-gcm', cle(motDePasse, sel), iv);
  const partiel = destination + '.partiel';
  const sortie = fs.createWriteStream(partiel);
  try {
    sortie.write(Buffer.concat([SIGNATURE, sel, iv]));
    await pipeline(fs.createReadStream(source), chiffreur, sortie, { end: false });
    await new Promise((ok, ko) => sortie.end(chiffreur.getAuthTag(), e => (e ? ko(e) : ok())));
    fs.renameSync(partiel, destination);
  } catch (e) {
    sortie.destroy();
    try { fs.unlinkSync(partiel); } catch { /* rien */ }
    throw e;
  }
}

// Déchiffre dans un fichier temporaire ; un mauvais mot de passe ou un fichier modifié ne laisse rien derrière lui
async function dechiffrerFichier(source, destination, motDePasse) {
  const taille = fs.statSync(source).size;
  const debut = SIGNATURE.length + 16 + 12;
  if (taille < debut + 16 || !estChiffre(source)) throw new Error('Ce fichier n\'est pas une sauvegarde chiffrée.');
  const fd = fs.openSync(source, 'r');
  const tete = Buffer.alloc(debut);
  const etiquette = Buffer.alloc(16);
  fs.readSync(fd, tete, 0, debut, 0);
  fs.readSync(fd, etiquette, 0, 16, taille - 16);
  fs.closeSync(fd);
  const dechiffreur = crypto.createDecipheriv('aes-256-gcm', cle(motDePasse, tete.subarray(SIGNATURE.length, SIGNATURE.length + 16)), tete.subarray(SIGNATURE.length + 16));
  dechiffreur.setAuthTag(etiquette);
  try {
    if (taille - 16 > debut) await pipeline(fs.createReadStream(source, { start: debut, end: taille - 17 }), dechiffreur, fs.createWriteStream(destination));
    else { dechiffreur.final(); fs.writeFileSync(destination, Buffer.alloc(0)); }
  } catch {
    try { fs.unlinkSync(destination); } catch { /* rien */ }
    throw new Error('Mot de passe incorrect, ou fichier abîmé.');
  }
}

// Un nom de fichier sûr sur Mac, Windows et Linux, lisible par un humain
function nomSur(nom) {
  const propre = String(nom || '').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 80);
  return propre || 'Projet';
}

function horodatage(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}h${p(d.getMinutes())}m${p(d.getSeconds())}`;
}

// Télécharge une adresse du serveur PHP de l'app directement dans un fichier (jamais tout en mémoire)
function telecharger(server, chemin, fichier) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: server.port, path: chemin, headers: { 'x-app-secret': server.secret }, agent: false }, res => {
      if (res.statusCode !== 200) {
        let corps = '';
        res.setEncoding('utf8');
        res.on('data', c => { if (corps.length < 500) corps += c; });
        res.on('end', () => {
          let message = `réponse ${res.statusCode}`;
          try { message = JSON.parse(corps).error || message; } catch { /* corps illisible */ }
          reject(new Error(message));
        });
        return;
      }
      const partiel = fichier + '.partiel';
      const sortie = fs.createWriteStream(partiel);
      res.pipe(sortie);
      sortie.on('finish', () => { fs.renameSync(partiel, fichier); resolve(fs.statSync(fichier).size); });
      sortie.on('error', e => { try { fs.unlinkSync(partiel); } catch { /* rien */ } reject(e); });
      res.on('error', e => { try { fs.unlinkSync(partiel); } catch { /* rien */ } reject(e); });
    });
    req.on('error', reject);
  });
}

// Les plus anciennes copies d'un projet partent, au-delà de « garder »
function elaguer(dossierProjet, garder) {
  const copies = fs.readdirSync(dossierProjet)
    .filter(f => f.endsWith(EXTENSION))
    .map(f => ({ f, t: fs.statSync(path.join(dossierProjet, f)).mtimeMs, date: (f.match(/(\d{4}-\d\d-\d\d \d\dh\d\dm\d\d)\.continuite$/) || [])[1] || '' }))
    // L'horodatage du nom d'abord (deux copies de la même seconde ont la même date de fichier), puis la date du fichier
    .sort((a, b) => b.date.localeCompare(a.date) || b.t - a.t);
  for (const c of copies.slice(garder)) { try { fs.unlinkSync(path.join(dossierProjet, c.f)); } catch { /* rien */ } }
  return copies.slice(garder).length;
}

/**
 * Sauvegarde tous les projets dans reglages.dossier.
 * @returns {Promise<{ok: boolean, projets: number, octets: number, effaces: number, erreurs: string[], date: number}>}
 */
async function sauvegarder(server, reglages, maintenant = new Date(), motDePasse = null) {
  const r = nettoyerReglages(reglages);
  if (!r.dossier) return { ok: false, projets: 0, octets: 0, effaces: 0, erreurs: ['Choisis d\'abord un dossier.'], date: maintenant.getTime() };
  if (!fs.existsSync(r.dossier)) return { ok: false, projets: 0, octets: 0, effaces: 0, erreurs: [`Le dossier ${r.dossier} est introuvable (disque débranché ?).`], date: maintenant.getTime() };
  const liste = await server.request('/api/index.php?path=projets', { timeout: 30000 });
  let projets;
  try { projets = JSON.parse(liste.body.toString()); } catch { projets = null; }
  if (!Array.isArray(projets)) return { ok: false, projets: 0, octets: 0, effaces: 0, erreurs: ['La liste des projets est illisible.'], date: maintenant.getTime() };
  const bilan = { ok: true, projets: 0, octets: 0, effaces: 0, erreurs: [], date: maintenant.getTime() };
  const vus = new Set();
  for (const p of projets) {
    if (!p || typeof p.slug !== 'string') continue;
    // Deux projets du même nom gardent chacun leur dossier
    let nom = nomSur(p.nom);
    while (vus.has(nom.toLowerCase())) nom += ' (2)';
    vus.add(nom.toLowerCase());
    const dossierProjet = path.join(r.dossier, nom);
    try {
      fs.mkdirSync(dossierProjet, { recursive: true });
      const fichier = path.join(dossierProjet, `${nom} ${horodatage(maintenant)}${EXTENSION}`);
      const adresse = `/api/index.php?path=projets/exporter&slug=${encodeURIComponent(p.slug)}&portee=tout`;
      if (r.chiffre) {
        if (!motDePasse) throw new Error('le mot de passe des sauvegardes est introuvable : redéfinis-le dans Config → App de bureau.');
        // Le fichier en clair ne passe que par le dossier temporaire de l'ordinateur, jamais par le dossier de sauvegarde
        const clair = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'continuite-')), 'projet.continuite');
        try {
          await telecharger(server, adresse, clair);
          await chiffrerFichier(clair, fichier, motDePasse);
          bilan.octets += fs.statSync(fichier).size;
        } finally {
          fs.rmSync(path.dirname(clair), { recursive: true, force: true });
        }
      } else {
        bilan.octets += await telecharger(server, adresse, fichier);
      }
      bilan.projets++;
      bilan.effaces += elaguer(dossierProjet, r.garder);
    } catch (e) {
      bilan.ok = false;
      bilan.erreurs.push(`${nom} : ${e.message}`);
    }
  }
  return bilan;
}

// Faut-il sauvegarder maintenant ? (au lancement et toutes les heures pour « jour », à la fermeture pour « fermeture »)
function aFaire(reglages, moment, now = Date.now()) {
  const r = nettoyerReglages(reglages);
  if (!r.dossier || r.frequence === 'non') return false;
  if (moment === 'fermeture') return r.frequence === 'fermeture';
  return r.frequence === 'jour' && now - r.derniere >= JOUR;
}

// Les sauvegardes présentes dans le dossier, les plus récentes d'abord (chemins relatifs au dossier)
function lister(reglages, max = 300) {
  const r = nettoyerReglages(reglages);
  if (!r.dossier || !fs.existsSync(r.dossier)) return [];
  const liste = [];
  for (const projet of fs.readdirSync(r.dossier, { withFileTypes: true })) {
    if (!projet.isDirectory()) continue;
    let fichiers = [];
    try { fichiers = fs.readdirSync(path.join(r.dossier, projet.name)); } catch { continue; }
    for (const f of fichiers) {
      if (!f.endsWith(EXTENSION)) continue;
      const st = fs.statSync(path.join(r.dossier, projet.name, f));
      const date = (f.match(/(\d{4}-\d\d-\d\d) (\d\d)h(\d\d)m(\d\d)\.continuite$/) || []);
      liste.push({ projet: projet.name, fichier: `${projet.name}/${f}`, taille: st.size, chiffre: estChiffre(path.join(r.dossier, projet.name, f)),
        date: date[1] ? new Date(`${date[1]}T${date[2]}:${date[3]}:${date[4]}`).getTime() : st.mtimeMs });
    }
  }
  return liste.sort((a, b) => b.date - a.date).slice(0, max);
}

// Un fichier de la liste, et seulement de la liste : un chemin qui sortirait du dossier est refusé
function cheminSur(reglages, relatif) {
  const r = nettoyerReglages(reglages);
  if (!r.dossier || typeof relatif !== 'string' || !relatif.endsWith(EXTENSION)) return null;
  const complet = path.resolve(r.dossier, relatif);
  const racine = path.resolve(r.dossier) + path.sep;
  return complet.startsWith(racine) && fs.existsSync(complet) ? complet : null;
}

module.exports = { lister, cheminSur, EXTENSION, FREQUENCES, nettoyerReglages, nomSur, horodatage, sauvegarder, aFaire, elaguer, estChiffre, chiffrerFichier, dechiffrerFichier };
