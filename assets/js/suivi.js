/* =========================================================
   suivi.js — Onglet "Suivi d'écriture"
   Timeline proportionnelle des épisodes (1er jet)
   Traits hachés = date approximative (avant/après)
   ========================================================= */

'use strict';

/* ══════════════════════════════════════════════════
   TIMELINE ENGINE
   ══════════════════════════════════════════════════ */

function _toTs(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d) ? null : d.getTime();
}

function _monthLabel(ts) {
  return new Date(ts).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}

function _tickLabel(ts, step) {
  const d = new Date(ts);
  const MS_YEAR = 365.25 * 24 * 3600 * 1000;
  if (step >= MS_YEAR) {
    // Juste l'année
    return d.toLocaleDateString('fr-FR', { year: 'numeric' });
  } else {
    // Jour + mois + année abrégée
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}

function _computeBounds(episodes) {
  let minTs = Infinity, maxTs = -Infinity;
  for (const ep of episodes) {
    const start = _toTs(ep.date_debut_ecriture);
    const end   = _toTs(ep.date_fin_ecriture);
    if (start !== null) { minTs = Math.min(minTs, start); maxTs = Math.max(maxTs, start); }
    if (end   !== null) { minTs = Math.min(minTs, end);   maxTs = Math.max(maxTs, end); }
  }
  if (!isFinite(minTs)) return null;
  const span = maxTs - minTs || 1;
  return { minTs: minTs - span * 0.05, maxTs: maxTs + span * 0.05 };
}

function _buildTicks(minTs, maxTs) {
  const span = maxTs - minTs;
  const MS_MONTH = 30.44 * 24 * 3600 * 1000;
  const MS_YEAR  = 365.25 * 24 * 3600 * 1000;
  let step;
  if (span < 3 * MS_MONTH)        step = MS_MONTH / 4;
  else if (span < 18 * MS_MONTH)  step = MS_MONTH;
  else if (span < 4 * MS_YEAR)    step = 3 * MS_MONTH;
  else if (span < 10 * MS_YEAR)   step = MS_YEAR;
  else                             step = 2 * MS_YEAR;

  const ticks = [];
  const d0 = new Date(minTs);
  d0.setDate(1); d0.setHours(0, 0, 0, 0);
  let t = d0.getTime();
  while (t <= maxTs) {
    if (t >= minTs) ticks.push(t);
    const d = new Date(t);
    if (step >= MS_YEAR)           d.setFullYear(d.getFullYear() + Math.round(step / MS_YEAR));
    else if (step >= 3 * MS_MONTH) d.setMonth(d.getMonth() + 3);
    else if (step >= MS_MONTH)     d.setMonth(d.getMonth() + 1);
    else                           d.setDate(d.getDate() + 7);
    t = d.getTime();
  }
  return { ticks, step };
}

function _pct(ts, minTs, maxTs) {
  return ((ts - minTs) / (maxTs - minTs)) * 100;
}

function _fmtDate(dateStr) {
  if (!dateStr) return '?';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`;
}

function _qualPfx(q) {
  if (q === 'avant') return '< ';
  if (q === 'apres') return '> ';
  return '';
}

function _svgHatch(pxStart, pxEnd, color, trackH) {
  // pxStart/pxEnd are real pixel positions — called after layout
  const dashW = 1.5;
  const gap   = 6;
  const total = dashW + gap;
  const by    = Math.round(trackH * 0.15);
  const bh    = Math.round(trackH * 0.7);
  const bars  = [];
  for (let x = pxStart; x < pxEnd; x += total) {
    bars.push(`<rect x="${x.toFixed(1)}" y="${by}" width="${dashW}" height="${bh}" fill="${color}"/>`);
  }
  return bars.join('');
}

function _renderRow(ep, minTs, maxTs, saisons) {
  const startTs = _toTs(ep.date_debut_ecriture);
  const endTs   = _toTs(ep.date_fin_ecriture);
  const startQ  = ep.date_debut_qual ?? 'exacte';
  const endQ    = ep.date_fin_qual   ?? 'exacte';
  const HATCH_PC = 8;  // % of track width for hatch zone
  const TRACK_H  = 5;
  const BAR_H    = 10;
  const CY       = TRACK_H / 2;
  const rowId    = `suivi-row-${ep.id ?? Math.random().toString(36).slice(2)}`;
  const saison   = saisons ? saisons.find(s => s.id == ep.saison_id) : null;
  const saisonNum = saison ? (saison.numero ?? '') : '';
  const ACCENT   = saison?.couleur || '#67cbac';

  let tooltipLeft = 50;

  const ttStart = startTs ? `${_qualPfx(startQ)}${_fmtDate(ep.date_debut_ecriture)}` : '?';
  const ttEnd   = endTs   ? `${_qualPfx(endQ)}${_fmtDate(ep.date_fin_ecriture)}`     : '?';
  const ttText  = (startTs && endTs) ? `${ttStart} → ${ttEnd}` : (startTs ? ttStart : ttEnd);

  if (startTs !== null) tooltipLeft = _pct(startTs, minTs, maxTs);
  if (endTs   !== null) tooltipLeft = _pct(endTs,   minTs, maxTs);
  if (startTs !== null && endTs !== null) tooltipLeft = (_pct(startTs, minTs, maxTs) + _pct(endTs, minTs, maxTs)) / 2;

  // Defer SVG drawing after DOM paint so we know real pixel widths
  setTimeout(() => {
    const row = document.getElementById(rowId);
    if (!row) return;
    const track = row.querySelector('.suivi-row-track');
    const svg   = row.querySelector('svg.suivi-track-svg');
    if (!track || !svg) return;
    const W = track.getBoundingClientRect().width;
    if (!W) return;

    const pct = ts => ((ts - minTs) / (maxTs - minTs)) * W;

    let content = `<line x1="0" y1="${CY}" x2="${W}" y2="${CY}" stroke="#2a2a2a" stroke-width="1"/>`;

    if (startTs !== null && endTs !== null) {
      const x1 = pct(startTs), x2 = pct(endTs);
      const w  = Math.max(x2 - x1, 2);
      content += `<rect x="${x1}" y="${CY - BAR_H/2}" width="${w}" height="${BAR_H}" rx="5" fill="${ACCENT}" opacity="0.85"/>`;
    } else if (startTs !== null) {
      const x1 = pct(startTs);
      content += `<circle cx="${x1}" cy="${CY}" r="5" fill="${ACCENT}"/>`;
    } else if (endTs !== null) {
      const x2 = pct(endTs);
      content += `<circle cx="${x2}" cy="${CY}" r="5" fill="${ACCENT}"/>`;
    }

    svg.setAttribute('viewBox', `0 0 ${W} ${TRACK_H}`);
    svg.innerHTML = content;
  }, 0);

  return `
<div class="suivi-row" id="${rowId}">
  <div class="suivi-row-label">
    <span class="suivi-row-label-num" style="color:${ACCENT}">${saisonNum !== '' ? 'S' + saisonNum : ''}E${String(ep.numero_episode ?? '?').padStart(2,'0')}</span>
    <span class="suivi-row-label-title">${esc(ep.titre ?? '')}</span>
  </div>
  <div class="suivi-row-track" style="position:relative;height:${TRACK_H}px;">
    <svg class="suivi-track-svg" style="position:absolute;top:0;left:0;width:100%;height:${TRACK_H}px;overflow:visible;display:block;"></svg>
    <div class="suivi-tooltip" style="left:${tooltipLeft}%">${ttText}</div>
  </div>
</div>`;
}

function _renderTimeline(episodes, saisons) {
  const bounds = _computeBounds(episodes);
  if (!bounds) {
    return `<div class="empty-state">
      <div class="empty-icon">📅</div>
      <div class="empty-title">Aucune date renseignée</div>
      <div class="empty-sub">Ajoutez des dates d'écriture dans les fiches épisode.</div>
    </div>`;
  }
  const { minTs, maxTs } = bounds;
  const { ticks, step } = _buildTicks(minTs, maxTs);

  const axisHTML = ticks.map(ts => {
    const p = _pct(ts, minTs, maxTs);
    return `<div class="suivi-axis-tick" style="left:${p}%">
      <div class="suivi-axis-tick-line"></div>
      <div class="suivi-axis-tick-label">${_tickLabel(ts, step)}</div>
    </div>`;
  }).join('');

  const rowsHTML = episodes
    .filter(ep => _toTs(ep.date_debut_ecriture) || _toTs(ep.date_fin_ecriture))
    .map(ep => _renderRow(ep, minTs, maxTs, saisons))
    .join('');

  return `
<div class="suivi-timeline-wrap">
  <div class="suivi-sort-bar">
    <span>Trier par :</span>
    <button class="suivi-sort-btn ${Suivi.sortMode === 'episode' ? 'active' : ''}" onclick="Suivi.setSort('episode')">Ordre des épisodes</button>
    <button class="suivi-sort-btn ${Suivi.sortMode === 'ecriture' ? 'active' : ''}" onclick="Suivi.setSort('ecriture')">Ordre d'écriture</button>
  </div>
  <div class="suivi-axis">
    <div class="suivi-axis-line"></div>
    ${axisHTML}
  </div>
  <div class="suivi-rows">${rowsHTML}</div>
</div>`;
}

/* ══════════════════════════════════════════════════
   OBJET SUIVI — même pattern qu'Analyse
   ══════════════════════════════════════════════════ */

const Suivi = {
  episodes: [],
  saisons:  [],
  selectedIds: new Set(),
  sortMode: 'episode',

  async init() {
    [this.saisons, this.episodes] = await Promise.all([
      DataStore.get('saisons'),
      api.get('episodes'),
    ]);
    // Sélection par défaut : épisodes avec dates
    this.selectedIds = new Set(
      this.episodes.filter(e => e.date_debut_ecriture || e.date_fin_ecriture).map(e => e.id)
    );
    this.render();
  },

  render() {
    const tab = document.getElementById('tab-suivi');
    if (!tab) return;

    tab.innerHTML = `
      <div class="section-header">
        <div class="section-title">⊞ Suivi d'écriture</div>
      </div>

      <div class="suivi-layout">
        <div class="suivi-filters">

          <div class="filter-section">
            <div class="filter-title">Sélection rapide</div>
            <div class="suivi-quick-btns">
              <button class="btn btn-secondary btn-sm" onclick="Suivi.selectAll()">Tout sélectionner</button>
              <button class="btn btn-ghost btn-sm" onclick="Suivi.clearAll()">Tout désélectionner</button>
              <button class="btn btn-ghost btn-sm" onclick="Suivi.selectAvecDates()">Avec dates seulement</button>
            </div>
          </div>

          <div class="filter-section">
            <div class="filter-title">Par saison</div>
            <div style="display:flex;flex-direction:column;gap:6px">
              ${this.saisons.map(s => {
                const eps     = this.episodes.filter(e => e.saison_id == s.id);
                const nbDates = eps.filter(e => e.date_debut_ecriture || e.date_fin_ecriture).length;
                return `
                  <button class="btn btn-ghost btn-sm"
                    style="border-left:3px solid ${s.couleur};padding-left:10px;text-align:left;justify-content:flex-start"
                    onclick="Suivi.selectSaison(${s.id})">
                    ${esc(s.nom || 'Saison ' + s.numero)}
                    <span style="margin-left:auto;color:var(--text3)">
                      ${eps.length} ep.${nbDates > 0 ? ` <span style="color:${s.couleur};font-weight:700">(${nbDates} 📅)</span>` : ''}
                    </span>
                  </button>`;
              }).join('')}
            </div>
          </div>

          <div class="filter-section">
            <div class="filter-title">Épisodes (${this.selectedIds.size} sél.)</div>
            <div class="episode-select-list">
              ${this.saisons.map(s => {
                const eps = this.episodes.filter(e => e.saison_id == s.id);
                if (!eps.length) return '';
                return `
                  <div style="font-size:10px;color:${s.couleur};font-family:var(--font-display);font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:8px 0 4px;padding-left:4px">
                    ${esc(s.nom || 'Saison ' + s.numero)}
                  </div>
                  ${eps.map(ep => {
                    const hasDates = ep.date_debut_ecriture || ep.date_fin_ecriture;
                    const sel = this.selectedIds.has(ep.id);
                    return `
                      <div class="suivi-ep-item ${sel ? 'selected' : ''}"
                        style="${!hasDates ? 'opacity:0.4;' : ''}"
                        onclick="Suivi.toggleEp(${ep.id})">
                        <div class="ep-checkbox">${sel ? '✓' : ''}</div>
                        <span class="ep-select-label">
                          <span class="suivi-ep-num" style="color:${s.couleur}">S${s.numero}E${String(ep.numero_episode).padStart(2,'0')}</span>
                          ${ep.titre ? ' — ' + esc(ep.titre.substring(0,20)) + (ep.titre.length > 20 ? '…' : '') : ''}
                          ${hasDates ? '<span style="color:var(--accent);font-size:9px;margin-left:4px">📅</span>' : ''}
                        </span>
                      </div>`;
                  }).join('')}`;
              }).join('')}
            </div>
          </div>

        </div>

        <div class="suivi-main">
          ${this._renderMain()}
        </div>
      </div>
    `;
  },

  _renderMain() {
    let selection = this.episodes.filter(ep => this.selectedIds.has(ep.id));
    if (selection.length === 0) {
      return `<div class="empty-state">
        <div class="empty-icon">📅</div>
        <div class="empty-title">Sélectionnez des épisodes</div>
        <div class="empty-sub">Choisissez des épisodes dans le panneau gauche.<br>Seuls ceux avec des dates d'écriture apparaîtront sur la timeline.</div>
      </div>`;
    }
    if (this.sortMode === 'ecriture') {
      selection = [...selection].sort((a, b) => {
        const ta = _toTs(a.date_debut_ecriture) ?? _toTs(a.date_fin_ecriture) ?? Infinity;
        const tb = _toTs(b.date_debut_ecriture) ?? _toTs(b.date_fin_ecriture) ?? Infinity;
        return ta - tb;
      });
    } else {
      // ordre épisode : saison + numéro
      selection = [...selection].sort((a, b) => {
        if (a.saison_id !== b.saison_id) return (a.saison_id ?? 0) - (b.saison_id ?? 0);
        return (a.numero_episode ?? 0) - (b.numero_episode ?? 0);
      });
    }
    return _renderTimeline(selection, this.saisons);
  },

  setSort(mode) {
    this.sortMode = mode;
    const main = document.querySelector('.suivi-main');
    if (main) main.innerHTML = this._renderMain();
    // update button states
    document.querySelectorAll('.suivi-sort-btn').forEach(btn => {
      btn.classList.toggle('active', btn.textContent.includes(mode === 'episode' ? 'épisodes' : 'écriture'));
    });
  },

  toggleEp(id) {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.selectedIds.add(id);
    this.render();
  },

  selectAll() {
    this.episodes.forEach(e => this.selectedIds.add(e.id));
    this.render();
  },

  clearAll() {
    this.selectedIds.clear();
    this.render();
  },

  selectAvecDates() {
    this.selectedIds = new Set(
      this.episodes.filter(e => e.date_debut_ecriture || e.date_fin_ecriture).map(e => e.id)
    );
    this.render();
  },

  selectSaison(saisonId) {
    this.episodes.filter(e => e.saison_id == saisonId).forEach(e => this.selectedIds.add(e.id));
    this.render();
  },
};
