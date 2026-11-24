// assets/js/analyse.js — Analyse modulable : tout se recalcule selon les épisodes choisis

const ANALYSE_SELECTION_KEY = 'lemenu_analyse_selection';
const ANALYSE_VUE_KEY = 'lemenu_analyse_vue';

const ANALYSE_VUES = [
  ['ensemble', 'Ensemble'], ['presence', 'Présence'], ['combos', 'Combinaisons'], ['scenes', 'Scènes'], ['rythme', 'Rythme'],
  ['duree', 'Durée'], ['intrigues', 'Intrigues'], ['voix', 'Voix'], ['mots', 'Mots'], ['expressions', 'Expressions'], ['comparateur', 'Comparateur'], ['diff', 'Diff'], ['bible', 'Bible'],
];

// Les personnages principaux, dans l'ordre du projet, prennent ces couleurs ; les autres, une couleur tirée de leur nom
const ANALYSE_COULEURS_PRINCIPAUX = ['#67cbac', '#4d9fff', '#ffb454', '#f08fb0', '#c9b8ff'];
const ANALYSE_PALETTE = ['#8fd3f4', '#d4a5ff', '#ffd27f', '#9be38f', '#ff9f9f', '#7fe0d4', '#f5b8e0', '#c7c7a0'];

const Analyse = {
  data: null,
  notes: {},
  sel: new Set(),
  res: null,
  hote: 'analyse',
  vue: 'ensemble',
  filtre: '',
  tri: 'chrono',
  min: '',
  max: '',
  saisonsF: [],
  epScene: 0,
  metric: 'density',
  motsProp: false,
  taille: 2,
  seuilMots: 120,
  seuilPersos: 2,
  verbes: false,
  q: '',
  motsPerso: '',
  motsTri: 'nb',
  motsNombre: 50,
  motsLettres: 0,
  motsOcc: 0,
  motsEp: 0,
  comboQ: '',
  voixGroupes: ['p', 's'],
  voixMin: 5000,
  voixNom: '',
  voixMode: 'distinct',
  voixRef: '',
  voixTri: 'mots',
  voixNb: 10,
  voixOcc: 3,
  voixLettres: 0,
  voixVerbes: false,
  voixQ: '',
  voixFiltre: '',
  voixEpisodes: false,
  longuesQ: '',
  exprPerso: '',
  exprSource: 'toutes',
  exprStatut: 'tous',
  exprTri: 'ep',
  exprNombre: 50,
  exprEp: 0,
  exprOcc: 0,
  exprMots: 0,
  exprQ: '',
  exprDetail: '',
  persosF: ['p'],
  presQ: '',
  presMesure: 'repliques',
  presEchelle: 'commune',
  presTri: 'groupe',
  presMinRep: 0,
  presMinEp: 0,
  presMinCase: 0,
  presAbsences: false,
  presSeuil: 40,
  presDuree: 3,
  decor: null,
  espace: false,
  fS: 'all',
  fR: 'all',
  fP: 'all',
  fC: 'all',

  // ─── Vues enregistrées ───────────────────────────────────────────────────

  _vuesEnregistrees() {
    return Object.keys(this.notes).filter(c => c.startsWith('vue-analyse:')).map(c => c.slice('vue-analyse:'.length)).sort((a, b) => a.localeCompare(b, 'fr'));
  },

  async enregistrerVue() {
    const champ = document.getElementById('an-vue-nom');
    const nom = champ?.value.trim();
    if (!nom) return;
    const valeur = JSON.stringify({ sel: [...this.sel], vue: this.vue });
    this.notes[`vue-analyse:${nom}`] = valeur;
    await api.put('analyse_notes', { cle: `vue-analyse:${nom}`, valeur });
    this.rendrePanel();
  },

  chargerVue(nom) {
    if (!nom) return;
    const vue = JSON.parse(this.notes[`vue-analyse:${nom}`]);
    this.sel = new Set(vue.sel.filter(id => this.data.parId.has(id)));
    this._calculer();
    this.vue = vue.vue;
    try { localStorage.setItem(cleProjet(ANALYSE_VUE_KEY), vue.vue); } catch (e) {}
    this.rendrePanel();
    this.rendreVue();
  },

  async supprimerVue() {
    const nom = document.getElementById('an-vues-liste')?.value;
    if (!nom) return;
    delete this.notes[`vue-analyse:${nom}`];
    await api.put('analyse_notes', { cle: `vue-analyse:${nom}`, valeur: '' });
    this.rendrePanel();
  },

  _htmlVuesEnregistrees() {
    const noms = this._vuesEnregistrees();
    return `
      <div class="an-ligne">
        <input id="an-vue-nom" class="an-recherche" type="text" aria-label="Nom de la vue" placeholder="Nommer cette sélection…">
        <button type="button" class="btn btn-secondary btn-sm" onclick="Analyse.enregistrerVue()">Enregistrer</button>
      </div>
      ${noms.length ? `<div class="an-ligne">
        <select id="an-vues-liste" aria-label="Vues enregistrées" onchange="Analyse.chargerVue(this.value)"><option value="">Mes sélections…</option>${noms.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select>
        <button type="button" class="btn btn-ghost btn-sm" onclick="Analyse.supprimerVue()">Supprimer</button>
      </div>` : ''}
    `;
  },

  async charger() {
    const [data, notes] = await Promise.all([api.get('analyse_data'), api.get('analyse_notes')]);
    this.data = AnalyseCalcul.preparer(data);
    this.notes = notes || {};
    if (!this._selectionLue) {
      this._selectionLue = true;
      this.sel = this._lireSelection();
    }
    this.sel = new Set([...this.sel].filter(id => this.data.parId.has(id)));
    this._calculer();
  },

  _lireSelection() {
    try {
      const ids = JSON.parse(localStorage.getItem(cleProjet(ANALYSE_SELECTION_KEY)) || 'null');
      if (Array.isArray(ids)) return new Set(ids);
    } catch (e) {}
    return new Set(this.data.eps.filter(e => e.x).map(e => e.id));
  },

  _calculer() {
    this.res = AnalyseCalcul.analyser(this.data, [...this.sel]);
    this._voix = null;
    this._parole = null;
    this._decors = null;
    try { localStorage.setItem(cleProjet(ANALYSE_SELECTION_KEY), JSON.stringify([...this.sel])); } catch (e) {}
  },

  async init() {
    this.hote = 'analyse';
    try {
      const vue = localStorage.getItem(cleProjet(ANALYSE_VUE_KEY));
      if (ANALYSE_VUES.some(([k]) => k === vue)) this.vue = vue;
    } catch (e) {}
    const tab = document.getElementById('tab-analyse');
    tab.innerHTML = `
      <div class="section-header"><div class="section-title">⊹ Analyse</div></div>
      <div class="an-layout">
        <aside class="an-panel" aria-label="Choix des épisodes"><p class="an-note">Chargement des épisodes…</p></aside>
        <div class="an-resultats">
          <nav class="an-vues" aria-label="Vues d'analyse"></nav>
          <div class="an-vue"></div>
        </div>
      </div>
    `;
    await this.charger();
    this.rendrePanel();
    this.rendreVue();
  },

  async monterDecors() {
    const slot = document.getElementById('decors-analyse');
    if (!slot) return;
    slot.innerHTML = `
      <div class="an-layout">
        <aside class="an-panel" aria-label="Choix des épisodes"><p class="an-note">Chargement des épisodes…</p></aside>
        <div class="an-resultats"><div class="an-vue"></div></div>
      </div>
    `;
    await this.charger();
    this.hote = 'decors';
    this.rendrePanel();
    this.rendreVue();
  },

  synchroniser(tab) {
    if (!this.data) return;
    this.hote = tab;
    this.rendrePanel();
    this.rendreVue();
  },

  _racine() {
    return document.getElementById(this.hote === 'decors' ? 'decors-analyse' : 'tab-analyse');
  },

  // ─── Utilitaires ─────────────────────────────────────────────────────────

  _fr: n => Number(n).toLocaleString('fr-FR'),
  _num: n => String(n).replace('.', ','),
  _duree: m => (m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`),
  _code: x => `S${x.sa}E${String(x.n).padStart(2, '0')}`,

  _couleur(nom) {
    if (this._principaux?.src !== this.data) {
      this._principaux = { src: this.data, noms: (this.data?.persos || []).filter(p => p.g === 'p').map(p => p.n.toUpperCase()) };
    }
    const rang = this._principaux.noms.indexOf(String(nom).toUpperCase());
    if (rang >= 0 && rang < ANALYSE_COULEURS_PRINCIPAUX.length) return ANALYSE_COULEURS_PRINCIPAUX[rang];
    const somme = [...String(nom)].reduce((a, c) => a + c.charCodeAt(0), 0);
    return ANALYSE_PALETTE[somme % ANALYSE_PALETTE.length];
  },

  // Assombrit les couleurs de personnage quand elles servent de texte sur fond clair
  _encre(couleur) {
    return `color-mix(in srgb, ${couleur}, var(--text) var(--encre))`;
  },

  _puce(nom) {
    return `<span class="an-puce" style="background:${this._couleur(nom)}"></span>`;
  },

  _nomVoix: s => s.charAt(0) + s.slice(1).toLowerCase(),

  _kpis(liste) {
    return `<div class="an-kpis">${liste.map(k => `
      <div class="an-kpi"><div class="an-label">${esc(k.l)}</div><div class="an-valeur"${k.c ? ` style="color:${k.c}"` : ''}>${esc(k.v)}</div>${k.s ? `<div class="an-note">${esc(k.s)}</div>` : ''}</div>
    `).join('')}</div>`;
  },

  _bouton(label, actif, action) {
    return `<button type="button" class="an-choix ${actif ? 'actif' : ''}" aria-pressed="${actif}" onclick="${action}">${esc(label)}</button>`;
  },

  _optionsEpisodes() {
    const courant = Math.min(this.epScene, Math.max(this.res.avecScenes.length - 1, 0));
    return this.res.avecScenes.map((x, i) => `<option value="${i}" ${i === courant ? 'selected' : ''}>${esc(this._code(x))}${x.t ? ` — ${esc(x.t.slice(0, 40))}` : ''}</option>`).join('');
  },

  _optionsSaisons(saisons, valeur) {
    return `<option value="all">Toutes saisons</option>` + saisons.map(s => `<option value="${s.n}" ${String(s.n) === String(valeur) ? 'selected' : ''}>Saison ${s.n}</option>`).join('');
  },

  _episodeScene() {
    const liste = this.res.avecScenes;
    return liste[Math.min(this.epScene, liste.length - 1)];
  },

  _nomsScene(sc) {
    return sc[3].map(i => this.data.persos[i].n);
  },

  // ─── Sélection ───────────────────────────────────────────────────────────

  rendrePanel() {
    const racine = this._racine();
    const panel = racine?.querySelector('.an-panel');
    if (!panel) return;
    const d = this.data;
    panel.innerHTML = `
      <div>
        <div class="an-label">Épisodes analysés</div>
        <div class="an-valeur" style="color:var(--accent)">${this.sel.size} <span class="an-note">/ ${d.eps.length}</span></div>
      </div>
      <div>
        <div class="an-label">Mes sélections</div>
        ${this._htmlVuesEnregistrees()}
      </div>
      <div>
        <div class="an-label">Sélection rapide</div>
        <div class="an-ligne">
          <button type="button" class="btn btn-secondary btn-sm" onclick="Analyse.selectionner('tout')">Tout</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="Analyse.selectionner('texte')">↑ Avec texte</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="Analyse.selectionner('inverser')">Inverser</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Analyse.selectionner('aucun')">Aucun</button>
        </div>
      </div>
      <div>
        <div class="an-label">Par saison</div>
        <div class="an-saisons">
          ${d.saisons.map(s => {
            const eps = d.eps.filter(x => x.sa === s.n);
            if (!eps.length) return '';
            const nb = eps.filter(x => this.sel.has(x.id)).length;
            return `<button type="button" class="an-saison" style="border-color:${nb ? s.c : 'var(--border)'}" aria-pressed="${nb === eps.length}" onclick="Analyse.basculerSaison(${s.n})">
              <span>${esc(s.nom || `Saison ${s.n}`)}</span><span>${nb}/${eps.length}</span>
            </button>`;
          }).join('')}
        </div>
      </div>
      <div>
        <label class="an-label" for="an-filtre-${this.hote}">Chercher un épisode</label>
        <input id="an-filtre-${this.hote}" type="text" placeholder="Titre ou numéro (S1E05)…" value="${esc(this.filtre)}" oninput="Analyse.setFiltre(this.value)">
      </div>
      <div class="an-liste">${this._listeEpisodes()}</div>
    `;
  },

  _listeEpisodes() {
    const q = this.filtre.trim().toLowerCase();
    return this.data.saisons.map(s => {
      const eps = this.data.eps.filter(x => x.sa === s.n && (!q || `${this._code(x)} ${x.t}`.toLowerCase().includes(q)));
      if (!eps.length) return '';
      return `
        <div class="an-liste-saison" style="color:${s.c}">${esc(s.nom || `Saison ${s.n}`)}</div>
        ${eps.map(x => `
          <label class="an-episode" style="opacity:${x.x ? 1 : 0.5}">
            <input type="checkbox" ${this.sel.has(x.id) ? 'checked' : ''} onchange="Analyse.basculerEpisode(${x.id})">
            <span>E${String(x.n).padStart(2, '0')}${x.t ? ` — ${esc(x.t)}` : ''}</span>
          </label>
        `).join('')}
      `;
    }).join('');
  },

  setFiltre(valeur) {
    this.filtre = valeur;
    const liste = this._racine()?.querySelector('.an-liste');
    if (liste) liste.innerHTML = this._listeEpisodes();
  },

  _selectionChangee() {
    this.epScene = 0;
    this._calculer();
    const racine = this._racine();
    const defilement = racine?.querySelector('.an-liste')?.scrollTop || 0;
    this.rendrePanel();
    const liste = this._racine()?.querySelector('.an-liste');
    if (liste) liste.scrollTop = defilement;
    this.rendreVue();
  },

  selectionner(mode) {
    const eps = this.data.eps;
    if (mode === 'tout') this.sel = new Set(eps.map(x => x.id));
    if (mode === 'texte') this.sel = new Set(eps.filter(x => x.x).map(x => x.id));
    if (mode === 'inverser') this.sel = new Set(eps.filter(x => !this.sel.has(x.id)).map(x => x.id));
    if (mode === 'aucun') this.sel = new Set();
    this._selectionChangee();
  },

  basculerEpisode(id) {
    if (this.sel.has(id)) this.sel.delete(id);
    else this.sel.add(id);
    this._selectionChangee();
  },

  basculerSaison(numero) {
    const ids = this.data.eps.filter(x => x.sa === numero).map(x => x.id);
    const tous = ids.every(id => this.sel.has(id));
    ids.forEach(id => (tous ? this.sel.delete(id) : this.sel.add(id)));
    this._selectionChangee();
  },

  // ─── Rendu des vues ──────────────────────────────────────────────────────

  aller(vue) {
    this.vue = vue;
    try { localStorage.setItem(cleProjet(ANALYSE_VUE_KEY), vue); } catch (e) {}
    this.rendreVue();
  },

  // Met à jour un réglage et conserve le focus du champ en cours de saisie
  regler(cle, valeur, champId) {
    this[cle] = valeur;
    // Le champ d'origine est remis tel quel : un champ recréé perd le curseur,
    // et un type="number" ne permet pas de le replacer
    const champ = champId ? document.getElementById(champId) : null;
    this.rendreVue();
    const recree = champId ? document.getElementById(champId) : null;
    if (champ && recree && champ !== recree) {
      recree.replaceWith(champ);
      champ.focus();
    }
  },

  rendreVue() {
    if (!this.data) return;
    const racine = this._racine();
    if (!racine) return;
    const nav = racine.querySelector('.an-vues');
    if (nav) {
      const visibles = Interface.vuesAnalyseVisibles();
      if (!visibles.some(([k]) => k === this.vue) && visibles.length) this.vue = visibles[0][0];
      if (!visibles.length) {
        nav.innerHTML = '';
        racine.querySelector('.an-vue').innerHTML = `<section class="an-carte"><p class="an-note">Toutes les vues sont masquées. Tu peux les réafficher dans Config → Interface.</p></section>`;
        return;
      }
      nav.innerHTML = visibles.map(([k, nom]) => `<button type="button" class="an-vue-btn ${this.vue === k ? 'actif' : ''}" onclick="Analyse.aller('${k}')">${nom}</button>`).join('');
    }
    const cible = racine.querySelector('.an-vue');
    if (!cible) return;
    // Le comparateur choisit ses deux épisodes lui-même, sans suivre la sélection
    if (this.hote === 'analyse' && this.vue === 'comparateur') {
      cible.innerHTML = '<div id="comparateur-vue"></div>';
      Comparateur.init().catch(() => toast('Impossible de charger le comparateur', 'error'));
      return;
    }
    if (this.hote === 'analyse' && this.vue === 'bible') {
      cible.innerHTML = '<div id="bible-vue"></div>';
      Bible.init({ targetId: 'bible-vue', embedded: true }).catch(() => toast('Impossible de charger la bible', 'error'));
      return;
    }
    // Diff contient des textes collés à la main : on garde son contenu d'une vue à l'autre
    if (this.hote === 'analyse' && this.vue === 'diff') {
      const dejaCree = Boolean(this._diffVue);
      if (!dejaCree) {
        this._diffVue = document.createElement('div');
        this._diffVue.id = 'diff-vue';
      }
      cible.replaceChildren(this._diffVue);
      if (!dejaCree) Diff.init();
      return;
    }
    if (!this.res.nb) {
      cible.innerHTML = `<section class="an-carte"><h2 class="an-titre">Aucun épisode sélectionné</h2><p class="an-note">Coche des épisodes à gauche : tout se recalcule aussitôt.</p></section>`;
      return;
    }
    if (this.hote === 'decors') {
      cible.innerHTML = this.vueDecors();
      return;
    }
    const vues = {
      ensemble: 'vueEnsemble', presence: 'vuePresence', combos: 'vueCombos', scenes: 'vueScenes', rythme: 'vueRythme',
      duree: 'vueDuree', intrigues: 'vueIntrigues', voix: 'vueVoix', mots: 'vueMots', expressions: 'vueExpressions',
    };
    cible.innerHTML = this[vues[this.vue]]();
    if (this.vue === 'voix') this._chargerRegistres();
  },

  // Les registres de langue de chaque personnage : tutoiement ou vouvoiement, argot, mots soutenus
  async _chargerRegistres() {
    if (!this._registres) this._registres = await api.get('registres').catch(() => null);
    const slot = document.getElementById('an-registres');
    const d = this._registres;
    if (!slot || !d) return;
    const l = d.personnages;
    if (!l.length) { slot.innerHTML = '<h2 class="an-titre">Registres de langue</h2><p class="an-note">Pas encore assez de dialogue : il faut au moins 200 mots par personnage pour parler de registre.</p>'; return; }
    const changent = l.filter(x => x.change);
    slot.innerHTML = `<div class="an-entete"><h2 class="an-titre">Registres de langue</h2><span class="an-note">pour 1 000 mots</span></div>
      <p class="an-note">Qui tutoie, qui vouvoie, qui parle argot ou soutenu : une voix tient aussi à son registre. ${changent.length ? `<span class="ec-orange">Registre qui change d'une saison à l'autre : ${changent.map(x => esc(x.nom)).join(', ')}.</span> Voulu (le personnage évolue), ou glissement ?` : 'Chaque personnage garde son registre d\'une saison à l\'autre.'}</p>
      <div class="an-table"><table><thead><tr><th scope="col">Personnage</th><th scope="col">Tutoie / vouvoie</th><th scope="col">Argot</th><th scope="col">Soutenu</th><th scope="col">Argot par saison</th></tr></thead>
      <tbody>${l.map(x => { const total = x.tu + x.vous; const pct = total ? Math.round((x.tu * 100) / total) : null; return `<tr class="${x.change ? 'ec-orange' : ''}"><td>${esc(x.nom)}</td><td>${pct === null ? '—' : `${pct} % tu · ${100 - pct} % vous`}</td><td>${this._num(x.argot)}</td><td>${this._num(x.soutenu)}</td><td class="an-note">${Object.entries(x.saisons).map(([s, v]) => `S${s} ${this._num(v)}`).join(' · ') || '—'}</td></tr>`; }).join('')}</tbody></table></div>`;
  },

  // ─── Ensemble ────────────────────────────────────────────────────────────

  vueEnsemble() {
    const R = this.res, mpm = Settings.motsParMinute;
    const mx = Math.max(...R.eps.map(x => x.m), 1);
    const nMin = parseInt(this.min, 10), nMax = parseInt(this.max, 10);
    let cartes = R.eps.filter(x => x.x && x.m > 0);
    if (this.tri === 'asc') cartes = [...cartes].sort((a, b) => a.m - b.m);
    if (this.tri === 'desc') cartes = [...cartes].sort((a, b) => b.m - a.m);
    const presentes = this.data.saisons.filter(s => R.eps.some(x => x.sa === s.n));

    return `
      <section class="an-carte">
        <h2 class="an-titre">Vue d'ensemble — ${R.nb} épisode(s)</h2>
        ${this._kpis([
          { l: 'Épisodes', v: R.nb }, { l: 'Répliques', v: this._fr(R.totalRepliques) }, { l: 'Mots', v: this._fr(R.totalMots) },
          { l: 'Durée est.', v: this._duree(Math.round(R.totalMots / mpm)) }, { l: 'Avancement moy.', v: `${R.avancement}%` },
          { l: 'Pages totales', v: this._fr(R.pages) }, { l: 'Finalisés', v: R.finals },
        ])}
      </section>
      <section class="an-carte">
        <div class="an-entete">
          <h2 class="an-titre">Mots par épisode</h2>
          <div class="an-ligne">
            ${this._bouton('T', !this.saisonsF.length, 'Analyse.filtrerSaison(null)')}
            ${presentes.map(s => this._bouton(s.n, this.saisonsF.includes(s.n), `Analyse.filtrerSaison(${s.n})`)).join('')}
            <span class="an-note">|</span>
            ${[['chrono', 'Chrono'], ['asc', '↑ Mots'], ['desc', '↓ Mots']].map(([k, l]) => this._bouton(l, this.tri === k, `Analyse.regler('tri','${k}')`)).join('')}
            <span class="an-note">|</span>
            <label class="an-label" for="an-min">≥ mots</label>
            <input id="an-min" class="an-nombre" type="number" min="0" value="${esc(this.min)}" oninput="Analyse.regler('min', this.value, 'an-min')">
            <label class="an-label" for="an-max">≤ mots</label>
            <input id="an-max" class="an-nombre" type="number" min="0" value="${esc(this.max)}" oninput="Analyse.regler('max', this.value, 'an-max')">
          </div>
        </div>
        <div class="an-cartes-mots">
          ${cartes.map(x => {
            const estompe = (this.saisonsF.length && !this.saisonsF.includes(x.sa)) || (nMin > 0 && x.m < nMin) || (nMax > 0 && x.m > nMax);
            const c = this.data.saisonCouleur[x.sa];
            return `<div class="an-carte-mot" title="${esc(this._code(x))} — ${esc(x.t)}" style="opacity:${estompe ? 0.2 : 1}">
              <div style="font-size:10px;font-weight:700;color:${c}">S${x.sa}·E${String(x.n).padStart(2, '0')} <span class="an-note">[${x.p}p]</span></div>
              <div class="an-carte-mot-ligne"><strong>${this._fr(x.m)}</strong><span class="an-note">${this._duree(Math.max(1, Math.round(x.m / mpm)))}</span></div>
              <div class="an-carte-mot-barre" style="background:${c};width:${Math.round((x.m * 100) / mx)}%"></div>
            </div>`;
          }).join('')}
        </div>
      </section>
      ${R.themes.length ? `
        <section class="an-carte">
          <h2 class="an-titre">Thèmes présents</h2>
          <div class="an-ligne">
            ${R.themes.map(t => `<div class="an-kpi"><span class="an-puce" style="background:${esc(t.c)}"></span> ${esc(t.n)}<div class="an-valeur">${t.nb}</div><div class="an-note">épisodes</div></div>`).join('')}
          </div>
        </section>
      ` : ''}
    `;
  },

  filtrerSaison(numero) {
    if (numero === null) this.saisonsF = [];
    else if (this.saisonsF.includes(numero)) this.saisonsF = this.saisonsF.filter(x => x !== numero);
    else this.saisonsF = [...this.saisonsF, numero];
    this.rendreVue();
  },

  // ─── Présence ────────────────────────────────────────────────────────────

  basculerPersos(groupe) {
    this.persosF = this.persosF.includes(groupe) ? this.persosF.filter(x => x !== groupe) : [...this.persosF, groupe];
    this.rendreVue();
  },

  vuePresence() {
    const R = this.res, d = this.data, mpm = Settings.motsParMinute;
    const principaux = R.personnages.filter(p => p.g === 'p');
    const nomsPrincipaux = principaux.map(p => p.nom);
    const estSecondaire = p => p.g === 'r' || p.g === 'a';
    const dansFiltre = p => (this.persosF.includes('p') && p.g === 'p') || (this.persosF.includes('s') && estSecondaire(p)) || (this.persosF.includes('x') && p.g === 'x');
    const sansAccent = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const termes = sansAccent(this.presQ).split(/[\s,+]+/).filter(Boolean);
    // Une recherche porte sur tous les personnages, quels que soient les groupes cochés
    const retenu = p => (termes.length ? termes.some(t => sansAccent(p.nom).includes(t)) : dansFiltre(p))
      && p.total_repliques >= this.presMinRep && p.nb_presences >= this.presMinEp;
    const tris = {
      repliques: (a, b) => b.total_repliques - a.total_repliques,
      presences: (a, b) => b.nb_presences - a.nb_presences,
      moyenne: (a, b) => b.total_repliques / (b.nb_presences || 1) - a.total_repliques / (a.nb_presences || 1),
      nom: (a, b) => a.nom.localeCompare(b.nom, 'fr'),
    };
    const trier = liste => (tris[this.presTri] ? [...liste].sort(tris[this.presTri]) : liste);
    const affiches = trier(R.personnages.filter(p => retenu(p) && p.total_repliques > 0)).map(p => p.nom);
    const lignesEp = new Map(R.eps.map(x => [x, new Map(x.pr.map(l => [d.persos[l[0]].n, l]))]));
    const val = (x, nom) => {
      const ligne = lignesEp.get(x).get(nom);
      return ligne ? ligne[1] : null;
    };
    const mesures = {
      repliques: { plafond: 200, calc: x => (nom => val(x, nom) || 0), legende: "Plus c'est clair, plus le perso parle" },
      part: { plafond: 40, calc: x => (nom => (x.r ? Math.round(((val(x, nom) || 0) * 100) / x.r) : 0)), legende: "% des répliques de l'épisode" },
      presence: { plafond: 1, calc: x => (nom => (lignesEp.get(x).get(nom)?.[2] ? 1 : 0)), legende: 'Case pleine = présent' },
    };
    const mesure = mesures[this.presMesure];
    const plafondDe = nom => (this.presEchelle === 'perso' ? Math.max(1, ...R.eps.map(x => mesure.calc(x)(nom))) : mesure.plafond);

    const alertes = [];
    const cibles = termes.length ? R.personnages.filter(p => p.g !== 'x' && affiches.includes(p.nom)) : principaux;
    cibles.forEach(({ nom }) => {
      const serie = R.eps.filter(x => x.x);
      const absents = serie.filter(x => !val(x, nom));
      if (absents.length) {
        alertes.push({ titre: `${nom} : ${absents.length} épisode(s) sans réplique`, texte: absents.slice(0, 8).map(this._code).join(', ') + (absents.length > 8 ? '…' : ''), c: this._couleur(nom) });
      }
      let courant = [], meilleur = [];
      serie.forEach(x => {
        const v = val(x, nom) || 0;
        courant = v > 0 && v < this.presSeuil ? [...courant, x] : [];
        if (courant.length > meilleur.length) meilleur = courant;
      });
      if (meilleur.length >= Math.max(1, this.presDuree)) {
        alertes.push({ titre: `${nom} s'efface`, texte: `Moins de ${this.presSeuil} répliques sur ${meilleur.length} épisodes d'affilée (${this._code(meilleur[0])} à ${this._code(meilleur[meilleur.length - 1])}).`, c: this._couleur(nom) });
      }
    });
    if (!termes.length && principaux.length > 1 && principaux[principaux.length - 1].total_repliques) {
      const a = principaux[0], z = principaux[principaux.length - 1];
      alertes.push({ titre: 'Équilibre du groupe', texte: `${a.nom} parle ${this._num((a.total_repliques / z.total_repliques).toFixed(1))} fois plus que ${z.nom} sur cette sélection.`, c: 'var(--text)' });
    }

    const nombre = (id, label, cle) => `<label class="an-label" for="${id}">${label}</label><input id="${id}" class="an-nombre" type="number" min="0" value="${this[cle] || ''}" placeholder="—" oninput="Analyse.regler('${cle}', Number(this.value) || 0, '${id}')">`;
    const choix = (id, label, cle, options) => `<label class="an-label" for="${id}">${label}</label><select id="${id}" onchange="Analyse.regler('${cle}', this.value)">${options.map(([v, l]) => `<option value="${v}" ${this[cle] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

    const hexa = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',');
    const saisons = d.saisons.filter(s => R.eps.some(x => x.sa === s.n));
    const compter = f => R.personnages.filter(p => f(p) && (p.total_repliques || p.nb_presences)).length;
    const plafonds = new Map(affiches.map(nom => [nom, plafondDe(nom)]));

    const blocs = saisons.map(s => {
      const eps = R.eps.filter(x => x.sa === s.n);
      const lignes = affiches.filter(nom => nomsPrincipaux.includes(nom) || eps.some(x => val(x, nom)));
      return `
        <div class="an-heat-bloc">
          <div class="an-heat-ligne">
            <span class="an-heat-nom an-label">Saison ${s.n}</span>
            ${eps.map(x => `<span class="an-heat-ep an-label" title="${esc(this._code(x))} — ${esc(x.t)}">${x.n}</span>`).join('')}
          </div>
          ${lignes.map(nom => `
            <div class="an-heat-ligne">
              <span class="an-heat-nom" title="${esc(nom)}">${esc(nom)}</span>
              ${eps.map(x => {
                const v = mesure.calc(x)(nom), repliques = val(x, nom) || 0, plafond = plafonds.get(nom);
                const force = 0.1 + (0.9 * Math.min(v, plafond)) / plafond;
                const fond = v
                  ? `background:rgba(${hexa(this._couleur(nom))},${force.toFixed(2)});color:${force > 0.57 ? '#0a0a0a' : 'var(--text)'}`
                  : 'border:1px solid var(--border2)';
                const estompe = this.presAbsences ? v : v && repliques < this.presMinCase;
                const style = this.presAbsences && !v ? 'background:var(--accent)' : `${fond}${estompe ? ';opacity:.2' : ''}`;
                const texte = this.presMesure === 'presence' || estompe ? '' : (v || '');
                return `<span class="an-heat-case" title="${esc(nom)} · ${esc(this._code(x))} : ${repliques} répl. (${x.r ? Math.round((repliques * 100) / x.r) : 0} %)" style="${style}">${texte}</span>`;
              }).join('')}
            </div>
          `).join('')}
        </div>
      `;
    }).join('');

    const parts = saisons.map(s => {
      const eps = R.eps.filter(x => x.sa === s.n);
      const l = affiches.map(nom => eps.reduce((a, x) => a + (val(x, nom) || 0), 0));
      const tot = l.reduce((a, b) => a + b, 0) || 1;
      return `
        <div class="an-part">
          <span class="an-label">S${s.n}</span>
          <div class="an-part-barre">${l.map((v, i) => `<span title="${esc(affiches[i])} : ${v} (${Math.round((v * 100) / tot)} %)" style="flex:${v} 1 0;background:${this._couleur(affiches[i])}"></span>`).join('')}</div>
        </div>
      `;
    }).join('');

    const groupes = [['p', 'Personnages principaux'], ['r', 'Personnages récurrents'], ['a', 'Autres personnages'], ['x', 'Non identifiés']].map(([g, titre]) => {
      const liste = trier(R.personnages.filter(p => p.g === g && (p.total_repliques || p.nb_presences) && retenu(p)));
      if (!liste.length) return '';
      return `
        <tbody>
          <tr><td colspan="6" class="an-label">${titre} (${liste.length})</td></tr>
          ${liste.map(p => `
            <tr>
              <td>${this._puce(p.nom)} <strong>${esc(p.nom)}</strong></td>
              <td>${p.nb_presences} / ${R.nb}</td>
              <td>${p.total_repliques ? this._fr(p.total_repliques) : '—'}</td>
              <td><div class="an-jauge-ligne"><div class="an-jauge"><div style="background:${this._couleur(p.nom)};width:${p.pct_presence}%"></div></div>${p.pct_presence}%</div></td>
              <td>${p.pct_repliques ? `${p.pct_repliques}%` : '—'}</td>
              <td>${p.duree ? this._duree(Math.round((p.duree / 175) * mpm)) : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      `;
    }).join('');

    return `
      <section class="an-carte">
        <div class="an-entete">
          <h2 class="an-titre">À regarder</h2>
          <div class="an-ligne">
            ${nombre('an-pres-seuil', "S'efface sous (répl.)", 'presSeuil')}
            ${nombre('an-pres-duree', "Sur (épisodes d'affilée)", 'presDuree')}
          </div>
        </div>
        <div class="an-alertes">${alertes.map(a => `<div class="an-kpi"><strong style="color:${this._encre(a.c)}">${esc(a.titre)}</strong><div class="an-note">${esc(a.texte)}</div></div>`).join('') || '<p class="an-note">Rien à signaler sur cette sélection.</p>'}</div>
      </section>
      <div class="an-ligne">
        <span class="an-label">Afficher</span>
        ${this._bouton(`Principaux (${compter(p => p.g === 'p')})`, this.persosF.includes('p'), "Analyse.basculerPersos('p')")}
        ${this._bouton(`Secondaires (${compter(estSecondaire)})`, this.persosF.includes('s'), "Analyse.basculerPersos('s')")}
        ${this._bouton(`Non identifiés (${compter(p => p.g === 'x')})`, this.persosF.includes('x'), "Analyse.basculerPersos('x')")}
        <input id="an-pres-q" class="an-recherche" type="text" aria-label="Rechercher des personnages" placeholder="Rechercher : paul marie…" value="${esc(this.presQ)}" oninput="Analyse.regler('presQ', this.value, 'an-pres-q')">
        <span class="an-note">${affiches.length} personnage(s)</span>
      </div>
      <div class="an-ligne">
        ${choix('an-pres-mesure', 'Mesure', 'presMesure', [['repliques', 'Répliques'], ['part', "% de l'épisode"], ['presence', 'Présence']])}
        ${choix('an-pres-echelle', 'Échelle', 'presEchelle', [['commune', 'Commune'], ['perso', 'Par personnage']])}
        ${choix('an-pres-tri', 'Tri', 'presTri', [['groupe', 'Par groupe'], ['repliques', 'Répliques'], ['presences', 'Présences'], ['moyenne', 'Répl. par présence'], ['nom', 'Nom']])}
        ${nombre('an-pres-min-rep', '≥ répliques', 'presMinRep')}
        ${nombre('an-pres-min-ep', '≥ présences', 'presMinEp')}
        ${nombre('an-pres-min-case', '≥ répl. par case', 'presMinCase')}
        ${this._bouton('Repérer les absences', this.presAbsences, "Analyse.regler('presAbsences', !Analyse.presAbsences)")}
      </div>
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Répliques par épisode</h2><span class="an-label">${mesure.legende}${this.presAbsences ? ' · case pleine = absence' : ' · ▢ = rien'}</span></div>
        ${affiches.length ? blocs : '<p class="an-note">Aucun personnage ne correspond à ces filtres.</p>'}
      </section>
      <section class="an-carte">
        <h2 class="an-titre">Part de parole par saison</h2>
        ${parts}
        <div class="an-ligne">${affiches.map(nom => `<span class="an-note">${this._puce(nom)} ${esc(nom)}</span>`).join('')}</div>
      </section>
      <section class="an-carte">
        <h2 class="an-titre">Tableau de présence</h2>
        <div class="an-table"><table>
          <thead><tr><th>Personnage</th><th>Présences</th><th>Répliques</th><th>% présence</th><th>% répliques</th><th>Durée est.</th></tr></thead>
          ${groupes}
        </table></div>
      </section>
    `;
  },

  // ─── Combinaisons ────────────────────────────────────────────────────────

  vueCombos() {
    const R = this.res;
    const noms = { 2: 'Duos', 3: 'Trios', 4: 'Quartets', 5: 'Quintettes', 6: 'Sextettes' };
    const sansAccent = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const termes = sansAccent(this.comboQ).split(/[\s,+]+/).filter(Boolean);
    const contient = persos => termes.every(t => persos.some(p => sansAccent(p).includes(t)));
    const combos = R.combos.filter(c => contient(c.persos));
    const jamais = R.jamais.filter(contient);
    const recherche = `<input id="an-combo-q" class="an-recherche" type="text" aria-label="Rechercher des personnages" placeholder="Rechercher : paul marie…" value="${esc(this.comboQ)}" oninput="Analyse.regler('comboQ', this.value, 'an-combo-q')">`;
    const dispo = [2, 3, 4, 5, 6].filter(t => combos.some(c => c.taille === t));
    if (termes.length && !dispo.length) {
      return `<section class="an-carte"><h2 class="an-titre">Récurrences — combinaisons par épisode</h2>${recherche}<p class="an-note">Aucune combinaison pour cette recherche.</p></section>`;
    }
    if (!dispo.length) {
      return `<section class="an-carte"><h2 class="an-titre">Récurrences — combinaisons par épisode</h2><p class="an-note">Aucune co-présence détectée. Vérifie que les personnages sont bien marqués comme présents dans les fiches épisode.</p></section>`;
    }
    const taille = dispo.includes(this.taille) ? this.taille : dispo[0];
    const liste = combos.filter(c => c.taille === taille);
    const mx = liste[0]?.nb_episodes || 1;

    return `
      <section class="an-carte">
        <div class="an-entete">
          <h2 class="an-titre">Récurrences — combinaisons par épisode</h2>
          <div class="an-ligne">${dispo.map(t => this._bouton(`${noms[t]} (${combos.filter(c => c.taille === t).length})`, t === taille, `Analyse.regler('taille',${t})`)).join('')}</div>
        </div>
        ${recherche}
        <div class="an-table"><table>
          <thead><tr><th>Personnages</th><th>Épisodes</th><th>Scènes</th><th>Répliques</th><th>Fréquence</th><th>% présence</th><th>% répliques</th><th>Durée est.</th></tr></thead>
          <tbody>${liste.map(c => {
            const pct = Math.round((c.nb_episodes * 100) / mx);
            return `<tr>
              <td><strong>${esc(c.persos.join(' + '))}</strong></td><td>${c.nb_episodes}</td><td>${c.nb_scenes || '—'}</td><td>${c.nb_repliques ? this._fr(c.nb_repliques) : '—'}</td>
              <td><div class="an-jauge-ligne"><div class="an-jauge"><div style="background:var(--accent);width:${pct}%"></div></div>${pct}%</div></td>
              <td>${c.moyPresence !== null ? `${c.moyPresence}%` : '—'}</td><td>${c.moyRepliques !== null ? `${c.moyRepliques}%` : '—'}</td><td>${c.duree_min ? this._duree(c.duree_min) : '—'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </section>
      <section class="an-carte">
        <h2 class="an-titre">Duos qui ne se croisent jamais (${this._fr(jamais.length)})</h2>
        <div class="an-ligne">${jamais.map(([a, b]) => `<span class="an-etiquette">${esc(a)} ✕ ${esc(b)}</span>`).join('')}</div>
      </section>
    `;
  },

  // ─── Scènes ──────────────────────────────────────────────────────────────

  vueScenes() {
    const ep = this._episodeScene();
    if (!ep) return `<section class="an-carte"><p class="an-note">Aucune scène détectée sur cette sélection.</p></section>`;
    const scenes = ep.sc;
    const score = s => s[1] * 0.4 + (s[0] / 30) * 0.4 + s[3].length * 4;
    const mx = f => Math.max(...scenes.map(f), 1);
    const ratio = s => (this.metric === 'repliques' ? s[1] / mx(x => x[1]) : this.metric === 'mots' ? s[0] / mx(x => x[0]) : this.metric === 'persos' ? s[3].length / mx(x => x[3].length) : score(s) / mx(score));
    const stops = ['#2a4a6b', '#1a6fa8', '#0d9dd9', '#00bcd4'];
    const tous = [...new Set(scenes.flatMap(s => this._nomsScene(s)))];
    const compte = {};
    scenes.forEach(s => this._nomsScene(s).forEach(n => { compte[n] = (compte[n] || 0) + 1; }));
    const flex = s => (this.motsProp ? Math.max(1, s[0]) : 1);
    const mxP = mx(x => x[3].length);
    const metriques = [['density', 'Densité globale'], ['repliques', 'Répliques'], ['mots', 'Mots'], ['persos', 'Personnages']];

    return `
      <section class="an-carte">
        <h2 class="an-titre">Densité dramatique par scène</h2>
        <div class="an-ligne">
          <select aria-label="Épisode" onchange="Analyse.regler('epScene', Number(this.value))">${this._optionsEpisodes()}</select>
          <select aria-label="Mesure" onchange="Analyse.regler('metric', this.value)">${metriques.map(([k, l]) => `<option value="${k}" ${this.metric === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        ${this._kpis([
          { l: 'Scènes', v: scenes.length }, { l: 'Répliques', v: this._fr(scenes.reduce((a, s) => a + s[1], 0)) },
          { l: 'Mots', v: this._fr(scenes.reduce((a, s) => a + s[0], 0)) }, { l: 'Solos', v: scenes.filter(s => s[3].length === 1).length },
        ])}
        <div class="an-ligne">${tous.map(nom => `<span class="an-note">${this._puce(nom)} ${esc(nom)}</span>`).join('')}</div>
        ${scenes.map((s, i) => {
          const r = ratio(s), noms = this._nomsScene(s);
          const label = this.metric === 'repliques' ? `${s[1]} rép.` : this.metric === 'mots' ? `${s[0]} mots` : this.metric === 'persos' ? `${noms.length} perso${noms.length > 1 ? 's' : ''}` : `${Math.round(r * 100)} / 100`;
          return `<div class="an-densite" title="Scène ${i + 1} — ${s[1]} rép. ${s[0]} mots">
            <span class="an-note">${i + 1}</span>
            <div>
              <div class="an-densite-ligne"><div><div style="height:9px;border-radius:2px;background:${stops[Math.min(3, Math.floor(r * 4))]};width:${Math.max(3, Math.round(r * 100))}%"></div></div><span class="an-note">${label}</span></div>
              <div class="an-note">${esc(s[2])} · ${esc(noms.join(', '))}</div>
            </div>
          </div>`;
        }).join('')}
      </section>
      <section class="an-carte">
        <h2 class="an-titre">Timeline de présence par personnage</h2>
        <label class="an-ligne an-note"><input type="checkbox" class="an-case" ${this.motsProp ? 'checked' : ''} onchange="Analyse.regler('motsProp', this.checked)"> Épaisseur proportionnelle aux mots</label>
        ${Object.keys(compte).sort((a, b) => compte[b] - compte[a]).map(nom => `
          <div class="an-timeline">
            <span class="an-timeline-nom" title="${esc(nom)}">${esc(nom)} <span class="an-note">${Math.round((compte[nom] * 100) / scenes.length)}%</span></span>
            <div class="an-timeline-cases">${scenes.map((s, i) => {
              const present = this._nomsScene(s).includes(nom);
              return `<div title="Scène ${i + 1}${present ? ` — ${s[1]} rép. ${s[0]} mots` : ' — absent'}" style="flex:${flex(s)} 1 0;min-width:2px;height:18px;border-radius:2px;background:${this._couleur(nom)};opacity:${present ? 0.9 : 0.1}"></div>`;
            }).join('')}</div>
          </div>
        `).join('')}
        <div class="an-timeline">
          <span class="an-timeline-nom an-note">co-présence</span>
          <div class="an-timeline-cases">${scenes.map(s => `<div style="flex:${flex(s)} 1 0;min-width:2px;height:4px;border-radius:2px;background:var(--accent4);opacity:${(0.1 + (s[3].length / mxP) * 0.85).toFixed(2)}"></div>`).join('')}</div>
        </div>
      </section>
    `;
  },

  // ─── Rythme ──────────────────────────────────────────────────────────────

  _lireVoix() {
    this._voix = this._voix || AnalyseCalcul.voix(this.data, this.res.eps);
    return this._voix;
  },

  // Le profil d'un épisode : la longueur de ses scènes dans l'ordre, comparée aux habitudes de la série
  _profilEpisode() {
    const ep = this._episodeScene();
    if (!ep) return '';
    const mediane = l => { const t = [...l].sort((a, b) => a - b); return t.length ? t[Math.floor(t.length / 2)] : 0; };
    const serie = this.data.eps.filter(e => e.sc?.length);
    const medScene = Math.max(mediane(serie.flatMap(e => e.sc.map(s => s[0]))), 1);
    const medNb = mediane(serie.map(e => e.sc.length));
    const motsRep = l => { const m = l.reduce((a, s) => a + s[0], 0), r = l.reduce((a, s) => a + s[1], 0); return r ? m / r : 0; };
    const medMotsRep = mediane(serie.map(e => motsRep(e.sc)).filter(Boolean)) || 1;
    const sc = ep.sc;
    const couleurs = Interface.couleursIntrigues();
    const total = sc.reduce((a, s) => a + s[0], 0) || 1;
    const haut = Math.max(...sc.map(s => s[0]), medScene * 2, 1);
    const signaux = [];

    if (medNb && sc.length >= medNb * 1.5) signaux.push(`${sc.length} scènes, quand la série en compte ${medNb} d'habitude : l'épisode est très découpé.`);
    if (medNb && sc.length <= medNb * 0.5) signaux.push(`${sc.length} scène(s) seulement, quand la série en compte ${medNb} d'habitude.`);
    sc.forEach((s, i) => {
      if (s[0] >= medScene * 2.5 && s[0] >= 150) signaux.push(`La scène ${i + 1} (${s[2] || 'sans décor'}) fait ${this._num((s[0] / medScene).toFixed(1))} fois une scène habituelle.`);
    });
    if (sc.length >= 4 && sc[0][0] / total > 0.3) signaux.push(`La scène d'ouverture prend ${Math.round((sc[0][0] * 100) / total)} % de l'épisode : l'entrée en matière est longue.`);
    // Les tiers de l'épisode : des répliques plus longues que d'habitude ralentissent
    const tiers = [0, 1, 2].map(t => sc.filter((s, i) => Math.floor((i * 3) / sc.length) === t));
    const tempo = tiers.map(l => motsRep(l) / medMotsRep);
    ['Le début', 'Le milieu', 'La fin'].forEach((l, t) => {
      if (tiers[t].length && tempo[t] >= 1.5) signaux.push(`${l} de l'épisode traîne : des répliques ${this._num(tempo[t].toFixed(1))} fois plus longues que d'habitude.`);
    });
    // Les intrigues classées : trop de scènes d'affilée, ou une intrigue laissée de côté longtemps
    const tags = sc.map((s, i) => this._intrigue(ep.id, i));
    let suite = 1;
    tags.forEach((k, i) => {
      suite = i && k && k === tags[i - 1] ? suite + 1 : 1;
      if (suite === 4) signaux.push(`L'intrigue ${k} enchaîne 4 scènes d'affilée à partir de la scène ${i - 2}.`);
    });
    Object.keys(couleurs).forEach(k => {
      const pos = tags.map((t, i) => (t === k ? i : -1)).filter(i => i >= 0);
      for (let j = 1; j < pos.length; j++) if (pos[j] - pos[j - 1] > 4) { signaux.push(`On quitte l'intrigue ${k} pendant ${pos[j] - pos[j - 1] - 1} scènes (de la scène ${pos[j - 1] + 1} à la scène ${pos[j] + 1}).`); break; }
    });

    return `
      <section class="an-carte">
        <div class="an-entete">
          <h2 class="an-titre">Profil d'un épisode</h2>
          <select aria-label="Épisode" onchange="Analyse.regler('epScene', Number(this.value))">${this._optionsEpisodes()}</select>
        </div>
        <div class="ry-profil" role="img" aria-label="Longueur des ${sc.length} scènes de ${esc(this._code(ep))}">
          <span class="ry-repere" style="bottom:${((medScene * 100) / haut).toFixed(1)}%" title="Scène habituelle : ${medScene} mots"></span>
          ${sc.map((s, i) => {
            const k = tags[i];
            return `<div class="ry-scene" style="flex:1 1 0" title="Scène ${i + 1} · ${esc(s[2] || 'sans décor')} · ${s[0]} mots · ${s[1]} répl.${k ? ` · intrigue ${k}` : ''}"><div style="height:${((s[0] * 100) / haut).toFixed(1)}%;background:${k ? couleurs[k] : s[0] >= medScene * 2.5 ? 'var(--orange)' : 'var(--accent4)'}"></div></div>`;
          }).join('')}
        </div>
        <div class="an-ligne an-note">
          <span>Trait : une scène habituelle de la série (${medScene} mots)</span>
          <span>Tempo par tiers : ${tempo.map((v, t) => `<strong class="${v >= 1.5 ? 'ec-orange' : ''}">${['début', 'milieu', 'fin'][t]} ${tiers[t].length ? `${this._num(v.toFixed(1))}×` : '—'}</strong>`).join(' · ')}</span>
        </div>
        ${signaux.length ? `<ul class="ec-liste">${signaux.map(t => `<li><span>${esc(t)}</span></li>`).join('')}</ul>` : '<p class="an-note">Rien d\'inhabituel : les scènes ont la longueur et le tempo de la série.</p>'}
        <p class="an-note">Une barre par scène, dans l'ordre, à la couleur de son intrigue quand elle est classée (vue Intrigues). Le tempo compare la longueur des répliques à celle de la série : au-dessus de 1, ça parle plus longuement.</p>
      </section>`;
  },

  vueRythme() {
    const R = this.res, mpm = Settings.motsParMinute;
    const avec = R.eps.filter(x => x.d > 0);
    const taux = avec.map(x => x.r / x.d);
    const moy = taux.length ? taux.reduce((a, b) => a + b, 0) / taux.length : 0;
    const iMax = taux.indexOf(Math.max(...taux)), iMin = taux.indexOf(Math.min(...taux));
    const mots = R.eps.reduce((a, x) => a + x.m, 0), action = R.eps.reduce((a, x) => a + (x.aw || 0), 0);
    const mxT = Math.max(...taux, 1);

    const longues = [];
    R.avecScenes.forEach(x => x.sc.forEach((s, i) => {
      if (s[0] >= (this.seuilMots || 0) && s[3].length <= (this.seuilPersos || 1)) longues.push({ x, s, i });
    }));
    longues.sort((a, b) => b.s[0] - a.s[0]);
    const sansAccent = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const typeScene = s => (s[3].length <= 1 ? 'Monologue' : s[3].length === 2 ? 'Duo' : `${s[3].length} persos`);
    const termes = sansAccent(this.longuesQ).split(/\s+/).filter(Boolean);
    const trouvees = longues.filter(({ x, s }) => {
      const texte = sansAccent(`${this._code(x)} ${x.t} ${s[2]} ${this._nomsScene(s).join(' ')} ${typeScene(s)}`);
      return termes.every(t => texte.includes(t));
    });
    const durScene = m => {
      const sec = Math.round((m / mpm) * 60);
      return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m${String(sec % 60).padStart(2, '0')}s`;
    };
    const lg = this._lireVoix().filter(v => v.long > 0).sort((a, b) => b.long - a.long);
    const mxL = Math.max(...lg.map(v => v.long), 1);

    return `
      ${this._kpis([
        { l: 'Répliques / minute', v: this._num(moy.toFixed(1)), s: 'moyenne de la sélection', c: 'var(--accent)' },
        { l: 'Le plus vif', v: taux.length ? this._num(taux[iMax].toFixed(1)) : '—', s: taux.length ? this._code(avec[iMax]) : '' },
        { l: 'Le plus lent', v: taux.length ? this._num(taux[iMin].toFixed(1)) : '—', s: taux.length ? this._code(avec[iMin]) : '', c: 'var(--orange)' },
        { l: 'Part de dialogue', v: `${Math.round((mots * 100) / Math.max(mots + action, 1))} %`, s: "le reste est de l'action" },
      ])}
      ${this._profilEpisode()}
      <section class="an-carte">
        <h2 class="an-titre">Répliques par minute</h2>
        <div class="an-barres" style="height:180px">${avec.map((x, i) => `
          <div class="an-barre" title="${esc(this._code(x))} : ${this._num(taux[i].toFixed(1))} répl./min">
            <div style="height:${Math.round((taux[i] * 150) / mxT)}px;background:${taux[i] < moy * 0.6 ? 'var(--orange)' : 'var(--accent)'}"></div>
            <span class="an-label">${avec.length <= 45 ? x.n : ''}</span>
          </div>
        `).join('')}</div>
      </section>
      <section class="an-carte">
        <div class="an-entete">
          <h2 class="an-titre">Scènes longues &amp; monologues (${trouvees.length}${termes.length ? ` / ${longues.length}` : ''})</h2>
          <div class="an-ligne">
            <label class="an-label" for="an-seuil-mots">≥ mots</label>
            <input id="an-seuil-mots" class="an-nombre" type="number" min="0" value="${this.seuilMots}" oninput="Analyse.regler('seuilMots', Number(this.value) || 0, 'an-seuil-mots')">
            <label class="an-label" for="an-seuil-persos">≤ personnages</label>
            <input id="an-seuil-persos" class="an-nombre" type="number" min="1" value="${this.seuilPersos}" oninput="Analyse.regler('seuilPersos', Number(this.value) || 1, 'an-seuil-persos')">
          </div>
        </div>
        <input id="an-longues-q" class="an-recherche" type="text" aria-label="Rechercher une scène" placeholder="Rechercher : salon jim, S4E26…" value="${esc(this.longuesQ)}" oninput="Analyse.regler('longuesQ', this.value, 'an-longues-q')">
        <div class="an-table"><table>
          <thead><tr><th>Épisode</th><th>Scène</th><th>Décor</th><th>Longueur</th><th>Durée est.</th><th>Type</th><th>Personnage(s)</th></tr></thead>
          <tbody>${trouvees.map(({ x, s, i }) => {
            const solo = s[3].length <= 1, c = solo ? 'var(--accent2)' : 'var(--orange)';
            return `<tr>
              <td>${esc(this._code(x))}</td><td>#${i + 1}</td><td>${esc(s[2])}</td><td>${this._fr(s[0])} mots</td><td>~${durScene(s[0])}</td>
              <td><span class="an-badge" style="color:${c};border-color:${c}">${typeScene(s)}</span></td>
              <td class="an-note">${esc(this._nomsScene(s).join(', '))}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
        <p class="an-note">Estimation à ${mpm} mots/min.</p>
      </section>
      <section class="an-carte">
        <h2 class="an-titre">Longueur des répliques</h2>
        ${lg.map(v => `<div class="an-longueur"><span>${esc(this._nomVoix(v.nom))}</span><div class="an-jauge"><div style="background:${this._couleur(v.nom)};width:${(v.long * 100) / mxL}%"></div></div><span>${this._num(v.long.toFixed(1))}</span></div>`).join('')}
      </section>
    `;
  },

  // ─── Durée ───────────────────────────────────────────────────────────────

  setMpm(valeur) {
    Settings.motsParMinute = valeur;
    this.regler('_mpmAffiche', valeur, 'an-mpm');
    if (typeof Episodes !== 'undefined' && Episodes.data?.length) Episodes.render();
  },

  vueDuree() {
    const R = this.res, mpm = Settings.motsParMinute;
    const liste = R.eps.filter(x => x.m > 0);
    const dial = x => Math.max(1, Math.round(x.m / mpm));
    const avecP = liste.filter(x => x.p > 0);
    const moy = l => (l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : 0);
    const toutes = avecP.flatMap(x => [x.p, dial(x)]);
    const bas = Math.min(...toutes, 20) - 1, haut = Math.max(...toutes, 35) + 1;
    const px = m => (((m - bas) * 100) / (haut - bas)).toFixed(1);
    const point = (m, c) => `<div class="an-point" style="left:calc(${px(m)}% - 5px);background:${c}"></div>`;
    const mxE = Math.max(...avecP.map(x => Math.abs(x.p - dial(x))), 0);

    return `
      <section class="an-carte">
        <div class="an-entete">
          <h2 class="an-titre">Durée : pages et dialogue</h2>
          <label class="an-ligne an-note" for="an-mpm">Mots par minute : <strong>${mpm}</strong>
            <input id="an-mpm" type="range" min="100" max="300" step="5" value="${mpm}" oninput="Analyse.setMpm(this.value)">
          </label>
        </div>
        ${this._kpis([
          { l: 'Par les pages', v: `${moy(avecP.map(x => x.p))} min`, c: 'var(--accent)' },
          { l: 'Par le dialogue', v: `${moy(liste.map(dial))} min`, c: 'var(--accent4)' },
          { l: 'Plus gros écart', v: `${mxE} min`, c: 'var(--orange)' },
          { l: 'Épisodes sans pages', v: liste.length - avecP.length },
        ])}
        <div class="an-ligne an-note">
          <span><span class="an-puce" style="background:var(--accent)"></span> Pages (1 page = 1 min)</span>
          <span><span class="an-puce" style="background:var(--accent4)"></span> Dialogue</span>
        </div>
        ${avecP.map(x => {
          const m = dial(x), ecart = x.p - m, g = Math.min(x.p, m);
          return `<div class="an-duree" title="${esc(x.t)}">
            <span class="an-note">${esc(this._code(x))}</span>
            <div class="an-duree-piste">
              <div class="an-duree-lien" style="left:${px(g)}%;width:${(px(Math.max(x.p, m)) - px(g)).toFixed(1)}%"></div>
              ${point(x.p, 'var(--accent)')}${point(m, 'var(--accent4)')}
            </div>
            <span style="text-align:right;color:${Math.abs(ecart) >= 7 ? 'var(--orange)' : 'var(--text2)'}">${ecart > 0 ? '+' : ''}${ecart} min</span>
          </div>`;
        }).join('')}
      </section>
    `;
  },

  // ─── Intrigues ───────────────────────────────────────────────────────────

  _intrigue(epId, i) {
    return this.notes[`intrigue:${epId}:${i}`] || null;
  },

  async _enregistrerNote(cle, valeur) {
    if (valeur) this.notes[cle] = valeur;
    else delete this.notes[cle];
    this.rendreVue();
    const res = await api.put('analyse_notes', { cle, valeur });
    if (res.error) toast(res.error, 'error');
  },

  poserIntrigue(epId, i, k) {
    return this._enregistrerNote(`intrigue:${epId}:${i}`, this._intrigue(epId, i) === k ? null : k);
  },

  // L'équilibre sur toute la sélection : la part de chaque intrigue par épisode,
  // qui porte chacune, et les principaux tenus à l'écart d'une intrigue depuis longtemps
  _equilibreIntrigues() {
    const liste = this.res.avecScenes;
    const couleurs = Interface.couleursIntrigues();
    const lettres = Object.keys(couleurs);
    const lignes = liste.map((x, idx) => {
      const total = x.sc.reduce((a, s) => a + s[0], 0) || 1;
      const part = Object.fromEntries(lettres.map(k => [k, 0]));
      let classe = 0;
      x.sc.forEach((s, i) => {
        const k = this._intrigue(x.id, i);
        if (k && k in part) { part[k] += s[0]; classe += s[0]; }
      });
      return { x, idx, total, part, classe };
    });
    const classes = lignes.filter(l => l.classe > 0);
    if (!classes.length) return `<section class="an-carte"><h2 class="an-titre">Équilibre sur la sélection</h2><p class="an-note">Aucune scène classée dans ces épisodes. Classe les scènes d'un épisode ci-dessous (A, B, C) : l'équilibre entre les intrigues et ceux qui les portent s'affichent ici dès qu'il y en a.</p></section>`;

    // Qui porte chaque intrigue : les mots des scènes où il parle, rapportés à toute l'intrigue
    const porteurs = Object.fromEntries(lettres.map(k => [k, new Map()]));
    const totaux = Object.fromEntries(lettres.map(k => [k, 0]));
    const dernier = new Map();
    classes.forEach((l, rang) => l.x.sc.forEach((s, i) => {
      const k = this._intrigue(l.x.id, i);
      if (!k || !(k in porteurs)) return;
      totaux[k] += s[0];
      this._nomsScene(s).forEach(n => {
        porteurs[k].set(n, (porteurs[k].get(n) || 0) + s[0]);
        if (k === 'A') dernier.set(n, rang);
      });
    }));
    const principaux = this.data.persos.filter(p => p.g === 'p').map(p => p.n);
    const ecartes = principaux.map(n => ({ n, depuis: dernier.has(n) ? classes.length - 1 - dernier.get(n) : classes.length, vu: dernier.has(n) ? classes[dernier.get(n)].x : null }))
      .filter(p => p.depuis >= Math.min(4, classes.length)).sort((a, b) => b.depuis - a.depuis);
    const pct = (v, t) => Math.round((v * 100) / (t || 1));

    return `
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Équilibre sur la sélection</h2><span class="an-note">${classes.length} épisode(s) classé(s) sur ${liste.length}</span></div>
        <div class="in-equilibre">${classes.map(l => `
          <button type="button" class="in-ep ${l.x.id === this._episodeScene()?.id ? 'actif' : ''}" title="${esc(this._code(l.x))} · ${esc(l.x.t)}${l.classe ? ` · ${lettres.map(k => `${k} ${pct(l.part[k], l.total)} %`).join(', ')} · non classé ${pct(l.total - l.classe, l.total)} %` : ' · aucune scène classée'}" onclick="Analyse.regler('epScene', ${l.idx})">
            <span class="an-note">${esc(this._code(l.x))}</span>
            <span class="an-deroule in-barre">${lettres.map(k => l.part[k] ? `<span style="flex:${l.part[k]} 1 0;background:${couleurs[k]}"></span>` : '').join('')}${l.total > l.classe ? `<span style="flex:${l.total - l.classe} 1 0;background:var(--border2)"></span>` : ''}</span>
          </button>`).join('')}
        </div>
        <div class="an-ligne an-note">${lettres.map(k => `<span><span class="an-puce" style="background:${couleurs[k]}"></span> ${k} : ${pct(totaux[k], classes.reduce((a, l) => a + l.classe, 0))} %</span>`).join('')}<span><span class="an-puce" style="background:var(--border2)"></span> non classé</span></div>
        <div class="in-porteurs">${lettres.filter(k => totaux[k]).map(k => {
          const top = [...porteurs[k].entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
          return `<div><h3 class="an-label"><span class="an-puce" style="background:${couleurs[k]}"></span> Intrigue ${k} : qui la porte</h3>
            ${top.map(([n, v]) => `<div class="an-longueur"><span>${esc(n)}</span><div class="an-jauge"><div style="background:${this._couleur(n)};width:${pct(v, totaux[k])}%"></div></div><span class="an-note">${pct(v, totaux[k])} %</span></div>`).join('')}</div>`;
        }).join('')}</div>
        ${ecartes.length ? `<h3 class="an-label ec-orange">Loin de l'intrigue A</h3>
        <ul class="ec-liste">${ecartes.map(p => `<li><span><strong>${esc(p.n)}</strong> ${p.vu ? `n'a pas parlé dans une scène A depuis ${esc(this._code(p.vu))}` : "n'a jamais parlé dans une scène A de la sélection"}</span><span class="an-note">${p.depuis} épisode(s) classé(s)</span></li>`).join('')}</ul>` : ''}
        <p class="an-note">Part de chaque intrigue en mots, sur les épisodes dont au moins une scène est classée${liste.length > classes.length ? ` (${liste.length - classes.length} autre(s) à classer avec le menu ci-dessous)` : ''}. Pour chaque personnage, la part des mots de l'intrigue dite dans des scènes où il parle : plusieurs personnages se partagent une même scène, le total dépasse donc 100 %. Clique sur un épisode pour voir ses scènes.</p>
      </section>`;
  },

  vueIntrigues() {
    const ep = this._episodeScene();
    if (!ep) return `<section class="an-carte"><p class="an-note">Aucune scène détectée sur cette sélection.</p></section>`;
    const scenes = ep.sc;
    const total = scenes.reduce((a, s) => a + s[0], 0) || 1;
    const part = k => Math.round((scenes.reduce((a, s, i) => a + (this._intrigue(ep.id, i) === k ? s[0] : 0), 0) * 100) / total);

    return `
      ${this._equilibreIntrigues()}
      <section class="an-carte">
        <div class="an-entete">
          <h2 class="an-titre">Intrigues A/B/C par scène</h2>
          <select aria-label="Épisode" onchange="Analyse.regler('epScene', Number(this.value))">${this._optionsEpisodes()}</select>
        </div>
        <div class="an-deroule">${scenes.map((s, i) => {
          const k = this._intrigue(ep.id, i);
          return `<div style="flex:${Math.max(s[0], 1)} 1 0;background:${Interface.couleursIntrigues()[k] || 'var(--border2)'};color:${k ? '#0a0a0a' : 'var(--text)'}">${s[0] > total / 12 ? i + 1 : ''}</div>`;
        }).join('')}</div>
        <div class="an-ligne">${Object.keys(Interface.couleursIntrigues()).map(k => `<span class="an-note"><span class="an-puce" style="background:${Interface.couleursIntrigues()[k]}"></span> Intrigue ${k} : <strong>${part(k)} %</strong></span>`).join('')}</div>
      </section>
      <section class="an-carte">
        <h2 class="an-titre">Scènes</h2>
        <div class="an-table"><table>
          <thead><tr><th>N°</th><th>Décor</th><th>Personnages</th><th>Mots</th><th>Intrigue</th></tr></thead>
          <tbody>${scenes.map((s, i) => {
            const k = this._intrigue(ep.id, i);
            return `<tr>
              <td>${i + 1}</td><td>${esc(s[2])}</td><td class="an-note">${esc(this._nomsScene(s).join(', '))}</td><td>${s[0]}</td>
              <td><div class="an-ligne">${Object.keys(Interface.couleursIntrigues()).map(c => `<button type="button" class="an-intrigue" aria-label="Scène ${i + 1} : intrigue ${c}" aria-pressed="${k === c}" style="${k === c ? `background:${Interface.couleursIntrigues()[c]};border-color:${Interface.couleursIntrigues()[c]};color:#0a0a0a` : ''}" onclick="Analyse.poserIntrigue(${ep.id},${i},'${c}')">${c}</button>`).join('')}</div></td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </section>
    `;
  },

  // ─── Voix ────────────────────────────────────────────────────────────────

  _lireParole() {
    this._parole = this._parole || AnalyseCalcul.agregerParole(this.res.eps);
    return this._parole;
  },

  _personnagesVoix() {
    const parole = this._lireParole();
    const q = this.voixNom.trim().toLowerCase();
    const liste = this.data.parleurs
      .filter(p => this.voixGroupes.includes(p.g) && parole.has(p.n) && parole.get(p.n).mots >= (this.voixMin || 0))
      .filter(p => !q || p.n.toLowerCase().includes(q))
      .map(p => ({ ...p, ...parole.get(p.n) }));
    const tris = {
      mots: (a, b) => b.mots - a.mots,
      longueur: (a, b) => b.mots / b.repliques - a.mots / a.repliques,
      nom: (a, b) => a.nom.localeCompare(b.nom, 'fr'),
    };
    return liste.sort(tris[this.voixTri]);
  },

  _lexiqueVoix(nom) {
    const filtre = this.voixFiltre.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return AnalyseCalcul.lexique(this.data, this._lireParole(), nom, {
      reference: this.voixRef, mode: this.voixMode, occurrences: this.voixOcc || 1, lettres: this.voixLettres || 0,
      verbes: this.voixVerbes, masque: mot => this._motMasque(mot),
    }).filter(m => m.mot.includes(filtre));
  },

  basculerGroupeVoix(groupe) {
    this.voixGroupes = this.voixGroupes.includes(groupe) ? this.voixGroupes.filter(x => x !== groupe) : [...this.voixGroupes, groupe];
    this.rendreVue();
  },

  exporterVoix() {
    const lignes = [['personnage', 'mot', 'emplois', 'ailleurs']];
    this._personnagesVoix().forEach(p => this._lexiqueVoix(p.nom).slice(0, this.voixNb || 10).forEach(m => lignes.push([p.nom, m.affiche, m.n, m.ailleurs])));
    const blob = new Blob([lignes.map(l => l.join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(blob);
    lien.download = 'voix.csv';
    lien.click();
    URL.revokeObjectURL(lien.href);
  },

  _quiDit() {
    const q = this.voixQ.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!q) return '';
    const i = this.data.vocab.indexOf(q);
    const qui = i < 0 ? [] : AnalyseCalcul.quiDit(this.data, this._lireParole(), i);
    if (!qui.length) return '<p class="an-note">Personne n\'emploie ce mot dans cette sélection.</p>';
    const mx = qui[0].n;
    const episodes = AnalyseCalcul.episodesMot(this.res.eps, i);
    return `
      <div class="an-kpi an-mot-detail">
        <div class="an-entete">
          <strong>Qui dit « ${esc(this.data.accents[i] || q)} » ?</strong>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Analyse.masquerMot(${esc(JSON.stringify(q))})">Masquer ce mot</button>
        </div>
        ${qui.slice(0, 12).map(p => `<div class="an-longueur an-qui"><span title="${esc(p.nom)}">${esc(p.nom)}</span><div class="an-jauge"><div style="background:${this._couleur(p.nom)};width:${Math.round((p.n * 100) / mx)}%"></div></div><span class="an-note">${this._fr(p.n)}× · ${this._num(p.taux.toFixed(1))} ‰</span></div>`).join('')}
        <p class="an-note">‰ : emplois pour 1 000 mots prononcés par ce personnage.</p>
        <details class="an-mot-episodes" ${this.voixEpisodes ? 'open' : ''} ontoggle="Analyse.voixEpisodes = this.open">
          <summary>Voir les épisodes (${episodes.length})</summary>
          <div class="an-ligne">${episodes.map(x => `<span class="an-etiquette" title="${esc(x.e.t)} — ${esc(x.qui.map(q => `${q.nom} ${q.nb}`).join(', '))}">${esc(this._code(x.e))} <span class="an-note">${x.nb}×</span></span>`).join('')}</div>
        </details>
      </div>
    `;
  },

  // « Ça ne lui ressemble pas » : les répliques d'un épisode qui sonnent comme celles d'un autre personnage.
  // Le calcul se fait sur le serveur, qui relit tous les scripts sauf l'épisode examiné
  _ecartsVoix() {
    const ep = this._episodeScene();
    if (!ep) return '';
    const entete = `<div class="an-entete"><h2 class="an-titre">Ça ne lui ressemble pas</h2><select aria-label="Épisode" onchange="Analyse.regler('epScene', Number(this.value))">${this._optionsEpisodes()}</select></div>`;
    if (this._ecarts?.ep !== ep.id) {
      if (this._ecartsCharge !== ep.id) {
        this._ecartsCharge = ep.id;
        api.get(`voix_ecarts&ep=${ep.id}`).then(d => { this._ecarts = { ep: ep.id, d: d?.ecarts ? d : null }; })
          .catch(() => { this._ecarts = { ep: ep.id, d: null }; })
          .finally(() => { this._ecartsCharge = null; if (this.vue === 'voix') this.rendreVue(); });
      }
      return `<section class="an-carte">${entete}<p class="an-note">Comparaison des répliques avec le reste de la série…</p></section>`;
    }
    const d = this._ecarts.d;
    if (!d) return `<section class="an-carte">${entete}<p class="an-note">Impossible de comparer les voix pour cet épisode.</p></section>`;
    const visibles = d.ecarts.filter(x => !this.notes[`voix-ok:${ep.id}:${x.i}:${this._plat(x.texte).slice(0, 60)}`]);
    return `
      <section class="an-carte">
        ${entete}
        ${d.voix.length < 2 ? '<p class="an-note">Il faut au moins deux personnages qui parlent beaucoup ailleurs dans la série pour comparer leurs voix.</p>' : visibles.length ? `
        <ul class="vx-ecarts">${visibles.map(x => `<li>
          <div class="an-entete"><span><strong style="color:${this._encre(this._couleur(x.qui))}">${esc(x.qui)}</strong> · sc. ${x.i} · <span class="an-note">${esc(x.slug)}</span></span>
            <button type="button" class="btn btn-ghost btn-sm" onclick="Analyse.voixVoulue(${ep.id}, ${x.i}, ${esc(JSON.stringify(x.texte))})">C'est voulu</button></div>
          <blockquote>${esc(x.texte)}</blockquote>
          <span class="an-note">Ça sonne plutôt comme <strong style="color:${this._encre(this._couleur(x.plutot))}">${esc(x.plutot)}</strong>${x.mots.length ? ` : ${x.mots.map(m => `« ${esc(m)} »`).join(', ')}, des mots de ${esc(x.plutot)} que ${esc(x.qui)} n'emploie presque jamais` : ''}.</span>
        </li>`).join('')}</ul>` : `<p class="an-note">Aucune réplique de ${esc(this._code(ep))} ne détonne : chacun parle comme d'habitude.</p>`}
        <p class="an-note">${d.examinees} réplique(s) d'au moins 8 mots comparée(s) aux voix de ${esc(d.voix.join(', '))}, apprises sur les autres épisodes. Une réplique ressort quand ses mots sont nettement plus courants chez un autre personnage. Un accent, une langue étrangère ou une imitation ressortent aussi.</p>
      </section>`;
  },

  voixVoulue(epId, i, texte) {
    return this._enregistrerNote(`voix-ok:${epId}:${i}:${this._plat(texte).slice(0, 60)}`, '1');
  },

  _plat(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  },

  vueVoix() {
    const persos = this._personnagesVoix();
    const compter = g => this.data.parleurs.filter(p => p.g === g && this._lireParole().has(p.n)).length;
    const nombre = (id, label, cle) => `<label class="an-label" for="${id}">${label}</label><input id="${id}" class="an-nombre" type="number" min="0" value="${this[cle] || ''}" placeholder="—" oninput="Analyse.regler('${cle}', Number(this.value) || 0, '${id}')">`;
    const choix = (id, label, cle, options) => `<label class="an-label" for="${id}">${label}</label><select id="${id}" onchange="Analyse.regler('${cle}', this.value)">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(this[cle]) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const comparaison = this.voixRef ? `comparé à ${this.voixRef}` : 'comparé à tous les autres';

    return `
      <section class="an-carte">
        <div class="an-entete">
          <h2 class="an-titre">Voix des personnages</h2>
          <button type="button" class="btn btn-secondary btn-sm" onclick="Analyse.exporterVoix()">⬇ Exporter en CSV</button>
        </div>
        <div class="an-ligne">
          <span class="an-label">Afficher</span>
          ${this._bouton(`Principaux (${compter('p')})`, this.voixGroupes.includes('p'), "Analyse.basculerGroupeVoix('p')")}
          ${this._bouton(`Secondaires (${compter('s')})`, this.voixGroupes.includes('s'), "Analyse.basculerGroupeVoix('s')")}
          ${nombre('an-voix-min', 'Parle au moins (mots)', 'voixMin')}
          <input id="an-voix-nom" class="an-recherche" type="text" aria-label="Filtrer les personnages" placeholder="Filtrer par nom…" value="${esc(this.voixNom)}" oninput="Analyse.regler('voixNom', this.value, 'an-voix-nom')">
        </div>
        <div class="an-ligne">
          ${choix('an-voix-mode', 'Classer les mots', 'voixMode', [['distinct', 'Les plus caractéristiques'], ['frequence', 'Les plus fréquents']])}
          <label class="an-label" for="an-voix-ref">Comparer à</label>
          <select id="an-voix-ref" onchange="Analyse.regler('voixRef', this.value)">
            <option value="">Tous les autres</option>
            ${this._optionsParleurs(this.voixRef)}
          </select>
          ${choix('an-voix-tri', 'Trier les cartes', 'voixTri', [['mots', 'Mots prononcés'], ['longueur', 'Longueur des répliques'], ['nom', 'Nom']])}
        </div>
        <div class="an-ligne">
          ${nombre('an-voix-nb', 'Mots par carte', 'voixNb')}
          ${nombre('an-voix-occ', 'Emplois ≥', 'voixOcc')}
          ${nombre('an-voix-lettres', 'Lettres ≥', 'voixLettres')}
          <label class="an-ligne an-note"><input type="checkbox" class="an-case" ${this.voixVerbes ? 'checked' : ''} onchange="Analyse.regler('voixVerbes', this.checked)"> Inclure les verbes conjugués</label>
        </div>
        <div class="an-ligne">
          <input id="an-voix-filtre" class="an-recherche" type="text" aria-label="Chercher dans les mots affichés" placeholder="Chercher dans les mots…" value="${esc(this.voixFiltre)}" oninput="Analyse.regler('voixFiltre', this.value, 'an-voix-filtre')">
          <input id="an-voix-q" class="an-recherche" type="text" aria-label="Qui dit ce mot" placeholder="Qui dit ce mot ?" value="${esc(this.voixQ)}" oninput="Analyse.regler('voixQ', this.value, 'an-voix-q')">
        </div>
        ${this._quiDit()}
        <p class="an-note">${persos.length} personnage(s) · ${this.voixMode === 'distinct' ? esc(comparaison) : 'mots les plus employés'} · clique sur un mot pour voir qui le dit.</p>
      </section>
      ${this._ecartsVoix()}
      <div class="an-voix">${persos.map(p => {
        const lexique = this._lexiqueVoix(p.nom).slice(0, this.voixNb || 10);
        const mx = Math.max(...lexique.map(m => m.n), 1);
        return `<section class="an-carte">
          <div class="an-entete"><h2 class="an-titre" style="color:${this._encre(this._couleur(p.nom))};font-size:18px">${esc(p.nom)}</h2><span class="an-note">${this._fr(p.mots)} mots · ${this._num((p.mots / Math.max(p.repliques, 1)).toFixed(1))} mots/répl.</span></div>
          <div class="an-ligne an-lexique">${lexique.map(m => `<button type="button" class="an-mot-nuage" title="${m.n} emplois · ${m.ailleurs} chez les autres" style="font-size:${Math.round(15 + 17 * Math.sqrt(m.n / mx))}px" onclick="Analyse.regler('voixQ', ${esc(JSON.stringify(m.mot))})">${esc(m.affiche)} <small class="an-note">${m.n}</small></button>`).join('') || '<span class="an-note">Aucun mot avec ces réglages.</span>'}</div>
        </section>`;
      }).join('')}</div>
      <section class="an-carte" id="an-registres"><p class="an-note">Lecture des registres…</p></section>
    `;
  },

  // ─── Mots ────────────────────────────────────────────────────────────────

  _optionsParleurs(valeur) {
    const groupe = (titre, g) => {
      const liste = this.data.parleurs.filter(p => p.g === g);
      if (!liste.length) return '';
      return `<optgroup label="${titre}">${liste.map(p => `<option value="${esc(p.n)}" ${valeur === p.n ? 'selected' : ''}>${esc(p.n)}</option>`).join('')}</optgroup>`;
    };
    return groupe('Principaux', 'p') + groupe('Secondaires', 's');
  },

  _motMasque(mot) {
    return Boolean(this.notes[`mot-masque:${mot}`]);
  },

  masquerMot(mot, masque = true) {
    return this._enregistrerNote(`mot-masque:${mot}`, masque ? '1' : null);
  },

  voirMot(mot) {
    this.q = mot;
    this.rendreVue();
  },

  _motsAffiches() {
    const source = this.motsPerso ? AnalyseCalcul.motsPersonnage(this.data, this.res.eps, this.motsPerso) : this.res.mots;
    const liste = source.filter(m => (this.verbes || !m.verbe) && !this._motMasque(m.mot)
      && m.mot.length >= (this.motsLettres || 0) && m.nb >= (this.motsOcc || 0) && m.ep >= (this.motsEp || 0));
    if (this.motsTri === 'alpha') liste.sort((a, b) => a.mot.localeCompare(b.mot, 'fr'));
    if (this.motsTri === 'longueur') liste.sort((a, b) => b.mot.length - a.mot.length || b.nb - a.nb);
    if (this.motsTri === 'episodes') liste.sort((a, b) => b.ep - a.ep || b.nb - a.nb);
    return liste;
  },

  exporterMots() {
    const lignes = [['mot', 'occurrences', 'episodes'], ...this._motsAffiches().map(m => [m.mot, m.nb, m.ep])];
    const blob = new Blob([lignes.map(l => l.join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(blob);
    lien.download = `mots-${this.motsPerso ? this.motsPerso.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'tous'}.csv`;
    lien.click();
    URL.revokeObjectURL(lien.href);
  },

  _detailMot(m) {
    const detail = AnalyseCalcul.detailMot(this.data, this.res.eps, m.i, this.motsPerso);
    const saisons = this.data.saisons.filter(s => this.res.eps.some(x => x.sa === s.n));
    const mx = Math.max(...Object.values(detail.saisons), 1);
    return `
      <div class="an-kpi an-mot-detail">
        <div class="an-entete">
          <strong>${esc(m.mot)} — ${this._fr(m.nb)} occurrence${m.nb > 1 ? 's' : ''} dans ${m.ep} épisode${m.ep > 1 ? 's' : ''}</strong>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Analyse.masquerMot(${esc(JSON.stringify(m.mot))})">Masquer ce mot</button>
        </div>
        <div class="an-mot-saisons">${saisons.map(s => `<div title="Saison ${s.n} : ${detail.saisons[s.n] || 0}"><div class="an-mot-barre"><span style="height:${Math.round(((detail.saisons[s.n] || 0) * 60) / mx)}px;background:${s.c}"></span></div><span class="an-label">S${s.n}</span></div>`).join('')}</div>
        <div class="an-note">Surtout dans : ${detail.episodes.slice(0, 6).map(x => `${esc(this._code(x.e))} (${x.nb})`).join(' · ')}</div>
      </div>
    `;
  },

  vueMots() {
    const liste = this._motsAffiches();
    const top = liste.slice(0, 300), mx = Math.max(...top.map(m => m.nb), 1);
    const listeTop = liste.slice(0, this.motsNombre);
    const pal = ['var(--accent)', 'var(--accent4)', 'var(--orange)', this._encre('#f08fb0'), this._encre('#c9b8ff'), 'var(--text)'];
    const q = this.q.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let resultat = '';
    if (q) {
      const exact = liste.find(m => m.mot === q);
      const partiels = exact ? [] : liste.filter(m => m.mot.includes(q)).slice(0, 8);
      resultat = exact ? this._detailMot(exact)
        : partiels.length ? `<div class="an-ligne">${partiels.map(m => `<button type="button" class="an-choix" onclick="Analyse.voirMot(${esc(JSON.stringify(m.mot))})">${esc(m.mot)} ${this._fr(m.nb)}×</button>`).join('')}</div>`
        : '<p class="an-note">Mot non trouvé avec ces réglages.</p>';
    }
    const masques = Object.keys(this.notes).filter(k => k.startsWith('mot-masque:')).map(k => k.slice(11)).sort();
    const nombre = (id, label, cle, min = 0) => `<label class="an-label" for="${id}">${label}</label><input id="${id}" class="an-nombre" type="number" min="${min}" value="${this[cle] || ''}" placeholder="—" oninput="Analyse.regler('${cle}', Number(this.value) || 0, '${id}')">`;

    return `
      <section class="an-carte">
        <div class="an-entete">
          <h2 class="an-titre">Mots les plus utilisés</h2>
          <button type="button" class="btn btn-secondary btn-sm" onclick="Analyse.exporterMots()">⬇ Exporter en CSV</button>
        </div>
        <div class="an-ligne">
          <label class="an-label" for="an-mots-perso">Dit par</label>
          <select id="an-mots-perso" onchange="Analyse.regler('motsPerso', this.value)">
            <option value="">Tout le texte</option>
            ${this._optionsParleurs(this.motsPerso)}
          </select>
          <label class="an-label" for="an-mots-tri">Trier par</label>
          <select id="an-mots-tri" onchange="Analyse.regler('motsTri', this.value)">
            ${[['nb', 'Fréquence'], ['episodes', "Nombre d'épisodes"], ['alpha', 'Ordre alphabétique'], ['longueur', 'Longueur du mot']].map(([k, l]) => `<option value="${k}" ${this.motsTri === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <label class="an-label" for="an-mots-nb">Afficher</label>
          <select id="an-mots-nb" onchange="Analyse.regler('motsNombre', Number(this.value))">
            ${[50, 100, 300, 1000].map(n => `<option value="${n}" ${this.motsNombre === n ? 'selected' : ''}>Top ${n}</option>`).join('')}
          </select>
        </div>
        <div class="an-ligne">
          ${nombre('an-mots-lettres', 'Lettres ≥', 'motsLettres')}
          ${nombre('an-mots-occ', 'Occurrences ≥', 'motsOcc')}
          ${nombre('an-mots-ep', 'Épisodes ≥', 'motsEp')}
          <label class="an-ligne an-note"><input type="checkbox" class="an-case" ${this.verbes ? 'checked' : ''} onchange="Analyse.regler('verbes', this.checked)"> Inclure les verbes conjugués</label>
        </div>
        <input id="an-mot" class="an-recherche" type="text" aria-label="Rechercher un mot" placeholder="Rechercher un mot…" value="${esc(this.q)}" oninput="Analyse.regler('q', this.value, 'an-mot')">
        ${resultat}
        <p class="an-note">${this._fr(liste.length)} mots avec ces réglages. Clique sur un mot pour voir son détail.</p>
        <div class="an-mots">
          <div class="an-nuage">${top.map((m, i) => {
            const fs = Math.round(11 + (m.nb / mx) * 17);
            return `<button type="button" class="an-mot-nuage" title="${m.nb} occurrences · ${m.ep} épisodes" style="font-size:${fs}px;color:${pal[i % pal.length]};font-weight:${fs > 15 ? 700 : 400}" onclick="Analyse.voirMot(${esc(JSON.stringify(m.mot))})">${esc(m.mot)}</button> `;
          }).join('')}</div>
          <div>
            <div class="an-label">Top ${listeTop.length}</div>
            ${listeTop.map((m, i) => `<div class="an-top"><button type="button" class="an-mot-lien" onclick="Analyse.voirMot(${esc(JSON.stringify(m.mot))})">${esc(m.mot)}</button><div class="an-jauge"><div style="background:${pal[i % pal.length]};width:${Math.round((m.nb * 100) / mx)}%"></div></div><span class="an-note" title="Présent dans ${m.ep} épisodes">${this._fr(m.nb)}×</span><button type="button" class="an-mot-masquer" title="Masquer ce mot" aria-label="Masquer ${esc(m.mot)}" onclick="Analyse.masquerMot(${esc(JSON.stringify(m.mot))})">✕</button></div>`).join('')}
          </div>
        </div>
        ${masques.length ? `
          <details class="noms-regles">
            <summary>Mots masqués (${masques.length})</summary>
            <div class="an-ligne">${masques.map(m => `<button type="button" class="an-choix" title="Réafficher" onclick="Analyse.masquerMot(${esc(JSON.stringify(m))}, false)">${esc(m)} ✕</button>`).join('')}</div>
          </details>
        ` : ''}
        <p class="an-note">Stopwords français exclus · mots &lt; 3 caractères exclus · noms propres exclus · « Dit par » ne compte que les dialogues</p>
      </section>
    `;
  },

  // ─── Expressions ─────────────────────────────────────────────────────────

  basculerExpression(texte) {
    const ordre = ['', 'gag', 'tic'];
    const actuel = this.notes[`expression:${texte}`] || '';
    return this._enregistrerNote(`expression:${texte}`, ordre[(ordre.indexOf(actuel) + 1) % 3]);
  },

  masquerExpression(texte, masque = true) {
    if (this.exprDetail === texte) this.exprDetail = '';
    return this._enregistrerNote(`expression-masquee:${texte}`, masque ? '1' : null);
  },

  voirExpression(texte) {
    this.exprDetail = this.exprDetail === texte ? '' : texte;
    this.rendreVue();
  },

  // La liste des expressions est recalculée par le serveur (quelques secondes)
  async _changerMesExpressions(texte, ajouter) {
    toast('Recherche de cette expression dans tous les épisodes…', 'info');
    const res = await api.put('analyse_notes', { cle: `expression-perso:${texte}`, valeur: ajouter ? '1' : null });
    if (res.error) {
      toast(res.error, 'error');
      return;
    }
    await this.charger();
    this.rendreVue();
  },

  ajouterExpression() {
    const texte = document.getElementById('an-expr-ajout')?.value.trim();
    if (texte) return this._changerMesExpressions(texte, true);
  },

  _expressionsAffichees() {
    const q = this.exprQ.trim().toLowerCase();
    const liste = AnalyseCalcul.expressions(this.data, this.res.eps, this.exprPerso).filter(x => {
      const statut = this.notes[`expression:${x.texte}`] || 'aucun';
      if (this.notes[`expression-masquee:${x.texte}`]) return false;
      if (this.exprSource === 'miennes' && !x.mienne) return false;
      if (this.exprSource === 'detectees' && x.mienne) return false;
      if (this.exprStatut !== 'tous' && statut !== this.exprStatut) return false;
      if (q && !x.texte.includes(q)) return false;
      return x.ep >= (this.exprEp || 0) && x.total >= (this.exprOcc || 0) && x.texte.split(' ').length >= (this.exprMots || 0);
    });
    const tris = {
      ep: (a, b) => b.ep - a.ep || b.total - a.total,
      total: (a, b) => b.total - a.total,
      longueur: (a, b) => b.texte.split(' ').length - a.texte.split(' ').length || b.ep - a.ep,
      alpha: (a, b) => a.texte.localeCompare(b.texte, 'fr'),
    };
    return liste.sort(tris[this.exprTri]);
  },

  exporterExpressions() {
    const lignes = [['expression', 'episodes', 'occurrences', 'dite surtout par', 'statut'],
      ...this._expressionsAffichees().map(x => [x.texte, x.ep, x.total, x.qui.join(' et '), this.notes[`expression:${x.texte}`] || ''])];
    const blob = new Blob([lignes.map(l => l.join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(blob);
    lien.download = 'expressions.csv';
    lien.click();
    URL.revokeObjectURL(lien.href);
  },

  _detailExpression(x, saisons) {
    const mx = Math.max(...Object.values(x.saison), 1);
    return `<tr><td colspan="5"><div class="an-kpi an-mot-detail">
      <div class="an-mot-saisons">${saisons.map(s => `<div title="Saison ${s.n} : ${x.saison[s.n] || 0}"><div class="an-mot-barre"><span style="height:${Math.round(((x.saison[s.n] || 0) * 60) / mx)}px;background:${s.c}"></span></div><span class="an-label">S${s.n}</span></div>`).join('')}</div>
      <div class="an-note">Dite par : ${x.parPerso.slice(0, 8).map(([p, n]) => `${esc(p)} (${n})`).join(' · ') || '—'}</div>
      <div class="an-note">Surtout dans : ${x.episodes.slice(0, 8).map(y => `${esc(this._code(y.e))} (${y.nb})`).join(' · ') || '—'}</div>
    </div></td></tr>`;
  },

  vueExpressions() {
    const liste = this._expressionsAffichees();
    const visibles = liste.slice(0, this.exprNombre);
    const saisons = this.data.saisons.filter(s => this.res.eps.some(x => x.sa === s.n));
    const libelles = { gag: 'Gag récurrent', tic: "Tic d'écriture" };
    const masquees = Object.keys(this.notes).filter(k => k.startsWith('expression-masquee:')).map(k => k.slice(19)).sort();
    const nombre = (id, label, cle) => `<label class="an-label" for="${id}">${label}</label><input id="${id}" class="an-nombre" type="number" min="0" value="${this[cle] || ''}" placeholder="—" oninput="Analyse.regler('${cle}', Number(this.value) || 0, '${id}')">`;
    const choix = (id, label, cle, options) => `<label class="an-label" for="${id}">${label}</label><select id="${id}" onchange="Analyse.regler('${cle}', this.value)">${options.map(([v, l]) => `<option value="${v}" ${String(this[cle]) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

    return `
      <section class="an-carte">
        <div class="an-entete">
          <h2 class="an-titre">Gags et tics récurrents</h2>
          <button type="button" class="btn btn-secondary btn-sm" onclick="Analyse.exporterExpressions()">⬇ Exporter en CSV</button>
        </div>
        <div class="an-ligne">
          <label class="an-label" for="an-expr-perso">Dite par</label>
          <select id="an-expr-perso" onchange="Analyse.regler('exprPerso', this.value)">
            <option value="">Tout le monde</option>
            ${this._optionsParleurs(this.exprPerso)}
          </select>
          ${choix('an-expr-source', 'Source', 'exprSource', [['toutes', 'Toutes'], ['detectees', 'Détectées'], ['miennes', 'Mes expressions']])}
          ${choix('an-expr-statut', 'Statut', 'exprStatut', [['tous', 'Tous'], ['aucun', 'À classer'], ['gag', 'Gags'], ['tic', 'Tics']])}
          ${choix('an-expr-tri', 'Trier par', 'exprTri', [['ep', "Nombre d'épisodes"], ['total', 'Occurrences'], ['longueur', 'Longueur'], ['alpha', 'Ordre alphabétique']])}
        </div>
        <div class="an-ligne">
          ${nombre('an-expr-ep', 'Épisodes ≥', 'exprEp')}
          ${nombre('an-expr-occ', 'Occurrences ≥', 'exprOcc')}
          ${nombre('an-expr-mots', 'Mots ≥', 'exprMots')}
          <label class="an-label" for="an-expr-nb">Afficher</label>
          <select id="an-expr-nb" onchange="Analyse.regler('exprNombre', Number(this.value))">${[25, 50, 100, 200].map(n => `<option value="${n}" ${this.exprNombre === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </div>
        <div class="an-ligne">
          <input id="an-expr-q" class="an-recherche" type="text" aria-label="Rechercher une expression" placeholder="Rechercher une expression…" value="${esc(this.exprQ)}" oninput="Analyse.regler('exprQ', this.value, 'an-expr-q')">
          <input id="an-expr-ajout" class="an-recherche" type="text" aria-label="Ajouter une expression" placeholder="Ajouter une expression à suivre…" onkeydown="if (event.key === 'Enter') Analyse.ajouterExpression()">
          <button type="button" class="btn btn-secondary btn-sm" onclick="Analyse.ajouterExpression()">Ajouter</button>
        </div>
        <p class="an-note">${this._fr(liste.length)} expressions avec ces réglages. Clique sur une expression pour voir son détail.</p>
        <div class="an-table"><table>
          <thead><tr><th>Expression</th><th>Épisodes</th><th>Dite surtout par</th><th>Par saison</th><th>Statut</th></tr></thead>
          <tbody>${visibles.map(x => {
            const mx = Math.max(...Object.values(x.saison), 1);
            const statut = this.notes[`expression:${x.texte}`];
            const arg = esc(JSON.stringify(x.texte));
            return `<tr>
              <td class="an-expression"><button type="button" class="an-mot-lien" aria-expanded="${this.exprDetail === x.texte}" onclick="Analyse.voirExpression(${arg})">« ${esc(x.texte)} »</button>${x.mienne ? ' <span class="an-badge" style="color:var(--accent);border-color:var(--accent)">à moi</span>' : ''}</td>
              <td class="an-note">${x.ep} ép. · ${x.total}×</td>
              <td>${esc(x.qui.join(', ')) || '—'}</td>
              <td><div class="an-mini">${saisons.map(s => `<span title="S${s.n} : ${x.saison[s.n] || 0}" style="height:${Math.max(2, Math.round(((x.saison[s.n] || 0) * 30) / mx))}px"></span>`).join('')}</div></td>
              <td><div class="an-ligne">
                ${this._bouton(libelles[statut] || 'À classer', statut === 'gag', `Analyse.basculerExpression(${arg})`)}
                <button type="button" class="an-mot-masquer" title="${x.mienne ? 'Retirer cette expression' : 'Masquer cette expression'}" aria-label="Retirer ${esc(x.texte)}" onclick="${x.mienne ? `Analyse._changerMesExpressions(${arg}, false)` : `Analyse.masquerExpression(${arg})`}">✕</button>
              </div></td>
            </tr>${this.exprDetail === x.texte ? this._detailExpression(x, saisons) : ''}`;
          }).join('')}</tbody>
        </table></div>
        ${masquees.length ? `
          <details class="noms-regles">
            <summary>Expressions masquées (${masquees.length})</summary>
            <div class="an-ligne">${masquees.map(t => `<button type="button" class="an-choix" title="Réafficher" onclick="Analyse.masquerExpression(${esc(JSON.stringify(t))}, false)">${esc(t)} ✕</button>`).join('')}</div>
          </details>
        ` : ''}
      </section>
    `;
  },

  // ─── Décors ──────────────────────────────────────────────────────────────

  _grapheDecor(x, parId, metrique, titre, filtre, cle, unite) {
    const R = this.res;
    const saisons = this.data.saisons.filter(s => R.eps.some(y => y.sa === s.n));
    const source = (this.espace ? R.eps : x.parEp.map(p => p.e)).filter(y => filtre === 'all' || String(y.sa) === String(filtre));
    const valeurs = source.map(y => parId.get(y.id)?.[metrique] ?? null);
    const mx = Math.max(...valeurs.map(v => v || 0), 1);
    return `
      <section class="an-carte">
        <div class="an-entete">
          <h2 class="an-titre">${titre}</h2>
          <div class="an-ligne">
            ${this._bouton('Espacé', this.espace, "Analyse.regler('espace', !Analyse.espace)")}
            <select aria-label="Saison du graphique" onchange="Analyse.regler('${cle}', this.value)">${this._optionsSaisons(saisons, filtre)}</select>
          </div>
        </div>
        <div class="an-barres" style="height:160px">${source.map((y, i) => {
          const v = valeurs[i], c = this.data.saisonCouleur[y.sa];
          const style = v ? `height:${Math.max(2, Math.round((v * 150) / mx))}px;background:${c}`
            : v === 0 ? `height:6px;box-sizing:border-box;border:1px dashed ${c}` : `height:2px;background:${c};opacity:0.2`;
          return `<div class="an-barre an-barre-decor" title="${esc(this._code(y))} : ${v === null ? 'absent' : `${v} ${unite}`}"><div style="${style}"></div></div>`;
        }).join('')}</div>
      </section>
    `;
  },

  vueDecors() {
    const R = this.res, d = this.data;
    this._decors = this._decors || AnalyseCalcul.decors(d, R.eps);
    const liste = this._decors;
    const x = liste.find(l => l.id === this.decor) || liste.find(l => l.nb_episodes > 0) || liste[0];
    if (!x) return `<section class="an-carte"><p class="an-note">Aucun décor enregistré.</p></section>`;

    const totalMots = liste.reduce((a, l) => a + l.mots, 0) || 1;
    const tries = [...liste].sort((a, b) => b.mots - a.mots);
    const mxM = tries[0]?.mots || 1;
    const saisons = d.saisons.filter(s => R.eps.some(y => y.sa === s.n));
    const parId = new Map(x.parEp.map(p => [p.e.id, p]));
    const dP = AnalyseCalcul.detailDecor(d, x, this.fP), dC = AnalyseCalcul.detailDecor(d, x, this.fC);
    const mxP = dP.persos[0]?.[1] || 1, mxC = dC.co[0]?.nb_scenes || 1;
    const pa = d.parId.get(x.pa);

    return `
      <section class="an-carte">
        <h2 class="an-titre">Poids des décors sur la sélection</h2>
        ${tries.map(l => `<div class="an-poids"><span>${esc(l.n)}</span><div class="an-jauge an-jauge-haute"><div style="background:var(--accent);width:${(l.mots * 100) / mxM}%"></div></div><span class="an-note">${Math.round((l.mots * 100) / totalMots)} % des mots</span></div>`).join('')}
      </section>
      <section class="an-carte">
        <h2 class="an-titre">Choisir un décor</h2>
        <div class="an-fiches">${liste.map(l => `
          <button type="button" class="an-fiche ${l.id === x.id ? 'actif' : ''}" aria-pressed="${l.id === x.id}" onclick="Analyse.regler('decor', ${l.id})">
            <strong>⬡ ${esc(l.n)}</strong>
            <span class="an-fiche-stats">
              <span><b>${l.nb_episodes}</b> épisodes</span><span><b>${this._fr(l.nb_repliques)}</b> répliques</span>
              <span><b>${l.nb_scenes}</b> scènes</span><span><b style="color:var(--accent)">${l.duree ? this._duree(l.duree) : '—'}</b> durée</span>
            </span>
          </button>
        `).join('')}</div>
      </section>
      <section class="an-carte">
        <h2 class="an-titre" style="color:var(--accent);font-size:18px">⬡ ${esc(x.n)}</h2>
        <p class="an-note">Première apparition : ${pa ? `${esc(this._code(pa))} · ${esc(pa.t || 'Sans titre')}` : 'non définie'} · ${x.pasEncore} épisode(s) « pas encore existant » dans la sélection</p>
        ${this._kpis([
          { l: 'Épisodes', v: x.nb_episodes }, { l: 'Scènes', v: x.nb_scenes },
          { l: 'Répliques', v: this._fr(x.nb_repliques) }, { l: 'Durée est.', v: x.duree ? this._duree(x.duree) : '—' },
        ])}
        <h3 class="an-label">Épisodes par saison</h3>
        ${saisons.map(s => `
          <div class="an-grille-saison">
            <span class="an-label">S${s.n}</span>
            <div class="an-grille">${R.eps.filter(y => y.sa === s.n).map(y => {
              const present = parId.get(y.id)?.statut === 1;
              return `<span title="${esc(this._code(y))} — ${esc(y.t)}" style="${present ? `background:${s.c};color:#0a0a0a` : ''}">${y.n}</span>`;
            }).join('')}</div>
          </div>
        `).join('')}
      </section>
      <div class="an-deux">
        ${this._grapheDecor(x, parId, 'scenes', 'Scènes dans ce décor', this.fS, 'fS', 'scènes')}
        ${this._grapheDecor(x, parId, 'repliques', 'Répliques dans ce décor', this.fR, 'fR', 'répl.')}
      </div>
      <div class="an-deux">
        <section class="an-carte">
          <div class="an-entete">
            <h2 class="an-titre">Répartition par personnage</h2>
            <select aria-label="Saison" onchange="Analyse.regler('fP', this.value)">${this._optionsSaisons(saisons, this.fP)}</select>
          </div>
          ${dP.persos.map(([nom, n]) => `<div class="an-repartition"><div><span>${esc(nom)}</span><span class="an-note">${this._fr(n)} répl.</span></div><div class="an-jauge"><div style="background:var(--accent);width:${Math.round((n * 100) / mxP)}%"></div></div></div>`).join('') || '<p class="an-note">Aucun personnage renseigné pour ce décor sur cette sélection.</p>'}
        </section>
        <section class="an-carte">
          <div class="an-entete">
            <h2 class="an-titre">Décors souvent associés</h2>
            <select aria-label="Saison" onchange="Analyse.regler('fC', this.value)">${this._optionsSaisons(saisons, this.fC)}</select>
          </div>
          ${dC.co.slice(0, 10).map(c => `<div class="an-repartition"><div><span>⬡ ${esc(c.nom)}</span><span class="an-note">${c.nb_episodes} ép. · ${c.nb_scenes} scène${c.nb_scenes > 1 ? 's' : ''}</span></div><div class="an-jauge"><div style="background:var(--accent);width:${Math.round((c.nb_scenes * 100) / mxC)}%"></div></div></div>`).join('') || '<p class="an-note">Aucun autre décor sur cette sélection.</p>'}
        </section>
      </div>
    `;
  },
};
