// assets/js/recherche.js
'use strict';

const RECHERCHE_OCCURRENCE_CONTEXT_BEFORE = 190;
const RECHERCHE_OCCURRENCE_CONTEXT_AFTER = 320;


const Recherche = {
  episodes: [],
  saisons: [],
  themes: [],
  personnages: [],
  lieux: [],
  query: '',
  activeTypes: new Set(['episodes', 'themes', 'personnages', 'lieux', 'arcs', 'continuite']),
  textOnly: false,

  TYPES: {
    episodes: 'Épisodes',
    texte: 'Texte épisode',
    themes: 'Thèmes',
    personnages: 'Personnages',
    lieux: 'Lieux',
    arcs: 'Arcs',
    continuite: 'Continuité',
  },

  async init() {
    [this.episodes, this.saisons, this.themes, this.personnages, this.lieux] = await Promise.all([
      api.get('episodes&include_text=1'),
      DataStore.get('saisons'),
      DataStore.get('themes'),
      DataStore.get('personnages'),
      DataStore.get('lieux'),
    ]);
    this.render();
  },

  render() {
    const tab = document.getElementById('tab-recherche');
    if (!tab) return;
    const results = this.search();
    this._lastResults = results;

    tab.innerHTML = `
      <div class="section-header">
        <div>
          <div class="section-title">⌕ Recherche globale</div>
          <div style="color:var(--text3);font-size:12px;margin-top:6px">Cherche dans titres, résumés, commentaires, thèmes, lieux, arcs, mentions et personnages.</div>
        </div>
      </div>
      <div class="recherche-wrap">
        <div class="recherche-box">
          <input class="recherche-input" id="recherche-input" value="${this.escape(this.query)}" placeholder="Ex: plaque, boutique, flashback, mensonge, S1E04..."
            oninput="Recherche.setQuery(this.value)" autofocus>
          <button class="btn btn-ghost" onclick="Recherche.clear()">Effacer</button>
        </div>
        <div class="recherche-filters">
          ${Object.entries(this.TYPES).map(([key, label]) => `
            <button class="recherche-filter ${this.activeTypes.has(key) ? 'active' : ''}" onclick="Recherche.toggleType('${key}')">${label}</button>
          `).join('')}
        </div>
        <div class="recherche-filter-actions">
          <button class="btn btn-ghost btn-sm" onclick="Recherche.selectAllTypes()">Tout sélectionner</button>
          <button class="btn btn-ghost btn-sm" onclick="Recherche.clearTypes()">Tout désélectionner</button>
          <label style="display:flex;align-items:center;gap:7px;cursor:pointer;margin-left:4px">
            <input type="checkbox" ${this.textOnly ? 'checked' : ''} onchange="Recherche.setTextOnly(this.checked)" style="accent-color:var(--accent)">
            Chercher uniquement dans le texte des épisodes
          </label>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:12px">${this.query.trim() ? `${results.length} résultat(s)` : 'Tapez au moins 2 caractères pour lancer la recherche.'}</div>
        ${this.query.trim().length >= 2 ? `
          <div class="recherche-results">
            ${results.map(r => this.renderResult(r)).join('') || `<div class="empty-state"><div class="empty-icon">⌕</div><div class="empty-title">Aucun résultat</div></div>`}
          </div>
        ` : ''}
      </div>
    `;
    if (typeof RemplacementSerie !== 'undefined') RemplacementSerie.monter(tab);
    const input = document.getElementById('recherche-input');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  },

  setQuery(value) {
    this.query = value;
    this.render();
  },

  clear() {
    this.query = '';
    this.render();
  },

  toggleType(type) {
    this.textOnly = false;
    if (this.activeTypes.has(type)) this.activeTypes.delete(type);
    else this.activeTypes.add(type);
    this.render();
  },

  selectAllTypes() {
    this.textOnly = false;
    this.activeTypes = new Set(Object.keys(this.TYPES));
    this.render();
  },

  clearTypes() {
    this.textOnly = false;
    this.activeTypes.clear();
    this.render();
  },

  setTextOnly(checked) {
    this.textOnly = !!checked;
    this.activeTypes = checked
      ? new Set(['texte'])
      : new Set(['episodes', 'themes', 'personnages', 'lieux', 'arcs', 'continuite']);
    this.render();
  },

  search() {
    const parsedQuery = this.parseQuery(this.query);
    if (!parsedQuery.terms.length) return [];
    const rows = [];

    if (this.activeTypes.has('episodes')) {
      for (const ep of this.episodes) {
        this.addIfMatch(rows, 'episodes', this.code(ep), ep.titre || 'Sans titre', [
          ep.titre, ep.titre_fr, ep.resume, ep.intrigue_a, ep.intrigue_b, ep.intrigue_c, ...Object.values(ep.intrigues_sup || {}), ep.commentaires, ep.code, ep.etat_episode,
          ...(ep.themes || []).map(t => `${t.theme_nom || t.nom} ${t.intensite || ''}`),
          ...(ep.lieux || []).map(l => `${l.lieu_nom || l.nom} ${l.statut || ''}`),
          ...(ep.personnages_principaux || ep.personnages || []).map(p => p.prenom || p.nom),
        ], parsedQuery, () => Episodes.openDetail(ep.id));
      }
    }

    if (this.activeTypes.has('texte')) {
      for (const ep of this.episodes) {
        this.addIfMatch(rows, 'texte', this.code(ep), ep.titre || 'Sans titre', [
          ep.texte_episode,
        ], parsedQuery, () => Episodes.openDetail(ep.id), { fieldsOnly: true, textMode: true, episode: ep });
      }
    }

    if (this.activeTypes.has('themes')) {
      for (const t of this.themes) {
        this.addIfMatch(rows, 'themes', 'Thème', t.nom, [t.nom, t.description], parsedQuery, () => {
          Themes.activeTheme = Themes.data?.find(x => x.id == t.id) || t;
          switchTab('themes');
          initTab('themes');
        });
      }
    }

    if (this.activeTypes.has('personnages')) {
      for (const p of this.personnages) {
        this.addIfMatch(rows, 'personnages', 'Personnage', [p.prenom, p.nom].filter(Boolean).join(' '), [
          p.prenom, p.nom, p.nom_affichage, p.profession, p.caracteristiques, p.sexe,
        ], parsedQuery, () => Personnages.openDetail(p.id));
      }
    }

    if (this.activeTypes.has('lieux')) {
      for (const l of this.lieux) {
        this.addIfMatch(rows, 'lieux', 'Lieu', l.nom, [l.nom, l.nom_affichage, l.description], parsedQuery, () => {
          switchTab('decors');
          initTab('decors');
        });
      }
    }

    if (this.activeTypes.has('arcs')) {
      const seen = new Set();
      for (const ep of this.episodes) {
        if (!ep.arc_nom || seen.has(ep.arc_nom)) continue;
        seen.add(ep.arc_nom);
        const eps = this.episodes.filter(e => e.arc_nom === ep.arc_nom);
        this.addIfMatch(rows, 'arcs', 'Arc narratif', ep.arc_nom, [
          ep.arc_nom,
          ...eps.map(e => `${this.code(e)} ${e.titre || ''} ${e.resume || ''}`),
        ], parsedQuery, () => Episodes.openDetail(ep.id));
      }
    }

    if (this.activeTypes.has('continuite')) {
      for (const ep of this.episodes) {
        const liens = [
          ...(ep.liens || []).map(l => `${l.type_lien} ${l.ep_titre || ''} S${l.ep_saison || ''}E${l.ep_num || ''}`),
          ...(ep.mentions || []).map(m => `mention ${m.niveau || ''} ${m.ep_titre || ''} S${m.ep_saison || ''}E${m.ep_num || ''}`),
          ...(ep.plages_temporelles || []).map(p => `${p.date || ''} ${p.moment || ''} ${p.importance || ''} ${p.est_flashback ? 'flashback' : ''}`),
        ];
        this.addIfMatch(rows, 'continuite', this.code(ep), ep.titre || 'Continuité', liens, parsedQuery, () => Episodes.openDetail(ep.id));
      }
    }

    return rows.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 120);
  },

  addIfMatch(rows, type, label, title, fields, parsedQuery, action, options = {}) {
    const hay = fields.filter(Boolean).join(' · ');
    const normalized = this.normalize(options.fieldsOnly ? hay : `${label} ${title} ${hay}`);
    const match = this.matchParsedQuery(normalized, parsedQuery);
    if (!match.ok) return;
    const exactTitle = parsedQuery.terms.some(term => this.normalize(title).includes(term.value));
    const result = {
      type,
      label,
      title,
      snippet: this.snippet(hay || title, parsedQuery, match.term),
      score: (exactTitle ? 40 : 0) + Math.max(1, 30 - match.idx / 10) + match.bonus,
      action,
    };

    if (options.textMode) {
      const occurrences = this.findOccurrences(hay, parsedQuery, match.term);
      result.episodeId = options.episode?.id;
      result.occurrenceTerm = occurrences.term;
      result.occurrenceCount = occurrences.count;
      result.occurrenceItems = occurrences.items;
      result.occurrenceLimitReached = occurrences.limitReached;
      result.action = () => this.openTextOccurrences(result);
    }

    rows.push(result);
  },

  renderResult(r) {
    const occurrenceBadge = r.type === 'texte' && r.occurrenceCount
      ? `<span class="recherche-count">${r.occurrenceCount} occurrence${r.occurrenceCount > 1 ? 's' : ''}</span>`
      : '';
    return `
      <div class="recherche-card" onclick="Recherche.runResult(${this.resultsIndex(r)})">
        <div class="recherche-type">${this.escape(this.TYPES[r.type] || r.type)} · ${this.escape(r.label)}${occurrenceBadge}</div>
        <div class="recherche-title">${this.escape(r.title || 'Sans titre')}</div>
        <div class="recherche-snippet">${r.snippet}</div>
      </div>
    `;
  },

  resultsIndex(result) {
    const idx = this._lastResults.indexOf(result);
    if (idx >= 0) return idx;
    return 0;
  },

  runResult(idx) {
    const result = this._lastResults?.[idx] || this.search()[idx];
    if (result?.action) result.action();
  },

  openTextOccurrences(result) {
    const count = result.occurrenceCount || 0;
    const items = result.occurrenceItems || [];
    const termLabel = result.occurrenceTerm?.raw || this.query.trim();
    const title = `${result.label} · ${result.title || 'Sans titre'}`;
    modal.open(`
      <div class="modal-title">Occurrences dans le texte</div>
      <div class="recherche-occurrence-head">
        <div>
          <strong style="color:var(--text1)">${this.escape(title)}</strong><br>
          Recherche : « ${this.escape(termLabel)} »
        </div>
        <div>${count} occurrence${count > 1 ? 's' : ''}</div>
      </div>
      <div class="recherche-occurrence-list">
        ${items.map((item, i) => `
          <div class="recherche-occurrence">
            <span class="recherche-occurrence-num">#${i + 1}</span>${item.snippet}
          </div>
        `).join('') || `
          <div class="empty-state">
            <div class="empty-icon">⌕</div>
            <div class="empty-title">Aucune occurrence détaillée</div>
          </div>
        `}
        ${result.occurrenceLimitReached ? `
          <div class="recherche-occurrence-more">
            Les ${items.length} premières occurrences sont affichées pour garder la fenêtre lisible.
          </div>
        ` : ''}
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
        <button class="btn btn-ghost" onclick="modal.close()">Fermer</button>
        ${result.episodeId ? `<button class="btn btn-primary" onclick="modal.close();Episodes.openDetail(${Number(result.episodeId)})">Ouvrir la fiche épisode</button>` : ''}
      </div>
    `);
  },

  parseQuery(query) {
    const terms = [];
    const raw = String(query || '');
    const phraseRegex = /"([^"]+)"|“([^”]+)”|«\s*([^»]+)\s*»/g;
    let withoutPhrases = raw;
    let match;

    while ((match = phraseRegex.exec(raw)) !== null) {
      const phrase = (match[1] || match[2] || match[3] || '').trim();
      if (phrase.length >= 2) {
        terms.push({ value: this.normalize(phrase), raw: phrase, phrase: true });
      }
      withoutPhrases = withoutPhrases.replace(match[0], ' ');
    }

    withoutPhrases.split(/\s+/)
      .map(x => x.trim())
      .filter(x => x.length >= 2)
      .forEach(word => terms.push({ value: this.normalize(word), raw: word, phrase: false }));

    return { terms };
  },

  matchParsedQuery(normalized, parsedQuery) {
    let bestIdx = Infinity;
    let bestTerm = parsedQuery.terms[0] || null;
    let bonus = 0;

    for (const term of parsedQuery.terms) {
      const idx = normalized.indexOf(term.value);
      if (idx === -1) return { ok: false, idx: -1, term: null, bonus: 0 };
      if (idx < bestIdx) {
        bestIdx = idx;
        bestTerm = term;
      }
      if (term.phrase) bonus += 18;
    }

    return { ok: true, idx: bestIdx, term: bestTerm, bonus };
  },

  snippet(text, parsedQuery, preferredTerm = null) {
    const raw = String(text || '');
    const normalized = this.normalize(raw);
    const term = preferredTerm || parsedQuery.terms[0];
    const idx = term ? normalized.indexOf(term.value) : -1;
    const start = Math.max(0, idx - 60);
    const part = raw.slice(start, start + 170);
    const safe = this.escape((start > 0 ? '…' : '') + part + (start + 170 < raw.length ? '…' : ''));
    const highlightTerms = parsedQuery.terms
      .map(t => t.raw)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .map(w => this.escapeRegex(this.escape(w)));
    if (!highlightTerms.length) return safe;
    return safe.replace(new RegExp(`(${highlightTerms.join('|')})`, 'gi'), '<span class="recherche-hit">$1</span>');
  },

  findOccurrences(text, parsedQuery, preferredTerm = null) {
    const raw = String(text || '');
    const normalized = this.normalize(raw);
    const term = this.pickOccurrenceTerm(parsedQuery, preferredTerm);
    if (!term?.value) return { count: 0, items: [], term: null, limitReached: false };

    const items = [];
    const limit = 200;
    let count = 0;
    let from = 0;
    let idx = normalized.indexOf(term.value, from);

    while (idx !== -1) {
      count += 1;
      if (items.length < limit) {
        items.push({
          index: idx,
          snippet: this.occurrenceSnippet(raw, idx, term, parsedQuery),
        });
      }
      from = idx + Math.max(term.value.length, 1);
      idx = normalized.indexOf(term.value, from);
    }

    return { count, items, term, limitReached: count > items.length };
  },

  pickOccurrenceTerm(parsedQuery, preferredTerm = null) {
    return parsedQuery.terms.find(term => term.phrase) || preferredTerm || parsedQuery.terms[0] || null;
  },

  occurrenceSnippet(text, normalizedIdx, term, parsedQuery) {
    const raw = String(text || '');
    const termLength = term?.raw?.length || term?.value?.length || 0;
    const start = Math.max(0, normalizedIdx - RECHERCHE_OCCURRENCE_CONTEXT_BEFORE);
    const length = RECHERCHE_OCCURRENCE_CONTEXT_BEFORE + termLength + RECHERCHE_OCCURRENCE_CONTEXT_AFTER;
    const part = raw.slice(start, start + length);
    const safe = this.escape((start > 0 ? '…' : '') + part + (start + length < raw.length ? '…' : ''));
    const highlightTerms = parsedQuery.terms
      .map(t => t.raw)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .map(w => this.escapeRegex(this.escape(w)));
    if (!highlightTerms.length) return safe;
    return safe.replace(new RegExp(`(${highlightTerms.join('|')})`, 'gi'), '<span class="recherche-hit">$1</span>');
  },

  escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  normalize(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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


// ─── Remplacer dans toute la série : aperçu épisode par épisode, puis remplacement de ceux qu'on coche ───
// Chaque script modifié part d'abord dans ses Versions (Écriture → Brouillon → Versions) : on peut revenir en arrière.

const RemplacementSerie = {
  ouvert: false,
  chercher: '',
  remplacer: '',
  casse: false,
  mot: true,
  apercu: null,
  coches: new Set(),
  occupe: false,

  monter(tab) {
    const section = document.createElement('section');
    section.className = 'rs-zone';
    section.id = 'rs-zone';
    tab.appendChild(section);
    this.rendre();
  },

  _code: e => `S${e.saison}E${String(e.numero).padStart(2, '0')}`,

  rendre() {
    const z = document.getElementById('rs-zone');
    if (!z) return;
    const a = this.apercu;
    z.innerHTML = `
      <details ${this.ouvert ? 'open' : ''} ontoggle="RemplacementSerie.ouvert = this.open">
        <summary class="rs-titre">Remplacer dans toute la série</summary>
        <p class="an-note">Pour renommer un personnage ou un lieu partout d'un coup. Rien n'est remplacé sans aperçu, et chaque script modifié est d'abord gardé dans ses Versions.</p>
        <div class="rs-champs">
          <input id="rs-chercher" type="text" maxlength="200" aria-label="Chercher" placeholder="Chercher…" value="${esc(this.chercher)}" oninput="RemplacementSerie.chercher = this.value; RemplacementSerie.apercu = null" onkeydown="if (event.key === 'Enter') RemplacementSerie.voir()">
          <input id="rs-remplacer" type="text" maxlength="200" aria-label="Remplacer par" placeholder="Remplacer par…" value="${esc(this.remplacer)}" oninput="RemplacementSerie.remplacer = this.value; RemplacementSerie.apercu = null" onkeydown="if (event.key === 'Enter') RemplacementSerie.voir()">
          <label class="interface-case"><input type="checkbox" ${this.mot ? 'checked' : ''} onchange="RemplacementSerie.mot = this.checked; RemplacementSerie.apercu = null"> Mot entier</label>
          <label class="interface-case"><input type="checkbox" ${this.casse ? 'checked' : ''} onchange="RemplacementSerie.casse = this.checked; RemplacementSerie.apercu = null"> Casse exacte</label>
          <button type="button" class="btn btn-secondary btn-sm" ${this.occupe ? 'disabled' : ''} onclick="RemplacementSerie.voir()">Aperçu</button>
        </div>
        ${a ? (a.episodes.length ? `
          <div class="rs-entete">
            <strong>${a.total} occurrence(s) dans ${a.episodes.length} épisode(s)</strong>
            <button type="button" class="btn btn-ghost btn-sm" onclick="RemplacementSerie.tout(true)">Tout cocher</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="RemplacementSerie.tout(false)">Tout décocher</button>
            <button type="button" class="btn btn-primary btn-sm" ${this.coches.size && !this.occupe ? '' : 'disabled'} onclick="RemplacementSerie.appliquer()">Remplacer dans ${this.coches.size} épisode(s)</button>
          </div>
          <ul class="rs-liste">${a.episodes.map(e => `<li>
            <label class="rs-ep"><input type="checkbox" ${this.coches.has(e.id) ? 'checked' : ''} onchange="RemplacementSerie.cocher(${e.id}, this.checked)">
              <strong>${esc(this._code(e))}</strong> <span>${esc(e.titre || 'Sans titre')}</span>
              <span class="an-note">${e.script ? `${e.script} dans le script` : ''}${e.script && e.brouillon ? ' · ' : ''}${e.brouillon ? `${e.brouillon} dans le brouillon` : ''}</span></label>
            ${e.extraits.map(x => `<div class="rs-extrait">…${esc(x.avant)}<del>${esc(x.trouve)}</del><ins>${esc(x.par)}</ins>${esc(x.apres)}…</div>`).join('')}
          </li>`).join('')}</ul>` : '<p class="an-note">Introuvable dans les scripts et les brouillons.</p>') : ''}
      </details>`;
  },

  async voir() {
    if (!this.chercher.trim()) { document.getElementById('rs-chercher')?.focus(); return; }
    this.occupe = true;
    this.rendre();
    const r = await api.post('remplacer_serie', { action: 'apercu', chercher: this.chercher, remplacer: this.remplacer, casse: this.casse, mot: this.mot }).catch(() => ({ error: 'Le serveur ne répond pas.' }));
    this.occupe = false;
    if (r.error) { toast(r.error, 'error'); this.apercu = null; this.rendre(); return; }
    this.apercu = r;
    this.coches = new Set(r.episodes.map(e => e.id));
    this.rendre();
  },

  cocher(id, oui) {
    if (oui) this.coches.add(id); else this.coches.delete(id);
    this.rendre();
  },

  tout(oui) {
    this.coches = new Set(oui ? this.apercu.episodes.map(e => e.id) : []);
    this.rendre();
  },

  async appliquer() {
    const n = this.coches.size;
    if (!n || !confirm(`Remplacer « ${this.chercher} » par « ${this.remplacer} » dans ${n} épisode(s) ? Chaque script est d'abord gardé dans ses Versions.`)) return;
    this.occupe = true;
    this.rendre();
    toast('Remplacement et nouvelle analyse des scripts…', 'info');
    const r = await api.post('remplacer_serie', { action: 'appliquer', chercher: this.chercher, remplacer: this.remplacer, casse: this.casse, mot: this.mot, ids: [...this.coches] }).catch(() => ({ error: 'Le serveur ne répond pas.' }));
    this.occupe = false;
    if (r.error) { toast(r.error, 'error'); this.rendre(); return; }
    toast(`${r.total} remplacement(s) dans ${r.episodes.length} épisode(s). Les anciens textes sont dans les Versions.`);
    this.apercu = null;
    this.coches = new Set();
    // Les autres onglets relisent les scripts modifiés, comme après un import
    window.DataStore?.invalidateForMutation('upload');
    this.rendre();
  },
};
