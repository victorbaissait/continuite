// assets/js/settings.js

const Settings = {
  saisons: [],
  lieux: [],
  personnages: [],
  maintenance: null,
  noms: { regles: [], non_reconnus: [] },
  sauvegardes: [],

  // Mots/minute — persisté dans localStorage, défaut 175 (cohérent avec le PHP)
  get motsParMinute() {
    return parseInt(localStorage.getItem(cleProjet('cfg_mots_par_minute')) || '175', 10);
  },
  set motsParMinute(v) {
    localStorage.setItem(cleProjet('cfg_mots_par_minute'), parseInt(v, 10));
  },

  async init() {
    this.render();
    this.loadMaintenanceDiagnostic();
    this.loadSauvegardes();
    this.loadNoms();
    Interface.rendrePanel();
    Projets.rendrePanel();
    MiseEnPage.rendrePanel();
    Portable.rendrePanel();
  },

  render() {
    const tab = document.getElementById('tab-settings');
    tab.innerHTML = `
      <div class="section-header">
        <div class="section-title">⚙ Configuration</div>
      </div>

      <div class="settings-layout">

        <!-- Projets -->
        <div class="settings-card">
          <div class="settings-card-header">Projets</div>
          <div class="settings-card-body" id="projets-panel"></div>
        </div>

        <!-- À propos -->
        <div class="settings-card">
          <div class="settings-card-header">À propos</div>
          <div class="settings-card-body settings-about-body">
            <p class="settings-stack">Stack : HTML · CSS · JS · PHP · SQLite</p>

            <div class="maintenance-panel" id="maintenance-panel">
              ${this.renderMaintenanceDiagnostic()}
            </div>
          </div>
        </div>

        <div class="settings-card">
          <div class="settings-card-header">Mots, intrigues et mise en page</div>
          <div class="settings-card-body" id="mise-en-page-panel"></div>
        </div>

        <div class="settings-card">
          <div class="settings-card-header">Interface</div>
          <div class="settings-card-body" id="interface-panel"></div>
        </div>

        <div class="settings-card">
          <div class="settings-card-header">Accessibilité et typographie</div>
          <div class="settings-card-body" id="accessibilite-panel"></div>
        </div>

        <div class="settings-card">
          <div class="settings-card-header">Projet portable</div>
          <div class="settings-card-body" id="portable-panel"></div>
        </div>

        <div class="settings-card">
          <div class="settings-card-header">Sauvegardes</div>
          <div class="settings-card-body">
            <p class="settings-card-subtitle">Une copie complète de la base (scripts inclus) dans <code>data/backups/</code>. L'export JSON est une version lisible, pour archiver ou réutiliser les données ailleurs.</p>
            <div class="maintenance-actions">
              <button class="btn btn-primary btn-sm" id="btn-sauvegarde" onclick="Settings.creerSauvegarde()">Sauvegarder maintenant</button>
              <button class="btn btn-secondary btn-sm" onclick="Settings.exportJSON()">⬇ Exporter JSON</button>
            </div>
            <div id="sauvegardes-liste" class="sauvegardes-liste"></div>
          </div>
        </div>

        <div class="settings-card">
          <div class="settings-card-header">Noms détectés</div>
          <div class="settings-card-body" id="noms-panel"></div>
        </div>


      </div>
    `;
  },

  renderDurationSettings() {
    return `
      <div class="settings-duration-panel">
        <div class="settings-duration-title">Calcul des durées</div>
        <div class="settings-duration-subtitle">
          Impacte l'affichage des durées dans les épisodes et l'analyse, sans modifier la base de données.
        </div>
        <div class="settings-duration-head">
          <label>Mots par minute</label>
          <span id="label-mpm">${this.motsParMinute} mots/min</span>
        </div>
        <input type="range" id="slider-mpm"
          min="100" max="300" step="5"
          value="${this.motsParMinute}"
          oninput="Settings.onMpmChange(this.value)">
        <div class="settings-duration-scale">
          <span>100 lent</span>
          <span>175 défaut</span>
          <span>300 rapide</span>
        </div>
      </div>
    `;
  },

  onMpmChange(val) {
    this.motsParMinute = val;
    const lbl = document.getElementById('label-mpm');
    if (lbl) lbl.textContent = `${val} mots/min`;
    // Répercuter immédiatement sur les modules déjà chargés
    if (typeof Episodes !== 'undefined' && Episodes.data?.length) Episodes.render();
    if (typeof Analyse !== 'undefined' && Analyse.data) Analyse.rendreVue();
  },

  async loadEpStats() {
    try {
      const eps = await api.get('episodes');
      const el = document.getElementById('stat-ep');
      if (el) el.textContent = eps.length;
    } catch (e) {}
  },

  formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n <= 0) return '—';
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
    return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
  },

  getLocalDiagnosticCounts() {
    try {
      const store = JSON.parse(localStorage.getItem(cleProjet('lemenu_batch_diagnostics_v1')) || '{}');
      const values = Object.values(store || {});
      return {
        ignored: values.filter(x => x?.status === 'ignored').length,
        verify: values.filter(x => x?.status === 'verify').length,
      };
    } catch(e) {
      return { ignored: 0, verify: 0 };
    }
  },

  renderMaintenanceDiagnostic() {
    const data = this.maintenance;
    if (!data) {
      return `
        <div class="maintenance-header">
          <div>
            <div class="maintenance-title">Maintenance / diagnostic</div>
            <div class="maintenance-subtitle">Lecture de l'état du projet…</div>
          </div>
          <span class="maintenance-status is-loading">…</span>
        </div>
      `;
    }

    const local = this.getLocalDiagnosticCounts();
    const level = data.status?.level || 'warning';
    const statusLabel = level === 'ok' ? 'OK' : 'À vérifier';
    const stats = data.stats || {};
    const texts = data.texts || {};
    const db = data.database || {};
    const incoherences = data.incoherences || {};
    const counts = data.counts || {};

    return `
      <div class="maintenance-header">
        <div>
          <div class="maintenance-title">Maintenance / diagnostic</div>
          <div class="maintenance-subtitle">${data.status?.message || 'État du projet'}</div>
        </div>
        <span class="maintenance-status ${level === 'ok' ? 'is-ok' : 'is-warning'}">${statusLabel}</span>
      </div>

      <div class="maintenance-grid">
        <div class="maintenance-metric">
          <span>Base</span>
          <strong>${db.ok ? 'OK' : 'Erreur'}</strong>
          <small>${this.formatBytes(db.size_bytes)} · ${db.indexes || 0} index</small>
        </div>
        <div class="maintenance-metric">
          <span>Textes</span>
          <strong>${texts.episodes_avec_texte || 0}/${counts.episodes || 0}</strong>
          <small>${texts.episodes_sans_texte || 0} sans texte</small>
        </div>
        <div class="maintenance-metric">
          <span>Stats</span>
          <strong>${stats.stats_a_recalculer || 0}</strong>
          <small>à recalculer</small>
        </div>
        <div class="maintenance-metric">
          <span>Cohérence</span>
          <strong>${incoherences.total || 0}</strong>
          <small>points détectés</small>
        </div>
      </div>

      <div class="maintenance-details">
        <div><span>Stats spécialisées</span><strong>${stats.tables?.scenes || 0} scènes · ${stats.tables?.lieux || 0} lieux · ${stats.tables?.personnages || 0} persos</strong></div>
        <div><span>Personnages</span><strong>${incoherences.personnages_detectes_absents || 0} détectés absents · ${incoherences.personnages_presents_non_detectes || 0} présents non détectés</strong></div>
        <div><span>Décors</span><strong>${incoherences.lieux_detectes_absents || 0} détectés absents · ${incoherences.lieux_presents_non_detectes || 0} présents non détectés</strong></div>
        <div><span>Batch local</span><strong>${local.verify} à vérifier · ${local.ignored} pas comme erreur</strong></div>
      </div>

      ${this.renderFiabilite()}

      <div class="maintenance-actions">
        <button class="btn btn-secondary btn-sm" onclick="Settings.loadMaintenanceDiagnostic(true)">↻ Relancer diagnostic</button>
        <button class="btn btn-ghost btn-sm" onclick="switchTab('batch');initTab('batch')">Ouvrir Batch</button>
      </div>

      ${this.renderDurationSettings()}
    `;
  },

  renderFiabilite() {
    const f = this.maintenance?.fiabilite;
    if (!f) return '';
    const points = [
      ['Présences périmées', f.presences.lignes ? `${f.presences.lignes} ligne(s), ${f.presences.repliques} réplique(s) en trop` : '', '<button class="btn btn-secondary btn-sm" onclick="Settings.recalculerTout()">Recalculer tout</button>'],
      ['Noms non reconnus', f.noms.nb ? `${f.noms.nb} nom(s), ${f.noms.repliques} réplique(s) : ${f.noms.exemples.join(', ')}…` : '', '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'noms-panel\')?.scrollIntoView({ block: \'start\' })">Voir les noms</button>'],
      ['Scènes sans décor', f.decors.scenes ? `${f.decors.scenes} sur ${f.decors.total}${f.decors.exemples.length ? ` : ${f.decors.exemples.join(', ')}…` : ''}` : '', '<button class="btn btn-secondary btn-sm" onclick="switchTab(\'decors\');initTab(\'decors\')">Ouvrir Décors</button>'],
      ['Pages manquantes', f.pages ? `${f.pages} épisode(s)` : '', '<button class="btn btn-secondary btn-sm" onclick="switchTab(\'batch\');initTab(\'batch\')">Ouvrir Batch</button>'],
      ['Titres manquants', f.titres ? `${f.titres} épisode(s)` : '', '<button class="btn btn-secondary btn-sm" onclick="switchTab(\'batch\');initTab(\'batch\')">Ouvrir Batch</button>'],
    ];
    return `
      <div class="maintenance-title">Fiabilité des chiffres</div>
      <div class="fiabilite-liste" id="fiabilite-liste">${points.map(([titre, detail, action]) => `
        <div class="fiabilite-point">
          <div><strong>${titre}</strong><small>${esc(detail) || 'Rien à signaler'}</small></div>
          ${detail ? action : ''}
        </div>`).join('')}</div>
    `;
  },

  // Relit tous les scripts avec le découpage actuel, un épisode à la fois
  async recalculerTout() {
    const liste = document.getElementById('fiabilite-liste');
    const episodes = await api.get('episodes');
    const cibles = episodes.filter(e => e.has_texte).map(e => e.id);
    for (let i = 0; i < cibles.length; i++) {
      if (liste) liste.textContent = `Relecture ${i + 1} / ${cibles.length}…`;
      await api.post('reanalyse', { episode_id: cibles[i] });
    }
    window.DataStore?.invalidateForMutation('reanalyse');
    this.loadMaintenanceDiagnostic(true);
  },

  async loadMaintenanceDiagnostic(force = false) {
    const panel = document.getElementById('maintenance-panel');
    if (force) {
      this.maintenance = null;
      if (panel) panel.innerHTML = this.renderMaintenanceDiagnostic();
    }

    try {
      this.maintenance = await api.get('maintenance');
      const target = document.getElementById('maintenance-panel');
      if (target) target.innerHTML = this.renderMaintenanceDiagnostic();
    } catch(e) {
      const target = document.getElementById('maintenance-panel');
      if (target) target.innerHTML = `
        <div class="maintenance-header">
          <div>
            <div class="maintenance-title">Maintenance / diagnostic</div>
            <div class="maintenance-subtitle">Impossible de lire le diagnostic.</div>
          </div>
          <span class="maintenance-status is-warning">Erreur</span>
        </div>
        ${this.renderDurationSettings()}
      `;
    }
  },

  async loadSauvegardes() {
    try {
      this.sauvegardes = await api.get('sauvegardes');
    } catch (e) {
      this.sauvegardes = [];
    }
    this.renderSauvegardes();
  },

  renderSauvegardes() {
    const el = document.getElementById('sauvegardes-liste');
    if (!el) return;
    if (!this.sauvegardes.length) {
      el.innerHTML = '<p class="sauvegardes-vide">Aucune sauvegarde pour le moment.</p>';
      return;
    }
    el.innerHTML = this.sauvegardes.slice(0, 5).map(s => `
      <div class="sauvegarde-ligne">
        <span>${new Date(s.date).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</span>
        <small>${this.formatBytes(s.taille)}</small>
        <a class="btn btn-ghost btn-sm" href="${API_BASE}sauvegardes/telecharger&fichier=${encodeURIComponent(s.fichier)}">Télécharger</a>
        ${s.images ? `<a class="btn btn-ghost btn-sm" href="${API_BASE}sauvegardes/telecharger&fichier=${encodeURIComponent(s.images)}">Dessins et voix</a>` : ''}
      </div>
    `).join('');
  },

  async creerSauvegarde() {
    const btn = document.getElementById('btn-sauvegarde');
    if (btn) btn.disabled = true;
    try {
      const res = await api.post('sauvegardes', {});
      if (res.error) throw new Error(res.error);
      toast('Sauvegarde créée', 'success');
      await this.loadSauvegardes();
    } catch (e) {
      toast(`Sauvegarde impossible : ${e.message}`, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  async loadNoms() {
    try {
      const [noms, personnages] = await Promise.all([api.get('noms'), DataStore.get('personnages')]);
      this.noms = noms;
      this.personnages = personnages;
    } catch (e) {
      this.noms = { regles: [], non_reconnus: [] };
    }
    this.renderNoms();
  },

  renderNoms() {
    const el = document.getElementById('noms-panel');
    if (!el) return;
    const { regles, non_reconnus: nonReconnus } = this.noms;
    const parRegle = type => regles.filter(r => r.regle === type);
    const options = this.personnages
      .map(p => `<option value="${p.id}">${esc(`${p.prenom} ${p.nom || ''}`.trim())}</option>`)
      .join('');

    el.innerHTML = `
      <p class="settings-card-subtitle">Un nom n'est rattaché à un personnage que s'il correspond exactement, ou via un alias. Tout le reste attend ici ta décision. Après un changement, relance la réanalyse depuis Batch pour mettre à jour les épisodes.</p>

      <div class="noms-titre">${nonReconnus.length} nom${nonReconnus.length > 1 ? 's' : ''} à traiter</div>
      ${nonReconnus.map((n, i) => `
        <div class="nom-ligne">
          <div class="nom-info">
            <strong>${esc(n.nom)}</strong>
            <small>${n.nb_repliques} répl. · ${n.nb_episodes} ép.</small>
          </div>
          <div class="nom-actions">
            ${n.suggestion ? `<button class="btn btn-secondary btn-sm" onclick="Settings.regleNom(${i}, 'alias', ${n.suggestion.id})">→ ${esc(n.suggestion.label)}</button>` : ''}
            <select class="nom-select" onchange="if (this.value) Settings.regleNom(${i}, 'alias', this.value)">
              <option value="">Associer à…</option>${options}
            </select>
            <button class="btn btn-ghost btn-sm" title="Vrai personnage secondaire, à garder tel quel" onclick="Settings.regleNom(${i}, 'garder')">Garder</button>
            <button class="btn btn-ghost btn-sm" title="Pas un personnage : didascalie, transition…" onclick="Settings.regleNom(${i}, 'ignorer')">Ignorer</button>
          </div>
        </div>
      `).join('') || '<p class="sauvegardes-vide">Tous les noms sont traités.</p>'}

      <div class="noms-ajout">
        <input id="nom-ajout" placeholder="Ajouter un nom à filtrer ou garder…">
        <button class="btn btn-ghost btn-sm" onclick="Settings.ajouterNom('garder')">Garder</button>
        <button class="btn btn-ghost btn-sm" onclick="Settings.ajouterNom('ignorer')">Ignorer</button>
      </div>

      ${this.renderReglesNoms('Alias', parRegle('alias'))}
      ${this.renderReglesNoms('Gardés', parRegle('garder'))}
      ${this.renderReglesNoms('Ignorés', parRegle('ignorer'))}
    `;
  },

  renderReglesNoms(titre, regles) {
    if (!regles.length) return '';
    return `
      <details class="noms-regles">
        <summary>${titre} (${regles.length})</summary>
        ${regles.map(r => `
          <div class="nom-regle">
            <span>${esc(r.nom)}${r.personnage ? ` → ${esc(r.personnage)}` : ''}</span>
            <button class="btn btn-ghost btn-sm" title="Retirer cette règle" onclick="Settings.supprimerRegleNom(${r.id})">✕</button>
          </div>
        `).join('')}
      </details>
    `;
  },

  async enregistrerRegleNom(nom, regle, personnageId = null) {
    const res = await api.post('noms', { nom, regle, personnage_id: personnageId });
    if (res.error) {
      toast(res.error, 'error');
      return;
    }
    await this.loadNoms();
  },

  regleNom(index, regle, personnageId = null) {
    return this.enregistrerRegleNom(this.noms.non_reconnus[index].nom, regle, personnageId);
  },

  ajouterNom(regle) {
    const input = document.getElementById('nom-ajout');
    const nom = input?.value.trim();
    if (nom) return this.enregistrerRegleNom(nom, regle);
  },

  async supprimerRegleNom(id) {
    await api.delete(`noms/${id}`);
    await this.loadNoms();
  },

  async addSaison() {
    const num = this.saisons.length + 1;
    const colors = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63'];
    await api.post('saisons', {
      numero: num,
      nom: `Saison ${num}`,
      couleur: colors[(num - 1) % colors.length]
    });
    toast('Saison créée', 'success');
    await this.init();
  },

  async updateSaison(id, data) {
    const s = this.saisons.find(x => x.id == id);
    if (!s) return;
    await api.put(`saisons/${id}`, { ...s, ...data });
    await this.init();
  },

  async deleteSaison(id) {
    if (!confirm('Supprimer cette saison et TOUS ses épisodes ?')) return;
    await api.delete(`saisons/${id}`);
    toast('Saison supprimée', 'info');
    await this.init();
  },

  async addLieu() {
    const nom = prompt('Nom du lieu (ex: Appartement de Lisa)');
    if (!nom?.trim()) return;
    await api.post('lieux', { nom: nom.trim(), description: '' });
    toast('Lieu ajouté', 'success');
    await this.init();
  },

  async updateLieu(id, data) {
    const l = this.lieux.find(x => x.id == id);
    if (!l) return;
    await api.put(`lieux/${id}`, { ...l, ...data });
  },

  async deleteLieu(id) {
    if (!confirm('Supprimer ce lieu ?')) return;
    await api.delete(`lieux/${id}`);
    toast('Lieu supprimé', 'info');
    await this.init();
  },

  async exportJSON() {
    try {
      const [episodes, personnages, themes, lieux, saisons] = await Promise.all([
        api.get('episodes&include_text=1'), DataStore.get('personnages'), DataStore.get('themes'),
        DataStore.get('lieux'), DataStore.get('saisons')
      ]);
      const data = { export_date: new Date().toISOString(), saisons, episodes, personnages, themes, lieux };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sitcom-writer-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Export JSON téléchargé', 'success');
    } catch (e) {
      toast('Erreur lors de l\'export', 'error');
    }
  }
};
