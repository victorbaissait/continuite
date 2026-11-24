'use strict';
/**
 * Le dossier surveillé : on écrit dans Final Draft, Word, Fountain ou Montage, l'app reprend le script toute seule.
 * Un fichier « Saison 2 épisode 5 », « S2E05 » ou « 2x05 » va dans cet épisode ; l'ancien texte part dans les Versions.
 * Au choix du dossier, seuls les épisodes encore sans script sont remplis : rien n'est écrasé sans qu'on ait modifié le fichier.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const EXTENSIONS = new Set(['.fountain', '.txt', '.md', '.fdx', '.montage', '.celtx', '.highland', '.fadein', '.docx', '.odt', '.rtf', '.html', '.htm']);
const TAILLE_MAX = 40 * 1024 * 1024;
const FICHIERS_MAX = 3000;
const PROFONDEUR_MAX = 3;
// Un fichier modifié il y a moins de 3 s est peut-être encore en train d'être écrit : on attend le tour suivant
const CALME_MS = 3000;

// Le même découpage que l'import (assets/js/projets.js _lireNomFichier)
function nomVersEpisode(nom) {
  const base = nom.replace(/\.[^.]+$/, '');
  const motifs = [/S(\d{1,2})\s*[-_ ]?\s*[EX]\s*(\d{1,3})/i, /(?<!\d)(\d{1,2})x(\d{1,3})(?!\d)/i, /saison\s*(\d{1,2}).*?[ée]p(?:isode)?\s*(\d{1,3})/i];
  for (const motif of motifs) {
    const m = base.normalize('NFC').match(motif);
    if (m && Number(m[1]) > 0 && Number(m[2]) > 0) {
      return { saison: Number(m[1]), numero: Number(m[2]), titre: base.normalize('NFC').replace(m[0], '').replace(/^[\s_.:-]+|[\s_.:-]+$/g, '').replace(/_/g, ' ').slice(0, 200) };
    }
  }
  return null;
}

// Les fichiers à laisser de côté : cachés, temporaires de Word, anciennes copies
function ignore(nom) {
  return nom.startsWith('.') || nom.startsWith('~$') || /\b(old|ancien(ne)?|copie|copy|backup|sauvegarde)\b|\[old\]/i.test(nom.normalize('NFC'));
}

function scanner(dossier) {
  const fichiers = [];
  const parcourir = (d, profondeur) => {
    let entrees;
    try { entrees = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entrees) {
      if (fichiers.length >= FICHIERS_MAX) return;
      if (e.name.startsWith('.')) continue;
      const chemin = path.join(d, e.name);
      if (e.isDirectory()) { if (profondeur < PROFONDEUR_MAX) parcourir(chemin, profondeur + 1); continue; }
      if (!e.isFile() || !EXTENSIONS.has(path.extname(e.name).toLowerCase()) || ignore(e.name)) continue;
      const ep = nomVersEpisode(e.name);
      if (!ep) continue;
      try {
        const st = fs.statSync(chemin);
        if (st.size > 0 && st.size <= TAILLE_MAX) fichiers.push({ chemin, nom: e.name, taille: st.size, mtime: st.mtimeMs, ...ep });
      } catch { /* fichier disparu entre-temps */ }
    }
  };
  parcourir(dossier, 0);
  return fichiers;
}

// Pour chaque épisode, le fichier modifié le plus récemment
function parEpisode(fichiers) {
  const choix = new Map();
  for (const f of fichiers) {
    const cle = `${f.saison}:${f.numero}`;
    if (!choix.has(cle) || choix.get(cle).mtime < f.mtime) choix.set(cle, f);
  }
  return [...choix.values()];
}

const empreinte = octets => crypto.createHash('sha256').update(octets).digest('hex');

/**
 * Surveille un dossier par projet.
 * importer({ projet, nom, octets, saison, numero, titre, remplacer }) → { statut, id }
 * prevenir(evenement) : un script vient d'être repris (pour les fenêtres)
 * etat : { dossiers: { projet: chemin }, vus: { chemin: { taille, mtime, sha } }, journal: [] } ; enregistrer(etat) le garde
 */
class Surveillance {
  constructor({ importer, prevenir = () => {}, etat = {}, enregistrer = () => {}, actif = () => true, intervalle = 20000 }) {
    this.importer = importer;
    this.prevenir = prevenir;
    this.enregistrer = enregistrer;
    this.actif = actif;
    this.intervalle = intervalle;
    this.etat = { dossiers: {}, vus: {}, journal: [], ...etat };
    this.observateurs = new Map();
    this.minuteur = null;
    this.enCours = null;
    this.relance = null;
  }

