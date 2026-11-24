// assets/js/miroirs.js
'use strict';


const Miroirs = {
  episodes: [],
  saisons: [],
  saisonFilter: 'all',
  minScore: 35,

  async init() {
    [this.episodes, this.saisons] = await Promise.all([
      api.get('episodes'),
      DataStore.get('saisons'),
    ]);
    this.render();
  },

  render() {
    const tab = document.getElementById('tab-miroirs');
    if (!tab) return;
    const pairs = this.computePairs();

    tab.innerHTML = `
      <div class="section-header">
        <div>
          <div class="section-title">⇄ Épisodes miroirs</div>
          <div style="color:var(--text3);font-size:12px;margin-top:6px;max-width:820px;line-height:1.5">
            Détection d'échos possibles entre épisodes : thèmes, personnages, lieux, arcs, mentions et vocabulaire des résumés. Ce n'est pas une vérité automatique, plutôt une lampe torche.
          </div>
        </div>
      </div>
      <div class="miroirs-wrap">
        <div class="miroirs-controls">
          <span style="font-family:var(--font-display);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text3)">Saison :</span>
          <select class="miroirs-select" onchange="Miroirs.setSaison(this.value)">
            <option value="all" ${this.saisonFilter === 'all' ? 'selected' : ''}>Toutes les saisons</option>
            ${this.saisons.map(s => `<option value="${s.id}" ${this.saisonFilter == s.id ? 'selected' : ''}>${this.escape(s.nom || 'Saison ' + s.numero)}</option>`).join('')}
          </select>
          <span style="font-family:var(--font-display);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text3)">Seuil :</span>
          <select class="miroirs-select" onchange="Miroirs.setMinScore(this.value)">
            ${[25, 35, 45, 60, 75].map(v => `<option value="${v}" ${this.minScore === v ? 'selected' : ''}>${v}%+</option>`).join('')}
          </select>
          <span style="font-size:11px;color:var(--text3);margin-left:auto">${pairs.length} miroir(s) possible(s)</span>
        </div>
        ${pairs.length ? `
          <div class="miroirs-grid">
            ${pairs.map(pair => this.renderPair(pair)).join('')}
          </div>
        ` : `
          <div class="empty-state">
            <div class="empty-icon">⇄</div>
            <div class="empty-title">Aucun miroir détecté</div>
            <div class="empty-sub">Baissez le seuil ou ajoutez thèmes, lieux, personnages, arcs et résumés pour enrichir la détection.</div>
          </div>
        `}
      </div>
    `;
  },

  setSaison(value) {
    this.saisonFilter = value === 'all' ? 'all' : parseInt(value);
    this.render();
  },

  setMinScore(value) {
    this.minScore = parseInt(value);
    this.render();
  },

  renderPair(pair) {
    return `
      <div class="miroir-card">
        <div class="miroir-top">
          ${this.renderEpisodeBox(pair.a)}
          <div class="miroir-score">
            <div class="miroir-score-num">${pair.score}%</div>
            <div class="miroir-score-label">écho</div>
          </div>
          ${this.renderEpisodeBox(pair.b)}
        </div>
        <div class="miroir-reasons">
          ${pair.reasons.map(r => `<span class="miroir-reason">${this.escape(r)}</span>`).join('')}
        </div>
      </div>
    `;
  },

  renderEpisodeBox(ep) {
    return `
      <div class="miroir-ep" onclick="Episodes.openDetail(${ep.id})" title="${this.escape(ep.titre || '')}">
        <div class="miroir-ep-code">${this.code(ep)}</div>
        <div class="miroir-ep-title">${this.escape(ep.titre || 'Sans titre')}</div>
      </div>
    `;
  },

  computePairs() {
    const eps = this.episodes
      .filter(ep => this.saisonFilter === 'all' || ep.saison_id == this.saisonFilter)
      .sort((a, b) => this.order(a, b));
    const pairs = [];

    for (let i = 0; i < eps.length; i++) {
      for (let j = i + 1; j < eps.length; j++) {
        const pair = this.scorePair(eps[i], eps[j]);
        if (pair.score >= this.minScore) pairs.push(pair);
      }
    }

    return pairs
      .sort((a, b) => b.score - a.score || this.order(a.a, b.a) || this.order(a.b, b.b))
      .slice(0, 80);
  },

  scorePair(a, b) {
    const reasons = [];
    let score = 0;

    const themeScore = this.sharedThemes(a, b);
    if (themeScore.names.length) {
      score += Math.min(30, themeScore.score);
      reasons.push(`thèmes : ${themeScore.names.slice(0, 3).join(', ')}`);
    }

    const aPersos = (a.personnages_principaux || a.personnages || []).filter(p => parseInt(p.present ?? 1) === 1);
    const bPersos = (b.personnages_principaux || b.personnages || []).filter(p => parseInt(p.present ?? 1) === 1);
    const chars = this.sharedNames(aPersos, bPersos, x => x.prenom || x.nom);
    if (chars.length) {
      score += Math.min(18, chars.length * 5);
      reasons.push(`personnages : ${chars.slice(0, 3).join(', ')}`);
    }

    const aLieux = (a.lieux || []).filter(l => (l.statut || 'present') === 'present');
    const bLieux = (b.lieux || []).filter(l => (l.statut || 'present') === 'present');
    const lieux = this.sharedNames(aLieux, bLieux, x => x.lieu_nom || x.nom).filter(Boolean);
    if (lieux.length) {
      score += Math.min(12, lieux.length * 4);
      reasons.push(`lieux : ${lieux.slice(0, 2).join(', ')}`);
    }

    if (a.arc_nom && b.arc_nom && a.arc_nom === b.arc_nom) {
      score += 28;
      reasons.push(`même arc : ${a.arc_nom}`);
    }

    if (this.hasExplicitLink(a, b)) {
      score += 35;
      reasons.push('lien narratif explicite');
    }

    const text = this.textSimilarity(a, b);
    if (text.score >= 8) {
      score += Math.min(18, text.score);
      reasons.push(`motifs : ${text.words.slice(0, 4).join(', ')}`);
    }

    if (this.sameChronoShape(a, b)) {
      score += 8;
      reasons.push('structure chronologique proche');
    }

    return {
      a,
      b,
      score: Math.min(100, Math.round(score)),
      reasons: reasons.length ? reasons : ['similarité faible mais mesurable'],
    };
  },

  sharedThemes(a, b) {
    const weights = { central: 10, 'fil rouge': 7, mention: 4 };
    const aThemes = new Map((a.themes || []).map(t => [String(t.theme_id || t.id), t]));
    const names = [];
    let score = 0;

    for (const t of (b.themes || [])) {
      const id = String(t.theme_id || t.id);
      if (!aThemes.has(id)) continue;
      const at = aThemes.get(id);
      names.push(t.theme_nom || at.theme_nom || t.nom || at.nom || `#${id}`);
      score += Math.max(weights[t.intensite] || 4, weights[at.intensite] || 4);
    }
    return { names, score };
  },

  sharedNames(aItems, bItems, getter) {
    const aNames = new Set(aItems.map(getter).filter(Boolean));
    return [...new Set(bItems.map(getter).filter(Boolean).filter(name => aNames.has(name)))];
  },

  hasExplicitLink(a, b) {
    const bId = parseInt(b.id);
    const aId = parseInt(a.id);
    return (a.liens || []).some(l => parseInt(l.episode_lie_id) === bId)
      || (b.liens || []).some(l => parseInt(l.episode_lie_id) === aId)
      || (a.mentions || []).some(m => parseInt(m.episode_mentionne_id) === bId)
      || (b.mentions || []).some(m => parseInt(m.episode_mentionne_id) === aId);
  },

  textSimilarity(a, b) {
    const wordsA = this.keywords([a.titre, a.titre_fr, a.resume, a.intrigue_a, a.intrigue_b, a.intrigue_c, a.commentaires].join(' '));
    const wordsB = this.keywords([b.titre, b.titre_fr, b.resume, b.intrigue_a, b.intrigue_b, b.intrigue_c, b.commentaires].join(' '));
    const shared = [...wordsA].filter(w => wordsB.has(w));
    return { words: shared, score: shared.length * 3 };
  },

  keywords(text) {
    const stop = new Set(['avec','dans','pour','sans','mais','donc','alors','quand','comme','plus','moins','tout','tous','elle','elles','nous','vous','leur','leurs','une','des','les','aux','sur','est','sont','qui','que','quoi','dont','episode','épisode']);
    return new Set(String(text || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .match(/[a-z0-9]{4,}/g)
      ?.filter(w => !stop.has(w))
      .slice(0, 80) || []);
  },

  sameChronoShape(a, b) {
    const aPlages = a.plages_temporelles || [];
    const bPlages = b.plages_temporelles || [];
    if (!aPlages.length || !bPlages.length) return false;
    return aPlages.length === bPlages.length
      || aPlages.some(x => bPlages.some(y => x.moment && x.moment === y.moment && x.importance === y.importance));
  },

  order(a, b) {
    if ((a.saison_numero || 0) !== (b.saison_numero || 0)) return (a.saison_numero || 0) - (b.saison_numero || 0);
    return (a.numero_episode || 0) - (b.numero_episode || 0);
  },

  code(ep) {
    return `S${ep.saison_numero}E${String(ep.numero_episode).padStart(2, '0')}`;
  },

  escape(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },
};
