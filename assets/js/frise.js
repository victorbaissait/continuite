// assets/js/frise.js
'use strict';


const Frise = {
  episodes: [],
  viewMode: localStorage.getItem(cleProjet('lemenu_frise_view')) || 'calendar',
  sortMode: 'episode',

  MOMENTS: {
    matin:        { label: 'Matin',        icon: '🌅', color: '#F6C90E' },
    midi:         { label: 'Midi',         icon: '☀️',  color: '#FF8C42' },
    'apres-midi': { label: 'Après-midi',   icon: '🌤',  color: '#FF6B6B' },
    soiree:       { label: 'Soirée',       icon: '🌆', color: '#9B59B6' },
    nuit:         { label: 'Nuit',         icon: '🌙', color: '#2C3E7A' },
    inconnu:      { label: 'Inconnu',      icon: '?',  color: '#3a3a3a'  },
  },

  MOMENT_ORDER: {
    matin: 1,
    midi: 2,
    'apres-midi': 3,
    soiree: 4,
    nuit: 5,
    inconnu: 9,
  },

  async init() {
    try {
      this.episodes = await api.get('frise');
    } catch(e) {
      this.episodes = [];
    }
    this.render();
  },

  render() {
    const tab = document.getElementById('tab-frise');
    if (!tab) return;

    tab.innerHTML = `
      <div class="section-header">
        <div class="section-title">⊷ Frise chronologique</div>
        <div class="section-actions" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
          <div class="frise-view-toggle" aria-label="Changer de vue">
            <button class="frise-view-btn ${this.viewMode === 'calendar' ? 'active' : ''}" onclick="Frise.setView('calendar')">Calendrier</button>
            <button class="frise-view-btn ${this.viewMode === 'timeline' ? 'active' : ''}" onclick="Frise.setView('timeline')">Timeline</button>
            <button class="frise-view-btn ${this.viewMode === 'reperes' ? 'active' : ''}" onclick="Frise.setView('reperes')">Repères</button>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${Object.entries(this.MOMENTS).map(([k,v]) => `
              <span style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text3)">
                <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${v.color}"></span>
                ${v.label}
              </span>
            `).join('')}
          </div>
        </div>
      </div>

      ${this.viewMode === 'reperes' ? '<div class="vue-monde" id="reperes-vue"></div>' : this.viewMode === 'timeline' ? this._renderTimelineView() : this._renderCalendarView()}
    `;
    if (this.viewMode === 'reperes') Reperes.monter(document.getElementById('reperes-vue'));
  },

  setView(mode) {
    this.viewMode = mode;
    localStorage.setItem(cleProjet('lemenu_frise_view'), mode);
    this.render();
  },

  setSort(mode) {
    this.sortMode = mode;
    this.render();
  },

  _renderCalendarView() {
    const parSaison = this._groupBySeason();
    const seasonsHtml = Object.entries(parSaison)
      .map(([sNum, s]) => this._renderSeasonCalendar(sNum, s))
      .join('');

    return `
      <div class="frise-calendar-shell">
        ${seasonsHtml || this._renderEmpty('Aucun épisode', 'Ajoutez des épisodes pour construire la frise.')}
      </div>
    `;
  },

  _renderSeasonCalendar(sNum, season) {
    const occurrences = season.episodes
      .flatMap(ep => this._getOccurrences(ep))
      .filter(o => o.date && o.importance !== 'non_applicable')
      .sort((a, b) => this._compareOccurrences(a, b));

    const monthMap = {};
    for (const occ of occurrences) {
      const key = this._monthKey(occ.date);
      if (!monthMap[key]) monthMap[key] = [];
      monthMap[key].push(occ);
    }

    const monthKeys = Object.keys(monthMap).sort();
    const noDateEpisodes = season.episodes.filter(ep => this._getOccurrences(ep).filter(o => o.date && o.importance !== 'non_applicable').length === 0);

    return `
      <div class="frise-season">
        <div class="frise-season-head">
          <div style="width:10px;height:10px;border-radius:50%;background:${season.couleur || 'var(--accent)'}"></div>
          <span style="font-family:var(--font-display);font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">
            Saison ${sNum}
          </span>
          <span style="font-size:12px;color:var(--text3)">
            ${this._esc(season.nom || '')} · ${occurrences.length} point${occurrences.length > 1 ? 's' : ''} de chronologie
          </span>
        </div>

        ${monthKeys.length ? monthKeys.map(key => this._renderMonthCalendar(key, monthMap[key])).join('') : `
          <div style="font-size:12px;color:var(--text3);margin:12px 0 20px">Aucune date principale ou secondaire dans cette saison.</div>
        `}

        ${noDateEpisodes.length ? `
          <div style="margin-top:18px">
            <div style="font-family:var(--font-display);font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text3);margin-bottom:10px">
              Sans date applicable (${noDateEpisodes.length} épisodes)
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${noDateEpisodes.map(ep => this._renderNoDateChip(ep)).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  },

  _renderMonthCalendar(monthKey, occurrences) {
    const [year, month] = monthKey.split('-').map(Number);
    const firstDate = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDay = (firstDate.getDay() + 6) % 7;
    const byDay = {};

    for (const occ of occurrences) {
      const day = Number(occ.date.slice(8, 10));
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(occ);
    }

    const jours = ['L','M','M','J','V','S','D'];
    const monthLabel = firstDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    return `
      <div style="margin:0 0 24px">
        <div style="font-family:var(--font-display);font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text3);margin:0 0 8px">
          ${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
        </div>
        <div class="frise-month-grid">
          ${jours.map(j => `<div class="frise-day-label">${j}</div>`).join('')}
          ${Array(firstDay).fill('<div></div>').join('')}
          ${Array.from({length: daysInMonth}, (_, i) => {
            const day = i + 1;
            return this._renderCalendarDay(day, byDay[day] || []);
          }).join('')}
        </div>
      </div>
    `;
  },

  _renderCalendarDay(day, occurrences) {
    if (!occurrences.length) return `<div class="frise-day-empty">${day}</div>`;

    const sorted = [...occurrences].sort((a, b) => this._compareOccurrences(a, b));
    const primary = sorted.filter(o => o.importance === 'principal');
    const secondary = sorted.filter(o => o.importance === 'secondaire');

    const primaryHtml = primary.length
      ? primary.map(o => this._renderPrimaryOccurrence(o)).join('')
      : `<div class="frise-no-primary">secondaire</div>`;

    return `
      <div class="frise-day-cell">
        <div class="frise-day-num">${day}</div>
        <div class="frise-day-primary" style="grid-template-columns:repeat(${Math.min(primary.length || 1, 2)}, minmax(0, 1fr))">
          ${primaryHtml}
        </div>
        <div class="frise-secondary-strip">
          ${secondary.map(o => this._renderSecondaryOccurrence(o)).join('')}
        </div>
      </div>
    `;
  },

  _renderPrimaryOccurrence(occ) {
    const moment = this.MOMENTS[occ.moment] || this.MOMENTS.inconnu;
    const title = this._occTitle(occ);
    return `
      <div class="frise-primary-card"
           onclick="Frise.openDetail(${occ.ep.id})"
           title="${this._esc(title)}"
           style="background:${moment.color};border:${occ.est_flashback ? '2px solid #fff' : '1px solid rgba(0,0,0,.12)'}">
        ${occ.est_flashback ? '<div class="frise-flash-tag">FB</div>' : ''}
        <div class="frise-primary-code">${occ.code}</div>
        <div class="frise-primary-moment">${moment.icon}</div>
      </div>
    `;
  },

  _renderSecondaryOccurrence(occ) {
    const moment = this.MOMENTS[occ.moment] || this.MOMENTS.inconnu;
    return `
      <div class="frise-secondary-card"
           onclick="Frise.openDetail(${occ.ep.id})"
           title="${this._esc(this._occTitle(occ))}"
           style="background:${moment.color};${occ.est_flashback ? 'border-color:#fff' : ''}">
      </div>
    `;
  },

  _renderNoDateChip(ep) {
    return `
      <button class="btn btn-ghost btn-sm" onclick="Frise.openDetail(${ep.id})" style="opacity:.7;font-size:11px">
        ${this._epCode(ep)}${ep.titre ? ' — ' + this._esc(ep.titre.slice(0, 28)) : ''}
      </button>
    `;
  },

  _renderTimelineView() {
    const rows = this.episodes
      .map(ep => ({ ep, occurrences: this._getOccurrences(ep).filter(o => o.date && o.importance !== 'non_applicable') }))
      .filter(row => row.occurrences.length);

    if (!rows.length) {
      return `<div class="frise-timeline-main">${this._renderEmpty('Aucune date renseignée', 'Ajoutez des plages principales ou secondaires dans les fiches épisode.')}</div>`;
    }

    const sortedRows = this._sortTimelineRows(rows);
    const allOccurrences = sortedRows.flatMap(row => row.occurrences);
    const bounds = this._computeTimelineBounds(allOccurrences);
    const { ticks, step } = this._buildTicks(bounds.minTs, bounds.maxTs);

    const axisHTML = ticks.map(ts => {
      const p = this._pct(ts, bounds.minTs, bounds.maxTs);
      return `<div class="suivi-axis-tick" style="left:${p}%">
        <div class="suivi-axis-tick-line"></div>
        <div class="suivi-axis-tick-label">${this._tickLabel(ts, step)}</div>
      </div>`;
    }).join('');

    return `
      <div class="frise-timeline-main">
        <div class="suivi-timeline-wrap">
          <div class="suivi-sort-bar">
            <span>Trier par :</span>
            <button class="suivi-sort-btn ${this.sortMode === 'episode' ? 'active' : ''}" onclick="Frise.setSort('episode')">Ordre des épisodes</button>
            <button class="suivi-sort-btn ${this.sortMode === 'chrono' ? 'active' : ''}" onclick="Frise.setSort('chrono')">Ordre chronologique</button>
          </div>
          <div class="suivi-axis">
            <div class="suivi-axis-line"></div>
            ${axisHTML}
          </div>
          <div class="suivi-rows">
            ${sortedRows.map(row => this._renderTimelineRow(row.ep, row.occurrences, bounds)).join('')}
          </div>
          <div class="frise-mini-legend">
            <span style="display:flex;align-items:center;gap:6px"><span class="frise-legend-dot" style="background:var(--accent)"></span>Jour principal</span>
            <span style="display:flex;align-items:center;gap:6px"><span class="frise-legend-dot" style="background:var(--text3);width:7px;height:7px"></span>Jour secondaire</span>
            <span style="display:flex;align-items:center;gap:6px"><span class="frise-legend-dot" style="background:#fff;border:2px solid var(--bg)"></span>Flashback</span>
          </div>
        </div>
      </div>
    `;
  },

  _renderTimelineRow(ep, occurrences, bounds) {
    const rowId = `frise-timeline-row-${ep.id}`;
    const sorted = [...occurrences].sort((a, b) => this._compareOccurrences(a, b));
    const primary = sorted.find(o => o.importance === 'principal') || sorted[0];
    const tooltipLeft = this._pct(this._dateToTs(primary.date), bounds.minTs, bounds.maxTs);
    const ttText = sorted.map(o => `${this._fmtDate(o.date)} ${this._momentLabel(o.moment)}${o.importance === 'secondaire' ? ' (sec.)' : ''}`).join(' · ');

    setTimeout(() => {
      const row = document.getElementById(rowId);
      if (!row) return;
      const track = row.querySelector('.suivi-row-track');
      const svg = row.querySelector('svg.suivi-track-svg');
      if (!track || !svg) return;
      const W = track.getBoundingClientRect().width;
      if (!W) return;

      const xFor = date => ((this._dateToTs(date) - bounds.minTs) / (bounds.maxTs - bounds.minTs)) * W;
      const cy = 2.5;
      let content = `<line x1="0" y1="${cy}" x2="${W}" y2="${cy}" stroke="#2a2a2a" stroke-width="1"/>`;
      const xs = sorted.map(o => xFor(o.date));

      if (xs.length > 1) {
        content += `<line x1="${Math.min(...xs)}" y1="${cy}" x2="${Math.max(...xs)}" y2="${cy}" stroke="#67cbac" stroke-width="2" opacity=".24"/>`;
      }

      sorted.forEach(occ => {
        const moment = this.MOMENTS[occ.moment] || this.MOMENTS.inconnu;
        const x = xFor(occ.date);
        const r = occ.importance === 'principal' ? 5 : 3.3;
        const stroke = occ.est_flashback ? '#fff' : '#101010';
        const sw = occ.est_flashback ? 2 : 1;
        content += `<circle cx="${x.toFixed(1)}" cy="${cy}" r="${r}" fill="${moment.color}" stroke="${stroke}" stroke-width="${sw}"/>`;
      });

      svg.setAttribute('viewBox', `0 0 ${W} 5`);
      svg.innerHTML = content;
    }, 0);

    return `
      <div class="suivi-row" id="${rowId}">
        <div class="suivi-row-label">
          <span class="suivi-row-label-num">${this._epCode(ep)}</span>
          <span class="suivi-row-label-title">${this._esc(ep.titre || '')}</span>
        </div>
        <div class="suivi-row-track" style="position:relative;height:5px;">
          <svg class="suivi-track-svg" style="position:absolute;top:0;left:0;width:100%;height:5px;overflow:visible;display:block;"></svg>
          <div class="suivi-tooltip" style="left:${tooltipLeft}%">${this._esc(ttText)}</div>
        </div>
      </div>
    `;
  },

  async openDetail(epId) {
    const ep = this.episodes.find(e => e.id === epId);
    if (!ep) return;

    const code = this._epCode(ep);
    const plages = this._getOccurrences(ep, true);
    const isFlash = parseInt(ep.est_flashback) === 1 || plages.some(p => p.est_flashback);

    const html = `
      <div style="padding:24px;min-width:460px;max-width:620px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
          <span style="font-family:var(--font-display);font-size:12px;color:var(--text3)">${code}</span>
          <span style="font-size:16px;font-weight:700">${this._esc(ep.titre || 'Sans titre')}</span>
          ${isFlash ? `<span style="font-size:10px;background:#fff;color:#000;padding:1px 6px;border-radius:10px;font-weight:700">FLASHBACK</span>` : ''}
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
          <div>
            <label style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text3);font-family:var(--font-display)">Date principale rapide</label>
            <input type="date" id="frise-date-diege" value="${ep.date_diege || ''}"
              style="display:block;width:100%;margin-top:6px;background:var(--bg3);border:1px solid var(--border);
                     color:var(--text1);padding:6px 10px;border-radius:6px;font-size:13px">
          </div>
          <div>
            <label style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text3);font-family:var(--font-display)">Moment principal rapide</label>
            <select id="frise-moment"
              style="display:block;width:100%;margin-top:6px;background:var(--bg3);border:1px solid var(--border);
                     color:var(--text1);padding:6px 10px;border-radius:6px;font-size:13px">
              ${Object.entries(this.MOMENTS).map(([k,v]) =>
                `<option value="${k}" ${ep.moment_journee === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <div style="margin-bottom:20px">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
            <input type="checkbox" id="frise-flashback" ${isFlash ? 'checked' : ''}
              onchange="document.getElementById('frise-flashback-date-wrap').style.display=this.checked?'block':'none'"
              style="width:16px;height:16px;accent-color:var(--accent)">
            <span style="font-size:13px">Épisode en flashback</span>
          </label>
          <div id="frise-flashback-date-wrap" style="display:${isFlash ? 'block' : 'none'};margin-top:10px">
            <label style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text3);font-family:var(--font-display)">Date d'origine du flashback</label>
            <input type="date" id="frise-flashback-date" value="${ep.date_flashback_origine || ''}"
              style="display:block;width:100%;margin-top:6px;background:var(--bg3);border:1px solid var(--border);
                     color:var(--text1);padding:6px 10px;border-radius:6px;font-size:13px">
          </div>
        </div>

        <div style="margin-bottom:20px">
          <div style="font-family:var(--font-display);font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:8px">
            Plages temporelles déclarées
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${plages.length ? plages.map(p => this._renderPlageLine(p)).join('') : `<div style="font-size:12px;color:var(--text3)">Aucune plage temporelle renseignée.</div>`}
          </div>
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
          <button onclick="modal.close();Episodes.openEdit(${epId})" class="btn btn-secondary">Modifier la chronologie complète</button>
          <button onclick="modal.close()" class="btn btn-ghost">Annuler</button>
          <button onclick="Frise.saveDetail(${epId})" class="btn btn-primary">Enregistrer le principal</button>
        </div>
      </div>
    `;

    modal.open(html);
  },

  _renderPlageLine(occ) {
    const moment = this.MOMENTS[occ.moment] || this.MOMENTS.inconnu;
    const importanceLabel = occ.importance === 'principal' ? 'Principal'
      : occ.importance === 'secondaire' ? 'Secondaire'
      : 'N/A';
    const bg = occ.importance === 'principal' ? 'var(--accent)'
      : occ.importance === 'secondaire' ? 'var(--bg4)'
      : 'transparent';
    const color = occ.importance === 'principal' ? '#000' : 'var(--text3)';

    return `
      <div style="display:flex;align-items:center;gap:8px;padding:7px 9px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;font-size:12px">
        <span style="font-family:var(--font-mono);color:var(--accent);min-width:72px">${occ.date ? this._fmtDate(occ.date) : 'Sans date'}</span>
        <span style="min-width:92px">${moment.icon} ${moment.label}</span>
        <span style="font-family:var(--font-mono);font-size:10px;padding:2px 7px;border-radius:999px;background:${bg};color:${color};border:1px solid var(--border2)">${importanceLabel}</span>
        ${occ.est_flashback ? `<span style="font-size:10px;background:#fff;color:#000;padding:1px 6px;border-radius:999px;font-weight:700">FB</span>` : ''}
      </div>
    `;
  },

  async saveDetail(epId) {
    const dateDiege = document.getElementById('frise-date-diege')?.value || null;
    const moment = document.getElementById('frise-moment')?.value || 'inconnu';
    const estFlash = document.getElementById('frise-flashback')?.checked ? 1 : 0;
    const dateFlash = estFlash ? (document.getElementById('frise-flashback-date')?.value || null) : null;

    try {
      await api.put(`frise/${epId}`, {
        date_diege: dateDiege,
        moment_journee: moment,
        est_flashback: estFlash,
        date_flashback_origine: dateFlash,
      });

      toast('Épisode mis à jour', 'success');
      modal.close();
      await this.init();
    } catch(e) {
      toast('Erreur lors de la sauvegarde', 'error');
    }
  },

  _groupBySeason() {
    const parSaison = {};
    for (const ep of this.episodes) {
      const k = ep.saison_numero || '?';
      if (!parSaison[k]) {
        parSaison[k] = {
          couleur: ep.saison_couleur,
          nom: ep.saison_nom,
          episodes: [],
        };
      }
      parSaison[k].episodes.push(ep);
    }
    return parSaison;
  },

  _getOccurrences(ep, includeNonApplicable = false) {
    const plages = Array.isArray(ep.plages_temporelles) && ep.plages_temporelles.length
      ? ep.plages_temporelles
      : [{
        date: ep.date_diege || null,
        moment: ep.moment_journee || 'inconnu',
        importance: 'principal',
        est_flashback: ep.est_flashback || 0,
        date_flashback_origine: ep.date_flashback_origine || null,
      }];

    const occurrences = plages.map((pl, idx) => {
      const importance = this._normalizeImportance(pl.importance || (idx === 0 ? 'principal' : 'secondaire'));
      const date = pl.date || pl.date_plage || null;
      return {
        id: `${ep.id}-${idx}`,
        ep,
        date,
        moment: pl.moment || 'inconnu',
        importance,
        est_flashback: parseInt(pl.est_flashback ?? ep.est_flashback ?? 0) === 1,
        date_flashback_origine: pl.date_flashback_origine || ep.date_flashback_origine || null,
        code: this._epCode(ep),
      };
    }).filter(o => includeNonApplicable || o.importance !== 'non_applicable');

    if (!occurrences.length && ep.date_diege && !includeNonApplicable) {
      occurrences.push({
        id: `${ep.id}-fallback`,
        ep,
        date: ep.date_diege,
        moment: ep.moment_journee || 'inconnu',
        importance: 'principal',
        est_flashback: parseInt(ep.est_flashback || 0) === 1,
        date_flashback_origine: ep.date_flashback_origine || null,
        code: this._epCode(ep),
      });
    }

    return occurrences;
  },

  _sortTimelineRows(rows) {
    const sorted = [...rows];
    if (this.sortMode === 'chrono') {
      return sorted.sort((a, b) => {
        const da = Math.min(...a.occurrences.map(o => this._dateToTs(o.date)));
        const db = Math.min(...b.occurrences.map(o => this._dateToTs(o.date)));
        if (da !== db) return da - db;
        return this._episodeOrder(a.ep, b.ep);
      });
    }
    return sorted.sort((a, b) => this._episodeOrder(a.ep, b.ep));
  },

  _episodeOrder(a, b) {
    if ((a.saison_numero || 0) !== (b.saison_numero || 0)) return (a.saison_numero || 0) - (b.saison_numero || 0);
    return (a.numero_episode || 0) - (b.numero_episode || 0);
  },

  _compareOccurrences(a, b) {
    const dateCmp = (a.date || '').localeCompare(b.date || '');
    if (dateCmp) return dateCmp;
    const momentCmp = (this.MOMENT_ORDER[a.moment] || 9) - (this.MOMENT_ORDER[b.moment] || 9);
    if (momentCmp) return momentCmp;
    return this._episodeOrder(a.ep, b.ep);
  },

  _computeTimelineBounds(occurrences) {
    let minTs = Infinity;
    let maxTs = -Infinity;
    for (const occ of occurrences) {
      const ts = this._dateToTs(occ.date);
      if (ts !== null) {
        minTs = Math.min(minTs, ts);
        maxTs = Math.max(maxTs, ts);
      }
    }
    const span = maxTs - minTs || 24 * 3600 * 1000;
    return { minTs: minTs - span * .05, maxTs: maxTs + span * .05 };
  },

  _buildTicks(minTs, maxTs) {
    const span = maxTs - minTs;
    const MS_DAY = 24 * 3600 * 1000;
    const MS_MONTH = 30.44 * MS_DAY;
    const MS_YEAR = 365.25 * MS_DAY;
    let step;
    if (span < 20 * MS_DAY) step = MS_DAY;
    else if (span < 3 * MS_MONTH) step = 7 * MS_DAY;
    else if (span < 18 * MS_MONTH) step = MS_MONTH;
    else if (span < 4 * MS_YEAR) step = 3 * MS_MONTH;
    else step = MS_YEAR;

    const ticks = [];
    const d0 = new Date(minTs);
    d0.setHours(0, 0, 0, 0);
    if (step >= MS_MONTH) d0.setDate(1);
    let t = d0.getTime();
    while (t <= maxTs) {
      if (t >= minTs) ticks.push(t);
      const d = new Date(t);
      if (step >= MS_YEAR) d.setFullYear(d.getFullYear() + 1);
      else if (step >= 3 * MS_MONTH) d.setMonth(d.getMonth() + 3);
      else if (step >= MS_MONTH) d.setMonth(d.getMonth() + 1);
      else d.setDate(d.getDate() + Math.max(1, Math.round(step / MS_DAY)));
      t = d.getTime();
    }
    return { ticks, step };
  },

  _tickLabel(ts, step) {
    const d = new Date(ts);
    const MS_MONTH = 30.44 * 24 * 3600 * 1000;
    const MS_YEAR = 365.25 * 24 * 3600 * 1000;
    if (step >= MS_YEAR) return d.toLocaleDateString('fr-FR', { year: 'numeric' });
    if (step >= MS_MONTH) return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  },

  _pct(ts, minTs, maxTs) {
    return ((ts - minTs) / (maxTs - minTs)) * 100;
  },

  _dateToTs(dateStr) {
    if (!dateStr) return null;
    const parts = String(dateStr).split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]).getTime();
  },

  _monthKey(dateStr) {
    return String(dateStr).slice(0, 7);
  },

  _fmtDate(dateStr) {
    if (!dateStr) return '?';
    const [y, m, d] = String(dateStr).split('-');
    return `${d}/${m}/${String(y).slice(-2)}`;
  },

  _momentLabel(momentKey) {
    const moment = this.MOMENTS[momentKey] || this.MOMENTS.inconnu;
    return moment.label;
  },

  _normalizeImportance(importance) {
    if (importance === 'na' || importance === 'n/a' || importance === 'non-applicable') return 'non_applicable';
    return ['principal', 'secondaire', 'non_applicable'].includes(importance) ? importance : 'principal';
  },

  _epCode(ep) {
    return `S${ep.saison_numero}E${String(ep.numero_episode).padStart(2,'0')}`;
  },

  _occTitle(occ) {
    const role = occ.importance === 'principal' ? 'principal'
      : occ.importance === 'secondaire' ? 'secondaire'
      : 'non applicable';
    return `${occ.code} — ${occ.ep.titre || 'Sans titre'} · ${this._fmtDate(occ.date)} · ${this._momentLabel(occ.moment)} · ${role}${occ.est_flashback ? ' · flashback' : ''}`;
  },

  _renderEmpty(title, subtitle) {
    return `<div class="empty-state">
      <div class="empty-icon">📅</div>
      <div class="empty-title">${this._esc(title)}</div>
      <div class="empty-sub">${this._esc(subtitle)}</div>
    </div>`;
  },

  _esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },
};
