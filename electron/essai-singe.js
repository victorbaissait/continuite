'use strict';
/**
 * Essai « utilisateur qui fait n'importe quoi » (développement seulement, jamais dans l'app livrée) :
 *   APP_SINGE=dossier APP_DATA_DIR_DESKTOP=<copie des données> npm start
 * Des centaines de clics, de saisies et de choix au hasard dans tous les onglets. Les fenêtres de question
 * répondent au hasard, rien ne part dans le navigateur. Rapport : <dossier>/singe.json (erreurs JS, plantages).
 */
const fs = require('node:fs');
const path = require('node:path');

// Ce qui est injecté dans la page : les questions répondent au hasard, les erreurs sont notées
const PREPARER = `(() => {
  if (window.__singe) return;
  window.__singe = { erreurs: [] };
  // Chaque erreur part dans la console : Electron la relève même si la page se recharge ensuite
  const noter = (t) => console.error('[singe] ' + String(t).slice(0, 400));
  window.addEventListener('error', e => noter('erreur : ' + e.message + ' @ ' + (e.filename || '').split('/').pop() + ':' + e.lineno));
  window.addEventListener('unhandledrejection', e => noter('promesse rejetée : ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
  window.__piege = (ou) => { const n = (window.__nPiege = (window.__nPiege || 0) + 1) + Math.floor(Math.random() * 1e6) * 1000; console.warn('[singe-saisie] #' + n + ' ' + ou); return '<b>gras</b><img src=x onerror="console.error(\\'[singe-xss] #' + n + '\\')">'; };
  const textes = ['', 'Paul', null, '../../etc', 'é'.repeat(300), '-1', '99999', 'S1E01', '🎬', 'a,b,,c'];
  window.alert = () => {};
  window.confirm = () => Math.random() < 0.5;
  window.prompt = (question) => { if (Math.random() < 0.2) return null; const t = textes[Math.floor(Math.random() * textes.length)]; return t === null ? window.__piege('réponse à prompt : ' + String(question).slice(0, 80)) : t; };
  window.print = () => {};
  const clicOrigine = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () { if (this.type !== 'file') clicOrigine.call(this); };
  HTMLInputElement.prototype.showPicker = function () {};
  // Un clic sur un <label> relié à un champ fichier ouvrirait aussi la fenêtre système
  document.addEventListener('click', e => {
    const cible = e.target instanceof Element ? e.target : null;
    const champ = cible && (cible.closest('input[type=file]') || cible.closest('label')?.control || cible.closest('label')?.querySelector('input[type=file]'));
    if (champ && champ.type === 'file') e.preventDefault();
  }, true);
})()`;

// Une action au hasard parmi ce qui est visible et utilisable
const AGIR = `(() => {
  const textes = ['', 'Paul', null, '-5', '0', '123456789', 'é'.repeat(500), 'S2E03', '2026-02-30', '#zzzzzz', 'a'.repeat(5000)];
  const visibles = [...document.querySelectorAll('button, a[href], [onclick], select, input, textarea, [role="button"], summary')]
    .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.disabled && el.type !== 'file'; });
  if (!visibles.length) return 'rien';
  const el = visibles[Math.floor(Math.random() * visibles.length)];
  const nom = (el.tagName + ' ' + (el.textContent || el.placeholder || el.name || '').trim()).slice(0, 60);
  try {
    if (el.tagName === 'SELECT') {
      if (el.options.length) el.selectedIndex = Math.floor(Math.random() * el.options.length);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if ((el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'range', 'color'].includes(el.type)) || el.tagName === 'TEXTAREA') {
      el.focus();
      const t = textes[Math.floor(Math.random() * textes.length)];
      el.value = t === null && window.__piege ? window.__piege('champ ' + (el.id || el.name || el.placeholder || el.getAttribute('aria-label') || el.tagName) + ' · ' + (document.querySelector('.nav-btn.active')?.dataset.tab || '')) : (t ?? '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (Math.random() < 0.3) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    } else if (typeof el.click === 'function') {
      el.click();
    } else {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  } catch (e) { console.error('[singe] exception directe : ' + e.message + ' sur ' + nom); }
  return nom;
})()`;

