// assets/js/personnages.js

const Personnages = {
  data: [],
  tous: [],
  activeDetail: null,

  async init() {
    this.tous = await DataStore.get('personnages');
    this.render();
  },

  vue: 'fiches',

  _vues() {
    return `<div class="an-ligne vues-onglet" role="group" aria-label="Vue">${[['fiches', 'Fiches'], ['relations', 'Relations'], ['secrets', 'Qui sait quoi'], ['etats', 'États']].map(([k, l]) => `<button type="button" class="an-choix ${this.vue === k ? 'actif' : ''}" aria-pressed="${this.vue === k}" onclick="Personnages.choisirVue('${k}')">${l}</button>`).join('')}</div>`;
  },

  choisirVue(v) {
    this.vue = v;
    this.render();
  },

  render() {
    const tab = document.getElementById('tab-personnages');
    if (this.vue === 'relations') {
      tab.innerHTML = `<div class="section-header"><div class="section-title">◎ Personnages · relations</div><div class="section-actions">${this._vues()}</div></div><div class="vue-monde" id="graphe-vue"></div>`;
      Graphe.monter(document.getElementById('graphe-vue'));
      return;
    }
    if (this.vue === 'etats') {
      tab.innerHTML = `<div class="section-header"><div class="section-title">◎ Personnages · états</div><div class="section-actions">${this._vues()}</div></div><div class="vue-monde" id="etats-vue"></div>`;
      Etats.monter(document.getElementById('etats-vue'));
      return;
    }
    if (this.vue === 'secrets') {
      tab.innerHTML = `<div class="section-header"><div class="section-title">◎ Personnages · qui sait quoi</div><div class="section-actions">${this._vues()}</div></div><div class="vue-monde" id="secrets-vue"></div>`;
      Secrets.monter(document.getElementById('secrets-vue'));
      return;
    }
    const principaux   = this.tous.filter(p => p.est_principal == 2);
    const recurrents   = this.tous.filter(p => p.est_principal == 1);
    const autres       = this.tous.filter(p => p.est_principal == 0);

    const renderSection = (titre, liste, emptyMsg) => {
      if (!liste.length) return `
        <div style="padding:8px 24px;font-family:var(--font-display);font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text3)">${titre}</div>
        <div style="padding:0 24px 16px;color:var(--text3);font-size:12px">${emptyMsg}</div>
      `;
      return `
        <div style="padding:8px 24px 0;font-family:var(--font-display);font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text3)">${titre} <span style="opacity:0.5">(${liste.length})</span></div>
        <div class="personnages-grid">
          ${liste.map(p => this.renderCard(p)).join('')}
        </div>
      `;
    };

    tab.innerHTML = `
      <div class="section-header">
        <div class="section-title">◎ Personnages</div>
        <div class="section-actions">
          ${this._vues()}
          <button class="btn btn-primary" onclick="Personnages.openForm(null)">+ Ajouter un personnage</button>
        </div>
      </div>

      ${this.tous.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">◎</div>
          <div class="empty-title">Aucun personnage</div>
          <div class="empty-sub">Ajoutez vos personnages pour commencer</div>
        </div>
      ` : `
        ${renderSection('Personnages principaux', principaux, 'Aucun personnage principal')}

        ${(recurrents.length || autres.length) ? `<hr style="border:none;border-top:1px solid var(--border);margin:4px 0">` : ''}

        ${renderSection('Personnages récurrents', recurrents, 'Aucun personnage récurrent')}

        ${autres.length ? `<hr style="border:none;border-top:1px solid var(--border);margin:4px 0">` : ''}

        ${autres.length ? renderSection('Autres personnages', autres, '') : ''}
      `}
    `;
  },

  renderCard(p) {
    const stats = p.stats || {};
    const typeLabel = p.est_principal == 2 ? 'Principal' : p.est_principal == 1 ? 'Récurrent' : 'Autre';
    const typeBadgeColor = p.est_principal == 2 ? 'var(--accent)' : p.est_principal == 1 ? 'var(--accent3)' : 'var(--bg4)';
    const typeBadgeText = p.est_principal == 2 ? '#000' : p.est_principal == 1 ? '#000' : 'var(--text3)';
    return `
      <div class="personnage-card" onclick="Personnages.openDetail(${p.id})">
        ${p.est_principal == 2 ? '<div class="principal-badge">Principal</div>' : p.est_principal == 1 ? `<div class="principal-badge" style="background:var(--accent3);color:#000">Récurrent</div>` : ''}
        <div class="personnage-card-top">
          <div class="personnage-avatar" style="background:${p.couleur_identite};border-color:${p.couleur_identite}">
            ${this._escape(p.prenom[0].toUpperCase())}
          </div>
          <div class="personnage-card-info">
            <div class="personnage-prenom">${this._escape(p.prenom)} ${this._escape(p.nom || '')}</div>
            <div class="personnage-role">${this._escape(p.profession || (p.sexe ? this.sexeLabel(p.sexe) : 'Personnage'))}</div>
            ${p.age ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">${p.age} ans</div>` : ''}
          </div>
        </div>
        <div class="personnage-card-stats">
          <div class="perso-stat">
            <div class="perso-stat-val">${stats.nb_episodes || 0}</div>
            <div class="perso-stat-label">épisodes</div>
          </div>
          <div class="perso-stat">
            <div class="perso-stat-val">${stats.total_repliques || 0}</div>
            <div class="perso-stat-label">répliques</div>
          </div>
          ${stats.pct_presence !== undefined ? `
          <div class="perso-stat">
            <div class="perso-stat-val" style="color:var(--accent3)">${stats.pct_presence}%</div>
            <div class="perso-stat-label">présence</div>
          </div>` : ''}
          ${stats.duree_totale_min > 0 ? (() => {
            const h = Math.floor(stats.duree_totale_min / 60);
            const m = stats.duree_totale_min % 60;
            const s = h > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${m} min`;
            return `
          <div class="perso-stat">
            <div class="perso-stat-val" style="font-size:12px">${s}</div>
            <div class="perso-stat-label">durée est.</div>
          </div>`;
          })() : ''}
        </div>
      </div>
    `;
  },

  sexeLabel(s) {
    const m = { 'F': 'Femme', 'M': 'Homme', 'NB': 'Non-binaire', 'autre': 'Autre' };
    return m[s] || s;
  },

  _escape(v) {
    const div = document.createElement('div');
    div.textContent = v ?? '';
    return div.innerHTML;
  },

  _attr(v) {
    return this._escape(v).replace(/"/g, '&quot;');
  },

  _episodeLabel(ep) {
    if (!ep) return 'Aucun épisode';
    const s = ep.saison_numero ? `S${ep.saison_numero}E${String(ep.numero_episode).padStart(2, '0')}` : 'Épisode';
    return `${s}${ep.titre ? ' · ' + ep.titre : ''}`;
  },

  _episodeOptions(selectedId = '') {
    const episodes = this.activeDetail?.episodes || [];
    return `
      <option value="">Aucun épisode précis</option>
      ${episodes.map(ep => `
        <option value="${ep.id}" ${String(selectedId || '') === String(ep.id) ? 'selected' : ''}>${this._escape(this._episodeLabel(ep))}</option>
      `).join('')}
    `;
  },

  renderMomentsDecisifs(p) {
    const rows = p.moments_decisifs || [];
    return `
      <div class="detail-card" style="margin-top:20px">
        <div class="detail-card-header" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <span>Moments décisifs</span>
          <button class="btn btn-secondary btn-sm" onclick="Personnages.openMomentForm(null)">+ Ajouter</button>
        </div>
        <div class="detail-card-body">
          ${rows.length ? rows.map(m => `
            <div style="padding:10px 0;border-bottom:1px solid var(--border)">
              <div style="display:flex;gap:10px;align-items:flex-start">
                <div style="flex:1;min-width:0">
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                    <span style="font-family:var(--font-display);font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--accent3)">${this._escape(m.type_moment || 'Moment')}</span>
                    ${m.episode_id ? `<span style="font-size:10px;color:${m.saison_couleur || 'var(--text3)'}">S${m.saison_numero}E${String(m.numero_episode).padStart(2, '0')}</span>` : ''}
                  </div>
                  <div style="font-size:13px;font-weight:700;margin-top:4px">${this._escape(m.titre || 'Moment décisif')}</div>
                  ${m.description ? `<div style="font-size:12px;color:var(--text2);line-height:1.5;margin-top:4px">${this._escape(m.description)}</div>` : ''}
                </div>
                <div style="display:flex;gap:4px;flex-shrink:0">
                  <button class="btn btn-ghost btn-sm" onclick="Personnages.openMomentForm(${m.id})">✎</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="Personnages.deleteMoment(${m.id})">×</button>
                </div>
              </div>
            </div>
          `).join('') : '<div style="color:var(--text3);font-size:12px">Aucun moment décisif renseigné.</div>'}
        </div>
      </div>
    `;
  },

  renderRepliquesSignature(p) {
    const rows = p.repliques_signature || [];
    return `
      <div class="detail-card" style="margin-top:20px">
        <div class="detail-card-header" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <span>Répliques signature</span>
          <button class="btn btn-secondary btn-sm" onclick="Personnages.openSignatureForm(null)">+ Ajouter</button>
        </div>
        <div class="detail-card-body">
          ${rows.length ? rows.map(sig => `
            <div style="padding:10px 0;border-bottom:1px solid var(--border)">
              <div style="display:flex;gap:10px;align-items:flex-start">
                <div style="flex:1;min-width:0">
                  <div style="font-size:14px;font-weight:800;color:var(--accent)">“${this._escape(sig.expression || '')}”</div>
                  <div style="display:flex;gap:8px;align-items:center;margin-top:4px;flex-wrap:wrap">
                    ${sig.episode_id ? `<span style="font-size:10px;color:${sig.saison_couleur || 'var(--text3)'}">S${sig.saison_numero}E${String(sig.numero_episode).padStart(2, '0')}</span>` : ''}
                    ${sig.note ? `<span style="font-size:12px;color:var(--text2)">${this._escape(sig.note)}</span>` : ''}
                  </div>
                </div>
                <div style="display:flex;gap:4px;flex-shrink:0">
                  <button class="btn btn-ghost btn-sm" onclick="Personnages.openSignatureForm(${sig.id})">✎</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="Personnages.deleteSignature(${sig.id})">×</button>
                </div>
              </div>
            </div>
          `).join('') : '<div style="color:var(--text3);font-size:12px">Aucune réplique ou expression signature renseignée.</div>'}
        </div>
      </div>
    `;
  },

  async openDetail(id) {
    const p = await api.get(`personnages/${id}`);
    this.activeDetail = p;

    // Navigation among visible personnages in same category
    const sameGroup = this.tous.filter(x => x.est_principal == p.est_principal);
    const idx = sameGroup.findIndex(x => x.id == id);
    const prevId = idx > 0 ? sameGroup[idx - 1].id : null;
    const nextId = idx < sameGroup.length - 1 ? sameGroup[idx + 1].id : null;
    const navHtml = `
      <div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" onclick="modal.close();Personnages.openDetail(${prevId})" ${!prevId ? 'disabled style="opacity:0.3"' : ''} title="Personnage précédent (←)">◀</button>
        <button class="btn btn-ghost btn-sm" onclick="modal.close();Personnages.openDetail(${nextId})" ${!nextId ? 'disabled style="opacity:0.3"' : ''} title="Personnage suivant (→)">▶</button>
      </div>
    `;
    modal.setNav(
      prevId ? () => { modal.close(); Personnages.openDetail(prevId); } : null,
      nextId ? () => { modal.close(); Personnages.openDetail(nextId); } : null
    );

    modal.open(`
      <div style="display:flex;align-items:center;gap:20px;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid var(--border)">
        <div style="width:72px;height:72px;border-radius:50%;background:${p.couleur_identite};display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:28px;font-weight:800;color:#000;border:3px solid ${p.couleur_identite};flex-shrink:0">
          ${this._escape(p.prenom[0].toUpperCase())}
        </div>
        <div>
          <div class="modal-title" style="border:none;padding:0;margin:0">${this._escape(p.prenom)} ${this._escape(p.nom || '')}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:4px">
            ${p.est_principal == 2
              ? '<span style="background:#FFEE8C;color:#000;font-size:9px;padding:2px 6px;border-radius:10px;font-weight:700">PRINCIPAL</span> '
              : p.est_principal == 1
              ? '<span style="background:var(--accent3);color:#000;font-size:9px;padding:2px 6px;border-radius:10px;font-weight:700">RÉCURRENT</span> '
              : '<span style="background:var(--bg4);color:var(--text3);font-size:9px;padding:2px 6px;border-radius:10px;font-weight:700">AUTRE</span> '}
            ${this._escape(p.profession || '')} ${p.age ? '· ' + p.age + ' ans' : ''}
          </div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
          ${navHtml}
          <button class="btn btn-secondary btn-sm" onclick="modal.close();Personnages.openForm(${p.id})">✎ Modifier</button>
          <button class="btn btn-danger btn-sm" onclick="modal.close();Personnages.confirmDelete(${p.id})">Supprimer</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div>
          <div class="detail-card">
            <div class="detail-card-header">Infos</div>
            <div class="detail-card-body">
              ${p.sexe ? `<div class="stat-row"><span class="stat-label">Sexe</span><span>${this._escape(this.sexeLabel(p.sexe))}</span></div>` : ''}
              ${p.age ? `<div class="stat-row"><span class="stat-label">Âge</span><span>${p.age} ans</span></div>` : ''}
              ${p.date_naissance ? `<div class="stat-row"><span class="stat-label">Né(e) le</span><span>${fmtDate(p.date_naissance)}</span></div>` : ''}
              ${p.profession ? `<div class="stat-row"><span class="stat-label">Profession</span><span>${this._escape(p.profession)}</span></div>` : ''}
              ${p.caracteristiques ? `<div style="margin-top:10px;font-size:12px;color:var(--text2);line-height:1.6">${this._escape(p.caracteristiques)}</div>` : ''}
            </div>
          </div>

          <div class="detail-card">
            <div class="detail-card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
              <span>Stats</span>
              <select id="perso-stats-filter" onchange="Personnages._renderStats()" style="font-size:11px;background:var(--bg3);border:1px solid var(--border);color:var(--text1);padding:2px 6px;border-radius:4px">
                <option value="all">Toutes les saisons</option>
                ${(() => {
                  const saisons = [...new Set((p.episodes || []).map(e => e.saison_numero))].sort((a,b)=>a-b);
                  return saisons.map(s => `<option value="${s}">Saison ${s}</option>`).join('');
                })()}
              </select>
            </div>
            <div class="detail-card-body" id="perso-stats-body"></div>
          </div>

          ${(p.relations || []).length ? `
          <div class="detail-card">
            <div class="detail-card-header">Relations</div>
            <div class="detail-card-body">
              <div class="relations-list">
                ${p.relations.map(r => `
                  <div class="relation-item">
                    <div style="width:28px;height:28px;border-radius:50%;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${this._escape(r.autre_prenom[0])}</div>
                    <div>
                      <div style="font-size:12px;font-weight:700">${this._escape(r.autre_prenom)}</div>
                      <div class="relation-type">${this._escape(r.type_relation)}</div>
                    </div>
                    ${r.description ? `<div style="font-size:11px;color:var(--text3);margin-left:auto">${this._escape(r.description)}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          </div>` : ''}
        </div>

        <div>
          <div class="detail-card">
            <div class="detail-card-header">Épisodes</div>
            <div class="detail-card-body">
              ${(() => {
                const episodes = p.episodes || [];
                if (!episodes.length) return '<div style="color:var(--text3);font-size:12px">Aucun épisode</div>';

                // Toutes les saisons de la série depuis saisons_info (fourni par l'API)
                const allSaisons = (p.saisons_info || []);
                // Couleur par saison_numero — depuis saisons_info, sinon depuis les épisodes eux-mêmes
                const couleurBySaison = {};
                allSaisons.forEach(s => { couleurBySaison[s.numero] = s.couleur; });
                // Fallback : récupérer la couleur depuis les épisodes du perso (saison_couleur)
                episodes.forEach(ep => {
                  if (!couleurBySaison[ep.saison_numero] && ep.saison_couleur)
                    couleurBySaison[ep.saison_numero] = ep.saison_couleur;
                });
                const getSaisonColor = (num) => couleurBySaison[num] || `hsl(${((num * 47) % 360)},60%,55%)`;

                // Saisons qui ont au moins un épisode dans la série (depuis tous_episodes)
                const saisonsAvecEpisodes = new Set((p.tous_episodes || []).map(e => e.saison_numero));
                const saisonsPresent = new Set(episodes.map(e => e.saison_numero));
                const toutesSaisons = allSaisons.length
                  ? allSaisons.map(s => s.numero).filter(n => saisonsAvecEpisodes.has(n)).sort((a,b)=>a-b)
                  : [...saisonsPresent].sort((a,b)=>a-b);

                // Grouper les épisodes par saison
                const epBySaison = {};
                episodes.forEach(ep => {
                  if (!epBySaison[ep.saison_numero]) epBySaison[ep.saison_numero] = [];
                  epBySaison[ep.saison_numero].push(ep);
                });

                const isPrincipal = p.est_principal == 2;

                return `
                  <div style="display:flex;flex-direction:column;gap:5px">
                    ${toutesSaisons.map(sNum => {
                      const color = getSaisonColor(sNum);
                      const eps = epBySaison[sNum] || [];
                      const present = eps.length > 0;

                      if (!present && !isPrincipal) return '';

                      // Tous les épisodes de cette saison dans la série
                      const tousEpsSaison = (p.tous_episodes || [])
                        .filter(e => e.saison_numero == sNum)
                        .map(e => e.numero_episode)
                        .sort((a,b)=>a-b);
                      const epPresentsSet = new Set(eps.map(e => e.numero_episode));

                      return `
                        <div style="display:flex;align-items:baseline;gap:10px;${!present ? 'opacity:0.3' : ''}">
                          <span style="
                            font-family:var(--font-display);font-size:10px;font-weight:700;
                            letter-spacing:0.06em;text-transform:uppercase;
                            color:${color};flex-shrink:0;min-width:24px;
                          ">S${sNum}</span>
                          <div style="display:flex;flex-wrap:wrap;gap:1px 5px;line-height:1.7">
                            ${present
                              ? (isPrincipal ? tousEpsSaison : eps.sort((a,b)=>a.numero_episode-b.numero_episode).map(e=>e.numero_episode)).map(num => `
                                  <span title="${this._attr((eps.find(e=>e.numero_episode==num)||{}).titre || 'Épisode ' + num)}" style="
                                    font-family:var(--font-display);font-size:11px;font-weight:600;
                                    color:var(--text1);cursor:default;
                                    ${isPrincipal && !epPresentsSet.has(num) ? 'opacity:0.2' : ''}
                                  ">${num}</span>
                                `).join('')
                              : `<span style="font-size:10px;color:var(--text3)">—</span>`
                            }
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                `;
              })()}
            </div>
          </div>
        </div>
      </div>

      ${(p.episodes || []).length ? (() => {
        const saisons = [...new Set(p.episodes.map(e => e.saison_numero))].sort((a,b)=>a-b);
        const saisonOpts = saisons.map(s => `<option value="${s}">Saison ${s}</option>`).join('');
        return `
      <div class="detail-card" style="margin-top:20px">
        <div class="detail-card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <span>Répliques par épisode</span>
          <div style="display:flex;align-items:center;gap:8px">
            <select id="perso-chart-filter" onchange="Personnages._renderChart()" style="font-size:11px;background:var(--bg3);border:1px solid var(--border);color:var(--text1);padding:2px 6px;border-radius:4px">
              <option value="all">Toutes les saisons</option>
              ${saisonOpts}
            </select>
            <button id="perso-chart-spacing-btn"
              onclick="Personnages._toggleChartSpacing()"
              title="Afficher/masquer les épisodes où le personnage est absent"
              style="
                font-family:var(--font-display);font-size:9px;font-weight:700;letter-spacing:0.06em;
                padding:3px 8px;border-radius:4px;border:1px solid var(--border);
                background:var(--bg3);color:var(--text2);cursor:pointer;
                text-transform:uppercase;white-space:nowrap;
              ">
              ⬜ Espacé
            </button>
          </div>
        </div>
        <div class="detail-card-body" style="padding-top:8px;overflow-x:auto">
          <canvas id="perso-chart-canvas" style="display:block;height:160px"></canvas>
        </div>
      </div>`;
      })() : ''}

      ${(p.coPresence || []).length ? `
      <div class="detail-card" style="margin-top:20px">
        <div class="detail-card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <span>Co-présence — personnages les plus fréquents</span>
          <select id="perso-copresence-filter" onchange="Personnages._renderCoPresence()" style="font-size:11px;background:var(--bg3);border:1px solid var(--border);color:var(--text1);padding:2px 6px;border-radius:4px">
            <option value="all">Toutes les saisons</option>
            ${(() => {
              const saisons = [...new Set((p.episodes || []).map(e => e.saison_numero))].sort((a,b)=>a-b);
              return saisons.map(s => `<option value="${s}">Saison ${s}</option>`).join('');
            })()}
          </select>
        </div>
        <div class="detail-card-body" id="perso-copresence-body"></div>
      </div>` : ''}

      ${this.renderMomentsDecisifs(p)}
      ${this.renderRepliquesSignature(p)}
    `);

    window._persoStatsContext = {
      episodes: p.episodes || [],
      global: p.stats_episodes || {},
      totalsBySaison: p.stats_totaux_saisons || []
    };
    this._renderStats();

    window._persoCoPresenceContext = {
      global: p.coPresence || [],
      bySaison: p.coPresence_par_saison || [],
      sceneGroups: p.scene_groupes || {}
    };
    this._renderCoPresence();

    // Draw chart after modal is in DOM
    if ((p.episodes || []).length) {
      window._persoChartEpisodes = p.episodes;
      // tous_episodes = tous les éps de la série (pour le mode espacé)
      window._persoChartAllEpisodes = p.tous_episodes || [];
      // couleurs des saisons pour le graphique
      const _cb = {};
      (p.saisons_info || []).forEach(s => { _cb[s.numero] = s.couleur; });
      (p.episodes || []).forEach(e => { if (!_cb[e.saison_numero] && e.saison_couleur) _cb[e.saison_numero] = e.saison_couleur; });
      window._persoChartCouleurs = _cb;
      this._chartSpaced = false; // reset toggle à chaque ouverture
      setTimeout(() => Personnages._renderChart(), 50);
    }
  },

  _chartSpaced: false,

  _formatMinutes(min) {
    const rounded = Math.round(Number(min) || 0);
    if (rounded <= 0) return '—';
    const h = Math.floor(rounded / 60);
    const m = rounded % 60;
    return h > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${m} min`;
  },

  _renderStats() {
    const body = document.getElementById('perso-stats-body');
    if (!body) return;

    const ctx = window._persoStatsContext || {};
    const filter = document.getElementById('perso-stats-filter')?.value || 'all';
    const episodes = ctx.episodes || [];
    const globalStats = ctx.global || {};
    const totalsBySaison = ctx.totalsBySaison || [];

    let nbEpisodes, totalRepliques, duree, totalEpisodesBase, totalRepliquesBase;
    if (filter === 'all') {
      nbEpisodes = Number(globalStats.nb_episodes) || episodes.length || 0;
      totalRepliques = Number(globalStats.total_repliques) || 0;
      duree = Number(globalStats.duree_totale_min) || episodes.reduce((sum, ep) => sum + (Number(ep.duree_estimee_min) || 0), 0);
      totalEpisodesBase = Number(globalStats.total_episodes_serie) || 0;
      totalRepliquesBase = totalRepliques && globalStats.pct_repliques
        ? Math.round(totalRepliques / (Number(globalStats.pct_repliques) / 100))
        : totalRepliques;
    } else {
      const eps = episodes.filter(ep => String(ep.saison_numero) === String(filter));
      const saisonTotals = totalsBySaison.find(s => String(s.saison_numero) === String(filter)) || {};
      nbEpisodes = eps.length;
      totalRepliques = eps.reduce((sum, ep) => sum + (Number(ep.nb_repliques) || 0), 0);
      duree = eps.reduce((sum, ep) => sum + (Number(ep.duree_estimee_min) || 0), 0);
      totalEpisodesBase = Number(saisonTotals.total_episodes) || 0;
      totalRepliquesBase = Number(saisonTotals.total_repliques) || totalRepliques;
    }

    const pctPresence = totalEpisodesBase > 0 ? Math.round((nbEpisodes / totalEpisodesBase) * 100) : 0;
    const pctRepliques = totalRepliquesBase > 0 ? Math.round((totalRepliques / totalRepliquesBase) * 100) : 0;

    body.innerHTML = `
      <div style="display:flex;gap:20px;flex-wrap:wrap">
        <div style="text-align:center;flex:1">
          <div style="font-family:futura std;font-size:32px;font-weight:800;color:#7daeb3">${nbEpisodes}</div>
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase">épisodes</div>
        </div>
        <div style="text-align:center;flex:1">
          <div style="font-family:futura std;font-size:32px;font-weight:800;color:#7daeb3">${totalRepliques}</div>
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase">répliques</div>
        </div>
        <div style="text-align:center;flex:1">
          <div style="font-family:futura std;font-size:32px;font-weight:800;color:#7daeb3">${pctPresence}%</div>
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase">présence</div>
        </div>
        <div style="text-align:center;flex:1">
          <div style="font-family:futura std;font-size:32px;font-weight:800;color:#7daeb3">${pctRepliques}%</div>
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase">% répliques</div>
        </div>
      </div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Durée d'apparition estimée</div>
        <div style="display:flex;align-items:baseline;gap:6px">
          <span style="font-family:var(--font-display);font-size:28px;font-weight:800;color:var(--accent3)">${this._formatMinutes(duree)}</span>
          <span style="font-size:11px;color:var(--text3)">sur ${totalEpisodesBase || 0} épisode${(totalEpisodesBase || 0) > 1 ? 's' : ''}</span>
        </div>
      </div>
    `;
  },

  _renderCoPresence() {
    const body = document.getElementById('perso-copresence-body');
    if (!body) return;

    const ctx = window._persoCoPresenceContext || {};
    const filter = document.getElementById('perso-copresence-filter')?.value || 'all';
    const rows = (filter === 'all'
      ? (ctx.global || [])
      : (ctx.bySaison || []).filter(c => String(c.saison_numero) === String(filter))
    )
      .slice()
      .sort((a, b) => (b.nb_repliques_ensemble || 0) - (a.nb_repliques_ensemble || 0))
      .slice(0, 10);

    const maxR = rows[0].nb_repliques_ensemble || 1;
    const coPresenceHtml = rows.length ? rows.map(c => {
      const pct = Math.round(((c.nb_repliques_ensemble || 0) / maxR) * 100);
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid var(--border)">
          <div style="width:24px;height:24px;border-radius:50%;background:${c.couleur||'var(--bg4)'};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#000;flex-shrink:0">${this._escape((c.prenom||'?')[0])}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:600">${this._escape(c.prenom)} ${this._escape(c.nom||'')}</div>
            <div style="height:4px;background:var(--bg4);border-radius:2px;margin-top:3px">
              <div style="height:4px;background:var(--accent);border-radius:2px;width:${pct}%"></div>
            </div>
          </div>
          <div style="font-size:11px;color:var(--accent);font-family:var(--font-display);white-space:nowrap">${c.nb_episodes_ensemble} ép. · ${c.nb_repliques_ensemble} répl.</div>
        </div>
      `;
    }).join('') : '<div style="color:var(--text3);font-size:12px">Aucune co-présence pour cette saison.</div>';

    const sceneGroups = filter === 'all'
      ? (ctx.sceneGroups?.global || {})
      : (ctx.sceneGroups?.par_saison?.[String(filter)] || {});

    body.innerHTML = `
      ${coPresenceHtml}
      <div style="margin:14px 0;border-top:1px solid var(--border)"></div>
      <div style="font-family:var(--font-display);font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--text3);margin-bottom:8px">
        Top groupes par scènes
      </div>
      ${this._renderSceneGroupsBlock(sceneGroups)}
    `;
  },

  _renderSceneGroupsBlock(sceneGroups) {
    const configs = [
      ['Duos', 'duos'],
      ['Trios', 'trios'],
      ['Quatuors', 'quatuors'],
      ['Quintettes', 'quintettes'],
      ['Sextuors', 'sextuors'],
      ['Septuors', 'septuors'],
      ['Octuors', 'octuors'],
    ];
    const sections = configs
      .map(([label, key]) => this._renderSceneGroupRows(label, sceneGroups?.[key] || []))
      .filter(Boolean);

    return sections.length
      ? sections.join('<div style="height:8px"></div>')
      : '<div style="font-size:12px;color:var(--text3)">Aucun groupe de scène détecté pour ce filtre.</div>';
  },

  _renderSceneGroupRows(title, rows) {
    if (!rows.length) {
      return '';
    }

    const maxScenes = rows[0].nb_scenes || 1;
    return `
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">${title}</div>
      ${rows.slice(0, 8).map(g => {
        const pct = Math.round(((g.nb_scenes || 0) / maxScenes) * 100);
        const names = (g.personnages || []).map(p => this._escape(p.nom)).join(' + ');
        return `
          <div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid var(--border)">
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:700">${names}</div>
              <div style="height:4px;background:var(--bg4);border-radius:2px;margin-top:3px">
                <div style="height:4px;background:var(--accent3);border-radius:2px;width:${pct}%"></div>
              </div>
            </div>
            <div style="font-size:11px;color:var(--accent3);font-family:var(--font-display);white-space:nowrap">${g.nb_scenes} scène${g.nb_scenes > 1 ? 's' : ''} · ${g.nb_repliques} répl.</div>
          </div>
        `;
      }).join('')}
    `;
  },

  _toggleChartSpacing() {
    this._chartSpaced = !this._chartSpaced;
    const btn = document.getElementById('perso-chart-spacing-btn');
    if (btn) {
      btn.textContent = this._chartSpaced ? '▦ Espacé' : '⬜ Espacé';
      btn.style.background = this._chartSpaced ? 'var(--bg4)' : 'var(--bg3)';
      btn.style.color = this._chartSpaced ? 'var(--text1)' : 'var(--text2)';
    }
    this._renderChart();
  },

  _renderChart() {
    const canvas = document.getElementById('perso-chart-canvas');
    if (!canvas) return;
    const persoEpisodes = window._persoChartEpisodes || [];
    const allEpisodes   = window._persoChartAllEpisodes || [];
    const filter = document.getElementById('perso-chart-filter')?.value || 'all';

    // Map des épisodes où le perso apparaît : clé "saisonNum-epNum"
    const persoMap = {};
    persoEpisodes.forEach(e => { persoMap[`${e.saison_numero}-${e.numero_episode}`] = e; });

    // Source de la timeline selon le mode
    let sourceTimeline;
    if (this._chartSpaced && allEpisodes.length) {
      sourceTimeline = filter === 'all'
        ? allEpisodes
        : allEpisodes.filter(e => String(e.saison_numero) === filter);
    } else {
      sourceTimeline = filter === 'all'
        ? persoEpisodes
        : persoEpisodes.filter(e => String(e.saison_numero) === filter);
    }

    if (!sourceTimeline.length) return;

    // Enrichir chaque slot : données du perso si présent, sinon null
    const slots = sourceTimeline.map(e => {
      const key = `${e.saison_numero}-${e.numero_episode}`;
      return {
        saison_numero: e.saison_numero,
        numero_episode: e.numero_episode,
        persoData: persoMap[key] || null  // null = absent dans cet épisode
      };
    });

    const maxR = Math.max(...slots.map(s => s.persoData?.nb_repliques || 0), 1);
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

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = H - (i / 4) * H;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(totalW, y); ctx.stroke();
    }

    // Bars
    slots.forEach((slot, i) => {
      const x = PAD_L + i * (BAR_W + GAP);
      const _couleurs = window._persoChartCouleurs || {};
      const color = _couleurs[slot.saison_numero] || `hsl(${((slot.saison_numero || 1) * 47) % 360},60%,55%)`;

      if (slot.persoData) {
        // Épisode où le perso est présent → barre colorée
        const barH = Math.max(2, Math.round(((slot.persoData.nb_repliques || 0) / maxR) * H));
        const y = H - barH;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x, y, BAR_W, barH, [2,2,0,0]) : ctx.rect(x, y, BAR_W, barH);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (this._chartSpaced) {
        // Épisode absent en mode espacé → petit tiret discret en bas
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.15;
        ctx.fillRect(x, H - 2, BAR_W, 2);
        ctx.globalAlpha = 1;
      }

      // Label épisode
      if (i % 10 === 0 || slots.length <= 20) {
        ctx.fillStyle = slot.persoData ? text3 : (this._chartSpaced ? text3 + '55' : text3);
        ctx.globalAlpha = slot.persoData ? 1 : 0.35;
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`E${slot.numero_episode}`, x + BAR_W / 2, H + PAD_B - 4);
        ctx.globalAlpha = 1;
      }
    });

    // Y axis labels
    ctx.fillStyle = text3;
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = Math.round((i / 4) * maxR);
      const y = H - (i / 4) * H;
      ctx.fillText(val, PAD_L - 3, y + 3);
    }
  },

  openMomentForm(id) {
    const p = this.activeDetail;
    if (!p) return;
    const m = id ? (p.moments_decisifs || []).find(x => x.id == id) : {};
    const types = ['Révélation', 'Changement', 'Décision', 'Statut', 'Info cachée', 'Autre'];
    modal.open(`
      <div class="modal-title">${id ? '✎ Modifier le moment décisif' : '+ Moment décisif'}</div>
      <div class="form-grid cols1">
        <div class="form-group">
          <label>Épisode lié</label>
          <select id="pm-episode">${this._episodeOptions(m?.episode_id || '')}</select>
        </div>
        <div class="form-group">
          <label>Titre *</label>
          <input type="text" id="pm-titre" value="${this._attr(m?.titre || '')}" placeholder="Ex: apprend qu'il parle 30 langues">
        </div>
        <div class="form-group">
          <label>Type</label>
          <select id="pm-type">
            ${types.map(t => `<option value="${t}" ${String(m?.type_moment || 'Décision') === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Pourquoi c'est décisif</label>
          <textarea id="pm-desc" style="height:130px" placeholder="Ce que ça change pour le personnage, l'intrigue ou la continuité...">${this._escape(m?.description || '')}</textarea>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button class="btn btn-ghost" onclick="Personnages.openDetail(${p.id})">Annuler</button>
        <button class="btn btn-primary" onclick="Personnages.saveMoment(${id || 'null'})">Enregistrer</button>
      </div>
    `);
  },

  async saveMoment(id) {
    const p = this.activeDetail;
    if (!p) return;
    const data = {
      personnage_id: p.id,
      episode_id: document.getElementById('pm-episode')?.value || null,
      titre: document.getElementById('pm-titre')?.value.trim() || '',
      type_moment: document.getElementById('pm-type')?.value || 'Décision',
      description: document.getElementById('pm-desc')?.value.trim() || ''
    };
    if (!data.titre) { toast('Le titre du moment est requis', 'error'); return; }
    if (id) await api.put(`personnage_moments/${id}`, data);
    else await api.post('personnage_moments', data);
    toast('Moment décisif enregistré', 'success');
    await this.openDetail(p.id);
  },

  async deleteMoment(id) {
    const p = this.activeDetail;
    if (!p || !confirm('Supprimer ce moment décisif ?')) return;
    await api.delete(`personnage_moments/${id}`);
    toast('Moment décisif supprimé', 'info');
    await this.openDetail(p.id);
  },

  openSignatureForm(id) {
    const p = this.activeDetail;
    if (!p) return;
    const sig = id ? (p.repliques_signature || []).find(x => x.id == id) : {};
    modal.open(`
      <div class="modal-title">${id ? '✎ Modifier la réplique signature' : '+ Réplique signature'}</div>
      <div class="form-grid cols1">
        <div class="form-group">
          <label>Épisode lié</label>
          <select id="ps-episode">${this._episodeOptions(sig?.episode_id || '')}</select>
        </div>
        <div class="form-group">
          <label>Expression / réplique *</label>
          <input type="text" id="ps-expression" value="${this._attr(sig?.expression || '')}" placeholder="Ex: That's what I'm saying">
        </div>
        <div class="form-group">
          <label>Note</label>
          <textarea id="ps-note" style="height:110px" placeholder="Pourquoi cette expression définit le personnage, quand elle revient...">${this._escape(sig?.note || '')}</textarea>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button class="btn btn-ghost" onclick="Personnages.openDetail(${p.id})">Annuler</button>
        <button class="btn btn-primary" onclick="Personnages.saveSignature(${id || 'null'})">Enregistrer</button>
      </div>
    `);
  },

  async saveSignature(id) {
    const p = this.activeDetail;
    if (!p) return;
    const data = {
      personnage_id: p.id,
      episode_id: document.getElementById('ps-episode')?.value || null,
      expression: document.getElementById('ps-expression')?.value.trim() || '',
      note: document.getElementById('ps-note')?.value.trim() || ''
    };
    if (!data.expression) { toast("L'expression est requise", 'error'); return; }
    if (id) await api.put(`personnage_signatures/${id}`, data);
    else await api.post('personnage_signatures', data);
    toast('Réplique signature enregistrée', 'success');
    await this.openDetail(p.id);
  },

  async deleteSignature(id) {
    const p = this.activeDetail;
    if (!p || !confirm('Supprimer cette réplique signature ?')) return;
    await api.delete(`personnage_signatures/${id}`);
    toast('Réplique signature supprimée', 'info');
    await this.openDetail(p.id);
  },

  openForm(id) {
    const isNew = !id;
    const p = isNew ? {} : this.tous.find(x => x.id == id) || {};

    // Determine current type value (2=principal, 1=récurrent, 0=autre)
    // Legacy: est_principal==1 was principal → map to 2
    let currentType = p.est_principal ?? 0;

    modal.open(`
      <div class="modal-title">${isNew ? '+ Nouveau personnage' : '✎ Modifier ' + this._escape(p.prenom)}</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Nom d'affichage <span style="font-weight:400;opacity:0.6">(abréviation dans la grille)</span></label>
          <input type="text" id="pf-affichage" value="${this._attr(p.nom_affichage || '')}" placeholder="Ex: M, Jean-P…" maxlength="6">
        </div>
        <div class="form-group">
          <label>Prénom *</label>
          <input type="text" id="pf-prenom" value="${this._attr(p.prenom || '')}" required>
        </div>
        <div class="form-group">
          <label>Nom de famille</label>
          <input type="text" id="pf-nom" value="${this._attr(p.nom || '')}">
        </div>
        <div class="form-group">
          <label>Couleur identité</label>
          <input type="color" id="pf-couleur" value="${p.couleur_identite || '#888888'}">
        </div>
        <div class="form-group">
          <label>Type de personnage</label>
          <select id="pf-principal">
            <option value="2" ${currentType == 2 ? 'selected' : ''}>Principal</option>
            <option value="1" ${currentType == 1 ? 'selected' : ''}>Récurrent</option>
            <option value="0" ${currentType == 0 ? 'selected' : ''}>Autre</option>
          </select>
        </div>
        <div class="form-group">
          <label>Sexe</label>
          <select id="pf-sexe">
            <option value="">—</option>
            <option value="F" ${p.sexe === 'F' ? 'selected' : ''}>Femme</option>
            <option value="M" ${p.sexe === 'M' ? 'selected' : ''}>Homme</option>
            <option value="NB" ${p.sexe === 'NB' ? 'selected' : ''}>Non-binaire</option>
            <option value="autre" ${p.sexe === 'autre' ? 'selected' : ''}>Autre</option>
          </select>
        </div>
        <div class="form-group">
          <label>Âge</label>
          <input type="number" id="pf-age" value="${p.age || ''}" min="0">
        </div>
        <div class="form-group">
          <label>Date de naissance</label>
          <input type="date" id="pf-ddn" value="${p.date_naissance || ''}">
        </div>
        <div class="form-group">
          <label>Profession</label>
          <input type="text" id="pf-profession" value="${this._attr(p.profession || '')}">
        </div>
        <div class="form-group full">
          <label>Caractéristiques</label>
          <textarea id="pf-carac" style="height:100px">${this._escape(p.caracteristiques || '')}</textarea>
        </div>
      </div>
      <hr class="divider">
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="modal.close()">Annuler</button>
        <button class="btn btn-primary" onclick="Personnages.save(${id || 'null'})">
          ${isNew ? 'Créer' : 'Enregistrer'}
        </button>
      </div>
    `);
  },

  async save(id) {
    const data = {
      nom_affichage: document.getElementById('pf-affichage').value.trim() || null,
      prenom: document.getElementById('pf-prenom').value.trim(),
      nom: document.getElementById('pf-nom').value.trim(),
      couleur_identite: document.getElementById('pf-couleur').value,
      est_principal: parseInt(document.getElementById('pf-principal').value),
      sexe: document.getElementById('pf-sexe').value || null,
      age: parseInt(document.getElementById('pf-age').value) || null,
      date_naissance: document.getElementById('pf-ddn').value || null,
      profession: document.getElementById('pf-profession').value.trim(),
      caracteristiques: document.getElementById('pf-carac').value.trim()
    };

    if (!data.prenom) { toast('Le prénom est requis', 'error'); return; }

    if (id) {
      const avant = this.data.find(p => p.id === id) || null;
      await apiLogged.updatePersonnage(id, data, avant);
      toast('Personnage mis à jour', 'success');
    } else {
      await apiLogged.createPersonnage(data);
      toast('Personnage créé', 'success');
    }
    modal.close();
    await this.init();
  },

  async confirmDelete(id) {
    if (!confirm('Supprimer ce personnage ?')) return;
    const p = this.data.find(x => x.id === id);
    const label = p ? [p.prenom, p.nom].filter(Boolean).join(' ') : `Personnage #${id}`;
    await apiLogged.deletePersonnage(id, label);
    toast('Personnage supprimé', 'info');
    await this.init();
  }
};
