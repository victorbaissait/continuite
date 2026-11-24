// assets/js/atelier.js — Lecture à la table, versions comparées, arc des personnages, continuité, budget du film
'use strict';

const Atelier = {
  vue() {
    return '<div class="an-vue" id="ec-atelier"><p class="an-note">Lecture…</p></div>';
  },

  ouvrir() {
    const ouvrir = { lecture: () => Lecture.ouvrir(), versions: () => Versions.ouvrir(), arcs: () => Arcs.rendre(), continuite: () => Continuite.ouvrir(), budget: () => Budget.rendre() }[Ecriture.vue];
    if (ouvrir) ouvrir();
  },

  slot() {
    return document.getElementById('ec-atelier');
  },

  ep() {
    return Ecriture.ordre[Ecriture.rang.get(Ecriture.epId)];
  },
};

// ─── Lecture à la table : une voix par personnage, chronomètre en main ─────

const Lecture = {
  data: null,
  lignes: [],
  i: 0,
  enCours: false,
  vitesse: 1,
  didascalies: false,
  mesures: {},
  _debut: 0,

  async ouvrir() {
    this.arreter();
    const e = Atelier.ep();
    if (!e) return;
    this.data = await api.get(`ecriture_sb&episode_id=${e.id}`);
    this.lignes = this.data.scenes.flatMap(s => s.lignes.map(l => ({ ...l, scene: s.i, slug: s.slug })));
    this.i = 0;
    this.mesures = objetNote(Ecriture.notes[`lecture:${e.id}`]).scenes || {};
    this.rendre();
  },

  _voix() {
    const toutes = 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
    const fr = toutes.filter(v => v.lang.startsWith('fr'));
    return fr.length ? fr : toutes;
  },

  // Une voix et une hauteur par personnage, toujours les mêmes d'une lecture à l'autre
  _pour(qui) {
    const voix = this._voix();
    const parleurs = [...new Set(this.lignes.map(l => l.qui).filter(Boolean))];
    const rang = Math.max(0, parleurs.indexOf(qui));
    return { voix: voix.length ? voix[rang % voix.length] : null, hauteur: 0.75 + ((rang * 0.37) % 0.7) };
  },

  // La durée attendue d'une scène : celle du storyboard (une page par minute), sinon 150 mots par minute
  _attendu(s) {
    if (s.secondes) return s.secondes;
    const mots = s.lignes.filter(l => l.qui).reduce((t, l) => t + l.texte.split(/\s+/).length, 0);
    return Math.round(mots / 150 * 60);
  },

  _duree(s) {
    s = Math.round(s);
    return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`;
  },

  rendre() {
    const slot = Atelier.slot();
    if (!slot || !this.data) return;
    if (!this.lignes.length) { slot.innerHTML = '<section class="an-carte"><p class="an-note">Pas encore de texte à lire pour cet épisode.</p></section>'; return; }
    const scenes = this.data.scenes;
    const mesures = scenes.map(s => this.mesures[s.i]).filter(Number.isFinite);
    const totalMesure = mesures.reduce((a, b) => a + b, 0);
    const totalAttendu = scenes.reduce((t, s) => t + this._attendu(s), 0);
    const courante = this.lignes[this.i];
    const parleurs = [...new Set(this.lignes.map(l => l.qui).filter(Boolean))];
    slot.innerHTML = `
      <div class="an-ligne lec-barre">
        <button type="button" class="btn btn-primary btn-sm" onclick="Lecture.basculer()">${this.enCours ? '❚❚ Pause' : this.i ? '▶ Reprendre' : '▶ Lire depuis le début'}</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="Lecture.recommencer()">Recommencer</button>
        <label class="an-label" for="lec-vitesse">Vitesse</label>
        <select id="lec-vitesse" onchange="Lecture.vitesse = Number(this.value)">${[0.8, 0.9, 1, 1.1, 1.25, 1.5].map(v => `<option value="${v}" ${v === this.vitesse ? 'selected' : ''}>${String(v).replace('.', ',')}×</option>`).join('')}</select>
        <label class="mep-coche"><input type="checkbox" ${this.didascalies ? 'checked' : ''} onchange="Lecture.didascalies = this.checked"><span>Lire aussi les didascalies</span></label>
        <span class="an-note" id="lec-chrono">${this.enCours ? 'lecture…' : ''}</span>
      </div>
      ${'speechSynthesis' in window ? '' : '<p class="an-note ec-orange">Ce navigateur ne sait pas lire à voix haute.</p>'}
      <div class="sb-grille">
        <section class="an-carte">
          <div class="an-entete"><h2 class="an-titre">${esc(courante?.slug || '')}</h2><span class="an-note">${this.i + 1} / ${this.lignes.length}</span></div>
          <div class="lec-texte" id="lec-texte">${this.lignes.map((l, k) => `<p class="lec-l ${l.qui ? '' : 'did'} ${k === this.i ? 'actif' : ''}" data-k="${k}" onclick="Lecture.aller(${k})">${l.qui ? `<strong style="color:${Analyse._encre(Analyse._couleur(l.qui))}">${esc(l.qui)}</strong> ` : ''}<span class="vo-brut">${esc(l.texte)}</span></p>`).join('')}</div>
        </section>
        <section class="an-carte sb-detail">
          <h2 class="an-titre">Chronomètre</h2>
          <div class="an-entete"><span>Lu</span><strong>${mesures.length ? this._duree(totalMesure) : '—'}</strong></div>
          <div class="an-entete"><span>Estimé</span><strong>${this._duree(totalAttendu)}</strong></div>
          <ul class="ec-liste">${scenes.map(s => {
            const m = this.mesures[s.i], a = this._attendu(s);
            const lent = Number.isFinite(m) && a && m > a * 1.3;
            return `<li class="${lent ? 'ec-orange' : ''}"><span class="vo-brut">${esc(s.slug || 'Ouverture')}</span><span>${Number.isFinite(m) ? `${this._duree(m)} lu` : '—'} · ${this._duree(a)} estimé${lent ? ' · ça traîne' : ''}</span></li>`;
          }).join('')}</ul>
          <span class="an-label">Voix</span>
          <p class="sb-texte vo-brut">${parleurs.map(p => { const v = this._pour(p).voix; return `${esc(p)} : ${esc(v ? v.name : 'voix par défaut')}`; }).join(' · ') || '—'}</p>
          <p class="an-note">Une scène qui dure 30 % de plus que l'estimation est signalée : c'est souvent là que le texte traîne. La durée lue est ramenée à la vitesse normale ; les mesures sont gardées pour la prochaine fois.</p>
        </section>
      </div>
    `;
  },

  aller(k) {
    const reprendre = this.enCours;
    this.arreter();
    this.i = Math.max(0, Math.min(this.lignes.length - 1, Number(k) || 0));
    this.rendre();
    if (reprendre) this.basculer();
  },

  recommencer() {
    this.arreter();
    this.i = 0;
    this.mesures = {};
    this.rendre();
  },

  basculer() {
    if (this.enCours) { this.arreter(); this.rendre(); return; }
    if (!('speechSynthesis' in window)) return;
    // Le navigateur charge ses voix après coup : au premier appel la liste peut être vide
    if (!speechSynthesis.getVoices().length && !this._attente) {
      this._attente = true;
      speechSynthesis.addEventListener('voiceschanged', () => this.basculer(), { once: true });
      setTimeout(() => { if (!this.enCours) this.basculer(); }, 800);
      return;
    }
    this.enCours = true;
    this._sceneDebut = { i: this.lignes[this.i]?.scene, t: performance.now() };
    this.rendre();
    this._suivante();
  },

  _suivante() {
    if (!this.enCours) return;
    const l = this.lignes[this.i];
    if (!l) { this._finScene(); this.arreter(); this.rendre(); return; }
    if (l.scene !== this._sceneDebut.i) { this._finScene(); this._sceneDebut = { i: l.scene, t: performance.now() }; }
    document.querySelectorAll('.lec-l.actif').forEach(p => p.classList.remove('actif'));
    const p = document.querySelector(`.lec-l[data-k="${this.i}"]`);
    if (p) { p.classList.add('actif'); p.scrollIntoView({ block: 'nearest' }); }
    if (!l.qui && !this.didascalies) { this.i++; this._suivante(); return; }
    const u = new SpeechSynthesisUtterance(l.texte);
    const { voix, hauteur } = this._pour(l.qui);
    if (voix) { u.voice = voix; u.lang = voix.lang; }
    u.pitch = l.qui ? hauteur : 1;
    u.rate = this.vitesse * (l.qui ? 1 : 1.1);
    u.onend = () => { if (!this.enCours) return; this.i++; this._suivante(); };
    u.onerror = u.onend;
    speechSynthesis.speak(u);
  },

  // Le temps passé sur une scène, ramené à la vitesse normale
  _finScene() {
    if (!this._sceneDebut || this._sceneDebut.i === undefined) return;
    const t = (performance.now() - this._sceneDebut.t) / 1000 * this.vitesse;
    this.mesures[this._sceneDebut.i] = (this.mesures[this._sceneDebut.i] || 0) + t;
    const e = Atelier.ep();
    if (e) Ecriture.noterPlusTard(`lecture:${e.id}`, JSON.stringify({ date: new Date().toISOString().slice(0, 10), scenes: this.mesures }));
  },

  arreter() {
    if (this.enCours) this._finScene();
    this.enCours = false;
    this._sceneDebut = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  },
};

// ─── Versions comparées : deux états du même texte côte à côte ─────────────

const Versions = {
  liste: [],
  a: 'script',
  b: 'brouillon',
  textes: {},

  async ouvrir() {
    const e = Atelier.ep();
    if (!e) return;
    const [liste, fiche] = await Promise.all([api.get(`ecriture_versions&episode=${e.id}`), api.get(`episodes/${e.id}`)]);
    this.liste = Array.isArray(liste) ? liste : [];
    this.textes = { script: fiche.texte_episode || '', brouillon: Ecriture.notes[`brouillon:${e.id}`] || '' };
    // Sans brouillon, on compare le script à la dernière version gardée
    this.sansBrouillon = !this.textes.brouillon.trim();
    if (this.sansBrouillon && this.b === 'brouillon') this.b = this.liste[0] ? `v${this.liste[0].id}` : 'script';
    if (this.sansBrouillon && this.a === 'brouillon') this.a = 'script';
    await this.rendre();
  },

  async _texte(cle) {
    if (cle in this.textes) return this.textes[cle];
    const v = await api.get(`ecriture_versions&id=${cle.slice(1)}`);
    this.textes[cle] = v.texte || '';
    return this.textes[cle];
  },

  // Différence ligne à ligne ; une ligne coupée ici et ajoutée là, identique, a été déplacée
  comparer(avant, apres) {
    const a = avant.replace(/\r/g, '').split('\n'), b = apres.replace(/\r/g, '').split('\n');
    const n = a.length, m = b.length;
    if (n * m > 4000000) return [...a.map(t => ({ s: '-', t })), ...b.map(t => ({ s: '+', t }))];
    const t = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    const ops = [];
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) { ops.push({ s: '=', t: a[i] }); i++; j++; }
      else if (j < m && (i === n || t[i][j + 1] >= t[i + 1][j])) ops.push({ s: '+', t: b[j++] });
      else ops.push({ s: '-', t: a[i++] });
    }
    const retirees = new Map();
    ops.forEach((o, k) => { if (o.s === '-' && o.t.trim()) retirees.set(o.t.trim(), [...(retirees.get(o.t.trim()) || []), k]); });
    ops.forEach(o => {
      if (o.s !== '+' || !o.t.trim()) return;
      const k = retirees.get(o.t.trim())?.shift();
      if (k !== undefined) { o.s = '>'; ops[k].s = '<'; }
    });
    return ops;
  },

  async rendre() {
    const slot = Atelier.slot();
    if (!slot) return;
    const choix = [['script', 'Script validé'], ...(this.sansBrouillon ? [] : [['brouillon', 'Brouillon en cours']]), ...this.liste.map(v => [`v${v.id}`, `${v.cree_le}${v.motif ? ` · ${v.motif}` : ''}`])];
    if (choix.length < 2) {
      slot.innerHTML = '<section class="an-carte"><p class="an-note">Une seule version pour l\'instant : le script validé. Ouvre le Brouillon et garde une version, ou commence à réécrire, pour avoir de quoi comparer.</p></section>';
      return;
    }
    const [ta, tb] = await Promise.all([this._texte(this.a), this._texte(this.b)]);
    const ops = this.comparer(ta, tb);
    const nb = s => ops.filter(o => o.s === s && o.t.trim()).length;
    const mots = s => ops.filter(o => o.s === s).reduce((x, o) => x + (o.t.match(/\S+/g) || []).length, 0);
    const gauche = ops.filter(o => o.s !== '+' && o.s !== '>');
    const droite = ops.filter(o => o.s !== '-' && o.s !== '<');
    const classe = { '-': 'ver-coupe', '+': 'ver-ajout', '<': 'ver-deplace', '>': 'ver-deplace', '=': '' };
    const select = (id, valeur) => `<select id="${id}" onchange="Versions.${id === 'ver-a' ? 'a' : 'b'} = this.value; Versions.rendre()">${choix.map(([v, l]) => `<option value="${esc(v)}" ${v === valeur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    slot.innerHTML = `
      <div class="an-ligne ver-barre"><label class="an-label" for="ver-a">Avant</label>${select('ver-a', this.a)}<label class="an-label" for="ver-b">Après</label>${select('ver-b', this.b)}</div>
      <p class="an-note"><span class="ver-ajout">${nb('+')} ligne(s) ajoutée(s) (+${mots('+')} mots)</span> · <span class="ver-coupe">${nb('-')} coupée(s) (−${mots('-')} mots)</span> · <span class="ver-deplace">${nb('>')} déplacée(s)</span>. Les versions viennent du Brouillon (« Garder une version ») ; le script validé est celui qu'analyse l'app.</p>
      <div class="ver-cote">
        <section class="an-carte"><h2 class="an-titre">Avant</h2><div class="ver-texte">${gauche.map(o => `<div class="${classe[o.s]}">${esc(o.t) || '&nbsp;'}</div>`).join('')}</div></section>
        <section class="an-carte"><h2 class="an-titre">Après</h2><div class="ver-texte">${droite.map(o => `<div class="${classe[o.s]}">${esc(o.t) || '&nbsp;'}</div>`).join('')}</div></section>
      </div>
    `;
  },
};

// ─── Arc des personnages ───────────────────────────────────────────────────

const Arcs = {
  perso: null,

  _note(nom) {
    return objetNote(Ecriture.notes[`arc:${nom}`]);
  },

  _noms() {
    const compte = new Map();
    Ecriture.ensemble().forEach(e => e._noms.forEach((v, n) => compte.set(n, (compte.get(n) || 0) + v)));
    return [...compte.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, 20);
  },

  rendre() {
    const slot = Atelier.slot();
    if (!slot) return;
    const noms = this._noms();
    if (!noms.length) { slot.innerHTML = '<section class="an-carte"><p class="an-note">Aucun personnage dans ce choix.</p></section>'; return; }
    if (!noms.includes(this.perso)) this.perso = noms[0];
    const nom = this.perso;
    const note = this._note(nom);
    // Chaque scène où le personnage parle, dans l'ordre de l'œuvre
    const scenes = Ecriture.ensemble().flatMap(e => e._scenes.map((set, k) => ({ e, k, la: set.has(nom), lieu: Ecriture._decor ? Ecriture._decor(e.sc[k][2]) : '' })).filter(x => x.la));
    let cumul = 0;
    const points = [];
    scenes.forEach((x, idx) => {
      const a = note[`${x.e.id}:${x.k}`];
      if (a && Number.isFinite(a.s)) { cumul += a.s; points.push([idx, cumul]); }
    });
    const notees = scenes.filter(x => note[`${x.e.id}:${x.k}`]);
    // Ce qui mérite un regard : un personnage qui stagne, un objectif qui change
    const alertes = [];
    let plat = 0;
    let avant = null;
    notees.forEach(x => {
      const a = note[`${x.e.id}:${x.k}`];
      plat = a.s === 0 ? plat + 1 : 0;
      if (plat === 5) alertes.push(`Stagne depuis cinq scènes (jusqu'à ${Ecriture._code(x.e)}) : rien ne le fait avancer ni reculer.`);
      if (avant && a.v && avant.v && a.v.trim().toLowerCase() !== avant.v.trim().toLowerCase()) alertes.push(`En ${Ecriture._code(x.e)}, il ne veut plus « ${avant.v} » mais « ${a.v} » : qu'est-ce qui l'a fait changer ?`);
      if (a.v) avant = a;
    });
    const min = Math.min(0, ...points.map(p => p[1])), max = Math.max(1, ...points.map(p => p[1]));
    const X = i => 20 + (660 * i) / Math.max(1, scenes.length - 1);
    const Y = v => 150 - (130 * (v - min)) / ((max - min) || 1);
    slot.innerHTML = `
      <div class="an-ligne"><label class="an-label" for="arc-perso">Personnage</label><select id="arc-perso" onchange="Arcs.perso = this.value; Arcs.rendre()">${noms.map(n => `<option ${n === nom ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
        <span class="an-note">${notees.length} scène(s) notée(s) sur ${scenes.length}</span></div>
      <section class="an-carte">
        <h2 class="an-titre">La courbe de ${esc(nom)}</h2>
        ${points.length > 1 ? `<svg class="arc-courbe" viewBox="0 0 700 170" role="img" aria-label="Courbe de ${esc(nom)}"><line x1="20" x2="680" y1="${Y(0)}" y2="${Y(0)}" class="arc-zero"/><polyline points="${points.map(([i, v]) => `${X(i)},${Y(v)}`).join(' ')}"/>${points.map(([i, v]) => `<circle cx="${X(i)}" cy="${Y(v)}" r="4"/>`).join('')}</svg>` : '<p class="an-note">Note au moins deux scènes pour voir la courbe.</p>'}
        <p class="an-note">Chaque ▲ le fait monter, chaque ▼ descendre : la courbe montre s'il avance vers ce qu'il veut ou s'en éloigne.</p>
      </section>
      ${alertes.length ? `<section class="an-carte"><h2 class="an-titre">À regarder</h2><ul class="ec-liste">${alertes.map(a => `<li class="ec-orange"><span class="vo-brut">${esc(a)}</span></li>`).join('')}</ul></section>` : ''}
      <section class="an-carte">
        <h2 class="an-titre">Scène par scène</h2>
        <div class="an-table"><table class="arc-table">
          <thead><tr><th scope="col">Où</th><th scope="col">Ce qu'il veut</th><th scope="col">Il…</th></tr></thead>
          <tbody>${scenes.map(x => {
            const cle = `${x.e.id}:${x.k}`, a = note[cle] || {};
            const bouton = (s, l, titre) => `<button type="button" class="arc-sens ${a.s === s ? 'actif' : ''}" aria-pressed="${a.s === s}" title="${titre}" onclick="Arcs.noter('${cle}', 's', ${s})">${l}</button>`;
            return `<tr><td>${Ecriture._lien(esc(Ecriture._code(x.e)), 'ouvrirEpisode', x.e.id)} · sc. ${x.k + 1}<br><small class="an-note vo-brut">${esc(x.lieu || '')}</small></td>
              <td><input type="text" maxlength="120" aria-label="Ce que veut ${esc(nom)}" value="${esc(a.v || '')}" placeholder="${esc(avant?.v || 'ce qu\'il veut ici')}" onchange="Arcs.noter('${cle}', 'v', this.value)"></td>
              <td class="arc-boutons">${bouton(1, '▲', 'avance')}${bouton(0, '●', 'piétine')}${bouton(-1, '▼', 'recule')}</td></tr>`;
          }).join('')}</tbody>
        </table></div>
      </section>
    `;
  },

  noter(cle, champ, valeur) {
    const note = this._note(this.perso);
    note[cle] = { ...(note[cle] || {}), [champ]: champ === 's' ? Number(valeur) : String(valeur).slice(0, 120) };
    Ecriture.noterPlusTard(`arc:${this.perso}`, JSON.stringify(note));
    this.rendre();
  },
};

// ─── Continuité ────────────────────────────────────────────────────────────

const Continuite = {
  data: null,

  async ouvrir() {
    this.data = await api.get('ecriture_continuite');
    this.rendre();
  },

  rendre() {
    const slot = Atelier.slot();
    if (!slot || !this.data) return;
    const types = [...new Set(this.data.alertes.map(a => a.type))];
    const morts = this.data.morts || {};
    const ep = id => Ecriture.ordre[Ecriture.rang.get(Number(id))];
    slot.innerHTML = `
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Continuité</h2><span class="an-note">${this.data.alertes.length} point(s) à vérifier</span></div>
        <p class="an-note">L'app compare le texte et les fiches : un nom écrit de deux façons, un personnage mort qui reparle, un âge qui ne colle pas avec les dates, une date qui recule sans flashback. Un point écarté ne revient plus.</p>
      </section>
      ${types.map(t => `<section class="an-carte"><h2 class="an-titre">${esc(t)}</h2><ul class="ec-liste">${this.data.alertes.filter(a => a.type === t).map(a => {
        const e = a.episode ? ep(a.episode) : null;
        return `<li><span class="vo-brut">${esc(a.texte)}${e ? ` <span class="an-note">(${esc(Ecriture._code(e))})</span>` : ''}</span><span class="an-ligne">${e ? Ecriture._lien('Ouvrir', 'ouvrirEpisode', e.id) : ''}<button type="button" class="ec-lien" onclick="Continuite.ecarter(${esc(JSON.stringify(a.cle))})">Écarter</button></span></li>`;
      }).join('')}</ul></section>`).join('') || '<section class="an-carte"><p class="an-note">Rien à signaler.</p></section>'}
      <section class="an-carte">
        <h2 class="an-titre">Morts</h2>
        <p class="an-note">Indique quand un personnage meurt : l'app signalera s'il reparle après, hors flashback.</p>
        <ul class="ec-liste">${Object.entries(morts).map(([n, id]) => `<li><span class="vo-brut">${esc(n)} · ${esc(ep(id) ? Ecriture._code(ep(id)) : '?')}</span><button type="button" class="ec-lien" onclick="Continuite.mort(${esc(JSON.stringify(n))}, '')">Retirer</button></li>`).join('') || '<li class="an-note">Personne pour l\'instant.</li>'}</ul>
        <div class="an-ligne">
          <select id="ct-perso" aria-label="Personnage">${this.data.personnages.slice(0, 200).map(n => `<option>${esc(n)}</option>`).join('')}</select>
          <select id="ct-ep" aria-label="Épisode de la mort">${Ecriture.ordre.map(e => `<option value="${e.id}">${esc(Ecriture._code(e))} ${esc(e.t || '')}</option>`).join('')}</select>
          <button type="button" class="btn btn-secondary btn-sm" onclick="Continuite.mort(document.getElementById('ct-perso').value, document.getElementById('ct-ep').value)">Marquer mort ici</button>
        </div>
      </section>
    `;
  },

  async ecarter(cle) {
    const liste = (() => { try { const v = JSON.parse(Ecriture.notes['continuite-ignores'] || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } })();
    liste.push(cle);
    await Ecriture.note('continuite-ignores', JSON.stringify(liste));
    await this.ouvrir();
  },

  async mort(nom, id) {
    const morts = objetNote(Ecriture.notes['continuite-morts']);
    if (id) morts[nom] = Number(id);
    else delete morts[nom];
    await Ecriture.note('continuite-morts', JSON.stringify(morts));
    await this.ouvrir();
  },
};

// ─── Budget approximatif d'un film ─────────────────────────────────────────

const BUDGET_DEFAUT = {
  long: { equipe: 12000, materiel: 3000, cachet: 450, decor: 1500, nuit: 25, post: 90000, imprevus: 10 },
  court: { equipe: 2500, materiel: 800, cachet: 150, decor: 300, nuit: 20, post: 6000, imprevus: 10 },
};

const Budget = {
  _taux() {
    const base = BUDGET_DEFAUT[Roman.forme === 'court' ? 'court' : 'long'];
    const n = objetNote(Ecriture.notes.budget);
    return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Number.isFinite(Number(n[k])) && n[k] !== '' ? Math.max(0, Number(n[k])) : v]));
  },

  async rendre() {
    const slot = Atelier.slot();
    if (!slot) return;
    if (!Ecriture.film) Ecriture.film = await api.get('ecriture_film');
    if (!Ecriture.film.length) { slot.innerHTML = '<section class="an-carte"><p class="an-note">Importe d\'abord le scénario.</p></section>'; return; }
    const t = this._taux();
    const { jours } = Ecriture._joursTravail();
    const comediens = jours.reduce((s, j) => s + new Set(j.blocs.flatMap(b => [...b.g.persos])).size, 0);
    const decors = jours.reduce((s, j) => s + new Set(j.blocs.map(b => b.g.decor)).size, 0);
    const nuits = jours.filter(j => j.moment === 'NUIT').length;
    const lignes = [
      ['Équipe technique', `${jours.length} jour(s) × ${t.equipe.toLocaleString('fr-FR')} €`, jours.length * t.equipe],
      ['Matériel (caméra, lumière, son)', `${jours.length} jour(s) × ${t.materiel.toLocaleString('fr-FR')} €`, jours.length * t.materiel],
      ['Comédiens', `${comediens} cachet(s) × ${t.cachet.toLocaleString('fr-FR')} €`, comediens * t.cachet],
      ['Décors', `${decors} décor-jour(s) × ${t.decor.toLocaleString('fr-FR')} €`, decors * t.decor],
      ['Majoration de nuit', `${nuits} nuit(s) × ${t.nuit} % de l'équipe`, nuits * t.equipe * t.nuit / 100],
      ['Post-production', 'forfait', t.post],
    ];
    const sous = lignes.reduce((s, l) => s + l[2], 0);
    const imprevus = sous * t.imprevus / 100;
    const eur = v => `${Math.round(v).toLocaleString('fr-FR')} €`;
    const champ = (k, l, unite) => `<label class="mep-champ"><span class="an-label">${l}</span><input type="number" min="0" step="any" value="${t[k]}" onchange="Budget.regler('${k}', this.value)"><small class="an-note">${unite}</small></label>`;
    slot.innerHTML = `
      <div class="ec-dep-grille">
        <section class="an-carte">
          <div class="an-entete"><h2 class="an-titre">Ordre de grandeur</h2><strong>${eur(sous + imprevus)}</strong></div>
          <div class="an-table"><table>
            <tbody>${lignes.map(([l, d, v]) => `<tr><td>${l}</td><td class="an-note">${d}</td><td>${eur(v)}</td></tr>`).join('')}
              <tr><td>Imprévus</td><td class="an-note">${t.imprevus} %</td><td>${eur(imprevus)}</td></tr></tbody>
          </table></div>
          <p class="an-note">Tiré du plan de travail : ${jours.length} jour(s) de tournage, ${nuits} de nuit. C'est un ordre de grandeur pour situer le projet, pas un devis : les taux se règlent à côté, à voir avec ta production.</p>
        </section>
        <section class="an-carte">
          <h2 class="an-titre">Taux</h2>
          <div class="mep-grille">
            ${champ('equipe', 'Équipe par jour', '€')}${champ('materiel', 'Matériel par jour', '€')}${champ('cachet', 'Cachet d\'un comédien par jour', '€')}
            ${champ('decor', 'Décor par jour', '€')}${champ('nuit', 'Majoration de nuit', '% de l\'équipe')}${champ('post', 'Post-production', '€, forfait')}${champ('imprevus', 'Imprévus', '%')}
          </div>
          <button type="button" class="ec-lien" onclick="Budget.defaut()">Revenir aux taux par défaut</button>
        </section>
      </div>
    `;
  },

  regler(k, v) {
    const n = objetNote(Ecriture.notes.budget);
    n[k] = Math.max(0, Number(v) || 0);
    Ecriture.noterPlusTard('budget', JSON.stringify(n));
    this.rendre();
  },

  defaut() {
    Ecriture.noterPlusTard('budget', '');
    Ecriture.notes.budget = '';
    this.rendre();
  },
};
