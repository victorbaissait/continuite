'use strict';
/**
 * La lecture à la table en réseau : chaque comédien suit le texte sur son téléphone, par le Wi-Fi de la maison.
 * Le serveur ne démarre qu'à la demande, ne sert qu'un épisode, en lecture seule, derrière une adresse qui contient
 * un code impossible à deviner. Il s'arrête tout seul au bout de 4 heures, et quand l'app se ferme.
 * Aucune dépendance à Electron : se teste seul (electron/test-lecture-reseau.js).
 */
const crypto = require('node:crypto');
const http = require('node:http');
const os = require('node:os');

const DUREE_MAX = 4 * 3600 * 1000;
const CLIENTS_MAX = 40;
const LIGNES_MAX = 6000;

function adressesLocales() {
  const sortie = [];
  for (const liste of Object.values(os.networkInterfaces())) {
    for (const a of liste || []) {
      if (a.family === 'IPv4' && !a.internal) sortie.push(a.address);
    }
  }
  return sortie;
}

function nettoyerLignes(lignes) {
  return (Array.isArray(lignes) ? lignes : []).slice(0, LIGNES_MAX).map(l => ({
    qui: typeof l?.qui === 'string' ? l.qui.slice(0, 80) : '',
    texte: String(l?.texte ?? '').slice(0, 2000),
  }));
}

const PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lecture à la table</title><style>
:root { color-scheme: dark; }
body { margin: 0; background: #0b0b0b; color: #ecebe6; font: 18px/1.5 system-ui, -apple-system, sans-serif; }
header { position: sticky; top: 0; background: #151515; padding: 10px 14px; border-bottom: 1px solid #2a2a2a; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
header h1 { font-size: 15px; margin: 0 auto 0 0; color: #aaa; }
select, button { font: inherit; font-size: 15px; background: #222; color: #eee; border: 1px solid #333; border-radius: 8px; padding: 6px 10px; }
main { max-width: 40em; margin: 0 auto; padding: 16px 16px 60vh; }
p { margin: 0 0 12px; padding: 6px 10px; border-radius: 8px; border-left: 4px solid transparent; transition: background .3s; }
p.did { color: #9a9a94; font-style: italic; font-size: .9em; }
p b { display: block; font-size: .7em; letter-spacing: .08em; color: #67cbac; }
p.moi { border-left-color: #f5c04a; background: #2a2410; }
p.ici { background: #173a31; }
p.moi.ici { background: #3d3412; }
.etat { font-size: 13px; color: #888; }
</style></head><body>
<header><h1 id="titre">Lecture à la table</h1><label>Mon rôle <select id="role"><option value="">—</option></select></label>
<button id="moins">A−</button><button id="plus">A+</button><span class="etat" id="etat">connexion…</span></header>
<main id="texte"></main>
<script>
const base = location.pathname.replace(/\\/$/, '');
let lignes = [], i = 0, taille = Number(localStorage.getItem('taille')) || 18;
const role = document.getElementById('role');
function rendre() {
  const moi = role.value;
  document.getElementById('texte').replaceChildren();
  lignes.forEach((l, k) => {
    const p = document.createElement('p');
    p.id = 'l' + k;
    if (!l.qui) p.className = 'did';
    if (moi && l.qui === moi) p.classList.add('moi');
    if (k === i) p.classList.add('ici');
    if (l.qui) { const b = document.createElement('b'); b.textContent = l.qui; p.appendChild(b); }
    p.appendChild(document.createTextNode(l.texte));
    document.getElementById('texte').appendChild(p);
  });
  suivre();
}
function suivre() {
  document.querySelectorAll('p.ici').forEach(p => p.classList.remove('ici'));
  const p = document.getElementById('l' + i);
  if (p) { p.classList.add('ici'); p.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}
function appliquerTaille() { document.body.style.fontSize = taille + 'px'; localStorage.setItem('taille', taille); }
document.getElementById('moins').onclick = () => { taille = Math.max(12, taille - 2); appliquerTaille(); };
document.getElementById('plus').onclick = () => { taille = Math.min(40, taille + 2); appliquerTaille(); };
role.onchange = () => { localStorage.setItem('role', role.value); rendre(); };
appliquerTaille();
fetch(base + '/etat').then(r => r.json()).then(d => {
  document.getElementById('titre').textContent = d.titre || 'Lecture à la table';
  lignes = d.lignes; i = d.i;
  [...new Set(lignes.map(l => l.qui).filter(Boolean))].forEach(q => { const o = document.createElement('option'); o.value = q; o.textContent = q; role.appendChild(o); });
  role.value = localStorage.getItem('role') || '';
  rendre();
  const flux = new EventSource(base + '/flux');
  flux.onmessage = e => { const m = JSON.parse(e.data); if (typeof m.i === 'number') { i = m.i; suivre(); } };
  flux.onopen = () => { document.getElementById('etat').textContent = 'en direct'; };
  flux.onerror = () => { document.getElementById('etat').textContent = 'reconnexion…'; };
}).catch(() => { document.getElementById('etat').textContent = 'lecture terminée'; });
</script></body></html>`;

class LectureReseau {
  constructor() {
    this.serveur = null;
    this.jeton = null;
    this.donnees = null;
    this.clients = new Set();
    this.minuteur = null;
  }

  actif() {
    return Boolean(this.serveur);
  }

  etat() {
    if (!this.serveur) return { actif: false };
    const port = this.serveur.address().port;
    return { actif: true, urls: adressesLocales().map(a => `http://${a}:${port}/t/${this.jeton}`), lecteurs: this.clients.size, fin: this.fin };
  }

  async demarrer({ titre, lignes }) {
    await this.arreter();
    const propres = nettoyerLignes(lignes);
    if (!propres.some(l => l.texte.trim())) throw new Error('Rien à partager : l\'épisode est vide.');
    this.donnees = { titre: String(titre || '').slice(0, 200), lignes: propres, i: 0 };
    this.jeton = crypto.randomBytes(16).toString('hex');
    const prefixe = `/t/${this.jeton}`;
    this.serveur = http.createServer((req, res) => {
      const entetes = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
      const chemin = String(req.url || '').split('?')[0];
      if (req.method !== 'GET' || !(chemin === prefixe || chemin.startsWith(prefixe + '/'))) {
        res.writeHead(404, { ...entetes, 'content-type': 'text/plain; charset=utf-8' });
        res.end('Introuvable');
        return;
      }
      const suite = chemin.slice(prefixe.length);
      if (suite === '' || suite === '/') {
        res.writeHead(200, { ...entetes, 'content-type': 'text/html; charset=utf-8',
          'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'" });
        res.end(PAGE);
      } else if (suite === '/etat') {
        res.writeHead(200, { ...entetes, 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(this.donnees));
      } else if (suite === '/flux') {
        if (this.clients.size >= CLIENTS_MAX) { res.writeHead(503, entetes); res.end(); return; }
        res.writeHead(200, { ...entetes, 'content-type': 'text/event-stream', connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify({ i: this.donnees.i })}\n\n`);
        this.clients.add(res);
        const battement = setInterval(() => res.write(': ok\n\n'), 25000);
        req.on('close', () => { clearInterval(battement); this.clients.delete(res); });
      } else {
        res.writeHead(404, entetes);
        res.end();
      }
    });
    this.serveur.headersTimeout = 10000;
    this.serveur.requestTimeout = 15000;
    await new Promise((ok, ko) => { this.serveur.once('error', ko); this.serveur.listen(0, '0.0.0.0', ok); });
    this.fin = Date.now() + DUREE_MAX;
    this.minuteur = setTimeout(() => this.arreter(), DUREE_MAX);
    this.minuteur.unref?.();
    return this.etat();
  }

  position(i) {
    if (!this.donnees) return;
    const n = Math.max(0, Math.min(this.donnees.lignes.length - 1, Math.floor(Number(i) || 0)));
    if (n === this.donnees.i) return;
    this.donnees.i = n;
    for (const c of this.clients) c.write(`data: ${JSON.stringify({ i: n })}\n\n`);
  }

  async arreter() {
    clearTimeout(this.minuteur);
    for (const c of this.clients) { try { c.end(); } catch { /* déjà fermé */ } }
    this.clients.clear();
    const s = this.serveur;
    this.serveur = null;
    this.jeton = null;
    this.donnees = null;
    if (s) await new Promise(r => { s.closeAllConnections?.(); s.close(() => r()); });
  }
}

module.exports = { LectureReseau, nettoyerLignes, adressesLocales };