  demarrer() {
    for (const projet of Object.keys(this.etat.dossiers)) this._observer(projet);
    clearInterval(this.minuteur);
    this.minuteur = setInterval(() => this.verifier().catch(() => {}), this.intervalle);
    this.minuteur.unref?.();
    return this.verifier();
  }

  arreter() {
    clearInterval(this.minuteur);
    clearTimeout(this.relance);
    for (const o of this.observateurs.values()) o.close();
    this.observateurs.clear();
  }

  _observer(projet) {
    this.observateurs.get(projet)?.close();
    this.observateurs.delete(projet);
    const dossier = this.etat.dossiers[projet];
    if (!dossier) return;
    try {
      const o = fs.watch(dossier, { recursive: true }, () => {
        clearTimeout(this.relance);
        this.relance = setTimeout(() => this.verifier().catch(() => {}), CALME_MS + 500);
      });
      o.on('error', () => {});
      this.observateurs.set(projet, o);
    } catch { /* le passage régulier suffit */ }
  }

  dossier(projet) {
    return this.etat.dossiers[projet] || null;
  }

  journal(projet) {
    return this.etat.journal.filter(j => j.projet === projet).slice(0, 20);
  }

  async choisir(projet, dossier) {
    await this.enCours;
    this.etat.dossiers[projet] = dossier;
    // Les fichiers déjà là : on oublie ce qu'on en savait, pour que le premier passage remplisse les épisodes vides
    for (const c of Object.keys(this.etat.vus)) if (c.startsWith(dossier + path.sep)) delete this.etat.vus[c];
    this.enregistrer(this.etat);
    this._observer(projet);
    return this.verifier({ premier: projet });
  }

  retirer(projet) {
    const dossier = this.etat.dossiers[projet];
    delete this.etat.dossiers[projet];
    if (dossier) for (const c of Object.keys(this.etat.vus)) if (c.startsWith(dossier + path.sep)) delete this.etat.vus[c];
    this.observateurs.get(projet)?.close();
    this.observateurs.delete(projet);
    this.enregistrer(this.etat);
  }

  // Un passage sur tous les dossiers ; un seul à la fois
  verifier(options = {}) {
    if (this.enCours) return this.enCours.then(() => (options.premier ? this.verifier(options) : null));
    this.enCours = this._verifier(options).finally(() => { this.enCours = null; });
    return this.enCours;
  }

  async _verifier({ premier = null } = {}) {
    if (!this.actif()) return [];
    const faits = [];
    for (const [projet, dossier] of Object.entries(this.etat.dossiers)) {
      if (!fs.existsSync(dossier)) continue;
      for (const f of parEpisode(scanner(dossier))) {
        if (!this.actif()) break;
        const vu = this.etat.vus[f.chemin];
        if (vu && vu.taille === f.taille && vu.mtime === f.mtime) continue;
        if (Date.now() - f.mtime < CALME_MS) continue;
        let octets;
        try { octets = fs.readFileSync(f.chemin); } catch { continue; }
        const sha = empreinte(octets);
        if (vu && vu.sha === sha) { this.etat.vus[f.chemin] = { ...vu, taille: f.taille, mtime: f.mtime }; continue; }
        // Au premier passage d'un dossier, un épisode qui a déjà un script n'est pas touché
        const remplacer = premier !== projet;
        let r;
        try {
          r = await this.importer({ projet, nom: f.nom, octets, saison: f.saison, numero: f.numero, titre: f.titre, remplacer });
        } catch (e) {
          r = { statut: 'erreur', erreur: String(e && e.message || e).slice(0, 300) };
        }
        this.etat.vus[f.chemin] = { taille: f.taille, mtime: f.mtime, sha };
        if (r.statut === 'importe' || r.statut === 'remplace' || r.statut === 'erreur') {
          const ev = { projet, nom: f.nom, saison: f.saison, numero: f.numero, statut: r.statut, id: r.id || null, erreur: r.erreur || '', date: new Date().toISOString() };
          this.etat.journal.unshift(ev);
          faits.push(ev);
          this.prevenir(ev);
        }
      }
    }
    this.etat.journal = this.etat.journal.slice(0, 100);
    // Oublier les fichiers qui ont disparu
    const garder = Object.keys(this.etat.vus).filter(c => Object.values(this.etat.dossiers).some(d => c.startsWith(d + path.sep)));
    if (garder.length > 20000) garder.length = 20000;
    this.etat.vus = Object.fromEntries(garder.map(c => [c, this.etat.vus[c]]));
    this.enregistrer(this.etat);
    return faits;
  }
}

module.exports = { Surveillance, nomVersEpisode, ignore, scanner, parEpisode, EXTENSIONS };
