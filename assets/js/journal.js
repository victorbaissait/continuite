// assets/js/journal.js

const JournalTab = {
  entries: [],
  filterCat: 'all',
  filterAction: 'all',

  async init() {
    try {
      this.entries = await api.get('journal');
    } catch (e) {
      this.entries = [];
    }
    this.render();
  },

  render() {
    const tab = document.getElementById('tab-journal');

    const filtered = this.entries.filter(e => {
      if (this.filterCat    !== 'all' && e.categorie !== this.filterCat)    return false;
      if (this.filterAction !== 'all' && e.action    !== this.filterAction) return false;
      return true;
    });

    const cats = ['all','episodes','personnages','themes','saisons','lieux'];
    const catLabels = { all:'Tout', episodes:'Épisodes', personnages:'Personnages', themes:'Thèmes', saisons:'Saisons', lieux:'Lieux' };
    const actions = ['all','create','update','delete'];
    const actionLabels = { all:'Toutes', create:'Ajouts', update:'Modifs', delete:'Suppressions' };

    tab.innerHTML = `
      <div class="section-header">
        <div class="section-title">◷ Journal</div>
        <div class="section-actions">
          <button class="btn btn-ghost btn-sm" onclick="JournalTab.confirmClear()" style="color:var(--text3);font-size:11px">
            ✕ Vider le journal
          </button>
        </div>
      </div>

      <div class="journal-toolbar">
        <div class="journal-filters">
          <span style="font-size:11px;color:var(--text3);font-family:var(--font-display);text-transform:uppercase;letter-spacing:0.08em">Catégorie</span>
          <div class="filter-pills">
            ${cats.map(c => `
              <button class="filter-pill ${this.filterCat === c ? 'active' : ''}"
                onclick="JournalTab.filterCat='${c}';JournalTab.render()">
                ${catLabels[c]}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="journal-filters">
          <span style="font-size:11px;color:var(--text3);font-family:var(--font-display);text-transform:uppercase;letter-spacing:0.08em">Action</span>
          <div class="filter-pills">
            ${actions.map(a => `
              <button class="filter-pill action-${a} ${this.filterAction === a ? 'active' : ''}"
                onclick="JournalTab.filterAction='${a}';JournalTab.render()">
                ${actionLabels[a]}
              </button>
            `).join('')}
          </div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-left:auto;align-self:center">
          ${filtered.length} entrée${filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div class="journal-list">
        ${filtered.length === 0 ? `
          <div class="empty-state">
            <div class="empty-icon">◷</div>
            <div class="empty-title">Aucune entrée</div>
            <div class="empty-sub">Les modifications apparaîtront ici automatiquement</div>
          </div>
        ` : filtered.map(e => this.renderEntry(e)).join('')}
      </div>
    `;
  },

  renderEntry(e) {
    const actionMeta = {
      create: { icon: '+', cls: 'action-create', label: 'Ajout' },
      update: { icon: '✎', cls: 'action-update', label: 'Modif.' },
      delete: { icon: '✕', cls: 'action-delete', label: 'Suppression' },
    };
    const meta = actionMeta[e.action] || { icon: '·', cls: '', label: e.action };

    const catLabel = Journal.CATEGORIES[e.categorie] || e.categorie;

    // Formatage de la date/heure
    const dt = new Date(e.created_at);
    const dateStr = dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const timeStr = dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const hasDetail = e.action === 'update' && e.champ;

    return `
      <div class="journal-entry ${meta.cls}">
        <div class="journal-entry-left">
          <div class="journal-action-badge ${meta.cls}">${meta.icon}</div>
        </div>
        <div class="journal-entry-body">
          <div class="journal-entry-header">
            <span class="journal-cat-tag">${esc(catLabel)}</span>
            ${e.entite_label ? `<span class="journal-entity">« ${esc(e.entite_label)} »</span>` : ''}
          </div>
          ${hasDetail ? `
            <div class="journal-diff">
              <span class="journal-champ">${esc(e.champ)}</span>
              <span class="journal-avant">${esc(this._truncate(e.valeur_avant, 60))}</span>
              <span class="journal-arrow">→</span>
              <span class="journal-apres">${esc(this._truncate(e.valeur_apres, 60))}</span>
            </div>
          ` : `
            <div class="journal-desc">${esc(e.description)}</div>
          `}
        </div>
        <div class="journal-entry-time">
          <span class="journal-date">${dateStr}</span>
          <span class="journal-time">${timeStr}</span>
        </div>
      </div>
    `;
  },

  _truncate(str, max) {
    if (!str) return '—';
    return str.length > max ? str.slice(0, max) + '…' : str;
  },

  async confirmClear() {
    if (!confirm('Vider tout le journal ? Cette action est irréversible.')) return;
    await api.delete('journal');
    toast('Journal vidé', 'info');
    await this.init();
  }
};
