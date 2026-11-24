// assets/js/comparateur.js

const Comparateur = {
  episodes: [],
  saisons: [],
  selectedA: '',
  selectedB: '',
  result: null,
  loading: false,

  async init() {
    [this.episodes, this.saisons] = await Promise.all([
      DataStore.get('episodes'),
      DataStore.get('saisons')
    ]);
    this.render();
  },

  _escape(v) {
    return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  },

  _episodeCode(ep) {
    const saison = ep.saison_numero || this.saisons.find(s => s.id == ep.saison_id)?.numero || '?';
    return `S${saison}E${String(ep.numero_episode || 0).padStart(2, '0')}`;
  },

  _episodeOptions(selectedId, excludedId = null) {
    const bySaison = new Map();
    this.episodes.forEach(ep => {
      const saison = ep.saison_numero || this.saisons.find(s => s.id == ep.saison_id)?.numero || '?';
      if (!bySaison.has(saison)) bySaison.set(saison, []);
      bySaison.get(saison).push(ep);
    });

    return `
      <option value="">Choisir un épisode</option>
      ${[...bySaison.entries()].sort((a,b) => Number(a[0]) - Number(b[0])).map(([saison, eps]) => `
        <optgroup label="Saison ${saison}">
          ${eps
            .slice()
            .sort((a,b) => (a.numero_episode || 0) - (b.numero_episode || 0))
            .map(ep => {
              const disabled = excludedId && String(ep.id) === String(excludedId) ? 'disabled' : '';
              const selected = String(ep.id) === String(selectedId) ? 'selected' : '';
              return `<option value="${ep.id}" ${selected} ${disabled}>${this._escape(this._episodeCode(ep) + ' · ' + (ep.titre || 'Sans titre'))}</option>`;
            }).join('')}
        </optgroup>
      `).join('')}
    `;
  },

  render() {
    const tab = document.getElementById('comparateur-vue');
    tab.innerHTML = `
      <div class="section-header">
        <div>
          <div class="section-title">⇄ Comparateur</div>
          <div class="section-subtitle">Comparer deux épisodes pour repérer personnages, lieux, thèmes, promesses, structure et scènes qui se répondent.</div>
        </div>
      </div>

      <div class="comparateur-shell">
        <div class="comparateur-selector-card">
          <div class="comparateur-selectors">
            <div class="form-group">
              <label>Épisode A</label>
              <select onchange="Comparateur.setEpisode('A', this.value)">
                ${this._episodeOptions(this.selectedA, this.selectedB)}
              </select>
            </div>
            <button class="comparateur-swap" onclick="Comparateur.swap()" title="Inverser les épisodes">⇄</button>
            <div class="form-group">
              <label>Épisode B</label>
              <select onchange="Comparateur.setEpisode('B', this.value)">
                ${this._episodeOptions(this.selectedB, this.selectedA)}
              </select>
            </div>
          </div>
          <div class="comparateur-actions">
            <button class="btn btn-primary" onclick="Comparateur.compare()" ${!this.canCompare() || this.loading ? 'disabled' : ''}>
              ${this.loading ? 'Comparaison…' : 'Comparer'}
            </button>
            <button class="btn btn-ghost" onclick="Comparateur.clear()">Réinitialiser</button>
          </div>
        </div>

        <div id="comparateur-results">
          ${this.result ? this.renderResults() : this.renderEmpty()}
        </div>
      </div>
    `;
  },

  renderEmpty() {
    return `
      <div class="empty-state comparateur-empty">
        <div class="empty-icon">⇄</div>
        <div class="empty-title">Sélectionnez deux épisodes</div>
        <div class="empty-sub">Le comparateur cherchera les zones miroir : personnages, décors, thèmes, promesses, mots et scènes proches.</div>
      </div>
    `;
  },

  canCompare() {
    return this.selectedA && this.selectedB && String(this.selectedA) !== String(this.selectedB);
  },

  setEpisode(side, value) {
    if (side === 'A') this.selectedA = value;
    else this.selectedB = value;
    this.result = null;
    this.render();
  },

  swap() {
    [this.selectedA, this.selectedB] = [this.selectedB, this.selectedA];
    this.result = null;
    this.render();
  },

  clear() {
    this.selectedA = '';
    this.selectedB = '';
    this.result = null;
    this.render();
  },

  async compare() {
    if (!this.canCompare()) {
      toast('Choisissez deux épisodes différents', 'error');
      return;
    }
    this.loading = true;
    this.render();
    try {
      this.result = await api.post('comparateur', {
        episode_a_id: Number(this.selectedA),
        episode_b_id: Number(this.selectedB)
      });
    } catch(e) {
      toast('Comparaison impossible', 'error');
      this.result = null;
    } finally {
      this.loading = false;
      this.render();
    }
  },

  _name(row) {
    return row?.label || [row?.prenom, row?.nom].filter(Boolean).join(' ') || row?.nom || row?.titre || '—';
  },

  _chipList(items, getLabel, empty = 'Aucun') {
    if (!items?.length) return `<span class="comparateur-muted">${empty}</span>`;
    return items.map(item => `<span class="comparateur-chip">${this._escape(getLabel(item))}</span>`).join('');
  },

  _sharedBlock(title, data, getLabel, options = {}) {
    const shared = data?.shared || [];
    const onlyA = data?.only_a || [];
    const onlyB = data?.only_b || [];
    return `
      <div class="comparateur-card">
        <div class="comparateur-card-title">
          <span>${title}</span>
          <strong>${shared.length}</strong>
        </div>
        <div class="comparateur-card-body">
          <div class="comparateur-subtitle">En commun</div>
          <div class="comparateur-chip-row">
            ${this._chipList(shared, item => getLabel(item.a || item), options.emptyShared || 'Rien en commun')}
          </div>
          <div class="comparateur-split">
            <div>
              <div class="comparateur-subtitle">${this._escape(this.result.episode_a.code)}</div>
              <div class="comparateur-chip-row is-soft">
                ${this._chipList(onlyA, getLabel, 'Aucun élément unique')}
              </div>
            </div>
            <div>
              <div class="comparateur-subtitle">${this._escape(this.result.episode_b.code)}</div>
              <div class="comparateur-chip-row is-soft">
                ${this._chipList(onlyB, getLabel, 'Aucun élément unique')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderResults() {
    const r = this.result;
    return `
      <div class="comparateur-results">
        <div class="comparateur-hero">
          ${this.renderEpisodeHeader(r.episode_a)}
          <div class="comparateur-score">
            <span>Score miroir</span>
            <strong>${r.score_miroir}</strong>
            <small>/100</small>
          </div>
          ${this.renderEpisodeHeader(r.episode_b)}
        </div>

        <div class="comparateur-grid">
          ${this._sharedBlock('Personnages', r.personnages, row => this._name(row))}
          ${this._sharedBlock('Lieux', r.lieux, row => row.nom || row.nom_affichage || 'Décor')}
          ${this._sharedBlock('Thèmes', r.themes, row => `${row.nom}${row.intensite ? ' · ' + row.intensite : ''}`)}
          ${this.renderWords(r.mots)}
          ${this.renderPromesses(r.promesses)}
          ${this.renderStructure(r.structure)}
          ${this.renderScenes(r.scenes_similaires)}
        </div>
      </div>
    `;
  },

  renderEpisodeHeader(ep) {
    return `
      <div class="comparateur-episode" style="--episode-color:${ep.saison_couleur || 'var(--accent)'}">
        <div class="comparateur-code">${this._escape(ep.code)}</div>
        <div class="comparateur-title">${this._escape(ep.titre || 'Sans titre')}</div>
        <div class="comparateur-mini-stats">
          <span>${ep.stats.nb_scenes || 0} scènes</span>
          <span>${ep.stats.nb_repliques_total || 0} répl.</span>
          <span>${ep.stats.nb_mots || 0} mots</span>
        </div>
      </div>
    `;
  },

  renderWords(words) {
    const shared = words?.shared || [];
    return `
      <div class="comparateur-card">
        <div class="comparateur-card-title">
          <span>Mots fréquents</span>
          <strong>${shared.length}</strong>
        </div>
        <div class="comparateur-card-body">
          <div class="comparateur-word-cloud">
            ${shared.length ? shared.slice(0, 24).map(w => `
              <span title="${w.a} occurrence(s) dans ${this._escape(this.result.episode_a.code)} · ${w.b} dans ${this._escape(this.result.episode_b.code)}">
                ${this._escape(w.mot)}
                <small>${w.total} (${w.a}/${w.b})</small>
              </span>
            `).join('') : '<span class="comparateur-muted">Aucun mot fort partagé</span>'}
          </div>
        </div>
      </div>
    `;
  },

  renderPromesses(promesses) {
    const shared = promesses?.shared || [];
    const onlyA = (promesses?.episode_a || []).filter(p => !shared.some(s => s.id == p.id));
    const onlyB = (promesses?.episode_b || []).filter(p => !shared.some(s => s.id == p.id));
    const renderRows = rows => rows.length ? rows.map(p => `
      <div class="comparateur-promise">
        <strong>${this._escape(p.titre)}</strong>
        <span>${this._escape(p.type_promesse || 'promesse')} · ${this._escape(p.statut || '')}</span>
      </div>
    `).join('') : '<div class="comparateur-muted">Aucune promesse</div>';

    return `
      <div class="comparateur-card comparateur-wide">
        <div class="comparateur-card-title">
          <span>Promesses narratives</span>
          <strong>${shared.length}</strong>
        </div>
        <div class="comparateur-card-body">
          <div class="comparateur-subtitle">En commun</div>
          ${renderRows(shared)}
          <div class="comparateur-split">
            <div>
              <div class="comparateur-subtitle">${this._escape(this.result.episode_a.code)}</div>
              ${renderRows(onlyA)}
            </div>
            <div>
              <div class="comparateur-subtitle">${this._escape(this.result.episode_b.code)}</div>
              ${renderRows(onlyB)}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderStructure(structure) {
    return `
      <div class="comparateur-card comparateur-wide">
        <div class="comparateur-card-title">
          <span>Structure</span>
          <strong>${(structure?.rows || []).filter(r => r.same).length}</strong>
        </div>
        <div class="comparateur-card-body">
          <div class="comparateur-structure">
            ${(structure?.rows || []).map(row => `
              <div class="${row.same ? 'is-same' : ''}">
                <span>${this._escape(row.label)}</span>
                <strong>${this._escape(row.a ?? '—')}</strong>
                <em>${this._escape(row.b ?? '—')}</em>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  },

  renderScenes(scenes) {
    return `
      <div class="comparateur-card comparateur-wide">
        <div class="comparateur-card-title">
          <span>Scènes similaires</span>
          <strong>${scenes?.length || 0}</strong>
        </div>
        <div class="comparateur-card-body">
          ${scenes?.length ? scenes.map(scene => `
            <div class="comparateur-scene">
              <div class="comparateur-scene-score">${scene.score}</div>
              <div>
                <div class="comparateur-scene-line">
                  <strong>${this._escape(this.result.episode_a.code)} · scène ${scene.scene_a.index}</strong>
                  <span>${this._escape(scene.scene_a.lieu_raw || scene.scene_a.slugline || 'Lieu non détecté')}</span>
                </div>
                <div class="comparateur-scene-line">
                  <strong>${this._escape(this.result.episode_b.code)} · scène ${scene.scene_b.index}</strong>
                  <span>${this._escape(scene.scene_b.lieu_raw || scene.scene_b.slugline || 'Lieu non détecté')}</span>
                </div>
                <div class="comparateur-chip-row is-soft">
                  ${this._chipList(scene.shared_personnages || [], x => x, 'Aucun personnage commun')}
                  ${scene.same_lieu_raw ? '<span class="comparateur-chip is-place">Même lieu brut</span>' : ''}
                </div>
              </div>
            </div>
          `).join('') : '<div class="comparateur-muted">Aucune scène miroir évidente détectée.</div>'}
        </div>
      </div>
    `;
  },
};
