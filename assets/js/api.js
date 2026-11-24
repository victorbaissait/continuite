// assets/js/api.js — Couche API centralisée

// Le nom de l'app (pas celui d'un projet) : aussi dans package.json et api/projets.php
const NOM_APP = 'Continuité';

// App de bureau : Electron ne sait pas afficher prompt(), la fenêtre de saisie de l'app le remplace
if (window.bureau?.promptSync) window.prompt = (message, defaut) => window.bureau.promptSync(String(message ?? ''), defaut == null ? '' : String(defaut));

// Le projet est figé au chargement de la page : un autre onglet qui change de projet ne touche pas celui-ci
const PROJET = (() => { try { return localStorage.getItem('lemenu_projet') || ''; } catch (e) { return ''; } })();
// Adresse relative : la même page marche sous MAMP (/lemenu/) et dans l'app de bureau (à la racine)
const API_BASE = `api/index.php?${PROJET ? `projet=${encodeURIComponent(PROJET)}&` : ''}path=`;

// Ce que le navigateur retient est propre à chaque projet ; le projet d'origine garde ses clés
const cleProjet = cle => (PROJET ? `${cle}@${PROJET}` : cle);

// Échappe une valeur avant de l'insérer dans du HTML (texte ou attribut).
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]);
}

// Le projet retenu n'existe plus (dossier supprimé, données venues d'un autre ordinateur) :
// on l'oublie et on rouvre le projet principal, au lieu d'afficher une page vide
async function projetDisparu(r) {
  if (!PROJET || r.status !== 404) return false;
  const corps = await r.clone().json().catch(() => null);
  if (corps?.error !== 'Projet introuvable') return false;
  try { localStorage.removeItem('lemenu_projet'); } catch (e) {}
  location.reload();
  return true;
}

