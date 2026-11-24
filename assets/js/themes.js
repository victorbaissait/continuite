// assets/js/themes.js


const Themes = {
  data: [],
  episodes: [],
  saisons: [],
  activeTheme: null,
  activeSaisonFilter: null, // null = toutes les saisons
  relationSaisonFilter: null,
  relationSelectedIds: new Set(),
  relationIncludeThemes: false,
  relationThemeIds: new Set(),
  promesses: [],
  promiseSaisonFilter: 'all',
  promiseStatusFilter: 'all',
  expandedThemePromiseEpisodes: new Set(),

  async init() {
    [this.data, this.episodes, this.saisons, this.promesses] = await Promise.all([
      DataStore.get('themes'),
      api.get('episodes'),
      DataStore.get('saisons'),
      api.get('promesses').catch(() => [])
    ]);
    this.ensureRelationDefaults();
    this.render();
  },

  render() {
    const tab = document.getElementById('tab-themes');

    tab.innerHTML = `
      <div class="section-header">
        <div class="section-title">◈ Thèmes</div>
        <div class="section-actions">
          <button class="btn btn-primary" onclick="Themes.openForm(null)">+ Nouveau thème</button>
        </div>
      </div>

      <div class="themes-layout">
        <div class="themes-sidebar">
          <div class="js-style-d067c980">
            ${this.data.length} thèmes
          </div>
          ${this.data.length === 0 ? `
            <div class="empty-state js-style-8cddc29a">
              <div class="empty-icon js-style-2778029a">◈</div>
              <div class="empty-title js-style-9e6595fb">Aucun thème</div>
              <div class="empty-sub">Créez des thèmes récurrents pour les visualiser dans vos épisodes</div>
            </div>
          ` : this.data.map(t => `
            <div class="theme-item ${this.activeTheme?.id === t.id ? 'active' : ''}"
              onclick="Themes.selectTheme(${t.id})">
              <div class="theme-color-dot" style="background:${t.couleur}"></div>
              <span class="theme-name">${this.escape(t.nom)}</span>
              <span class="theme-count">${t.nb_episodes || 0}</span>
              <button class="btn btn-ghost btn-sm btn-icon" onclick="event.stopPropagation();Themes.openForm(${t.id})" title="Modifier">✎</button>
              <button class="btn btn-ghost btn-sm btn-icon js-style-701ab37f" onclick="event.stopPropagation();Themes.confirmDelete(${t.id})" title="Supprimer">✕</button>
            </div>
          `).join('')}
        </div>

        <div class="themes-main">
          ${this.activeTheme ? this.renderThemeDetail() : this.renderMatrix()}
        </div>
      </div>
    `;
  },

  selectTheme(id) {
    this.activeTheme = this.data.find(t => t.id === id) || null;
    this.render();
  },

  setSaisonFilter(saisonId) {
    // saisonId est une string depuis le select, on le convertit ou null
    this.activeSaisonFilter = saisonId === 'all' ? null : parseInt(saisonId);
    this.render();
  },

  renderSaisonFilter() {
    if (this.saisons.length <= 1) return ''; // inutile si une seule saison ou aucune
    return `
      <div>
        <span class="js-style-4bcb7755">Saison :</span>
        <select class="js-style-a51d8bbe"
          onchange="Themes.setSaisonFilter(this.value)"
         
        >
          <option value="all" ${this.activeSaisonFilter === null ? 'selected' : ''}>Toutes les saisons</option>
          ${this.saisons.map(s => `
            <option value="${s.id}" ${this.activeSaisonFilter === s.id ? 'selected' : ''}>
              ${this.escape(s.nom || 'Saison ' + s.numero)}
            </option>
          `).join('')}
        </select>
      </div>
    `;
  },

  renderMatrix() {
    if (!this.data.length || !this.episodes.length) {
      return `
        <div class="empty-state">
          <div class="empty-icon">◈</div>
          <div class="empty-title">Matrice thèmes × épisodes</div>
          <div class="empty-sub">Créez des thèmes et assignez-les aux épisodes pour voir la visualisation ici</div>
        </div>
      `;
    }

    // Grouper par saison, avec filtre éventuel
    const saisonGroups = this.saisons
      .filter(s => this.activeSaisonFilter === null || s.id === this.activeSaisonFilter)
      .map(s => ({
        saison: s,
        episodes: this.episodes.filter(e => e.saison_id == s.id)
      }))
      .filter(g => g.episodes.length);

    return `
      <div class="js-style-f2f1528c">
        Vue globale des thèmes
      </div>
      ${this.renderSaisonFilter()}
      <div class="themes-matrix">
        <table>
          <thead>
            <tr>
              <th>Thème</th>
              ${saisonGroups.map(g =>
                g.episodes.map(ep =>
                  `<th style="writing-mode:vertical-lr;transform:rotate(180deg);height:60px;min-width:28px;font-size:9px;color:${g.saison.couleur}">
                    E${ep.numero_episode}
                  </th>`
                ).join('')
              ).join('')}
            </tr>
          </thead>
          <tbody>
            ${this.data.map(t => `
              <tr>
                <td class="js-style-089ccfb3">
                  <div class="js-style-e3f61041">
                    <div style="width:10px;height:10px;border-radius:50%;background:${t.couleur};flex-shrink:0"></div>
                    ${this.escape(t.nom)}
                  </div>
                </td>
                ${saisonGroups.map(g =>
                  g.episodes.map(ep => {
                    const theme = (ep.themes || []).find(x => x.theme_id == t.id);
                    if (!theme) return `<td><div class="js-style-07fbced7"></div></td>`;
                    const opacities = { 'central': 1, 'fil rouge': 0.6, 'mention': 0.3 };
                    const op = opacities[theme.intensite] || 0.5;
                    return `<td title="${this.escape(ep.titre)} — ${this.escape(theme.intensite)}">
                      <div class="matrix-cell-active" style="background:${t.couleur};opacity:${op}"></div>
                    </td>`;
                  }).join('')
                ).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="js-style-9bbf4d3f">
        <span>Intensité :</span>
        <span class="js-style-ac86ac11">
          <span class="js-style-c80d3592"></span> Central
        </span>
        <span class="js-style-ac86ac11">
          <span class="js-style-4a010680"></span> Fil rouge
        </span>
        <span class="js-style-ac86ac11">
          <span class="js-style-58f78616"></span> Mention
        </span>
      </div>
      ${this.renderRelationsTool()}
      ${this.renderPromisesTool()}
    `;
  },

  ensureRelationDefaults() {
    if (!this.saisons.length || !this.episodes.length) return;
    if (this.relationSaisonFilter === null) {
      this.relationSaisonFilter = this.saisons[0]?.id ?? null;
    }
    const scopeIds = new Set(this.getRelationScopeEpisodes().map(ep => ep.id));
    const hasValidSelection = [...this.relationSelectedIds].some(id => scopeIds.has(id));
    if (!hasValidSelection) {
      this.relationSelectedIds = new Set(scopeIds);
    }
    if (!this.relationThemeIds.size && this.relationIncludeThemes) {
      this.relationThemeIds = new Set(this.data.map(t => t.id));
    }
  },

  getRelationScopeEpisodes() {
    if (this.relationSaisonFilter === 'all') return this.episodes;
    return this.episodes.filter(ep => ep.saison_id == this.relationSaisonFilter);
  },

  getRelationSelectedEpisodes() {
    const scope = this.getRelationScopeEpisodes();
    return scope.filter(ep => this.relationSelectedIds.has(ep.id));
  },

  setRelationSaisonFilter(value) {
    this.relationSaisonFilter = value === 'all' ? 'all' : parseInt(value);
    this.relationSelectedIds = new Set(this.getRelationScopeEpisodes().map(ep => ep.id));
    this.render();
  },

  toggleRelationEpisode(id) {
    if (this.relationSelectedIds.has(id)) this.relationSelectedIds.delete(id);
    else this.relationSelectedIds.add(id);
    this.render();
  },

  selectRelationAll() {
    this.relationSelectedIds = new Set(this.getRelationScopeEpisodes().map(ep => ep.id));
    this.render();
  },

  clearRelationSelection() {
    this.relationSelectedIds.clear();
    this.render();
  },

  selectRelationLinked() {
    const scope = this.getRelationScopeEpisodes();
    const scopeIds = new Set(scope.map(ep => ep.id));
    const linkedIds = new Set();
    for (const link of this.buildEpisodeRelations(scope, true)) {
      if (scopeIds.has(link.source.id)) linkedIds.add(link.source.id);
      if (scopeIds.has(link.target.id)) linkedIds.add(link.target.id);
    }
    this.relationSelectedIds = linkedIds;
    this.render();
  },

  setRelationIncludeThemes(checked) {
    this.relationIncludeThemes = !!checked;
    if (this.relationIncludeThemes && !this.relationThemeIds.size) {
      this.relationThemeIds = new Set(this.data.map(t => t.id));
    }
    this.render();
  },

  toggleRelationTheme(id) {
    if (this.relationThemeIds.has(id)) this.relationThemeIds.delete(id);
    else this.relationThemeIds.add(id);
    this.render();
  },

  selectAllRelationThemes() {
    this.relationThemeIds = new Set(this.data.map(t => t.id));
    this.render();
  },

  clearRelationThemes() {
    this.relationThemeIds.clear();
    this.render();
  },

  relationTypeMeta(type, niveau = '') {
    const map = {
      flashback:    { label: 'Flashback',    color: '#67cbac' },
      flashforward: { label: 'Flashforward', color: '#ffb86b' },
      reference:    { label: 'Référence',    color: '#87a5ff' },
      mention:      { label: niveau ? `Mention ${niveau}` : 'Mention', color: '#e277ff' },
      theme:        { label: niveau ? `Thème · ${niveau}` : 'Thème partagé', color: '#ffe082' },
    };
    return map[type] || { label: type || 'Lien', color: '#888' };
  },

  episodeCode(ep) {
    return `S${ep.saison_numero}E${String(ep.numero_episode).padStart(2, '0')}`;
  },

  buildEpisodeRelations(episodes, includeOutsideTargets = false, includeThemes = this.relationIncludeThemes) {
    const selectedIds = new Set(episodes.map(ep => ep.id));
    const byId = new Map(this.episodes.map(ep => [ep.id, ep]));
    const allowedThemeIds = new Set([...this.relationThemeIds].map(String));
    const relations = [];
    const seen = new Set();

    for (const ep of episodes) {
      for (const lien of (ep.liens || [])) {
        const targetId = parseInt(lien.episode_lie_id);
        const target = byId.get(targetId);
        if (!target) continue;
        if (!includeOutsideTargets && !selectedIds.has(targetId)) continue;
        const key = `${ep.id}:${targetId}:${lien.type_lien || 'reference'}`;
        if (seen.has(key)) continue;
        seen.add(key);
        relations.push({
          source: ep,
          target,
          type: lien.type_lien || 'reference',
          niveau: '',
        });
      }
      for (const mention of (ep.mentions || [])) {
        const targetId = parseInt(mention.episode_mentionne_id);
        const target = byId.get(targetId);
        if (!target) continue;
        if (!includeOutsideTargets && !selectedIds.has(targetId)) continue;
        const key = `${ep.id}:${targetId}:mention:${mention.niveau || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        relations.push({
          source: ep,
          target,
          type: 'mention',
          niveau: mention.niveau || 'mineure',
        });
      }
    }

    if (includeThemes && allowedThemeIds.size) {
      for (let i = 0; i < episodes.length; i++) {
        for (let j = i + 1; j < episodes.length; j++) {
          const source = episodes[i];
          const target = episodes[j];
          const sourceThemes = new Map(
            (source.themes || [])
              .filter(t => allowedThemeIds.has(String(t.theme_id || t.id)))
              .map(t => [String(t.theme_id || t.id), t])
          );
          const shared = (target.themes || [])
            .filter(t => allowedThemeIds.has(String(t.theme_id || t.id)))
            .filter(t => sourceThemes.has(String(t.theme_id || t.id)));
          if (!shared.length) continue;

          const names = shared.map(t => t.theme_nom || t.nom).filter(Boolean);
          const key = `${source.id}:${target.id}:theme:${names.join('|')}`;
          if (seen.has(key)) continue;
          seen.add(key);
          relations.push({
            source,
            target,
            type: 'theme',
            niveau: names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', '),
            color: shared[0]?.couleur || this.data.find(t => t.id == (shared[0]?.theme_id || shared[0]?.id))?.couleur || '#ffe082',
            sharedThemes: shared,
          });
        }
      }
    }

    return relations.sort((a, b) => {
      if (a.source.saison_numero !== b.source.saison_numero) return a.source.saison_numero - b.source.saison_numero;
      if (a.source.numero_episode !== b.source.numero_episode) return a.source.numero_episode - b.source.numero_episode;
      return a.target.numero_episode - b.target.numero_episode;
    });
  },

  renderRelationsTool() {
    this.ensureRelationDefaults();
    const scope = this.getRelationScopeEpisodes();
    const selectedEpisodes = this.getRelationSelectedEpisodes();
    const relations = this.buildEpisodeRelations(selectedEpisodes);
    const linkedInScope = new Set();
    for (const link of this.buildEpisodeRelations(scope, true)) {
      linkedInScope.add(link.source.id);
      linkedInScope.add(link.target.id);
    }

    return `
      <div class="theme-relations-panel">
        <div class="theme-relations-head">
          <div>
            <div class="theme-relations-title">Carte des liens narratifs</div>
            <div class="theme-relations-sub">
              Les arcs montrent les flashbacks, références et mentions entre épisodes. Les thèmes partagés peuvent être ajoutés à la demande pour explorer les résonances thématiques.
            </div>
          </div>
        </div>

        <div class="theme-relations-controls">
          <span class="js-style-c6b2355d">Périmètre :</span>
          <select class="theme-relations-select" onchange="Themes.setRelationSaisonFilter(this.value)">
            <option value="all" ${this.relationSaisonFilter === 'all' ? 'selected' : ''}>Toutes les saisons</option>
            ${this.saisons.map(s => `
              <option value="${s.id}" ${this.relationSaisonFilter == s.id ? 'selected' : ''}>${this.escape(s.nom || 'Saison ' + s.numero)}</option>
            `).join('')}
          </select>
          <button class="btn btn-ghost btn-sm" onclick="Themes.selectRelationAll()">Tout sélectionner</button>
          <button class="btn btn-ghost btn-sm" onclick="Themes.selectRelationLinked()">Épisodes liés seulement</button>
          <button class="btn btn-ghost btn-sm" onclick="Themes.clearRelationSelection()">Vider</button>
          <span class="js-style-afd51779">${selectedEpisodes.length}/${scope.length} épisode(s) · ${relations.length} lien(s)</span>
        </div>

        <div class="theme-relations-controls js-style-2e414c65">
          <label class="js-style-d596b8bf">
            <input class="js-style-b7d73195" type="checkbox" ${this.relationIncludeThemes ? 'checked' : ''} onchange="Themes.setRelationIncludeThemes(this.checked)">
            Inclure les liens par thèmes
          </label>
          ${this.relationIncludeThemes ? `
            <button class="btn btn-ghost btn-sm" onclick="Themes.selectAllRelationThemes()">Tous les thèmes</button>
            <button class="btn btn-ghost btn-sm" onclick="Themes.clearRelationThemes()">Aucun thème</button>
          ` : ''}
        </div>

        ${this.relationIncludeThemes ? `
          <div class="theme-rel-theme-list">
            ${this.data.map(t => `
              <button class="theme-rel-theme-chip ${this.relationThemeIds.has(t.id) ? 'selected' : ''}"
                onclick="Themes.toggleRelationTheme(${t.id})"
                style="border-color:${t.couleur};${this.relationThemeIds.has(t.id) ? `color:${t.couleur}` : ''}">
                ${this.escape(t.nom)}
              </button>
            `).join('')}
          </div>
        ` : ''}

        <div class="theme-rel-episode-list">
          ${scope.map(ep => {
            const selected = this.relationSelectedIds.has(ep.id);
            const hasLink = linkedInScope.has(ep.id);
            const saison = this.saisons.find(s => s.id == ep.saison_id);
            const saisonColor = saison?.couleur || 'var(--border2)';
            return `
              <button class="theme-rel-ep-chip ${selected ? 'selected' : ''} ${hasLink ? 'has-link' : ''}"
                onclick="Themes.toggleRelationEpisode(${ep.id})"
                title="${this.escape(ep.titre || '')}"
                style="border-color:${saisonColor};${selected ? `color:${saisonColor}` : ''}">
                ${this.episodeCode(ep)}
              </button>
            `;
          }).join('')}
        </div>

        ${this.renderRelationsGraph(selectedEpisodes, relations)}
        ${this.renderRelationsList(relations)}
      </div>
    `;
  },

  renderRelationsGraph(episodes, relations) {
    if (!episodes.length) {
      return `<div class="empty-state js-style-91079974">
        <div class="empty-icon">⊶</div>
        <div class="empty-title">Aucun épisode sélectionné</div>
        <div class="empty-sub">Choisissez une saison ou cochez quelques épisodes pour afficher leurs liens.</div>
      </div>`;
    }

    const width = Math.max(760, episodes.length * 44);
    const pad = 34;
    const usable = width - pad * 2;
    const byId = new Map(episodes.map((ep, idx) => [
      ep.id,
      episodes.length === 1 ? width / 2 : pad + (usable * idx / (episodes.length - 1))
    ]));

    const paths = relations.map((rel, idx) => {
      const x1 = byId.get(rel.source.id);
      const x2 = byId.get(rel.target.id);
      if (x1 === undefined || x2 === undefined) return '';
      const dist = Math.abs(x2 - x1);
      const lift = Math.min(98, 28 + dist * 0.18 + (idx % 4) * 8);
      const y = 118;
      const cY = y - lift;
      const meta = this.relationTypeMeta(rel.type, rel.niveau);
      const color = rel.color || meta.color;
      const strokeDash = rel.type === 'mention' || rel.type === 'theme' ? 'stroke-dasharray="4 4"' : '';
      return `<path d="M ${x1.toFixed(1)} ${y} C ${x1.toFixed(1)} ${cY.toFixed(1)}, ${x2.toFixed(1)} ${cY.toFixed(1)}, ${x2.toFixed(1)} ${y}"
        fill="none" stroke="${color}" stroke-width="2" opacity=".82" ${strokeDash} marker-end="url(#theme-rel-arrow-${this.escape(rel.type)})">
        <title>${this.escape(this.episodeCode(rel.source))} → ${this.escape(this.episodeCode(rel.target))} · ${this.escape(meta.label)}</title>
      </path>`;
    }).join('');

    return `
      <div class="theme-rel-graph-wrap">
        <div class="theme-rel-graph" style="width:${width}px">
          <svg viewBox="0 0 ${width} 148" preserveAspectRatio="none">
            <defs>
              ${['theme','flashback','flashforward','reference','mention'].map(type => {
                const meta = this.relationTypeMeta(type);
                return `<marker id="theme-rel-arrow-${type}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M 0 0 L 8 4 L 0 8 z" fill="${meta.color}"></path>
                </marker>`;
              }).join('')}
            </defs>
            <line x1="${pad}" y1="118" x2="${width - pad}" y2="118" stroke="var(--border)" stroke-width="1"></line>
            ${paths}
          </svg>
          ${episodes.map(ep => `
            <div class="theme-rel-node" style="left:${byId.get(ep.id)}px" onclick="Episodes.openDetail(${ep.id})" title="${this.escape(ep.titre || '')}">
              <div class="theme-rel-node-dot" style="background:${this.saisons.find(s => s.id == ep.saison_id)?.couleur || 'var(--accent)'}"></div>
              <div class="theme-rel-node-label">${this.episodeCode(ep)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  renderRelationsList(relations) {
    if (!relations.length) {
      return `<div class="js-style-0f5e4c17">
        Aucun lien direct trouvé dans cette sélection. Les liens hors sélection sont masqués pour garder la lecture nette.
      </div>`;
    }

    return `
      <div class="theme-rel-list">
        ${relations.map(rel => {
          const meta = this.relationTypeMeta(rel.type, rel.niveau);
          const color = rel.color || meta.color;
          const detail = rel.type === 'theme'
            ? (rel.sharedThemes || []).map(t => t.theme_nom || t.nom).filter(Boolean).join(', ')
            : (rel.target.titre || '');
          return `
            <div class="theme-rel-card">
              <span class="js-style-30fecb60">${this.episodeCode(rel.source)}</span>
              <span class="js-style-50197c32">→</span>
              <span class="js-style-30fecb60">${this.episodeCode(rel.target)}</span>
              <span class="theme-rel-type" style="background:${color}">${this.escape(meta.label)}</span>
              <span class="js-style-d26267bd">${this.escape(detail)}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  promiseStatusMeta(status) {
    const map = {
      ouverte: { label: 'Ouverte', color: '#ffe082' },
      veille: { label: 'À surveiller', color: '#87a5ff' },
      payee: { label: 'Payée', color: '#7ecdb3' },
      oubliee: { label: 'Oubliée', color: '#ff7676' },
    };
    return map[status] || map.ouverte;
  },

  promiseTypeMeta(type) {
    const map = {
      objet: { label: 'Objet', color: '#ffb86b' },
      conflit: { label: 'Conflit', color: '#ff7676' },
      info: { label: 'Info cachée', color: '#87a5ff' },
      relation: { label: 'Relation', color: '#e277ff' },
      theme: { label: 'Thème', color: '#ffe082' },
      gag: { label: 'Running gag', color: '#7ecdb3' },
      autre: { label: 'Autre', color: '#aaa' },
    };
    return map[type] || map.autre;
  },

  promiseThemeLinkMeta(type) {
    const map = {
      lie: { label: 'Lié au thème', short: 'lié' },
      theme_meme: { label: 'C’est le thème lui-même', short: 'thème' },
    };
    return map[type] || map.lie;
  },

  setPromiseSaisonFilter(value) {
    this.promiseSaisonFilter = value;
    this.render();
  },

  setPromiseStatusFilter(value) {
    this.promiseStatusFilter = value;
    this.render();
  },

  filteredPromises() {
    return (this.promesses || []).filter(p => {
      const saisonOk = this.promiseSaisonFilter === 'all' || String(p.source_saison_id) === String(this.promiseSaisonFilter);
      const statusOk = this.promiseStatusFilter === 'all' || p.statut === this.promiseStatusFilter;
      return saisonOk && statusOk;
    });
  },

  renderPromisesTool() {
    const rows = this.filteredPromises();
    const statuses = ['ouverte', 'veille', 'payee', 'oubliee'];
    const visibleStatuses = this.promiseStatusFilter === 'all' ? statuses : [this.promiseStatusFilter];
    const stats = statuses.reduce((acc, key) => {
      acc[key] = (this.promesses || []).filter(p => p.statut === key).length;
      return acc;
    }, {});

    return `
      <div class="theme-promises-panel">
        <div class="theme-relations-head">
          <div>
            <div class="theme-relations-title">Carte des promesses narratives</div>
            <div class="theme-relations-sub">
              Note ce qu'un épisode lance dans la tête du spectateur : objet important, conflit, information cachée, gag, relation. Puis indique si la promesse est payée, encore ouverte ou oubliée.
            </div>
          </div>
          <button class="btn btn-primary" onclick="Themes.openPromiseForm(null)">+ Nouvelle promesse</button>
        </div>

        <div class="theme-promises-toolbar">
          <span class="js-style-c6b2355d">Périmètre :</span>
          <select class="theme-relations-select" onchange="Themes.setPromiseSaisonFilter(this.value)">
            <option value="all" ${this.promiseSaisonFilter === 'all' ? 'selected' : ''}>Toutes les saisons</option>
            ${this.saisons.map(s => `
              <option value="${s.id}" ${String(this.promiseSaisonFilter) === String(s.id) ? 'selected' : ''}>${this.escape(s.nom || 'Saison ' + s.numero)}</option>
            `).join('')}
          </select>
          <select class="theme-relations-select" onchange="Themes.setPromiseStatusFilter(this.value)">
            <option value="all" ${this.promiseStatusFilter === 'all' ? 'selected' : ''}>Tous les statuts</option>
            ${statuses.map(status => {
              const meta = this.promiseStatusMeta(status);
              return `<option value="${status}" ${this.promiseStatusFilter === status ? 'selected' : ''}>${meta.label}</option>`;
            }).join('')}
          </select>
          <span class="js-style-afd51779">${rows.length}/${(this.promesses || []).length} promesse(s)</span>
        </div>

        <div class="theme-promise-stats">
          ${statuses.map(status => {
            const meta = this.promiseStatusMeta(status);
            return `<span class="theme-promise-stat" style="border-color:${meta.color};color:${meta.color}">${meta.label} · ${stats[status] || 0}</span>`;
          }).join('')}
        </div>

        ${rows.length ? `
          <div class="theme-promise-board">
            ${visibleStatuses.map(status => this.renderPromiseColumn(status, rows.filter(p => p.statut === status))).join('')}
          </div>
        ` : `
          <div class="empty-state js-style-c5b9a6e8">
            <div class="empty-icon">◇</div>
            <div class="empty-title">Aucune promesse narrative</div>
            <div class="empty-sub">Ajoute une promesse pour suivre ce qui est lancé, payé ou laissé en suspens.</div>
            <button class="btn btn-primary js-style-88b9d5c6" onclick="Themes.openPromiseForm(null)">+ Nouvelle promesse</button>
          </div>
        `}
      </div>
    `;
  },

  renderPromiseColumn(status, rows) {
    const meta = this.promiseStatusMeta(status);
    return `
      <div class="theme-promise-column">
        <div class="theme-promise-column-head">
          <span>${meta.label}</span>
          <span style="color:${meta.color}">${rows.length}</span>
        </div>
        ${rows.map(p => this.renderPromiseCard(p)).join('') || `
          <div class="js-style-e6989cd9">
            Rien ici pour l'instant.
          </div>
        `}
      </div>
    `;
  },

  renderPromiseCard(p) {
    const status = this.promiseStatusMeta(p.statut);
    const type = this.promiseTypeMeta(p.type_promesse);
    const sourceCode = this.promiseEpisodeCode(p, 'source');
    const resolutionCode = this.promiseEpisodeCode(p, 'resolution');
    const themeLink = p.theme_id ? this.promiseThemeLinkMeta(p.theme_lien_type) : null;
    const jalons = p.episodes_jalons || [];
    return `
      <article class="theme-promise-card" style="border-left-color:${status.color}">
        <div class="theme-promise-card-top">
          <span class="theme-promise-badge" style="background:${type.color}">${this.escape(type.label)}</span>
          <span class="theme-promise-badge" style="background:${status.color}">${this.escape(status.label)}</span>
          ${themeLink ? `
            <span class="theme-promise-theme-link" style="border-color:${p.theme_couleur || 'var(--border2)'};color:${p.theme_couleur || 'var(--text2)'}">
              ${this.escape(themeLink.short)} · ${this.escape(p.theme_nom || 'Thème')}
            </span>
          ` : ''}
          <div class="theme-promise-actions">
            <button class="btn btn-ghost btn-sm btn-icon" onclick="Themes.openPromiseForm(${p.id})" title="Modifier">✎</button>
            <button class="btn btn-ghost btn-sm btn-icon js-style-701ab37f" onclick="Themes.confirmDeletePromise(${p.id})" title="Supprimer">✕</button>
          </div>
        </div>
        <div class="theme-promise-title">${this.escape(p.titre || 'Promesse sans titre')}</div>
        ${p.description ? `<div class="theme-promise-desc">${this.escape(p.description)}</div>` : ''}
        <div class="theme-promise-route">
          <span>Lancée</span>
          <span class="theme-promise-ep" onclick="Episodes.openDetail(${Number(p.episode_source_id)})">${this.escape(sourceCode)}</span>
          ${p.episode_resolution_id ? `
            <span>→ payée</span>
            <span class="theme-promise-ep" onclick="Episodes.openDetail(${Number(p.episode_resolution_id)})">${this.escape(resolutionCode)}</span>
          ` : `
            <span>→ pas encore payée</span>
          `}
        </div>
        ${p.resolution ? `<div class="theme-promise-desc js-style-d6c79782">Résolution : ${this.escape(p.resolution)}</div>` : ''}
        ${jalons.length ? `
          <div class="theme-promise-mini-jalons">
            ${jalons.slice(0, 3).map(j => `
              <div>
                <span class="theme-promise-mini-jalon-code">${this.escape(this.promiseJalonCode(j))}</span>
                ${j.explication ? `· ${this.escape(j.explication)}` : '· fait avancer la promesse'}
              </div>
            `).join('')}
            ${jalons.length > 3 ? `<div>+ ${jalons.length - 3} autre(s) épisode(s)</div>` : ''}
          </div>
        ` : ''}
      </article>
    `;
  },

  promiseEpisodeCode(p, prefix) {
    const saison = p[`${prefix}_saison_numero`];
    const numero = p[`${prefix}_numero_episode`];
    if (saison && numero) return `S${saison}E${String(numero).padStart(2, '0')}`;
    const id = p[`${prefix === 'source' ? 'episode_source' : 'episode_resolution'}_id`];
    const ep = this.episodes.find(e => e.id == id);
    return ep ? this.episodeCode(ep) : 'Épisode ?';
  },

  promiseJalonCode(jalon) {
    const saison = jalon.saison_numero;
    const numero = jalon.numero_episode;
    if (saison && numero) return `S${saison}E${String(numero).padStart(2, '0')}`;
    const ep = this.episodes.find(e => e.id == jalon.episode_id);
    return ep ? this.episodeCode(ep) : 'Épisode ?';
  },

  episodeOptions(selectedId = null, allowEmpty = false, emptyLabel = 'Aucun / pas encore payé') {
    return `
      ${allowEmpty ? `<option value="">${this.escape(emptyLabel)}</option>` : ''}
      ${this.episodes.map(ep => `
        <option value="${ep.id}" ${String(selectedId || '') === String(ep.id) ? 'selected' : ''}>
          ${this.escape(this.episodeCode(ep))} · ${this.escape(ep.titre || 'Sans titre')}
        </option>
      `).join('')}
    `;
  },

  promiseJalonRow(rowId, episodeId = '', explication = '', decisif = false) {
    return `
      <div class="theme-promise-jalon-row" data-row="${rowId}">
        <select class="promise-jalon-episode">
          ${this.episodeOptions(episodeId, true, 'Choisir un épisode')}
        </select>
        <label class="theme-promise-decisif-toggle">
          <input class="promise-jalon-decisif" type="checkbox" ${decisif ? 'checked' : ''}>
          Épisode décisif
        </label>
        <textarea class="promise-jalon-explication" placeholder="Pourquoi cet épisode est là ? Qu'est-ce qu'il fait avancer ?">${this.escape(explication || '')}</textarea>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="Themes.removePromiseJalonRow('${rowId}')" title="Retirer">✕</button>
      </div>
    `;
  },

  addPromiseJalonRow(episodeId = '', explication = '', decisif = false) {
    const wrap = document.getElementById('promise-jalons');
    if (!wrap) return;
    const rowId = `jalon-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    wrap.insertAdjacentHTML('beforeend', this.promiseJalonRow(rowId, episodeId, explication, decisif));
  },

  removePromiseJalonRow(rowId) {
    document.querySelector(`.theme-promise-jalon-row[data-row="${rowId}"]`)?.remove();
  },

  collectPromiseJalons() {
    return [...document.querySelectorAll('.theme-promise-jalon-row')].map(row => {
      const episodeId = parseInt(row.querySelector('.promise-jalon-episode')?.value || '0', 10);
      const explication = row.querySelector('.promise-jalon-explication')?.value.trim() || '';
      const estDecisif = row.querySelector('.promise-jalon-decisif')?.checked ? 1 : 0;
      return { episode_id: episodeId, explication, est_decisif: estDecisif };
    }).filter(item => item.episode_id);
  },

  openPromiseForm(id) {
    const p = id ? (this.promesses || []).find(x => x.id == id) : {};
    const isNew = !id;
    const statuses = ['ouverte', 'veille', 'payee', 'oubliee'];
    const types = ['objet', 'conflit', 'info', 'relation', 'theme', 'gag', 'autre'];
    const jalons = p?.episodes_jalons || [];

    modal.open(`
      <div class="modal-title">${isNew ? '+ Nouvelle promesse narrative' : '✎ Modifier la promesse'}</div>
      <div class="form-grid cols1">
        <div class="form-group">
          <label>Épisode qui lance la promesse *</label>
          <select id="promise-source">${this.episodeOptions(p?.episode_source_id, false)}</select>
        </div>
        <div class="form-group">
          <label>Épisodes qui font avancer la promesse</label>
          <div class="js-style-30447459">
            Ajoute ici les épisodes qui ne paient pas forcément la promesse, mais la nourrissent, la déplacent ou la rendent plus visible.
          </div>
          <div id="promise-jalons" class="theme-promise-jalons">
            ${jalons.map((j, idx) => this.promiseJalonRow(`existing-${idx}`, j.episode_id, j.explication, Number(j.est_decisif) === 1)).join('')}
          </div>
          <button class="btn btn-ghost btn-sm js-style-b1ecc496" onclick="Themes.addPromiseJalonRow()">+ Ajouter un épisode</button>
        </div>
        <div class="form-group">
          <label>Promesse *</label>
          <input type="text" id="promise-title" value="${this.escape(p?.titre || '')}" placeholder="Ex: la clé du grenier doit servir">
        </div>
        <div class="js-style-adf555b3">
          <div class="form-group">
            <label>Type</label>
            <select id="promise-type">
              ${types.map(type => {
                const meta = this.promiseTypeMeta(type);
                return `<option value="${type}" ${((p?.type_promesse || 'objet') === type) ? 'selected' : ''}>${meta.label}</option>`;
              }).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Statut</label>
            <select id="promise-status">
              ${statuses.map(status => {
                const meta = this.promiseStatusMeta(status);
                return `<option value="${status}" ${((p?.statut || 'ouverte') === status) ? 'selected' : ''}>${meta.label}</option>`;
              }).join('')}
            </select>
          </div>
        </div>
        <div class="js-style-adf555b3">
          <div class="form-group">
            <label>Lien avec un thème</label>
            <select id="promise-theme-id">
              <option value="">Aucun thème lié</option>
              ${this.data.map(t => `
                <option value="${t.id}" ${String(p?.theme_id || '') === String(t.id) ? 'selected' : ''}>${this.escape(t.nom)}</option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Nature du lien</label>
            <select id="promise-theme-link-type">
              <option value="lie" ${(p?.theme_lien_type || 'lie') === 'lie' ? 'selected' : ''}>Lié au thème</option>
              <option value="theme_meme" ${p?.theme_lien_type === 'theme_meme' ? 'selected' : ''}>C’est le thème lui-même</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Épisode où c'est payé</label>
          <select id="promise-resolution-episode">${this.episodeOptions(p?.episode_resolution_id, true)}</select>
        </div>
        <div class="form-group">
          <label>Ce qui est lancé</label>
          <textarea id="promise-description" placeholder="Pourquoi le spectateur garde ça en tête ?">${this.escape(p?.description || '')}</textarea>
        </div>
        <div class="form-group">
          <label>Résolution / commentaire</label>
          <textarea id="promise-resolution" placeholder="Comment c'est payé, ou pourquoi c'est encore ouvert / oublié.">${this.escape(p?.resolution || '')}</textarea>
        </div>
      </div>
      <div class="js-style-4f8eb24e">
        <button class="btn btn-ghost" onclick="modal.close()">Annuler</button>
        <button class="btn btn-primary" onclick="Themes.savePromise(${id || 'null'})">${isNew ? 'Créer' : 'Enregistrer'}</button>
      </div>
    `);
  },

  async savePromise(id) {
    const titre = document.getElementById('promise-title').value.trim();
    if (!titre) { toast('La promesse est requise', 'error'); return; }
    const sourceId = parseInt(document.getElementById('promise-source').value, 10);
    if (!sourceId) { toast("L'épisode source est requis", 'error'); return; }
    const resolutionId = document.getElementById('promise-resolution-episode').value;
    const data = {
      episode_source_id: sourceId,
      episode_resolution_id: resolutionId ? parseInt(resolutionId, 10) : null,
      theme_id: document.getElementById('promise-theme-id').value ? parseInt(document.getElementById('promise-theme-id').value, 10) : null,
      theme_lien_type: document.getElementById('promise-theme-link-type').value,
      titre,
      type_promesse: document.getElementById('promise-type').value,
      statut: document.getElementById('promise-status').value,
      description: document.getElementById('promise-description').value.trim(),
      resolution: document.getElementById('promise-resolution').value.trim(),
      episodes_jalons: this.collectPromiseJalons(),
    };

    if (id) {
      await api.put(`promesses/${id}`, data);
      toast('Promesse mise à jour', 'success');
    } else {
      await api.post('promesses', data);
      toast('Promesse créée', 'success');
    }
    modal.close();
    await this.init();
  },

  async confirmDeletePromise(id) {
    if (!confirm('Supprimer cette promesse narrative ?')) return;
    await api.delete(`promesses/${id}`);
    toast('Promesse supprimée', 'info');
    await this.init();
  },

  themePromiseEpisodeNotes(themeId) {
    const notes = new Map();
    const add = (episodeId, note) => {
      if (!episodeId) return;
      const key = Number(episodeId);
      if (!notes.has(key)) notes.set(key, []);
      notes.get(key).push(note);
    };

    for (const p of (this.promesses || [])) {
      if (String(p.theme_id || '') !== String(themeId)) continue;
      if ((p.theme_lien_type || 'lie') !== 'theme_meme') continue;
      const status = this.promiseStatusMeta(p.statut);
      const type = this.promiseTypeMeta(p.type_promesse);

      add(p.episode_source_id, {
        promesse: p.titre,
        role: 'Lance le thème',
        explication: p.description || 'Cet épisode pose la promesse comme matière centrale du thème.',
        color: status.color,
        type: type.label,
        statut: status.label,
      });

      for (const jalon of (p.episodes_jalons || [])) {
        add(jalon.episode_id, {
          promesse: p.titre,
          role: 'Fait avancer',
          explication: jalon.explication || 'Cet épisode fait progresser la promesse liée au thème.',
          decisif: Number(jalon.est_decisif) === 1,
          color: status.color,
          type: type.label,
          statut: status.label,
        });
      }

      if (p.episode_resolution_id) {
        add(p.episode_resolution_id, {
          promesse: p.titre,
          role: 'Paie / résout',
          explication: p.resolution || 'Cet épisode paie ou referme la promesse liée au thème.',
          color: status.color,
          type: type.label,
          statut: status.label,
        });
      }
    }

    return notes;
  },

  toggleThemePromiseEpisode(themeId, episodeId) {
    const key = `${themeId}:${episodeId}`;
    if (this.expandedThemePromiseEpisodes.has(key)) this.expandedThemePromiseEpisodes.delete(key);
    else this.expandedThemePromiseEpisodes.add(key);
    this.render();
  },

  renderThemeEpisodePromiseBubble(notes) {
    return `
      <div class="theme-episode-note-bubble">
        ${notes.map(note => `
          <div class="js-style-af3fee87">
            <div class="theme-episode-note-title">${this.escape(note.promesse || 'Promesse narrative')}</div>
            <div class="js-style-c20ffa86">
              <span class="theme-promise-badge" style="background:${note.color || 'var(--accent)'}">${this.escape(note.role || 'Rôle')}</span>
              <span class="js-style-88fa62b8">${this.escape(note.type || '')} · ${this.escape(note.statut || '')}</span>
            </div>
            ${note.decisif ? `<div class="theme-episode-decisif-cartouche">Épisode décisif</div>` : ''}
            <div>${this.escape(note.explication || '')}</div>
          </div>
        `).join('')}
        <div class="js-style-1d0ec61f">Clique à nouveau sur l'épisode pour fermer.</div>
      </div>
    `;
  },

  renderThemeDetail() {
    const t = this.activeTheme;
    const promiseNotesByEpisode = this.themePromiseEpisodeNotes(t.id);

    // Grouper par saison, avec filtre éventuel
    const saisonGroups = this.saisons
      .filter(s => this.activeSaisonFilter === null || s.id === this.activeSaisonFilter)
      .map(s => ({
        saison: s,
        episodes: this.episodes.filter(e => e.saison_id == s.id)
      }))
      .filter(g => g.episodes.length);

    // Trouver les épisodes qui ont ce thème, ou qui incarnent une promesse marquée "thème lui-même".
    const episodesAvecTheme = this.episodes.filter(ep =>
      (this.activeSaisonFilter === null || ep.saison_id === this.activeSaisonFilter) &&
      ((ep.themes || []).some(x => x.theme_id == t.id) || promiseNotesByEpisode.has(Number(ep.id)))
    );

    return `
      <div class="js-style-95a97af0">
        <div style="width:20px;height:20px;border-radius:50%;background:${t.couleur}"></div>
        <div class="js-style-afbc88e3">${this.escape(t.nom)}</div>
        <button class="btn btn-ghost btn-sm" onclick="Themes.activeTheme=null;Themes.render()">← Retour</button>
      </div>

      ${t.description ? `<p class="js-style-02ce57b3">${this.escape(t.description)}</p>` : ''}

      ${this.renderSaisonFilter()}

      <div class="js-style-9d63b669">
        Timeline — ${episodesAvecTheme.length} épisode(s)
      </div>

      <div class="theme-timeline">
        ${saisonGroups.map(g => `
          <div class="timeline-saison">
            <div class="timeline-saison-label" style="color:${g.saison.couleur}">${this.escape(g.saison.nom || 'Saison ' + g.saison.numero)}</div>
            <div class="timeline-episodes-row">
              ${g.episodes.map(ep => {
                const theme = (ep.themes || []).find(x => x.theme_id == t.id);
                const hasTheme = !!theme;
                const hasPromiseNote = promiseNotesByEpisode.has(Number(ep.id));
                return `
                  <div class="timeline-ep-dot ${hasTheme || hasPromiseNote ? 'has-theme intensite-' + this.escape((theme?.intensite || 'fil-rouge').replace(' ','-')) : 'no-theme'}"
                    style="${hasTheme ? 'background:' + t.couleur + ';border-color:' + t.couleur : hasPromiseNote ? 'background:transparent;border-color:' + t.couleur + ';box-shadow:inset 0 0 0 1px ' + t.couleur : ''}"
                    title="${this.escape(ep.titre || 'E' + ep.numero_episode)}${hasTheme ? ' — ' + this.escape(theme.intensite) : hasPromiseNote ? ' — promesse du thème' : ' — absent'}">
                    ${ep.numero_episode}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>

      <hr class="divider">
      <div class="js-style-9d63b669">
        Détail par épisode
      </div>
      ${episodesAvecTheme.length === 0 ? `<div class="js-style-89d67ef7">Ce thème n'est assigné à aucun épisode.</div>` :
        episodesAvecTheme.map(ep => {
          const theme = (ep.themes || []).find(x => x.theme_id == t.id);
          const saison = this.saisons.find(s => s.id == ep.saison_id);
          const notes = promiseNotesByEpisode.get(Number(ep.id)) || [];
          const key = `${t.id}:${ep.id}`;
          const clickAttr = notes.length ? `onclick="Themes.toggleThemePromiseEpisode(${t.id}, ${ep.id})"` : '';
          return `
            <div class="theme-episode-detail-row ${notes.length ? 'has-promise' : ''}" ${clickAttr}>
              <span style="font-size:11px;color:${saison?.couleur || 'var(--text3)'};min-width:50px">S${ep.saison_numero}E${String(ep.numero_episode).padStart(2,'0')}</span>
              <span class="js-style-332b0810">${this.escape(ep.titre || 'Sans titre')}</span>
              ${theme ? `<span class="theme-chip" style="background:${t.couleur};font-size:10px">${this.escape(theme.intensite || '')}</span>` : ''}
              ${notes.length ? `<span class="theme-promise-theme-link" style="border-color:${t.couleur};color:${t.couleur}">${notes.length} explication${notes.length > 1 ? 's' : ''}</span>` : ''}
            </div>
            ${notes.length && this.expandedThemePromiseEpisodes.has(key) ? this.renderThemeEpisodePromiseBubble(notes) : ''}
          `;
        }).join('')
      }
    `;
  },

  openForm(id) {
    const t = id ? this.data.find(x => x.id == id) : {};
    const isNew = !id;

    modal.open(`
      <div class="modal-title">${isNew ? '+ Nouveau thème' : '✎ Modifier ' + this.escape(t?.nom)}</div>
      <div class="form-grid cols1">
        <div class="form-group">
          <label>Nom du thème *</label>
          <input type="text" id="tf-nom" value="${this.escape(t?.nom || '')}" placeholder="Ex: Famille, Travail, Amour…">
        </div>
        <div class="form-group">
          <label>Couleur</label>
          <input type="color" id="tf-couleur" value="${t?.couleur || '#ff6b6b'}">
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea id="tf-desc">${this.escape(t?.description || '')}</textarea>
        </div>
      </div>
      <div class="js-style-4f8eb24e">
        <button class="btn btn-ghost" onclick="modal.close()">Annuler</button>
        <button class="btn btn-primary" onclick="Themes.save(${id || 'null'})">${isNew ? 'Créer' : 'Enregistrer'}</button>
      </div>
    `);
  },

  async save(id) {
    const nom = document.getElementById('tf-nom').value.trim();
    if (!nom) { toast('Le nom est requis', 'error'); return; }
    const data = {
      nom,
      couleur: document.getElementById('tf-couleur').value,
      description: document.getElementById('tf-desc').value.trim()
    };
    if (id) {
      await api.put(`themes/${id}`, data);
      toast('Thème mis à jour', 'success');
    } else {
      await api.post('themes', data);
      toast('Thème créé', 'success');
    }
    modal.close();
    await this.init();
  },

  async confirmDelete(id) {
    if (!confirm('Supprimer ce thème ? Il sera retiré de tous les épisodes.')) return;
    await api.delete(`themes/${id}`);
    toast('Thème supprimé', 'info');
    if (this.activeTheme?.id == id) this.activeTheme = null;
    await this.init();
  },

  escape(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};