module.exports = async function essaiSinge(win, dossier, { actions = 800 } = {}) {
  const debut = Date.now();
  fs.mkdirSync(dossier, { recursive: true });
  const attendre = ms => new Promise(r => setTimeout(r, ms));
  const rapport = { actions: 0, journal: [], erreurs: [], console: [], plantages: [], bloque: [], xss: false };
  const wc = win.webContents;
  let derniere = '';
  const saisies = new Map();
  wc.on('console-message', (details) => {
    const niveau = details.level ?? details.niveau;
    const message = String(details.message);
    if (message.startsWith('[singe-saisie] #')) { const [, n, ou] = message.match(/^\[singe-saisie\] #(\d+) (.*)$/) || []; if (n) saisies.set(n, ou); return; }
    if (message.includes('[singe-xss]')) {
      const n = (message.match(/#(\d+)/) || [])[1];
      // Exécutée, la charge n'écrit que « [singe-xss] #n » ; un message plus long ne fait que la citer
      const executee = /^\[singe-xss\] #\d+$/.test(message.trim());
      (rapport.xssOu = rapport.xssOu || []).push({ executee, message: message.slice(0, 300), action: rapport.actions, saisie: saisies.get(n) || '?', ecran: derniere, juste_avant: rapport.journal.slice(-4) });
      if (!executee) return;
      rapport.xss = true;
    }
    else if (message.startsWith('[singe] ')) rapport.erreurs.push(`[${rapport.actions} · ${derniere}] ${message.slice(8, 400)}`);
    else if (niveau === 'error' || niveau === 3) rapport.console.push(`[${rapport.actions} · ${derniere}] ${message.slice(0, 300)}`);
  });
  wc.on('render-process-gone', (_e, d) => rapport.plantages.push(d.reason));
  wc.on('unresponsive', () => rapport.bloque.push(rapport.actions));
  // Un export ouvrirait la fenêtre « Enregistrer sous » : l'essai l'annule avant
  wc.session.on('will-download', (event, item) => { event.preventDefault(); try { item.cancel(); } catch { /* déjà annulé */ } rapport.telechargements = (rapport.telechargements || 0) + 1; });
  const onglets = ['episodes', 'ecriture', 'personnages', 'decors', 'frise', 'themes', 'suivi', 'analyse', 'batch', 'recherche', 'journal', 'lecteurs', 'settings'];
  const executer = (code, ms = 8000) => Promise.race([wc.executeJavaScript(code), attendre(ms).then(() => '⏱ délai dépassé')]);
  // L'essai part du projet d'origine
  await executer(`localStorage.removeItem('lemenu_projet'); location.reload()`).catch(() => {});
  await attendre(4000);
  await executer(PREPARER);
  // Contrôle du relevé : une erreur et un message de console volontaires doivent y apparaître
  await executer(`setTimeout(() => { throw new Error('controle-du-releve'); }); console.error('controle-console'); 1`);
  await attendre(300);
  for (let i = 0; i < actions; i++) {
    if (wc.isDestroyed()) break;
    let quoi;
    try {
      if (i % 40 === 0) {
        const o = onglets[(i / 40) % onglets.length];
        quoi = 'onglet ' + o;
        await executer(`document.querySelector('[data-tab="${o}"]')?.click()`);
      } else {
        quoi = await executer(AGIR);
      }
      // Une page rechargée (changement de projet, import) perd la préparation : on la remet
      await executer(PREPARER);
    } catch (e) {
      quoi = 'exception : ' + e.message;
    }
    // Une balise piégée insérée dans la page, exécutée ou non : la marque data-xss dit quel champ elle vient
    const inseres = await executer(`JSON.stringify([...new Set([...document.querySelectorAll('[data-xss]')].map(e => e.getAttribute('data-xss')))])`, 4000).catch(() => '[]');
    try { for (const champ of JSON.parse(inseres)) { rapport.inseres = rapport.inseres || {}; if (!rapport.inseres[champ]) rapport.inseres[champ] = `${derniere} (action ${rapport.actions})`; } } catch { /* délai */ }
    rapport.actions++;
    derniere = String(quoi).replace(/\s+/g, ' ').slice(0, 60);
    if (i % 50 === 0) {
      fs.writeFileSync(path.join(dossier, 'avancement.txt'), `${i} actions · ${Math.round((Date.now() - debut) / 1000)} s · ${quoi}\n`);
      fs.writeFileSync(path.join(dossier, 'singe.json'), JSON.stringify(rapport, null, 1));
    }
    rapport.journal.push(quoi);
    if (rapport.journal.length > 60) rapport.journal.shift();
    if (String(quoi).includes('délai dépassé')) rapport.bloque.push(`${i} : ${quoi}`);
    await attendre(120);
    // Les fenêtres ouvertes (impression, aperçu) se referment
    for (const w of require('electron').BrowserWindow.getAllWindows()) if (w !== win && !w.isDestroyed()) w.destroy();
  }
  if (process.env.APP_TRACE) fs.appendFileSync(process.env.APP_TRACE, 'boucle finie\n');
  rapport.releveVerifie = rapport.erreurs.some(e => e.includes('controle-du-releve')) && rapport.console.some(e => e.includes('controle-console'));
  rapport.erreurs = rapport.erreurs.filter(e => !e.includes('controle-du-releve'));
  rapport.console = rapport.console.filter(e => !e.includes('controle-console') && !e.includes('controle-du-releve'));
  fs.writeFileSync(path.join(dossier, 'singe.json'), JSON.stringify(rapport, null, 1));
  // Une fenêtre cachée derrière les autres peut ne jamais rendre sa capture : on n'attend pas plus de 5 s
  const image = await Promise.race([wc.capturePage().catch(() => null), attendre(5000).then(() => null)]);
  if (image) fs.writeFileSync(path.join(dossier, 'fin.png'), image.toPNG());
  if (process.env.APP_TRACE) fs.appendFileSync(process.env.APP_TRACE, 'capture faite\n');
};
