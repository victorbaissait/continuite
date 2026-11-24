'use strict';
/**
 * Le verrou de l'app : un mot de passe dont on ne garde que l'empreinte (scrypt, avec un sel tiré au hasard).
 * Ce n'est pas un chiffrement : les fichiers des projets restent lisibles sur le disque (FileVault ou BitLocker les protègent).
 * Aucune dépendance à Electron : se teste seul (electron/test-verrou.js).
 */
const crypto = require('node:crypto');

const LONGUEUR_MIN = 4;
const DELAIS = [0, 0, 0, 1000, 2000, 5000, 10000, 30000]; // après quelques erreurs, il faut attendre de plus en plus

function nettoyer(v) {
  const o = v && typeof v === 'object' ? v : {};
  return {
    sel: /^[0-9a-f]{32}$/.test(o.sel || '') ? o.sel : '',
    empreinte: /^[0-9a-f]{128}$/.test(o.empreinte || '') ? o.empreinte : '',
    minutes: [0, 5, 15, 30, 60].includes(Number(o.minutes)) ? Number(o.minutes) : 0,
    veille: o.veille !== false,
  };
}

const actif = v => Boolean(nettoyer(v).empreinte);

function empreinte(mdp, sel) {
  return crypto.scryptSync(String(mdp).normalize('NFC'), Buffer.from(sel, 'hex'), 64, { N: 16384, r: 8, p: 1 }).toString('hex');
}

function verifier(v, mdp) {
  const r = nettoyer(v);
  if (!r.empreinte || typeof mdp !== 'string') return false;
  const a = Buffer.from(empreinte(mdp, r.sel), 'hex');
  const b = Buffer.from(r.empreinte, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Définir, changer ou retirer : l'ancien mot de passe est demandé dès qu'il en existe un
function changer(v, { ancien, nouveau, minutes, veille } = {}) {
  const r = nettoyer(v);
  if (r.empreinte && !verifier(r, ancien)) return { error: 'L\'ancien mot de passe ne correspond pas.' };
  const suite = { ...r };
  if (minutes !== undefined) suite.minutes = nettoyer({ minutes }).minutes;
  if (veille !== undefined) suite.veille = veille !== false;
  if (nouveau === null) return { verrou: { sel: '', empreinte: '', minutes: 0, veille: true } };
  if (nouveau !== undefined) {
    if (typeof nouveau !== 'string' || [...nouveau].length < LONGUEUR_MIN) return { error: `Le mot de passe fait au moins ${LONGUEUR_MIN} caractères.` };
    if ([...nouveau].length > 200) return { error: 'Le mot de passe fait 200 caractères au plus.' };
    suite.sel = crypto.randomBytes(16).toString('hex');
    suite.empreinte = empreinte(nouveau, suite.sel);
  }
  if (!suite.empreinte) return { error: 'Choisis d\'abord un mot de passe.' };
  return { verrou: suite };
}

const delai = echecs => DELAIS[Math.min(echecs, DELAIS.length - 1)];

module.exports = { LONGUEUR_MIN, nettoyer, actif, verifier, changer, delai };
