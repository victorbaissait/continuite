// assets/js/decors.js

const Decors = {
  data: [],

  _escape(v) {
    return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  },

  _attr(v) {
    return this._escape(v);
  },

  _saisonNum(ep, saisons = []) {
    return ep?.saison_numero || ep?.saison?.numero || saisons.find(s => s.id == ep?.saison_id)?.numero || null;
  },

  _statsJson(ep) {
    const raw = ep?.stats?.stats_json || ep?.stats_json;
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); }
    catch(e) { return null; }
  },

  _decorStats(ep, lieuId) {
    const sj = this._statsJson(ep);
    return (sj?.repliques_par_lieu || []).find(r => r.lieu_id == lieuId) || null;
  },

  _normPersonName(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/['’._-]/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  },

  _buildPersonIndex(personnages = []) {
    const index = new Map();
    personnages.forEach(p => {
      const label = [p.prenom, p.nom].filter(Boolean).join(' ').trim() || p.prenom || p.nom_affichage;
      const aliases = [
        p.prenom,
        [p.prenom, p.nom].filter(Boolean).join(' '),
        p.nom_affichage
      ];
      aliases.forEach(alias => {
        const key = this._normPersonName(alias);
        if (key && !index.has(key)) index.set(key, { ...p, label });
      });
    });
    return index;
  },

  async init() {
    try {
      this.data = await DataStore.get('lieux');
    } catch(e) {
      this.data = [];
      console.error('Decors init error:', e);
    }
    this.render();
    if (this.vue === 'liste') await Analyse.monterDecors();
  },

  vue: 'liste',

  _vues() {
    return `<div class="an-ligne vues-onglet" role="group" aria-label="Vue">${[['liste', 'Liste'], ['carte', 'Carte']].map(([k, l]) => `<button type="button" class="an-choix ${this.vue === k ? 'actif' : ''}" aria-pressed="${this.vue === k}" onclick="Decors.choisirVue('${k}')">${l}</button>`).join('')}</div>`;
  },

  async choisirVue(v) {
    this.vue = v;
    this.render();
    if (v === 'liste' && this.data.length) await Analyse.monterDecors();
  },

  render() {
    const tab = document.getElementById('tab-decors');
    if (this.vue === 'carte') {
      tab.innerHTML = `<div class="section-header"><div class="section-title">⬡ Décors · carte</div><div class="section-actions">${this._vues()}</div></div><div class="vue-monde" id="cartes-vue"></div>`;
      Cartes.monter(document.getElementById('cartes-vue'));
      return;
    }
    const principaux = this.data.filter(l => l.est_principal == 1);
    const autres     = this.data.filter(l => l.est_principal != 1);

    const renderSection = (titre, liste, emptyMsg) => {
      if (!liste.length) return `
        <div class="js-style-f5c7cef0">${titre}</div>
        <div class="js-style-8745faca">${emptyMsg}</div>
      `;
      return `
        <div class="js-style-70ed919e">
          ${titre} <span class="js-style-f23d2056">(${liste.length})</span>
        </div>
        <div class="personnages-grid">
          ${liste.map(l => this.renderCard(l)).join('')}
        </div>
      `;
    };

    tab.innerHTML = `
      <div class="section-header">
        <div class="section-title">⬡ Décors</div>
        <div class="section-actions">
          ${this._vues()}
          <button class="btn btn-ghost btn-sm" onclick="Decors.autoDetect()">↻ Auto-remplir depuis textes</button>
          <button class="btn btn-primary" onclick="Decors.openForm(null)">+ Ajouter un décor</button>
        </div>
      </div>

      ${this.data.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">⬡</div>
          <div class="empty-title">Aucun décor</div>
          <div class="empty-sub">Ajoutez vos décors récurrents (appartement, bureau…)</div>
        </div>
      ` : `
        ${renderSection('Décors principaux', principaux, 'Aucun décor principal — marquez-en un comme principal dans sa fiche')}
        ${(principaux.length && autres.length) ? `<hr class="js-style-5a4229da">` : ''}
        ${autres.length ? renderSection('Autres décors', autres, '') : ''}
        <hr class="js-style-5a4229da">
        <div class="section-title decors-analyse-titre">Analyse sur une sélection d'épisodes</div>
        <div id="decors-analyse"></div>
      `}
    `;
  },

  renderCard(l) {
    const fmtDuree = (min) => {
      if (!min) return null;
      const h = Math.floor(min / 60), m = min % 60;
      return h > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${min} min`;
    };
    return `
      <div class="personnage-card" onclick="Decors.openDetail(${l.id})">
        ${l.est_principal == 1 ? '<div class="principal-badge">Principal</div>' : ''}
        <div class="personnage-card-top">
          <div class="personnage-avatar js-style-2e1be6c7">
            ⬡
          </div>
          <div class="personnage-card-info">
            <div class="personnage-prenom">${this._escape(l.nom)}</div>
            <div class="personnage-role">${this._escape(l.description || 'Décor récurrent')}</div>
          </div>
        </div>
        <div class="personnage-card-stats decor-card-stats">
          <div class="perso-stat">
            <div class="perso-stat-val">${l.nb_episodes ?? 0}</div>
            <div class="perso-stat-label">épisodes</div>
          </div>
          <div class="perso-stat">
            <div class="perso-stat-val">${l.nb_repliques_total ?? 0}</div>
            <div class="perso-stat-label">répliques</div>
          </div>
          <div class="perso-stat">
            <div class="perso-stat-val">${l.nb_scenes_total ?? 0}</div>
            <div class="perso-stat-label">scènes détectées</div>
          </div>
          <div class="perso-stat">
            <div class="perso-stat-val js-style-e71ae94b">${fmtDuree(l.duree_totale_min) || '—'}</div>
            <div class="perso-stat-label">durée est.</div>
          </div>
        </div>
      </div>
    `;
  },

  async openDetail(id) {
    const l = this.data.find(x => x.id == id);
    if (!l) return;

    // Navigation among decors in same group (principal/autre)
    const sameGroup = this.data.filter(x => x.est_principal == l.est_principal);
    const idx = sameGroup.findIndex(x => x.id == id);
    const prevId = idx > 0 ? sameGroup[idx - 1].id : null;
    const nextId = idx < sameGroup.length - 1 ? sameGroup[idx + 1].id : null;
    const navHtml = `
      <div>
        <button class="btn btn-ghost btn-sm js-style-88e411f8" onclick="modal.close();Decors.openDetail(${prevId})" ${!prevId ? 'disabled' : ''} title="Décor précédent (←)">◀</button>
        <button class="btn btn-ghost btn-sm js-style-88e411f8" onclick="modal.close();Decors.openDetail(${nextId})" ${!nextId ? 'disabled' : ''} title="Décor suivant (→)">▶</button>
      </div>
    `;
    modal.setNav(
      prevId ? () => { modal.close(); Decors.openDetail(prevId); } : null,
      nextId ? () => { modal.close(); Decors.openDetail(nextId); } : null
    );

    const fmtDuree = (min) => {
      if (!min) return '—';
      const h = Math.floor(min / 60), m = min % 60;
      return h > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${min} min`;
    };

    let episodesPresent    = [];
    let episodesPasEncore  = [];
    let repliquesParLieuAll = {};
    let allEpisodes        = [];
    let allSaisons         = [];
    let allPersonnages     = [];
    let personnagesIndex   = new Map();

    try {
      const [episodes, saisons, personnages] = await Promise.all([
        api.get('stats/decors'),
        DataStore.get('saisons'),
        DataStore.get('personnages')
      ]);
      allEpisodes = episodes;
      allSaisons  = saisons;
      allPersonnages = personnages;
      personnagesIndex = this._buildPersonIndex(allPersonnages);

      const withSaison = ep => ({ ...ep, saison: saisons.find(s => s.id == ep.saison_id) });

      episodesPresent = episodes.filter(ep =>
        (ep.lieux || []).some(x => x.lieu_id == l.id && x.statut === 'present')
      ).map(withSaison);

      episodesPasEncore = episodes.filter(ep =>
        (ep.lieux || []).some(x => x.lieu_id == l.id && x.statut === 'pas encore existant')
      ).map(withSaison);

      // Agréger repliques_par_lieu depuis les stats_json de chaque épisode présent
      const persoAgg   = {};
      const lieuxCoAgg = {}; // co-présence décors : lieu_id → { nom, nb_scenes }
      let totalReplLieu = 0, totalScenes = 0, totalDureeLieu = 0;

      episodesPresent.forEach(ep => {
        const sj = this._statsJson(ep);
        if (!sj) return;

        const lieuData = this._decorStats(ep, l.id);
        if (!lieuData) return;
        totalReplLieu += lieuData.nb_repliques || 0;
        totalScenes   += lieuData.nb_scenes    || 0;
        totalDureeLieu += lieuData.duree_min    || 0;
        (lieuData.personnages || []).forEach(p => {
          const matched = personnagesIndex.get(this._normPersonName(p.nom));
          if (!matched) return;
          persoAgg[matched.label] = (persoAgg[matched.label] || 0) + p.nb_repliques;
        });

        // Co-présence : autres lieux dans cet épisode (qui ont au moins 1 scène)
        (sj.repliques_par_lieu || []).forEach(autre => {
          if (autre.lieu_id == l.id) return;
          if (!autre.nb_scenes) return;
          if (!lieuxCoAgg[autre.lieu_id]) {
            // Trouver le nom du lieu depuis this.data ou depuis l'épisode
            const found = Decors.data.find(d => d.id == autre.lieu_id);
            lieuxCoAgg[autre.lieu_id] = { nom: found?.nom || autre.nom || `Décor #${autre.lieu_id}`, nb_episodes: 0, nb_scenes: 0 };
          }
          lieuxCoAgg[autre.lieu_id].nb_episodes += 1;
          lieuxCoAgg[autre.lieu_id].nb_scenes   += autre.nb_scenes || 0;
        });
      });

      const persoSorted = Object.entries(persoAgg).sort((a,b) => b[1]-a[1]);
      const maxR = persoSorted.length ? persoSorted[0][1] : 1;

      const lieuxCoSorted = Object.entries(lieuxCoAgg)
        .map(([lieu_id, v]) => ({ lieu_id, ...v }))
        .sort((a,b) => b.nb_scenes - a.nb_scenes);

      repliquesParLieuAll = { totalRepliques: totalReplLieu, totalScenes, totalDuree: totalDureeLieu, perso: persoSorted, maxR, lieuxCo: lieuxCoSorted };
    } catch(e) { console.error(e); }

    const displayNbEpisodes = l.nb_episodes ?? episodesPresent.length;
    const displayTotalScenes = repliquesParLieuAll.totalScenes || l.nb_scenes_total || 0;
    const displayTotalRepliques = repliquesParLieuAll.totalRepliques || l.nb_repliques_total || 0;
    const totalDuree = repliquesParLieuAll.totalDuree || l.duree_totale_min || 0;

    // ── Épisodes par saison (comme dans personnages) ──────────────────────────
    const couleurBySaison = {};
    allSaisons.forEach(s => { couleurBySaison[s.numero] = s.couleur; });

    const allEpisodesWithSaison = allEpisodes.map(ep => ({
      ...ep,
      saison_numero: this._saisonNum(ep, allSaisons)
    }));
    const premiereAppEp = allEpisodesWithSaison.find(ep => ep.id == l.premiere_apparition_episode_id);
    const premiereAppLabel = premiereAppEp
      ? `S${premiereAppEp.saison_numero}E${String(premiereAppEp.numero_episode).padStart(2,'0')} · ${premiereAppEp.titre || 'Sans titre'}`
      : null;
    const premiereAppOptions = [
      '<option value="">Première apparition non définie</option>',
      ...allEpisodesWithSaison
        .filter(ep => ep.saison_numero && ep.numero_episode)
        .sort((a,b) => (a.saison_numero - b.saison_numero) || (a.numero_episode - b.numero_episode))
        .map(ep => {
          const label = `S${ep.saison_numero}E${String(ep.numero_episode).padStart(2,'0')} · ${ep.titre || 'Sans titre'}`;
          return `<option value="${ep.id}" ${l.premiere_apparition_episode_id == ep.id ? 'selected' : ''}>${this._escape(label)}</option>`;
        })
    ].join('');
    const uploadedSaisons = new Set(
      allEpisodesWithSaison
        .filter(ep => ep.has_texte || ep.stats_json || ep.nb_mots || ep.nb_scenes)
        .map(ep => ep.saison_numero)
        .filter(Boolean)
    );

    const epBySaison = {};
    episodesPresent.forEach(ep => {
      const sNum = this._saisonNum(ep, allSaisons);
      if (!epBySaison[sNum]) epBySaison[sNum] = [];
      epBySaison[sNum].push(ep);
    });

    const toutesSaisons = allSaisons.length
      ? allSaisons
          .map(s => s.numero)
          .filter(n => uploadedSaisons.size ? uploadedSaisons.has(n) : true)
          .sort((a,b)=>a-b)
      : [...new Set(episodesPresent.map(e => this._saisonNum(e, allSaisons)))].filter(Boolean).sort((a,b)=>a-b);

    const episodesGrid = (() => {
      if (!episodesPresent.length) return '<div class="js-style-89d67ef7">Aucune présence enregistrée</div>';

      const epPresentsSetBySaison = {};
      episodesPresent.forEach(ep => {
        const sNum = this._saisonNum(ep, allSaisons);
        if (!epPresentsSetBySaison[sNum]) epPresentsSetBySaison[sNum] = new Set();
        epPresentsSetBySaison[sNum].add(ep.numero_episode);
      });

      return `<div class="js-style-c8d29939">
        ${toutesSaisons.map(sNum => {
          const color = couleurBySaison[sNum] || `hsl(${((sNum * 47) % 360)},60%,55%)`;
          const epsPresents = epBySaison[sNum] || [];
          const hasSome = epsPresents.length > 0;

          // Tous les épisodes uploadés de cette saison, plus les présences manuelles éventuelles.
          const manualPresent = new Set(epsPresents.map(e => e.numero_episode));
          const tousEpsSaison = allEpisodesWithSaison
            .filter(e => e.saison_numero == sNum && (e.has_texte || e.stats_json || e.nb_mots || e.nb_scenes || manualPresent.has(e.numero_episode)))
            .map(e => e.numero_episode)
            .sort((a,b)=>a-b);

          const presentSet = epPresentsSetBySaison[sNum] || new Set();

          if (!hasSome) return `
            <div class="js-style-099531ab">
              <span style="font-family:var(--font-display);font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${color};flex-shrink:0;min-width:24px">S${sNum}</span>
              <span class="js-style-765974c5">—</span>
            </div>`;

          return `
            <div class="js-style-33700396">
              <span style="font-family:var(--font-display);font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${color};flex-shrink:0;min-width:24px">S${sNum}</span>
              <div class="js-style-4168b3fa">
                ${(tousEpsSaison.length ? tousEpsSaison : [...presentSet].sort((a,b)=>a-b)).map(num => `
                  <span style="font-family:var(--font-display);font-size:11px;font-weight:600;color:var(--text1);cursor:default;${!presentSet.has(num) ? 'opacity:0.2' : ''}">${num}</span>
                `).join('')}
              </div>
            </div>`;
        }).join('')}
      </div>`;
    })();

    // Saisons disponibles pour le filtre du graphique
    const saisonsChart = toutesSaisons;
    const saisonOpts = saisonsChart.map(s => `<option value="${s}">Saison ${s}</option>`).join('');

    // ── Co-présence décors ────────────────────────────────────────────────────
    const lieuxCo = repliquesParLieuAll.lieuxCo || [];
    const maxCoScenes = lieuxCo.length ? lieuxCo[0].nb_scenes : 1;

    const renderDecorChartCard = (metric, title) => `
      <div class="detail-card js-style-9eb125f5">
        <div class="detail-card-header js-style-88c6d1ff">
          <span>${title}</span>
          <div class="js-style-e3f61041">
            <select class="js-style-1797adc7" id="decor-chart-${metric}-filter" onchange="Decors._renderCharts()">
              <option value="all">Toutes les saisons</option>
              ${saisonOpts}
            </select>
            <button class="js-style-4bef6b49" id="decor-chart-${metric}-spacing-btn"
              onclick="Decors._toggleChartSpacing()"
              title="Afficher/masquer les épisodes uploadés où le décor est absent"
             >
              ⬜ Espacé
            </button>
          </div>
        </div>
        <div class="detail-card-body js-style-4d169730">
          <canvas class="js-style-cd509f26" id="decor-chart-${metric}-canvas"></canvas>
        </div>
      </div>`;

    modal.open(`
      <div class="js-style-6e244e5a">
        <div class="js-style-3e48f388">⬡</div>
        <div>
          <div class="modal-title js-style-5ae18299">${this._escape(l.nom)}</div>
          ${l.description ? `<div class="js-style-d113dd7b">${this._escape(l.description)}</div>` : ''}
          ${premiereAppLabel ? `<div class="js-style-3eb8fb41">Première apparition · ${this._escape(premiereAppLabel)}</div>` : ''}
          <div class="js-style-f3b08e88">
            <span class="js-style-73c0cafe">Première apparition</span>
            <select class="js-style-b2c42af2" onchange="Decors.setPremiereApparition(${l.id}, this.value)"
             >
              ${premiereAppOptions}
            </select>
            <span class="js-style-765974c5">avant = Pas encore</span>
          </div>
          <div class="js-style-b1ecc496">
            <label class="js-style-78918890">
              <input class="js-style-7013eefc" type="checkbox" id="toggle-principal-${l.id}" ${l.est_principal == 1 ? 'checked' : ''}
                onchange="Decors.togglePrincipal(${l.id}, this.checked)"
               >
              <span class="js-style-d772fd65">Décor principal</span>
            </label>
          </div>
        </div>
        <div class="js-style-3840f31e">
          ${navHtml}
          <button class="btn btn-secondary btn-sm" onclick="modal.close();Decors.openForm(${l.id})">✎ Modifier</button>
          <button class="btn btn-danger btn-sm" onclick="modal.close();Decors.confirmDelete(${l.id})">Supprimer</button>
        </div>
      </div>

      <!-- Stats globales -->
      <div class="big-stats-row js-style-7dde5e56">
        <div class="big-stat">
          <div class="big-stat-val">${displayNbEpisodes}</div>
          <div class="big-stat-label">Épisodes</div>
        </div>
        <div class="big-stat">
          <div class="big-stat-val">${displayTotalRepliques}</div>
          <div class="big-stat-label">Répliques dans ce décor</div>
        </div>
        <div class="big-stat">
          <div class="big-stat-val">${displayTotalScenes}</div>
          <div class="big-stat-label">Scènes détectées</div>
        </div>
        <div class="big-stat">
          <div class="big-stat-val">${totalDuree > 0 ? fmtDuree(totalDuree) : '—'}</div>
          <div class="big-stat-label">Durée décor</div>
        </div>
      </div>

      <div class="js-style-0a1d28e2">

        <!-- Répliques par personnage DANS ce décor -->
        ${repliquesParLieuAll.perso?.length ? `
        <div class="detail-card">
          <div class="detail-card-header js-style-83ba15bd">
            <span>Répliques dans ce décor — par personnage</span>
            <select class="js-style-1797adc7" id="decor-perso-filter" onchange="Decors._renderDecorBreakdowns()">
              <option value="all">Toutes les saisons</option>
              ${saisonOpts}
            </select>
          </div>
          <div class="detail-card-body" id="decor-perso-breakdown-body"></div>
        </div>
        ` : '<div></div>'}

        <!-- Épisodes par saison (style personnages) -->
        <div class="detail-card">
          <div class="detail-card-header">Épisodes</div>
          <div class="detail-card-body">
            ${episodesGrid}
          </div>
        </div>

        <!-- Liste détaillée des présences -->
        <div class="detail-card js-style-97294b20">
          <div class="detail-card-header">Présences (${episodesPresent.length})</div>
          <div class="detail-card-body js-style-e07e367f">
            ${!episodesPresent.length ? '<div class="js-style-89d67ef7">Aucune présence enregistrée</div>' :
              episodesPresent.map(ep => {
                const sNum = this._saisonNum(ep, allSaisons);
                const sColor = couleurBySaison[sNum] || `hsl(${((sNum * 47) % 360)},60%,55%)`;
                const ld = this._decorStats(ep, l.id);
                const replDansDecor = ld?.nb_repliques || 0;
                const scenesDansDecor = ld?.nb_scenes || 0;
                const dureeDansDecor = ld?.duree_min || 0;
                return `
                <div class="js-style-3d77909d">
                  <span style="font-size:11px;color:${sColor};min-width:50px">S${sNum}E${String(ep.numero_episode).padStart(2,'0')}</span>
                  <span class="js-style-ca0f3320">${this._escape(ep.titre || 'Sans titre')}</span>
                  <span class="js-style-d947302c">
                    <span class="js-style-765974c5">${ld ? scenesDansDecor : 'à détecter'}${ld ? ` scène${scenesDansDecor > 1 ? 's' : ''}` : ''}</span>
                    <span class="js-style-e3405269">${ld ? replDansDecor : '—'} répl.</span>
                    ${dureeDansDecor > 0 ? `<span class="js-style-5817cb1d">${fmtDuree(dureeDansDecor)}</span>` : '<span class="js-style-765974c5">—</span>'}
                  </span>
                </div>`;
              }).join('')
            }
          </div>
        </div>

        ${episodesPasEncore.length ? `
        <div class="detail-card js-style-97294b20">
          <div class="detail-card-header">Pas encore existant (${episodesPasEncore.length})</div>
          <div class="detail-card-body js-style-9aff6bb0">
            ${episodesPasEncore.map(ep => {
              const sNum = this._saisonNum(ep, allSaisons);
              return `<span class="js-style-adc85671">
                S${sNum}E${String(ep.numero_episode).padStart(2,'0')} ${ep.titre ? '— ' + this._escape(ep.titre) : ''}
              </span>`;
            }).join('')}
          </div>
        </div>
        ` : ''}
      </div>

      <!-- Graphiques par épisode -->
      ${episodesPresent.length ? `
        ${renderDecorChartCard('scenes', 'Scènes par épisode')}
        ${renderDecorChartCard('repliques', 'Répliques dans ce décor par épisode')}
      ` : ''}

      <!-- Co-présence décors -->
      ${lieuxCo.length ? `
      <div class="detail-card js-style-9eb125f5">
        <div class="detail-card-header js-style-83ba15bd">
          <span>Co-présence — décors les plus fréquents</span>
          <select class="js-style-1797adc7" id="decor-copresence-filter" onchange="Decors._renderDecorBreakdowns()">
            <option value="all">Toutes les saisons</option>
            ${saisonOpts}
          </select>
        </div>
        <div class="detail-card-body" id="decor-copresence-breakdown-body"></div>
      </div>` : ''}
    `);

    window._decorBreakdownContext = {
      episodes: episodesPresent,
      lieuId: l.id,
      personnagesIndex
    };
    this._renderDecorBreakdowns();

    // Initialiser le graphique après l'insertion dans le DOM
    if (episodesPresent.length) {
      window._decorChartEpisodes    = episodesPresent;
      window._decorChartAllEpisodes = allEpisodesWithSaison.filter(e => e.has_texte || e.stats_json || e.nb_mots || e.nb_scenes);
      window._decorChartLieuId      = l.id;
      window._decorChartCouleurs    = couleurBySaison;
      this._chartSpaced = false;
      setTimeout(() => Decors._renderCharts(), 50);
    }
  },

  _computeDecorBreakdowns(filter = 'all') {
    const ctx = window._decorBreakdownContext || {};
    const episodes = ctx.episodes || [];
    const lieuId = ctx.lieuId;
    const personnagesIndex = ctx.personnagesIndex || new Map();
    const persoAgg = {};
    const lieuxCoAgg = {};

    episodes.forEach(ep => {
      const sNum = this._saisonNum(ep);
      if (filter !== 'all' && String(sNum) !== String(filter)) return;

      const sj = this._statsJson(ep);
      if (!sj) return;

      const lieuData = this._decorStats(ep, lieuId);
      if (!lieuData) return;

      (lieuData.personnages || []).forEach(p => {
        const matched = personnagesIndex.get(this._normPersonName(p.nom));
        if (!matched) return;
        persoAgg[matched.label] = (persoAgg[matched.label] || 0) + (p.nb_repliques || 0);
      });

      (sj.repliques_par_lieu || []).forEach(autre => {
        if (autre.lieu_id == lieuId) return;
        if (!autre.nb_scenes) return;
        if (!lieuxCoAgg[autre.lieu_id]) {
          const found = this.data.find(d => d.id == autre.lieu_id);
          lieuxCoAgg[autre.lieu_id] = {
            nom: found?.nom || autre.nom || `Décor #${autre.lieu_id}`,
            nb_episodes: 0,
            nb_scenes: 0
          };
        }
        lieuxCoAgg[autre.lieu_id].nb_episodes += 1;
        lieuxCoAgg[autre.lieu_id].nb_scenes += autre.nb_scenes || 0;
      });
    });

    const perso = Object.entries(persoAgg).sort((a, b) => b[1] - a[1]);
    const lieuxCo = Object.entries(lieuxCoAgg)
      .map(([lieu_id, v]) => ({ lieu_id, ...v }))
      .sort((a, b) => b.nb_scenes - a.nb_scenes);

    return {
      perso,
      maxR: perso.length ? perso[0][1] : 1,
      lieuxCo,
      maxCoScenes: lieuxCo.length ? lieuxCo[0].nb_scenes : 1
    };
  },

  _renderDecorBreakdowns() {
    const persoBody = document.getElementById('decor-perso-breakdown-body');
    if (persoBody) {
      const filter = document.getElementById('decor-perso-filter')?.value || 'all';
      const data = this._computeDecorBreakdowns(filter);
      persoBody.innerHTML = data.perso.length ? data.perso.map(([nom, nb]) => `
        <div class="js-style-e4ad4a16">
          <div class="js-style-1c77273d">
            <span class="js-style-758a8873">${this._escape(nom)}</span>
            <span class="js-style-50197c32">${nb} répl.</span>
          </div>
          <div class="js-style-7b29ddf5">
            <div style="height:100%;width:${Math.round(nb / data.maxR * 100)}%;background:var(--accent);border-radius:3px"></div>
          </div>
        </div>
      `).join('') : `
        <div class="js-style-89d67ef7">Aucun personnage renseigné pour ce décor dans cette saison.</div>
      `;
    }

    const coBody = document.getElementById('decor-copresence-breakdown-body');
    if (coBody) {
      const filter = document.getElementById('decor-copresence-filter')?.value || 'all';
      const data = this._computeDecorBreakdowns(filter);
      coBody.innerHTML = data.lieuxCo.length ? data.lieuxCo.slice(0, 10).map(c => {
        const pct = Math.round((c.nb_scenes / data.maxCoScenes) * 100);
        return `
          <div class="js-style-f0d4a17f">
            <div class="js-style-9bcafbdc">⬡</div>
            <div class="js-style-a07604d3">
              <div class="js-style-05000290">${this._escape(c.nom)}</div>
              <div class="js-style-002c95ff">
                <div style="height:4px;background:var(--accent);border-radius:2px;width:${pct}%"></div>
              </div>
            </div>
            <div class="js-style-7bb75e0c">${c.nb_episodes} ép. · ${c.nb_scenes} scène${c.nb_scenes > 1 ? 's' : ''}</div>
          </div>
        `;
      }).join('') : `
        <div class="js-style-89d67ef7">Aucun autre décor fréquent pour cette saison.</div>
      `;
    }
  },

  _chartSpaced: false,

  _toggleChartSpacing() {
    this._chartSpaced = !this._chartSpaced;
    this._syncChartSpacingButtons();
    this._renderCharts();
  },

  _syncChartSpacingButtons() {
    ['scenes', 'repliques'].forEach(metric => {
      const btn = document.getElementById(`decor-chart-${metric}-spacing-btn`);
      if (!btn) return;
      btn.textContent = this._chartSpaced ? '▦ Espacé' : '⬜ Espacé';
      btn.style.background = this._chartSpaced ? 'var(--bg4)' : 'var(--bg3)';
      btn.style.color = this._chartSpaced ? 'var(--text1)' : 'var(--text2)';
    });
  },

  _renderChart() {
    this._renderCharts();
  },

  _renderCharts() {
    this._renderMetricChart('scenes');
    this._renderMetricChart('repliques');
  },

  _renderMetricChart(metric) {
    const canvas = document.getElementById(`decor-chart-${metric}-canvas`);
    if (!canvas) return;

    const lieuId      = window._decorChartLieuId;
    const decorEps    = window._decorChartEpisodes || [];   // épisodes où le décor est présent
    const allEps      = window._decorChartAllEpisodes || [];
    const couleurs    = window._decorChartCouleurs || {};
    const filter      = document.getElementById(`decor-chart-${metric}-filter`)?.value || 'all';

    // Map clé "saison-ep" → métrique précise dans ce décor.
    const metricMap = {};
    decorEps.forEach(ep => {
      const sNum = this._saisonNum(ep);
      const ld = this._decorStats(ep, lieuId);
      const value = metric === 'scenes' ? (ld?.nb_scenes || 0) : (ld?.nb_repliques || 0);
      metricMap[`${sNum}-${ep.numero_episode}`] = {
        value,
        precise: !!ld
      };
    });

    // Source de la timeline
    let sourceTimeline;
    if (this._chartSpaced && allEps.length) {
      sourceTimeline = filter === 'all' ? allEps : allEps.filter(e => String(e.saison_numero) === filter);
    } else {
      sourceTimeline = filter === 'all' ? decorEps : decorEps.filter(e => {
        const sNum = this._saisonNum(e);
        return String(sNum) === filter;
      });
    }

    const slots = sourceTimeline.map(e => {
      const sNum = this._saisonNum(e);
      const key  = `${sNum}-${e.numero_episode}`;
      const data = metricMap[key] || null;
      return {
        saison_numero: sNum,
        numero_episode: e.numero_episode,
        value: data?.value ?? null,
        precise: data?.precise || false,
        present: !!data
      };
    });

    const maxV  = Math.max(...slots.map(s => s.value || 0), 1);
    const BAR_W = 12;
    const GAP   = 3;
    const H     = 140;
    const PAD_L = 28;
    const PAD_B = 20;
    const totalW = Math.max(600, PAD_L + slots.length * (BAR_W + GAP));

    canvas.width  = totalW;
    canvas.height = H + PAD_B;
    canvas.style.width  = totalW + 'px';
    canvas.style.height = (H + PAD_B) + 'px';

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const text3 = getComputedStyle(document.documentElement).getPropertyValue('--text3').trim() || '#666';
    const label = metric === 'scenes' ? 'scènes' : 'répl.';

    if (!slots.length) {
      ctx.fillStyle = text3;
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Aucun épisode à afficher pour ce filtre', PAD_L, 44);
      return;
    }

    // Lignes de grille
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = H - (i / 4) * H;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(totalW, y); ctx.stroke();
    }

    // Barres
    slots.forEach((slot, i) => {
      const x = PAD_L + i * (BAR_W + GAP);
      const color = couleurs[slot.saison_numero] || `hsl(${((slot.saison_numero || 1) * 47) % 360},60%,55%)`;

      if (slot.present && slot.value > 0) {
        const barH = Math.max(2, Math.round((slot.value / maxV) * H));
        const y = H - barH;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, BAR_W, barH, [2,2,0,0]);
        else ctx.rect(x, y, BAR_W, barH);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (slot.present) {
        // Présence connue, mais détail scène/réplique pas disponible.
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.65;
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(x, H - 8, BAR_W, 6);
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      } else if (this._chartSpaced) {
        // Épisode absent en mode espacé → petit tiret discret
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.15;
        ctx.fillRect(x, H - 2, BAR_W, 2);
        ctx.globalAlpha = 1;
      }

      // Label épisode
      if (i % 10 === 0 || slots.length <= 20) {
        ctx.fillStyle = text3;
        ctx.globalAlpha = slot.present ? 1 : 0.35;
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`E${slot.numero_episode}`, x + BAR_W / 2, H + PAD_B - 4);
        ctx.globalAlpha = 1;
      }
    });

    // Axe Y
    ctx.fillStyle = text3;
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = Math.round((i / 4) * maxV);
      const y   = H - (i / 4) * H;
      ctx.fillText(val, PAD_L - 3, y + 3);
    }
    ctx.textAlign = 'left';
    ctx.globalAlpha = 0.7;
    ctx.fillText(label, PAD_L, 10);
    ctx.globalAlpha = 1;
  },

  async togglePrincipal(id, isPrincipal) {
    const l = this.data.find(x => x.id == id);
    if (!l) return;
    await api.put(`lieux/${id}`, { ...l, est_principal: isPrincipal ? 1 : 0 });
    toast(isPrincipal ? 'Décor marqué principal' : 'Décor retiré des principaux', 'success');
    await this.init();
  },

  async setPremiereApparition(id, episodeId) {
    const l = this.data.find(x => x.id == id);
    if (!l) return;

    await api.put(`lieux/${id}`, {
      ...l,
      premiere_apparition_episode_id: episodeId ? parseInt(episodeId, 10) : null
    });

    toast(episodeId
      ? 'Première apparition enregistrée, épisodes précédents marqués “Pas encore”'
      : 'Première apparition retirée',
      'success'
    );

    await this.init();
    modal.close();
    await this.openDetail(id);
    if (typeof Episodes !== 'undefined') Episodes.loadAll().then(() => Episodes.render()).catch(() => {});
  },

  async autoDetect() {
    if (!confirm("Auto-remplir les décors depuis les textes uploadés ? Les présences détectées seront ajoutées aux épisodes, les anciennes fausses détections auto seront nettoyées, et les statuts “Pas encore” seront respectés.")) return;
    toast('Détection des décors en cours…', 'info');
    try {
      const res = await api.post('decors_auto', {});
      toast(`${res.episodes_analyses || 0} épisode(s) analysé(s), ${res.presences_detectees || 0} présence(s) décor détectée(s)`, 'success');
      await this.init();
    } catch (e) {
      console.error(e);
      toast("Erreur pendant l'auto-détection des décors", 'error');
    }
  },

  async openForm(id) {
    const isNew = !id;
    const l = isNew ? {} : this.data.find(x => x.id == id) || {};
    let premiereOptions = '<option value="">Aucune / à définir</option>';

    try {
      const [episodes, saisons] = await Promise.all([api.get('episodes'), DataStore.get('saisons')]);
      const episodesSorted = (episodes || [])
        .map(ep => ({
          ...ep,
          saison_numero: this._saisonNum(ep, saisons || [])
        }))
        .filter(ep => ep.saison_numero && ep.numero_episode)
        .sort((a, b) => (a.saison_numero - b.saison_numero) || (a.numero_episode - b.numero_episode));

      premiereOptions += episodesSorted.map(ep => {
        const label = `S${ep.saison_numero}E${String(ep.numero_episode).padStart(2,'0')} · ${ep.titre || 'Sans titre'}`;
        return `<option value="${ep.id}" ${l.premiere_apparition_episode_id == ep.id ? 'selected' : ''}>${this._escape(label)}</option>`;
      }).join('');
    } catch(e) {
      console.error(e);
    }

    modal.open(`
      <div class="modal-title">${isNew ? '+ Nouveau décor' : '✎ Modifier ' + this._escape(l.nom)}</div>
      <div class="form-grid cols1">
        <div class="form-group">
          <label>Nom du décor *</label>
          <input type="text" id="df-nom" value="${this._attr(l.nom || '')}" placeholder="Ex: Appartement de Marie, Le bureau…">
        </div>
        <div class="form-group">
          <label>Nom d'affichage <span class="js-style-63bab7b6">(abréviation dans la grille)</span></label>
          <input type="text" id="df-affichage" value="${this._attr(l.nom_affichage || '')}" placeholder="Ex: Appt, Bureau…" maxlength="8">
        </div>
        <div class="form-group">
          <label>Première apparition</label>
          <select id="df-premiere-app">
            ${premiereOptions}
          </select>
          <div class="js-style-d4780964">
            Les épisodes avant cette date seront marqués “Pas encore” et ignorés par l’auto-détection.
          </div>
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea id="df-desc">${this._escape(l.description || '')}</textarea>
        </div>
        <div class="form-group">
          <label class="js-style-96acd2d9">
            <input class="js-style-41545075" type="checkbox" id="df-principal" ${l.est_principal == 1 ? 'checked' : ''}
             >
            Décor principal (apparaît en colonne dans la grille épisodes)
          </label>
        </div>
      </div>
      <div class="js-style-4f8eb24e">
        <button class="btn btn-ghost" onclick="modal.close()">Annuler</button>
        <button class="btn btn-primary" onclick="Decors.save(${id || 'null'})">${isNew ? 'Créer' : 'Enregistrer'}</button>
      </div>
    `);
  },

  async save(id) {
    const nom = document.getElementById('df-nom').value.trim();
    if (!nom) { toast('Le nom est requis', 'error'); return; }
    const data = {
      nom,
      nom_affichage: document.getElementById('df-affichage').value.trim() || null,
      description: document.getElementById('df-desc').value.trim(),
      est_principal: document.getElementById('df-principal').checked ? 1 : 0,
      premiere_apparition_episode_id: document.getElementById('df-premiere-app')?.value || null
    };
    if (id) {
      await api.put(`lieux/${id}`, data);
      toast('Décor mis à jour', 'success');
    } else {
      await api.post('lieux', data);
      toast('Décor créé', 'success');
    }
    modal.close();
    await this.init();
    // Rafraîchir episodes si ouvert
    if (typeof Episodes !== 'undefined') Episodes.loadAll().then(() => Episodes.render()).catch(() => {});
  },

  async confirmDelete(id) {
    if (!confirm('Supprimer ce décor ?')) return;
    await api.delete(`lieux/${id}`);
    toast('Décor supprimé', 'info');
    await this.init();
  }
};
