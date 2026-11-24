// assets/js/batch.js

const Batch = {
  episodes: [],
  saisons: [],
  personnages: [],
  lieux: [],
  themes: [],
  selectedIds: new Set(),
  operations: [],   // liste des opérations à exécuter
  pagesMap: {},     // episode_id → nb_pages (pour l'op pages_individuelles)
  running: false,
  diagnosticIssueCache: {},

  async init() {
    [this.saisons, this.episodes, this.personnages, this.lieux, this.themes] = await Promise.all([
      DataStore.get('saisons'),
      api.get('stats/batch'),
      DataStore.get('personnages'),
      DataStore.get('lieux'),
      DataStore.get('themes'),
    ]);
    this.render();
  },

  // ── Rendu principal ────────────────────────────────────────────────────────
  render() {
    const tab = document.getElementById('tab-batch');
    if (!tab) return;

    tab.innerHTML = `
      <div class="section-header">
        <div class="section-title">⊿ Batch</div>
        <div class="section-actions">
          <button class="btn btn-primary" id="btn-run-batch"
            onclick="Batch.run()"
            ${this.running ? 'disabled' : ''}>
            ${this.running ? '⏳ Exécution…' : '▶ Exécuter'}
          </button>
        </div>
      </div>

      <div class="batch-layout">

        <!-- ── Colonne gauche : sélection épisodes ── -->
        <div class="batch-sidebar">
          <div class="filter-section">
            <div class="filter-title">Sélection rapide</div>
            <div class="js-style-9d3009eb">
              <button class="btn btn-secondary btn-sm" onclick="Batch.selectAll()">Tout sélectionner</button>
              <button class="btn btn-ghost btn-sm" onclick="Batch.clearAll()">Tout désélectionner</button>
            </div>
          </div>

          <div class="filter-section">
            <div class="filter-title">Par saison</div>
            <div class="js-style-9d3009eb">
              ${this.saisons.map(s => `
                <button class="btn btn-ghost btn-sm"
                  style="border-left:3px solid ${s.couleur};padding-left:10px;text-align:left;justify-content:flex-start"
                  onclick="Batch.selectSaison(${s.id})">
                  ${this._escape(s.nom || 'Saison ' + s.numero)}
                  <span class="js-style-15c3dbb9">
                    ${this.episodes.filter(e => e.saison_id == s.id).length} ép.
                  </span>
                </button>
              `).join('')}
            </div>
          </div>

          <div class="filter-section">
            <div class="filter-title">Épisodes <span class="js-style-50197c32">(${this.selectedIds.size} sél.)</span></div>
            <div class="episode-select-list">
              ${this.saisons.map(s => {
                const eps = this.episodes.filter(e => e.saison_id == s.id);
                if (!eps.length) return '';
                return `
                  <div style="font-size:10px;color:${s.couleur};font-family:var(--font-display);font-weight:700;
                      letter-spacing:0.08em;text-transform:uppercase;margin:8px 0 4px;padding-left:4px">
                    ${this._escape(s.nom || 'Saison ' + s.numero)}
                  </div>
                  ${eps.map(ep => `
                    <div class="ep-select-item ${this.selectedIds.has(ep.id) ? 'selected' : ''}"
                      onclick="Batch.toggleEp(${ep.id})">
                      <div class="ep-checkbox">${this.selectedIds.has(ep.id) ? '✓' : ''}</div>
                      <span class="ep-select-label">
                        E${String(ep.numero_episode).padStart(2,'0')}
                        ${ep.titre ? ' — ' + this._escape(ep.titre.substring(0,20)) + (ep.titre.length > 20 ? '…' : '') : ''}
                      </span>
                    </div>
                  `).join('')}
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- ── Colonne droite : opérations ── -->
        <div class="batch-main">

          <!-- Opérations en attente -->
          ${this.operations.length ? `
            <div class="result-section js-style-7dde5e56">
              <div class="result-title js-style-e02c6d04">
                <span>File d'opérations <span class="js-style-66c37eb0">(${this.operations.length})</span></span>
                <button class="btn btn-ghost btn-sm js-style-e48b0583" onclick="Batch.clearOps()">✕ Vider</button>
              </div>
              <div class="js-style-9d3009eb">
                ${this.operations.map((op, i) => `
                  <div class="js-style-875a77aa">
                    <span class="js-style-f064ee01">${i+1}</span>
                    <span class="js-style-7623f055">${this.describeOp(op)}</span>
                    <button class="js-style-cfacc086" onclick="Batch.removeOp(${i})"
                      title="Supprimer">✕</button>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Pages individuelles actives -->
          ${this.operations.some(o => o.type === 'pages_individuelles') && this.selectedIds.size ? `
            <div class="result-section js-style-7dde5e56">
              <div class="result-title">Pages par épisode</div>
              <div class="js-style-b120241a">
                ${[...this.selectedIds].map(epId => {
                  const ep = this.episodes.find(e => e.id === epId);
                  if (!ep) return '';
                  return `
                    <div class="js-style-9f081c9f">
                      <span class="js-style-3f6f735f">
                        E${String(ep.numero_episode).padStart(2,'0')}
                        ${ep.titre ? ' — ' + this._escape(ep.titre.substring(0,16)) + (ep.titre.length>16?'…':'') : ''}
                      </span>
                      <input class="js-style-4937df34" type="number" min="0" max="999" placeholder="${ep.nb_pages||0}"
                        value="${this.pagesMap[epId] ?? ''}"
                        onchange="Batch.setPages(${epId}, this.value)"
                       >
                    </div>`;
                }).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Panneaux d'ajout d'opérations -->
          <div class="js-style-adf555b3">

            <!-- Réanalyse pleine largeur en haut -->
            <div class="batch-card js-style-a8bf0b67">
              <div class="batch-card-title"><span>⟳</span>Réanalyser le texte des épisodes</div>
              <div class="js-style-500a61ef">
                <div class="js-style-06680393">
                  Relance l'analyse sur le texte déjà uploadé pour chaque épisode sélectionné.
                  Sélectionnez les épisodes dans la colonne gauche, puis cliquez.
                </div>
                <div class="js-style-7b96d8b6" id="reanalyse-progress"></div>
                <button class="btn btn-secondary js-style-a9efa544" onclick="Batch.reanalyserSelection()">
                  ⟳ Réanalyser les épisodes sélectionnés
                </button>
              </div>
            </div>

            ${this.renderCard('État', '◈', `
              <div class="js-style-a379fd05">
                ${ETAT_OPTIONS.map(v => {
                  const bg = etatColor(v);
                  const tc = etatTextColor(bg);
                  return `<button class="btn btn-ghost btn-sm"
                    style="justify-content:flex-start;border-left:3px solid ${bg};padding-left:8px;font-size:11px;text-align:left"
                    onclick="Batch.addOp({type:'champ_simple',champ:'etat_episode',valeur:${this._escape(JSON.stringify(v))}})"
                    title="${v}">
                    ${v}
                  </button>`;
                }).join('')}
              </div>
            `)}

            ${this.renderCard('Jet', '⊞', `
              <div class="js-style-f67b86e0">
                ${['1er jet','2ème jet','3ème jet','4ème jet','Final'].map(v => `
                  <button class="btn btn-ghost btn-sm js-style-07e09bd5"
                    onclick="Batch.addOp({type:'champ_simple',champ:'jet',valeur:'${v}'})">
                    ${v}
                  </button>
                `).join('')}
              </div>
            `)}

            ${this.renderCard('Avancement', '▸', `
              <div class="js-style-f67b86e0">
                <div class="js-style-e3f61041">
                  <input class="js-style-06731f2b" type="range" min="0" max="100" step="5" value="100" id="batch-av-range"
                    oninput="document.getElementById('batch-av-val').textContent=this.value+'%'"
                   >
                  <span class="js-style-a1cc13f5" id="batch-av-val">100%</span>
                </div>
                <button class="btn btn-secondary btn-sm"
                  onclick="Batch.addOp({type:'champ_simple',champ:'avancement',valeur:document.getElementById('batch-av-range').value})">
                  + Ajouter
                </button>
              </div>
            `)}

            ${this.renderCard('Pages', '☰', `
              <div class="js-style-f67b86e0">
                <div class="js-style-e3f61041">
                  <input class="js-style-80e00aa9" type="number" id="batch-pages-uniform" min="0" max="999" placeholder="30"
                   >
                  <button class="btn btn-secondary btn-sm"
                    onclick="Batch.addOpPagesUniform()">
                    Uniform
                  </button>
                </div>
                <button class="btn btn-ghost btn-sm"
                  onclick="Batch.addOpPagesIndividuelles()">
                  Individuelles (par ép.)
                </button>
              </div>
            `)}

            ${this.renderCard('Date diégétique', '◷', `
              <div class="js-style-f67b86e0">
                <div class="js-style-e3f61041">
                  <input class="js-style-dcfe8f50" type="date" id="batch-date-diege"
                   >
                </div>
                <button class="btn btn-secondary btn-sm"
                  onclick="Batch.addOp({type:'champ_simple',champ:'date_diege',valeur:document.getElementById('batch-date-diege').value})">
                  Même date partout
                </button>
                <div class="js-style-efb7f117">
                  <span class="js-style-5e19e4f9">Séquentiel, +</span>
                  <input class="js-style-c93d8cca" type="number" id="batch-date-diege-pas" value="7" min="1" max="365"
                   >
                  <span class="js-style-cedce355">j</span>
                  <button class="btn btn-ghost btn-sm js-style-690f054c"
                    onclick="Batch.addOp({type:'dates_sequentielles',champ:'date_diege',date_debut:document.getElementById('batch-date-diege').value,pas_jours:document.getElementById('batch-date-diege-pas').value})">
                    + Séquentiel
                  </button>
                </div>
              </div>
            `)}

            ${this.renderCard('Dates d\'écriture', '⊶', `
              <div class="js-style-f67b86e0">
                <div class="js-style-162d5098">Début d'écriture — séquentiel</div>
                <div class="js-style-ac86ac11">
                  <input class="js-style-09aaab7f" type="date" id="batch-debut-date"
                   >
                  <span class="js-style-cedce355">+</span>
                  <input class="js-style-f3a19119" type="number" id="batch-debut-pas" value="7" min="1" max="365"
                   >
                  <span class="js-style-cedce355">j</span>
                  <button class="btn btn-ghost btn-sm"
                    onclick="Batch.addOp({type:'dates_sequentielles',champ:'date_debut_ecriture',date_debut:document.getElementById('batch-debut-date').value,pas_jours:document.getElementById('batch-debut-pas').value})">+</button>
                </div>
                <div class="js-style-acd893d8">Fin d'écriture — séquentiel</div>
                <div class="js-style-ac86ac11">
                  <input class="js-style-09aaab7f" type="date" id="batch-fin-date"
                   >
                  <span class="js-style-cedce355">+</span>
                  <input class="js-style-f3a19119" type="number" id="batch-fin-pas" value="7" min="1" max="365"
                   >
                  <span class="js-style-cedce355">j</span>
                  <button class="btn btn-ghost btn-sm"
                    onclick="Batch.addOp({type:'dates_sequentielles',champ:'date_fin_ecriture',date_debut:document.getElementById('batch-fin-date').value,pas_jours:document.getElementById('batch-fin-pas').value})">+</button>
                </div>
              </div>
            `)}

            ${this.renderCard('Personnage', '◎', `
              <div class="js-style-f67b86e0">
                <select class="js-style-61d57ed0" id="batch-perso-id"
                 >
                  <option value="">— Choisir —</option>
                  ${this.personnages.map(p => `
                    <option value="${p.id}">${this._escape(p.prenom)}${p.nom ? ' ' + this._escape(p.nom) : ''}</option>
                  `).join('')}
                </select>
                <div class="js-style-1d8943fa">
                  <button class="btn btn-secondary btn-sm js-style-7623f055"
                    onclick="Batch.addOpPersonnage('ajouter')">
                    + Ajouter
                  </button>
                  <button class="btn btn-ghost btn-sm js-style-7623f055"
                    onclick="Batch.addOpPersonnage('retirer')">
                    − Retirer
                  </button>
                </div>
              </div>
            `)}

            ${this.renderCard('Lieu', '⬡', `
              <div class="js-style-f67b86e0">
                <select class="js-style-61d57ed0" id="batch-lieu-id"
                 >
                  <option value="">— Choisir —</option>
                  ${this.lieux.map(l => `
                    <option value="${l.id}">${this._escape(l.nom)}</option>
                  `).join('')}
                </select>
                <select class="js-style-61d57ed0" id="batch-lieu-statut"
                 >
                  <option value="present">Présent</option>
                  <option value="absent">Absent</option>
                </select>
                <div class="js-style-1d8943fa">
                  <button class="btn btn-secondary btn-sm js-style-7623f055"
                    onclick="Batch.addOpLieu('ajouter')">
                    + Ajouter
                  </button>
                  <button class="btn btn-ghost btn-sm js-style-7623f055"
                    onclick="Batch.addOpLieu('retirer')">
                    − Retirer
                  </button>
                </div>
              </div>
            `)}

            ${this.renderCard('Thème', '◈', `
              <div class="js-style-f67b86e0">
                <select class="js-style-61d57ed0" id="batch-theme-id"
                 >
                  <option value="">— Choisir —</option>
                  ${this.themes.map(t => `
                    <option value="${t.id}">${this._escape(t.nom)}</option>
                  `).join('')}
                </select>
                <select class="js-style-61d57ed0" id="batch-theme-intensite"
                 >
                  <option value="fil rouge">Fil rouge</option>
                  <option value="central">Central</option>
                  <option value="mention" selected>Mention</option>
                </select>
                <div class="js-style-1d8943fa">
                  <button class="btn btn-secondary btn-sm js-style-7623f055"
                    onclick="Batch.addOpTheme('ajouter')">
                    + Ajouter
                  </button>
                  <button class="btn btn-ghost btn-sm js-style-7623f055"
                    onclick="Batch.addOpTheme('retirer')">
                    − Retirer
                  </button>
                </div>
              </div>
            `)}

            ${this.renderCard('Créer épisodes', '＋', `
              <div class="js-style-f67b86e0">
                <div class="js-style-162d5098">
                  Ajouter des épisodes numérotés dans une saison
                </div>
                <select class="js-style-61d57ed0" id="batch-create-saison-id"
                 >
                  <option value="">— Saison —</option>
                  ${this.saisons.map(s => `
                    <option value="${s.id}">${this._escape(s.nom || 'Saison ' + s.numero)}</option>
                  `).join('')}
                </select>
                <div class="js-style-ac86ac11">
                  <span class="js-style-5e19e4f9">Ép.</span>
                  <input class="js-style-a459507c" type="number" id="batch-create-ep-debut" min="1" placeholder="11"
                   >
                  <span class="js-style-5e19e4f9">à</span>
                  <input class="js-style-a459507c" type="number" id="batch-create-ep-fin" min="1" placeholder="30"
                   >
                </div>
                <div class="js-style-765974c5" id="batch-create-preview">
                  Saisissez une saison et une plage de numéros
                </div>
                <button class="btn btn-secondary btn-sm"
                  onclick="Batch.addOpCreerEpisodes()">
                  + Planifier la création
                </button>
              </div>
            `)}

            ${this.renderDiagnosticTools()}

          </div>
        </div>
      </div>
    `;
  },

  renderCard(titre, icon, content) {
    return `
      <div class="batch-card">
        <div class="batch-card-title"><span>${icon}</span>${titre}</div>
        ${content}
      </div>`;
  },

  _escape(v) {
    return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  },

  _norm(v) {
    return String(v || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/['’._-]/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  },

  _statsJson(ep) {
    const raw = ep?.stats?.stats_json || ep?.stats_json;
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); }
    catch(e) { return null; }
  },

  _saisonNum(ep) {
    return ep?.saison_numero || this.saisons.find(s => s.id == ep?.saison_id)?.numero || 0;
  },

  _episodeLabel(ep) {
    const s = this._saisonNum(ep);
    return `S${s}E${String(ep?.numero_episode || 0).padStart(2, '0')}`;
  },

  _saisonColor(ep) {
    return ep?.saison_couleur
      || this.saisons.find(s => s.id == ep?.saison_id || s.numero == ep?.saison_numero)?.couleur
      || 'var(--accent)';
  },

  _selectedEpisodes() {
    return this.episodes
      .filter(ep => this.selectedIds.has(ep.id))
      .slice()
      .sort((a,b) => (this._saisonNum(a) - this._saisonNum(b)) || ((a.numero_episode || 0) - (b.numero_episode || 0)));
  },

  _diagnosticStore() {
    try { return JSON.parse(localStorage.getItem(cleProjet('lemenu_batch_diagnostics_v1')) || '{}'); }
    catch(e) { return {}; }
  },

  _saveDiagnosticStore(store) {
    localStorage.setItem(cleProjet('lemenu_batch_diagnostics_v1'), JSON.stringify(store || {}));
  },

  _setDiagnosticStatus(key, status) {
    const store = this._diagnosticStore();
    if (!status) delete store[key];
    else store[key] = { status, updated_at: new Date().toISOString() };
    this._saveDiagnosticStore(store);
  },

  markDiagnostic(key, status) {
    this._setDiagnosticStatus(key, status);
    this.render();
  },

  restoreDiagnostic(key) {
    this._setDiagnosticStatus(key, null);
    this.render();
  },

  _buildPersonIndex() {
    const exact = new Map();
    const items = this.personnages.map(p => {
      const label = [p.prenom, p.nom].filter(Boolean).join(' ').trim() || p.nom_affichage || `Personnage #${p.id}`;
      const aliases = [p.prenom, p.nom, [p.prenom, p.nom].filter(Boolean).join(' '), p.nom_affichage]
        .map(a => this._norm(a))
        .filter(a => a.length >= 2);
      aliases.forEach(a => { if (!exact.has(a)) exact.set(a, { ...p, label }); });
      return { ...p, label, aliases };
    });
    return { exact, items };
  },

  _matchPersonFromRaw(raw, index) {
    const rawN = this._norm(raw);
    if (!rawN) return null;
    if (index.exact.has(rawN)) return index.exact.get(rawN);
    return index.items.find(p => p.aliases.some(a =>
      (a.length >= 3 && rawN.startsWith(a)) || (rawN.length >= 3 && a.startsWith(rawN))
    )) || null;
  },

  _diagnosticKey(issue) {
    return `diag:${issue.kind}:${issue.direction}:${issue.episode_id}:${issue.entity_id}`;
  },

  _collectDiagnosticIssues(kind) {
    const selected = this._selectedEpisodes();
    const store = this._diagnosticStore();
    const issues = [];
    const personIndex = kind === 'personnages' ? this._buildPersonIndex() : null;
    const lieuById = new Map(this.lieux.map(l => [parseInt(l.id), l]));

    selected.forEach(ep => {
      const stats = this._statsJson(ep);
      if (!stats) return;

      if (kind === 'personnages') {
        const detected = new Map();
        Object.entries(stats.repliques_par_perso || {}).forEach(([rawName, data]) => {
          const match = this._matchPersonFromRaw(rawName, personIndex);
          if (!match) return;
          const id = parseInt(match.id);
          const previous = detected.get(id) || { count: 0, raws: [], label: match.label };
          previous.count += parseInt(data?.nb_repliques || 0);
          previous.raws.push(rawName);
          detected.set(id, previous);
        });

        const presentRows = (ep.personnages_principaux || []).filter(p => parseInt(p.present ?? 1) === 1);
        const presentIds = new Set(presentRows.map(p => parseInt(p.personnage_id || p.id)));

        detected.forEach((data, id) => {
          if (data.count <= 0 || presentIds.has(id)) return;
          const issue = {
            kind,
            direction: 'detected_missing',
            episode_id: ep.id,
            entity_id: id,
            episode_label: this._episodeLabel(ep),
            episode_color: this._saisonColor(ep),
            episode_title: ep.titre || '',
            entity_label: data.label,
            detail: `${data.count} réplique(s) détectée(s) dans le texte, mais personnage non marqué présent.`,
            raw: data.raws.slice(0, 3).join(', '),
            action: 'add',
          };
          issue.key = this._diagnosticKey(issue);
          issue.status = store[issue.key]?.status || null;
          issues.push(issue);
        });

        presentRows.forEach(row => {
          const id = parseInt(row.personnage_id || row.id);
          if (detected.has(id)) return;
          const p = this.personnages.find(x => x.id == id);
          const label = [row.prenom || p?.prenom, row.nom || p?.nom].filter(Boolean).join(' ').trim() || p?.nom_affichage || `Personnage #${id}`;
          const issue = {
            kind,
            direction: 'present_not_detected',
            episode_id: ep.id,
            entity_id: id,
            episode_label: this._episodeLabel(ep),
            episode_color: this._saisonColor(ep),
            episode_title: ep.titre || '',
            entity_label: label,
            detail: `Personnage marqué présent, mais aucune réplique détectée dans le texte analysé.`,
            action: null,
          };
          issue.key = this._diagnosticKey(issue);
          issue.status = store[issue.key]?.status || null;
          issues.push(issue);
        });
      }

      if (kind === 'lieux') {
        const detected = new Map();
        (stats.repliques_par_lieu || []).forEach(row => {
          const id = parseInt(row.lieu_id);
          if (!id || !lieuById.has(id)) return;
          detected.set(id, {
            scenes: parseInt(row.nb_scenes || 0),
            repliques: parseInt(row.nb_repliques || 0),
            label: lieuById.get(id)?.nom || row.nom || `Décor #${id}`,
          });
        });

        const statusByLieu = new Map((ep.lieux || []).map(l => [parseInt(l.lieu_id || l.id), l.statut || 'absent']));

        detected.forEach((data, id) => {
          const statut = statusByLieu.get(id) || 'absent';
          if (statut === 'present') return;
          const issue = {
            kind,
            direction: 'detected_missing',
            episode_id: ep.id,
            entity_id: id,
            episode_label: this._episodeLabel(ep),
            episode_color: this._saisonColor(ep),
            episode_title: ep.titre || '',
            entity_label: data.label,
            detail: `${data.scenes} scène(s), ${data.repliques} réplique(s) détectée(s), mais décor marqué “${statut}”.`,
            action: 'add',
          };
          issue.key = this._diagnosticKey(issue);
          issue.status = store[issue.key]?.status || null;
          issues.push(issue);
        });

        (ep.lieux || []).forEach(l => {
          const id = parseInt(l.lieu_id || l.id);
          if ((l.statut || 'absent') !== 'present' || detected.has(id)) return;
          const lieu = lieuById.get(id);
          const issue = {
            kind,
            direction: 'present_not_detected',
            episode_id: ep.id,
            entity_id: id,
            episode_label: this._episodeLabel(ep),
            episode_color: this._saisonColor(ep),
            episode_title: ep.titre || '',
            entity_label: lieu?.nom || l.lieu_nom || `Décor #${id}`,
            detail: `Décor marqué présent, mais aucune scène détectée dans le texte analysé.`,
            action: null,
          };
          issue.key = this._diagnosticKey(issue);
          issue.status = store[issue.key]?.status || null;
          issues.push(issue);
        });
      }
    });

    return issues;
  },

  renderDiagnosticTools() {
    this.diagnosticIssueCache = {};
    const selectedCount = this.selectedIds.size;
    const selected = this._selectedEpisodes();
    const notAnalysed = selected.filter(ep => !this._statsJson(ep)).length;
    const personIssues = this._collectDiagnosticIssues('personnages');
    const lieuIssues = this._collectDiagnosticIssues('lieux');

    return `
      <div class="batch-diagnostic-tools">
        <div class="batch-diagnostic-heading">
          ⊕ Contrôle de cohérence sur la sélection
        </div>
        ${this.renderDiagnosticCard('personnages', '◎ Personnages à contrôler', personIssues, selectedCount, notAnalysed)}
        ${this.renderDiagnosticCard('lieux', '⬡ Décors / lieux à contrôler', lieuIssues, selectedCount, notAnalysed)}
      </div>
    `;
  },

  renderDiagnosticCard(kind, title, issues, selectedCount, notAnalysed) {
    const active = issues.filter(i => i.status !== 'ignored');
    const ignored = issues.filter(i => i.status === 'ignored');
    [...active, ...ignored].forEach(i => { this.diagnosticIssueCache[i.key] = i; });
    const addLabel = kind === 'personnages' ? 'Personnage à mettre' : 'Décor à mettre';
    const empty = !selectedCount
      ? 'Sélectionnez des épisodes à gauche pour lancer le contrôle.'
      : 'Aucune incohérence active dans la sélection.';

    return `
      <div class="batch-card batch-full-width">
        <div class="batch-card-title is-between">
          <span>${title}</span>
          <span class="batch-diagnostic-count">${active.length} active(s) · ${ignored.length} pas une erreur</span>
        </div>
        ${notAnalysed ? `<div class="batch-diagnostic-note">${notAnalysed} épisode(s) sélectionné(s) n'ont pas encore de texte analysé.</div>` : ''}
        <div class="batch-diagnostic-list">
          ${active.length ? active.map(issue => this.renderDiagnosticIssue(issue, addLabel)).join('') : `
            <div class="batch-diagnostic-empty">
              ${empty}
            </div>
          `}
        </div>
        ${ignored.length ? `
          <div class="batch-diagnostic-ignored">
            <div class="batch-diagnostic-ignored-title">
              Pas comme une erreur (${ignored.length})
            </div>
            <div class="batch-diagnostic-ignored-list">
              ${ignored.map(issue => `
                <div class="batch-diagnostic-ignored-row">
                  <span class="batch-diagnostic-episode-label batch-diagnostic-ignored-label" style="--episode-color:${issue.episode_color || 'var(--accent)'}">${issue.episode_label}</span>
                  <span class="batch-diagnostic-ignored-text">${this._escape(issue.entity_label)} <span class="batch-diagnostic-muted">· ${this._escape(issue.detail)}</span></span>
                  <button class="btn btn-ghost btn-sm" onclick="Batch.restoreDiagnostic('${issue.key}')">Remettre</button>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  },

  renderDiagnosticIssue(issue, addLabel) {
    const verifyBadge = issue.status === 'verify'
      ? '<span class="batch-diagnostic-pill is-verify">À vérifier</span>'
      : '';
    const directionBadge = issue.direction === 'detected_missing'
      ? '<span class="batch-diagnostic-pill is-detected-missing">Détecté mais absent</span>'
      : '<span class="batch-diagnostic-pill">Présent mais non détecté</span>';

    return `
      <div class="batch-diagnostic-row">
        <div>
          <div class="batch-diagnostic-episode-label" style="--episode-color:${issue.episode_color || 'var(--accent)'}">${issue.episode_label}</div>
          <div class="batch-diagnostic-episode-title">${this._escape(issue.episode_title || '')}</div>
        </div>
        <div class="batch-diagnostic-issue-main">
          <div class="batch-diagnostic-issue-title">
            <strong class="batch-diagnostic-entity">${this._escape(issue.entity_label)}</strong>
            ${directionBadge}
            ${verifyBadge}
          </div>
          <div class="batch-diagnostic-detail">${this._escape(issue.detail)}</div>
          ${issue.raw ? `<div class="batch-diagnostic-raw">Nom texte : ${this._escape(issue.raw)}</div>` : ''}
        </div>
        <div class="batch-diagnostic-actions">
          <button class="btn btn-secondary btn-sm" onclick="Batch.markDiagnostic('${issue.key}', 'verify')">À vérifier</button>
          <button class="btn btn-ghost btn-sm" onclick="Batch.markDiagnostic('${issue.key}', 'ignored')">Pas comme une erreur</button>
          ${issue.action === 'add' ? `<button class="btn btn-primary btn-sm" onclick="Batch.applyDiagnosticFix('${issue.key}')">${addLabel}</button>` : ''}
        </div>
      </div>
    `;
  },

  async applyDiagnosticFix(key) {
    const issue = this.diagnosticIssueCache[key];
    if (!issue) { toast('Incohérence introuvable, relancez le contrôle', 'error'); return; }

    const op = issue.kind === 'personnages'
      ? { type: 'ajouter_personnage', personnage_id: issue.entity_id, present: 1, _label: issue.entity_label }
      : { type: 'ajouter_lieu', lieu_id: issue.entity_id, statut: 'present', _label: issue.entity_label };

    try {
      const res = await api.post('batch', {
        episode_ids: [issue.episode_id],
        operations: [op],
      });

      if (res.ok || res.resultats?.length) {
        this._setDiagnosticStatus(key, null);
        this.episodes = await api.get('stats/batch');
        this.render();
        toast(`${this._escape(issue.entity_label)} ajouté dans ${issue.episode_label}`, 'success');
      } else {
        toast(res.erreurs?.join('\n') || 'Correction impossible', 'error');
      }
    } catch(e) {
      toast('Erreur réseau pendant la correction', 'error');
    }
  },

  // ── Sélection épisodes ─────────────────────────────────────────────────────
  toggleEp(id) {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.selectedIds.add(id);
    this.render();
  },
  selectAll() { this.episodes.forEach(e => this.selectedIds.add(e.id)); this.render(); },
  clearAll()  { this.selectedIds.clear(); this.render(); },
  selectSaison(sid) { this.episodes.filter(e => e.saison_id == sid).forEach(e => this.selectedIds.add(e.id)); this.render(); },

  // ── Gestion opérations ─────────────────────────────────────────────────────
  addOp(op) {
    // Validation basique
    if (op.type === 'champ_simple' && (op.valeur === '' || op.valeur === null || op.valeur === undefined)) {
      toast('Valeur manquante', 'error'); return;
    }
    if (op.type === 'dates_sequentielles' && !op.date_debut) {
      toast('Date de départ manquante', 'error'); return;
    }
    this.operations.push(op);
    this.render();
    toast('Opération ajoutée', 'success');
  },

  removeOp(i) { this.operations.splice(i, 1); this.render(); },
  clearOps()  { this.operations = []; this.render(); },

  addOpPagesUniform() {
    const v = document.getElementById('batch-pages-uniform')?.value;
    if (!v || isNaN(v)) { toast('Entrez un nombre de pages', 'error'); return; }
    this.addOp({ type: 'champ_simple', champ: 'nb_pages', valeur: parseInt(v) });
  },

  addOpPagesIndividuelles() {
    if (!this.selectedIds.size) { toast('Sélectionnez des épisodes d\'abord', 'error'); return; }
    // Initialiser pagesMap depuis les valeurs actuelles des épisodes
    for (const epId of this.selectedIds) {
      const ep = this.episodes.find(e => e.id === epId);
      if (ep && !(epId in this.pagesMap)) this.pagesMap[epId] = ep.nb_pages || 0;
    }
    // Vérifier si l'op existe déjà
    if (!this.operations.some(o => o.type === 'pages_individuelles')) {
      this.operations.push({ type: 'pages_individuelles', valeurs: [] });
    }
    this.render();
    toast('Renseignez les pages pour chaque épisode ci-dessus', 'success');
  },

  setPages(epId, val) {
    this.pagesMap[epId] = parseInt(val) || 0;
    // Mettre à jour l'op pages_individuelles
    const op = this.operations.find(o => o.type === 'pages_individuelles');
    if (op) {
      op.valeurs = Object.entries(this.pagesMap).map(([id, nb_pages]) => ({ episode_id: parseInt(id), nb_pages }));
    }
  },

  addOpPersonnage(action) {
    const pId = parseInt(document.getElementById('batch-perso-id')?.value);
    if (!pId) { toast('Sélectionnez un personnage', 'error'); return; }
    const p = this.personnages.find(x => x.id === pId);
    this.addOp({ type: action + '_personnage', personnage_id: pId, present: 1, _label: p?.prenom });
  },

  addOpLieu(action) {
    const lId    = parseInt(document.getElementById('batch-lieu-id')?.value);
    const statut = document.getElementById('batch-lieu-statut')?.value || 'present';
    if (!lId) { toast('Sélectionnez un lieu', 'error'); return; }
    const l = this.lieux.find(x => x.id === lId);
    this.addOp({ type: action + '_lieu', lieu_id: lId, statut, _label: l?.nom });
  },

  addOpTheme(action) {
    const tId      = parseInt(document.getElementById('batch-theme-id')?.value);
    const intensite = document.getElementById('batch-theme-intensite')?.value || 'mention';
    if (!tId) { toast('Sélectionnez un thème', 'error'); return; }
    const t = this.themes.find(x => x.id === tId);
    this.addOp({ type: action + '_theme', theme_id: tId, intensite, _label: t?.nom });
  },

  // ── Réanalyse en masse ────────────────────────────────────────────────────
  async reanalyserSelection() {
    if (!this.selectedIds.size) { toast('Sélectionnez des épisodes d\'abord', 'error'); return; }

    const ids = [...this.selectedIds];
    const nb  = ids.length;

    if (!confirm(`Réanalyser le texte de ${nb} épisode(s) ?\nSeuls les épisodes avec un texte déjà uploadé seront traités.`)) return;

    const progEl = document.getElementById('reanalyse-progress');
    if (progEl) { progEl.style.display = 'block'; progEl.textContent = `0 / ${nb} traités…`; }

    let ok = 0, skipped = 0, errors = 0;

    for (let i = 0; i < ids.length; i++) {
      const epId = ids[i];
      if (progEl) progEl.textContent = `${i + 1} / ${nb} — épisode #${epId}…`;

      try {
        const res = await api.post('reanalyse', { episode_id: epId });
        if (res.skipped) { skipped++; }
        else if (res.ok)  { ok++; }
        else              { errors++; }
      } catch (e) {
        errors++;
      }
    }

    if (progEl) progEl.style.display = 'none';

    const msg = `Réanalyse terminée : ${ok} mis à jour, ${skipped} sans texte, ${errors} erreur(s)`;
    toast(msg, errors ? 'error' : 'success');

    // Rafraîchir les épisodes en mémoire
    this.episodes = await api.get('stats/batch');
    this.render();
  },

  addOpCreerEpisodes() {
    const saisonId = parseInt(document.getElementById('batch-create-saison-id')?.value);
    const epDebut  = parseInt(document.getElementById('batch-create-ep-debut')?.value);
    const epFin    = parseInt(document.getElementById('batch-create-ep-fin')?.value);

    if (!saisonId) { toast('Sélectionnez une saison', 'error'); return; }
    if (!epDebut || !epFin) { toast('Indiquez les numéros d\'épisode de début et de fin', 'error'); return; }
    if (epDebut > epFin) { toast('Le numéro de début doit être ≤ au numéro de fin', 'error'); return; }
    if (epFin - epDebut > 200) { toast('Plage trop grande (max 200 épisodes)', 'error'); return; }

    // Vérifier les doublons avec les épisodes déjà existants dans cette saison
    const existants = this.episodes
      .filter(e => e.saison_id == saisonId)
      .map(e => e.numero_episode);
    const doublons = [];
    for (let n = epDebut; n <= epFin; n++) {
      if (existants.includes(n)) doublons.push(n);
    }
    if (doublons.length) {
      const liste = doublons.length <= 5 ? doublons.join(', ') : doublons.slice(0,5).join(', ') + '…';
      if (!confirm(`Les épisodes suivants existent déjà dans cette saison : ${liste}.\nContinuer quand même ?`)) return;
    }

    const saison = this.saisons.find(s => s.id === saisonId);
    const count  = epFin - epDebut + 1;
    this.addOp({
      type:      'creer_episodes',
      saison_id: saisonId,
      ep_debut:  epDebut,
      ep_fin:    epFin,
      _label:    saison?.nom || 'Saison ' + saison?.numero,
      _count:    count,
    });
  },

  // ── Description lisible d'une opération ───────────────────────────────────
  describeOp(op) {
    switch (op.type) {
      case 'champ_simple': {
        const labels = {
          etat_episode: 'État', jet: 'Jet', avancement: 'Avancement',
          nb_pages: 'Pages', date_diege: 'Date diég.', code: 'Code',
          date_debut_ecriture: 'Début écriture', date_fin_ecriture: 'Fin écriture',
        };
        return `<strong>${labels[op.champ] || op.champ}</strong> → ${this._escape(op.valeur)}`;
      }
      case 'dates_sequentielles': {
        const labels = { date_diege: 'Date diég.', date_debut_ecriture: 'Début écriture', date_fin_ecriture: 'Fin écriture' };
        return `<strong>${labels[op.champ] || op.champ}</strong> séquentiel depuis <em>${op.date_debut}</em>, +${op.pas_jours}j`;
      }
      case 'pages_individuelles':
        return `<strong>Pages</strong> individuelles (${Object.keys(this.pagesMap).length} valeurs)`;
      case 'ajouter_personnage':
        return `<strong>+ Personnage</strong> ${this._escape(op._label || '#'+op.personnage_id)} (présent)`;
      case 'retirer_personnage':
        return `<strong>− Personnage</strong> ${this._escape(op._label || '#'+op.personnage_id)}`;
      case 'ajouter_lieu':
        return `<strong>+ Lieu</strong> ${this._escape(op._label || '#'+op.lieu_id)} (${op.statut})`;
      case 'retirer_lieu':
        return `<strong>− Lieu</strong> ${this._escape(op._label || '#'+op.lieu_id)}`;
      case 'ajouter_theme':
        return `<strong>+ Thème</strong> ${this._escape(op._label || '#'+op.theme_id)} (${op.intensite})`;
      case 'retirer_theme':
        return `<strong>− Thème</strong> ${this._escape(op._label || '#'+op.theme_id)}`;
      case 'creer_episodes':
        return `<strong>✚ Créer ${op._count} épisode(s)</strong> dans ${this._escape(op._label)} — E${String(op.ep_debut).padStart(2,'0')} à E${String(op.ep_fin).padStart(2,'0')}`;
      default:
        return op.type;
    }
  },

  // ── Exécution ──────────────────────────────────────────────────────────────
  async run() {
    if (!this.operations.length) { toast('Ajoutez au moins une opération', 'error'); return; }

    const toutesCreations = this.operations.every(o => o.type === 'creer_episodes');
    if (!toutesCreations && !this.selectedIds.size) {
      toast('Sélectionnez au moins un épisode', 'error'); return;
    }

    const nb = this.selectedIds.size;
    const nbOps = this.operations.length;
    const confirmMsg = toutesCreations
      ? `Créer des épisodes (${nbOps} opération(s)) ?\nCette action est irréversible.`
      : `Appliquer ${nbOps} opération(s) sur ${nb} épisode(s) ?\nCette action est irréversible.`;
    if (!confirm(confirmMsg)) return;

    this.running = true;
    document.getElementById('btn-run-batch').textContent = '⏳ Exécution…';
    document.getElementById('btn-run-batch').disabled = true;

    // Synchroniser les pages individuelles si nécessaire
    const opPages = this.operations.find(o => o.type === 'pages_individuelles');
    if (opPages) {
      opPages.valeurs = Object.entries(this.pagesMap).map(([id, nb_pages]) => ({
        episode_id: parseInt(id), nb_pages
      }));
    }

    // Toutes les opérations (y compris creer_episodes) passent dans le batch standard
    const opsStandard = this.operations;

    try {
      const res = await api.post('batch', {
        episode_ids: [...this.selectedIds],
        operations:  opsStandard,
      });

      if (res.ok || res.resultats?.length) {
        const msgs = res.resultats?.join('\n') || 'Opérations appliquées';
        toast(msgs, 'success');
        // Réinitialiser opérations + pages
        this.operations = [];
        this.pagesMap   = {};
        // Rafraîchir les épisodes en mémoire
        this.episodes = await api.get('stats/batch');
        this.render();
      } else {
        toast(res.erreurs?.join('\n') || 'Erreur inconnue', 'error');
      }
    } catch(e) {
      toast('Erreur réseau', 'error');
    } finally {
      this.running = false;
    }
  },
};
