'use strict';
/**
 * Essai de la lecture à la table en réseau :  npm run test:lecture-reseau
 * Le serveur sert un épisode en lecture seule, derrière un code ; tout le reste est refusé ; il s'arrête vraiment.
 */
const http = require('node:http');
const { LectureReseau } = require('./lecture-reseau');

const echecs = [];
const verifier = (nom, ok, detail = '') => { console.log(`${ok ? 'OK' : 'KO'} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) echecs.push(nom); };
const demander = (port, chemin, methode = 'GET') => new Promise(resolve => {
  const req = http.request({ host: '127.0.0.1', port, path: chemin, method: methode }, res => {
    let corps = '';
    res.setEncoding('utf8');
    res.on('data', c => { corps += c; });
    res.on('end', () => resolve({ status: res.statusCode, corps, entetes: res.headers }));
  });
  req.on('error', e => resolve({ status: 0, erreur: e.code }));
  req.end();
});

(async () => {
  const r = new LectureReseau();
  let refus = false;
  try { await r.demarrer({ titre: 'Vide', lignes: [] }); } catch { refus = true; }
  verifier('un épisode vide ne se partage pas', refus && !r.actif());

  const e = await r.demarrer({ titre: 'S1E01 — Essai', lignes: [{ qui: 'ALICE', texte: 'Bonjour <script>alert(1)</script>' }, { qui: '', texte: 'Elle sort.' }, { qui: 'BRUNO', texte: 'Au revoir.' }] });
  const url = new URL(e.urls[0] || `http://127.0.0.1:1/t/x`);
  const port = Number(url.port) || r.serveur.address().port;
  const jeton = r.jeton;
  verifier('une adresse par réseau, avec un code de 32 caractères', e.actif && /^[0-9a-f]{32}$/.test(jeton));

  const page = await demander(port, `/t/${jeton}`);
  verifier('la page se lit avec le code', page.status === 200 && /Lecture à la table/.test(page.corps) && /default-src 'none'/.test(page.entetes['content-security-policy'] || ''));
  verifier('la page n\'injecte jamais le texte en HTML', !/innerHTML/.test(page.corps) && /textContent/.test(page.corps));
  const etat = await demander(port, `/t/${jeton}/etat`);
  verifier('l\'épisode est servi en JSON', etat.status === 200 && JSON.parse(etat.corps).lignes.length === 3);
  verifier('sans le code : rien', (await demander(port, '/')).status === 404 && (await demander(port, `/t/${'0'.repeat(32)}`)).status === 404);
  verifier('lecture seule : POST refusé', (await demander(port, `/t/${jeton}/etat`, 'POST')).status === 404);
  verifier('pas d\'autre chemin', (await demander(port, `/t/${jeton}/../../etc/passwd`)).status === 404);

  // Le flux : la ligne lue arrive chez les téléphones
  const recu = await new Promise(resolve => {
    const msgs = [];
    const req = http.get({ host: '127.0.0.1', port, path: `/t/${jeton}/flux` }, res => {
      res.setEncoding('utf8');
      res.on('data', c => {
        msgs.push(...c.split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)).i));
        if (msgs.length === 1) r.position(2);
        if (msgs.length >= 2) { req.destroy(); resolve(msgs); }
      });
    });
    setTimeout(() => { req.destroy(); resolve(msgs); }, 3000);
  });
  verifier('la ligne lue avance en direct', recu[0] === 0 && recu[1] === 2, JSON.stringify(recu));
  r.position(99);
  verifier('une position hors du texte est ramenée dedans', r.donnees.i === 2);

  await r.arreter();
  const apres = await demander(port, `/t/${jeton}`);
  verifier('arrêté : plus rien ne répond', apres.status === 0 && !r.actif());

  if (echecs.length) { console.error(`\n${echecs.length} échec(s)`); process.exit(1); }
  console.log('\nLecture en réseau : tout est bon.');
})().catch(e => { console.error('✗ ' + e.message); process.exit(1); });
