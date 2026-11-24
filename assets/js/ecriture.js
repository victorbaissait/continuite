// assets/js/ecriture.js — Aide à l'écriture : la série entière ou un épisode à écrire
'use strict';

// Les familles de vues d'Écriture : où ranger chaque vue, pour que la barre ne devienne pas un fourre-tout
const VUE_FAMILLES = [
  ['Écrire', ['reprendre', 'preparer', 'sequencier', 'liege', 'brouillon', 'plan', 'objectifs', 'annee', 'campagne', 'spot']],
  ['L\'histoire', ['persos', 'relations', 'arcs', 'continuite', 'memoire', 'fils', 'pov', 'temps', 'actes', 'sequences', 'parActe', 'planches', 'decoupage', 'cheminfer', 'presence', 'distribution', 'carte', 'enigmes', 'dialogues', 'inventaire', 'structure']],
  ['Relire', ['arevoir', 'repetitions', 'lecture', 'versions', 'gags', 'rythme', 'fins', 'sens', 'portraits', 'bulles', 'tourne', 'parole', 'didascalies', 'accroches', 'lisibilite', 'style', 'retrouver']],
  ['Produire', ['depouillement', 'storyboard', 'production', 'travail', 'tournage', 'revisions', 'budget', 'conduite', 'export']],
];

const ECRITURE_VUES = {
  serie: [['reprendre', 'Reprendre'], ['persos', 'Personnages'], ['relations', 'Relations'], ['memoire', 'Mémoire'], ['arevoir', 'À revoir'], ['repetitions', 'Répétitions'], ['plan', 'Plan'], ['depouillement', 'Dépouillement'], ['objectifs', 'Objectifs'], ['annee', 'Ton année'], ['accroches', 'Ouvertures et fins'], ['lisibilite', 'Lisibilité'], ['style', 'Feuille de style'], ['export', 'Exporter'], ['retrouver', 'Retrouver']],
  get saison() { return this.serie; },
  get selection() { return this.serie; },
  episode: [['preparer', 'Préparer'], ['sequencier', 'Séquencier'], ['liege', 'Tableau de liège'], ['brouillon', 'Brouillon'], ['lecture', 'Lecture à la table'], ['versions', 'Versions'], ['structure', 'Structure'], ['gags', 'Gags par page'], ['memoire', 'Mémoire'], ['retrouver', 'Retrouver']],
};
const ECRITURE_ETAT_KEY = 'lemenu_ecriture';
const ECRITURE_CHECKLIST = ['Une envie claire pour chaque personnage', 'Un enjeu qui monte dans chaque scène', 'Un rappel d\'un gag ou d\'un épisode passé', 'Une fin qui ouvre sur la suite'];