const api = {
  async get(path) {
    const r = await fetch(API_BASE + path);
    if (!r.ok && await projetDisparu(r)) return new Promise(() => {});
    if (!r.ok) throw new Error(`API error ${r.status}`);
    return r.json();
  },
  async post(path, data) {
    const r = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await r.json();
    if (r.ok) window.DataStore?.invalidateForMutation(path);
    return json;
  },
  async put(path, data) {
    const r = await fetch(API_BASE + path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await r.json();
    if (r.ok) window.DataStore?.invalidateForMutation(path);
    return json;
  },
  async delete(path) {
    const r = await fetch(API_BASE + path, { method: 'DELETE' });
    const json = await r.json();
    if (r.ok) window.DataStore?.invalidateForMutation(path);
    return json;
  },
  async upload(formData) {
    const r = await fetch(API_BASE + 'upload', {
      method: 'POST',
      body: formData
    });
    const json = await r.json();
    if (r.ok) window.DataStore?.invalidateForMutation('upload');
    return json;
  }
};

// ===================== CACHE DONNÉES STABLES =====================

const DataStore = {
  _cache: new Map(),
  _mutationMap: {
    saisons: ['saisons', 'episodes', 'stats'],
    episodes: ['episodes', 'saisons', 'personnages', 'lieux', 'themes', 'stats', 'frise'],
    personnages: ['personnages', 'episodes', 'stats'],
    personnage_moments: ['personnages', 'personnage_moments'],
    personnage_signatures: ['personnages', 'personnage_signatures'],
    themes: ['themes', 'episodes', 'stats'],
    lieux: ['lieux', 'episodes', 'stats'],
    frise: ['frise', 'episodes'],
    bible_notes: ['bible_notes'],
    promesses: ['promesses', 'themes', 'episodes'],
    batch: ['episodes', 'saisons', 'personnages', 'lieux', 'themes', 'stats', 'frise'],
    upload: ['episodes', 'saisons', 'personnages', 'lieux', 'stats'],
    reanalyse: ['episodes', 'personnages', 'lieux', 'stats'],
    decors_auto: ['episodes', 'lieux', 'stats'],
    analyse: ['stats'],
    journal: ['journal'],
    lecteurs: ['lecteurs', 'episodes'],
    noms: ['stats', 'personnages'],
  },

  async get(path, options = {}) {
    const force = Boolean(options.force);
    if (!force && this._cache.has(path)) return this._cache.get(path);

    const request = api.get(path);
    this._cache.set(path, request);

    try {
      const data = await request;
      this._cache.set(path, data);
      return data;
    } catch (e) {
      this._cache.delete(path);
      throw e;
    }
  },

  invalidate(path) {
    this._cache.delete(path);
  },

  invalidateMany(paths) {
    paths.forEach(path => this.invalidate(path));
  },

  invalidateByResource(resource) {
    for (const key of this._cache.keys()) {
      if (
        key === resource ||
        key.startsWith(resource + '/') ||
        key.startsWith(resource + '&') ||
        key.startsWith(resource + '?')
      ) {
        this._cache.delete(key);
      }
    }
  },

  resourceFromPath(path) {
    return String(path || '').replace(/^\/+/, '').split(/[/?&]/)[0].split('/')[0];
  },

  invalidateForMutation(path) {
    const resource = this.resourceFromPath(path);
    const impacted = new Set([resource, ...(this._mutationMap[resource] || [])].filter(Boolean));

    impacted.forEach(res => this.invalidateByResource(res));

    if (resource) {
      window.dispatchEvent(new CustomEvent('lemenu:data-mutated', {
        detail: { resource, path, invalidated: [...impacted] }
      }));
    }
  },

  async refresh(path) {
    this.invalidate(path);
    return this.get(path, { force: true });
  },

  clear() {
    this._cache.clear();
  },
};

window.DataStore = DataStore;

// ===================== JOURNAL =====================

const Journal = {
  CATEGORIES: {
    episodes:    'Épisodes',
    personnages: 'Personnages',
    themes:      'Thèmes',
    saisons:     'Saisons',
    lieux:       'Lieux',
  },

  CHAMPS: {
    titre:        'Titre',
    titre_fr:     'Titre FR',
    jet:          'Version',
    avancement:   'Avancement',
    nb_pages:     'Pages',
    resume:       'Résumé',
    intrigue_a:   'Intrigue A',
    intrigue_b:   'Intrigue B',
    intrigue_c:   'Intrigue C',
    date_diege:   'Date diégétique',
    commentaires: 'Commentaires',
    prenom:       'Prénom',
    nom:          'Nom',
    est_principal:'Rôle',
    sexe:         'Sexe',
    age:          'Âge',
    profession:   'Profession',
    caracteristiques: 'Caractéristiques',
    couleur_identite: 'Couleur',
    description:  'Description',
    couleur:      'Couleur',
    numero:       'Numéro',
  },

  IGNORES: new Set(['id','saison_id','updated_at','created_at','lieux_autres',
    'faux_site_web','code','nom_affichage','date_naissance','has_texte',
    'personnages','extras','lieux','themes']),

  async log(entry) {
    try {
      await api.post('journal', entry);
      this._refreshIfVisible();
    } catch (e) {
      console.warn('Journal: impossible de logguer', e);
    }
  },

  _refreshIfVisible() {
    const tab = document.getElementById('tab-journal');
    if (tab && tab.classList.contains('active') && typeof JournalTab !== 'undefined') {
      JournalTab.init();
    }
  },

  async logCreate(categorie, label) {
    const catLabel = this.CATEGORIES[categorie] || categorie;
    await this.log({
      action:       'create',
      categorie,
      entite_label: label,
      description:  `Ajout de « ${label} » dans ${catLabel}`,
    });
  },

  async logDelete(categorie, label) {
    const catLabel = this.CATEGORIES[categorie] || categorie;
    await this.log({
      action:       'delete',
      categorie,
      entite_label: label,
      description:  `Suppression de « ${label} » dans ${catLabel}`,
    });
  },

  async logUpdate(categorie, label, avant, apres) {
    const catLabel = this.CATEGORIES[categorie] || categorie;
    const entries = [];

    for (const key of Object.keys(apres)) {
      if (this.IGNORES.has(key)) continue;
      const vApres = apres[key] ?? null;
      // avant peut être un objet enrichi (stats, relations…) : on prend juste la clé scalaire
      const vAvant = (avant && key in avant) ? (avant[key] ?? null) : null;
      // Normaliser : null/undefined/"" sont tous considérés comme vide
      const normAvant = (vAvant === null || vAvant === undefined || vAvant === '') ? '' : String(vAvant).trim();
      const normApres = (vApres === null || vApres === undefined || vApres === '') ? '' : String(vApres).trim();
      if (normAvant === normApres) continue;
      entries.push({ key, vAvant, vApres });
    }

    if (!entries.length) return;

    for (const { key, vAvant, vApres } of entries) {
      const champLabel = this.CHAMPS[key] || key;
      const avantStr   = (vAvant !== null && vAvant !== '') ? String(vAvant) : '(vide)';
      const apresStr   = (vApres !== null && vApres !== '') ? String(vApres) : '(vide)';
      await this.log({
        action:       'update',
        categorie,
        entite_label: label,
        champ:        champLabel,
        valeur_avant: avantStr,
        valeur_apres: apresStr,
        description:  `${champLabel} de « ${label} » (${catLabel}) : « ${avantStr} » → « ${apresStr} »`,
      });
    }
  }
};

// ===================== WRAPPERS LOGGÉS =====================

const apiLogged = {

  // ÉPISODES
  async createEpisode(body) {
    const res = await api.post('episodes', body);
    const label = body.titre || `E${String(body.numero_episode).padStart(2,'0')}`;
    await Journal.logCreate('episodes', label);
    return res;
  },

  async updateEpisode(id, body, avant) {
    const res = await api.put(`episodes/${id}`, body);
    const label = body.titre || avant?.titre || `Épisode #${id}`;
    await Journal.logUpdate('episodes', label, avant, body);
    return res;
  },

  async deleteEpisode(id, label) {
    const res = await api.delete(`episodes/${id}`);
    await Journal.logDelete('episodes', label || `Épisode #${id}`);
    return res;
  },

  // PERSONNAGES
  async createPersonnage(body) {
    const res = await api.post('personnages', body);
    const label = [body.prenom, body.nom].filter(Boolean).join(' ');
    await Journal.logCreate('personnages', label);
    return res;
  },

  async updatePersonnage(id, body, avant) {
    const res = await api.put(`personnages/${id}`, body);
    const label = [body.prenom, body.nom].filter(Boolean).join(' ');
    await Journal.logUpdate('personnages', label, avant, body);
    return res;
  },

  async deletePersonnage(id, label) {
    const res = await api.delete(`personnages/${id}`);
    await Journal.logDelete('personnages', label || `Personnage #${id}`);
    return res;
  },

  // THÈMES
  async createTheme(body) {
    const res = await api.post('themes', body);
    await Journal.logCreate('themes', body.nom);
    return res;
  },

  async updateTheme(id, body, labelAvant) {
    let avant = null;
    try { avant = await api.get(`themes/${id}`); } catch (e) {}
    const res = await api.put(`themes/${id}`, body);
    await Journal.logUpdate('themes', body.nom || labelAvant || `Thème #${id}`, avant, body);
    return res;
  },

  async deleteTheme(id, label) {
    const res = await api.delete(`themes/${id}`);
    await Journal.logDelete('themes', label || `Thème #${id}`);
    return res;
  },

  // SAISONS
  async createSaison(body) {
    const res = await api.post('saisons', body);
    const label = body.nom || `Saison ${body.numero}`;
    await Journal.logCreate('saisons', label);
    return res;
  },

  async updateSaison(id, body) {
    let avant = null;
    try { avant = await api.get(`saisons/${id}`); } catch (e) {}
    const res = await api.put(`saisons/${id}`, body);
    const label = body.nom || `Saison ${body.numero}`;
    await Journal.logUpdate('saisons', label, avant, body);
    return res;
  },

  async deleteSaison(id, label) {
    const res = await api.delete(`saisons/${id}`);
    await Journal.logDelete('saisons', label || `Saison #${id}`);
    return res;
  },

  // LIEUX
  async createLieu(body) {
    const res = await api.post('lieux', body);
    await Journal.logCreate('lieux', body.nom);
    return res;
  },

  async updateLieu(id, body) {
    let avant = null;
    try { avant = await api.get(`lieux/${id}`); } catch (e) {}
    const res = await api.put(`lieux/${id}`, body);
    await Journal.logUpdate('lieux', body.nom || `Lieu #${id}`, avant, body);
    return res;
  },

  async deleteLieu(id, label) {
    const res = await api.delete(`lieux/${id}`);
    await Journal.logDelete('lieux', label || `Lieu #${id}`);
    return res;
  },
};

// ===================== TOAST =====================

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  el.innerHTML = `<span>${icon}</span><span>${esc(msg)}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ===================== MODAL =====================

const modal = {
  _keyHandler: null,

  open(html) {
    document.getElementById('modal-content').innerHTML = html;
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },

  close() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.body.style.overflow = '';
    document.getElementById('modal-content').innerHTML = '';
    this.clearNav();
  },

  setNav(prevFn, nextFn) {
    this.clearNav();
    this._keyHandler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); return; }
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft'  && prevFn) { e.preventDefault(); prevFn(); }
      if (e.key === 'ArrowRight' && nextFn) { e.preventDefault(); nextFn(); }
    };
    document.addEventListener('keydown', this._keyHandler);
  },

  clearNav() {
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
  }
};

// ===================== HELPERS =====================

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

const colors = ["#ff6a00","#ff6f00","#ff7400","#ff7900","#ff7e00","#ff8300","#ff8800","#ff8d00","#ff9200","#ff9700","#ff9c00","#ffa100","#ffa600","#ffab00","#ffb000","#ffb500","#ffba00","#ffbf00","#ffc400","#ffc900","#ffce00","#ffd300","#ffd800","#ffdd00","#ffe200","#ffe700","#ffec00","#fff100","#f6f600","#ecfb00","#e3ff00","#d9ff00","#d0ff00","#c6ff00","#bdff00","#b3ff00","#aaff00","#a0ff00","#97ff00","#8dff00","#84ff00","#7aff00","#71ff14","#67ff29","#5eff3d","#54ff52","#4bff66","#41ff7b","#38ff8f","#2effa4","#25ffb8"];

window.progressColor = function(pct) {
  const index = Math.max(0, Math.min(colors.length - 1, Math.floor((pct / 100) * (colors.length - 1))));
  return colors[index];
};

window.renderProgress = function() {
  document.querySelectorAll('.progress-bar-fill').forEach(el => {
    const pct = parseInt(el.getAttribute('data-pct'), 10);
    if (!isNaN(pct)) {
      const col = window.progressColor(pct);
      el.style.width = pct + '%';
      el.style.backgroundColor = col;
      el.style.setProperty('background-color', col, 'important');
    }
  });
};

document.addEventListener('DOMContentLoaded', () => {
  window.renderProgress();
});