const Ecriture = {
  d: null,
  x: null,
  notes: {},
  promesses: [],
  gags: [],
  fiches: new Map(),
  portee: 'serie',
  vue: 'reprendre',
  _ouvert: false,
  pop: null,
  vueDe: {},
  porteeSerie: 'serie',
  memQ: '',
  memFiltre: 'tout',
  memEdit: null,
  planSaison: 0,
  dep: null,
  roman: null,
  depId: 0,
  depTous: false,
  epId: 0,
  saison: 0,
  selection: new Set(),
  choixQ: '',
  choixOuvertes: new Set(),
  planFiltre: 'aecrire',
  _notesAttente: {},
  perso: '',
  persosQ: '',
  seuilAbsence: 10,
  relNombre: 8,
  relSaison: 0,
  relPaire: '',
  echoQ: '',
  echoFiltre: 'tous',
  echoMin: 8,
  echoLongueur: 3,
  repSeuil: 5,
  repOuverte: '',
  rq: '',
  rPerso: '',
  rSaison: 0,
  rLieu: '',
  rAction: false,
  _attente: null,
  rechQ: '',
  rechR: '',
  rechCasse: false,
  rechMot: false,
  _sceneTiree: null,

  async init() {
    this._lireEtat();
    const tab = document.getElementById('tab-ecriture');
    tab.innerHTML = `
      <div class="section-header"><div class="section-title">✎ Écriture</div><div class="ec-barre" id="ec-barre"></div></div>
      <div class="ec-page">
        <nav class="an-vues" id="ec-vues" aria-label="Vues d'écriture"></nav>
        <div class="an-vue" id="ec-vue"><p class="an-note">Lecture des scripts…</p></div>
      </div>
    `;
    const [data, x, notes, promesses, gags, episodes, personnages] = await Promise.all([
      api.get('analyse_data'), api.get('ecriture_data'), api.get('analyse_notes'),
      api.get('promesses').catch(() => []), api.get('ecriture_gags'), api.get('episodes'), DataStore.get('personnages'),
    ]);
    this.personnages = personnages || [];
    this._noms = null;
    this._modele = null;
    this.d = AnalyseCalcul.preparer(data);
    this.x = x;
    this.notes = notes || {};
    this.promesses = promesses || [];
    this.gags = gags || [];
    this.fiches = new Map(episodes.map(e => [Number(e.id), e]));
    this.ordre = this.d.eps;
    this.rang = new Map(this.ordre.map((e, i) => [e.id, i]));
    if (!this.ordre.length) {
      this.d = null;
      document.getElementById('ec-vue').innerHTML = '<section class="an-carte"><p class="an-note">Aucun épisode pour l\'instant. Ajoute le premier dans l\'onglet Épisodes.</p></section>';
      return;
    }
    this.ordre.forEach(e => {
      e._noms = new Map(e.pr.map(l => [this.d.persos[l[0]].n, l[1]]));
      e._scenes = e.sc.map(s => new Set(s[3].map(i => this.d.persos[i].n)));
    });
    if (!this.rang.has(this.epId)) this.epId = (this.ordre.find(e => !e.x) || this.ordre[this.ordre.length - 1]).id;
    if (!this.d.saisons.some(s => s.n === this.saison)) this.saison = this.ordre.filter(e => e.x).pop()?.sa || this.d.saisons[0]?.n || 0;
    this.selection = new Set([...this.selection].filter(id => this.rang.has(id)));
    // À l'ouverture de l'app, on repart de Reprendre ; les retours sur l'onglet gardent la vue en cours
    if (!this._ouvert) {
      this._ouvert = true;
      this.epId = this._epReprise().id;
      if (Interface.vuesEcritureVisibles('serie').some(([k]) => k === 'reprendre')) {
        this.portee = this.portee === 'episode' ? 'serie' : this.portee;
        this.vue = 'reprendre';
      }
      document.addEventListener('mousedown', event => {
        if (this.pop && !event.target.closest('#ec-pop, #ec-portee-btn')) this.fermerPortee();
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && this.pop) this.fermerPortee(true);
      });
    }
    this.rendre();
  },

  _lireEtat() {
    try {
      const e = JSON.parse(localStorage.getItem(cleProjet(ECRITURE_ETAT_KEY)) || '{}');
      if (ECRITURE_VUES[e.portee]) this.portee = e.portee;
      if (ECRITURE_VUES[this.portee].some(([k]) => k === e.vue)) this.vue = e.vue;
      else this.vue = ECRITURE_VUES[this.portee][0][0];
      if (e.epId) this.epId = e.epId;
      if (e.saison) this.saison = e.saison;
      if (e.vueDe) this.vueDe = e.vueDe;
      if (e.porteeSerie && e.porteeSerie !== 'episode' && ECRITURE_VUES[e.porteeSerie]) this.porteeSerie = e.porteeSerie;
      if (Array.isArray(e.selection)) this.selection = new Set(e.selection);
    } catch (e) {}
  },

  _garderEtat() {
    try { localStorage.setItem(cleProjet(ECRITURE_ETAT_KEY), JSON.stringify({ portee: this.portee, vue: this.vue, epId: this.epId, saison: this.saison, selection: [...this.selection], vueDe: this.vueDe, porteeSerie: this.porteeSerie })); } catch (e) {}
  },

  // ─── Outils ──────────────────────────────────────────────────────────────

  _code: e => `S${e.sa}E${String(e.n).padStart(2, '0')}`,
  _plat: t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),

  _lien(label, action, valeur = '', classe = '') {
    return `<button type="button" class="ec-lien ${classe}" data-a="${esc(action)}" data-v="${esc(valeur)}" onclick="Ecriture.agir(this)">${label}</button>`;
  },

  _nombre(id, label, cle) {
    return `<label class="an-label" for="${id}">${label}</label><input id="${id}" class="an-nombre" type="number" min="0" value="${this[cle] || ''}" placeholder="—" oninput="Ecriture.regler('${cle}', Number(this.value) || 0, '${id}')">`;
  },

  _choix(id, label, cle, options) {
    return `<label class="an-label" for="${id}">${label}</label><select id="${id}" onchange="Ecriture.regler('${cle}', this.value)">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(this[cle]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  },

  regler(cle, valeur, champId) {
    this[cle] = valeur;
    const champ = champId ? document.getElementById(champId) : null;
    this.rendreVue();
    const recree = champId ? document.getElementById(champId) : null;
    if (champ && recree && champ !== recree) {
      recree.replaceWith(champ);
      champ.focus();
    }
  },

  agir(el) {
    const { a, v } = el.dataset;
    this[a](v);
  },

  // Ouvre directement le brouillon d'un épisode, à la ligne d'un commentaire si on la donne (« id » ou « id:ligne »)
  ouvrirBrouillon(valeur) {
    const [id, ligne] = String(valeur).split(':');
    this.epId = Number(id);
    this.portee = 'episode';
    this.vue = 'brouillon';
    this.rendre();
    if (ligne !== undefined && Number(ligne) >= 0) setTimeout(() => this._defiler?.(Number(ligne)), 300);
  },

  // ─── À revoir : tous les commentaires laissés dans les brouillons de la série, en une liste ───

  _tousCommentaires() {
    const ids = new Set(this.ensemble().map(e => e.id));
    return this.ordre.filter(e => ids.has(e.id)).flatMap(e => {
      let liste = [];
      try { liste = JSON.parse(this.notes[`commentaires:${e.id}`] || '[]'); } catch (x) { liste = []; }
      const lignes = String(this.notes[`brouillon:${e.id}`] || '').split('\n');
      return (Array.isArray(liste) ? liste : []).map((c, rang) => {
        // Le commentaire suit sa ligne par son contenu, comme dans le brouillon
        const places = lignes.map((l, i) => (l.trim() === c.a ? i : -1)).filter(i => i >= 0).sort((a, b) => Math.abs(a - c.n) - Math.abs(b - c.n));
        return { e, rang, t: String(c.t || ''), a: String(c.a || ''), ligne: places.length ? places[0] : -1 };
      });
    });
  },

  // ─── Le projet en un coup d'œil (sous « Reprendre ») : fils ouverts, commentaires, sauvegarde, lecteurs ───

  _htmlAccueil() {
    if (!this._accueil || Date.now() - this._accueilLu > 60000) this._chargerAccueil();
    const a = this._accueil;
    if (!a) return '';
    const jour = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    const jours = d => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    const revoir = this._tousCommentaires().length;
    const stat = (l, v, action = '', orange = false, titre = '') => `<div class="ec-rep-stat"${titre ? ` title="${esc(titre)}"` : ''}><span class="an-note">${action ? this._lien(l, 'aller', action) : l}</span><strong ${orange ? 'class="ec-orange"' : ''}>${v}</strong></div>`;
    const sauvegarde = a.sauvegarde === undefined ? '' : a.sauvegarde
      ? stat('Dernière sauvegarde', esc(jour(a.sauvegarde)), '', jours(a.sauvegarde) > 7, 'Config → App de bureau')
      : stat('Dernière sauvegarde', 'jamais', '', true, 'Config → App de bureau : choisis un dossier de sauvegarde');
    return `<div class="ec-rep-stats" aria-label="Le projet en un coup d'œil">
        ${stat('Fils ouverts', Analyse._fr(a.fils), '', false, 'Promesses narratives encore ouvertes (Thèmes)')}
        ${stat('Commentaires à revoir', Analyse._fr(revoir), 'arevoir', revoir > 0)}
        ${sauvegarde}
        ${stat('Dernier envoi aux lecteurs', a.envoi ? `${esc(jour(a.envoi.date))} <small>${esc(a.envoi.nom)}</small>` : 'aucun', '', false, 'Onglet Lecteurs')}
      </div>`;
  },

  async _chargerAccueil() {
    this._accueilLu = Date.now();
    const [promesses, lecteurs, sauvegarde] = await Promise.all([
      api.get('promesses').catch(() => []),
      api.get('lecteurs').catch(() => []),
      window.bureau?.sauvegarde ? window.bureau.sauvegarde('lire').catch(() => null) : Promise.resolve(undefined),
    ]);
    const envois = (Array.isArray(lecteurs) ? lecteurs : []).filter(l => l.dernier_envoi).sort((x, y) => String(y.dernier_envoi).localeCompare(String(x.dernier_envoi)));
    this._accueil = {
      fils: (Array.isArray(promesses) ? promesses : []).filter(p => p.statut === 'ouverte').length,
      envoi: envois[0] ? { date: envois[0].dernier_envoi, nom: envois[0].nom } : null,
      sauvegarde: sauvegarde === undefined ? undefined : (sauvegarde && sauvegarde.resultat && sauvegarde.resultat.ok ? sauvegarde.resultat.date : (sauvegarde && sauvegarde.derniere) || null),
    };
    if (this.vue === 'reprendre' && this.d && document.getElementById('ec-barre')) this.rendreVue();
  },

  vueARevoir() {
    const tous = this._tousCommentaires();
    const q = this._plat(this.revoirQ || '');
    const liste = q ? tous.filter(c => this._plat(`${c.t} ${c.a} ${this._code(c.e)} ${c.e.t}`).includes(q)) : tous;
    const episodes = [...new Set(liste.map(c => c.e))];
    return `
      <div class="an-ligne">
        <input id="ec-revoir-q" class="an-recherche" type="text" aria-label="Chercher dans les commentaires" placeholder="Chercher dans les commentaires…" value="${esc(this.revoirQ || '')}" oninput="Ecriture.regler('revoirQ', this.value, 'ec-revoir-q')">
        <span class="an-note">${tous.length} commentaire(s) à revoir dans ${new Set(tous.map(c => c.e.id)).size} épisode(s). On les laisse dans le brouillon (bouton « Sur cette ligne ») ; « Fait » les retire.</span>
      </div>
      ${episodes.length ? episodes.map(e => `
        <section class="an-carte">
          <div class="an-entete"><h2 class="an-titre">${esc(this._code(e))} — ${esc(e.t || 'Sans titre')}</h2>${this._lien('Ouvrir le brouillon', 'ouvrirBrouillon', e.id)}</div>
          <ul class="ec-liste ec-revoir">${liste.filter(c => c.e === e).map(c => `<li>
            <span><strong>${esc(c.t)}</strong>${c.a ? `<br><span class="an-note vo-brut">${c.ligne < 0 ? '(ligne disparue) ' : `ligne ${c.ligne + 1} · `}${esc(c.a.slice(0, 140))}</span>` : ''}</span>
            <span class="ec-mem-actions">${this._lien('Aller à la ligne', 'ouvrirBrouillon', `${e.id}:${c.ligne}`)}${this._lien('Fait', 'commentaireFait', `${e.id}:${c.rang}`)}</span>
          </li>`).join('')}</ul>
        </section>`).join('') : `<section class="an-carte"><p class="an-note">${tous.length ? 'Aucun commentaire ne correspond.' : 'Rien à revoir : aucun commentaire dans les brouillons de cette sélection. Dans un brouillon, place le curseur sur une ligne et ajoute un commentaire « À revoir ».'}</p></section>`}
    `;
  },

  async commentaireFait(valeur) {
    const [id, rang] = String(valeur).split(':').map(Number);
    let liste = [];
    try { liste = JSON.parse(this.notes[`commentaires:${id}`] || '[]'); } catch (x) { liste = []; }
    if (!liste[rang]) return;
    liste.splice(rang, 1);
    await this.note(`commentaires:${id}`, liste.length ? JSON.stringify(liste) : '');
    this.rendreVue();
  },

  ouvrirEpisode(id) {
    this.epId = Number(id);
    this.portee = 'episode';
    this.vue = 'preparer';
    this.rendre();
  },

  async ouvrirScene(valeur) {
    const [ep, sc] = valeur.split(':');
    const s = await api.get(`ecriture_scene&episode=${ep}&scene=${sc}`);
    this._sceneLue = s.lignes;
    modal.open(`
      <h2 class="an-titre">S${s.sa}E${String(s.n).padStart(2, '0')} — ${esc(s.t)}</h2>
      <p class="an-label">${esc(s.slug)}</p>
      <div class="an-ligne">
        <button type="button" class="btn btn-secondary btn-sm" onclick="Ecriture.lire(Ecriture._sceneLue)">▶ Lire la scène</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="Ecriture.arreterLecture()">Arrêter</button>
      </div>
      <div class="ec-script">${s.lignes.map(l => (l.qui ? `<p class="ec-replique"><strong>${esc(l.qui)}</strong>${esc(l.texte)}</p>` : `<p class="an-note">${esc(l.texte)}</p>`)).join('')}</div>
    `);
  },

  async note(cle, valeur) {
    if (valeur === '' || valeur === null) delete this.notes[cle];
    else this.notes[cle] = valeur;
    await api.put('analyse_notes', { cle, valeur });
  },

  // ─── Calculs : tout se lit à partir d'une position dans la série ─────────

  // Les épisodes couverts par la portée choisie
  ensemble() {
    if (this.portee === 'saison') return this.ordre.filter(e => e.sa === this.saison);
    if (this.portee === 'selection') return this.ordre.filter(e => this.selection.has(e.id));
    return this.ordre;
  },

  // Épisodes écrits avant le point de travail
  ecritsAvant() {
    if (this.portee === 'episode') return this.ordre.slice(0, this.rang.get(this.epId)).filter(e => e.x);
    return this.ensemble().filter(e => e.x);
  },

  // Une répétition compte si les deux épisodes sont dans la portée
  repetitions() {
    const ids = new Set(this.ensemble().map(e => e.id));
    return this.x.repetitions.filter(r => ids.has(r.a) && ids.has(r.b));
  },

  absences(avant) {
    const vus = new Map();
    avant.forEach((e, i) => {
      e.pr.forEach(([pi, r, present]) => {
        const p = this.d.persos[pi];
        if (p.g === 'x' || !(r || present)) return;
        const v = vus.get(p.n) || { nom: p.n, g: p.g, eps: 0, repliques: 0, dernier: i };
        v.eps++;
        v.repliques += r;
        v.dernier = i;
        vus.set(p.n, v);
      });
    });
    return [...vus.values()].map(v => ({ ...v, ecart: avant.length - 1 - v.dernier, ep: avant[v.dernier] }))
      .sort((a, b) => b.ecart - a.ecart);
  },

  duos(avant) {
    const noms = new Set(this.absences(avant).filter(p => p.g === 'p' || (p.g === 'r' && p.eps >= 5)).map(p => p.nom));
    const paires = new Map();
    avant.forEach((e, i) => {
      for (const cle in this.x.eps[e.id]?.ech || {}) {
        const [a, b] = cle.split('|');
        if (!noms.has(a) || !noms.has(b)) continue;
        const v = paires.get(cle) || { a, b, cle, n: 0, eps: 0, dernier: i };
        v.n += this.x.eps[e.id].ech[cle];
        v.eps++;
        v.dernier = i;
        paires.set(cle, v);
      }
    });
    return [...paires.values()].filter(p => p.n >= 10)
      .map(p => ({ ...p, ecart: avant.length - 1 - p.dernier, ep: avant[p.dernier] })).sort((a, b) => b.ecart - a.ecart);
  },

  decors(avant) {
    return this.d.lieux.map(l => {
      let dernier = -1, nb = 0;
      avant.forEach((e, i) => {
        const v = e.li[l.id];
        if (v && (v[0] === 1 || v[1] > 0)) { dernier = i; nb++; }
      });
      return { nom: l.n, nb, ecart: avant.length - 1 - dernier, ep: avant[dernier] };
    }).filter(l => l.nb >= 2).sort((a, b) => b.ecart - a.ecart);
  },

  // Mots rares très concentrés dans le temps, puis disparus : des sujets peut-être abandonnés
  sujets(avant) {
    const prenoms = new Set(this.d.persos.flatMap(p => this._plat(p.n).split(/\s+/)));
    const vus = new Map();
    avant.forEach((e, i) => {
      for (let k = 0; k < e.w.length; k += 2) {
        const v = vus.get(e.w[k]) || { i: e.w[k], n: 0, eps: 0, premier: i, dernier: i };
        v.n += e.w[k + 1];
        v.eps++;
        v.dernier = i;
        vus.set(e.w[k], v);
      }
    });
    return [...vus.values()].filter(v => {
      const mot = this.d.vocab[v.i];
      return v.eps >= 2 && v.eps <= 12 && v.n >= 6 && mot.length >= 5 && !prenoms.has(mot) && !this.d.verbesSet.has(v.i)
        && v.dernier - v.premier <= 30 && avant.length - 1 - v.dernier >= 15;
    }).sort((a, b) => b.n - a.n).slice(0, 40)
      .map(v => ({ mot: this.d.accents[v.i] || this.d.vocab[v.i], n: v.n, eps: v.eps, debut: avant[v.premier], fin: avant[v.dernier] }));
  },

  // Rythme de chaque phrase qui revient, par rapport aux derniers épisodes écrits
  echos(avant) {
    const position = new Map(avant.map((e, i) => [e.id, i]));
    const suivis = new Map(this.gags.map(g => [this._plat(g.t), g]));
    const liste = this.x.echos.map(e => ({ ...e, statut: suivis.get(this._plat(e.t))?.statut || '' }));
    this.gags.forEach(g => {
      if (!liste.some(e => this._plat(e.t) === this._plat(g.t))) liste.push({ t: g.t, eps: g.eps, n: g.n, qui: [], statut: g.statut });
    });
    return liste.map(e => {
      const rangs = e.eps.map(id => position.get(id)).filter(v => v !== undefined).sort((a, b) => a - b);
      const dernier = rangs.length ? rangs[rangs.length - 1] : -1;
      const recents = rangs.filter(r => r >= avant.length - 20).length;
      return {
        ...e, nb: rangs.length, recents, ecart: dernier < 0 ? null : avant.length - 1 - dernier,
        premier: avant[rangs[0]], dernier: avant[dernier], use: recents >= 5, dormant: rangs.length >= 5 && avant.length - 1 - dernier >= 40,
      };
    }).filter(e => e.nb || e.statut);
  },

  moyennes(eps) {
    const nb = eps.length || 1;
    const somme = f => eps.reduce((a, e) => a + f(e), 0);
    const mots = somme(e => e.m), ouv = eps.filter(e => this.x.eps[e.id]?.ouv != null);
    return {
      mots: Math.round(mots / nb), repliques: Math.round(somme(e => e.r) / nb), scenes: Math.round((somme(e => e.sc.length) / nb) * 10) / 10,
      motsScene: Math.round(mots / (somme(e => e.sc.length) || 1)),
      ouverture: ouv.length ? Math.round(ouv.reduce((a, e) => a + this.x.eps[e.id].ouv, 0) / ouv.length) : null,
    };
  },

  // ─── Cadre ───────────────────────────────────────────────────────────────

  rendre() {
    if (!this.d) return;
    this.pop = null;
    const modes = [['serie', { roman: 'Roman', film: 'Film', bd: Roman.plusieurs ? 'Série' : 'Album', theatre: 'Pièce', pub: 'Campagne', jeu: 'Jeu' }[Roman.type] || 'Série'], ['episode', 'Épisode']];
    const mode = this.portee === 'episode' ? 'episode' : 'serie';
    document.getElementById('ec-barre').innerHTML = `
      <div class="ec-modes" role="group" aria-label="Sur quoi tu travailles">${modes.map(([k, l]) => `<button type="button" id="ec-mode-${k}" class="ec-mode ${k === mode ? 'actif' : ''}" aria-pressed="${k === mode}" onclick="Ecriture.setMode('${k}')">${l}</button>`).join('')}</div>
      ${mode === 'episode' ? this._choixEpisode() : this._choixRegarder()}
      <section id="ec-pop" class="ec-pop" role="dialog" aria-label="Choisir les épisodes" hidden></section>
    `;
    this.rendreVue();
  },

  _choixEpisode() {
    const rang = this.rang.get(this.epId);
    const saisons = [...new Set(this.ordre.map(e => e.sa))];
    return `
      <div class="ec-nav-ep">
        <button type="button" id="ec-ep-prec" class="ec-nav-fleche" aria-label="Épisode précédent" ${rang > 0 ? '' : 'disabled'} onclick="Ecriture.episodeVoisin(-1)">‹</button>
        <select id="ec-ep" aria-label="Choisir l'épisode" onchange="Ecriture.choisirEp(this.value)">${saisons.map(n => `<optgroup label="Saison ${n}">${this.ordre.filter(e => e.sa === n).map(e => `<option value="${e.id}" ${e.id === this.epId ? 'selected' : ''}>${esc(this._code(e))}${e.t ? ` ${esc(e.t)}` : ''}${e.x ? '' : ' ✎'}</option>`).join('')}</optgroup>`).join('')}</select>
        <button type="button" id="ec-ep-suiv" class="ec-nav-fleche" aria-label="Épisode suivant" ${rang < this.ordre.length - 1 ? '' : 'disabled'} onclick="Ecriture.episodeVoisin(1)">›</button>
      </div>
    `;
  },

  _valeurRegarder() {
    return this.portee === 'saison' ? `saison:${this.saison}` : this.portee;
  },

  _choixRegarder() {
    const valeur = this._valeurRegarder();
    const saisons = this.d.saisons.filter(s => this.ordre.some(e => e.sa === s.n));
    const roman = (Roman.actif || Roman.bd) && !Roman.plusieurs;
    const tout = { theatre: 'toute la pièce', pub: 'toutes les campagnes', jeu: 'tout le jeu' }[Roman.type];
    const options = [['serie', tout || (Roman.film ? 'tout le film' : roman ? (Roman.bd ? 'tout l\'album' : 'tout le roman') : 'toute la série')], ...(roman || Roman.film ? [] : saisons.map(s => [`saison:${s.n}`, `la saison ${s.n}`])), ['selection', this.selection.size ? `certains épisodes (${this.selection.size})` : 'certains épisodes…']];
    return `
      <label class="ec-regarder">Regarder
        <select id="ec-regarder" onchange="Ecriture.setRegarder(this.value)">${options.map(([v, l]) => `<option value="${v}" ${v === valeur ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </label>
      ${this.portee === 'selection' ? '<button type="button" id="ec-portee-btn" class="btn btn-secondary btn-sm" aria-haspopup="dialog" aria-expanded="false" onclick="Ecriture.basculerPortee()">Modifier</button>' : ''}
    `;
  },

  setPortee(portee) {
    this.portee = portee;
    if (!ECRITURE_VUES[portee].some(([k]) => k === this.vue)) this.vue = ECRITURE_VUES[portee][0][0];
    this.rendre();
  },

  // Chaque onglet retrouve la vue et le choix laissés en le quittant
  setMode(mode) {
    if (mode === (this.portee === 'episode' ? 'episode' : 'serie')) return;
    const serie = this.porteeSerie === 'selection' && !this.selection.size ? 'serie' : this.porteeSerie;
    this.portee = mode === 'episode' ? 'episode' : serie;
    this.vue = this.vueDe[mode] || ECRITURE_VUES[this.portee][0][0];
    this.rendre();
    document.getElementById(`ec-mode-${mode}`)?.focus();
  },

  setRegarder(valeur) {
    if (valeur === 'selection') {
      this.ouvrirPortee();
      return;
    }
    if (valeur.startsWith('saison:')) this.saison = Number(valeur.slice(7));
    this.setPortee(valeur === 'serie' ? 'serie' : 'saison');
    document.getElementById('ec-regarder')?.focus();
  },

  choisirEp(id) {
    this.epId = Number(id);
    this.rendre();
    document.getElementById('ec-ep')?.focus();
  },

  episodeVoisin(sens) {
    const e = this.ordre[this.rang.get(this.epId) + sens];
    if (!e) return;
    this.epId = e.id;
    this.rendre();
    const fleche = document.getElementById(sens < 0 ? 'ec-ep-prec' : 'ec-ep-suiv');
    (fleche.disabled ? document.getElementById('ec-ep') : fleche).focus();
  },

  // ─── Certains épisodes : rien ne change avant « Appliquer » ──────────────

  basculerPortee() {
    if (this.pop) this.fermerPortee(true);
    else this.ouvrirPortee();
  },

  ouvrirPortee() {
    this.pop = { selection: new Set(this.selection), q: '' };
    document.getElementById('ec-pop').hidden = false;
    document.getElementById('ec-portee-btn')?.setAttribute('aria-expanded', 'true');
    this._rendrePop();
    document.getElementById('ec-pop-q')?.focus();
  },

  fermerPortee(rendreFocus = false) {
    this.pop = null;
    const fenetre = document.getElementById('ec-pop');
    const liste = document.getElementById('ec-regarder');
    if (fenetre) fenetre.hidden = true;
    if (!liste) return;
    liste.value = this._valeurRegarder();
    document.getElementById('ec-portee-btn')?.setAttribute('aria-expanded', 'false');
    if (rendreFocus) liste.focus();
  },

  _rendrePop() {
    document.getElementById('ec-pop').innerHTML = `
      <div class="ec-pop-detail">
        <div class="an-entete"><h2 class="an-titre">Certains épisodes</h2><span class="an-note" id="ec-choix-compte"></span></div>
        <input id="ec-pop-q" type="text" aria-label="Chercher un épisode" placeholder="Chercher : S9E05, un titre…" oninput="Ecriture.filtrerChoix(this.value)">
        <div class="ec-pop-outils">
          <button type="button" class="ec-lien" onclick="Ecriture.choisirTout(true)">Tout</button>
          <button type="button" class="ec-lien" onclick="Ecriture.choisirEcrits()">Avec script</button>
          <button type="button" class="ec-lien" onclick="Ecriture.choisirTout(false)">Aucun</button>
        </div>
        <div class="ec-choix" id="ec-choix-liste"></div>
      </div>
      <div class="ec-pop-pied">
        <div class="ec-pop-boutons">
          <button type="button" class="btn btn-ghost btn-sm" onclick="Ecriture.fermerPortee(true)">Annuler</button>
          <button type="button" class="btn btn-primary btn-sm" id="ec-pop-ok" onclick="Ecriture.appliquerPortee()">Appliquer</button>
        </div>
      </div>
    `;
    this._rendreChoix();
  },

  appliquerPortee() {
    this.selection = this.pop.selection;
    this.setPortee('selection');
    document.getElementById('ec-regarder')?.focus();
  },

  _rendreChoix() {
    const liste = document.getElementById('ec-choix-liste');
    if (!liste) return;
    const choisis = this.pop.selection;
    const q = this._plat(this.pop.q);
    const garde = e => !q || this._plat(`${this._code(e)} ${e.t}`).includes(q);
    liste.innerHTML = this.d.saisons.map(s => {
      const eps = this.ordre.filter(e => e.sa === s.n && garde(e));
      if (!eps.length) return '';
      const nb = eps.filter(e => choisis.has(e.id)).length;
      const ouverte = q || this.choixOuvertes.has(s.n);
      return `
        <section class="ec-choix-saison">
          <div class="ec-choix-tete">
            <input type="checkbox" aria-label="Saison ${s.n} entière" ${nb === eps.length ? 'checked' : ''} data-partiel="${nb > 0 && nb < eps.length ? 1 : ''}" onchange="Ecriture.choisirSaison(${s.n}, this.checked)">
            <button type="button" class="ec-choix-replier" aria-expanded="${Boolean(ouverte)}" onclick="Ecriture.replierSaison(${s.n})">
              <span>Saison ${s.n}</span><span class="an-note">${nb} / ${eps.length}</span><span aria-hidden="true">${ouverte ? '▾' : '▸'}</span>
            </button>
          </div>
          ${ouverte ? `<div class="ec-choix-eps">${eps.map(e => `
            <label class="ec-choix-ep ${choisis.has(e.id) ? 'actif' : ''}">
              <input type="checkbox" ${choisis.has(e.id) ? 'checked' : ''} onchange="Ecriture.choisirEpisode(${e.id}, this.checked)">
              <span class="ec-choix-code">${esc(this._code(e))}${e.x ? '' : ' ✎'}</span>
              <span class="ec-choix-titre" title="${esc(e.t || 'Sans titre')}">${esc(e.t || 'Sans titre')}</span>
            </label>`).join('')}</div>` : ''}
        </section>
      `;
    }).join('') || '<p class="an-note">Aucun épisode trouvé.</p>';
    liste.querySelectorAll('[data-partiel="1"]').forEach(c => { c.indeterminate = true; });
    document.getElementById('ec-choix-compte').textContent = `${choisis.size} choisi(s)`;
    document.getElementById('ec-pop-ok').disabled = !choisis.size;
  },

  replierSaison(numero) {
    if (this.choixOuvertes.has(numero)) this.choixOuvertes.delete(numero);
    else this.choixOuvertes.add(numero);
    this._rendreChoix();
  },

  filtrerChoix(valeur) {
    this.pop.q = valeur;
    this._rendreChoix();
  },

  choisirEpisode(id, oui) {
    if (oui) this.pop.selection.add(id);
    else this.pop.selection.delete(id);
    this._rendreChoix();
  },

  choisirSaison(numero, oui) {
    const q = this._plat(this.pop.q);
    this.ordre.filter(e => e.sa === numero && (!q || this._plat(`${this._code(e)} ${e.t}`).includes(q)))
      .forEach(e => (oui ? this.pop.selection.add(e.id) : this.pop.selection.delete(e.id)));
    this._rendreChoix();
  },

  choisirTout(oui) {
    this.pop.selection = new Set(oui ? this.ordre.map(e => e.id) : []);
    this._rendreChoix();
  },

  choisirEcrits() {
    this.pop.selection = new Set(this.ordre.filter(e => e.x).map(e => e.id));
    this._rendreChoix();
  },

  aller(vue) {
    this.vue = vue;
    this.rendreVue();
  },

  rendreVue() {
    const nav = document.getElementById('ec-vues');
    const racine = document.getElementById('ec-vue');
    if (!nav || !racine || !this.d) return;
    this.vueDe[this.portee === 'episode' ? 'episode' : 'serie'] = this.vue;
    if (this.portee !== 'episode') this.porteeSerie = this.portee;
    this._garderEtat();
    const visibles = Interface.vuesEcritureVisibles(this.portee);
    if (!visibles.length) {
      nav.innerHTML = '';
      racine.innerHTML = '<section class="an-carte"><p class="an-note">Toutes les vues sont masquées. Tu peux les réafficher dans Config → Interface.</p></section>';
      return;
    }
    if (!visibles.some(([k]) => k === this.vue)) this.vue = visibles[0][0];
    // Les vues rangées par familles (ton ordre est gardé à l'intérieur de chacune) : la barre reste lisible
    const familles = VUE_FAMILLES.map(([nom, cles]) => [nom, visibles.filter(([k]) => cles.includes(k))]);
    const rangees = new Set(familles.flatMap(([, l]) => l.map(([k]) => k)));
    const autres = visibles.filter(([k]) => !rangees.has(k));
    if (autres.length) familles[familles.length - 1][1].push(...autres);
    nav.innerHTML = familles.filter(([, l]) => l.length).map(([nom, l]) => `<span class="ec-famille" role="group" aria-label="${esc(nom)}"><span class="ec-famille-nom" aria-hidden="true">${esc(nom)}</span>${l.map(([k, lib]) => `<button type="button" class="an-vue-btn ${k === this.vue ? 'actif' : ''}" onclick="Ecriture.aller('${k}')">${esc(lib)}</button>`).join('')}</span>`).join('');
    const vues = { reprendre: 'vueReprendre', persos: 'vuePersos', relations: 'vueRelations', memoire: 'vueMemoire', arevoir: 'vueARevoir', repetitions: 'vueRepetitions', retrouver: 'vueRetrouver', preparer: 'vuePreparer', brouillon: 'vueBrouillon', structure: 'vueStructure', plan: 'vuePlan', objectifs: 'vueObjectifs', sequencier: 'vueSequencier', gags: 'vueGags', depouillement: 'vueDepouillement', pov: 'vueRoman', rythme: 'vueRoman', fins: 'vueRoman', temps: 'vueRoman', fils: 'vueRoman', actes: 'vueFilm', sequences: 'vueFilm', parActe: 'vueFilm', planches: 'vueBD', bulles: 'vueBD', tourne: 'vueBD', decoupage: 'vueBD', cheminfer: 'vueBD', storyboard: 'vueStoryboard', production: 'vueProduction', travail: 'vueFilm', revisions: 'vueFilm', export: 'vueExport', style: 'vueStyle', annee: 'vueAnnee', sens: 'vueSens', lisibilite: 'vueLisibilite', portraits: 'vuePortraits', conduite: 'vueConduite', accroches: 'vueAccroches', liege: 'vueLiege', tournage: 'vueTournage', presence: 'vueGenre', distribution: 'vueGenre', parole: 'vueGenre', didascalies: 'vueGenre', campagne: 'vueGenre', spot: 'vueGenre', carte: 'vueGenre', enigmes: 'vueGenre', dialogues: 'vueGenre', inventaire: 'vueGenre', lecture: 'vueAtelier', versions: 'vueAtelier', arcs: 'vueAtelier', continuite: 'vueAtelier', budget: 'vueAtelier' };
    racine.innerHTML = this[vues[this.vue]]();
    if (this.vue === 'persos') this._chargerRepliques();
    if (this.vue === 'relations') this._chargerEchanges();
    if (this.vue === 'preparer') this._chargerPreparer();
    if (this.vue === 'repetitions') this._chargerCommun();
    if (this.vue === 'retrouver') this.chercher();
    if (this.vue === 'brouillon') this._ouvrirBrouillon();
    if (this.vue === 'objectifs') this._majObjectifs();
    if (this.vue === 'gags') this._chargerGags();
    if (this.vue === 'depouillement') this._chargerDepouillement();
    if (['pov', 'rythme', 'fins', 'temps', 'fils'].includes(this.vue)) this._chargerRoman();
    if (this.vue === 'rythme') this._chargerTension();
    if (['actes', 'sequences', 'parActe', 'travail', 'revisions'].includes(this.vue)) this._chargerFilm();
    if (['planches', 'bulles', 'tourne', 'decoupage', 'cheminfer'].includes(this.vue)) this._chargerBD();
    if (this.vue === 'production') this._chargerProduction();
    if (this.vue === 'export') Export.ouvrir();
    if (this.vue === 'style') FeuilleStyle.ouvrir();
    if (this.vue === 'annee') this._chargerAnnee();
    if (this.vue === 'sens') this._chargerSens();
    if (this.vue === 'lisibilite') this._chargerLisibilite();
    if (this.vue === 'portraits') this._chargerPortraits();
    if (this.vue === 'conduite') this._chargerConduite();
    if (this.vue === 'accroches') this._chargerAccroches();
    if (this.vue === 'memoire') this._chargerObjets();
    if (this.vue === 'liege') Liege.ouvrir();
    if (this.vue === 'tournage') Tournage.ouvrir();
    if (['presence', 'distribution', 'parole', 'didascalies', 'campagne', 'spot', 'carte', 'enigmes', 'dialogues', 'inventaire'].includes(this.vue)) Genres.ouvrir();
    if (this.vue !== 'lecture') Lecture.arreter();
    if (['lecture', 'versions', 'arcs', 'continuite', 'budget'].includes(this.vue)) Atelier.ouvrir();
    if (this.vue === 'storyboard') Storyboard.ouvrir(this.ordre[this.rang.get(this.epId)]);
    if (this.vue === 'preparer') this.nouvelleIdee();
  },

  // ─── Reprendre ───────────────────────────────────────────────────────────

  _liste(titre, lignes, vide, action, cible) {
    return `
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">${esc(titre)}</h2>${action ? this._lien('Tout voir →', 'aller', cible) : ''}</div>
        ${lignes.length ? `<ul class="ec-liste">${lignes.join('')}</ul>` : `<p class="an-note">${esc(vide)}</p>`}
      </section>
    `;
  },

  _reprise() {
    try { return JSON.parse(this.notes.reprise || 'null'); } catch (e) { return null; }
  },

  _noterReprise(champ) {
    const avant = champ.value.slice(0, champ.selectionStart);
    this.noterPlusTard('reprise', JSON.stringify({
      id: this.epId, pos: champ.selectionStart, ligne: avant.split('\n').length,
      scene: (avant.match(/^\s*(?:INT|EXT)[.\s]/gim) || []).length, quand: this._jour(),
    }));
  },

  // Le dernier épisode travaillé, sinon le premier qu'il reste à écrire
  _epReprise() {
    const r = this._reprise();
    if (r && this.rang.has(r.id)) return this.ordre[this.rang.get(r.id)];
    return this.ordre.find(e => !e.x) || this.ordre[this.ordre.length - 1];
  },

  _depuis(jour) {
    const n = Math.round((new Date(`${this._jour()}T12:00:00`) - new Date(`${jour}T12:00:00`)) / 86400000);
    return n <= 0 ? "aujourd'hui" : n === 1 ? 'hier' : `il y a ${n} jours`;
  },

  _etapes(e) {
    const a = cle => Boolean(this.notes[`${cle}:${e.id}`]);
    const etapes = [
      ['preparer', 'Préparer', a('ecriture-notes') || a('checklist') || a('rappels')],
      ['sequencier', 'Séquencier', a('sequencier')],
      ['brouillon', 'Brouillon', a('brouillon')],
      ['brouillon', 'Valider', Boolean(e.x)],
    ];
    const courante = etapes.findIndex(x => !x[2]);
    return etapes.map(([vue, l, fait], i) => ({ vue, l, marque: fait ? '✓' : i === courante ? '●' : '○', classe: fait ? 'fait' : i === courante ? 'courant' : '' }));
  },

  allerEtape(vue) {
    this.epId = this._epReprise().id;
    this.portee = 'episode';
    this.vue = vue;
    this.rendre();
  },

  // Rouvre le brouillon, curseur à l'endroit quitté
  continuer() {
    const r = this._reprise();
    this.allerEtape('brouillon');
    const champ = document.getElementById('ec-brouillon');
    if (!champ) return;
    const pos = r && r.id === this.epId ? Math.min(r.pos, champ.value.length) : champ.value.length;
    champ.focus();
    champ.setSelectionRange(pos, pos);
    const lignes = champ.value.split('\n').length;
    champ.scrollTop = Math.max(0, (champ.value.slice(0, pos).split('\n').length / lignes) * champ.scrollHeight - champ.clientHeight / 2);
    this._suivreDefilement();
  },

  _aRappeler(e) {
    const brouillon = this.notes[`brouillon:${e.id}`] || '';
    const code = this._plat(this._code(e));
    const faits = [...this.faitsConcernes(brouillon), ...this._faits().filter(f => this._plat(f.ep || '') === code)].map(f => f.t);
    return [...new Set([...this._rappels(e.id), ...faits])].slice(0, 4);
  },

  vueReprendre() {
    const e = this._epReprise();
    const r = this._reprise();
    const lieu = r && r.id === e.id
      ? `Brouillon · ${r.scene ? `scène ${r.scene}, ` : ''}ligne ${r.ligne} · ${this._depuis(r.quand)}`
      : e.x ? 'Écrit' : 'Pas encore commencé';
    const avant = this.ecritsAvant();
    const m = this.moyennes(avant);
    const note = this.notes[`ecriture-notes:${e.id}`] || '';
    const b = this._bilanObjectifs();
    const pct = b.objectif ? Math.min(100, Math.round((b.aujourdhui * 100) / b.objectif)) : 0;
    const rappels = this._aRappeler(e);
    const ensuite = this.ensemble().filter(x => !x.x && x.id !== e.id).slice(0, 3);
    const relancer = this.absences(avant).filter(p => p.g !== 'a' && p.eps >= 3 && p.ecart >= 3).slice(0, 3);
    const decors = this.decors(avant).slice(0, 3);
    const copies = this.repetitions().filter(x => x.pct >= 50).length;
    const stat = (l, v, action = '', orange = false) => `<div class="ec-rep-stat"><span class="an-note">${action ? this._lien(l, 'aller', action) : l}</span><strong ${orange ? 'class="ec-orange"' : ''}>${v}</strong></div>`;

    return `
      <div class="ec-rep">
        <section class="an-carte ec-rep-principal">
          <p class="an-label">Tu en étais là</p>
          <div>
            <div class="ec-rep-titre">${esc(this._code(e))} — ${esc(e.t || 'Sans titre')}</div>
            <p class="an-note">${esc(lieu)}</p>
          </div>
          ${note ? `<p class="ec-rep-note">Dernière note : ${esc(note.length > 140 ? `${note.slice(0, 140)}…` : note)}</p>` : ''}
          <div class="ec-rep-boutons">
            <button type="button" class="btn btn-primary" onclick="Ecriture.continuer()">Reprendre l'écriture</button>
            <button type="button" class="btn btn-secondary" onclick="Ecriture.ouvrirPortee()">Changer d'épisode</button>
          </div>
          <ol class="ec-rep-etapes" aria-label="Avancement">
            ${this._etapes(e).map(x => `<li class="${x.classe}"><button type="button" class="ec-lien" data-a="allerEtape" data-v="${x.vue}" onclick="Ecriture.agir(this)"><span aria-hidden="true">${x.marque}</span> ${esc(x.l)}</button></li>`).join('')}
          </ol>
        </section>
        <div class="ec-rep-cote">
          <section class="an-carte">
            <p class="an-label">Objectif du jour</p>
            ${b.objectif ? `
              <div class="ec-rep-chiffre">${Analyse._fr(b.aujourdhui)} <small>/ ${Analyse._fr(b.objectif)} mots</small></div>
              <div class="ec-rep-jauge" role="img" aria-label="${pct} % de l'objectif"><span style="width:${pct}%"></span></div>
              <p class="an-note">${b.aujourdhui >= b.objectif ? 'Objectif atteint.' : `Il reste ${Analyse._fr(b.objectif - b.aujourdhui)} mots.`}</p>
            ` : `
              <div class="ec-rep-chiffre">${Analyse._fr(b.aujourdhui)} <small>mots aujourd'hui</small></div>
              ${this._lien('Fixer un objectif', 'aller', 'objectifs')}
            `}
          </section>
          <section class="an-carte">
            <p class="an-label">À ne pas oublier</p>
            ${rappels.length ? `<ul class="ec-liste">${rappels.map(t => `<li><span>${esc(t)}</span></li>`).join('')}</ul>` : '<p class="an-note">Rien de noté pour cet épisode.</p>'}
            ${this._lien('Ouvrir la Mémoire', 'aller', 'memoire')}
          </section>
        </div>
      </div>
      <div class="ec-rep-stats">
        ${stat('Écrits', Analyse._fr(avant.length))}
        ${stat('À écrire', Analyse._fr(this.ensemble().filter(x => !x.x).length), 'plan')}
        ${stat('Mots par épisode', Analyse._fr(m.mots))}
        ${stat('Scripts à vérifier', copies, 'repetitions', copies > 0)}
      </div>
      ${this._htmlAccueil()}
      <section class="an-carte ec-rep-suite">
        <p class="an-label">Ensuite</p>
        ${ensuite.map(x => `<div>${this._lien(esc(this._code(x)), 'ouvrirEpisode', x.id)} ${esc(x.t || 'Sans titre')}</div>`).join('') || '<div class="an-note">Plus aucun épisode à écrire ici.</div>'}
        <div class="ec-rep-relance an-note">
          ${relancer.length ? `<span>À relancer : ${relancer.map(p => this._lien(esc(p.nom), 'voirPerso', p.nom)).join(', ')}</span>` : ''}
          ${decors.length ? `<span>Décors délaissés : ${decors.map(l => esc(l.nom)).join(', ')}</span>` : ''}
        </div>
      </section>
    `;
  },

  _ligneRepetition(r, ligne) {
    const a = this.ordre[this.rang.get(r.a)], b = this.ordre[this.rang.get(r.b)];
    return ligne(`${esc(this._code(a))} et ${esc(this._code(b))}`, `${Analyse._num(r.pct)} % en commun`);
  },

  // ─── Personnages ─────────────────────────────────────────────────────────

  voirPerso(nom) {
    this.perso = nom;
    this.vue = 'persos';
    this.rendreVue();
  },

  vuePersos() {
    const avant = this.ecritsAvant();
    const termes = this._plat(this.persosQ).split(/[\s,]+/).filter(Boolean);
    const tous = this.absences(avant);
    const liste = tous.filter(p => (termes.length ? termes.some(t => this._plat(p.nom).includes(t)) : p.ecart >= this.seuilAbsence && p.eps >= 3));
    const fiche = tous.find(p => p.nom === this.perso);

    return `
      <div class="an-ligne">
        <input id="ec-persos-q" class="an-recherche" type="text" aria-label="Chercher un personnage" placeholder="Chercher un personnage…" value="${esc(this.persosQ)}" oninput="Ecriture.regler('persosQ', this.value, 'ec-persos-q')">
        ${this._nombre('ec-seuil-absence', 'Absent depuis ≥', 'seuilAbsence')}
        <span class="an-note">${liste.length} personnage(s)</span>
      </div>
      <section class="an-carte">
        <h2 class="an-titre">${termes.length ? 'Résultats' : 'Personnages oubliés'}</h2>
        <div class="an-table"><table>
          <thead><tr><th>Personnage</th><th>Dernier épisode</th><th>Absent depuis</th><th>Épisodes</th><th>Répliques</th></tr></thead>
          <tbody>${liste.map(p => `<tr><td>${this._lien(esc(p.nom), 'voirPerso', p.nom)}</td><td>${esc(this._code(p.ep))}</td><td>${p.ecart}</td><td>${p.eps}</td><td>${Analyse._fr(p.repliques)}</td></tr>`).join('') || '<tr><td colspan="5" class="an-note">Personne.</td></tr>'}</tbody>
        </table></div>
      </section>
      ${fiche ? this._fichePerso(fiche, avant) : '<section class="an-carte"><p class="an-note">Clique sur un nom, ou cherche un personnage, pour voir son évolution.</p></section>'}
    `;
  },

  // Saison par saison : son poids dans la série et les mots qui le distinguent à ce moment-là
  evolution(nom, avant) {
    const saisons = [...new Set(avant.map(e => e.sa))];
    const parSaison = saisons.map(sa => {
      const eps = avant.filter(e => e.sa === sa);
      const compte = new Map();
      let mots = 0, repliques = 0, presences = 0;
      eps.forEach(e => {
        const r = e._noms.get(nom);
        if (r) presences++;
        const v = e.vr?.[nom];
        if (v) { repliques += v[0]; mots += v[1]; }
        const w = e.vw?.[nom] || [];
        for (let k = 0; k < w.length; k += 2) compte.set(w[k], (compte.get(w[k]) || 0) + w[k + 1]);
      });
      const total = eps.reduce((a, e) => a + e.r, 0) || 1;
      return { sa, eps: eps.length, presences, repliques, mots, compte, part: Math.round((repliques * 100) / total) };
    });
    const global = new Map();
    let motsTotal = 0;
    parSaison.forEach(s => {
      motsTotal += s.mots;
      s.compte.forEach((n, i) => global.set(i, (global.get(i) || 0) + n));
    });
    return parSaison.map(s => {
      const marquants = [...s.compte.entries()]
        .filter(([i, n]) => n >= 4 && this.d.vocab[i].length >= 4)
        .map(([i, n]) => {
          const ailleurs = global.get(i) - n, resteMots = Math.max(motsTotal - s.mots, 1);
          return { mot: this.d.accents[i] || this.d.vocab[i], score: (n / (s.mots || 1)) / ((ailleurs + 1) / resteMots) * Math.log(n) };
        }).sort((a, b) => b.score - a.score).slice(0, 6).map(m => m.mot);
      return { ...s, marquants };
    });
  },

  _fichePerso(p, avant) {
    const lignes = this.evolution(p.nom, avant);
    return `
      <section class="an-carte">
        <h2 class="an-titre">${esc(p.nom)} — évolution</h2>
        <div class="an-table"><table>
          <thead><tr><th>Saison</th><th>Présences</th><th>Répliques</th><th>Part</th><th>Mots qui le marquent</th></tr></thead>
          <tbody>${lignes.map(l => `<tr><td>S${l.sa}</td><td>${l.presences} / ${l.eps}</td><td>${Analyse._fr(l.repliques)}</td><td>${l.part} %</td><td>${l.marquants.map(esc).join(', ') || '—'}</td></tr>`).join('')}</tbody>
        </table></div>
      </section>
      <section class="an-carte">
        <h2 class="an-titre">${esc(p.nom)} — dernière fois</h2>
        <div id="ec-repliques"><p class="an-note">Lecture…</p></div>
      </section>
    `;
  },

  _htmlRepliques(liste) {
    return liste.map(r => `<p class="ec-replique">${this._lien(`S${r.sa}E${String(r.n).padStart(2, '0')}`, 'ouvrirScene', `${r.id}:${r.sc}`)} ${esc(r.texte)}</p>`).join('') || '<p class="an-note">Aucune réplique.</p>';
  },

  // Limite les lectures de scripts à la portée choisie
  _avantParam() {
    if (this.portee === 'episode') return `&avant=${this.epId}`;
    if (this.portee === 'serie') return '';
    return `&ids=${this.ecritsAvant().map(e => e.id).join(',')}`;
  },

  async _chargerRepliques() {
    const slot = document.getElementById('ec-repliques');
    if (!slot || !this.perso) return;
    const nom = this.perso;
    const liste = await api.get(`ecriture_perso&nom=${encodeURIComponent(nom)}${this._avantParam()}`);
    if (nom === this.perso && slot.isConnected) slot.innerHTML = this._htmlRepliques(liste);
  },

  // ─── Relations ───────────────────────────────────────────────────────────

  vueRelations() {
    const avant = this.ecritsAvant();
    const dansSaison = avant.filter(e => e.sa === Number(this.relSaison));
    const eps = dansSaison.length ? dansSaison : avant;
    const paires = new Map(), totaux = new Map();
    eps.forEach(e => {
      const ech = this.x.eps[e.id]?.ech || {};
      for (const cle in ech) {
        paires.set(cle, (paires.get(cle) || 0) + ech[cle]);
        cle.split('|').forEach(n => totaux.set(n, (totaux.get(n) || 0) + ech[cle]));
      }
    });
    const connus = new Set(this.d.persos.filter(p => p.g !== 'x').map(p => p.n));
    const noms = [...totaux.entries()].filter(([n]) => connus.has(n)).sort((a, b) => b[1] - a[1]).slice(0, this.relNombre || 8).map(([n]) => n);
    const cle = (a, b) => [a, b].sort().join('|');
    const valeur = (a, b) => paires.get(cle(a, b)) || 0;
    const duos = noms.flatMap((a, i) => noms.slice(i + 1).map(b => ({ a, b, v: valeur(a, b) })));
    const max = Math.max(1, ...duos.map(p => p.v));
    const jamais = duos.filter(p => !p.v);
    const forts = duos.filter(p => p.v).sort((x, y) => y.v - x.v);
    if (!forts.some(p => cle(p.a, p.b) === this.relPaire)) this.relPaire = forts[0] ? cle(forts[0].a, forts[0].b) : '';
    const puce = nom => `<span class="ec-puce" style="background:${Analyse._couleur(nom)}"></span>`;
    const lignes = noms.slice(0, -1);
    const colonnes = noms.slice(1);
    // La racine carrée garde les petits duos visibles à côté des très gros
    const caseDuo = (a, b) => {
      const v = valeur(a, b);
      if (!v) return '<span class="ec-case ec-case-vide">—</span>';
      const force = Math.sqrt(v / max);
      // Pas de teinte intermédiaire : ni le texte clair ni le foncé n'y seraient lisibles
      const fort = force > 0.6;
      const fond = Math.round(fort ? 60 + force * 40 : force * 55);
      return `<button type="button" class="ec-case ${cle(a, b) === this.relPaire ? 'actif' : ''}" title="${esc(a)} et ${esc(b)} : ${Analyse._fr(v)} répliques enchaînées" data-a="voirPaire" data-v="${esc(cle(a, b))}" onclick="Ecriture.agir(this)" style="background:color-mix(in srgb, var(--accent) ${fond}%, var(--bg3));color:${fort ? 'var(--sur-accent)' : 'var(--text)'}">${Analyse._fr(v)}</button>`;
    };

    return `
      <div class="an-ligne ec-filtres">
        ${this._nombre('ec-rel-nb', 'Personnages', 'relNombre')}
        ${this._choix('ec-rel-saison', 'Saison', 'relSaison', [[0, 'Toutes'], ...this.d.saisons.filter(s => avant.some(e => e.sa === s.n)).map(s => [s.n, `Saison ${s.n}`])])}
      </div>
      <div class="ec-relations">
        <section class="an-carte">
          <div class="an-entete"><h2 class="an-titre">Qui parle à qui</h2><span class="an-label">Répliques enchaînées dans une même scène</span></div>
          <div class="an-table">
            <div class="ec-matrice" style="grid-template-columns:minmax(120px, 160px) repeat(${colonnes.length}, minmax(68px, 1fr))">
              <span></span>
              ${colonnes.map(n => `<span class="an-label ec-matrice-col" title="${esc(n)}">${esc(n)}</span>`).join('')}
              ${lignes.map((a, i) => `
                <span class="ec-matrice-nom" title="${esc(a)}">${puce(a)}<span>${esc(a)}</span></span>
                ${colonnes.map((b, j) => (j >= i ? caseDuo(a, b) : '<span></span>')).join('')}
              `).join('')}
            </div>
          </div>
          ${jamais.length ? `
            <div class="ec-jamais">
              <span class="an-label">Jamais d'échange direct</span>
              <div class="ec-etiquettes">${jamais.slice(0, 20).map(p => `<span class="ec-pastille">${esc(p.a)} · ${esc(p.b)}</span>`).join('')}</div>
            </div>` : ''}
        </section>
        <section class="an-carte">
          <div class="an-entete"><h2 class="an-titre" id="ec-paire-titre"></h2></div>
          <div id="ec-echanges"><p class="an-note">Lecture…</p></div>
        </section>
      </div>
    `;
  },

  voirPaire(cle) {
    this.relPaire = cle;
    document.querySelectorAll('#ec-vue .ec-case').forEach(c => c.classList.toggle('actif', c.dataset.v === cle));
    this._chargerEchanges();
  },

  async _chargerEchanges() {
    const slot = document.getElementById('ec-echanges');
    if (!slot || !this.relPaire) return;
    const paire = this.relPaire;
    const [a, b] = paire.split('|');
    document.getElementById('ec-paire-titre').textContent = `${a} et ${b}, derniers échanges`;
    const liste = await api.get(`ecriture_echange&a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}${this._avantParam()}`);
    if (paire !== this.relPaire || !slot.isConnected) return;
    slot.innerHTML = liste.map(x => `<div class="ec-echange">${this._lien(`S${x.sa}E${String(x.n).padStart(2, '0')}`, 'ouvrirScene', `${x.id}:${x.sc}`)}${x.lignes.map(([q, t]) => `<p class="ec-replique"><strong style="color:${Analyse._encre(Analyse._couleur(q))}">${esc(q)}</strong>${esc(t)}</p>`).join('')}</div>`).join('') || '<p class="an-note">Aucun échange avant ce point.</p>';
  },

  // ─── Gags ───────────────────────────────────────────────────────

  async suivreGag(texte, statut = 'suivi') {
    await this.note(`gag:${texte}`, statut);
    this.gags = await api.get('ecriture_gags');
    this.rendreVue();
  },

  ajouterGag() {
    const champ = document.getElementById('ec-gag');
    const texte = champ?.value.trim();
    if (texte) this.suivreGag(texte);
  },

  setStatutGag(select) {
    this.suivreGag(select.dataset.t, select.value);
  },

  // ─── Sujets et fils ────────────────────────────────────────────────────────

  async suivreSujet(valeur) {
    const [mot, ep] = valeur.split('|');
    await api.post('promesses', { titre: mot, episode_source_id: Number(ep), statut: 'ouverte', type_promesse: 'autre' });
    this.promesses = await api.get('promesses');
    this._fm = undefined;
    toast('Ajouté aux fils ouverts');
    this.rendreVue();
  },

  retrouverMot(mot) {
    this.rq = mot;
    this.rPerso = '';
    this.rSaison = 0;
    this.rLieu = '';
    this.vue = 'retrouver';
    this.rendreVue();
  },

  // ─── Répétitions ─────────────────────────────────────────────────────────

  vueRepetitions() {
    const liste = this.repetitions().filter(r => r.pct >= this.repSeuil);
    return `
      <div class="an-ligne">
        ${this._nombre('ec-rep-seuil', '≥ % en commun', 'repSeuil')}
        <span class="an-note">Longues suites de mots identiques entre deux épisodes. Un rappel volontaire y apparaît aussi.</span>
      </div>
      <section class="an-carte">
        <h2 class="an-titre">${liste.length} paire(s)</h2>
        <div class="an-table"><table>
          <thead><tr><th>Épisodes</th><th>Titres</th><th>En commun</th><th></th></tr></thead>
          <tbody>${liste.map(r => {
            const a = this.ordre[this.rang.get(r.a)], b = this.ordre[this.rang.get(r.b)];
            return `<tr><td>${esc(this._code(a))} · ${esc(this._code(b))}</td><td>${esc(a.t)} · ${esc(b.t)}</td><td>${Analyse._num(r.pct)} %</td><td>${this._lien('Voir', 'voirCommun', `${r.a}|${r.b}`)}</td></tr>`;
          }).join('') || '<tr><td colspan="4" class="an-note">Aucune paire à ce seuil.</td></tr>'}</tbody>
        </table></div>
      </section>
      <section class="an-carte"><h2 class="an-titre">Répliques communes</h2><div id="ec-commun"><p class="an-note">Choisis une paire.</p></div></section>
    `;
  },

  voirCommun(cle) {
    this.repOuverte = cle;
    this._chargerCommun();
  },

  async _chargerCommun() {
    const slot = document.getElementById('ec-commun');
    if (!slot || !this.repOuverte) return;
    const [a, b] = this.repOuverte.split('|');
    const liste = await api.get(`ecriture_commun&a=${a}&b=${b}`);
    slot.innerHTML = liste.map(l => `<p class="ec-replique"><strong>${esc(l.qui)}</strong>${esc(l.texte)}</p>`).join('') || '<p class="an-note">Aucune réplique entière en commun.</p>';
  },

  // ─── Retrouver ───────────────────────────────────────────────────────────

  vueRetrouver() {
    const persos = this.d.parleurs.map(p => [p.n, p.n]);
    return `
      <div class="an-ligne">
        <input id="ec-r-q" class="an-recherche" type="text" aria-label="Chercher dans les scripts" placeholder="Une réplique, un mot…" value="${esc(this.rq)}" oninput="Ecriture.setRecherche('rq', this.value)">
        <label class="an-label" for="ec-r-perso">Dit par</label>
        <select id="ec-r-perso" onchange="Ecriture.setRecherche('rPerso', this.value)"><option value="">Tout le monde</option>${persos.map(([v, l]) => `<option value="${esc(v)}" ${this.rPerso === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        ${this.portee === 'serie' || this.portee === 'episode' ? `<label class="an-label" for="ec-r-saison">Saison</label>
        <select id="ec-r-saison" onchange="Ecriture.setRecherche('rSaison', Number(this.value))"><option value="0">Toutes</option>${this.d.saisons.map(s => `<option value="${s.n}" ${this.rSaison === s.n ? 'selected' : ''}>Saison ${s.n}</option>`).join('')}</select>` : ''}
        <label class="an-label" for="ec-r-lieu">Décor</label>
        <input id="ec-r-lieu" class="an-recherche" type="text" placeholder="cuisine…" value="${esc(this.rLieu)}" oninput="Ecriture.setRecherche('rLieu', this.value)">
        <label class="an-note"><input type="checkbox" ${this.rAction ? 'checked' : ''} onchange="Ecriture.setRecherche('rAction', this.checked)"> Didascalies aussi</label>
      </div>
      <section class="an-carte"><div id="ec-resultats"><p class="an-note">Tape un mot ou choisis un personnage.</p></div></section>
    `;
  },

  setRecherche(cle, valeur) {
    this[cle] = valeur;
    clearTimeout(this._attente);
    this._attente = setTimeout(() => this.chercher(), 250);
  },

  async chercher() {
    const slot = document.getElementById('ec-resultats');
    if (!slot) return;
    if (!this.rq.trim() && !this.rPerso) {
      slot.innerHTML = '<p class="an-note">Tape un mot ou choisis un personnage.</p>';
      return;
    }
    const demande = ++this._demande;
    const params = new URLSearchParams({ q: this.rq, perso: this.rPerso, lieu: this.rLieu, action: this.rAction ? '1' : '' });
    if (this.portee === 'saison' || this.portee === 'selection') params.set('ids', this.ecritsAvant().map(e => e.id).join(','));
    else params.set('saison', this.rSaison);
    const r = await api.get(`ecriture_recherche&${params}`);
    if (demande !== this._demande || !slot.isConnected) return;
    slot.innerHTML = `
      <p class="an-label">${Analyse._fr(r.total)} résultat(s)${r.total > r.resultats.length ? `, ${r.resultats.length} affichés` : ''}</p>
      ${r.resultats.map(l => `<p class="ec-replique">${this._lien(`S${l.sa}E${String(l.n).padStart(2, '0')}`, 'ouvrirScene', `${l.id}:${l.sc}`)} ${l.qui ? `<strong>${esc(l.qui)}</strong>` : ''}${esc(l.texte)}</p>`).join('')}
    `;
  },
  _demande: 0,

  // ─── Préparer un épisode ─────────────────────────────────────────────────

  _carteEpisode(titre, e) {
    if (!e) return `<div class="an-kpi"><div class="an-label">${titre}</div><div class="an-note">—</div></div>`;
    const f = this.fiches.get(e.id) || {};
    const intrigues = [['A', f.intrigue_a], ['B', f.intrigue_b], ['C', f.intrigue_c]].filter(([, t]) => t);
    return `
      <div class="an-kpi">
        <div class="an-label">${titre}</div>
        ${this._lien(`${esc(this._code(e))} ${esc(e.t || 'Sans titre')}`, 'ouvrirEpisode', e.id)}
        ${intrigues.map(([l, t]) => `<div class="an-note">${l} : ${esc(t)}</div>`).join('') || '<div class="an-note">Pas d\'intrigue notée.</div>'}
      </div>
    `;
  },

  vuePreparer() {
    const e = this.ordre[this.rang.get(this.epId)];
    const f = this.fiches.get(e.id) || {};
    const i = this.rang.get(e.id);
    const avant = this.ecritsAvant();
    const persos = this.absences(avant);
    const principaux = persos.filter(p => p.g === 'p');
    const relancer = persos.filter(p => p.g !== 'p' && p.eps >= 3 && p.ecart >= this.seuilAbsence).slice(0, 8);
    const duos = this.duos(avant).filter(p => p.ecart >= 3).slice(0, 8);
    const decors = this.decors(avant).filter(l => l.ecart >= 3).slice(0, 6);
    const echos = this.echos(avant);
    const uses = echos.filter(x => x.use && x.t.split(' ').length >= 4).sort((a, b) => b.recents - a.recents).slice(0, 6);
    const dormants = echos.filter(x => (x.statut === 'relancer' || x.dormant) && x.t.split(' ').length >= 4).slice(0, 6);
    const sujets = this.sujets(avant).slice(0, 6);
    const ouverts = this.promesses.filter(p => p.statut === 'ouverte');
    const ligne = (a, b) => `<li><span>${a}</span><span class="an-note">${b}</span></li>`;
    const coches = this._lireChecklist();

    return `
      <div class="an-entete">
        <h2 class="an-titre">${esc(this._code(e))} — ${esc(e.t || 'Sans titre')}</h2>
        <button type="button" class="btn btn-secondary btn-sm" onclick="window.print()">Imprimer / PDF</button>
      </div>
      <div class="an-alertes">
        ${this._carteEpisode('Épisode précédent', this.ordre[i - 1])}
        ${this._carteEpisode('Cet épisode', e)}
        ${this._carteEpisode('Épisode suivant', this.ordre[i + 1])}
      </div>
      <section class="an-carte">
        <h2 class="an-titre">Où en sont les personnages principaux</h2>
        <div class="ec-grille">${principaux.map(p => `
          <div class="an-kpi">
            <strong style="color:${Analyse._encre(Analyse._couleur(p.nom))}">${esc(p.nom)}</strong>
            <div class="an-note">${p.ecart ? `Absent depuis ${p.ecart} épisode(s)` : 'Présent à l\'épisode précédent'}</div>
            <div class="ec-derniere" data-nom="${esc(p.nom)}"><p class="an-note">Lecture…</p></div>
          </div>`).join('')}</div>
      </section>
      <div class="ec-grille">
        ${this._liste('À relancer', relancer.map(p => ligne(this._lien(esc(p.nom), 'voirPerso', p.nom), `${p.ecart} épisode(s) d'absence`)), 'Aucun personnage à relancer.')}
        ${this._liste('Duos à retrouver', duos.map(p => ligne(`${esc(p.a)} et ${esc(p.b)}`, `${p.ecart} épisode(s) sans échange`)), 'Tous les duos se parlent.')}
        ${this._liste('Décors délaissés', decors.map(l => ligne(esc(l.nom), `${l.ecart} épisode(s)`)), 'Aucun décor délaissé.')}
        ${this._liste('Éviter : trop présent', uses.map(x => ligne(`« ${esc(x.t)} »`, `${x.recents} fois sur 20`)), 'Rien de trop présent.')}
        ${this._liste('À rappeler', dormants.map(x => ligne(`« ${esc(x.t)} »`, x.ecart === null ? 'à placer' : `absent depuis ${x.ecart} épisode(s)`)), 'Rien à rappeler.')}
        ${this._liste('Fils et sujets à reprendre', [...ouverts.slice(0, 5).map(p => ligne(esc(p.titre), 'fil ouvert')), ...sujets.map(s => ligne(this._lien(esc(s.mot), 'retrouverMot', s.mot), `dernier en ${esc(this._code(s.fin))}`))], 'Rien à reprendre.')}
      </div>
      <section class="an-carte">
        <h2 class="an-titre">À placer dans cet épisode</h2>
        <ul class="ec-liste">${this._rappels().map((r, n) => `<li><span>${esc(r)}</span>${this._lien('Retirer', 'retirerRappel', n)}</li>`).join('') || '<li class="an-note">Rien pour l\'instant. Les boutons → de la Mémoire ajoutent ici.</li>'}</ul>
        <div class="an-ligne"><input id="ec-rappel" class="an-recherche" type="text" aria-label="Ajouter un rappel" placeholder="Un gag, un fil, un fait…"><button type="button" class="btn btn-secondary btn-sm" onclick="Ecriture.ajouterRappel()">Ajouter</button></div>
      </section>
      ${this._carteIdee()}
      <section class="an-carte">
        <h2 class="an-titre">Retours des lecteurs</h2>
        <div id="ec-lecteurs"><p class="an-note">Lecture…</p></div>
      </section>
      <section class="an-carte">
        <h2 class="an-titre">Notes de travail</h2>
        <textarea id="ec-notes" rows="6" aria-label="Notes de travail" placeholder="Idées, enjeux, répliques à placer…" oninput="Ecriture.noterPlusTard('ecriture-notes:${e.id}', this.value)">${esc(this.notes[`ecriture-notes:${e.id}`] || '')}</textarea>
      </section>
      <section class="an-carte">
        <h2 class="an-titre">Avant de rendre</h2>
        <ul class="ec-liste ec-coches">${coches.map((c, n) => `<li><label><input type="checkbox" ${c.fait ? 'checked' : ''} onchange="Ecriture.cocher(${n}, this.checked)"> ${esc(c.t)}</label>${this._lien('Retirer', 'retirerCoche', n)}</li>`).join('')}</ul>
        <div class="an-ligne"><input id="ec-coche" class="an-recherche" type="text" aria-label="Ajouter un point" placeholder="Ajouter un point…"><button type="button" class="btn btn-secondary btn-sm" onclick="Ecriture.ajouterCoche()">Ajouter</button></div>
      </section>
    `;
  },

  async _chargerPreparer() {
    this._chargerLecteurs();
    document.querySelectorAll('#ec-vue .ec-derniere').forEach(async slot => {
      const liste = await api.get(`ecriture_perso&nom=${encodeURIComponent(slot.dataset.nom)}${this._avantParam()}`);
      if (slot.isConnected) slot.innerHTML = this._htmlRepliques(liste.slice(0, 2));
    });
  },

  noterPlusTard(cle, valeur) {
    this.notes[cle] = valeur;
    clearTimeout(this._notesAttente[cle]);
    // Une fois envoyée, la note n'attend plus : rien ne sera renvoyé plus tard par-dessus une autre fenêtre
    this._notesAttente[cle] = setTimeout(() => { delete this._notesAttente[cle]; this.note(cle, valeur); }, 700);
  },

  async viderNotes() {
    const envois = Object.entries(this._notesAttente).map(([cle, minuteur]) => {
      clearTimeout(minuteur);
      return this.notes[cle] === undefined ? null : this.note(cle, this.notes[cle]);
    });
    this._notesAttente = {};
    await Promise.all(envois);
  },

  _lireChecklist() {
    try {
      const liste = JSON.parse(this.notes[`checklist:${this.epId}`] || 'null');
      if (Array.isArray(liste)) return liste;
    } catch (e) {}
    return ECRITURE_CHECKLIST.map(t => ({ t, fait: false }));
  },

  async _ecrireChecklist(liste) {
    await this.note(`checklist:${this.epId}`, JSON.stringify(liste));
    this.rendreVue();
  },

  cocher(n, fait) {
    const liste = this._lireChecklist();
    liste[n].fait = fait;
    this.note(`checklist:${this.epId}`, JSON.stringify(liste));
  },

  retirerCoche(n) {
    const liste = this._lireChecklist();
    liste.splice(Number(n), 1);
    this._ecrireChecklist(liste);
  },

  ajouterCoche() {
    const t = document.getElementById('ec-coche')?.value.trim();
    if (t) this._ecrireChecklist([...this._lireChecklist(), { t, fait: false }]);
  },

  // ─── Structure ───────────────────────────────────────────────────────────

  _decor: t => String(t).replace(/^[\s/]+|[\s\-—–]+$/g, ''),

  // Les scènes sans dialogue ne sont pas comptées dans l'Analyse
  _scene(e, n) {
    return this.x.eps[e.id]?.scn?.[n] ?? n + 1;
  },

  vueStructure() {
    const e = this.ordre[this.rang.get(this.epId)];
    if (!e.sc.length) {
      return `<section class="an-carte"><p class="an-note">Cet épisode n'a pas encore de script. Écris dans Brouillon pour voir sa structure en direct.</p></section>`;
    }
    const avant = this.ecritsAvant();
    const moi = this.moyennes([e]);
    const serie = this.moyennes(avant);
    const recents = this.moyennes(avant.slice(-10));
    const meilleurs = this.x.meilleurs.map(id => this.ordre[this.rang.get(id)]).filter(Boolean);
    const top = meilleurs.length ? this.moyennes(meilleurs) : null;
    const ouverture = this.x.eps[e.id]?.ouv ?? null;
    const lignes = [['Mots', 'mots'], ['Répliques', 'repliques'], ['Scènes', 'scenes'], ['Mots par scène', 'motsScene'], ['Mots avant le générique', 'ouverture']];
    const cellule = (m, k) => (m?.[k] == null ? '—' : Analyse._fr(m[k]));
    const total = e.sc.reduce((a, s) => a + s[0], 0) || 1;
    const teintes = new Map();
    const teinte = lieu => {
      if (!teintes.has(lieu)) teintes.set(lieu, Math.round((teintes.size * 137.5) % 360));
      return teintes.get(lieu);
    };

    return `
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Déroulé de l'épisode</h2><span class="an-label">Largeur = mots de dialogue · couleur = décor</span></div>
        <div class="ec-frise">${e.sc.map((s, n) => `<button type="button" title="Scène ${n + 1} · ${esc(this._decor(s[2]))} · ${s[0]} mots" aria-label="Scène ${n + 1}, ${esc(this._decor(s[2]))}" data-a="ouvrirScene" data-v="${e.id}:${this._scene(e, n)}" onclick="Ecriture.agir(this)" style="flex:${Math.max(s[0], 1)} 1 0;background:hsl(${teinte(s[2])} 45% 50%)"></button>`).join('')}</div>
      </section>
      <section class="an-carte">
        <h2 class="an-titre">Comparaison</h2>
        <div class="an-table"><table>
          <thead><tr><th></th><th>Cet épisode</th><th>10 précédents</th><th>Série avant lui</th><th>Tes « excellents »${meilleurs.length ? ` (${meilleurs.length})` : ''}</th></tr></thead>
          <tbody>${lignes.map(([l, k]) => `<tr><td>${l}</td><td><strong>${k === 'ouverture' ? (ouverture == null ? '—' : Analyse._fr(ouverture)) : cellule(moi, k)}</strong></td><td>${cellule(recents, k)}</td><td>${cellule(serie, k)}</td><td>${cellule(top, k)}</td></tr>`).join('')}</tbody>
        </table></div>
      </section>
      <section class="an-carte">
        <h2 class="an-titre">Scènes</h2>
        <div class="an-table"><table>
          <thead><tr><th>#</th><th>Décor</th><th>Mots</th><th>Part</th><th>Répliques</th><th>Personnages</th></tr></thead>
          <tbody>${e.sc.map((s, n) => `<tr><td>${this._lien(n + 1, 'ouvrirScene', `${e.id}:${this._scene(e, n)}`)}</td><td>${esc(this._decor(s[2]))}</td><td>${Analyse._fr(s[0])}</td><td>${Math.round((s[0] * 100) / total)} %</td><td>${s[1]}</td><td>${s[3].filter(i => this.d.persos[i].g !== 'x').map(i => esc(this.d.persos[i].n)).join(', ')}</td></tr>`).join('')}</tbody>
        </table></div>
      </section>
    `;
  },

  // ─── Brouillon ───────────────────────────────────────────────────────────

  vueBrouillon() {
    const texte = this.notes[`brouillon:${this.epId}`] || '';
    return `
      <div class="an-ligne">
        <button type="button" class="btn btn-secondary btn-sm" onclick="Ecriture.reprendreScript()">Partir du script</button>
        <button type="button" class="btn btn-primary btn-sm" onclick="Ecriture.validerScript()">Valider comme script</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="Ecriture.ouvrirVersions()">Versions</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="Ecriture.basculerRecherche()">Remplacer</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="Ecriture.basculerFocus()">Concentration</button>
        ${window.bureau ? '<button type="button" class="btn btn-secondary btn-sm" title="Ouvre ce brouillon dans une deuxième fenêtre, pour relire ou comparer" onclick="window.bureau.fenetre({ episode: Ecriture.epId })">Autre fenêtre</button>' : ''}
        <button type="button" class="btn btn-secondary btn-sm" title="Le brouillon qui défile en grand, pour lire à voix haute ou enregistrer" onclick="Prompteur.depuisTexte(document.getElementById('ec-brouillon')?.value || '', Ecriture._titreEp())">Prompteur</button>
        ${'speechSynthesis' in window ? '<button type="button" class="btn btn-secondary btn-sm ec-ecouter-btn" title="Lit à voix haute la sélection, ou depuis le curseur, une voix par personnage" onclick="Ecriture.ecouter()">▶ Écouter</button>' : ''}
        <select id="ec-export" aria-label="Exporter" onchange="Ecriture.exporter(this.value)"><option value="">Exporter…</option><option value="pdf">PDF au format scénario</option><option value="fountain">Fountain</option><option value="fdx">Final Draft</option></select>
      </div>
      <p class="an-note">Le brouillon reste à part tant que tu ne le valides pas. Sélectionne un mot pour retrouver où il a déjà été dit.</p>
      <div class="ec-brouillon">
        <div class="ec-atelier" id="ec-atelier">
          <div class="ec-focus-tete"><span class="an-note" id="ec-focus-info"></span><span><button type="button" class="btn btn-ghost btn-sm" id="ec-sprint" title="25 minutes d'écriture chronométrées ; cliquer de nouveau arrête" onclick="Sprint.basculer()">${Sprint.libelle()}</button><button type="button" class="btn btn-ghost btn-sm" id="ec-ambiance" title="Un bruit de fond pour se concentrer, fabriqué par l'ordinateur" onclick="Ambiance.suivante()">${Ambiance.libelle()}</button>${'speechSynthesis' in window ? '<button type="button" class="btn btn-ghost btn-sm ec-ecouter-btn" title="Lit à voix haute depuis le curseur" onclick="Ecriture.ecouter()">▶ Écouter</button>' : ''}<button type="button" class="btn btn-ghost btn-sm" onclick="Ecriture.basculerFocus()">Sortir</button></span></div>
          <div class="ec-rech" id="ec-rech" hidden>
            <input id="ec-rech-q" type="text" aria-label="Chercher dans le brouillon" placeholder="Chercher…" value="${esc(this.rechQ)}" oninput="Ecriture.setRecherche('rechQ', this.value)">
            <input id="ec-rech-r" type="text" aria-label="Remplacer par" placeholder="Remplacer par…" value="${esc(this.rechR)}" oninput="Ecriture.rechR = this.value">
            <label class="interface-case"><input type="checkbox" ${this.rechCasse ? 'checked' : ''} onchange="Ecriture.setRecherche('rechCasse', this.checked)"> Casse exacte</label>
            <label class="interface-case"><input type="checkbox" ${this.rechMot ? 'checked' : ''} onchange="Ecriture.setRecherche('rechMot', this.checked)"> Mot entier</label>
            <span class="an-note" id="ec-rech-compte"></span>
            <button type="button" class="btn btn-ghost btn-sm" onclick="Ecriture.rechercheSuivante()">Suivant</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="Ecriture.remplacerUne()">Remplacer</button>
            <button type="button" class="btn btn-primary btn-sm" onclick="Ecriture.remplacerTout()">Tout remplacer</button>
          </div>
          <div class="ec-suggestions" id="ec-suggestions"></div>
          <div class="ec-editeur">
            <pre id="ec-miroir" aria-hidden="true"></pre>
            <textarea id="ec-brouillon" aria-label="Brouillon de l'épisode" spellcheck="true" placeholder="INT. CUISINE — JOUR&#10;&#10;PAUL MARTIN&#10;Une réplique…" oninput="Ecriture.ecrire(this.value)" onscroll="Ecriture._suivreDefilement()" onkeydown="Ecriture.toucheEditeur(event)" onmouseup="Ecriture.memoire(this)" onkeyup="Ecriture.memoire(this)">${esc(texte)}</textarea>
          </div>
        </div>
        <div class="ec-colonne">
          <div id="ec-scenes" class="ec-bilan"></div>
          <div id="ec-comms" class="ec-bilan"></div>
          <div id="ec-contraintes" class="ec-bilan"></div>
          <div id="ec-bilan" class="ec-bilan"></div>
          <div id="ec-fiche" class="ec-bilan" hidden></div>
          <div id="ec-memoire" class="ec-bilan"><p class="an-note">Sélectionne un mot dans le brouillon.</p></div>
        </div>
      </div>
    `;
  },

  _ouvrirBrouillon() {
    this._miroir(this.notes[`brouillon:${this.epId}`] || '');
    const champ = document.getElementById('ec-brouillon');
    if (champ) this._majSuggestions(champ);
    this._majFocus();
    this._bilan(this.notes[`brouillon:${this.epId}`] || '');
    this._majAtelier();
  },

  async reprendreScript() {
    const champ = document.getElementById('ec-brouillon');
    if (champ.value.trim() && !confirm('Remplacer le brouillon par le script actuel ?')) return;
    await this.instantane('Avant de repartir du script', champ.value);
    const f = await api.get(`episodes/${this.epId}`);
    champ.value = f.texte_episode || '';
    this.ecrire(champ.value);
  },

  ecrire(texte) {
    const compter = t => t.split(/\s+/).filter(Boolean).length;
    this._compterSeance(compter(this.notes[`brouillon:${this.epId}`] || ''), compter(texte));
    this._instantaneAuto(this.notes[`brouillon:${this.epId}`] || '');
    this._miroir(texte);
    const champ = document.getElementById('ec-brouillon');
    if (champ) this._majSuggestions(champ);
    this._majFocus();
    this.noterPlusTard(`brouillon:${this.epId}`, texte);
    if (champ) this._noterReprise(champ);
    clearTimeout(this._bilanAttente);
    this._bilanAttente = setTimeout(() => {
      this._bilan(texte);
      this._majAtelier();
    }, 300);
  },

  // Même découpage que le serveur : un nom en capitales ouvre une réplique, une ligne vide la ferme
  lireBrouillon(texte) {
    const scenes = [], parleurs = new Map(), lieux = [];
    const dialogue = [], lignes = [];
    let qui = null;
    texte.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').forEach(brut => {
      const ligne = brut.trim();
      if (!ligne) { qui = null; return; }
      if (/^(INT|EXT)\b/i.test(ligne)) {
        scenes.push({ mots: 0, repliques: 0 });
        lieux.push(ligne);
        qui = null;
        return;
      }
      if (/^\(.*\)$/.test(ligne)) return;
      const nom = ligne.match(/^([A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ][A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ\s'\-\d]{0,35})(\s*\(.*\))?$/);
      if (nom) { qui = nom[1].trim(); return; }
      if (!qui) return;
      const mots = ligne.split(/\s+/).filter(Boolean).length;
      const p = parleurs.get(qui) || { nom: qui, repliques: 0, mots: 0 };
      p.repliques++;
      p.mots += mots;
      parleurs.set(qui, p);
      if (!scenes.length) scenes.push({ mots: 0, repliques: 0 });
      scenes[scenes.length - 1].mots += mots;
      scenes[scenes.length - 1].repliques++;
      dialogue.push(ligne);
      lignes.push({ qui, texte: ligne });
    });
    return { scenes, parleurs: [...parleurs.values()].sort((a, b) => b.mots - a.mots), lieux, dialogue, lignes };
  },

  // Rapproche un nom du brouillon d'un personnage connu, comme « PAUL » ou « PAUL MARTIN »
  _persoConnu(nom) {
    const plat = this._plat(nom);
    const connus = this.d.persos.filter(p => p.g !== 'x');
    return connus.find(p => this._plat(p.n) === plat) || connus.find(p => plat.split(/\s+/)[0] === this._plat(p.n).split(/\s+/)[0]);
  },

  _bilan(texte) {
    const slot = document.getElementById('ec-bilan');
    if (!slot) return;
    const b = this.lireBrouillon(texte);
    if (!b.dialogue.length) {
      slot.innerHTML = '<p class="an-note">Le bilan apparaît dès la première réplique.</p>';
      return;
    }
    const avant = this.ecritsAvant();
    const m = this.moyennes(avant);
    const mots = b.parleurs.reduce((a, p) => a + p.mots, 0);
    const parole = AnalyseCalcul.agregerParole(avant);
    const totalParole = [...parole.values()].reduce((a, p) => a + p.mots, 0) || 1;
    const inconnus = b.parleurs.filter(p => !this._persoConnu(p.nom));
    const dialogue = this._plat(b.dialogue.join(' ').replace(/’/g, "'"));
    const presents = new Set(b.parleurs.map(p => this._persoConnu(p.nom)?.n));
    const absents = this.d.persos.filter(p => p.g === 'p' && !presents.has(p.n));
    const reprises = this.echos(avant).filter(e => e.use || e.statut === 'use').filter(e => dialogue.includes(this._plat(e.t)));
    const rappels = this.gags.filter(g => dialogue.includes(this._plat(g.t)));

    const frequences = new Map();
    dialogue.match(/[a-z]{5,}/g)?.forEach(w => frequences.set(w, (frequences.get(w) || 0) + 1));
    const prenoms = new Set(this.d.persos.map(p => this._plat(p.n)));
    const repetes = [...frequences.entries()].filter(([w, n]) => n >= 5 && !prenoms.has(w)).sort((a, c) => c[1] - a[1]).slice(0, 10);

    const faits = this.faitsConcernes(texte);
    const rappels2 = this._rappels();
    const voix = this._alertesVoix(b);
    const longue = b.scenes.reduce((a, s) => Math.max(a, s.mots), 0);
    slot.innerHTML = `
      ${Analyse._kpis([
        { l: 'Durée', v: Analyse._duree(Math.max(1, Math.round(mots / Settings.motsParMinute))) },
        { l: 'Mots', v: Analyse._fr(mots), s: `moyenne ${Analyse._fr(m.mots)}` },
        { l: 'Scènes', v: b.scenes.length, s: `moyenne ${Analyse._num(m.scenes)}` },
        { l: 'Plus longue scène', v: `${mots ? Math.round((longue * 100) / mots) : 0} %` },
      ])}
      <div class="an-table"><table>
        <thead><tr><th>Personnage</th><th>Répliques</th><th>Part ici</th><th>Habituellement</th></tr></thead>
        <tbody>${b.parleurs.map(p => {
          const connu = this._persoConnu(p.nom);
          const habitude = connu && parole.get(connu.n) ? `${Math.round((parole.get(connu.n).mots * 100) / totalParole)} %` : '—';
          return `<tr><td>${esc(connu?.n || p.nom)}</td><td>${p.repliques}</td><td>${Math.round((p.mots * 100) / (mots || 1))} %</td><td>${habitude}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
      ${absents.length ? `<p class="an-note"><strong>Pas encore de réplique :</strong> ${absents.map(p => esc(p.n)).join(', ')}</p>` : ''}
      ${inconnus.length ? `<p class="an-note"><strong>Noms inconnus :</strong> ${inconnus.map(p => esc(p.nom)).join(', ')}</p>` : ''}
      ${repetes.length ? `<p class="an-note"><strong>Mots très répétés :</strong> ${repetes.map(([w, n]) => `${esc(w)} (${n})`).join(', ')}</p>` : ''}
      ${reprises.length ? `<p class="an-note"><strong>Phrases déjà trop présentes :</strong> ${reprises.map(e => `« ${esc(e.t)} »`).join(', ')}</p>` : ''}
      ${rappels.length ? `<p class="an-note"><strong>Gags repris :</strong> ${rappels.map(g => `« ${esc(g.t)} »`).join(', ')}</p>` : ''}
      ${rappels2.length ? `<div><p class="an-label">À placer</p>${rappels2.map(r => `<p class="an-note">${dialogue.includes(this._plat(r)) ? '✓' : '○'} ${esc(r)}</p>`).join('')}</div>` : ''}
      ${faits.length ? `<div><p class="an-label">Continuité</p>${faits.map(f => `<p class="an-note">${esc(f.t)}${f.ep ? ` (${esc(f.ep)})` : ''}</p>`).join('')}</div>` : ''}
      ${voix.length ? `<div><p class="an-label">Test de voix</p>${voix.map(l => `<p class="an-note">${esc(l.nom)} : « ${esc(l.texte.slice(0, 90))} » sonne plutôt comme ${esc(l.proche)}</p>`).join('')}</div>` : ''}
    `;
  },

  // ─── Test de voix ────────────────────────────────────────────────────────

  // Vocabulaire de chaque personnage principal, à partir des épisodes écrits
  _modeleVoix() {
    const cle = `${this.portee}:${this.epId}`;
    if (this._modele?.cle === cle) return this._modele;
    const parole = AnalyseCalcul.agregerParole(this.ecritsAvant());
    const persos = this.d.persos.filter(p => p.g === 'p' && parole.get(p.n)).map(p => parole.get(p.n));
    const index = new Map(this.d.vocab.map((m, i) => [m, i]));
    this._modele = { cle, persos, index };
    return this._modele;
  },

  // Compare une réplique au vocabulaire du personnage et à celui des autres
  testVoix(replique, nom) {
    const { persos, index } = this._modeleVoix();
    const moi = persos.find(p => p.nom === nom);
    if (!moi || persos.length < 2) return null;
    const mots = this._plat(replique).replace(/’/g, "'").match(/[a-z]{4,}/g) || [];
    const connus = mots.map(m => index.get(m)).filter(i => i !== undefined && persos.reduce((a, p) => a + (p.compte.get(i) || 0), 0) >= 20);
    if (connus.length < 5) return null;
    const score = p => connus.reduce((a, i) => a + Math.log(((p.compte.get(i) || 0) + 0.5) / p.mots), 0);
    const propre = score(moi);
    const autre = persos.filter(p => p !== moi).map(p => ({ nom: p.nom, s: score(p) })).sort((a, b) => b.s - a.s)[0];
    return (autre.s - propre) / connus.length > 0.3 ? autre.nom : null;
  },

  _alertesVoix(b) {
    return b.lignes.map(l => {
      const connu = this._persoConnu(l.qui);
      return connu ? { ...l, nom: connu.n, proche: this.testVoix(l.texte, connu.n) } : null;
    }).filter(l => l?.proche).slice(0, 6);
  },

  // ─── Mémoire à la demande ────────────────────────────────────────────────

  async memoire(champ) {
    const texte = champ.value.slice(champ.selectionStart, champ.selectionEnd).trim();
    this._majSuggestions(champ);
    this._marquerScene(champ);
    if (this._reprise()?.id === this.epId) this._noterReprise(champ);
    const debut = champ.value.lastIndexOf('\n', champ.selectionStart - 1) + 1;
    const fin = champ.value.indexOf('\n', champ.selectionStart);
    const ligne = champ.value.slice(debut, fin < 0 ? champ.value.length : fin);
    this._majFiche(texte || (/^[A-ZÀ-Ü][A-ZÀ-Ü' -]+$/.test(ligne.trim()) ? ligne.trim() : ''));
    const slot = document.getElementById('ec-memoire');
    if (!slot || texte.length < 3 || texte.length > 60 || texte === this._memoireTexte) return;
    this._memoireTexte = texte;
    const params = new URLSearchParams({ q: texte, limite: 6 });
    const r = await api.get(`ecriture_recherche&${params}`);
    if (texte !== this._memoireTexte) return;
    slot.innerHTML = `
      <p class="an-label">« ${esc(texte)} » : ${Analyse._fr(r.total)} fois</p>
      ${r.resultats.map(l => `<p class="ec-replique">${this._lien(`S${l.sa}E${String(l.n).padStart(2, '0')}`, 'ouvrirScene', `${l.id}:${l.sc}`)} ${l.qui ? `<strong>${esc(l.qui)}</strong>` : ''}${esc(l.texte)}</p>`).join('')}
    `;
  },

  // ─── Faits ──────────────────────────────────────────────────────────

  _faits() {
    try { return JSON.parse(this.notes.continuite || '[]'); } catch (e) { return []; }
  },

  async _ecrireFaits(liste) {
    await this.note('continuite', liste.length ? JSON.stringify(liste) : '');
    this.rendreVue();
  },

  retirerFait(n) {
    const liste = this._faits();
    liste.splice(Number(n), 1);
    this._ecrireFaits(liste);
  },

  faitsConcernes(texte) {
    const plat = this._plat(texte);
    return this._faits().filter(f => f.mots.split(',').map(m => this._plat(m).trim()).filter(Boolean).some(m => plat.includes(m)));
  },

  // ─── Mémoire : fils, faits, gags et sujets à vérifier dans une seule liste ─

  // Les états des personnages se chargent à part, comme les mentions des fils
  _etats() {
    if (this._et !== undefined || this._etCharge) return this._et || null;
    this._etCharge = true;
    api.get('etats').then(d => { this._et = d?.etats ? d : null; }).catch(() => { this._et = null; }).finally(() => {
      this._etCharge = false;
      if (this.vue === 'memoire') this.rendreVue();
    });
    return null;
  },

  _sectionEtats(e) {
    const d = this._etats();
    if (!d) return '';
    const actifs = Etats.actifs(d, this.epId);
    if (!actifs.length) return '';
    const alertes = new Set(d.alertes.filter(a => a.ep === this.epId).map(a => a.etat));
    const debut = id => { const ep = this.ordre[this.rang.get(id)]; return ep ? this._code(ep) : d.episodes.find(x => x.id === id)?.code || '?'; };
    return `
          <section class="an-carte">
            <h2 class="an-titre">États en cours dans ${esc(this._code(e))}</h2>
            <ul class="ec-liste">${actifs.map(s => `<li class="${alertes.has(s.id) ? 'ec-orange' : ''}"><span><strong>${esc(s.nom)}</strong> · ${esc(Etats._resume(s))}</span><span class="an-note">${s.type === 'absent' ? 'absent · ' : ''}depuis ${esc(debut(s.debut))}${alertes.has(s.id) ? ' · contredit ici' : ''}</span></li>`).join('')}</ul>
          </section>`;
  },

  // Les mentions des fils dans les scripts se chargent à part : la Mémoire s'affiche sans les attendre
  _filsMentions() {
    if (this._fm !== undefined || this._fmCharge) return this._fm || null;
    this._fmCharge = true;
    api.get('fils_mentions').then(d => { this._fm = d?.fils || {}; }).catch(() => { this._fm = null; }).finally(() => {
      this._fmCharge = false;
      if (this.vue === 'memoire') this.rendreVue();
    });
    return null;
  },

  async motsFil(id) {
    const m = this._fm?.[id];
    const mots = prompt('Mots-clés qui trahissent ce fil dans le texte, séparés par des virgules (vide : ceux du titre)', m && !m.auto ? m.mots.join(', ') : '');
    if (mots === null) return;
    const r = await api.post('fils_mentions', { id: Number(id), mots }).catch(() => ({ error: 'Le serveur ne répond pas.' }));
    if (r.error) { toast(r.error, 'error'); return; }
    this._fm = undefined;
    this.rendreVue();
  },

  async cloreFil(id) {
    const p = this.promesses.find(x => Number(x.id) === Number(id));
    if (!Array.isArray(p?.episodes_jalons)) { toast('Fil illisible : ouvre-le dans Thèmes', 'error'); return; }
    await api.put(`promesses/${id}`, { ...p, statut: 'payee' });
    this.promesses = await api.get('promesses');
    this._fm = undefined;
    toast('Fil clos');
    this.rendreVue();
  },

  _lignesMemoire() {
    const avant = this.ecritsAvant();
    const code = id => (this.rang.has(Number(id)) ? this._code(this.ordre[this.rang.get(Number(id))]) : '—');
    const dejaSuivis = new Set(this.promesses.map(p => this._plat(p.titre)));
    const statuts = [['suivi', 'Suivi'], ['relancer', 'À relancer'], ['use', 'Usé'], ['', 'Ne plus suivre']];
    const filtres = { tous: () => true, use: e => e.use, dormant: e => e.dormant, suivi: e => e.statut };

    // Chaque fil est cherché dans les scripts : celui qu'on ne reprend jamais, ou qu'on laisse pendre, se voit
    const fm = this._filsMentions();
    const etiquettes = { introuvable: 'introuvable', jamais: 'jamais repris', pendant: 'laissé pendant', rappel: 'à rappeler' };
    const fils = this.promesses.filter(p => p.statut === 'ouverte' || fm?.[p.id]?.alerte?.type === 'rappel').map(p => {
      const m = fm?.[p.id];
      const eps = m?.eps || [];
      const al = m?.alerte;
      const texte = !al ? '' : { introuvable: 'Introuvable dans les scripts : donne-lui des mots-clés.', jamais: `Posé en ${code(al.ep)}, jamais repris depuis.`, pendant: `Plus mentionné depuis ${code(al.ep)} (${al.depuis} épisodes).`, rappel: `Résolu en ${code(al.fin)}, mais plus évoqué depuis ${code(al.ep)} : un rappel avant ?` }[al.type];
      return {
        type: 'fil', nom: p.statut === 'ouverte' ? 'Fil' : 'Fil clos', plat: `${p.titre} ${m?.mots.join(' ') || ''}`,
        quoi: `${esc(p.titre)}${m?.alerte ? ` <span class="ec-pastille ec-alerte" title="${esc(texte)}">${etiquettes[m.alerte.type]}</span>` : ''}`,
        info: [`lancé en ${code(p.episode_source_id)}`, p.description || '', eps.length ? `cité dans ${eps.length} épisode${eps.length > 1 ? 's' : ''} · dernier : ${code(eps[eps.length - 1].ep)}` : '', texte, m ? `mots : ${m.mots.join(', ')}${m.auto ? ' (tirés du titre)' : ''}` : ''].filter(Boolean).map(esc).join(' · '),
        actions: `${this._lienPlacer(p.titre)} · ${this._lien('Mots-clés', 'motsFil', p.id)}${p.statut === 'ouverte' ? ` · ${this._lien('Clore', 'cloreFil', p.id)}` : ''}`,
      };
    });
    const faits = this._faits().map((f, n) => ({
      type: 'fait', nom: 'Fait', quoi: esc(f.t), plat: `${f.t} ${f.mots}`, info: [f.ep ? `lié à ${f.ep}` : '', f.mots ? `mots : ${f.mots}` : ''].filter(Boolean).join(' · ') || '—',
      actions: `${this._lienPlacer(f.t)} · ${this._lien('Modifier', 'modifierFait', n)} · ${this._lien('Retirer', 'retirerFait', n)}`,
    }));
    const gags = this.echos(avant).filter(e => e.statut || (e.nb >= this.echoMin && e.t.split(/\s+/).length >= this.echoLongueur))
      .filter(filtres[this.echoFiltre]).sort((a, b) => Boolean(b.statut) - Boolean(a.statut) || b.nb - a.nb).map(e => ({
        type: 'gag', nom: 'Gag', plat: e.t,
        quoi: `${esc(e.t)}${e.use ? ' <span class="ec-pastille">trop présente</span>' : ''}${e.dormant ? ' <span class="ec-pastille">endormie</span>' : ''}`,
        info: `${e.nb} épisodes · ${e.premier ? this._code(e.premier) : '—'} → ${e.dernier ? this._code(e.dernier) : '—'}${e.qui.length ? ` · ${e.qui.join(', ')}` : ''}`,
        actions: `${this._lienPlacer(e.t)} · ${e.statut ? `<select aria-label="Statut" data-t="${esc(e.t)}" onchange="Ecriture.setStatutGag(this)">${statuts.map(([v, l]) => `<option value="${v}" ${e.statut === v ? 'selected' : ''}>${l}</option>`).join('')}</select>` : this._lien('Suivre', 'suivreGag', e.t)}`,
      }));
    const sujets = this.sujets(avant).map(s => ({
      type: 'verifier', nom: 'À vérifier', quoi: this._lien(esc(s.mot), 'retrouverMot', s.mot), plat: s.mot, info: `${s.n} fois · ${this._code(s.debut)} → ${this._code(s.fin)}`,
      actions: dejaSuivis.has(this._plat(s.mot)) ? 'Suivi' : this._lien('Suivre', 'suivreSujet', `${s.mot}|${s.debut.id}`),
    }));
    return [...fils, ...faits, ...gags, ...sujets];
  },

  vueMemoire() {
    const termes = this._plat(this.memQ).split(/\s+/).filter(Boolean);
    const toutes = this._lignesMemoire().filter(l => termes.every(t => this._plat(`${l.plat} ${l.info}`).includes(t)));
    const nombre = t => toutes.filter(l => l.type === t).length;
    const liste = this.memFiltre === 'tout' ? toutes : toutes.filter(l => l.type === this.memFiltre);
    const onglets = [['tout', 'Tout', toutes.length], ['fil', 'Fils', nombre('fil')], ['fait', 'Faits', nombre('fait')], ['gag', 'Gags', nombre('gag')], ['verifier', 'À vérifier', nombre('verifier')],
      ['objets', 'Objets oubliés', this._objets ? this._objetsVisibles().length : '…']];
    // Les objets oubliés : leur propre liste, à la place du tableau
    if (this.memFiltre === 'objets') {
      return `<div class="an-ligne"><div class="ec-portee" role="group" aria-label="Filtrer">${onglets.map(([k, l, n]) => Analyse._bouton(`${l} (${n})`, this.memFiltre === k, `Ecriture.regler('memFiltre', '${k}')`)).join('')}</div></div>
        <section class="an-carte" id="ec-objets"><p class="an-note">Recherche des objets oubliés…</p></section>`;
    }
    const e = this.ordre[this.rang.get(this.epId)];
    const brouillon = this.notes[`brouillon:${this.epId}`] || '';
    const plat = this._plat(brouillon);
    const presents = [...this.faitsConcernes(brouillon).map(f => f.t), ...this.gags.filter(g => plat.includes(this._plat(g.t))).map(g => g.t)];
    const edition = this.memEdit === null ? null : this._faits()[this.memEdit];

    return `
      <div class="an-ligne">
        <input id="ec-mem-q" class="an-recherche" type="text" aria-label="Chercher dans la Mémoire" placeholder="Chercher un fil, un fait, un gag…" value="${esc(this.memQ)}" oninput="Ecriture.regler('memQ', this.value, 'ec-mem-q')">
        <div class="ec-portee" role="group" aria-label="Filtrer">${onglets.map(([k, l, n]) => Analyse._bouton(`${l} (${n})`, this.memFiltre === k, `Ecriture.regler('memFiltre', '${k}')`)).join('')}</div>
      </div>
      ${this.memFiltre === 'gag' ? `<div class="an-ligne">
        ${this._choix('ec-echo-filtre', 'Voir', 'echoFiltre', [['tous', 'Tout'], ['use', 'Trop présentes'], ['dormant', 'Endormies'], ['suivi', 'Mes gags']])}
        ${this._nombre('ec-echo-min', '≥ épisodes', 'echoMin')}
        ${this._nombre('ec-echo-long', '≥ mots', 'echoLongueur')}
      </div>` : ''}
      <div class="ec-mem">
        <section class="an-carte">
          <div class="an-table"><table>
            <thead><tr><th>Type</th><th>Quoi</th><th>Dans la série</th><th></th></tr></thead>
            <tbody>${liste.slice(0, 200).map(l => `<tr><td><span class="ec-type ec-type-${l.type}">${esc(l.nom)}</span></td><td>${l.quoi}</td><td class="an-note">${esc(l.info)}</td><td class="ec-mem-actions">${l.actions}</td></tr>`).join('') || '<tr><td colspan="4" class="an-note">Rien avec ces filtres.</td></tr>'}</tbody>
          </table></div>
          ${liste.length > 200 ? `<p class="an-note">Les 200 premières lignes sur ${liste.length}. Cherche ou filtre pour voir le reste.</p>` : ''}
        </section>
        <aside class="ec-colonne">
          <section class="an-carte">
            <h2 class="an-titre">${edition ? 'Modifier le fait' : 'Ajouter à la Mémoire'}</h2>
            <div class="ec-mem-form">
              <label class="an-label" for="ec-mem-type">Type</label>
              <select id="ec-mem-type" ${edition ? 'disabled' : ''} onchange="Ecriture._majTypeMemoire(this.value)"><option value="fait">Fait</option><option value="fil">Fil</option><option value="gag">Gag</option></select>
              <label class="an-label" for="ec-fait">Quoi</label>
              <input id="ec-fait" type="text" placeholder="Paul est allergique aux noix" value="${esc(edition?.t || '')}">
              <label class="an-label ec-mem-fait" for="ec-fait-mots">Mots du rappel</label>
              <input id="ec-fait-mots" class="ec-mem-fait" type="text" placeholder="noix, allergie" value="${esc(edition?.mots || '')}">
              <label class="an-label ec-mem-ep" for="ec-fait-ep">Épisode</label>
              <input id="ec-fait-ep" class="ec-mem-ep" type="text" value="${esc(edition ? edition.ep : this._code(e))}">
              <button type="button" class="btn btn-primary btn-sm" onclick="Ecriture.ajouterMemoire()">${edition ? 'Enregistrer' : 'Ajouter'}</button>
              ${edition ? `<button type="button" class="btn btn-ghost btn-sm" onclick="Ecriture.regler('memEdit', null)">Annuler</button>` : ''}
            </div>
          </section>
          ${this._sectionEtats(e)}
          <section class="an-carte">
            <h2 class="an-titre">Dans le brouillon de ${esc(this._code(e))}</h2>
            ${presents.length ? `<ul class="ec-liste">${presents.map(t => `<li><span>${esc(t)}</span></li>`).join('')}</ul>` : '<p class="an-note">Les faits et gags dont les mots apparaissent s\'affichent ici.</p>'}
          </section>
        </aside>
      </div>
    `;
  },

  _objetsVisibles() {
    let ignores = [];
    try { ignores = JSON.parse(this.notes['objets-ignores'] || '[]'); } catch (e) { ignores = []; }
    return (this._objets?.objets || []).filter(o => !ignores.includes(o.mot));
  },

  // ─── Les fusils de Tchekhov : un objet mis en avant dans une didascalie, qui ne revient jamais ensuite ───

  async _chargerObjets() {
    const avant = this._objets;
    if (!this._objets || Date.now() - this._objetsLu > 60000) { this._objets = await api.get('objets_oublies').catch(() => null); this._objetsLu = Date.now(); }
    // Le nombre s'affiche sur le bouton dès que la liste est lue
    if (!avant && this._objets && this.vue === 'memoire') { this.rendreVue(); return; }
    this._rendreObjets();
  },

  _ignorerObjet(mot) {
    let ignores = [];
    try { ignores = JSON.parse(this.notes['objets-ignores'] || '[]'); } catch (e) { ignores = []; }
    this.note('objets-ignores', JSON.stringify([...new Set([...ignores, mot])].slice(-500)));
    this._rendreObjets();
  },

  _rendreObjets() {
    const slot = document.getElementById('ec-objets');
    const d = this._objets;
    if (!slot || !d) return;
    const liste = this._objetsVisibles();
    slot.innerHTML = `<div class="an-entete"><h2 class="an-titre">Objets jamais revenus</h2><span class="an-note">${liste.length} objet(s)</span></div>
      <p class="an-note">Le fusil de Tchekhov : un objet qu'on montre doit servir plus tard. Voici les objets mis en avant dans une didascalie (écrits en capitales, ou nommés plusieurs fois dans l'épisode) que la suite de la série ne mentionne plus jamais. Parfois c'est voulu : « ignorer » le retire de la liste. Une faute de frappe y apparaît aussi, puisqu'elle ne revient jamais.</p>
      ${liste.length ? `<ul class="ec-liste">${liste.map(o => `<li><span><strong>${esc(o.mot)}</strong> · ${this._lien(esc(o.code), 'ouvrirEpisode', o.ep)}${o.recent ? ' <span class="an-note">(épisode récent : la suite peut encore venir)</span>' : ''}<br><span class="an-note vo-brut">${esc(o.ligne)}</span></span><button type="button" class="ec-lien" onclick="Ecriture._ignorerObjet(this.dataset.mot)" data-mot="${esc(o.mot)}">ignorer</button></li>`).join('')}</ul>` : '<p class="an-note">Aucun objet oublié : tout ce qui est montré revient.</p>'}`;
  },

  _majTypeMemoire(type) {
    document.querySelectorAll('.ec-mem-fait').forEach(el => { el.hidden = type !== 'fait'; });
    document.querySelectorAll('.ec-mem-ep').forEach(el => { el.hidden = type === 'gag'; });
  },

  modifierFait(n) {
    this.memEdit = Number(n);
    this.rendreVue();
    document.getElementById('ec-fait')?.focus();
  },

  async ajouterMemoire() {
    const type = document.getElementById('ec-mem-type').value;
    const t = document.getElementById('ec-fait').value.trim();
    if (!t) return;
    const ep = document.getElementById('ec-fait-ep').value.trim();
    if (type === 'gag') { this.suivreGag(t); return; }
    if (type === 'fil') {
      const cible = this.ordre.find(e => this._plat(this._code(e)) === this._plat(ep));
      await api.post('promesses', { titre: t, episode_source_id: cible?.id || this.epId, statut: 'ouverte', type_promesse: 'autre' });
      this.promesses = await api.get('promesses');
      this._fm = undefined;
      this.rendreVue();
      return;
    }
    const fait = { t, mots: document.getElementById('ec-fait-mots').value.trim(), ep };
    const liste = this._faits();
    if (this.memEdit === null) liste.push(fait);
    else liste[this.memEdit] = fait;
    this.memEdit = null;
    this._ecrireFaits(liste);
  },

  // ─── Objectifs ───────────────────────────────────────────────────────────

  _jour: (decalage = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - decalage);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  _objectif() {
    try { return JSON.parse(this.notes.objectifs || '{}'); } catch (e) { return {}; }
  },

  _seances() {
    try { return JSON.parse(this.notes.seances || '{}'); } catch (e) { return {}; }
  },

  setObjectif(cle, valeur) {
    this.noterPlusTard('objectifs', JSON.stringify({ ...this._objectif(), [cle]: valeur }));
    this._majObjectifs();
  },

  // Seuls les mots ajoutés comptent : effacer ne retire rien à la séance
  _compterSeance(avant, apres) {
    const gain = apres - avant;
    if (gain <= 0 || gain > 200) return;
    const seances = this._seances();
    seances[this._jour()] = (seances[this._jour()] || 0) + gain;
    this.noterPlusTard('seances', JSON.stringify(seances));
    // L'heure aussi, pour le bilan de l'année (« ton heure préférée »)
    let heures = {};
    try { heures = JSON.parse(this.notes['seances-heures'] || '{}') || {}; } catch (e) { heures = {}; }
    const h = `${new Date().getFullYear()}:${new Date().getHours()}`;
    heures[h] = (heures[h] || 0) + gain;
    this.noterPlusTard('seances-heures', JSON.stringify(heures));
  },

  _bilanObjectifs() {
    const o = this._objectif();
    const seances = this._seances();
    const reste = this.ordre.filter(e => !e.x).length;
    const m = this.moyennes(this.ordre.filter(e => e.x));
    const jours = o.date ? Math.ceil((new Date(`${o.date}T23:59:59`) - new Date()) / 86400000) : null;
    return {
      aujourdhui: seances[this._jour()] || 0, sept: Array.from({ length: 7 }, (_, i) => seances[this._jour(i)] || 0).reduce((a, b) => a + b, 0),
      reste, jours, parSemaine: jours > 0 ? Math.ceil((reste * 7) / jours * 10) / 10 : null,
      parJour: jours > 0 ? Math.ceil((reste * m.mots) / jours) : null, objectif: Number(o.motsJour) || 0,
    };
  },

  _majObjectifs() {
    const slot = document.getElementById('ec-objectifs');
    if (!slot) return;
    const b = this._bilanObjectifs();
    const seances = this._seances();
    const quatorze = Array.from({ length: 14 }, (_, i) => this._jour(13 - i));
    const max = Math.max(1, b.objectif, ...quatorze.map(j => seances[j] || 0));
    slot.innerHTML = `
      ${Analyse._kpis([
        { l: "Aujourd'hui", v: Analyse._fr(b.aujourdhui), s: b.objectif ? `sur ${Analyse._fr(b.objectif)} mots` : 'mots' },
        { l: '7 derniers jours', v: Analyse._fr(b.sept), s: 'mots' },
        { l: 'Épisodes à écrire', v: b.reste },
        { l: 'Jours restants', v: b.jours === null ? '—' : b.jours },
        { l: 'Rythme nécessaire', v: b.parSemaine === null ? '—' : `${Analyse._num(b.parSemaine)}`, s: 'épisodes par semaine' },
        { l: 'Soit par jour', v: b.parJour === null ? '—' : Analyse._fr(b.parJour), s: 'mots' },
      ])}
      <section class="an-carte">
        <h2 class="an-titre">Mots écrits par jour</h2>
        <div class="ec-barres" role="img" aria-label="Mots écrits sur les 14 derniers jours">${quatorze.map(j => `<div class="ec-barre-col" title="${j} : ${Analyse._fr(seances[j] || 0)} mots"><span style="height:${Math.round(((seances[j] || 0) * 100) / max)}%"></span></div>`).join('')}</div>
        <div class="ec-barres-axe"><span class="an-note">${quatorze[0].slice(5)}</span><span class="an-note">aujourd'hui</span></div>
      </section>
      ${this._htmlCourbeLongue(seances)}
      ${this._htmlSprints()}
    `;
  },

  _htmlSprints() {
    let l = [];
    try { l = JSON.parse(this.notes.sprints || '[]'); } catch (e) { l = []; }
    if (!Array.isArray(l) || !l.length) return '<section class="an-carte"><h2 class="an-titre">Sprints</h2><p class="an-note">En mode concentration, ⏱ Sprint lance 25 minutes chronométrées : les sprints faits s\'afficheront ici.</p></section>';
    const moy = Math.round(l.reduce((t, x) => t + x.mots, 0) / l.length);
    const record = l.reduce((m, x) => (x.mots > m.mots ? x : m), l[0]);
    return `<section class="an-carte"><div class="an-entete"><h2 class="an-titre">Sprints</h2><span class="an-note">${l.length} sprint(s) · ${moy} mots en moyenne · record ${record.mots} mots</span></div>
      <ul class="ec-liste">${l.slice(-8).reverse().map(x => `<li><span>${esc(new Date(x.date).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }))}</span><span>${x.mots} mots en ${x.minutes} min</span></li>`).join('')}</ul></section>`;
  },

  // Les mots par semaine sur six mois, et le total de chaque mois : le rythme dans la durée
  _htmlCourbeLongue(seances) {
    const jours = Object.keys(seances).filter(j => /^\d{4}-\d{2}-\d{2}$/.test(j)).sort();
    if (!jours.length) return '';
    const lundi = d => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
    const semaines = Array.from({ length: 26 }, (_, i) => lundi(this._jour((25 - i) * 7)));
    const parSemaine = Object.fromEntries(semaines.map(s => [s, 0]));
    const parMois = {};
    for (const j of jours) {
      const n = Number(seances[j]) || 0;
      const s = lundi(j);
      if (s in parSemaine) parSemaine[s] += n;
      parMois[j.slice(0, 7)] = (parMois[j.slice(0, 7)] || 0) + n;
    }
    const valeurs = semaines.map(s => parSemaine[s]);
    const max = Math.max(1, ...valeurs);
    const actives = valeurs.filter(v => v > 0);
    const moyenne = actives.length ? Math.round(actives.reduce((a, b) => a + b, 0) / actives.length) : 0;
    const mois = Object.keys(parMois).sort().slice(-12);
    const nomMois = m => new Date(`${m}-15T12:00:00`).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
    const court = d => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return `<section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Mots écrits par semaine, sur six mois</h2><span class="an-note">${actives.length} semaine(s) d'écriture · ${Analyse._fr(moyenne)} mots en moyenne quand tu écris</span></div>
        <div class="ec-barres" role="img" aria-label="Mots écrits par semaine sur les 26 dernières semaines">${semaines.map((s, i) => `<div class="ec-barre-col" title="Semaine du ${court(s)} : ${Analyse._fr(valeurs[i])} mots"><span style="height:${Math.round((valeurs[i] * 100) / max)}%"></span></div>`).join('')}</div>
        <div class="ec-barres-axe"><span class="an-note">${court(semaines[0])}</span><span class="an-note">cette semaine</span></div>
        ${mois.length > 1 ? `<table class="an-table ec-mois"><caption class="an-note">Par mois</caption><tbody><tr>${mois.map(m => `<th scope="col">${esc(nomMois(m))}</th>`).join('')}</tr><tr>${mois.map(m => `<td>${Analyse._fr(parMois[m])}</td>`).join('')}</tr></tbody></table>` : ''}
      </section>`;
  },

  vueObjectifs() {
    const o = this._objectif();
    return `
      <div class="an-ligne">
        <label class="an-label" for="ec-obj-mots">Mots par jour</label>
        <input id="ec-obj-mots" class="an-nombre" type="number" min="0" value="${esc(o.motsJour || '')}" placeholder="—" oninput="Ecriture.setObjectif('motsJour', this.value)">
        <label class="an-label" for="ec-obj-date">Finir les épisodes le</label>
        <input id="ec-obj-date" type="date" value="${esc(o.date || '')}" onchange="Ecriture.setObjectif('date', this.value)">
        <span class="an-note">Les mots comptés sont ceux tapés dans le Brouillon.</span>
      </div>
      <div class="an-vue" id="ec-objectifs"></div>
    `;
  },

  // ─── Roman : point de vue, rythme, fins, temps du récit, fils ────────────

  vueRoman() {
    return '<div class="an-vue" id="ec-roman"><p class="an-note">Lecture des chapitres…</p></div>';
  },

  async _chargerRoman() {
    this.roman = await api.get('ecriture_roman');
    this._rendreRoman();
  },

  _rendreRoman() {
    const slot = document.getElementById('ec-roman');
    if (!slot || !this.roman) return;
    const chapitres = this.ensemble().filter(e => this.roman[e.id]).map(e => ({ e, ...this.roman[e.id] }));
    if (!chapitres.length && this.vue !== 'temps' && this.vue !== 'fils') {
      slot.innerHTML = '<section class="an-carte"><p class="an-note">Aucun chapitre importé dans ce choix. Importe le manuscrit dans Config → Projets.</p></section>';
      return;
    }
    slot.innerHTML = { pov: () => this._vuePov(chapitres), rythme: () => this._vueRythme(chapitres), fins: () => this._vueFins(chapitres), temps: () => this._vueTemps(), fils: () => this._vueFils() }[this.vue]();
  },

  // Une note abîmée ou « null » compte comme vide, plutôt que de faire planter la vue
  _choixRoman(cle) {
    try {
      const v = JSON.parse(this.notes[cle] || '{}');
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch (e) { return {}; }
  },

  setChoixRoman(cle, id, valeur) {
    const choix = this._choixRoman(cle);
    if (valeur) choix[id] = valeur;
    else delete choix[id];
    this.noterPlusTard(cle, JSON.stringify(choix));
    this._rendreRoman();
    document.getElementById(`ec-${cle}-${id}`)?.focus();
  },

  _povDe(c) {
    return this._choixRoman('roman-pov')[c.e.id] || c.pov;
  },

  _vuePov(chapitres) {
    const povs = chapitres.map(c => this._povDe(c));
    const narrateurs = [...new Set(povs.filter(Boolean))].sort((a, b) => povs.filter(p => p === b).length - povs.filter(p => p === a).length);
    const sans = povs.filter(p => !p).length;
    const alertes = narrateurs.map(n => {
      const dernier = povs.lastIndexOf(n);
      const ecart = povs.length - 1 - dernier;
      const nb = povs.filter(p => p === n).length;
      return `<li class="${ecart >= 4 ? 'ec-orange' : ''}"><span>${esc(n)} · ${nb} chapitre${nb > 1 ? 's' : ''}</span><span>${ecart === 0 ? 'raconte le dernier' : ecart >= 4 ? `muet depuis ${ecart} chapitres` : `il y a ${ecart} chapitre(s)`}</span></li>`;
    });
    const choix = this._choixRoman('roman-pov');
    const noms = [...new Set(['Je', ...this.d.persos.filter(p => p.g === 'p').map(p => p.n), ...narrateurs])];
    return `
      <div class="ec-dep-grille">
        <section class="an-carte">
          <h2 class="an-titre">Qui raconte chaque chapitre</h2>
          ${narrateurs.length ? narrateurs.map(n => `<div class="ec-pov-ligne"><span class="ec-pov-nom">${esc(n)}</span><div class="ec-pov-cases">${chapitres.map((c, i) => `<span class="ec-pov-case" title="${esc(this._code(c.e))}${povs[i] === n ? ` : ${esc(n)}` : ''}" style="${povs[i] === n ? `background:${Analyse._couleur(n)}` : ''}">${povs[i] === n ? c.e.n : ''}</span>`).join('')}</div></div>`).join('') : '<p class="an-note">Aucun narrateur reconnu pour l\'instant.</p>'}
          <p class="an-note">Une case pleine : ce personnage raconte le chapitre. Le chiffre est le numéro du chapitre.${sans ? ` ${sans} chapitre(s) sans narrateur reconnu.` : ''}</p>
        </section>
        <section class="an-carte">
          <h2 class="an-titre">À surveiller</h2>
          ${alertes.length ? `<ul class="ec-liste">${alertes.join('')}</ul>` : '<p class="an-note">Rien à signaler.</p>'}
          <p class="an-note">Proposé d'après le texte : « Je » si la narration est à la première personne, sinon le personnage le plus nommé dans la narration. Corrige-le chapitre par chapitre.</p>
        </section>
      </div>
      <details class="an-carte">
        <summary class="an-titre">Corriger le narrateur</summary>
        <div class="an-table"><table>
          <thead><tr><th scope="col">Chapitre</th><th scope="col">Titre</th><th scope="col">Proposé</th><th scope="col">Narrateur</th></tr></thead>
          <tbody>${chapitres.map(c => `<tr><td>${this._lien(esc(this._code(c.e)), 'ouvrirEpisode', c.e.id)}</td><td>${esc(c.e.t || 'Sans titre')}</td><td class="an-note">${esc(c.pov || '—')}</td>
            <td><select id="ec-roman-pov-${c.e.id}" aria-label="Narrateur de ${esc(this._code(c.e))}" onchange="Ecriture.setChoixRoman('roman-pov', ${c.e.id}, this.value)"><option value="">${c.pov ? `Proposé : ${esc(c.pov)}` : '—'}</option>${noms.map(n => `<option ${choix[c.e.id] === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></td></tr>`).join('')}</tbody>
        </table></div>
      </details>
    `;
  },

  _vueRythme(chapitres) {
    const tri = chapitres.map(c => c.mots).sort((a, b) => a - b);
    const med = tri[Math.floor(tri.length / 2)] || 0;
    const max = Math.max(1, ...tri);
    const repliques = chapitres.reduce((a, c) => a + c.repliques, 0);
    const inconnues = chapitres.reduce((a, c) => a + c.inconnu, 0);
    const livres = [...new Set(chapitres.map(c => c.e.sa))];
    const moyenne = l => Math.round(l.reduce((a, c) => a + c.mots, 0) / (l.length || 1));
    return `
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Longueur des chapitres et part de dialogue</h2><span class="an-note">médiane ${med.toLocaleString('fr-FR')} mots · ${Math.round(med / 250)} min de lecture</span></div>
        <div class="ec-rythme">${chapitres.map(c => {
          const long = c.mots >= 1.5 * med, court = c.mots <= 0.5 * med, sec = c.dialogue < 15;
          const signe = [long && 'long', court && 'court', sec && 'peu de dialogue'].filter(Boolean);
          return `<div class="ec-rythme-ligne"><span>${this._lien(esc(this._code(c.e)), 'ouvrirEpisode', c.e.id)}</span><div class="ec-rythme-barre" aria-hidden="true"><i style="width:${Math.round(c.mots / max * 100)}%"></i></div><span class="${signe.length ? 'ec-orange' : ''}">${c.mots.toLocaleString('fr-FR')} · ${c.dialogue} %${signe.length ? ` · ${signe.join(', ')}` : ''}</span></div>`;
        }).join('')}</div>
        <p class="an-note">Barre : nombre de mots. À droite : mots, puis part des mots dits en dialogue. Signalé : une fois et demie plus long que la médiane, moitié moins long, ou moins de 15 % de dialogue.</p>
      </section>
      ${Roman.plusieurs && livres.length > 1 ? `<section class="an-carte"><h2 class="an-titre">Par livre</h2><div class="an-table"><table><thead><tr><th scope="col">Livre</th><th scope="col">Chapitres</th><th scope="col">Mots</th><th scope="col">Mots par chapitre</th><th scope="col">Dialogue</th></tr></thead><tbody>${livres.map(n => {
        const l = chapitres.filter(c => c.e.sa === n);
        const mots = l.reduce((a, c) => a + c.mots, 0);
        return `<tr><td>Livre ${n}</td><td>${l.length}</td><td>${mots.toLocaleString('fr-FR')}</td><td>${moyenne(l).toLocaleString('fr-FR')}</td><td>${Math.round(l.reduce((a, c) => a + c.dialogue * c.mots, 0) / (mots || 1))} %</td></tr>`;
      }).join('')}</tbody></table></div></section>` : ''}
      <section class="an-carte">
        <h2 class="an-titre">Qui parle</h2>
        <p class="an-note">${repliques ? `${(repliques - inconnues).toLocaleString('fr-FR')} répliques sur ${repliques.toLocaleString('fr-FR')} attribuées à un personnage (${Math.round(100 * (repliques - inconnues) / repliques)} %). Les autres sont comptées sous « Inconnu » : une incise comme « dit Marie » ou une fiche personnage avec son genre aide à les reconnaître.` : 'Aucun dialogue repéré.'}</p>
      </section>
      <section class="an-carte" id="ec-tension"><p class="an-note">Calcul de la tension…</p></section>
    `;
  },

  _vueFins(chapitres) {
    const choix = this._choixRoman('roman-fins');
    const etiquettes = [['question', 'question ouverte'], ['revelation', 'révélation'], ['suspens', 'suspens'], ['plate', 'à plat']];
    let plates = 0;
    const lignes = chapitres.map(c => {
      const fin = choix[c.e.id] || c.fin;
      plates = fin === 'plate' ? plates + 1 : 0;
      return `<li class="ec-fin ${plates >= 3 ? 'ec-orange' : ''}">
        <div><strong>${this._lien(esc(this._code(c.e)), 'ouvrirEpisode', c.e.id)}</strong> ${esc(c.e.t || '')}${plates >= 3 ? ` · ${plates} fins à plat d'affilée` : ''}
          <p class="an-note vo-brut">« ${esc(c.phrase || '—')} »</p></div>
        <select id="ec-roman-fins-${c.e.id}" aria-label="Fin de ${esc(this._code(c.e))}" onchange="Ecriture.setChoixRoman('roman-fins', ${c.e.id}, this.value)">${etiquettes.map(([k, l]) => `<option value="${k === c.fin && !choix[c.e.id] ? '' : k}" ${k === fin ? 'selected' : ''}>${l}${k === c.fin && !choix[c.e.id] ? ' (proposé)' : ''}</option>`).join('')}</select>
      </li>`;
    });
    const compte = k => chapitres.filter(c => (choix[c.e.id] || c.fin) === k).length;
    return `
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Comment finit chaque chapitre</h2><span class="an-note">${etiquettes.map(([k, l]) => `${compte(k)} ${l}`).join(' · ')}</span></div>
        <ul class="ec-liste">${lignes.join('')}</ul>
        <p class="an-note">L'étiquette est proposée d'après la dernière phrase : « ? » donne une question, « … » ou « ! » du suspens. La révélation, c'est à toi de la marquer. Trois fins à plat d'affilée sont signalées.</p>
      </section>
    `;
  },

  _vueTemps() {
    const eps = this.ensemble();
    let plusTard = '';
    let avant = null;
    const lignes = eps.map(e => {
      const date = this._dateEp(e);
      const flash = Number(this.fiches.get(e.id)?.est_flashback);
      let note = '';
      if (date && plusTard && date < plusTard) note = flash ? 'retour en arrière (marqué)' : 'retour en arrière';
      else if (date && avant) {
        const jours = Math.round((new Date(date) - new Date(avant)) / 86400000);
        note = jours === 0 ? 'même jour' : `+${jours} j`;
      }
      if (date && !flash && date > plusTard) plusTard = date;
      if (date) avant = date;
      return `<tr class="${note.startsWith('retour') && !flash ? 'ec-orange' : ''}"><td>${this._lien(esc(this._code(e)), 'ouvrirEpisode', e.id)}</td><td>${esc(e.t || 'Sans titre')}</td>
        <td><input type="date" aria-label="Date du récit pour ${esc(this._code(e))}" value="${esc(date)}" onchange="Ecriture.setDate(${e.id}, this.value)"></td><td>${esc(note)}</td></tr>`;
    });
    const dates = eps.map(e => this._dateEp(e)).filter(Boolean).sort();
    const retours = lignes.filter(l => l.includes('ec-orange')).length;
    const duree = dates.length > 1 ? Math.round((new Date(dates[dates.length - 1]) - new Date(dates[0])) / 86400000) : 0;
    return `
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Le temps du récit dans l'ordre de lecture</h2><span class="an-note">${dates.length} chapitre(s) daté(s) sur ${eps.length}${duree ? ` · l'histoire couvre ${duree} jours` : ''}${retours ? ` · ${retours} retour(s) en arrière non marqué(s)` : ''}</span></div>
        <div class="an-table"><table><thead><tr><th scope="col">Chapitre</th><th scope="col">Titre</th><th scope="col">Date dans l'histoire</th><th scope="col">Écart</th></tr></thead><tbody>${lignes.join('')}</tbody></table></div>
        <p class="an-note">Un chapitre daté avant un chapitre déjà lu est un retour en arrière. Marque-le comme flashback dans sa fiche pour qu'il ne soit plus signalé.</p>
      </section>
    `;
  },

  _vueFils() {
    const ids = new Set(this.ensemble().map(e => e.id));
    const ep = id => this.ordre[this.rang.get(Number(id))];
    const fils = this.promesses.map(p => ({ p, source: ep(p.episode_source_id), fin: ep(p.episode_resolution_id) })).filter(f => f.source && ids.has(f.source.id));
    const dernier = this.ordre.filter(e => e.x).pop();
    const ouverts = fils.filter(f => f.p.statut === 'ouverte');
    const fermes = fils.filter(f => f.p.statut !== 'ouverte');
    const ligne = f => {
      const traverse = f.fin && f.fin.sa !== f.source.sa;
      const ecart = !f.fin && dernier ? this.rang.get(dernier.id) - this.rang.get(f.source.id) : 0;
      return `<li><span>${esc(f.p.titre)}</span><span class="an-note">${this._lien(esc(this._code(f.source)), 'ouvrirEpisode', f.source.id)}${f.fin ? ` → ${this._lien(esc(this._code(f.fin)), 'ouvrirEpisode', f.fin.id)}${traverse ? ' · traverse les livres' : ''}` : ` · ouvert depuis ${ecart} chapitre(s)`}</span></li>`;
    };
    const parLivre = Roman.plusieurs ? [...new Set(ouverts.map(f => f.source.sa))].sort((a, b) => a - b) : [null];
    return `
      <div class="ec-dep-grille">
        <section class="an-carte">
          <div class="an-entete"><h2 class="an-titre">Fils encore ouverts</h2>${this._lien('Ajouter dans Mémoire →', 'aller', 'memoire')}</div>
          ${ouverts.length ? parLivre.map(n => `${n !== null ? `<h3 class="an-label">Ouverts dans le livre ${n}</h3>` : ''}<ul class="ec-liste">${ouverts.filter(f => n === null || f.source.sa === n).map(ligne).join('')}</ul>`).join('') : '<p class="an-note">Aucun fil ouvert. Note les promesses faites au lecteur dans Mémoire.</p>'}
        </section>
        <section class="an-carte">
          <h2 class="an-titre">Fils refermés</h2>
          ${fermes.length ? `<ul class="ec-liste">${fermes.map(ligne).join('')}</ul>` : '<p class="an-note">Aucun fil refermé pour l\'instant.</p>'}
          ${Roman.plusieurs ? `<p class="an-note">${fermes.filter(f => f.fin && f.fin.sa !== f.source.sa).length} fil(s) ouvert(s) dans un livre et refermé(s) dans un autre.</p>` : ''}
        </section>
      </div>
    `;
  },

  // ─── Film : structure en actes, séquences, personnages par acte ──────────

  vueFilm() {
    return '<div class="an-vue" id="ec-film"><p class="an-note">Lecture du scénario…</p></div>';
  },

  async _chargerFilm() {
    [this.film, this.revisions, this.prodPlans] = await Promise.all([api.get('ecriture_film'), api.get('ecriture_film_revisions'), Roman.storyboard ? api.get('ecriture_sb_tous') : []]);
    this._rendreFilm();
  },

  _rendreFilm() {
    const slot = document.getElementById('ec-film');
    if (!slot || !this.film) return;
    if (!this.film.length) {
      slot.innerHTML = '<section class="an-carte"><p class="an-note">Aucune séquence pour l\'instant. Importe le scénario dans Config → Projets.</p></section>';
      return;
    }
    slot.innerHTML = { actes: () => this._vueActes(), sequences: () => this._vueSequences(), parActe: () => this._vueParActe(), travail: () => this._vueTravail(), revisions: () => this._vueRevisions() }[this.vue]();
  },

  _pages(p) {
    const e = Math.floor(p), h = Math.round((p - e) * 8);
    return `${e || (h ? '' : '0')}${h ? `${e ? ' ' : ''}${h}/8` : ''}`;
  },

  _minutes(p) {
    const m = Math.round(p);
    return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
  },

  // Où tombent d'habitude les grands moments, en part du film
  _pivotsFilm() {
    return [['declencheur', 'Élément déclencheur', 0.08, 0.15], ['pivot1', 'Pivot 1', 0.2, 0.3], ['median', 'Point médian', 0.45, 0.55], ['pivot2', 'Pivot 2', 0.7, 0.82], ['climax', 'Climax', 0.85, 0.96]];
  },

  _vueActes() {
    const seqs = this.film;
    const total = seqs.reduce((a, s) => a + s.pages, 0) || 1;
    const debut = [];
    seqs.reduce((a, s, i) => { debut[i] = a; return a + s.pages; }, 0);
    const actes = this.ordre.filter(e => seqs.some(s => s.acte === e.id));
    const pagesActe = e => seqs.filter(s => s.acte === e.id).reduce((a, s) => a + s.pages, 0);
    const choix = this._choixRoman('film-pivots');
    const pct = p => Math.round(p / total * 1000) / 10;
    const couleurs = ['var(--accent)', '#9fb7e8', '#e8a85c', '#f08fb0', '#c9b8ff'];
    const pivots = this._pivotsFilm().map(([k, l, a, b]) => {
      const g = choix[k];
      const place = g !== undefined && seqs[g] ? debut[g] / total : null;
      return { k, l, a, b, g, place, hors: place !== null && (place < a || place > b) };
    });
    const optSeq = g => seqs.map(s => `<option value="${s.g}" ${s.g === g ? 'selected' : ''}>Séq. ${s.g + 1} · p. ${Math.floor(debut[s.g]) + 1} · ${esc(s.slug.slice(0, 46))}</option>`).join('');
    const cible = Roman.forme === 'court' ? [5, 30] : [90, 120];
    const parts = actes.map(e => pagesActe(e) / total);
    const alertes = [];
    pivots.filter(p => p.hors).forEach(p => alertes.push(`${p.l} à ${Math.round(p.place * 100)} % du film : d'habitude entre ${Math.round(p.a * 100)} et ${Math.round(p.b * 100)} %.`));
    if (actes.length === 3 && (parts[0] < 0.18 || parts[0] > 0.32)) alertes.push(`L'acte 1 fait ${Math.round(parts[0] * 100)} % du film : d'habitude entre 20 et 30 %.`);
    if (actes.length === 3 && (parts[1] < 0.4 || parts[1] > 0.6)) alertes.push(`L'acte 2 fait ${Math.round(parts[1] * 100)} % du film : d'habitude entre 40 et 55 %.`);
    if (total < cible[0] || total > cible[1]) alertes.push(`${this._pages(total)} pages : un ${Roman.forme === 'court' ? 'court' : 'long'} métrage en fait d'habitude entre ${cible[0]} et ${cible[1]}.`);
    return `
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Les actes, à la page</h2><span class="an-note">${this._pages(total)} p. · environ ${this._minutes(total)} · ${seqs.length} séquences</span></div>
        <div class="ec-film-frise">
          <div class="ec-film-actes">${actes.map((e, i) => `<span style="flex:${pagesActe(e)} 1 0;background:${couleurs[i % 5]}" title="${esc(this._code(e))} : ${this._pages(pagesActe(e))} p.">${esc(this._code(e))} · ${this._pages(pagesActe(e))} p.</span>`).join('')}</div>
          ${pivots.map(p => `<span class="ec-film-zone" style="left:${p.a * 100}%;width:${(p.b - p.a) * 100}%" title="${esc(p.l)} : d'habitude ici"></span>`).join('')}
          ${pivots.filter(p => p.place !== null).map(p => `<span class="ec-film-pivot ${p.hors ? 'ec-orange' : ''}" style="left:${pct(p.place * total)}%"><b>${esc(p.l)}</b><small>p. ${Math.floor(p.place * total) + 1}</small></span>`).join('')}
        </div>
        <div class="ec-film-reperes" aria-hidden="true"><span>p. 1</span><span>p. ${Math.round(total / 2)}</span><span>p. ${Math.round(total)}</span></div>
        <p class="an-note">Les cadres en pointillés montrent où ces moments tombent d'habitude. Place-les ci-dessous ; l'app ne les devine pas.</p>
      </section>
      <div class="ec-dep-grille">
        <section class="an-carte">
          <h2 class="an-titre">Les grands moments</h2>
          ${pivots.map(p => `<div class="ec-film-choix"><label class="an-label" for="ec-film-${p.k}">${esc(p.l)}</label><select id="ec-film-${p.k}" onchange="Ecriture.setPivot('${p.k}', this.value)"><option value="">Pas encore placé</option>${optSeq(p.g)}</select></div>`).join('')}
        </section>
        <section class="an-carte">
          <h2 class="an-titre">À surveiller</h2>
          ${alertes.length ? `<ul class="ec-liste">${alertes.map(a => `<li class="ec-orange"><span>${esc(a)}</span></li>`).join('')}</ul>` : '<p class="an-note">Rien à signaler : les actes et les moments placés tombent dans les zones habituelles.</p>'}
          ${actes.length > 1 ? `<h3 class="an-label">Où commence chaque acte</h3>
          ${actes.slice(1).map((e, i) => {
            const premier = seqs.find(s => s.acte === e.id);
            return `<div class="ec-film-choix"><label class="an-label" for="ec-film-coupe-${i}">${esc(this._code(e))} commence à</label><select id="ec-film-coupe-${i}" onchange="Ecriture.couperActe(${i}, this.value)">${optSeq(premier.g)}</select></div>`;
          }).join('')}
          <p class="an-note">Déplacer une coupure réécrit les actes concernés : le scénario ne change pas d'un mot.</p>` : ''}
        </section>
      </div>
    `;
  },

  setPivot(cle, valeur) {
    const choix = this._choixRoman('film-pivots');
    if (valeur === '') delete choix[cle];
    else choix[cle] = Number(valeur);
    this.noterPlusTard('film-pivots', JSON.stringify(choix));
    this._rendreFilm();
    document.getElementById(`ec-film-${cle}`)?.focus();
  },

  async couperActe(i, valeur) {
    const actes = this.ordre.filter(e => this.film.some(s => s.acte === e.id));
    const coupes = actes.slice(1).map(e => this.film.find(s => s.acte === e.id).g);
    coupes[i] = Number(valeur);
    if (coupes.some((c, j) => j && c <= coupes[j - 1])) { toast('Chaque acte doit garder au moins une séquence, dans l\'ordre.', 'error'); this._rendreFilm(); return; }
    const res = await api.post('ecriture_film_actes', { coupes });
    if (res.error) { toast(res.error, 'error'); this._rendreFilm(); return; }
    toast('Actes recoupés', 'success');
    window.DataStore?.invalidateForMutation('upload');
    await this.init();
  },

  _vueSequences() {
    const seqs = this.film;
    const ids = new Set(this.ensemble().map(e => e.id));
    const liste = seqs.filter(s => ids.has(s.acte));
    const total = liste.reduce((a, s) => a + s.pages, 0);
    const longue = Roman.forme === 'court' ? 3 : 4;
    const nb = f => liste.filter(f).length;
    const acte = id => this.ordre[this.rang.get(id)];
    return `
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Les séquences</h2><span class="an-note">${liste.length} séquences · ${this._pages(total)} p. · ${nb(s => !s.ext)} INT. / ${nb(s => s.ext)} EXT. · ${nb(s => s.moment === 'NUIT')} de nuit</span></div>
        <div class="an-table"><table>
          <thead><tr><th scope="col">N°</th>${this.revisions?.length ? '<th scope="col">Version</th>' : ''}<th scope="col">Acte</th><th scope="col">En-tête</th><th scope="col">Pages</th><th scope="col">Personnages</th></tr></thead>
          <tbody>${liste.map(s => `<tr class="${s.pages > longue ? 'ec-orange' : ''}"><td>${s.g + 1}</td>${this.revisions?.length ? `<td>${(r => (r ? `<span class="ec-rev" style="background:${this._couleurRev(r.couleur)}" title="Texte de la version ${esc(r.couleur.toLowerCase())}"></span>${esc(r.couleur)}` : '<span class="ec-rev nouvelle" title="Changée depuis la dernière version figée"></span>changée'))(this._revisionSeq(s))}</td>` : ''}<td>${this._lien(esc(this._code(acte(s.acte))), 'ouvrirEpisode', s.acte)}</td><td class="vo-brut">${esc(s.slug)}</td><td>${this._pages(s.pages)}</td><td>${esc(s.persos.join(', ') || '—')}</td></tr>`).join('')}</tbody>
        </table></div>
        <p class="an-note">Les pages se comptent au huitième, comme sur un plan de travail, d'après la place que prendrait le texte mis en page (environ 54 lignes par page). Une séquence de plus de ${longue} pages est signalée.</p>
      </section>
    `;
  },

  _vueParActe() {
    const actes = this.ordre.filter(e => this.film.some(s => s.acte === e.id));
    // Les répliques se comptent dans le scénario lui-même : pas besoin de fiche personnage
    const parActe = actes.map(e => {
      const compte = new Map();
      this.film.filter(s => s.acte === e.id).forEach(s => Object.entries(s.repliques || {}).forEach(([n, v]) => compte.set(n, (compte.get(n) || 0) + v)));
      return compte;
    });
    const totaux = parActe.map(c => [...c.values()].reduce((a, v) => a + v, 0) || 1);
    const noms = [...new Set(parActe.flatMap(c => [...c.keys()]))]
      .map(n => ({ n, parts: parActe.map((c, i) => Math.round(100 * (c.get(n) || 0) / totaux[i])) }))
      .sort((a, b) => b.parts.reduce((x, y) => x + y, 0) - a.parts.reduce((x, y) => x + y, 0))
      .slice(0, 12);
    const trous = noms.filter(p => p.parts.some(v => v >= 15) && p.parts.some(v => v < 5));
    return `
      <section class="an-carte">
        <h2 class="an-titre">Qui porte chaque acte</h2>
        <div class="an-table"><table>
          <thead><tr><th scope="col">Personnage</th>${actes.map(e => `<th scope="col">${esc(this._code(e))}</th>`).join('')}</tr></thead>
          <tbody>${noms.map(p => `<tr><td>${this._lien(esc(p.n), 'voirPerso', p.n)}</td>${p.parts.map(v => `<td><div class="ec-film-part"><i style="width:${Math.min(100, v * 2)}%;background:${v < 5 ? 'var(--orange)' : 'var(--accent)'}"></i><span>${v} %</span></div></td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>
        <p class="an-note">Part des répliques de chaque acte.${trous.length ? ` À regarder : ${trous.map(p => esc(p.n)).join(', ')} porte${trous.length > 1 ? 'nt' : ''} un acte mais disparaî${trous.length > 1 ? 'ssent' : 't'} presque d'un autre.` : ''}</p>
      </section>
    `;
  },

  // ─── BD : planches, bulles, tourne de page, découpage ────────────────────

  vueBD() {
    return '<div class="an-vue" id="ec-bd"><p class="an-note">Lecture des planches…</p></div>';
  },

  async _chargerBD() {
    this.bdData = await api.get('ecriture_bd');
    this._rendreBD();
  },

  _rendreBD() {
    const slot = document.getElementById('ec-bd');
    if (!slot || !this.bdData) return;
    const planches = this.ensemble().filter(e => this.bdData.planches[e.id]).map(e => ({ e, ...this.bdData.planches[e.id] }));
    if (!planches.length) {
      slot.innerHTML = '<section class="an-carte"><p class="an-note">Aucune planche importée dans ce choix. Importe le scénario dans Config → Projets.</p></section>';
      return;
    }
    slot.innerHTML = { planches: () => this._vuePlanches(planches), bulles: () => this._vueBulles(planches), tourne: () => this._vueTourne(planches), decoupage: () => this._vueDecoupage(planches), cheminfer: () => this._vueCheminFer(planches) }[this.vue]();
  },

  // Les bandes d'une planche : le gabarit du storyboard s'il existe, sinon trois cases au plus par bande
  _bandes(e, nb) {
    try {
      const g = JSON.parse(this.notes[`sb-gabarit:${e.id}`] || 'null');
      if (g?.bandes && g.bandes.flatMap(b => b.cases).length === nb) return g.bandes;
    } catch (err) {}
    return Storyboard.gabaritDefaut(nb).bandes;
  },

  _vuePlanches(planches) {
    const [min, max] = BD_CASES_NORME[Roman.format] || [6, 9];
    const maxMots = Math.max(1, ...planches.flatMap(p => p.cases.map(c => c.mots)));
    return `
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Chaque planche, en cases et en mots</h2><span class="an-note">${planches.length} planches · ${planches.reduce((a, p) => a + p.cases.length, 0)} cases · ${planches.reduce((a, p) => a + p.mots, 0).toLocaleString('fr-FR')} mots</span></div>
        <div class="ec-bd-planches">${planches.map(p => {
          const lourd = p.cases.length > max || p.mots > max * 25;
          return `<button type="button" class="ec-bd-planche ${lourd ? 'lourd' : ''}" title="${esc(this._code(p.e))} : ${p.cases.length} cases, ${p.mots} mots" data-a="ouvrirEpisode" data-v="${p.e.id}" onclick="Ecriture.agir(this)">
            <span class="ec-bd-tete"><span>${esc(this._code(p.e))}</span><small>${this._droite(p.e) ? 'droite' : 'gauche'}</small></span>
            <span class="ec-bd-mini">${this._bandes(p.e, p.cases.length).map(b => `<span style="flex:${b.h} 1 0">${b.cases.map(c => `<i style="flex:${c.f} 1 0;background:color-mix(in srgb, var(--accent) ${Math.round(15 + 75 * (p.cases[c.i]?.mots || 0) / maxMots)}%, var(--bg3))"></i>`).join('')}</span>`).join('')}</span>
            <small class="${lourd ? 'ec-orange' : ''}">${p.cases.length} cases · ${p.mots} mots</small>
          </button>`;
        }).join('')}</div>
        <p class="an-note">Chaque rectangle est une case ; plus il est clair, plus la case porte de mots. Bord orange : plus de ${max} cases ou plus de ${max * 25} mots pour une planche ${BD_FORMATS_NOMS[Roman.format]}.</p>
      </section>
      ${this._tempsLecture(planches)}
    `;
  },

  // Le temps de lecture d'une planche : un regard par case, et les mots des bulles (environ 3,3 mots par seconde)
  _tempsLecture(planches) {
    if (!planches.length) return '';
    const temps = p => Math.round(p.cases.length * 1.5 + p.mots / 3.3);
    const liste = planches.map(p => ({ p, s: temps(p) }));
    const total = liste.reduce((t, x) => t + x.s, 0);
    const moy = total / liste.length;
    const lentes = liste.filter(x => x.s > moy * 1.8);
    const vives = liste.filter(x => x.s < moy * 0.4);
    const max = Math.max(...liste.map(x => x.s), 1);
    const duree = s => (s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`);
    return `<section class="an-carte">
      <div class="an-entete"><h2 class="an-titre">Temps de lecture</h2><span class="an-note">environ ${duree(total)} pour tout lire · ${duree(Math.round(moy))} par planche en moyenne</span></div>
      <p class="an-note">Un regard par case (1,5 s) et les mots des bulles. Une planche bien plus lente que les autres freine la lecture ; une planche très rapide fait respirer, ou passe trop vite sur un moment fort.</p>
      <div class="dens-barres" role="img" aria-label="Temps de lecture de chaque planche">${liste.map(x => `<span style="height:${Math.max(4, Math.round(x.s * 100 / max))}%" class="${x.s > moy * 1.8 ? 'dense' : ''}" title="${esc(this._code(x.p.e))} : ${duree(x.s)}"></span>`).join('')}</div>
      ${lentes.length ? `<p class="ec-orange">Lentes : ${lentes.map(x => `${esc(this._code(x.p.e))} (${duree(x.s)})`).join(', ')}</p>` : ''}
      ${vives.length ? `<p class="an-note">Très rapides : ${vives.map(x => `${esc(this._code(x.p.e))} (${duree(x.s)})`).join(', ')}</p>` : ''}
    </section>
    `;
  },

  // Les bruitages : combien, lesquels reviennent, et leur variété
  _bruitages(planches) {
    const sons = planches.flatMap(p => p.cases.flatMap(c => c.bulles.filter(b => b[3] === 'son').map(b => ({ p, t: String(b[1]).trim() }))));
    if (!sons.length) return `<section class="an-carte"><h2 class="an-titre">Bruitages</h2><p class="an-note">Aucun bruitage : dans une case, une ligne « SFX : BANG » (ou SON :, BRUIT :) en ajoute un.</p></section>`;
    const norme = t => t.toUpperCase().replace(/[!?.…\s]+/g, '').replace(/(.)\1{2,}/g, '$1$1');
    const compte = {};
    sons.forEach(x => { const k = norme(x.t); compte[k] = compte[k] || { t: x.t, n: 0 }; compte[k].n++; });
    const liste = Object.values(compte).sort((a, b) => b.n - a.n);
    const variete = Math.round((liste.length * 100) / sons.length);
    const avecSons = new Set(sons.map(x => x.p));
    return `<section class="an-carte">
      <div class="an-entete"><h2 class="an-titre">Bruitages</h2><span class="an-note">${sons.length} bruitage(s) · ${liste.length} différent(s) · sur ${avecSons.size} planche(s)</span></div>
      <p class="an-note">Variété : ${variete} %. ${variete < 50 ? 'Les mêmes bruitages reviennent souvent : un « BAM » unique marque plus qu\'un dixième.' : 'Les bruitages sont variés.'}</p>
      <ul class="ec-liste">${liste.slice(0, 20).map(x => `<li class="${x.n >= 4 ? 'ec-orange' : ''}"><span class="vo-brut">${esc(x.t)}</span><span>${x.n} fois</span></li>`).join('')}</ul>
    </section>`;
  },

  _vueBulles(planches) {
    const limite = this.bdData.limite;
    const bulles = planches.flatMap(p => p.cases.flatMap(c => c.bulles.map(([qui, texte, mots, type]) => ({ p, c, qui, texte, mots, type }))));
    const longues = bulles.filter(b => b.mots > limite).sort((a, b) => b.mots - a.mots);
    const parlees = bulles.filter(b => b.type === 'bulle');
    const moyenne = parlees.length ? Math.round(parlees.reduce((a, b) => a + b.mots, 0) / parlees.length) : 0;
    return `
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Bulles trop longues</h2><span class="an-note">${longues.length} sur ${bulles.length} · ${moyenne} mots par bulle en moyenne</span></div>
        ${longues.length ? `<ul class="ec-liste">${longues.slice(0, 60).map(b => `<li><span>${this._lien(`${esc(this._code(b.p.e))} · case ${b.c.n}`, 'ouvrirStoryboard', b.p.e.id)} <strong>${esc(b.qui)}</strong> <span class="vo-brut">${esc(b.texte.length > 140 ? `${b.texte.slice(0, 140)}…` : b.texte)}</span></span><span class="${b.mots > limite * 1.4 ? 'ec-orange' : ''}">${b.mots} mots</span></li>`).join('')}</ul>` : `<p class="an-note">Aucune bulle au-delà de ${limite} mots.</p>`}
        <p class="an-note">Au-delà de ${limite} mots, une bulle mange la case pour une BD ${BD_FORMATS_NOMS[Roman.format]}. Coupe-la, ou étale-la sur deux cases. Les récitatifs comptent aussi.</p>
      </section>
      ${this._bruitages(planches)}
    `;
  },

  _vueTourne(planches) {
    const choix = this._choixRoman('bd-tourne');
    const etiquettes = [['question', 'pose une question'], ['suspens', 'coupe en plein geste'], ['revelation', 'révèle déjà la surprise'], ['plate', 'conclut l\'action']];
    const impaires = planches.filter(p => this._droite(p.e));
    const lignes = impaires.map(p => {
      const fin = choix[p.e.id] || p.fin;
      const suite = planches.find(x => x.e.sa === p.e.sa && x.e.n === p.e.n + 1);
      const derniere = p.cases[p.cases.length - 1];
      const phrase = derniere ? (derniere.bulles.length ? derniere.bulles[derniere.bulles.length - 1][1] : derniere.desc) : '';
      return `<li class="ec-fin ${fin === 'revelation' ? 'ec-orange' : ''}">
        <div><strong>${this._lien(esc(this._code(p.e)), 'ouvrirEpisode', p.e.id)}</strong>${suite ? ` → ${esc(this._code(suite.e))}` : ''} · ${fin === 'plate' ? 'rien ne pousse à tourner' : fin === 'revelation' ? 'surprise gâchée : elle devrait arriver après la tourne' : 'bonne tourne'}
          <p class="an-note vo-brut">« ${esc(phrase.slice(-200) || '—')} »</p></div>
        <select id="ec-bd-tourne-${p.e.id}" aria-label="Dernière case de ${esc(this._code(p.e))}" onchange="Ecriture.setChoixBD('bd-tourne', ${p.e.id}, this.value)">${etiquettes.map(([k, l]) => `<option value="${k === p.fin && !choix[p.e.id] ? '' : k}" ${k === fin ? 'selected' : ''}>${l}${k === p.fin && !choix[p.e.id] ? ' (proposé)' : ''}</option>`).join('')}</select>
      </li>`;
    });
    const bonnes = impaires.filter(p => ['question', 'suspens'].includes(choix[p.e.id] || p.fin)).length;
    return `
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Tourne de page</h2><span class="an-note">${bonnes} bonne(s) tourne(s) sur ${impaires.length}</span></div>
        <p class="an-note">Le lecteur voit une page de droite (impaire) et doit la tourner pour découvrir la suivante. La dernière case d'une page impaire donne envie de tourner ; la surprise arrive en haut de la page paire qui suit. L'étiquette est proposée d'après la dernière bulle : « ? » pose une question, « … » ou « ! » coupe en plein geste.</p>
        ${lignes.length ? `<ul class="ec-liste">${lignes.join('')}</ul>` : '<p class="an-note">Aucune page impaire dans ce choix.</p>'}
      </section>
    `;
  },

  setChoixBD(cle, id, valeur) {
    const choix = this._choixRoman(cle);
    if (valeur) choix[id] = valeur;
    else delete choix[id];
    this.noterPlusTard(cle, JSON.stringify(choix));
    this._rendreBD();
    document.getElementById(`ec-bd-tourne-${id}`)?.focus();
  },

  _vueDecoupage(planches) {
    const [min, max] = BD_CASES_NORME[Roman.format] || [6, 9];
    const haut = Math.max(max + 2, ...planches.map(p => p.cases.length));
    const moyenne = planches.reduce((a, p) => a + p.cases.length, 0) / planches.length;
    const hors = planches.filter(p => p.cases.length < min || p.cases.length > max);
    return `
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Cases par planche</h2><span class="an-note">${Math.round(moyenne * 10) / 10} cases en moyenne · norme ${BD_FORMATS_NOMS[Roman.format]} : ${min} à ${max}</span></div>
        <div class="ec-bd-barres" style="--norme-bas:${min / haut * 100}%;--norme-haut:${(max - min) / haut * 100}%">
          ${planches.map(p => `<button type="button" class="${p.cases.length < min || p.cases.length > max ? 'hors' : ''}" style="height:${p.cases.length / haut * 100}%" title="${esc(this._code(p.e))} : ${p.cases.length} cases" aria-label="${esc(this._code(p.e))} : ${p.cases.length} cases" data-a="ouvrirStoryboard" data-v="${p.e.id}" onclick="Ecriture.agir(this)"></button>`).join('')}
        </div>
        <div class="ec-bd-axe" aria-hidden="true">${planches.map(p => `<span>${p.e.n}</span>`).join('')}</div>
        <p class="an-note">La bande verte montre la norme du format. ${hors.length ? `Hors norme : ${hors.map(p => `${esc(this._code(p.e))} (${p.cases.length})`).join(', ')}. Une pleine page d'action peut être voulue.` : 'Toutes les planches sont dans la norme.'}</p>
      </section>
    `;
  },

  // ─── BD : chemin de fer de l'album ───────────────────────────────────────

  // Pages avant la planche 1 (titre, mentions) : la planche n tombe à la page n + liminaires
  _liminaires() {
    return Number(this.notes['bd-liminaires'] ?? 2);
  },

  _droite(e) {
    return (e.n + this._liminaires()) % 2 === 1;
  },

  _vueCheminFer(planches) {
    const lim = this._liminaires();
    const fin = Number(this.notes['bd-fin'] ?? 0);
    const choix = this._choixRoman('bd-tourne');
    const albums = [...new Set(planches.map(p => p.e.sa))];
    const prod = this._choixRoman('prod-bd');
    const page = (type, contenu, classe = '', titre = '') => `<div class="ec-cf-page ${classe}" title="${esc(titre)}">${contenu}</div>`;
    const blocs = albums.map(sa => {
      const liste = planches.filter(p => p.e.sa === sa).sort((a, b) => a.e.n - b.e.n);
      const dernier = liste.length ? liste[liste.length - 1].e.n : 0;
      const total = lim + dernier + fin;
      const pages = [];
      for (let n = 1; n <= lim; n++) pages.push(page('lim', `<span>${n === 1 ? 'Titre' : 'Mentions'}</span>`, 'lim', `Page ${n}`));
      for (let n = 1; n <= dernier; n++) {
        const p = liste.find(x => x.e.n === n);
        if (!p) { pages.push(page('vide', `<span>Pl. ${n}</span><small>à écrire</small>`, 'vide')); continue; }
        const etat = choix[p.e.id] || p.fin;
        const droite = this._droite(p.e);
        const tourne = droite ? (['question', 'suspens'].includes(etat) ? 'bonne' : etat === 'revelation' ? 'gachee' : 'plate') : '';
        const faites = Object.keys(prod[p.e.id] || {}).length;
        pages.push(page('planche', `
          <span class="ec-cf-num">${esc(this._code(p.e))}</span>
          <span class="ec-bd-mini">${this._bandes(p.e, p.cases.length).map(b => `<span style="flex:${b.h} 1 0">${b.cases.map(c => `<i style="flex:${c.f} 1 0"></i>`).join('')}</span>`).join('')}</span>
          <small>${p.cases.length} cases${faites ? ` · ${faites}/4 étapes` : ''}</small>`, `planche ${tourne ? `tourne-${tourne}` : ''}`, `${this._code(p.e)} · page ${n + lim}${droite ? ' (droite)' : ' (gauche)'}${tourne ? ` · tourne ${tourne === 'bonne' ? 'réussie' : tourne === 'gachee' ? 'gâchée' : 'à plat'}` : ''}`));
      }
      for (let n = 1; n <= fin; n++) pages.push(page('fin', '<span>Fin</span>', 'lim'));
      // La page 1 est seule à droite ; ensuite les pages vont par deux, une paire et une impaire
      const doubles = [[null, pages[0]]];
      for (let i = 1; i < pages.length; i += 2) doubles.push([pages[i], pages[i + 1] || null]);
      const reste = total % 8;
      const alertes = [];
      if (reste) alertes.push(`${total} pages : un album s'imprime par cahiers de 8 pages. Ajoute ${8 - reste} page(s) (planches, pages de fin ou bonus) ou retires-en ${reste}.`);
      const gachees = liste.filter(p => this._droite(p.e) && (choix[p.e.id] || p.fin) === 'revelation');
      if (gachees.length) alertes.push(`Surprise visible avant de tourner : ${gachees.map(p => this._code(p.e)).join(', ')}.`);
      const plates = liste.filter(p => this._droite(p.e) && (choix[p.e.id] || p.fin) === 'plate').length;
      return `
        <section class="an-carte">
          <div class="an-entete"><h2 class="an-titre">${Roman.plusieurs ? `Album ${sa} · ` : ''}${total} pages</h2><span class="an-note">${lim} page(s) avant · ${dernier} planches · ${fin} page(s) de fin · ${plates} page(s) de droite à plat</span></div>
          <div class="ec-cf">${doubles.map(([g, d]) => `<div class="ec-cf-double">${g || '<div class="ec-cf-page rien"></div>'}${d || '<div class="ec-cf-page rien"></div>'}</div>`).join('')}</div>
          ${alertes.length ? `<ul class="ec-liste">${alertes.map(a => `<li class="ec-orange"><span>${esc(a)}</span></li>`).join('')}</ul>` : '<p class="an-note">Le compte de pages tombe juste pour l\'impression, et aucune surprise n\'est visible avant de tourner.</p>'}
        </section>`;
    });
    return `
      <section class="an-carte">
        <div class="an-ligne">
          <label class="an-label" for="ec-cf-lim">Pages avant la planche 1</label><input id="ec-cf-lim" class="an-nombre" type="number" min="0" max="8" value="${lim}" onchange="Ecriture.setNombreBD('bd-liminaires', this.value)">
          <label class="an-label" for="ec-cf-fin">Pages de fin</label><input id="ec-cf-fin" class="an-nombre" type="number" min="0" max="16" value="${fin}" onchange="Ecriture.setNombreBD('bd-fin', this.value)">
        </div>
        <p class="an-note">Vue comme dans l'album imprimé : la première page est seule à droite, puis les pages vont par deux. Bord vert : la page de droite donne envie de tourner ; orange : la surprise est déjà visible ; gris : rien ne pousse à tourner. La couverture n'est pas comptée.</p>
      </section>
      ${blocs.join('')}
    `;
  },

  setNombreBD(cle, valeur) {
    this.noterPlusTard(cle, String(Math.max(0, Number(valeur) || 0)));
    this._rendreBD();
    document.getElementById(cle === 'bd-fin' ? 'ec-cf-fin' : 'ec-cf-lim')?.focus();
  },

  // ─── Suivi de production ─────────────────────────────────────────────────

  vueProduction() {
    return '<div class="an-vue" id="ec-prod"><p class="an-note">Lecture du suivi…</p></div>';
  },

  async _chargerProduction() {
    const [bd, plans] = await Promise.all([Roman.bd ? api.get('ecriture_bd') : null, Roman.storyboard ? api.get('ecriture_sb_tous') : []]);
    if (bd) this.bdData = bd;
    this.prodPlans = plans || [];
    this._rendreProduction();
  },

  // Au rythme des 28 derniers jours, combien de temps pour finir
  _estimerFin(dates, restant) {
    const depuis = Date.now() - 28 * 86400000;
    const recentes = dates.filter(d => d && new Date(d).getTime() >= depuis).length;
    if (!restant) return 'Tout est fait.';
    if (!recentes) return `${restant} étape(s) restante(s). Coche des étapes pour que l'app estime la date de fin à ton rythme.`;
    const jours = Math.ceil(restant / (recentes / 28));
    const fin = new Date(Date.now() + jours * 86400000).toLocaleDateString('fr-FR', { dateStyle: 'long' });
    return `${restant} étape(s) restante(s). Au rythme des 4 dernières semaines (${recentes} étape(s)), fin vers le ${fin}.`;
  },

  _rendreProduction() {
    const slot = document.getElementById('ec-prod');
    if (!slot) return;
    const eps = this.ensemble();
    if (Roman.bd) {
      const etapes = [['crayonne', 'Crayonné'], ['encrage', 'Encrage'], ['couleur', 'Couleur'], ['lettrage', 'Lettrage']];
      const prod = this._choixRoman('prod-bd');
      const planches = eps.filter(e => this.bdData?.planches[e.id]);
      const dessins = new Map();
      this.prodPlans.filter(p => p.image && !p.ref).forEach(p => dessins.set(p.e, (dessins.get(p.e) || 0) + 1));
      const faites = planches.reduce((a, e) => a + Object.keys(prod[e.id] || {}).length, 0);
      const total = planches.length * etapes.length;
      slot.innerHTML = `
        <section class="an-carte">
          <div class="an-entete"><h2 class="an-titre">Avancement de l'album</h2><span class="an-note">${faites} étape(s) sur ${total} · ${total ? Math.round(100 * faites / total) : 0} %</span></div>
          <div class="ec-rythme-barre" aria-hidden="true"><i style="width:${total ? Math.round(100 * faites / total) : 0}%"></i></div>
          <p class="an-note">${esc(this._estimerFin(planches.flatMap(e => Object.values(prod[e.id] || {})), total - faites))}</p>
          <div class="an-table"><table>
            <thead><tr><th scope="col">Planche</th><th scope="col">Scénario</th>${etapes.map(([, l]) => `<th scope="col">${l}</th>`).join('')}<th scope="col">Crayonnés au storyboard</th></tr></thead>
            <tbody>${planches.map(e => `<tr><td>${this._lien(esc(this._code(e)), 'ouvrirStoryboard', e.id)}</td><td>✓</td>${etapes.map(([k, l]) => {
              const date = prod[e.id]?.[k];
              return `<td><input type="checkbox" id="ec-prod-${e.id}-${k}" aria-label="${l} de ${esc(this._code(e))}" ${date ? 'checked' : ''} title="${date ? `Fait le ${new Date(date).toLocaleDateString('fr-FR')}` : ''}" onchange="Ecriture.cocherProduction(${e.id}, '${k}', this.checked)"></td>`;
            }).join('')}<td class="an-note">${dessins.get(e.id) || 0} / ${this.bdData.planches[e.id].cases.length} cases</td></tr>`).join('')}</tbody>
          </table></div>
        </section>`;
      return;
    }
    // Film, série, roman : les plans du storyboard, à dessiner, dessinés ou validés
    const plans = this.prodPlans.filter(p => !p.ref);
    const etat = p => p.statut || (p.image ? 'dessine' : 'esquisse');
    const lignes = eps.map(e => {
      const l = plans.filter(p => p.e === e.id);
      return { e, n: l.length, dessines: l.filter(p => etat(p) !== 'esquisse').length, valides: l.filter(p => etat(p) === 'valide').length };
    }).filter(x => x.n);
    const n = lignes.reduce((a, x) => a + x.n, 0);
    const valides = lignes.reduce((a, x) => a + x.valides, 0);
    const dessines = lignes.reduce((a, x) => a + x.dessines, 0);
    slot.innerHTML = `
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Avancement du storyboard</h2><span class="an-note">${n} plans · ${dessines} dessinés · ${valides} validés</span></div>
        <div class="ec-prod-barre" aria-hidden="true"><i class="valide" style="width:${n ? 100 * valides / n : 0}%"></i><i class="dessine" style="width:${n ? 100 * (dessines - valides) / n : 0}%"></i></div>
        <p class="an-note">${esc(this._estimerFin(plans.map(p => p.date), n * 2 - dessines - valides))} Une étape : un plan dessiné, puis validé.</p>
        ${lignes.length ? `<div class="an-table"><table>
          <thead><tr><th scope="col">Épisode</th><th scope="col">Plans</th><th scope="col">Dessinés</th><th scope="col">Validés</th><th scope="col"></th></tr></thead>
          <tbody>${lignes.map(x => `<tr><td>${this._lien(esc(this._code(x.e)), 'ouvrirStoryboard', x.e.id)}</td><td>${x.n}</td><td>${x.dessines}</td><td>${x.valides}</td><td><div class="ec-prod-barre petit"><i class="valide" style="width:${100 * x.valides / x.n}%"></i><i class="dessine" style="width:${100 * (x.dessines - x.valides) / x.n}%"></i></div></td></tr>`).join('')}</tbody>
        </table></div>` : '<p class="an-note">Aucun plan pour l\'instant : ouvre un épisode, puis l\'onglet Storyboard.</p>'}
        <p class="an-note">Un plan avec un dessin compte comme dessiné ; marque-le validé dans son détail, au storyboard.</p>
      </section>`;
  },

  cocherProduction(id, etape, fait) {
    const prod = this._choixRoman('prod-bd');
    prod[id] = prod[id] || {};
    if (fait) prod[id][etape] = new Date().toISOString().slice(0, 10);
    else delete prod[id][etape];
    if (!Object.keys(prod[id]).length) delete prod[id];
    this.noterPlusTard('prod-bd', JSON.stringify(prod));
    this._rendreProduction();
    document.getElementById(`ec-prod-${id}-${etape}`)?.focus();
  },

  // ─── Film : plan de travail et révisions ─────────────────────────────────

  _decorSeq(s) {
    const lieu = s.slug.replace(/^(INT\.?\/EXT\.?|I\/E\.?|INT\.?|EXT\.?)\s*/i, '').split(/\s+[-–—]\s+/)[0].trim();
    return `${s.ext ? 'EXT.' : 'INT.'} ${lieu || 'LIEU À PRÉCISER'}`;
  },

  // Les jours de tournage : un décor d'un bloc, le jour avant la nuit, ppj pages par jour au plus
  _joursTravail() {
    const ppj = Number(this.notes['film-ppj'] || (Roman.forme === 'court' ? 5 : 4));
    const groupes = new Map();
    this.film.forEach(s => {
      const cle = `${this._decorSeq(s)} — ${s.moment || 'JOUR'}`;
      if (!groupes.has(cle)) groupes.set(cle, { cle, decor: this._decorSeq(s), moment: s.moment || 'JOUR', seqs: [], pages: 0, persos: new Set() });
      const g = groupes.get(cle);
      g.seqs.push(s);
      g.pages += s.pages;
      s.persos.forEach(p => g.persos.add(p));
    });
    const tri = [...groupes.values()].sort((a, b) => a.decor.localeCompare(b.decor, 'fr') || (a.moment === 'NUIT') - (b.moment === 'NUIT'));
    const jours = [];
    let jour = null;
    // On ne mélange pas le jour et la nuit dans une même journée : l'équipe ne tient pas 20 heures
    tri.sort((a, b) => (a.moment === 'NUIT') - (b.moment === 'NUIT') || a.decor.localeCompare(b.decor, 'fr'));
    tri.forEach(g => {
      let reste = g.pages;
      if (jour && jour.moment !== (g.moment === 'NUIT' ? 'NUIT' : 'JOUR')) jour = null;
      while (reste > 0.01) {
        if (!jour || jour.pages >= ppj - 0.01) { jour = { pages: 0, blocs: [], moment: g.moment === 'NUIT' ? 'NUIT' : 'JOUR' }; jours.push(jour); }
        const part = Math.min(reste, ppj - jour.pages);
        if (part < g.pages && jour.pages > 0 && part < g.pages / 2 && reste === g.pages) { jour = { pages: 0, blocs: [], moment: jour.moment }; jours.push(jour); continue; }
        jour.blocs.push({ g, pages: part, suite: reste < g.pages });
        jour.pages += part;
        reste -= part;
      }
    });
    return { jours, tri, ppj };
  },

  _vueTravail() {
    const { jours, tri, ppj } = this._joursTravail();
    const nuits = jours.filter(j => j.blocs.some(b => b.g.moment === 'NUIT')).length;
    const decors = new Set(tri.map(g => g.decor)).size;
    return `
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Plan de travail</h2><span class="an-note">${jours.length} jour(s) de tournage · ${decors} décor(s) · ${nuits} jour(s) avec de la nuit</span></div>
        <div class="an-ligne"><label class="an-label" for="ec-ppj">Pages tournées par jour</label><select id="ec-ppj" onchange="Ecriture.noterPlusTard('film-ppj', this.value); Ecriture._rendreFilm(); document.getElementById('ec-ppj')?.focus()">${[2, 3, 4, 5, 6, 8].map(n => `<option ${n === ppj ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Ecriture.exporterTravail()">Exporter (CSV)</button></div>
        <ol class="ec-travail">${jours.map((j, i) => `<li><div class="an-entete"><strong>Jour ${i + 1}</strong><span class="an-note">${this._pages(j.pages)} p.</span></div>
          ${j.blocs.map(b => `<div class="ec-travail-bloc"><span class="vo-brut">${esc(b.g.cle)}${b.suite ? ' (suite)' : ''}</span><span class="an-note">${this._pages(b.pages)} p. · séq. ${b.g.seqs.map(s => s.g + 1).join(', ')} · ${esc([...b.g.persos].join(', ') || 'sans dialogue')}</span></div>`).join('')}</li>`).join('')}</ol>
        <p class="an-note">Les séquences sont regroupées par décor et par moment, pour ne déplacer l'équipe qu'une fois par lieu ; les jours de tournage ne mélangent pas le jour et la nuit. Un bloc trop long passe sur le jour suivant. Le nombre de pages par jour dépend du film : 4 à 5 pour un long, plus pour un court.</p>
      </section>
    `;
  },

  exporterTravail() {
    const groupes = new Map();
    this.film.forEach(s => {
      const cle = `${this._decorSeq(s)} — ${s.moment || 'JOUR'}`;
      groupes.set(cle, [...(groupes.get(cle) || []), s]);
    });
    const cellule = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lignes = [['Décor', 'Moment', 'Séquence', 'En-tête', 'Pages', 'Personnages']];
    [...groupes.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr')).forEach(([, seqs]) => seqs.forEach(s => lignes.push([this._decorSeq(s), s.moment || 'JOUR', s.g + 1, s.slug, this._pages(s.pages), s.persos.join(', ')])));
    Storyboard._telecharger(new Blob(['﻿' + lignes.map(l => l.map(cellule).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'plan-de-travail.csv');
  },

  // La révision d'une séquence : la plus ancienne version figée qui avait déjà ce texte
  _revisionSeq(s) {
    return (this.revisions || []).find(r => r.h.includes(s.h)) || null;
  },

  _vueRevisions() {
    const revs = this.revisions || [];
    const derniere = revs[revs.length - 1];
    const changees = derniere ? this.film.filter(s => !derniere.h.includes(s.h)) : [];
    const touches = changees.map(s => ({ s, plans: (this.prodPlans || []).filter(p => !p.ref && p.e === s.acte && p.s === s.n).length })).filter(x => x.plans);
    const prochaine = REVISION_COULEURS[revs.length % REVISION_COULEURS.length];
    const acte = id => this.ordre[this.rang.get(id)];
    return `
      <div class="ec-dep-grille">
        <section class="an-carte">
          <div class="an-entete"><h2 class="an-titre">Versions figées</h2><button type="button" class="btn btn-primary btn-sm" onclick="Ecriture.figerRevision()">Figer cette version${revs.length ? ` (${prochaine[0].toLowerCase()})` : ' (blanche)'}</button></div>
          ${revs.length ? `<ul class="ec-liste">${revs.map(r => `<li><span><span class="ec-rev" style="background:${this._couleurRev(r.couleur)}"></span>${esc(r.couleur)}${r.note ? ` · <span class="vo-brut">${esc(r.note)}</span>` : ''}</span><span class="an-note">${new Date(r.date.replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR', { dateStyle: 'medium' })}</span></li>`).join('')}</ul>
          <button type="button" class="ec-lien" onclick="Ecriture.annulerRevision()">Retirer la dernière version</button>` : '<p class="an-note">Aucune version figée. Fige la version que tu envoies à l\'équipe : la suivante marquera en couleur les séquences qui ont changé.</p>'}
          <p class="an-note">Comme sur un tournage : blanche, puis bleue, rose, jaune, verte, chamois, saumon, cerise. Chaque séquence garde la couleur de la version où son texte est apparu.</p>
        </section>
        <section class="an-carte">
          <h2 class="an-titre">Changé depuis la version ${derniere ? esc(derniere.couleur.toLowerCase()) : '—'}</h2>
          ${derniere ? (changees.length ? `<ul class="ec-liste">${changees.map(s => `<li><span>Séq. ${s.g + 1} · <span class="vo-brut">${esc(s.slug)}</span></span>${this._lien(esc(this._code(acte(s.acte))), 'ouvrirStoryboard', s.acte)}</li>`).join('')}</ul>` : '<p class="an-note">Aucune séquence n\'a changé.</p>') : '<p class="an-note">Fige une première version pour suivre les changements.</p>'}
          ${touches.length ? `<h3 class="an-label">Plans du storyboard à revoir</h3><ul class="ec-liste">${touches.map(x => `<li class="ec-orange"><span>Séq. ${x.s.g + 1} : ${x.plans} plan(s)</span>${this._lien('Ouvrir', 'ouvrirStoryboard', x.s.acte)}</li>`).join('')}</ul>` : ''}
        </section>
      </div>
    `;
  },

  _couleurRev(nom) {
    return (REVISION_COULEURS.find(c => c[0] === nom) || ['', '#b0b0b0'])[1];
  },

  async figerRevision() {
    const note = prompt('Une note pour cette version (facultatif) : à qui elle part, ce qui a changé…', '');
    if (note === null) return;
    this.revisions = await api.post('ecriture_film_revisions', { action: 'figer', note });
    toast('Version figée', 'success');
    this._rendreFilm();
  },

  async annulerRevision() {
    if (!confirm('Retirer la dernière version figée ? Le scénario ne change pas.')) return;
    this.revisions = await api.post('ecriture_film_revisions', { action: 'supprimer' });
    this._rendreFilm();
  },

  // ─── Storyboard ──────────────────────────────────────────────────────────

  vueAtelier() {
    return Atelier.vue();
  },

  vueGenre() {
    return Genres.vue();
  },

  ouvrirSpot(id) {
    this.epId = Number(id);
    this.portee = 'episode';
    this.vue = 'spot';
    this.rendre();
  },

  // ─── Ton année d'écriture : un bilan, comme une rétrospective ───

  vueAnnee() {
    return '<div class="an-vue" id="ec-annee"><p class="an-note">Le bilan se prépare…</p></div>';
  },

  async _chargerAnnee(annee) {
    this.anneeChoisie = annee || this.anneeChoisie || new Date().getFullYear();
    const d = await api.get(`annee_ecriture&annee=${this.anneeChoisie}`);
    this._annee = d;
    this._rendreAnnee();
  },

  _rendreAnnee() {
    const slot = document.getElementById('ec-annee');
    const d = this._annee;
    if (!slot || !d) return;
    const a = String(d.annee);
    const seances = this._seances();
    const jours = Object.keys(seances).filter(j => j.startsWith(a) && Number(seances[j]) > 0).sort();
    const mots = jours.reduce((t, j) => t + Number(seances[j]), 0);
    const avant = Object.keys(seances).filter(j => j.startsWith(String(d.annee - 1))).reduce((t, j) => t + Number(seances[j] || 0), 0);
    const meilleur = jours.reduce((m, j) => (!m || seances[j] > seances[m] ? j : m), null);
    let serie = 0, record = 0, prec = null;
    for (const j of jours) {
      const suite = prec && (new Date(`${j}T12:00:00`) - new Date(`${prec}T12:00:00`)) / 86400000 === 1;
      serie = suite ? serie + 1 : 1;
      record = Math.max(record, serie);
      prec = j;
    }
    const parJourSemaine = [0, 0, 0, 0, 0, 0, 0];
    const parMois = {};
    jours.forEach(j => { const d0 = new Date(`${j}T12:00:00`); parJourSemaine[d0.getDay()] += Number(seances[j]); parMois[j.slice(5, 7)] = (parMois[j.slice(5, 7)] || 0) + Number(seances[j]); });
    const nomsJours = ['le dimanche', 'le lundi', 'le mardi', 'le mercredi', 'le jeudi', 'le vendredi', 'le samedi'];
    const jourFavori = mots ? nomsJours[parJourSemaine.indexOf(Math.max(...parJourSemaine))] : null;
    const moisFavori = Object.entries(parMois).sort((x, y) => y[1] - x[1])[0];
    let heures = {};
    try { heures = JSON.parse(this.notes['seances-heures'] || '{}') || {}; } catch (e) { heures = {}; }
    const parHeure = Object.entries(heures).filter(([k]) => k.startsWith(`${a}:`)).sort((x, y) => y[1] - x[1])[0];
    const heure = parHeure ? Number(parHeure[0].split(':')[1]) : null;
    const moment = heure === null ? null : heure < 6 ? 'la nuit' : heure < 12 ? 'le matin' : heure < 14 ? 'à midi' : heure < 18 ? 'l\'après-midi' : heure < 22 ? 'le soir' : 'tard le soir';
    const date = j => new Date(`${j}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    const nomMois = m => new Date(`${a}-${m}-15T12:00:00`).toLocaleDateString('fr-FR', { month: 'long' });
    const annees = [...new Set([String(new Date().getFullYear()), ...d.annees, ...Object.keys(seances).map(j => j.slice(0, 4))])].sort().reverse();
    const carte = (grand, petit) => `<div class="annee-carte"><strong>${grand}</strong><span>${petit}</span></div>`;
    slot.innerHTML = `
      <div class="an-ligne"><label class="an-label" for="ec-annee-choix">Année</label>
        <select id="ec-annee-choix" onchange="Ecriture._chargerAnnee(Number(this.value))">${annees.map(x => `<option ${x === a ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
        <span class="an-note">Tout vient de ce que tu as écrit dans le Brouillon, des Versions gardées et des envois aux lecteurs.</span></div>
      <section class="annee">
        <h2 class="annee-titre">Ton année ${esc(a)}</h2>
        <div class="annee-grille">
          ${carte(Analyse._fr(mots), `mots écrits${avant ? ` (${mots >= avant ? '+' : ''}${Analyse._fr(mots - avant)} par rapport à ${d.annee - 1})` : ''}`)}
          ${carte(Analyse._fr(jours.length), 'jours d\'écriture')}
          ${meilleur ? carte(Analyse._fr(seances[meilleur]), `mots le ${date(meilleur)}, ta meilleure journée`) : ''}
          ${record > 1 ? carte(record, 'jours d\'affilée, ta plus longue série') : ''}
          ${jourFavori ? carte(jourFavori, 'le jour où tu écris le plus') : ''}
          ${moisFavori ? carte(nomMois(moisFavori[0]), `ton mois le plus fécond (${Analyse._fr(moisFavori[1])} mots)`) : ''}
          ${moment ? carte(moment, `ton moment préféré pour écrire (vers ${heure} h)`) : ''}
          ${carte(Analyse._fr(d.versions), `versions gardées, sur ${d.episodes_touches} épisode(s)`)}
          ${d.envois ? carte(Analyse._fr(d.envois), 'épisodes envoyés à tes lecteurs') : ''}
        </div>
        ${d.reprises.length ? `<h3 class="an-label">Les épisodes que tu as le plus repris</h3><ol class="annee-liste">${d.reprises.map(r => `<li><strong>${esc(r.code)}</strong> ${esc(r.titre || '')} <span class="an-note">${r.versions} versions</span></li>`).join('')}</ol>` : ''}
        ${d.bavards.length ? `<h3 class="an-label">Ceux qui parlent le plus dans la série</h3><ol class="annee-liste">${d.bavards.map(b => `<li><strong>${esc(b.nom)}</strong> <span class="an-note">${Analyse._fr(b.repliques)} répliques</span></li>`).join('')}</ol>` : ''}
        ${!mots && !d.versions ? '<p class="an-note">Rien d\'écrit dans le Brouillon cette année pour l\'instant : le bilan se remplit au fil des séances.</p>' : ''}
        ${heure === null && mots ? '<p class="an-note">L\'heure d\'écriture est notée depuis cette version de l\'app : ton moment préféré apparaîtra au fil des séances.</p>' : ''}
      </section>`;
  },

  // La tension, chapitre par chapitre : phrases courtes et ponctuation vive. Une indication, pas une note.
  async _chargerTension() {
    const d = await api.get('roman_sens').catch(() => null);
    const slot = document.getElementById('ec-tension');
    if (!slot || !d) return;
    const ch = d.chapitres;
    if (ch.length < 2) { slot.innerHTML = ''; return; }
    const W = 700, H = 150, X = i => 20 + (i * (W - 40)) / (ch.length - 1), Y = v => H - 15 - (v * (H - 30)) / 100;
    const moy = Math.round(ch.reduce((t, c) => t + c.tension, 0) / ch.length);
    const plats = [];
    for (let i = 2; i < ch.length; i++) if ([0, 1, 2].every(k => ch[i - k].tension < moy * 0.6)) plats.push(ch[i].code);
    slot.innerHTML = `<div class="an-entete"><h2 class="an-titre">La tension</h2><span class="an-note">moyenne ${moy} / 100</span></div>
      <svg class="arc-courbe" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tension de chaque chapitre"><line x1="20" x2="${W - 20}" y1="${Y(moy)}" y2="${Y(moy)}" class="arc-zero"/><polyline points="${ch.map((c, i) => `${X(i)},${Y(c.tension)}`).join(' ')}"/>${ch.map((c, i) => `<circle cx="${X(i)}" cy="${Y(c.tension)}" r="3"><title>${esc(c.code)} : ${c.tension} · phrases de ${c.phrase_moyenne} mots en moyenne</title></circle>`).join('')}</svg>
      <p class="an-note">Calculée sur le texte : la part de phrases courtes (8 mots ou moins) et le nombre de ! et de ?. Une course-poursuite monte, une description descend. ${plats.length ? `Trois chapitres calmes d'affilée jusqu'à ${plats.slice(0, 4).map(esc).join(', ')} : un temps de respiration voulu, ou un passage qui s'endort ?` : ''}</p>`;
  },

  // ─── Roman : les cinq sens et les tics de plume ───

  vueSens() {
    return '<div class="an-vue" id="ec-sens"><p class="an-note">Lecture des chapitres…</p></div>';
  },

  async _chargerSens() {
    this._sens = await api.get('roman_sens');
    const slot = document.getElementById('ec-sens');
    if (!slot || !this._sens) return;
    const ch = this._sens.chapitres;
    if (!ch.length) { slot.innerHTML = '<p class="an-note">Aucun chapitre écrit pour l\'instant.</p>'; return; }
    const SENS = [['vue', 'Vue', '#9fb7e8'], ['ouie', 'Ouïe', '#e8a85c'], ['odorat', 'Odorat', '#9be38f'], ['toucher', 'Toucher', '#f08fb0'], ['gout', 'Goût', '#c9b8ff']];
    const moyenne = k => ch.reduce((t, c) => t + c.sens[k], 0) / ch.length;
    const max = Math.max(0.1, ...ch.flatMap(c => SENS.map(([k]) => c.sens[k])));
    const oublies = SENS.filter(([k]) => moyenne(k) < 0.5).map(([, l]) => l.toLowerCase());
    const advMoy = ch.reduce((t, c) => t + c.adverbes, 0) / ch.length;
    const tics = {};
    ch.forEach(c => Object.entries(c.tics).forEach(([t, n]) => { tics[t] = (tics[t] || 0) + n; }));
    const totalMots = ch.reduce((t, c) => t + c.mots, 0);
    slot.innerHTML = `
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Les cinq sens</h2><span class="an-note">mots des sens pour 1 000 mots</span></div>
        <p class="an-note">Chaque chapitre, ce qu'on y voit, entend, sent, touche et goûte. ${oublies.length ? `Dans tout le livre, presque rien pour ${oublies.join(', ')} : un détail de ce côté-là donne souvent du corps à une scène.` : 'Les cinq sens sont tous présents dans le livre.'}</p>
        <div class="sens-legende">${SENS.map(([, l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>
        <div class="sens-liste">${ch.map(c => `<div class="sens-ligne"><span>${this._lien(esc(c.code), 'ouvrirEpisode', c.id)}</span><div class="sens-barres">${SENS.map(([k, l, col]) => `<i style="width:${Math.round(c.sens[k] / max * 100)}%;background:${col}" title="${l} : ${c.sens[k]} pour 1 000 mots"></i>`).join('')}</div></div>`).join('')}</div>
      </section>
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Les tics de plume</h2><span class="an-note">${Analyse._fr(totalMots)} mots lus</span></div>
        <p class="an-note">Rien d'interdit ici : seulement ce qui revient le plus. Les adverbes en -ment, les petits mots de remplissage, et le même mot répété à moins de trente mots d'intervalle.</p>
        <p><strong>${Analyse._num(Math.round(advMoy * 10) / 10)}</strong> adverbes en -ment pour 1 000 mots en moyenne. Les plus revenus : ${Object.entries(tics).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t, n]) => `« ${esc(t)} » ${n}`).join(' · ') || 'aucun'}.</p>
        <ul class="ec-liste">${[...ch].sort((a, b) => b.nb_proches / Math.max(1, b.mots) - a.nb_proches / Math.max(1, a.mots)).slice(0, 15).map(c => `<li class="${c.adverbes > advMoy * 1.6 ? 'ec-orange' : ''}"><span>${this._lien(esc(c.code), 'ouvrirEpisode', c.id)} ${esc(c.titre || '')}<br><span class="an-note">répétitions proches : ${Object.entries(c.proches).map(([w, n]) => `${esc(w)} (${n})`).join(', ') || 'aucune'}</span></span><span class="an-note">${c.adverbes} adv. ‰${c.adverbes > advMoy * 1.6 ? ' · beaucoup' : ''}</span></li>`).join('')}</ul>
      </section>`;
  },

  // ─── Scénario : ce que contiennent les dix premières pages (ce que lit d'abord un producteur) ───

  _htmlDebut(d) {
    const heros = d.principaux[0];
    const alertes = [];
    if (heros && heros.page > 5) alertes.push(`Le personnage qui parle le plus (${heros.nom}) n'apparaît qu'à la page ${heros.page}.`);
    if (d.premiere_replique && d.premiere_replique > 3) alertes.push(`La première réplique arrive page ${d.premiere_replique}.`);
    if (d.action > 70) alertes.push(`Les dix premières pages sont à ${d.action} % de l'action : beaucoup à lire avant d'entendre quelqu'un.`);
    return `<section class="an-carte">
      <h2 class="an-titre">Les dix premières pages</h2>
      <p class="an-note">Ce qu'un lecteur pressé découvre d'abord. Les moments clés (élément déclencheur, pivots) se placent dans Structure ; ici, qui on rencontre et quand.</p>
      <ul class="ec-liste">${d.principaux.map(p => `<li><span>${esc(p.nom)}</span><span class="${p === heros && p.page > 5 ? 'ec-orange' : ''}">apparaît page ${p.page}</span></li>`).join('')}
        <li><span>Première réplique</span><span>page ${d.premiere_replique ?? '—'}</span></li><li><span>Séquences dans les 10 pages</span><span>${d.scenes}</span></li><li><span>Part d'action</span><span>${d.action} %</span></li></ul>
      ${alertes.map(a => `<p class="ec-orange">${esc(a)}</p>`).join('')}
      <p class="an-note">Pages estimées à 55 lignes en Courier 12 (l'export donne la mise en page exacte).</p>
    </section>`;
  },

  // ─── Roman : les portraits ───

  vuePortraits() {
    return '<div class="an-vue" id="ec-portraits"><p class="an-note">Lecture des descriptions…</p></div>';
  },

  async _chargerPortraits() {
    const d = await api.get('portraits');
    const slot = document.getElementById('ec-portraits');
    if (!slot || !d) return;
    const contre = d.personnages.reduce((t, p) => t + p.contradictions.length, 0);
    slot.innerHTML = `<p class="an-note">L'app relève ce que le texte dit du physique de chaque personnage (yeux, cheveux, taille, barbe, lunettes) dans les phrases qui le nomment, ou juste après (« Il a les yeux verts »). ${contre ? `<strong class="ec-orange">${contre} contradiction(s)</strong> à vérifier : ce n'est peut-être pas une erreur (une teinture, une autre lumière), mais le lecteur, lui, le remarquera.` : 'Aucune contradiction trouvée.'}</p>
      ${d.personnages.length ? d.personnages.map(p => `<section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">${esc(p.nom)}</h2>${p.contradictions.length ? `<span class="ec-orange">${p.contradictions.length} contradiction(s)</span>` : ''}</div>
        ${p.contradictions.map(c => `<p class="ec-orange"><strong>${esc(c.trait)}</strong> : ${c.valeurs.map(v => `${esc(v.brut)} (${this._lien(esc(v.code), 'ouvrirEpisode', v.ep)})`).join(', ')}</p>`).join('')}
        <ul class="ec-liste">${Object.entries(p.traits).map(([t, vus]) => `<li><span><strong>${esc(t)}</strong> : ${[...new Set(vus.map(v => v.brut))].map(esc).join(', ')}<br><span class="an-note vo-brut">« ${esc(vus[0].phrase)} » (${esc(vus[0].code)})</span></span><span class="an-note">${vus.length} fois</span></li>`).join('')}</ul>
      </section>`).join('') : '<section class="an-carte"><p class="an-note">Aucune description physique trouvée pour les personnages des fiches.</p></section>'}`;
  },

  // ─── Théâtre : la conduite lumière et son ───

  vueConduite() {
    return '<div class="an-vue" id="ec-conduite"><p class="an-note">Lecture des didascalies…</p></div>';
  },

  async _chargerConduite() {
    this._conduite = await api.get('conduite');
    const slot = document.getElementById('ec-conduite');
    const d = this._conduite;
    if (!slot || !d) return;
    slot.innerHTML = `<section class="an-carte">
      <div class="an-entete"><h2 class="an-titre">Conduite lumière et son</h2><span class="an-note">${d.cues.length} effet(s)
        ${d.cues.length ? '<button type="button" class="btn btn-secondary btn-sm" onclick="Ecriture.exporterConduite()">Tableur (.csv)</button>' : ''}</span></div>
      <p class="an-note">La feuille de la régie, tirée des didascalies qui parlent de lumière (noir, projecteur, la nuit tombe…) ou de son (musique, sonnerie, on frappe…). Le « top » est la fin de la réplique qui déclenche l'effet. À compléter avec le régisseur : l'app ne fait que la première version.</p>
      ${d.cues.length ? `<div class="an-table"><table><thead><tr><th scope="col">N°</th><th scope="col">Acte · scène</th><th scope="col">Effet</th><th scope="col">Didascalie</th><th scope="col">Top</th></tr></thead>
      <tbody>${d.cues.map(c => `<tr><td>${c.n}</td><td>${c.acte} · ${c.scene}</td><td>${esc(c.type)}</td><td class="vo-brut">${esc(c.texte)}</td><td class="an-note vo-brut">${esc(c.top)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="an-note">Aucune didascalie ne parle de lumière ou de son.</p>'}
    </section>`;
  },

  exporterConduite() {
    const c = v => `"${String(v).replace(/"/g, '""')}"`;
    const lignes = [['N°', 'Acte', 'Scène', 'Effet', 'Didascalie', 'Top'], ...(this._conduite?.cues || []).map(x => [x.n, x.acte, x.scene, x.type, x.texte, x.top])];
    this._telecharger('conduite.csv', '\ufeff' + lignes.map(l => l.map(c).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  },

  // ─── Série : l'ouverture de chaque épisode ───

  vueAccroches() {
    return '<div class="an-vue" id="ec-accroches"><p class="an-note">Lecture des ouvertures…</p></div>';
  },

  async _chargerAccroches() {
    const d = await api.get('accroches');
    const slot = document.getElementById('ec-accroches');
    if (!slot || !d) return;
    const eps = d.episodes;
    if (!eps.length) { slot.innerHTML = '<p class="an-note">Aucun épisode écrit pour l\'instant.</p>'; return; }
    const fins = { question: 'finit sur une question', chute: 'finit sur une chute', suspendue: 'reste en suspens', plate: 'finit à plat' };
    const compte = k => eps.filter(e => e.fin === k).length;
    const moy = Math.round(eps.reduce((t, e) => t + e.part, 0) / eps.length);
    slot.innerHTML = `${Analyse._kpis([{ l: 'Part de l\'ouverture', v: `${moy} %`, s: 'de l\'épisode, en moyenne' }, { l: 'Question ou chute', v: compte('question') + compte('chute') + compte('suspendue'), s: `sur ${eps.length} ouvertures` }, { l: 'À plat', v: compte('plate'), s: 'rien ne pousse à rester' }])}
      <section class="an-carte">
        <h2 class="an-titre">L'ouverture de chaque épisode</h2>
        <p class="an-note">La scène avant le générique (si le mot « générique » est écrit), sinon la première scène. Sa longueur dans l'épisode, et sa dernière ligne : une question, une chute (!) ou des points de suspension donnent envie de rester ; une fin à plat, moins.</p>
        <ul class="ec-liste">${eps.map(e => `<li class="${e.fin === 'plate' ? '' : ''}"><span>${this._lien(esc(e.code), 'ouvrirBrouillon', e.id)} ${esc(e.titre || '')}${e.generique ? ' <span class="an-note">(avant le générique)</span>' : ''}<br><span class="an-note vo-brut">« ${esc(e.derniere)} »</span></span><span class="${e.fin === 'plate' ? 'an-note' : ''}">${e.part} % · ${fins[e.fin]}</span></li>`).join('')}</ul>
      </section>
      ${(d.fins_repetees || []).length ? `<section class="an-carte"><div class="an-entete"><h2 class="an-titre">Les fins qui se répètent</h2><span class="an-note">${d.fins_repetees.length} fin(s)</span></div>
        <p class="an-note">La même dernière ligne dans plusieurs épisodes. Un gimmick voulu, ou une fin qu'on reprend sans s'en rendre compte ?</p>
        <ul class="ec-liste">${d.fins_repetees.map(g => `<li><span class="vo-brut">« ${esc(g[0].texte)} »</span><span>${g.map(x => this._lien(esc(x.code), 'ouvrirBrouillon', x.id)).join(', ')}</span></li>`).join('')}</ul></section>` : ''}`;
  },

  // ─── Scénario : les pavés d'action et la densité des séquences ───

  vueLisibilite() {
    return '<div class="an-vue" id="ec-lisibilite"><p class="an-note">Lecture du scénario…</p></div>';
  },

  async _chargerLisibilite() {
    const d = await api.get('film_lisibilite');
    const slot = document.getElementById('ec-lisibilite');
    if (!slot || !d) return;
    const seqs = d.sequences;
    const paves = seqs.flatMap(s => s.paves.map(p => ({ ...p, s })));
    const denses = seqs.filter(s => s.densite >= 70 && s.action >= 8);
    const moy = seqs.length ? Math.round(seqs.reduce((t, s) => t + s.densite, 0) / seqs.length) : 0;
    slot.innerHTML = `
      ${Analyse._kpis([{ l: 'Pavés', v: paves.length, s: 'blocs d\'action de plus de 4 lignes' }, { l: 'Séquences très denses', v: denses.length, s: '70 % d\'action ou plus' }, { l: 'Part d\'action', v: `${moy} %`, s: 'en moyenne par séquence' }])}
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Les pavés</h2><span class="an-note">${paves.length} bloc(s)</span></div>
        <p class="an-note">Un lecteur de scénario survole les blocs d'action de plus de quatre lignes (à la largeur d'une page en Courier 12). Couper un pavé en deux paragraphes, ou en garder l'essentiel, rend la page plus rapide à lire.</p>
        ${paves.length ? `<ul class="ec-liste">${paves.sort((a, b) => b.lignes - a.lignes).slice(0, 60).map(p => `<li class="${p.lignes >= 8 ? 'ec-orange' : ''}"><span>Séq. ${p.s.g} · ${this._lien(esc(p.s.code), 'ouvrirEpisode', p.s.ep)} · <span class="vo-brut">${esc(p.s.slug)}</span><br><span class="an-note vo-brut">${esc(p.debut)}…</span></span><span>${p.lignes} lignes</span></li>`).join('')}</ul>` : '<p class="an-note">Aucun pavé : toutes les actions tiennent en quatre lignes.</p>'}
      </section>
      ${Roman.film && d.debut ? this._htmlDebut(d.debut) : ''}
      <section class="an-carte">
        <h2 class="an-titre">La densité, séquence par séquence</h2>
        <p class="an-note">La part de lignes d'action face aux dialogues. Une suite de séquences très denses ralentit la lecture ; une suite de dialogues seuls fait perdre l'image.</p>
        <div class="dens-barres" role="img" aria-label="Part d'action de chaque séquence">${seqs.map(s => `<span style="height:${Math.max(3, s.densite)}%" class="${s.densite >= 70 && s.action >= 8 ? 'dense' : ''}" title="Séq. ${s.g} · ${esc(s.slug)} : ${s.densite} % d'action"></span>`).join('')}</div>
      </section>`;
  },

  vueStyle() {
    return '<div class="an-vue" id="ec-style"><p class="an-note">Lecture de la feuille de style…</p></div>';
  },

  vueExport() {
    return '<div class="an-vue" id="ec-export"><p class="an-note">Mise en page…</p></div>';
  },

  vueLiege() {
    return '<div class="an-vue" id="ec-liege"><p class="an-note">Les cartes arrivent…</p></div>';
  },

  vueTournage() {
    return '<div class="an-vue" id="ec-tournage"><p class="an-note">Préparation du tournage…</p></div>';
  },

  vueStoryboard() {
    return '<div class="an-vue" id="ec-sb"><p class="an-note">Ouverture du storyboard…</p></div>';
  },

  ouvrirStoryboard(id) {
    this.epId = Number(id);
    this.portee = 'episode';
    this.vue = Roman.storyboard ? 'storyboard' : 'preparer';
    this.rendre();
  },

  // ─── Dépouillement ───────────────────────────────────────────────────────

  vueDepouillement() {
    return '<p class="an-note">Chargement du dépouillement…</p><div class="an-vue" id="ec-dep"></div>';
  },

  async _chargerDepouillement() {
    this.dep = await api.get('ecriture_depouillement');
    this._rendreDepouillement();
  },

  // Les repères viennent toujours de toute la série, même sur une saison
  _reperesDep() {
    const principaux = new Set(this.d.persos.filter(p => p.g === 'p').map(p => p.n));
    const lignes = this.ordre.filter(e => this.dep[e.id]).map(e => {
      const r = this.dep[e.id];
      return { ...r, ep: e, roles: r.r.filter(n => !principaux.has(n)), nouveaux: r.d.filter(x => x.nouveau).length };
    });
    const rang = (f, part) => [...lignes.map(f)].sort((a, b) => a - b)[Math.floor(lignes.length * part)] || 0;
    const repere = part => ({ sc: rang(l => l.sc, part), d: rang(l => l.d.length, part), r: rang(l => l.roles.length, part) });
    return { lignes, med: repere(.5), seuil: repere(.9) };
  },

  _pointsLourds(l, s) {
    return [l.sc >= s.sc && 'scènes', l.d.length >= s.d && 'décors', l.nouveaux >= 2 && 'nouveaux', l.roles.length >= s.r && 'rôles', l.e > 0 && 'extérieurs'].filter(Boolean);
  },

  _rendreDepouillement() {
    const slot = document.getElementById('ec-dep');
    if (!slot || !this.dep) return;
    const { lignes, med, seuil } = this._reperesDep();
    const ids = new Set(this.ensemble().map(e => e.id));
    const tri = lignes.filter(l => ids.has(l.ep.id)).map(l => ({ ...l, lourds: this._pointsLourds(l, seuil) }))
      .sort((a, b) => b.lourds.length - a.lourds.length || b.d.length - a.d.length);
    slot.previousElementSibling.textContent = `Ce que chaque épisode demande au tournage. Un point est lourd s'il dépasse ${seuil.sc - 1} scènes, ${seuil.d - 1} décors, ${seuil.r - 1} rôles en plus, s'il compte au moins 2 décors nouveaux ou un extérieur.`;
    if (!tri.length) {
      slot.innerHTML = '<section class="an-carte"><p class="an-note">Aucun script analysé dans ce choix.</p></section>';
      return;
    }
    const choisi = tri.find(l => l.ep.id === this.depId) || tri[0];
    this.depId = choisi.ep.id;
    const lourds = tri.filter(l => l.lourds.length >= 3).length;
    const vus = this.depTous ? tri : tri.slice(0, 8);
    if (!vus.includes(choisi)) vus.push(choisi);
    const chiffre = (label, v, ref, cle) => {
      const lourd = choisi.lourds.includes(cle);
      return `<li class="${lourd ? 'ec-orange' : ''}"><span>${label}</span><span>${v} · médiane série ${ref}${lourd ? ' · lourd' : ''}</span></li>`;
    };
    slot.innerHTML = `
      <p class="an-note">${tri.length} épisode(s) · ${lourds} lourd(s) sur au moins 3 points</p>
      <div class="ec-dep-grille">
        <section class="an-carte">
          <div class="an-entete"><h2 class="an-titre">Les plus lourds</h2>${tri.length > 8 ? `<button type="button" class="btn btn-secondary btn-sm" onclick="Ecriture.basculerDepTous()">${this.depTous ? 'Les 8 plus lourds' : `Voir les ${tri.length}`}</button>` : ''}</div>
          <div class="an-table"><table class="ec-dep-table">
            <thead><tr><th scope="col">Épisode</th><th scope="col">Scènes</th><th scope="col">Décors</th><th scope="col">Nouveaux</th><th scope="col">Rôles</th><th scope="col">Lourd</th></tr></thead>
            <tbody>${vus.map(l => `<tr class="${l === choisi ? 'actif' : ''}">
              <td><button type="button" id="ec-dep-${l.ep.id}" class="ec-lien ec-dep-btn" aria-pressed="${l === choisi}" data-a="choisirDep" data-v="${l.ep.id}" onclick="Ecriture.agir(this)">${esc(this._code(l.ep))}</button></td>
              <td>${l.sc}</td><td>${l.d.length}</td><td>${l.nouveaux}</td><td>${l.roles.length}</td><td class="${l.lourds.length >= 3 ? 'ec-orange' : ''}">${l.lourds.length} / 5</td>
            </tr>`).join('')}</tbody>
          </table></div>
        </section>
        <section class="an-carte">
          <div class="an-entete"><h2 class="an-titre">${esc(this._code(choisi.ep))} — ${esc(choisi.ep.t || 'Sans titre')}</h2>${this._lien('Ouvrir', 'ouvrirEpisode', choisi.ep.id)}</div>
          <ul class="ec-liste">
            ${chiffre('Scènes', choisi.sc, med.sc, 'scènes')}
            ${chiffre('Décors', choisi.d.length, med.d, 'décors')}
            ${chiffre('Rôles en plus', choisi.roles.length, med.r, 'rôles')}
            <li><span>Changements de décor</span><span>${choisi.ch}</span></li>
            <li class="${choisi.e ? 'ec-orange' : ''}"><span>Extérieurs</span><span>${choisi.e}${choisi.e ? ' · lourd' : ''}</span></li>
          </ul>
          <h3 class="an-label">Décors</h3>
          <ul class="ec-liste">${choisi.d.map(x => `<li><span>${esc(x.nom)}</span><span class="${x.nouveau ? 'ec-orange' : 'an-note'}">${x.n} scène${x.n > 1 ? 's' : ''}${x.nouveau ? ' · nouveau' : ''}</span></li>`).join('')}</ul>
          <h3 class="an-label">Rôles en plus des personnages principaux</h3>
          <p class="an-note">${choisi.roles.map(esc).join(', ') || 'Aucun.'}</p>
        </section>
      </div>
    `;
  },

  choisirDep(id) {
    this.depId = Number(id);
    this._rendreDepouillement();
    document.getElementById(`ec-dep-${id}`)?.focus();
  },

  basculerDepTous() {
    this.depTous = !this.depTous;
    this._rendreDepouillement();
  },

  // ─── Séquencier ──────────────────────────────────────────────────────────

  _cartes() {
    try { return JSON.parse(this.notes[`sequencier:${this.epId}`] || '[]'); } catch (e) { return []; }
  },

  _ecrireCartes(liste, rendre = true) {
    this.note(`sequencier:${this.epId}`, liste.length ? JSON.stringify(liste) : '');
    if (rendre) this.rendreVue();
  },

  ajouterCarte() {
    this._ecrireCartes([...this._cartes(), { t: '', lieu: '', persos: '', i: 'A', min: 2 }]);
  },

  modifierCarte(n, cle, valeur) {
    const liste = this._cartes();
    liste[n][cle] = cle === 'min' ? Number(valeur) || 0 : valeur;
    this._ecrireCartes(liste, cle === 'min' || cle === 'i');
  },

  retirerCarte(n) {
    const liste = this._cartes();
    liste.splice(Number(n), 1);
    this._ecrireCartes(liste);
  },

  deplacerCarte(de, vers) {
    const liste = this._cartes();
    if (vers < 0 || vers >= liste.length) return;
    liste.splice(vers, 0, liste.splice(de, 1)[0]);
    this._ecrireCartes(liste);
  },

  monter(n) { this.deplacerCarte(Number(n), Number(n) - 1); },
  descendre(n) { this.deplacerCarte(Number(n), Number(n) + 1); },

  deposerCarte(event, vers) {
    event.preventDefault();
    this.deplacerCarte(this._carteTenue, vers);
  },

  envoyerAuBrouillon() {
    const texte = this._cartes().map(c => `INT. ${c.lieu.toUpperCase() || 'DÉCOR'} — JOUR\n\n/* ${c.i} : ${c.t} */\n\n`).join('');
    const cle = `brouillon:${this.epId}`;
    this.note(cle, `${this.notes[cle] ? `${this.notes[cle]}\n\n` : ''}${texte}`);
    this.aller('brouillon');
  },

  vueSequencier() {
    const cartes = this._cartes();
    const total = cartes.reduce((a, c) => a + (c.min || 0), 0);
    const cible = Math.round(this.moyennes(this.ecritsAvant()).mots / Settings.motsParMinute);
    const champ = (n, cle, label, valeur) => `<input type="text" aria-label="${label}" placeholder="${label}" value="${esc(valeur)}" onchange="Ecriture.modifierCarte(${n}, '${cle}', this.value)">`;
    const parts = ['A', 'B', 'C', 'D'].map(i => [i, cartes.filter(c => c.i === i).reduce((a, c) => a + (c.min || 0), 0)]).filter(([, m]) => m);

    return `
      ${Analyse._kpis([
        { l: 'Durée prévue', v: Analyse._duree(total), s: `moyenne ${Analyse._duree(cible)}` },
        { l: 'Scènes', v: cartes.length },
        ...parts.map(([i, m]) => ({ l: `Intrigue ${i}`, v: Analyse._duree(m), s: total ? `${Math.round((m * 100) / total)} %` : '' })),
      ])}
      ${cartes.length ? `
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Alternance</h2><span class="an-label">Largeur = durée prévue</span></div>
        <div class="ec-alternance">${cartes.map(c => `<span class="ec-intrigue-${esc(c.i)}" style="flex:${Math.max(c.min, 0.5)} 1 0" title="${esc(c.i)} : ${esc(c.t)}">${esc(c.i)}</span>`).join('')}</div>
      </section>` : ''}
      <div class="ec-cartes">
        ${cartes.map((c, n) => `
          <article class="ec-carte" draggable="true" ondragstart="Ecriture._carteTenue=${n}" ondragover="event.preventDefault()" ondrop="Ecriture.deposerCarte(event, ${n})">
            <span class="an-label">Scène ${n + 1}</span>
            ${champ(n, 't', 'Ce qui se passe', c.t)}
            <div class="ec-carte-ligne">${champ(n, 'lieu', 'Décor', c.lieu)}${champ(n, 'persos', 'Personnages', c.persos)}</div>
            <div class="ec-carte-ligne">
              <select aria-label="Intrigue" onchange="Ecriture.modifierCarte(${n}, 'i', this.value)">${['A', 'B', 'C', 'D'].map(i => `<option ${c.i === i ? 'selected' : ''}>${i}</option>`).join('')}</select>
              <input class="an-nombre" type="number" min="0" step="0.5" aria-label="Minutes" value="${c.min}" onchange="Ecriture.modifierCarte(${n}, 'min', this.value)">
              <span class="an-note">min</span>
              <span class="ec-carte-actions">${this._lien('↑', 'monter', n)} ${this._lien('↓', 'descendre', n)} ${this._lien('Retirer', 'retirerCarte', n)}</span>
            </div>
          </article>
        `).join('')}
      </div>
      <div class="an-ligne">
        <button type="button" class="btn btn-primary btn-sm" onclick="Ecriture.ajouterCarte()">Ajouter une scène</button>
        ${cartes.length ? '<button type="button" class="btn btn-secondary btn-sm" onclick="Ecriture.envoyerAuBrouillon()">Envoyer au brouillon</button>' : ''}
      </div>
    `;
  },

  // ─── Plan de saison ──────────────────────────────────────────────────────

  _plan(id) {
    try { return JSON.parse(this.notes[`plan:${id}`] || '{}'); } catch (e) { return {}; }
  },

  setPlan(id, cle, valeur) {
    const plan = { ...this._plan(id), [cle]: valeur };
    this.note(`plan:${id}`, plan.centre || plan.idee ? JSON.stringify(plan) : '');
    if (cle === 'centre') this.rendreVue();
  },

  _centre(e) {
    if (!e.x) return this._plan(e.id).centre || '';
    return [...e._noms.entries()].filter(([n]) => this.d.persos.some(p => p.n === n && p.g === 'p')).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  },
  // ─── Idée au hasard ──────────────────────────────────────────────────────

  _auHasard(liste) {
    return liste[Math.floor(Math.random() * liste.length)];
  },

  nouvelleIdee() {
    const avant = this.ecritsAvant();
    const duo = this._auHasard(this.duos(avant).filter(p => p.ecart >= 2).slice(0, 15));
    const decor = this._auHasard(this.decors(avant).slice(0, 5));
    const sujet = this._auHasard(this.sujets(avant).slice(0, 25));
    const slot = document.getElementById('ec-idee');
    if (!slot) return;
    slot.innerHTML = [
      ['Duo', duo ? `${duo.a} et ${duo.b}` : '—'], ['Décor', decor?.nom || '—'], ['Sujet à reprendre', sujet?.mot || '—'],
    ].map(([l, v]) => `<div class="an-kpi"><div class="an-label">${l}</div><strong>${esc(v)}</strong></div>`).join('');
  },

  _carteIdee() {
    return `
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Une contrainte au hasard</h2><button type="button" class="btn btn-secondary btn-sm" onclick="Ecriture.nouvelleIdee()">Une autre</button></div>
        <div class="an-alertes" id="ec-idee"></div>
      </section>
    `;
  },

  // ─── Lecture à voix haute ────────────────────────────────────────────────

  lire(lignes) {
    if (!window.speechSynthesis) { toast('Ce navigateur ne sait pas lire à voix haute.', 'info'); return; }
    speechSynthesis.cancel();
    // Le navigateur charge ses voix après coup : au premier appel la liste peut être vide
    if (!speechSynthesis.getVoices().length && !this._voixAttendues) {
      this._voixAttendues = true;
      speechSynthesis.addEventListener('voiceschanged', () => this.lire(lignes), { once: true });
      return;
    }
    const voix = speechSynthesis.getVoices().filter(v => v.lang.startsWith('fr'));
    if (!voix.length) { toast('Aucune voix française installée sur cet ordinateur.', 'info'); return; }
    const parleurs = [...new Set(lignes.map(l => l.qui))];
    lignes.filter(l => l.qui && l.texte).forEach(l => {
      const u = new SpeechSynthesisUtterance(l.texte);
      const rang = parleurs.indexOf(l.qui);
      u.voice = voix[rang % voix.length];
      u.lang = u.voice.lang;
      // Plus de personnages que de voix : la hauteur les distingue encore
      u.pitch = 0.8 + ((rang * 0.35) % 0.9);
      speechSynthesis.speak(u);
    });
  },

  arreterLecture() {
    window.speechSynthesis?.cancel();
  },

  // ─── Retours des lecteurs ────────────────────────────────────────────────

  async _chargerLecteurs() {
    const slot = document.getElementById('ec-lecteurs');
    if (!slot) return;
    const retours = await api.get(`ecriture_lecteurs&episode=${this.epId}`);
    if (!slot.isConnected) return;
    slot.innerHTML = retours.map(r => `
      <p class="ec-replique"><strong>${esc(r.nom)}${r.note != null ? ` · ${Analyse._num(r.note)}/10` : ''}${r.critere ? ` · ${esc(r.critere)}` : ''}</strong>${esc(r.commentaire || '—')}</p>
    `).join('') || '<p class="an-note">Aucun retour de lecteur sur cet épisode.</p>';
  },

  // ─── Gags par page ───────────────────────────────────────────────────────

  _gagsEpisode() {
    try { return new Set(JSON.parse(this.notes[`gags-ep:${this.epId}`] || '[]')); } catch (e) { return new Set(); }
  },

  marquerGag(n) {
    const ligne = this._lignesEp?.[Number(n)];
    if (!ligne) return;
    const gags = this._gagsEpisode();
    if (gags.has(ligne.texte)) gags.delete(ligne.texte);
    else gags.add(ligne.texte);
    this.note(`gags-ep:${this.epId}`, gags.size ? JSON.stringify([...gags]) : '');
    this._rendreGags();
  },

  vueGags() {
    const e = this.ordre[this.rang.get(this.epId)];
    if (!e.x) return '<section class="an-carte"><p class="an-note">Cet épisode n\'a pas encore de script.</p></section>';
    return `
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Gags par page</h2><span class="an-label" id="ec-gags-total"></span></div>
        <div id="ec-gags-courbe"><p class="an-note">Lecture…</p></div>
      </section>
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Marque les répliques drôles</h2><span class="an-label">Clique sur ☆</span></div>
        <div id="ec-gags-lignes"></div>
      </section>
    `;
  },

  async _chargerGags() {
    const id = this.epId;
    const lignes = await api.get(`ecriture_episode&episode=${id}`);
    if (id !== this.epId) return;
    this._lignesEp = lignes;
    this._rendreGags();
  },

  _rendreGags() {
    const courbe = document.getElementById('ec-gags-courbe');
    const liste = document.getElementById('ec-gags-lignes');
    if (!courbe || !this._lignesEp) return;
    const lignes = this._lignesEp;
    const gags = this._gagsEpisode();
    const fiche = this.fiches.get(this.epId) || {};
    const pages = Number(fiche.nb_pages) > 0 ? Number(fiche.nb_pages) : 10;
    const total = lignes.reduce((a, l) => a + l.mots, 0) || 1;
    const parPage = Array(pages).fill(0);
    let cumul = 0, sansGag = 0, record = 0;
    lignes.forEach(l => {
      if (gags.has(l.texte)) parPage[Math.min(pages - 1, Math.floor((cumul * pages) / total))]++;
      cumul += l.mots;
    });
    parPage.forEach(n => {
      sansGag = n ? 0 : sansGag + 1;
      record = Math.max(record, sansGag);
    });
    const max = Math.max(1, ...parPage);
    const marques = parPage.reduce((a, b) => a + b, 0);
    document.getElementById('ec-gags-total').textContent = `${marques} gag(s) · ${Analyse._num(Math.round((marques * 10) / pages) / 10)} par page · ${record} page(s) d'affilée sans gag`;
    courbe.innerHTML = `
      <div class="ec-barres" role="img" aria-label="Nombre de gags par page">${parPage.map((n, i) => `<div class="ec-barre-col" title="Page ${i + 1} : ${n} gag(s)"><span style="height:${Math.round((n * 100) / max)}%"></span></div>`).join('')}</div>
      <div class="ec-barres-axe"><span class="an-note">page 1</span><span class="an-note">page ${pages}</span></div>
    `;
    liste.innerHTML = lignes.map((l, n) => `<p class="ec-replique ec-gag-ligne">${this._lien(gags.has(l.texte) ? '★' : '☆', 'marquerGag', n, gags.has(l.texte) ? 'ec-etoile' : '')}<span><strong>${esc(l.qui)}</strong>${esc(l.texte)}</span></p>`).join('');
  },

  // ─── Éditeur de script ───────────────────────────────────────────────────

  // Même découpage que le serveur, ligne par ligne, pour la mise en forme et les exports
  classerLignes(texte) {
    let qui = false, note = false;
    return texte.split('\n').map(brut => {
      const ligne = brut.trim();
      if (note || ligne.startsWith('/*')) {
        note = !ligne.includes('*/');
        return { type: 'note', ligne: brut };
      }
      if (!ligne) { qui = false; return { type: 'vide', ligne: brut }; }
      if (/^(INT|EXT)\b/i.test(ligne)) { qui = false; return { type: 'scene', ligne: brut }; }
      if (/^\(.*\)$/.test(ligne)) return { type: 'parenthese', ligne: brut };
      if (/^([A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ][A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ\s'\-\d]{0,35})(\s*\(.*\))?$/.test(ligne)) { qui = true; return { type: 'perso', ligne: brut }; }
      return { type: qui ? 'dialogue' : 'action', ligne: brut };
    });
  },

  _miroir(texte) {
    const miroir = document.getElementById('ec-miroir');
    if (!miroir) return;
    const lignes = this.classerLignes(texte);
    const commentees = new Set(this._placerCommentaires(lignes.map(l => l.ligne)).map(c => c.ligne));
    miroir.innerHTML = `${lignes.map((l, i) => `<span class="ec-l-${l.type}${commentees.has(i) ? ' ec-l-com' : ''}">${this._surligner(l.ligne)}</span>`).join('\n')}\n`;
    this._suivreDefilement();
  },

  _suivreDefilement() {
    const champ = document.getElementById('ec-brouillon'), miroir = document.getElementById('ec-miroir');
    if (!champ || !miroir) return;
    // Les deux n'ont pas la même barre de défilement : le texte doit couper au même endroit
    miroir.style.paddingRight = `${16 + miroir.clientWidth - champ.clientWidth}px`;
    miroir.scrollTop = champ.scrollTop;
  },

  _nomsScript() {
    if (!this._noms) {
      const parole = new Map(this.d.parleurs.map(p => [p.n, p.m]));
      this._noms = [...this.personnages].sort((a, b) => (parole.get(b.prenom) || 0) - (parole.get(a.prenom) || 0))
        .map(p => `${p.prenom || ''} ${p.nom || ''}`.trim().toUpperCase()).filter(Boolean);
    }
    return this._noms;
  },

  // Ce qui est en train d'être tapé, et les propositions qui vont avec
  _proposer(champ) {
    const fin = champ.selectionStart;
    if (fin !== champ.selectionEnd) return null;
    const debut = champ.value.lastIndexOf('\n', fin - 1) + 1;
    const ligne = champ.value.slice(debut, fin);
    const scene = ligne.match(/^((?:INT|EXT)\.?\s+)(.*)$/i);
    if (scene) {
      const q = this._plat(scene[2]);
      return { debut: debut + scene[1].length, fin, liste: this.d.lieux.map(l => l.n.toUpperCase()).filter(n => this._plat(n).startsWith(q)).slice(0, 6) };
    }
    if (!/^[A-ZÀ-Ü][A-ZÀ-Ü' -]*$/.test(ligne)) return null;
    const q = this._plat(ligne);
    return { debut, fin, liste: this._nomsScript().filter(n => this._plat(n).startsWith(q) && n !== ligne).slice(0, 6) };
  },

  _majSuggestions(champ) {
    const slot = document.getElementById('ec-suggestions');
    if (!slot) return;
    this._proposition = this._proposer(champ);
    const liste = this._proposition?.liste || [];
    slot.innerHTML = liste.length
      ? liste.map((n, i) => `<button type="button" class="ec-suggestion" onmousedown="event.preventDefault();Ecriture.accepter(${i})">${esc(n)}${i ? '' : ' <span class="an-note">⇥ Tab</span>'}</button>`).join('')
      : '<span class="an-note">Tape un nom en capitales ou INT. pour voir les propositions.</span>';
  },

  accepter(i) {
    const champ = document.getElementById('ec-brouillon');
    const p = this._proposition;
    if (!champ || !p?.liste[i]) return;
    champ.setRangeText(p.liste[i], p.debut, p.fin, 'end');
    champ.focus();
    this.ecrire(champ.value);
    this._majSuggestions(champ);
  },

  toucheEditeur(event) {
    if (event.key === 'Tab' && this._proposition?.liste.length) {
      event.preventDefault();
      this.accepter(0);
    }
    if (event.key === 'Escape' && document.querySelector('.ec-atelier.ec-focus')) this.basculerFocus();
  },

  basculerFocus() {
    const atelier = document.getElementById('ec-atelier');
    atelier?.classList.toggle('ec-focus');
    // En sortant de la concentration, le bruit de fond s'arrête
    if (!atelier?.classList.contains('ec-focus')) Ambiance.arreter();
    document.getElementById('ec-brouillon')?.focus();
    this._majFocus();
  },

  _titreEp() {
    const e = this.ordre?.[this.rang?.get(this.epId)];
    return e ? `${this._code(e)}${e.t ? ` — ${e.t}` : ''}` : '';
  },

  // ─── Contraintes d'écriture : des règles qu'on se donne pour un épisode (à la façon de l'Oulipo) ───

  CONTRAINTES: {
    maxRepliques: ['Au plus N répliques', 'nombre'],
    maxMots: ['Au plus N mots par réplique', 'nombre'],
    sansMot: ['Sans le mot…', 'texte'],
    questions: ['Ce personnage ne parle que par questions', 'texte'],
    muet: ['Ce personnage ne dit rien', 'texte'],
    minScenes: ['Au moins N scènes', 'nombre'],
  },

  _contraintes() {
    try { const v = JSON.parse(this.notes[`contraintes:${this.epId}`] || '[]'); return Array.isArray(v) ? v.filter(c => c && this.CONTRAINTES[c.type]) : []; } catch (e) { return []; }
  },

  ajouterContrainte() {
    const type = document.getElementById('ec-ct-type')?.value;
    const valeur = (document.getElementById('ec-ct-valeur')?.value || '').trim();
    if (!this.CONTRAINTES[type] || !valeur) { toast('Choisis une règle et sa valeur.', 'info'); return; }
    if (this.CONTRAINTES[type][1] === 'nombre' && !(Number(valeur) > 0)) { toast('Il faut un nombre.', 'info'); return; }
    this.note(`contraintes:${this.epId}`, JSON.stringify([...this._contraintes(), { type, valeur: valeur.slice(0, 60) }].slice(0, 12)));
    this._majContraintes();
  },

  retirerContrainte(i) {
    const l = this._contraintes();
    l.splice(i, 1);
    this.note(`contraintes:${this.epId}`, l.length ? JSON.stringify(l) : '');
    this._majContraintes();
  },

  // Chaque règle vérifiée sur le brouillon : tenue ou pas, avec le détail
  _verifierContrainte(c, lignes) {
    const repliques = [];
    let qui = null, cour = null;
    lignes.forEach(l => {
      if (l.type === 'perso') { qui = l.ligne.trim().replace(/\s*\(.*\)$/, '').toUpperCase(); cour = { qui, texte: '' }; repliques.push(cour); }
      else if (l.type === 'dialogue' && cour) cour.texte += ` ${l.ligne.trim()}`;
      else if (l.type !== 'parenthese') cour = null;
    });
    const plat = t => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const nom = plat(c.valeur).toUpperCase();
    const de = r => plat(r.qui).toUpperCase() === nom || plat(r.qui).toUpperCase().startsWith(`${nom} `);
    switch (c.type) {
      case 'maxRepliques': { const n = repliques.length; return [n <= Number(c.valeur), `${n} réplique(s)`]; }
      case 'maxMots': { const trop = repliques.filter(r => (r.texte.match(/\S+/g) || []).length > Number(c.valeur)); return [!trop.length, trop.length ? `${trop.length} réplique(s) trop longue(s), la plus longue : ${Math.max(...trop.map(r => (r.texte.match(/\S+/g) || []).length))} mots` : 'toutes tiennent']; }
      case 'sansMot': { const n = (plat(lignes.map(l => l.ligne).join(' ')).match(new RegExp(`(?<![\\p{L}])${plat(c.valeur).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'gu')) || []).length; return [!n, n ? `${n} fois` : 'jamais']; }
      case 'questions': { const siens = repliques.filter(de); const non = siens.filter(r => r.texte.trim() && !/\?\s*[»"]?\s*$/.test(r.texte.trim())); return [!non.length, siens.length ? `${siens.length - non.length} / ${siens.length} répliques en question` : 'ne parle pas encore']; }
      case 'muet': { const n = repliques.filter(de).length; return [!n, n ? `${n} réplique(s)` : 'silencieux']; }
      case 'minScenes': { const n = lignes.filter(l => l.type === 'scene').length; return [n >= Number(c.valeur), `${n} scène(s)`]; }
      default: return [true, ''];
    }
  },

  _majContraintes() {
    const slot = document.getElementById('ec-contraintes');
    if (!slot) return;
    const liste = this._contraintes();
    const lignes = this.classerLignes(this._texteBrouillon());
    const resultats = liste.map(c => this._verifierContrainte(c, lignes));
    const tenues = resultats.filter(r => r[0]).length;
    slot.innerHTML = `<details ${liste.length || this._contraintesOuvert ? 'open' : ''} ontoggle="Ecriture._contraintesOuvert = this.open">
      <summary class="an-label">Contraintes${liste.length ? ` (${tenues}/${liste.length} tenues)` : ''}</summary>
      ${liste.length ? `<ul class="ec-liste">${liste.map((c, i) => `<li class="${resultats[i][0] ? '' : 'ec-orange'}"><span>${resultats[i][0] ? '✓' : '✗'} ${esc(this.CONTRAINTES[c.type][0].replace('N ', `${c.valeur} `).replace('…', ` « ${c.valeur} »`).replace('Ce personnage', c.valeur))}<br><span class="an-note">${esc(resultats[i][1])}</span></span><button type="button" class="ec-lien" onclick="Ecriture.retirerContrainte(${i})">retirer</button></li>`).join('')}</ul>` : '<p class="an-note">Des règles à se donner pour cet épisode, comme un jeu : l\'app vérifie à mesure que tu écris.</p>'}
      <div class="an-ligne"><select id="ec-ct-type" aria-label="Règle">${Object.entries(this.CONTRAINTES).map(([k, [l]]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
        <input id="ec-ct-valeur" type="text" maxlength="60" placeholder="Nombre, mot ou nom" aria-label="Valeur de la règle">
        <button type="button" class="btn btn-ghost btn-sm" onclick="Ecriture.ajouterContrainte()">Ajouter</button></div>
    </details>`;
  },

  // ─── Scènes, remplacement et commentaires du brouillon ───────────────────

  _majAtelier() {
    this._majScenes();
    this._majCommentaires();
    this._majContraintes();
    if (this.rechQ) this._majRecherche();
  },

  _texteBrouillon() {
    return document.getElementById('ec-brouillon')?.value ?? '';
  },

  _scenesDe(texte) {
    return this.classerLignes(texte).map((l, i) => ({ ...l, i })).filter(l => l.type === 'scene').map(l => ({ debut: l.i, titre: l.ligne.trim() }));
  },

  // ─── Révisions en couleur d'un épisode : comme sur un tournage, chaque scène garde la couleur de la version
  // où son texte est apparu ; ce qui a changé depuis la dernière version figée (ou le dernier envoi) se voit ───

  _hashTexte(t) {
    const s = String(t).toLowerCase().replace(/\s+/g, ' ').trim();
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  },

  _scenesEmpreintes(texte) {
    const lignes = String(texte).split('\n');
    const scenes = this._scenesDe(texte);
    return scenes.map((s, n) => ({ ...s, h: this._hashTexte(lignes.slice(s.debut, n + 1 < scenes.length ? scenes[n + 1].debut : lignes.length).join('\n')) }));
  },

  _lireRevisions(brut) {
    try { const v = JSON.parse(brut || '[]'); return Array.isArray(v) ? v.filter(r => r && Array.isArray(r.h) && typeof r.couleur === 'string') : []; } catch (e) { return []; }
  },

  _revisionsEp(id = this.epId) {
    return this._lireRevisions(this.notes?.[`revisions:${id}`]);
  },

  // Fige la version d'un épisode (depuis le brouillon, ou depuis l'envoi à un lecteur) ; rien de neuf si rien n'a changé
  async figerRevisionEpisode(id, texte, note = '') {
    const cle = `revisions:${id}`;
    const toutes = this.notes && cle in this.notes ? this.notes : await api.get('analyse_notes').catch(() => ({}));
    const revs = this._lireRevisions(toutes?.[cle]);
    const h = this._scenesEmpreintes(texte).map(s => s.h);
    const derniere = revs[revs.length - 1];
    if (derniere && derniere.h.length === h.length && derniere.h.every((x, i) => x === h[i])) return { revs, nouvelle: false };
    revs.push({ couleur: REVISION_COULEURS[revs.length % REVISION_COULEURS.length][0], note: String(note).slice(0, 200), date: new Date().toISOString(), h });
    const valeur = JSON.stringify(revs.slice(-30));
    if (this.notes) this.notes[cle] = valeur;
    await api.put('analyse_notes', { cle, valeur });
    return { revs, nouvelle: true };
  },

  async figerRevisionBrouillon() {
    const note = prompt('Une note pour cette version (facultatif) : à qui elle part, ce qui a changé…', '');
    if (note === null) return;
    const r = await this.figerRevisionEpisode(this.epId, this._texteBrouillon(), note);
    toast(r.nouvelle ? `Version ${r.revs[r.revs.length - 1].couleur.toLowerCase()} figée.` : 'Rien n\'a changé depuis la dernière version figée.', r.nouvelle ? 'success' : 'info');
    this._majScenes();
  },

  async retirerRevisionBrouillon() {
    const revs = this._revisionsEp();
    if (!revs.length || !confirm(`Retirer la version ${revs[revs.length - 1].couleur.toLowerCase()} ? Le texte ne change pas.`)) return;
    await this.note(`revisions:${this.epId}`, revs.length > 1 ? JSON.stringify(revs.slice(0, -1)) : '');
    this._majScenes();
  },

  _htmlRevisions(scenes) {
    const revs = this._revisionsEp();
    const derniere = revs[revs.length - 1];
    const prochaine = REVISION_COULEURS[revs.length % REVISION_COULEURS.length][0].toLowerCase();
    if (!derniere) return `<p class="an-note ec-rev-ligne"><button type="button" class="ec-lien" onclick="Ecriture.figerRevisionBrouillon()">Figer cette version</button> : les suivantes marqueront en couleur les scènes changées.</p>`;
    const changees = scenes.filter(s => !derniere.h.includes(s.h)).length;
    const quand = new Date(derniere.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return `<p class="an-note ec-rev-ligne"><span class="ec-rev" style="background:${this._couleurRev(derniere.couleur)}"></span>Version ${esc(derniere.couleur.toLowerCase())} du ${esc(quand)}${derniere.note ? ` (${esc(derniere.note)})` : ''} · ${changees ? `<strong class="ec-orange">${changees} scène(s) changée(s) depuis</strong>` : 'rien de changé depuis'}
      · <button type="button" class="ec-lien" onclick="Ecriture.figerRevisionBrouillon()">Figer (${esc(prochaine)})</button> · <button type="button" class="ec-lien" onclick="Ecriture.retirerRevisionBrouillon()">retirer</button></p>`;
  },

  _majScenes() {
    const slot = document.getElementById('ec-scenes');
    if (!slot) return;
    const scenes = this._scenesEmpreintes(this._texteBrouillon());
    const revs = this._revisionsEp();
    const derniere = revs[revs.length - 1];
    const marque = s => {
      if (!derniere) return '';
      const origine = revs.find(r => r.h.includes(s.h));
      return origine && derniere.h.includes(s.h)
        ? `<span class="ec-rev" style="background:${this._couleurRev(origine.couleur)}" title="Texte de la version ${esc(origine.couleur.toLowerCase())}"></span>`
        : '<span class="ec-rev nouvelle" title="Changée depuis la dernière version figée"></span>';
    };
    slot.innerHTML = `
      <p class="an-label">Scènes (${scenes.length})</p>
      ${scenes.length ? this._htmlRevisions(scenes) : ''}
      ${scenes.length ? `<ol class="ec-scenes">${scenes.map((s, n) => `
        <li draggable="true" data-debut="${s.debut}" ondragstart="Ecriture._sceneTiree = ${n}" ondragover="event.preventDefault()" ondrop="event.preventDefault(); Ecriture.deplacerScene(Ecriture._sceneTiree, ${n})">
          <button type="button" class="ec-lien" title="${esc(s.titre)}" onclick="Ecriture.allerLigne(${s.debut})">${marque(s)}${n + 1}. ${esc(s.titre)}</button>
          <span class="ec-scene-fleches">
            <button type="button" class="ec-lien" aria-label="Monter la scène ${n + 1}" ${n ? '' : 'disabled'} onclick="Ecriture.deplacerScene(${n}, ${n - 1})">↑</button>
            <button type="button" class="ec-lien" aria-label="Descendre la scène ${n + 1}" ${n < scenes.length - 1 ? '' : 'disabled'} onclick="Ecriture.deplacerScene(${n}, ${n + 1})">↓</button>
          </span>
        </li>`).join('')}</ol>` : '<p class="an-note">Une ligne INT. ou EXT. ouvre une scène.</p>'}
    `;
    const champ = document.getElementById('ec-brouillon');
    if (champ) this._marquerScene(champ);
  },

  _marquerScene(champ) {
    const ligne = champ.value.slice(0, champ.selectionStart).split('\n').length - 1;
    const rangs = [...document.querySelectorAll('#ec-scenes li')];
    const actuelle = rangs.filter(li => Number(li.dataset.debut) <= ligne).pop();
    rangs.forEach(li => li.classList.toggle('actif', li === actuelle));
  },

  _defiler(ligne) {
    const champ = document.getElementById('ec-brouillon');
    const span = document.getElementById('ec-miroir')?.children[ligne];
    if (champ && span) champ.scrollTop = Math.max(0, span.offsetTop - 60);
    this._suivreDefilement();
  },

  // Lire le brouillon à voix haute depuis le curseur : une voix par personnage, la ligne lue suit dans l'éditeur
  ecouter() {
    const boutons = t => document.querySelectorAll('.ec-ecouter-btn').forEach(b => { b.textContent = t; });
    if (Lecture.enCours) { Lecture.arreter(); boutons('▶ Écouter'); return; }
    const champ = document.getElementById('ec-brouillon');
    if (!champ) return;
    const depuis = champ.value.slice(0, champ.selectionStart).split('\n').length - 1;
    // Une sélection : seulement elle ; sinon, du curseur jusqu'à la fin
    const jusqua = champ.selectionEnd > champ.selectionStart ? champ.value.slice(0, champ.selectionEnd).split('\n').length - 1 : Infinity;
    let qui = null;
    const lignes = [];
    this.classerLignes(champ.value).forEach((l, i) => {
      if (l.type === 'perso') { qui = l.ligne.trim().replace(/\s*\(.*\)$/, ''); return; }
      if (l.type === 'vide' || l.type === 'scene') qui = null;
      if (i < depuis || i > jusqua || ['vide', 'note', 'parenthese', 'perso'].includes(l.type) || !l.ligne.trim()) return;
      lignes.push({ qui: l.type === 'dialogue' ? qui : null, texte: l.ligne.trim(), ligne: i });
    });
    if (!lignes.length) { toast('Rien à lire après le curseur.', 'info'); return; }
    Lecture.lignes = lignes;
    Lecture.i = 0;
    Lecture.didascalies = true;
    Lecture.surLigne = l => { if (Number.isInteger(l.ligne)) { this._defiler(l.ligne); const pos = champ.value.split('\n').slice(0, l.ligne).reduce((a, x) => a + x.length + 1, 0); champ.setSelectionRange(pos, pos); } };
    Lecture.surFin = () => boutons('▶ Écouter');
    boutons('■ Arrêter');
    Lecture.basculer();
  },

  allerLigne(ligne) {
    const champ = document.getElementById('ec-brouillon');
    if (!champ) return;
    const pos = champ.value.split('\n').slice(0, ligne).reduce((a, l) => a + l.length + 1, 0);
    champ.focus();
    champ.setSelectionRange(pos, pos);
    this._defiler(ligne);
    this._marquerScene(champ);
  },

  // Une scène va de son en-tête jusqu'à l'en-tête suivant ; ce qui précède la première ne bouge pas
  async deplacerScene(de, vers) {
    const texte = this._texteBrouillon();
    const scenes = this._scenesDe(texte);
    if (de === vers || !scenes[de] || !scenes[vers]) return;
    const lignes = texte.split('\n');
    const intro = lignes.slice(0, scenes[0].debut);
    const blocs = scenes.map((s, n) => {
      const bloc = lignes.slice(s.debut, scenes[n + 1]?.debut ?? lignes.length);
      while (bloc.length && !bloc[bloc.length - 1].trim()) bloc.pop();
      return bloc;
    });
    await this.instantane('Avant déplacement de scène', texte);
    blocs.splice(vers, 0, blocs.splice(de, 1)[0]);
    const nouveau = [...intro, ...blocs.flatMap(b => [...b, ''])].join('\n');
    this._poserTexte(nouveau);
    this._defiler(this._scenesDe(nouveau)[vers].debut);
  },

  _poserTexte(texte) {
    const champ = document.getElementById('ec-brouillon');
    champ.value = texte;
    this.ecrire(texte);
    this._majAtelier();
  },

  basculerRecherche() {
    const barre = document.getElementById('ec-rech');
    barre.hidden = !barre.hidden;
    if (barre.hidden) {
      this._rechActive = false;
    } else {
      this._rechActive = true;
      const champ = document.getElementById('ec-brouillon');
      const choisi = champ.value.slice(champ.selectionStart, champ.selectionEnd);
      if (choisi && !choisi.includes('\n')) {
        this.rechQ = choisi;
        document.getElementById('ec-rech-q').value = choisi;
      }
      document.getElementById('ec-rech-q').focus();
    }
    this._majRecherche();
  },

  setRecherche(cle, valeur) {
    this[cle] = valeur;
    this._majRecherche();
  },

  _motifRecherche() {
    if (!this.rechQ || !this._rechActive) return null;
    const texte = this.rechQ.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
    return new RegExp(this.rechMot ? `(?<![\\p{L}\\p{N}])${texte}(?![\\p{L}\\p{N}])` : texte, this.rechCasse ? 'gu' : 'giu');
  },

  _surligner(ligne) {
    const motif = this._motifRecherche();
    if (!motif) return esc(ligne);
    let sortie = '', dernier = 0;
    for (const m of ligne.matchAll(motif)) {
      sortie += `${esc(ligne.slice(dernier, m.index))}<mark>${esc(m[0])}</mark>`;
      dernier = m.index + m[0].length;
    }
    return sortie + esc(ligne.slice(dernier));
  },

  _majRecherche() {
    const texte = this._texteBrouillon();
    const motif = this._motifRecherche();
    const compte = document.getElementById('ec-rech-compte');
    if (compte) compte.textContent = motif ? `${[...texte.matchAll(motif)].length} fois` : '';
    this._miroir(texte);
  },

  // Sans casse exacte, MARC devient PAUL et Marc devient Paul
  _adapter(trouve) {
    if (this.rechCasse || trouve !== trouve.toUpperCase() || trouve === trouve.toLowerCase()) return this.rechR;
    return this.rechR.toUpperCase();
  },

  rechercheSuivante() {
    const motif = this._motifRecherche();
    const champ = document.getElementById('ec-brouillon');
    if (!motif) return false;
    const trouves = [...champ.value.matchAll(motif)];
    if (!trouves.length) return false;
    const m = trouves.find(x => x.index >= champ.selectionEnd) || trouves[0];
    champ.focus();
    champ.setSelectionRange(m.index, m.index + m[0].length);
    this._defiler(champ.value.slice(0, m.index).split('\n').length - 1);
    return true;
  },

  remplacerUne() {
    const motif = this._motifRecherche();
    const champ = document.getElementById('ec-brouillon');
    if (!motif) return;
    const choisi = champ.value.slice(champ.selectionStart, champ.selectionEnd);
    if (choisi && [...choisi.matchAll(motif)].some(m => m[0] === choisi)) {
      const debut = champ.selectionStart;
      const nouveau = this._adapter(choisi);
      this._poserTexte(champ.value.slice(0, debut) + nouveau + champ.value.slice(debut + choisi.length));
      champ.setSelectionRange(debut + nouveau.length, debut + nouveau.length);
    }
    this.rechercheSuivante();
  },

  async remplacerTout() {
    const motif = this._motifRecherche();
    const texte = this._texteBrouillon();
    const nombre = motif ? [...texte.matchAll(motif)].length : 0;
    if (!nombre) { toast('Rien à remplacer.', 'info'); return; }
    await this.instantane('Avant remplacement', texte);
    this._poserTexte(texte.replace(motif, m => this._adapter(m)));
    toast(`${nombre} remplacement(s). L'ancien texte est dans les Versions.`);
  },

  _commentaires() {
    try { return JSON.parse(this.notes[`commentaires:${this.epId}`] || '[]'); } catch (e) { return []; }
  },

  async _ecrireCommentaires(liste) {
    await this.note(`commentaires:${this.epId}`, liste.length ? JSON.stringify(liste) : '');
    this._miroir(this._texteBrouillon());
    this._majCommentaires();
  },

  // Un commentaire suit sa ligne par son contenu : le texte du brouillon n'est jamais touché
  _placerCommentaires(lignes) {
    return this._commentaires().map((c, n) => {
      const ecart = i => Math.abs(i - c.n);
      const places = lignes.map((l, i) => (l.trim() === c.a ? i : -1)).filter(i => i >= 0).sort((a, b) => ecart(a) - ecart(b));
      return { ...c, rang: n, ligne: places.length ? places[0] : -1 };
    });
  },

  _majCommentaires() {
    const slot = document.getElementById('ec-comms');
    if (!slot) return;
    const places = this._placerCommentaires(this._texteBrouillon().split('\n'));
    slot.innerHTML = `
      <p class="an-label">À revoir (${places.length})</p>
      <div class="ec-com-ajout">
        <input id="ec-com-t" type="text" aria-label="Commentaire sur la ligne du curseur" placeholder="À revoir…" onkeydown="if (event.key === 'Enter') Ecriture.ajouterCommentaire()">
        <button type="button" class="btn btn-secondary btn-sm" onclick="Ecriture.ajouterCommentaire()">Sur cette ligne</button>
      </div>
      <ul class="ec-liste">${places.map(c => `<li>
        <span>${c.ligne >= 0 ? `<button type="button" class="ec-lien" title="${esc(c.a)}" onclick="Ecriture.allerLigne(${c.ligne})">${esc(c.t)}</button>` : `${esc(c.t)} <span class="an-note">(ligne modifiée : ${esc(c.a)})</span>`}</span>
        ${this._lien('Fait', 'retirerCommentaire', c.rang)}
      </li>`).join('')}</ul>
    `;
  },

  ajouterCommentaire() {
    const champ = document.getElementById('ec-brouillon');
    const avant = champ.value.slice(0, champ.selectionStart).split('\n');
    const ancre = champ.value.split('\n')[avant.length - 1].trim();
    if (!ancre) { toast('Place le curseur sur une ligne de texte.', 'info'); return; }
    const t = document.getElementById('ec-com-t').value.trim() || 'À revoir';
    this._ecrireCommentaires([...this._commentaires(), { a: ancre, n: avant.length - 1, t }]);
  },

  retirerCommentaire(n) {
    const liste = this._commentaires();
    liste.splice(Number(n), 1);
    this._ecrireCommentaires(liste);
  },

  _majFocus() {
    const slot = document.getElementById('ec-focus-info');
    if (!slot) return;
    const texte = document.getElementById('ec-brouillon')?.value || '';
    const b = this._bilanObjectifs();
    slot.textContent = `${Analyse._fr(this.lireBrouillon(texte).parleurs.reduce((a, p) => a + p.mots, 0))} mots · ${Analyse._fr(b.aujourdhui)}${b.objectif ? ` / ${Analyse._fr(b.objectif)}` : ''} aujourd'hui · Échap pour sortir`;
  },

  // ─── Fiche du personnage en écrivant ─────────────────────────────────────

  _majFiche(nom) {
    const slot = document.getElementById('ec-fiche');
    if (!slot) return;
    const connu = nom ? this._persoConnu(nom) : null;
    if (!connu) { slot.hidden = true; return; }
    const f = this.personnages.find(p => p.prenom === connu.n) || {};
    const a = this.absences(this.ecritsAvant()).find(p => p.nom === connu.n);
    const faits = this._faits().filter(x => this._plat(x.t).includes(this._plat(connu.n)));
    const infos = [f.profession, f.age ? `${f.age} ans` : '', f.caracteristiques].filter(Boolean);
    slot.hidden = false;
    slot.innerHTML = `
      <p class="an-label">${this._puceNom(connu.n)} ${esc(connu.n)}</p>
      ${infos.length ? `<p class="an-note">${infos.map(esc).join(' · ')}</p>` : '<p class="an-note">Fiche à compléter dans Persos.</p>'}
      ${a ? `<p class="an-note">${a.eps} épisode(s), dernier en ${esc(this._code(a.ep))}</p>` : ''}
      ${faits.map(x => `<p class="an-note">${esc(x.t)}</p>`).join('')}
    `;
  },

  _puceNom(nom) {
    return `<span class="ec-puce" style="display:inline-block;background:${Analyse._couleur(nom)}"></span>`;
  },

  // ─── Versions ────────────────────────────────────────────────────────────

  async instantane(motif, texte) {
    if (!texte?.trim()) return;
    await api.post('ecriture_versions', { episode_id: this.epId, texte, motif });
    this._dernierInstantane = Date.now();
  },

  _instantaneAuto(texte) {
    if (Date.now() - (this._dernierInstantane || 0) < 600000) return;
    this._dernierInstantane = Date.now();
    this.instantane('Automatique', texte);
  },

  async ouvrirVersions() {
    const liste = await api.get(`ecriture_versions&episode=${this.epId}`);
    modal.open(`
      <h2 class="an-titre">Versions du brouillon</h2>
      <p class="an-note">Une copie toutes les 10 minutes d'écriture, et avant chaque remplacement. Les 30 dernières sont gardées.</p>
      <div class="an-table"><table>
        <thead><tr><th>Date</th><th>Motif</th><th>Mots</th><th></th></tr></thead>
        <tbody>${liste.map(v => `<tr><td>${esc(v.cree_le)}</td><td>${esc(v.motif)}</td><td>${Analyse._fr(v.mots)}</td><td>${this._lien('Comparer', 'comparerVersion', v.id)} · ${this._lien('Restaurer', 'restaurerVersion', v.id)}</td></tr>`).join('') || '<tr><td colspan="4" class="an-note">Aucune version pour l\'instant.</td></tr>'}</tbody>
      </table></div>
      <div id="ec-diff"></div>
    `);
  },

  // Lignes retirées et ajoutées entre deux textes
  differences(avant, apres) {
    // Les scripts importés finissent leurs lignes par \r\n, pas le brouillon
    const a = avant.replace(/\r/g, '').split('\n'), b = apres.replace(/\r/g, '').split('\n');
    let debut = 0, finA = a.length, finB = b.length;
    while (debut < finA && debut < finB && a[debut] === b[debut]) debut++;
    while (finA > debut && finB > debut && a[finA - 1] === b[finB - 1]) { finA--; finB--; }
    const x = a.slice(debut, finA), y = b.slice(debut, finB);
    if (x.length * y.length > 4000000) return [...x.map(t => ({ s: '-', t })), ...y.map(t => ({ s: '+', t }))];
    const t = Array.from({ length: x.length + 1 }, () => new Uint16Array(y.length + 1));
    for (let i = x.length - 1; i >= 0; i--) {
      for (let j = y.length - 1; j >= 0; j--) t[i][j] = x[i] === y[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
    const sortie = [];
    let i = 0, j = 0;
    while (i < x.length || j < y.length) {
      if (i < x.length && j < y.length && x[i] === y[j]) { i++; j++; }
      else if (j < y.length && (i === x.length || t[i][j + 1] >= t[i + 1][j])) sortie.push({ s: '+', t: y[j++] });
      else sortie.push({ s: '-', t: x[i++] });
    }
    return sortie.filter(l => l.t.trim());
  },

  _htmlDiff(lignes) {
    const ajouts = lignes.filter(l => l.s === '+').length;
    return `
      <p class="an-label">${ajouts} ligne(s) ajoutée(s), ${lignes.length - ajouts} retirée(s)</p>
      <div class="ec-diff">${lignes.slice(0, 300).map(l => `<div class="${l.s === '+' ? 'ec-ajout' : 'ec-retrait'}">${l.s} ${esc(l.t)}</div>`).join('') || '<p class="an-note">Aucune différence.</p>'}</div>
      ${lignes.length > 300 ? `<p class="an-note">${lignes.length - 300} ligne(s) de plus non affichées.</p>` : ''}
    `;
  },

  async comparerVersion(id) {
    const v = await api.get(`ecriture_versions&id=${id}`);
    document.getElementById('ec-diff').innerHTML = this._htmlDiff(this.differences(v.texte, this.notes[`brouillon:${this.epId}`] || ''));
  },

  async restaurerVersion(id) {
    const v = await api.get(`ecriture_versions&id=${id}`);
    const cle = `brouillon:${this.epId}`;
    await this.instantane('Avant restauration', this.notes[cle] || '');
    await this.note(cle, v.texte);
    modal.close();
    this.rendreVue();
    toast('Version restaurée');
  },

  // ─── Valider comme script ────────────────────────────────────────────────

  async validerScript() {
    const texte = document.getElementById('ec-brouillon')?.value || '';
    if (!texte.trim()) { toast('Le brouillon est vide.', 'info'); return; }
    this.note(`brouillon:${this.epId}`, texte);
    const f = await api.get(`episodes/${this.epId}`);
    const lignes = this.differences(f.texte_episode || '', texte);
    modal.open(`
      <h2 class="an-titre">Remplacer le script de ${esc(this._code(this.ordre[this.rang.get(this.epId)]))} ?</h2>
      <p class="an-note">L'ancien script est d'abord copié dans les Versions, puis l'épisode est réanalysé.</p>
      ${this._commentaires().length ? `<p class="ec-orange">${this._commentaires().length} commentaire(s) encore à revoir : ${this._commentaires().map(c => esc(c.t)).join(' · ')}</p>` : ''}
      ${this._htmlDiff(lignes)}
      <div class="an-ligne ec-choix-outils">
        <button type="button" class="btn btn-primary btn-sm" onclick="Ecriture.confirmerScript()" ${lignes.length ? '' : 'disabled'}>Remplacer le script</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="modal.close()">Annuler</button>
      </div>
    `);
  },

  async confirmerScript() {
    const texte = this.notes[`brouillon:${this.epId}`] || '';
    const f = await api.get(`episodes/${this.epId}`);
    await this.instantane('Script avant remplacement', f.texte_episode || '');
    const fd = new FormData();
    fd.append('texte', texte);
    fd.append('episode_id', this.epId);
    toast('Analyse en cours…', 'info');
    const res = await api.upload(fd);
    modal.close();
    toast(`Script enregistré : ${res.nb_repliques_total} répliques.`);
    await this.init();
  },

  // ─── Exports ─────────────────────────────────────────────────────────────

  _telecharger(nom, contenu, type) {
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(new Blob([contenu], { type }));
    lien.download = nom;
    lien.click();
    URL.revokeObjectURL(lien.href);
  },

  exporter(format) {
    if (!format) return;
    const texte = document.getElementById('ec-brouillon')?.value || '';
    if (!texte.trim()) { toast('Le brouillon est vide.', 'info'); return; }
    const e = this.ordre[this.rang.get(this.epId)];
    const nom = `${this._code(e)}${e.t ? ` ${e.t}` : ''}`.replace(/[^\p{L}\p{N} _-]/gu, '');
    const lignes = this.classerLignes(texte).filter(l => l.type !== 'note');
    if (format === 'fountain') this._telecharger(`${nom}.fountain`, texte.replace(/\/\*[\s\S]*?\*\/\n*/g, ''), 'text/plain;charset=utf-8');
    if (format === 'fdx') this._telecharger(`${nom}.fdx`, this._fdx(lignes), 'application/xml;charset=utf-8');
    if (format === 'pdf') this._imprimerScript(e, lignes);
    document.getElementById('ec-export').value = '';
  },

  _fdx(lignes) {
    const types = { scene: 'Scene Heading', perso: 'Character', dialogue: 'Dialogue', parenthese: 'Parenthetical', action: 'Action' };
    const xml = t => t.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const corps = lignes.filter(l => types[l.type]).map(l => `    <Paragraph Type="${types[l.type]}"><Text>${xml(l.ligne)}</Text></Paragraph>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n<FinalDraft DocumentType="Script" Template="No" Version="5">\n  <Content>\n${corps}\n  </Content>\n</FinalDraft>\n`;
  },

  // Le script au format scénario, en HTML : un épisode (Exporter → PDF) ou plusieurs (envoi à un lecteur)
  SCRIPT_STYLE: `
      @page { size: A4; margin: 2.5cm 2.5cm 2.5cm 3.5cm; }
      body { font: 12pt/1.2 "Courier New", Courier, monospace; color: #000; background: #fff; max-width: 15cm; margin: 0 auto; }
      h1 { font-size: 12pt; text-align: center; text-transform: uppercase; margin: 0 0 2em; }
      section + section { break-before: page; }
      p { margin: 0; white-space: pre-wrap; }
      .scene { margin-top: 1.5em; font-weight: bold; text-transform: uppercase; break-after: avoid; }
      .action { margin-top: 1em; }
      .perso { margin: 1em 0 0 5.5cm; break-after: avoid; }
      .parenthese { margin-left: 4.5cm; }
      .dialogue { margin: 0 2cm 0 3cm; }`,

  htmlScript(titre, lignes) {
    return `<section><h1>${esc(titre)}</h1>
      ${lignes.filter(l => l.type !== 'vide' && l.type !== 'note').map(l => `<p class="${l.type}">${esc(l.ligne.trim())}</p>`).join('')}</section>`;
  },

  documentScript(titre, sections, filigrane = '') {
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(titre)}</title><style>${this.SCRIPT_STYLE}</style></head><body>${htmlFiligrane(filigrane)}${sections.join('')}</body></html>`;
  },

  // La version de lecture : un seul fichier HTML qui s'adapte à l'écran (téléphone, liseuse, ordinateur),
  // avec un sommaire, le mode sombre du lecteur, et sans rien à charger d'ailleurs
  LECTURE_STYLE: `
      :root { color-scheme: light dark; --fond: #fbfaf7; --encre: #1d1c1a; --doux: #6b6862; --trait: #e4e0d8; }
      @media (prefers-color-scheme: dark) { :root { --fond: #161514; --encre: #e9e6e0; --doux: #9a968f; --trait: #2e2c29; } }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--fond); color: var(--encre); font: 1.0625rem/1.6 Georgia, "Iowan Old Style", "Times New Roman", serif; -webkit-text-size-adjust: 100%; }
      main { max-width: 40rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
      header h1 { font-size: 1.6rem; line-height: 1.25; margin: 1rem 0 .25rem; }
      header p { color: var(--doux); margin: 0 0 1.5rem; }
      nav { border-top: 1px solid var(--trait); border-bottom: 1px solid var(--trait); padding: .75rem 0; margin-bottom: 2rem; }
      nav ol { margin: 0; padding-left: 1.4rem; }
      nav a { color: inherit; }
      section { padding-top: 1rem; }
      section + section { border-top: 1px solid var(--trait); margin-top: 3rem; break-before: page; }
      h2 { font-size: 1.3rem; margin: 0 0 1.25rem; }
      p { margin: 0; }
      .scene { margin: 2rem 0 .75rem; font: 700 .85rem/1.4 system-ui, sans-serif; letter-spacing: .06em; text-transform: uppercase; color: var(--doux); }
      .action { margin: .9rem 0; }
      .perso { margin: 1.1rem 0 0; font: 700 .8rem/1.4 system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; }
      .parenthese { font-style: italic; color: var(--doux); }
      .dialogue { margin: 0 0 0 1rem; }
      .transition { margin: 1rem 0; text-align: right; font: .8rem system-ui, sans-serif; text-transform: uppercase; color: var(--doux); }
      .haut { display: inline-block; margin-top: 2rem; font: .85rem system-ui, sans-serif; color: var(--doux); }
      @media (min-width: 48rem) { .dialogue { margin-left: 3rem; margin-right: 3rem; } .perso { margin-left: 3rem; } }
      @media print { nav, .haut { display: none; } body { background: #fff; color: #000; } }`,

  documentLecture(titre, episodes, sousTitre = '', filigrane = '') {
    const ancre = i => `ep-${i + 1}`;
    const sommaire = episodes.length > 1 ? `<nav aria-label="Sommaire"><ol>${episodes.map((e, i) => `<li><a href="#${ancre(i)}">${esc(e.titre)}</a></li>`).join('')}</ol></nav>` : '';
    const corps = episodes.map((e, i) => `<section id="${ancre(i)}"><h2>${esc(e.titre)}</h2>
      ${e.lignes.filter(l => l.type !== 'vide' && l.type !== 'note').map(l => `<p class="${esc(l.type)}">${esc(l.ligne.trim())}</p>`).join('\n')}
      ${episodes.length > 1 ? '<a class="haut" href="#haut">↑ Sommaire</a>' : ''}</section>`).join('\n');
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titre)}</title><style>${this.LECTURE_STYLE}</style></head>
<body>${htmlFiligrane(filigrane)}<main><header id="haut"><h1>${esc(titre)}</h1>${sousTitre ? `<p>${esc(sousTitre)}</p>` : ''}</header>${sommaire}${corps}</main></body></html>`;
  },

  _imprimerScript(e, lignes) {
    const page = window.open('', '_blank');
    if (!page) { toast('Autorise les fenêtres pour imprimer.', 'info'); return; }
    const titre = `${this._code(e)} — ${e.t || 'Sans titre'}`;
    page.document.write(this.documentScript(`${this._code(e)} ${e.t || ''}`.trim(), [this.htmlScript(titre, lignes)]));
    page.document.close();
    page.focus();
    page.print();
  },

  // ─── Dates et plan de la série ──────────────────────────────────────────

  _dateEp(e) {
    const brut = this.fiches.get(e.id)?.date_diege || '';
    return /^\d{4}-\d{2}-\d{2}$/.test(brut) ? brut : '';
  },

  async setDate(id, date) {
    const res = await api.post('ecriture_date', { id, date });
    if (res.error) { toast(res.error, 'error'); return; }
    this.fiches.get(id).date_diege = date;
    window.DataStore?.invalidateForMutation('episodes');
    this.rendreVue();
  },

  choisirSaisonPlan(numero) {
    this.planSaison = numero;
    if (this.planFiltre === 'aecrire' && !this.ensemble().some(e => e.sa === numero && !e.x)) this.planFiltre = 'tous';
    this.rendreVue();
  },

  vuePlan() {
    const eps = this.ensemble();
    const saisons = this.d.saisons.map(s => ({ s, eps: eps.filter(e => e.sa === s.n) })).filter(x => x.eps.length);
    if (!saisons.some(x => x.s.n === this.planSaison)) this.planSaison = (saisons.find(x => x.eps.some(e => !e.x)) || saisons[0])?.s.n || 0;
    const filtre = { tous: () => true, aecrire: e => !e.x, sansdate: e => !this._dateEp(e) }[this.planFiltre];
    const liste = eps.filter(e => e.sa === this.planSaison).filter(filtre);
    const principaux = this.d.persos.filter(p => p.g === 'p').map(p => p.n);
    const centres = principaux.map(n => ({ n, v: eps.filter(e => this._centre(e) === n).length })).filter(c => c.v);

    const dates = eps.filter(e => this._dateEp(e) && !Number(this.fiches.get(e.id)?.est_flashback));
    const sauts = [];
    dates.forEach((e, i) => {
      if (i && this._dateEp(e) < this._dateEp(dates[i - 1])) sauts.push({ e, avant: dates[i - 1] });
    });
    const dernier = dates[dates.length - 1];
    const ages = this.personnages.filter(p => p.date_naissance && dernier).map(p => ({
      nom: p.prenom, naissance: p.date_naissance, age: p.age,
      calcul: Math.floor((new Date(this._dateEp(dernier)) - new Date(p.date_naissance)) / 31557600000),
    }));
    const nbDates = eps.filter(e => this._dateEp(e)).length;
    const nbAecrire = eps.filter(e => e.sa === this.planSaison && !e.x).length;

    return `
      <section class="an-carte" aria-label="La série épisode par épisode">
        <div class="an-entete">
          <h2 class="an-titre">La série, épisode par épisode</h2>
          <div class="ec-plan-legende an-note"><span><i class="ec-plan-case dat"></i>écrit et daté</span><span><i class="ec-plan-case ecr"></i>écrit, sans date</span><span><i class="ec-plan-case"></i>à écrire</span></div>
        </div>
        <div class="ec-plan-grille">
          ${saisons.map(({ s, eps: l }) => {
            const ecrits = l.filter(e => e.x).length;
            return `<div class="ec-plan-ligne ${s.n === this.planSaison ? 'actif' : ''}">
              <button type="button" class="ec-lien" aria-pressed="${s.n === this.planSaison}" aria-label="Saison ${s.n}" onclick="Ecriture.choisirSaisonPlan(${s.n})">S${s.n}</button>
              <div class="ec-plan-cases">${l.map(e => `<button type="button" tabindex="-1" class="ec-plan-case ${e.x ? (this._dateEp(e) ? 'dat' : 'ecr') : ''}" aria-label="${esc(this._code(e))}" title="${esc(this._code(e))} ${esc(e.t || 'Sans titre')}${this._dateEp(e) ? ` · ${esc(this._dateEp(e))}` : ''}" data-a="ouvrirEpisode" data-v="${e.id}" onclick="Ecriture.agir(this)"></button>`).join('')}</div>
              <span class="an-note">${ecrits === l.length ? `${ecrits} écrits` : `${ecrits} / ${l.length} écrits`}</span>
            </div>`;
          }).join('')}
        </div>
      </section>
      <div class="ec-mem">
        <section class="an-carte">
          <div class="an-entete">
            <h2 class="an-titre">Saison ${this.planSaison} — ${nbAecrire} à écrire</h2>
            <div class="an-ligne">${this._choix('ec-plan-filtre', 'Voir', 'planFiltre', [['aecrire', 'À écrire'], ['tous', 'Tous les épisodes'], ['sansdate', 'Sans date']])}</div>
          </div>
          <div class="an-table"><table>
            <thead><tr><th>Épisode</th><th>Titre</th><th>Date dans l'histoire</th><th>Intrigues</th><th>Au centre</th><th>Idée</th></tr></thead>
            <tbody>${liste.map(e => {
              const f = this.fiches.get(e.id) || {};
              const plan = this._plan(e.id);
              const centre = e.x ? esc(this._centre(e) || '—') : `<select aria-label="Personnage au centre" onchange="Ecriture.setPlan(${e.id}, 'centre', this.value)"><option value="">—</option>${principaux.map(n => `<option ${plan.centre === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
              return `<tr>
                <td>${this._lien(esc(this._code(e)), 'ouvrirEpisode', e.id)}</td><td>${esc(e.t || '—')}</td>
                <td><input type="date" aria-label="Date de ${esc(this._code(e))}" value="${esc(this._dateEp(e))}" onchange="Ecriture.setDate(${e.id}, this.value)"></td>
                <td>${[f.intrigue_a, f.intrigue_b, f.intrigue_c].filter(Boolean).map(esc).join(' · ') || '—'}</td><td>${centre}</td>
                <td><input type="text" aria-label="Idée pour ${esc(this._code(e))}" placeholder="Une idée…" value="${esc(plan.idee || '')}" onchange="Ecriture.setPlan(${e.id}, 'idee', this.value)"></td>
              </tr>`;
            }).join('') || '<tr><td colspan="6" class="an-note">Aucun épisode avec ce filtre.</td></tr>'}</tbody>
          </table></div>
          <p class="an-note">Pour un épisode écrit, le centre est le personnage qui parle le plus.</p>
        </section>
        <aside class="ec-colonne">
          <section class="an-carte">
            <h2 class="an-titre">Le temps</h2>
            <div class="ec-rep-chiffre">${nbDates} <small>/ ${eps.length} datés</small></div>
            ${sauts.length ? `<p class="an-note ec-orange">${sauts.length} date(s) qui reculent, hors flashbacks :</p><ul class="ec-liste">${sauts.map(x => `<li><span>${this._lien(esc(this._code(x.e)), 'ouvrirEpisode', x.e.id)} : ${esc(this._dateEp(x.e))}</span><span class="an-note">après ${esc(this._code(x.avant))}</span></li>`).join('')}</ul>` : '<p class="an-note">Aucune date ne recule.</p>'}
            ${ages.length ? `<ul class="ec-liste">${ages.map(a => `<li><span>${esc(a.nom)}</span><span class="an-note">${a.calcul} ans en ${esc(this._code(dernier))} (noté : ${esc(a.age ?? '—')})</span></li>`).join('')}</ul>` : '<p class="an-note">Aucune date de naissance notée dans Persos.</p>'}
          </section>
          <section class="an-carte">
            <h2 class="an-titre">Au centre</h2>
            ${centres.length ? `<ul class="ec-liste">${centres.map(c => `<li><span>${esc(c.n)}</span><span class="an-note">${c.v} épisode(s)</span></li>`).join('')}</ul>` : '<p class="an-note">Personne pour l\'instant.</p>'}
          </section>
        </aside>
      </div>
    `;
  },

  // ─── Rappels par épisode ─────────────────────────────────────────────────

  _rappels(id = this.epId) {
    try { return JSON.parse(this.notes[`rappels:${id}`] || '[]'); } catch (e) { return []; }
  },

  async placer(texte) {
    const liste = this._rappels();
    if (!liste.includes(texte)) await this.note(`rappels:${this.epId}`, JSON.stringify([...liste, texte]));
    toast(`À placer en ${this._code(this.ordre[this.rang.get(this.epId)])}`);
    this.rendreVue();
  },

  retirerRappel(n) {
    const liste = this._rappels();
    liste.splice(Number(n), 1);
    this.note(`rappels:${this.epId}`, liste.length ? JSON.stringify(liste) : '');
    this.rendreVue();
  },

  ajouterRappel() {
    const t = document.getElementById('ec-rappel')?.value.trim();
    if (t) this.placer(t);
  },

  _lienPlacer(texte) {
    return this._lien(`→ ${esc(this._code(this.ordre[this.rang.get(this.epId)]))}`, 'placer', texte);
  },
};
