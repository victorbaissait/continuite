// ===== ÉTATS ÉPISODE =====
const ETAT_COLORS = {
  "cata": "#000000",
  "très mauvais": "#808080",
  "mauvais": "#800000",
  "pas terrible": "#ff0000",
  "moyen": "#ff8000",
  "assez bien": "#ffff00",
  "bien": "#80ff00",
  "très bien": "#008000",
  "excellent": "#00ffcc",
  "ok": "#00ffff",
  "terminé": "#0080ff",
  "version finalisé": "#8080b0",
  "script": "#00008b",
  "filmé": "#6a0dad",
  "diffusé": "#f5deb3",
  "changer une des histoires": "#ff80ff",
  "changer les histoires": "#ff00ff",
  "a revoir totalement": "#bf00ff",
  "a mettre ailleurs (1 des histoires)": "#800080",
  "a mettre ailleurs (episode entier)": "#4b0082",
  "non écrit, potentiellement intréssant": "#8b4513",
  "non écrit, idée intéresante": "#cd5c5c",
  "non écrit, mais prioritaire": "#d2b48c",
  "en cours d'écriture": "#c0c0c0",
  "idem mais prioritaire": "#a9a9a9",
  "idée peu inspirante pour le moment": "#ffff80",
};
const ETAT_OPTIONS = Object.keys(ETAT_COLORS);

/* ── helpers dates d'écriture ── */
function formatDateJJMMYY(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const jj = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${jj}/${mm}/${yy}`;
}
function qualLabel(q) {
  if (q === 'avant') return '< ';
  if (q === 'apres') return '> ';
  return '';
}
function renderDateWithQual(qual, date) {
  if (!date) return '—';
  return `${qualLabel(qual)}${formatDateJJMMYY(date)}`;
}

function etatColor(etat) {
  return etat ? (ETAT_COLORS[etat] || 'transparent') : 'transparent';
}
function etatTextColor(bg) {
  if (!bg || bg === 'transparent') return 'var(--text3)';
  const r = parseInt(bg.slice(1,3),16), g = parseInt(bg.slice(3,5),16), b = parseInt(bg.slice(5,7),16);
  return (r*299 + g*587 + b*114) / 1000 > 128 ? '#111' : '#fff';
}

// assets/js/episodes.js

const Episodes = {
  data: [],
  saisons: [],
  lieux: [],
  themes: [],
  personnages: [],
  currentFilter: 'all',
  _episodeTopMotsAvecVerbes: {},

  async init() {
    await this.loadAll();
    this.render();
  },

  async loadAll() {
    [this.saisons, this.data, this.lieux, this.themes, this.personnages] = await Promise.all([
      DataStore.get('saisons'),
      api.get('episodes'),
      DataStore.get('lieux'),
      DataStore.get('themes'),
      DataStore.get('personnages')
    ]);
  },

  render() {
    const tab = document.getElementById('tab-episodes');
    // Personnages principaux (est_principal == 2)
    const principaux  = this.personnages.filter(p => p.est_principal == 2);
    // Personnages récurrents (est_principal == 1) → colonne par perso
    const recurrents  = this.personnages.filter(p => p.est_principal == 1);
    // Lieux principaux vs autres (champ est_principal en BDD)
    const decorsPrincipaux = this.lieux.filter(l => l.est_principal == 1);
    const decorsAutres     = this.lieux.filter(l => l.est_principal != 1);

    const colonnes = this.colonnesVisibles();
    const vide = n => '<th></th>'.repeat(n);
    const groupe = (liste, titre) => (liste.length ? `<th colspan="${liste.length}" class="episodes-group-th">${titre}</th>` : '');
    const simple = (html) => [html, '<th></th>'];
    const entetes = {
      index: simple('<th>N°</th>'), titre: simple('<th>Titre</th>'), saison: simple('<th>Sa.</th>'), numero: simple('<th>Ep</th>'),
      date: simple('<th>Date</th>'), jet: simple('<th>Jet</th>'), avancement: simple('<th>Avanc.</th>'), pages: simple('<th>P.</th>'),
      duree: simple('<th>Durée</th>'), mots: simple('<th title="Nombre de mots">m.</th>'), scenes: simple('<th title="Nombre de scènes">s.</th>'),
      etat: simple('<th title="État">Ét.</th>'),
      debut: simple('<th title="Début rédaction 1er jet">Déb. réd.</th>'), fin: simple('<th title="Fin rédaction 1er jet">Fin réd.</th>'),
      principaux: [groupe(principaux, 'PERSOS PRINCIPAUX'), principaux.map((p, i) => `<th class="episodes-character-head ${i === 0 ? 'episodes-border-left' : ''}" style="--cell-color:${p.couleur_identite}" title="${esc(p.prenom)}">${esc(p.prenom.slice(0, 2))}</th>`).join('')],
      recurrents: [groupe(recurrents, 'PERSOS RÉCU.'), recurrents.map((p, i) => `<th class="episodes-character-head ${i === 0 ? 'episodes-border-left' : ''}" style="--cell-color:${p.couleur_identite}" title="${esc(p.prenom)}">${esc(p.nom_affichage || p.prenom.slice(0, 2))}</th>`).join('')],
      autresPersos: ['<th class="episodes-group-th">AUT. PER.</th>', '<th class="episodes-border-left"></th>'],
      decors: [groupe(decorsPrincipaux, 'DÉCORS PRINCIPAUX'), decorsPrincipaux.map((l, i) => `<th class="episodes-decor-head ${i === 0 ? 'episodes-border-left' : ''}" title="${esc(l.nom)}">${esc(l.nom_affichage || l.nom)}</th>`).join('')],
      autresDecors: ['<th class="episodes-group-th">AUTR. DÉC.</th>', '<th class="episodes-border-left"></th>'],
      themes: simple('<th>Thèmes</th>'), actions: simple('<th></th>'),
    };
    this.lettresIntrigues().forEach(l => { entetes[`intrigue_${l}`] = simple(`<th>Intrigue ${l}</th>`); });

    tab.innerHTML = `
      <div class="section-header">
        <div class="section-title">⊞ Épisodes</div>
        <div class="section-actions">
          <button class="btn btn-ghost" onclick="Interface.ouvrirColonnes()">⚙ Personnaliser</button>
          <button class="btn btn-secondary" onclick="Episodes.openSaisonManager()">Gérer saisons</button>
          <button class="btn btn-primary" onclick="Episodes.openNewEpisode()">+ Nouvel épisode</button>
        </div>
      </div>

      <div class="saison-filter-bar">
        <button class="saison-filter-btn ${this.currentFilter === 'all' ? 'active' : ''}"
          style="${this.currentFilter === 'all' ? 'background:#e0e0e0' : ''}"
          onclick="Episodes.setFilter('all')">Toutes</button>
        ${this.saisons.map(s => `
          <button class="saison-filter-btn ${this.currentFilter == s.id ? 'active' : ''}"
            style="${this.currentFilter == s.id ? `background:${s.couleur};border-color:${s.couleur}` : `border-color:${s.couleur}33;color:${s.couleur}`}"
            onclick="Episodes.setFilter(${s.id})">
            ${esc(s.nom || 'Saison ' + s.numero)}
          </button>
        `).join('')}
      </div>

      <div class="episodes-container">
        <style id="episodes-style">${this._styleTailles()}</style>
        <table class="episodes-grid">
          <thead>
            <tr>${colonnes.map(c => this._marquer(c.k, entetes[c.k][0], 'th')).join('')}</tr>
            <tr class="episodes-subhead-row">${colonnes.map(c => this._marquer(c.k, entetes[c.k][1], 'th')).join('')}</tr>
          </thead>
          <tbody>
            ${this.renderRows(principaux, recurrents, decorsPrincipaux, decorsAutres)}
          </tbody>
        </table>
      </div>
    `;
  },

  lettresIntrigues() {
    return ['A', 'B', 'C', ...Interface.config.intrigues];
  },

  colonnes() {
    const liste = [
      ['index', 'Numéro de ligne'], ['titre', 'Titre'], ['saison', 'Saison'], ['numero', 'Épisode'], ['date', 'Date'], ['jet', 'Jet'],
      ['avancement', 'Avancement'], ['pages', 'Pages'], ['duree', 'Durée'], ['mots', 'Mots'], ['scenes', 'Scènes'], ['etat', 'État'],
      ...this.lettresIntrigues().map(l => [`intrigue_${l}`, `Intrigue ${l}`]),
      ['debut', 'Début de rédaction'], ['fin', 'Fin de rédaction'], ['principaux', 'Persos principaux'], ['recurrents', 'Persos récurrents'],
      ['autresPersos', 'Autres persos'], ['decors', 'Décors principaux'], ['autresDecors', 'Autres décors'], ['themes', 'Thèmes'], ['actions', 'Modifier / supprimer'],
    ].map(([k, nom]) => ({ k, nom }));
    return Interface._ordonner(liste, Interface.config.ordreEpisodes, c => c.k);
  },

  colonnesVisibles() {
    return this.colonnes().filter(c => !Interface.config.masquesEpisodes.includes(c.k));
  },

  _marquer(colonne, html, balise = 'td') {
    return html.replace(new RegExp(`<${balise}\\b`, 'g'), `<${balise} data-col="${colonne}"`);
  },

  _styleTailles() {
    const tailles = Interface.config.taillesEpisodes;
    const regle = (selecteur, px) => `${selecteur}, ${selecteur} * { font-size: ${px}px !important; }
      ${selecteur} .presence-dot { width: ${px * 2}px; height: ${px * 2}px; }`;
    const couleurs = Interface.couleursColonnes();
    const selecteur = k => (k === '*' ? '.episodes-grid td' : `.episodes-grid [data-col="${k}"]`);
    // Les pastilles de personnages gardent leur propre contraste
    const regleCouleur = (k, c) => `${selecteur(k)}, ${selecteur(k)} *:not(.presence-dot) { color: ${c} !important; }`;
    return [
      ...Object.entries(tailles).map(([k, px]) => regle(selecteur(k), Number(px))),
      ...Object.entries(couleurs).filter(([k]) => k === '*').map(([k, c]) => regleCouleur(k, c)),
      ...Object.entries(couleurs).filter(([k]) => k !== '*').map(([k, c]) => regleCouleur(k, c)),
    ].join('\n');
  },

  renderRows(principaux, recurrents, decorsPrincipaux, decorsAutres) {
    let episodes = this.data;
    if (this.currentFilter !== 'all') {
      episodes = episodes.filter(e => e.saison_id == this.currentFilter);
    }

    if (!episodes.length) {
      return `<tr><td colspan="30" class="episodes-empty-cell">
        Aucun épisode — <a href="#" onclick="Episodes.openNewEpisode()" class="episodes-empty-link">Créer le premier</a>
      </td></tr>`;
    }

    // Détecter la première apparition de chaque récurrent (parcours chronologique)
    const allEps = this.data.slice().sort((a, b) => {
      if (a.saison_numero !== b.saison_numero) return a.saison_numero - b.saison_numero;
      return a.numero_episode - b.numero_episode;
    });
    const premiereApp = {};
    recurrents.forEach(p => {
      const first = allEps.find(e =>
        (e.personnages_principaux || []).find(x => x.personnage_id == p.id && x.present == 1)
      );
      if (first) premiereApp[p.id] = first.id;
    });

    return episodes.map((ep, idx) => {
      const pct = parseInt(ep.avancement) || 0;
      const saison = this.saisons.find(s => s.id == ep.saison_id);
      const sColor = saison?.couleur || '#888';

      // Présence personnages principaux
      const presenceCells = principaux.map((p, pi) => {
        const pp = (ep.personnages_principaux || []).find(x => x.personnage_id == p.id);
        const present = pp?.present == 1;
        // nb_repliques null/undefined = non uploadé, 0 = uploadé sans réplique, >0 = normal
        const nbRepl = pp?.nb_repliques;
        const nonUploade = present && (nbRepl === null || nbRepl === undefined);
        const zeroRepl = present && nbRepl === 0;
        const dotOpacity = (nonUploade || zeroRepl) ? '0.35' : '1';
        const titleSuffix = nonUploade ? ' — non uploadé' : zeroRepl ? ' — 0 répl.' : nbRepl ? ' — ' + nbRepl + ' répl.' : '';
        return `<td class="${pi===0?'episodes-border-left':''}">
          <span class="presence-dot ${present ? 'present' : 'absent'}"
            style="background:${present ? p.couleur_identite : 'transparent'};border-color:${p.couleur_identite};color:${present ? '#000' : p.couleur_identite};opacity:${dotOpacity}"
            title="${esc(p.prenom)}${titleSuffix}">
            ${esc(p.prenom[0])}
          </span>
        </td>`;
      }).join('');

      // Personnages récurrents — colonne par perso, avec logique première apparition
      const recurrentCells = recurrents.map((p, ri) => {
        const pp = (ep.personnages_principaux || []).find(x => x.personnage_id == p.id);
        const present = pp?.present == 1;
        const isFirst = present && premiereApp[p.id] === ep.id;
        // Episodes before first appearance: completely empty
        const firstAppEpId = premiereApp[p.id];
        const firstAppEp = firstAppEpId ? allEps.find(e => e.id === firstAppEpId) : null;
        const currentEpOrder = (ep.saison_numero * 1000) + ep.numero_episode;
        const firstAppOrder = firstAppEp ? (firstAppEp.saison_numero * 1000) + firstAppEp.numero_episode : null;
        const isBeforeFirstApp = firstAppOrder !== null && currentEpOrder < firstAppOrder;

        let cellContent;
        if (isBeforeFirstApp) {
          // Completely empty — character doesn't exist yet
          cellContent = '';
        } else if (!present) {
          cellContent = `<span class="presence-dot absent"
            style="background:transparent;border-color:${p.couleur_identite};color:${p.couleur_identite}"
            title="${esc(p.prenom)} — absent">
            ${esc(p.prenom[0])}
          </span>`;
        } else if (isFirst) {
          // Première apparition : étiquette spéciale, pas de rond
          const nbRepl = pp?.nb_repliques;
          const tooltipSuffix = (nbRepl !== null && nbRepl !== undefined) ? ` — ${nbRepl} répl.` : ' — 1ère apparition';
          cellContent = `<span class="episodes-first-appearance" style="--person-color:${p.couleur_identite};--person-bg:${p.couleur_identite}22" title="${esc(p.prenom)}${tooltipSuffix}">1er</span>`;
        } else {
          const nbRepl = pp?.nb_repliques;
          const nonUploade = nbRepl === null || nbRepl === undefined;
          const zeroRepl = nbRepl === 0;
          const dotOpacity = (nonUploade || zeroRepl) ? '0.35' : '1';
          const titleSuffix = nonUploade ? ' — non uploadé' : zeroRepl ? ' — 0 répl.' : nbRepl ? ' — ' + nbRepl + ' répl.' : '';
          cellContent = `<span class="presence-dot present"
            style="background:${p.couleur_identite};border-color:${p.couleur_identite};color:#000;opacity:${dotOpacity}"
            title="${esc(p.prenom)}${titleSuffix}">
            ${esc(p.prenom[0])}
          </span>`;
        }
        return `<td class="${ri===0?'episodes-border-left':''}">${cellContent}</td>`;
      }).join('');

      // AUTRES PERSOS : personnages "autre" (est_principal==0) présents + extras libres
      const autresP = this.personnages.filter(p => p.est_principal == 0);
      const autresPresentsData = autresP.filter(p => {
        const pp = (ep.personnages_principaux || []).find(x => x.personnage_id == p.id);
        return pp?.present == 1;
      }).map(p => p.prenom + (p.nom ? ' ' + p.nom : ''));
      const extrasNoms = (ep.extras || []).map(x => x.nom);
      const autresPersosTxt = [...autresPresentsData, ...extrasNoms].join(', ');
      const abrev = str => str.trim().split(/\s+/).map((w, i) => i === 0 ? w[0].toUpperCase() : w[0].toLowerCase()).join('');
      const autresPersosBrev = [...autresPresentsData, ...extrasNoms].map(n => `<span title="${esc(n)}">${esc(abrev(n))}</span>`).join(' ');

      // Décors principaux
      const decorsPrincipauxCells = (decorsPrincipaux || []).map((l, li) => {
        const el = (ep.lieux || []).find(x => x.lieu_id == l.id);
        const statut = el?.statut || 'absent';
        let icon = '—', color = 'var(--text3)';
        if (statut === 'present') { icon = '✓'; color = 'var(--accent3)'; }
        else if (statut === 'pas encore existant') { icon = '◎'; color = 'var(--accent4)'; }
        return `<td class="episodes-decor-presence ${statut === 'absent' ? 'is-absent' : ''} ${li===0?'episodes-border-left':''}" style="--decor-status-color:${color}" title="${esc(l.nom)} — ${esc(statut)}">${icon}</td>`;
      }).join('');

      // Autres décors : colonne texte unique avec les noms présents en chaîne
      const decorsAutresTxt = (decorsAutres || []).filter(l => {
        const el = (ep.lieux || []).find(x => x.lieu_id == l.id);
        return el?.statut === 'present' || el?.statut === 'pas encore existant';
      }).map(l => {
        const el = (ep.lieux || []).find(x => x.lieu_id == l.id);
        const icon = el?.statut === 'present' ? '' : '◎ ';
        return icon + esc(l.nom);
      }).join(', ');
      const decorsAutresCells = `<td class="episodes-other-decor-cell">${decorsAutresTxt || '—'}</td>`;

      const themes = (ep.themes || []).map(t =>
        `<span class="theme-chip" style="background:${t.couleur}">${esc(t.theme_nom)}</span>`
      ).join('');

      const jetBg = this.jetColor(ep.jet);
      const pagesStateClass = pct === 100 ? ((ep.nb_pages || 0) < 30 ? 'is-short' : 'is-ok') : '';

      const cellules = {
        index: `<td class="episodes-row-index">${idx + 1}</td>`,
        titre: `<td class="episodes-title-cell">${esc(ep.titre || '—')}</td>`,
        saison: `<td class="episodes-season-cell" style="--season-color:${sColor}">
            ${'S' + ep.saison_numero}
          </td>`,
        numero: `<td class="episodes-number-cell" style="--season-color-soft:${sColor}cc">
            ${ep.numero_episode}
          </td>`,
        date: `<td class="episodes-muted-cell">${fmtDate(ep.date_diege)}</td>`,
        jet: `<td class="${jetBg ? 'episodes-jet-cell-active' : ''}" style="${jetBg ? `--jet-bg:${jetBg}` : ''}">
            <span class="jet-badge ${ep.jet === 'Terminé' ? 'final' : ''} ${jetBg ? 'episodes-jet-badge-flat' : ''}">${esc(ep.jet || '—')}</span>
          </td>`,
        avancement: `<td>
            <div class="progress-cell">
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width:${pct}%;background-color:${progressColor(pct)}"></div>
              </div>
              <span class="progress-pct">${pct}%</span>
            </div>
          </td>`,
        pages: `<td class="episodes-pages-cell ${pagesStateClass}">
            <span class="nb-pages-display">
              <span class="nb-pages-val">${ep.nb_pages || '—'}</span>
              ${ep.nb_pages ? `<span class="nb-pages-unit"></span>` : ''}
            </span>
          </td>`,
        mots: `<td class="episodes-stat-mini-cell" title="${ep.nb_mots ? ep.nb_mots + ' mots' : 'Pas encore analysé'}">${ep.nb_mots || '—'}</td>`,
        scenes: `<td class="episodes-stat-mini-cell" title="${ep.nb_scenes ? ep.nb_scenes + ' scènes' : 'Pas encore analysé'}">${ep.nb_scenes || '—'}</td>`,
        etat: `<td onclick="event.stopPropagation()" class="episodes-state-cell">
            ${(() => {
              const bg = etatColor(ep.etat_episode);
              const tc = etatTextColor(bg);
              return `<select
                class="episodes-state-select"
                style="--state-bg:${bg};--state-color:${tc}"
                title="${esc(ep.etat_episode || 'État…')}"
                onchange="Episodes.setEtat(${ep.id}, this.value, this)">
                <option value="">—</option>
                ${ETAT_OPTIONS.map(o => `<option value="${o}" ${ep.etat_episode === o ? 'selected' : ''}>${o}</option>`).join('')}
              </select>`;
            })()}
          </td>`,
        debut: `<td class="episodes-date-cell">${renderDateWithQual(ep.date_debut_qual, ep.date_debut_ecriture)}</td>`,
        fin: `<td class="episodes-date-cell">${renderDateWithQual(ep.date_fin_qual, ep.date_fin_ecriture)}</td>`,
        autresPersos: `<td class="episodes-other-people-cell" title="${esc(autresPersosTxt)}">${autresPersosBrev || '—'}</td>`,
        themes: `<td><div class="themes-chips" >${themes}</div></td>`,
        actions: `<td onclick="event.stopPropagation()">
            <button class="btn btn-ghost btn-sm btn-icon" onclick="Episodes.openEdit(${ep.id})" title="Modifier">✎</button>
            <button class="btn btn-ghost btn-sm btn-icon episodes-action-delete" onclick="Episodes.confirmDelete(${ep.id})" title="Supprimer">✕</button>
          </td>`,
        duree: (() => {
            const mpm = Settings.motsParMinute;
            const duree = ep.nb_mots ? Math.max(1, Math.round(ep.nb_mots / mpm)) : null;
            const durationColor = duree <= 10 ? '#b99fd1' : duree <= 15 ? '#9fd1b1' : duree < 20 ? '#D18888' : 'var(--text2)';
            return `<td>${duree ? `<span class="episodes-duration-badge" style="--duration-color:${durationColor}">${duree}'</span>` : '—'}</td>`;
          })(),
        principaux: presenceCells, recurrents: recurrentCells, decors: decorsPrincipauxCells, autresDecors: decorsAutresCells,
      };
      this.lettresIntrigues().forEach(l => {
        const texte = l <= 'C' ? ep[`intrigue_${l.toLowerCase()}`] : (ep.intrigues_sup || {})[l];
        cellules[`intrigue_${l}`] = `<td class="episodes-intrigue-cell">${esc(texte || '—')}</td>`;
      });

      return `
        <tr class="clickable" onclick="Episodes.openDetail(${ep.id})">
          ${this.colonnesVisibles().map(c => this._marquer(c.k, cellules[c.k])).join('')}
        </tr>
      `;
    }).join('');
  },

  // Couleur de fond selon le jet
  jetColor(jet) {
    const map = {
      '1er jet':  '#65aac3',
      '2ème jet': '#dae4c0',
      '3ème jet': '#bccbe2',
      '4ème jet': '#618bcf',
      '5ème jet': '#c3bd9b',
      '6ème jet': '#f8d786',
      'Terminé':  '#fceca6',
    };
    return map[jet] || null;
  },

  jetTextColor(jet) {
    // Couleur de texte foncée pour les fonds clairs
    return '#111';
  },

  setFilter(val) {
    this.currentFilter = val;
    this.render();
  },

  async openDetail(id) {
    const ep = await api.get(`episodes/${id}`);
    const saison = this.saisons.find(s => s.id == ep.saison_id);
    const sColor = saison?.couleur || '#888';
    const stats = ep.stats;
    let sj = null;
    if (stats && stats.stats_json) {
      try { sj = JSON.parse(stats.stats_json); } catch(e) { sj = null; }
    }

    // Navigation: find prev/next in current filtered list
    let filteredEps = this.data;
    if (this.currentFilter !== 'all') {
      filteredEps = filteredEps.filter(e => e.saison_id == this.currentFilter);
    }
    const idx = filteredEps.findIndex(e => e.id == id);
    const prevId = idx > 0 ? filteredEps[idx - 1].id : null;
    const nextId = idx < filteredEps.length - 1 ? filteredEps[idx + 1].id : null;
    const navHtml = `
      <div style="display:flex;gap:6px;margin-left:auto">
        <button class="btn btn-ghost btn-sm btn-sm1" onclick="modal.close();Episodes.openDetail(${prevId})" ${!prevId ? 'disabled style="opacity:0.3"' : ''} title="Épisode précédent (←)">◀</button>
        <button class="btn btn-ghost btn-sm btn-sm1" onclick="modal.close();Episodes.openDetail(${nextId})" ${!nextId ? 'disabled style="opacity:0.3"' : ''} title="Épisode suivant (→)">▶</button>
      </div>
    `;
    modal.setNav(
      prevId ? () => { modal.close(); Episodes.openDetail(prevId); } : null,
      nextId ? () => { modal.close(); Episodes.openDetail(nextId); } : null
    );

    let statsHtml = '';
    if (stats && sj) {
      const repliquesParPerso = sj.repliques_par_perso || {};
      const maxR = Math.max(...Object.values(repliquesParPerso).map(x => x.nb_repliques), 1);
      statsHtml = `
        <div class="detail-card">
          <div class="detail-card-header">
            📊 Statistiques du texte
            <span style="color:var(--text3);font-size:10px">Analysé le ${new Date(stats.analysed_at).toLocaleDateString('fr-FR')}</span>
          </div>
          <div class="detail-card-body">
            <div class="episode-text-stats-row">
              <div class="episode-text-stat">
                <div>${stats.nb_scenes || sj.nb_scenes || (sj.scenes || []).length || '—'}</div>
                <span>scènes</span>
              </div>
              <div class="episode-text-stat">
                <div style="font-family:Futura Std;font-size:28px;font-weight:800;color:#7daeb3">${stats.nb_repliques_total}</div>
                <span>répliques</span>
              </div>
              <div class="episode-text-stat">
                <div style="font-family:Futura Std;font-size:28px;font-weight:800;color:#7daeb3">${stats.nb_mots}</div>
                <span>mots</span>
              </div>
              <div class="episode-text-stat">
                <div style="font-family:Futura Std;font-size:28px;font-weight:800;color:#7daeb3">${stats.nb_mots ? Math.max(1, Math.round(stats.nb_mots / Settings.motsParMinute)) : stats.duree_estimee_min}'</div>
                <span>durée est.</span>
              </div>
            </div>
            <div class="repliques-bars">
              ${Object.entries(repliquesParPerso).slice(0, 10).map(([nom, data]) => `
                <div class="replique-row">
                  <span class="replique-name" title="${esc(nom)}">${esc(nom)}</span>
                  <div class="replique-bar-bg">
                    <div class="replique-bar-fill" style="width:${(data.nb_repliques/maxR*100)}%;background:${data.type === 'principal' ? 'var(--accent)' : 'var(--accent4)'}"></div>
                  </div>
                  <span class="replique-count">${data.nb_repliques}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }

    const timelineHtml = this.renderEpisodePresenceTimeline(ep, sj);
    const topMotsHtml = this.renderEpisodeTopMots(ep);
    const etatBg = etatColor(ep.etat_episode);
    const etatTc = etatTextColor(etatBg);

    const lieux_presents = (ep.lieux || []).filter(l => l.statut === 'present');
    const lieux_pas_encore = (ep.lieux || []).filter(l => l.statut === 'pas encore existant');

    modal.open(`
      <div style="border-left:4px solid ${sColor};padding-left:16px;margin-bottom:24px;display:flex;align-items:flex-start;gap:12px">
        <div style="flex:1">
          <div style="font-size:11px;color:var(--text3);font-family:var(--font-display);text-transform:uppercase;letter-spacing:0.1em">
            S${ep.saison_numero}E${String(ep.numero_episode).padStart(2,'0')} — ${esc(saison?.nom || '')}
          </div>
          <div class="modal-title" style="margin-bottom:4px;border:none;padding:0">${esc(ep.titre || 'Sans titre')}</div>
          <div style="font-size:12px;color:var(--text3)">${fmtDate(ep.date_diege)} ${ep.code ? '· ' + esc(ep.code) : ''}</div>
        </div>
        ${navHtml}
      </div>

      <div class="episode-detail">
        <div class="episode-detail-main">
          ${ep.intrigue_a ? `
          <div class="detail-card">
            <div class="detail-card-header">Intrigues</div>
            <div class="detail-card-body">
              ${ep.intrigue_a ? `<div class="stat-row"><span class="stat-label">Intrigue A</span><span>${esc(ep.intrigue_a)}</span></div>` : ''}
              ${ep.intrigue_b ? `<div class="stat-row"><span class="stat-label">Intrigue B</span><span>${esc(ep.intrigue_b)}</span></div>` : ''}
              ${ep.intrigue_c ? `<div class="stat-row"><span class="stat-label">Intrigue C</span><span>${esc(ep.intrigue_c)}</span></div>` : ''}
              ${Object.entries(ep.intrigues_sup || {}).map(([l, t]) => `<div class="stat-row"><span class="stat-label">Intrigue ${esc(l)}</span><span>${esc(t)}</span></div>`).join('')}
              ${ep.resume ? `<div class="stat-row" style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px"><span class="stat-label">Résumé</span><span style="font-size:12px;color:var(--text2);line-height:1.5">${esc(ep.resume)}</span></div>` : ''}
            </div>
          </div>` : ''}

          ${statsHtml}

          ${timelineHtml}

          <div class="detail-card">
            <div class="detail-card-header">
              📁 Uploader le texte de l'épisode
              <span style="font-size:10px;color:var(--text3)">.txt recommandé</span>
            </div>
            <div class="detail-card-body">
              <div class="upload-zone" id="upload-zone-${ep.id}"
                onclick="document.getElementById('file-input-${ep.id}').click()"
                ondragover="event.preventDefault();this.classList.add('dragover')"
                ondragleave="this.classList.remove('dragover')"
                ondrop="Episodes.handleDrop(event, ${ep.id})">
                <div class="upload-icon">📄</div>
                <div class="upload-text">Glisser-déposer ou cliquer pour choisir</div>
                <div class="upload-hint">.txt, .fountain — le texte sera analysé automatiquement</div>
              </div>
              <input type="file" id="file-input-${ep.id}" accept=".txt,.fountain" style="display:none"
                onchange="Episodes.handleFileUpload(event, ${ep.id})">
              <div style="margin-top:12px">
                <textarea id="texte-direct-${ep.id}" class="episode-direct-textarea" placeholder="Ou coller le texte directement ici…">${esc(ep.texte_episode || '')}</textarea>
                <button class="btn btn-secondary btn-sm episode-analyse-button" onclick="Episodes.analyseTexte(${ep.id})">Analyser le texte</button>
              </div>
            </div>
          </div>

          ${topMotsHtml}
        </div>

        <div class="episode-detail-sidebar">
          <div class="detail-card">
            <div class="detail-card-header">Infos</div>
            <div class="detail-card-body">
              <div class="stat-row"><span class="stat-label">Jet</span><span class="jet-badge ${ep.jet === 'Final' ? 'final' : ''}">${esc(ep.jet)}</span></div>
              <div class="stat-row">
                <span class="stat-label">Avan.</span>
                <div class="progress-cell">
                  <div class="progress-bar-bg" style="width:80px">
                  <div class="progress-bar-fill" style="width:${ep.avancement}%;background-color:${progressColor(ep.avancement)}"></div>
                  </div>
                  <span class="progress-pct stat-value accent">${ep.avancement}%</span>
                </div>
              </div>
              ${ep.etat_episode ? `
                <div class="stat-row">
                  <span class="stat-label">État</span>
                  <span class="episode-state-badge" style="--episode-state-bg:${etatBg};--episode-state-color:${etatTc}">
                    ${esc(ep.etat_episode)}
                  </span>
                </div>
              ` : ''}
              <div class="stat-row"><span class="stat-label">Pages</span><span class="stat-value">${ep.nb_pages || '—'}</span></div>
              ${ep.titre_fr ? `<div class="stat-row"><span class="stat-label">Trad. FR</span><span style="font-size:11px;color:var(--text2)">${esc(ep.titre_fr)}</span></div>` : ''}
              ${ep.faux_site_web ? `<div class="stat-row"><span class="stat-label">Faux site</span><span style="font-size:11px;color:var(--text3)">${esc(ep.faux_site_web)}</span></div>` : ''}
              ${ep.source ? `<div class="stat-row"><span class="stat-label">Source</span><span style="font-size:11px;color:var(--text3)">${esc(ep.source)}</span></div>` : ''}
              ${ep.date_debut_ecriture ? `<div class="stat-row"><span class="stat-label">Déb. réd.</span><span style="font-family:'Space Mono',monospace;font-size:11px;color:var(--accent)">${renderDateWithQual(ep.date_debut_qual, ep.date_debut_ecriture)}</span></div>` : ''}
              ${ep.date_fin_ecriture ? `<div class="stat-row"><span class="stat-label">Fin réd.</span><span style="font-family:'Space Mono',monospace;font-size:11px;color:var(--accent)">${renderDateWithQual(ep.date_fin_qual, ep.date_fin_ecriture)}</span></div>` : ''}
              ${ep.commentaires ? `<div style="margin-top:8px;padding:10px;background:var(--bg);border-radius:4px;font-size:12px;color:var(--text2)">${esc(ep.commentaires)}</div>` : ''}
            </div>
          </div>

          <div class="detail-card">
            <div class="detail-card-header">Personnages</div>
            <div class="detail-card-body">
              ${(() => {
                const totalRepl = stats?.nb_repliques_total || 0;
                const dureeEp   = stats?.nb_mots ? Math.max(1, Math.round(stats.nb_mots / Settings.motsParMinute)) : (stats?.duree_estimee_min || 0);
                const fmtDuree  = (min) => {
                  if (!min || min < 1) return '';
                  if (min >= 60) return Math.floor(min/60) + 'h' + String(min % 60).padStart(2,'0');
                  return min + ' min';
                };
                const renderPerson = (p) => {
                  let replHtml = '';
                  if (p.nb_repliques) {
                    const dureePerso = (totalRepl > 0 && dureeEp > 0)
                      ? Math.round(dureeEp * p.nb_repliques / totalRepl)
                      : 0;
                    const dureeStr = fmtDuree(dureePerso);
                    replHtml = `<span style="margin-left:auto;font-size:11px;color:var(--text3)">
                      ${p.nb_repliques} répl.${dureeStr ? ` <span style="color:var(--accent3);opacity:0.8">(${dureeStr})</span>` : ''}
                    </span>`;
                  }
                  return `
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                    <div style="width:28px;height:28px;border-radius:50%;background:${p.couleur_identite};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#000;opacity:${p.present ? 1 : 0.2}">
                      ${esc(p.prenom[0])}
                    </div>
                    <span style="opacity:${p.present ? 1 : 0.4}">${esc(p.prenom)}</span>
                    ${replHtml}
                  </div>`;
                };
                const présents = (ep.personnages || []).filter(p => p.present == 1);
                const groups = [
                  { label: 'Principaux', rows: présents.filter(p => p.est_principal == 2) },
                  { label: 'Récurrents', rows: présents.filter(p => p.est_principal == 1) },
                  { label: 'Autres', rows: présents.filter(p => p.est_principal != 1 && p.est_principal != 2) },
                ].filter(g => g.rows.length);
                return groups.length ? groups.map((group, index) => `
                  ${index > 0 ? '<hr class="episode-person-group-divider">' : ''}
                  <div class="episode-person-group-label">${group.label}</div>
                  ${group.rows.map(renderPerson).join('')}
                `).join('') : '<div style="font-size:12px;color:var(--text3)">Aucun personnage présent.</div>';
              })()}
              ${(ep.extras || []).length ? `
                <hr class="divider">
                ${ep.extras.map(x => {
                  const totalRepl = stats?.nb_repliques_total || 0;
                  const dureeEp   = stats?.nb_mots ? Math.max(1, Math.round(stats.nb_mots / Settings.motsParMinute)) : (stats?.duree_estimee_min || 0);
                  const dureePerso = (x.nb_repliques && totalRepl > 0 && dureeEp > 0)
                    ? Math.round(dureeEp * x.nb_repliques / totalRepl) : 0;
                  const dureeStr = dureePerso >= 1
                    ? (dureePerso >= 60 ? Math.floor(dureePerso/60)+'h'+String(dureePerso%60).padStart(2,'0') : dureePerso+' min') : '';
                  return `<div style="font-size:12px;color:var(--text2);padding:4px 0">
                    ${esc(x.nom)}${x.nb_repliques ? ` — ${x.nb_repliques} répl.${dureeStr ? ` <span style="color:var(--accent3);font-size:10px">(${dureeStr})</span>` : ''}` : ''}
                  </div>`;
                }).join('')}
              ` : ''}
            </div>
          </div>

          ${lieux_presents.length ? `
          <div class="detail-card">
            <div class="detail-card-header">Lieux</div>
            <div class="detail-card-body">
              ${lieux_presents.map(l => `
                <span style="display:inline-flex;align-items:center;gap:4px;margin:3px;padding:3px 8px;background:var(--bg3);border-radius:3px;font-size:11px">
                  <span style="color:var(--accent3)">●</span> ${esc(l.lieu_nom)}
                </span>
              `).join('')}
              ${lieux_pas_encore.map(l => `
                <span style="display:inline-flex;align-items:center;gap:4px;margin:3px;padding:3px 8px;background:var(--bg3);border-radius:3px;font-size:11px;opacity:0.6">
                  <span style="color:var(--accent4)">◎</span> ${esc(l.lieu_nom)}
                </span>
              `).join('')}
              ${(ep.lieux_autres || []).map(l => `
                <div style="font-size:12px;color:var(--text3);margin-top:4px">+ ${esc(l.description)}</div>
              `).join('')}
            </div>
          </div>` : ''}

          ${(ep.themes || []).length ? `
          <div class="detail-card">
            <div class="detail-card-header">Thèmes</div>
            <div class="detail-card-body">
              ${ep.themes.map(t => `
                <span class="theme-chip" style="background:${t.couleur};display:inline-block;margin:3px;font-size:11px;padding:3px 8px">
                  ${esc(t.theme_nom)}
                  <span style="opacity:0.6;font-size:9px;margin-left:4px">${esc(t.intensite)}</span>
                </span>
              `).join('')}
            </div>
          </div>` : ''}

          ${(() => {
            const MOMENTS_LABELS = {
              matin: '🌅 Matin', midi: '☀️ Midi', 'apres-midi': '🌤 Après-midi',
              soiree: '🌆 Soirée', nuit: '🌙 Nuit', inconnu: '? Inconnu',
            };
            const plages = this._episodePlages(ep);
            const hasChronInfo = ep.date_diege || (ep.moment_journee && ep.moment_journee !== 'inconnu')
              || parseInt(ep.est_flashback) === 1 || ep.arc_nom || plages.length;
            if (!hasChronInfo) return '';

            const isFlash = parseInt(ep.est_flashback) === 1 || plages.some(pl => parseInt(pl.est_flashback || 0) === 1);
            const momentLabel = MOMENTS_LABELS[ep.moment_journee] || '';
            const roleLabel = { principal: 'Principal', secondaire: 'Secondaire', non_applicable: 'N/A' };
            const roleStyle = {
              principal: 'background:var(--accent);color:#000;border-color:var(--accent)',
              secondaire: 'background:var(--bg4);color:var(--text2);border-color:var(--border2)',
              non_applicable: 'background:transparent;color:var(--text3);border-color:var(--border)',
            };

            // Arc narratif
            let arcHtml = '';
            if (ep.arc_nom) {
              const arcPartie = ep.arc_partie && ep.arc_total
                ? `<span style="font-size:12px;color:var(--accent);font-family:var(--font-display);font-weight:700;margin-left:8px">Partie ${ep.arc_partie}/${ep.arc_total}</span>`
                : ep.arc_partie
                  ? `<span style="font-size:12px;color:var(--accent);font-family:var(--font-display);font-weight:700;margin-left:8px">Partie ${ep.arc_partie}</span>`
                  : '';
              arcHtml = `
                <div class="stat-row" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
                  <span class="stat-label">Arc</span>
                  <span style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
                    <span style="font-size:13px">📖</span>
                    <span style="font-weight:700;font-size:13px">${esc(ep.arc_nom)}</span>
                    ${arcPartie}
                  </span>
                </div>`;
            }

            // Flash liens
            let liensHtml = '';
            if (isFlash && (ep.liens || []).length) {
              const TYPE_ICONS = { flashback: '⏮', flashforward: '⏭', reference: '🔗' };
              liensHtml = `
                <div style="margin-top:8px">
                  <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text3);font-family:var(--font-display);margin-bottom:6px">Épisodes liés</div>
                  ${ep.liens.map(l => `
                    <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border)">
                      <span style="font-size:13px">${TYPE_ICONS[l.type_lien] || '🔗'}</span>
                      <span style="font-size:11px;color:var(--accent);font-family:var(--font-display)">S${l.ep_saison}E${String(l.ep_num).padStart(2,'0')}</span>
                      ${l.ep_titre ? `<span style="font-size:11px;color:var(--text2)">${esc(l.ep_titre)}</span>` : ''}
                    </div>
                  `).join('')}
                </div>`;
            }

            const plagesHtml = plages.length ? `
              <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
                <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text3);font-family:var(--font-display);margin-bottom:6px">Toutes les plages</div>
                ${plages.map(pl => {
                  const importance = pl.importance || 'principal';
                  const moment = MOMENTS_LABELS[pl.moment || 'inconnu'] || MOMENTS_LABELS.inconnu;
                  return `
                    <div style="display:flex;align-items:center;gap:7px;padding:5px 0;border-bottom:1px solid var(--border);font-size:11px">
                      <span style="font-family:var(--font-display);color:${pl.date === ep.date_diege ? 'var(--accent)' : 'var(--text3)'};min-width:72px">${pl.date ? fmtDate(pl.date) : 'Sans date'}</span>
                      <span style="min-width:92px;color:var(--text2)">${moment}</span>
                      <span style="font-family:var(--font-mono);font-size:9px;padding:1px 6px;border-radius:999px;border:1px solid;${roleStyle[importance] || roleStyle.principal}">${roleLabel[importance] || 'Principal'}</span>
                      ${parseInt(pl.est_flashback || 0) === 1 ? `<span style="font-size:9px;background:#fff;color:#000;padding:1px 5px;border-radius:999px;font-weight:700">FB</span>` : ''}
                    </div>
                  `;
                }).join('')}
              </div>
            ` : '';

            return `
            <div class="detail-card">
              <div class="detail-card-header">⏱ Chronologie</div>
              <div class="detail-card-body">
                ${ep.date_diege ? `
                  <div class="stat-row">
                    <span class="stat-label">Date affichée</span>
                    <span style="font-family:var(--font-display);font-size:12px;color:var(--accent)">${fmtDate(ep.date_diege)}</span>
                  </div>` : ''}
                ${momentLabel && ep.moment_journee !== 'inconnu' ? `
                  <div class="stat-row">
                    <span class="stat-label">Moment</span>
                    <span style="font-size:12px">${momentLabel}</span>
                  </div>` : ''}
                ${isFlash ? `
                  <div class="stat-row">
                    <span class="stat-label">Type</span>
                    <span style="display:inline-flex;align-items:center;gap:6px">
                      <span style="font-size:11px;background:rgba(255,255,255,0.12);padding:2px 8px;border-radius:10px;font-weight:700;letter-spacing:0.05em">${ep.flash_type === 'flashforward' ? '⏭ FLASHFORWARD' : '⏮ FLASHBACK'}</span>
                      ${ep.date_flashback_origine ? `<span style="font-size:11px;color:var(--text3);font-family:var(--font-display)">↩ ${fmtDate(ep.date_flashback_origine)}</span>` : ''}
                    </span>
                  </div>
                  ${liensHtml}` : ''}
                ${plagesHtml}
                ${arcHtml}
              </div>
            </div>`;
          })()}

          <div style="display:flex;gap:8px;margin-top:16px">
            <button class="btn btn-secondary" style="flex:1" onclick="modal.close();Episodes.openEdit(${ep.id})">✎ Modifier</button>
            <button class="btn btn-danger" onclick="modal.close();Episodes.confirmDelete(${ep.id})">Supprimer</button>
          </div>
        </div>
      </div>
    `);
    if (timelineHtml) requestAnimationFrame(() => this.renderEpisodePresenceTimelineChart(ep.id));
  },

  _normalizeWord(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’]/g, "'")
      .trim();
  },

  _buildEpisodeTopWordsData(ep) {
    const texteBrut = ep.texte_episode || '';
    if (!texteBrut.trim()) return null;

    const stopwords = new Set([
      'le','la','les','un','une','des','du','de','d','l','a','au','aux','en','et','ou',
      'mais','donc','or','ni','car','que','qui','quoi','dont','se','si','je','tu','il','elle',
      'nous','vous','ils','elles','me','te','lui','y','on','mon','ma','mes','ton','ta','tes',
      'son','sa','ses','notre','votre','leur','leurs','ce','cet','cette','ces','ca','c','j',
      'n','m','s','qu','ne','pas','plus','tres','bien','tout','tous','toute','toutes',
      'par','pour','sur','sous','dans','avec','sans','entre','vers','chez','apres','avant','contre',
      'meme','aussi','alors','encore','puis','deja','non','oui','ah','oh','eh','hm','bon','ben',
      'ici','ainsi','peu','trop','moins','comme','quand','comment','pourquoi','parce',
      'voila','va','allons','allez','moi','toi','soi','eux','maintenant','jamais','toujours',
      'souvent','parfois','quelque','quelques','plusieurs','chaque','quel','quelle',
      'tant','autant','assez','environ','bah','euh','hein',
      'pause','string','uuid','window','name','type','gender','revision',
      'int','ext','jour','nuit','you','the','and','for','this','that','with',
    ]);

    const stopwordsVerbes = new Set([
      'etre','avoir','est','sont','etait','etaient','sera','serait','serais','serons','seront',
      'ai','as','avons','avez','ont','avait','avaient','aura','aurait','aurais','aurons','auront',
      'eu','eue','ete','fait','fais','faire','dit','dis','dire','vois','voit','voyons','voyez',
      'voient','voir','veux','veut','vouloir','voulais','voulait','voulez','voulons','veulent',
      'suis','sais','sait','savoir','savais','savait','peux','peut','pouvoir','pouvais','pouvait',
      'pouvez','peuvent','dois','doit','devoir','devais','devait','devez','doivent','vais','vas',
      'vont','allais','allait','faut','falloir','crois','croit','croire','croyais','croyait',
      'viens','vient','venir','venais','venait','suit','suivre','avais','aurai','aurez',
      'etais','etiez','etions','faisais','faisait','faisiez','faisions','disais','disait',
      'disiez','disions',
    ]);

    const nomsPersoExclus = new Set();
    (this.personnages || []).forEach(p => {
      [p.prenom, p.nom, p.nom_affichage].forEach(value => {
        this._normalizeWord(value)
          .replace(/[^a-z0-9]+/g, ' ')
          .split(/\s+/)
          .filter(token => token.length >= 3)
          .forEach(token => nomsPersoExclus.add(token));
      });
    });

    const formesMajuscules = new Set();
    texteBrut.split('\n').forEach(ligne => {
      ligne.trim().split(/[\s\-]+/).forEach(tok => {
        const clean = tok.replace(/[^A-ZÀ-ÿa-z]/g, '');
        if (clean.length >= 3 && clean === clean.toUpperCase()) {
          formesMajuscules.add(this._normalizeWord(clean).replace(/[^a-z0-9]+/g, ''));
        }
      });
    });

    const freq = new Map();
    const texte = this._normalizeWord(texteBrut)
      .replace(/[^a-z\s\-']/g, ' ');
    texte.split(/[\s\-']+/).forEach(raw => {
      const mot = raw.replace(/[^a-z0-9]+/g, '').trim();
      if (mot.length < 3) return;
      if (stopwords.has(mot)) return;
      if (nomsPersoExclus.has(mot)) return;
      if (formesMajuscules.has(mot)) return;
      freq.set(mot, (freq.get(mot) || 0) + 1);
    });

    const sorted = [...freq.entries()]
      .map(([mot, nb]) => ({ mot, nb }))
      .sort((a, b) => b.nb - a.nb || a.mot.localeCompare(b.mot));

    const allMotsAvecVerbes = sorted;
    const allMots = sorted.filter(row => !stopwordsVerbes.has(row.mot));

    return {
      top_mots: allMots.slice(0, 300),
      top_mots_avec_verbes: allMotsAvecVerbes.slice(0, 300),
      all_mots: allMots,
      all_mots_avec_verbes: allMotsAvecVerbes,
    };
  },

  renderEpisodeTopMots(ep) {
    const data = this._buildEpisodeTopWordsData(ep);
    if (!data || !(data.top_mots || []).length) return '';
    window._episodeTopMotsData = window._episodeTopMotsData || {};
    window._episodeTopMotsData[ep.id] = data;
    if (this._episodeTopMotsAvecVerbes[ep.id] === undefined) this._episodeTopMotsAvecVerbes[ep.id] = false;
    return this._buildEpisodeTopMots(ep.id);
  },

  _buildEpisodeTopMots(epId) {
    const data = window._episodeTopMotsData?.[epId];
    if (!data) return '';
    const avecVerbes = !!this._episodeTopMotsAvecVerbes[epId];
    const mots = (avecVerbes ? data.top_mots_avec_verbes : data.top_mots) || [];
    if (!mots.length) return '';

    const max = mots[0]?.nb || 1;
    const palette = [
      'var(--accent,#00bcd4)', 'var(--accent4,#f39c12)', 'var(--accent3,#2ecc71)',
      'var(--accent2,#e74c3c)', '#9b59b6', '#1abc9c', '#e67e22', '#3498db',
    ];

    const nuage = mots.map((m, i) => {
      const pct = m.nb / max;
      const fs = Math.round(11 + pct * 17);
      const col = palette[i % palette.length];
      const op = (0.55 + pct * 0.45).toFixed(2);
      return `<span style="font-size:${fs}px;color:${col};opacity:${op};
          font-weight:${fs > 20 ? 800 : fs > 15 ? 600 : 400};
          font-family:${fs > 18 ? 'var(--font-display)' : 'inherit'};
          line-height:1.6;cursor:default;white-space:nowrap"
          title="${m.nb} occurrence${m.nb > 1 ? 's' : ''}">${m.mot}</span>`;
    }).join(' ');

    const top50 = mots.slice(0, 50).map((m, i) => {
      const barPct = Math.round((m.nb / max) * 100);
      const col = palette[i % palette.length];
      return `
        <div class="js-style-86058287">
          <span class="js-style-62b34d58">${m.mot}</span>
          <div class="js-style-e178b9d7">
            <div style="height:100%;width:${barPct}%;background:${col};border-radius:3px"></div>
          </div>
          <span class="js-style-aa0c02af">${m.nb}×</span>
        </div>`;
    }).join('');

    const toggleBg = avecVerbes ? 'var(--accent,#00bcd4)' : 'var(--border2,#333)';
    const togglePos = avecVerbes ? '18px' : '2px';

    return `
      <div class="detail-card episode-top-mots-card" id="episode-section-top-mots-${epId}">
        <div class="detail-card-header result-title js-style-500a61ef">
          Mots les plus utilisés
          <label class="js-style-36ee0810">
            <span style="color:${avecVerbes ? 'var(--accent)' : 'var(--text3)'}">Inclure les verbes conjugués</span>
            <div onclick="Episodes._toggleEpisodeVerbes(${epId})" style="position:relative;width:36px;height:20px;
                background:${toggleBg};border-radius:10px;cursor:pointer;
                transition:background 0.2s;flex-shrink:0">
              <div style="position:absolute;top:2px;left:${togglePos};width:16px;height:16px;
                  background:#fff;border-radius:50%;transition:left 0.2s"></div>
            </div>
          </label>
        </div>
        <div class="detail-card-body">
          <div class="js-style-318f26a6">
            <input class="js-style-d1505096" id="episode-mot-search-${epId}" type="text" placeholder="Rechercher un mot…"
              oninput="Episodes._searchEpisodeMot(${epId}, this.value)"
              onfocus="this.style.borderColor='var(--accent)'"
              onblur="this.style.borderColor='var(--border)'" />
            <span class="js-style-5bb33be7">⌕</span>
            <div class="js-style-dd2d424c" id="episode-mot-search-result-${epId}"></div>
          </div>

          <div class="js-style-599a3328">
            <div class="js-style-26ba4e54">${nuage}</div>
            <div>
              <div class="js-style-73032b8d">Top 50</div>
              ${top50}
            </div>
          </div>
          <div class="js-style-823d9abe">
            Stopwords français exclus · mots &lt; 3 caractères exclus · noms propres exclus
            ${avecVerbes ? '· <span class="js-style-6ddb9c03">verbes conjugués inclus</span>' : ''}
          </div>
        </div>
      </div>`;
  },

  _toggleEpisodeVerbes(epId) {
    this._episodeTopMotsAvecVerbes[epId] = !this._episodeTopMotsAvecVerbes[epId];
    const section = document.getElementById(`episode-section-top-mots-${epId}`);
    if (section) section.outerHTML = this._buildEpisodeTopMots(epId);
  },

  _searchEpisodeMot(epId, val) {
    const result = document.getElementById(`episode-mot-search-result-${epId}`);
    if (!result) return;
    const query = this._normalizeWord(val).replace(/[^a-z0-9]+/g, '');
    if (!query) { result.innerHTML = ''; return; }

    const data = window._episodeTopMotsData?.[epId];
    const liste = (this._episodeTopMotsAvecVerbes[epId] ? data?.all_mots_avec_verbes : data?.all_mots) || [];
    const normalize = s => this._normalizeWord(s).replace(/[^a-z0-9]+/g, '');
    const exact = liste.find(m => normalize(m.mot) === query);
    const partial = exact ? [] : liste.filter(m => normalize(m.mot).includes(query)).slice(0, 5);

    if (exact) {
      result.innerHTML = `<span class="js-style-9b131539">${exact.mot}</span>
        <span class="js-style-50197c32"> — </span>
        <span class="js-style-831546a2">${exact.nb}</span>
        <span class="js-style-50197c32"> occurrence${exact.nb > 1 ? 's' : ''}</span>`;
    } else if (partial.length) {
      result.innerHTML = partial.map(m =>
        `<span class="js-style-7d2976f1">
          <span class="js-style-d772fd65">${m.mot}</span>
          <span class="js-style-1d0ec61f">${m.nb}×</span>
        </span>`
      ).join('') + `<span class="js-style-1d0ec61f"> (suggestions)</span>`;
    } else {
      result.innerHTML = `<span class="js-style-50197c32">Mot non trouvé dans cet épisode</span>`;
    }
  },

  renderEpisodePresenceTimeline(ep, statsJson) {
    const scenes = (statsJson?.scenes || []).filter(sc => sc && Array.isArray(sc.persos) && sc.persos.length);
    if (!scenes.length) return '';
    this._detailTimelineData = this._detailTimelineData || {};
    this._detailTimelineData[ep.id] = {
      scenes,
      personnages: this.personnages,
    };

    return `
      <div class="detail-card episode-presence-timeline-card">
        <div class="detail-card-header">
          Timeline de présence par personnage
          <label class="episode-timeline-toggle">
            <input type="checkbox" id="episode-timeline-mots-${ep.id}" checked onchange="Episodes.renderEpisodePresenceTimelineChart(${ep.id})">
            Épaisseur proportionnelle aux mots
          </label>
        </div>
        <div class="detail-card-body">
          <div id="episode-presence-timeline-${ep.id}" class="episode-presence-timeline"></div>
        </div>
      </div>
    `;
  },

  _normalizeTimelineName(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  },

  _timelinePersonInfo(rawName, personnages) {
    const rawNorm = this._normalizeTimelineName(rawName);
    const found = (personnages || []).find(p => {
      const keys = [
        p.prenom,
        p.nom,
        p.nom_affichage,
        `${p.prenom || ''} ${p.nom || ''}`,
      ].map(v => this._normalizeTimelineName(v)).filter(Boolean);
      return keys.includes(rawNorm);
    });
    if (found) {
      return {
        key: String(found.id),
        label: found.prenom || found.nom || rawName,
        color: found.couleur_identite || 'var(--text3)',
      };
    }
    const label = String(rawName || 'Personnage')
      .toLowerCase()
      .replace(/\b\p{L}/gu, m => m.toUpperCase());
    return { key: rawNorm || label, label, color: 'var(--text3)' };
  },

  renderEpisodePresenceTimelineChart(epId) {
    const data = this._detailTimelineData?.[epId];
    const target = document.getElementById(`episode-presence-timeline-${epId}`);
    if (!data || !target) return;

    const scenes = data.scenes;
    const motsProp = document.getElementById(`episode-timeline-mots-${epId}`)?.checked ?? false;
    const personMap = new Map();
    const scenePresence = scenes.map(sc => {
      const keys = new Set();
      (sc.persos || []).forEach(raw => {
        const info = this._timelinePersonInfo(raw, data.personnages);
        if (!personMap.has(info.key)) personMap.set(info.key, { ...info, count: 0 });
        keys.add(info.key);
      });
      keys.forEach(key => personMap.get(key).count++);
      return keys;
    });

    const persons = [...personMap.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    if (!persons.length) {
      target.innerHTML = '<div class="episode-timeline-empty">Aucune présence détectée dans les scènes.</div>';
      return;
    }

    const totalMots = scenes.reduce((sum, sc) => sum + (parseInt(sc.mots || 0, 10) || 1), 0);
    const flexVal = sc => {
      if (!motsProp) return 1;
      const mots = parseInt(sc.mots || 0, 10) || 1;
      return Math.max(0.5, (mots / Math.max(totalMots, 1)) * 100);
    };
    const maxPersos = Math.max(...scenePresence.map(keys => keys.size), 1);

    const nums = `
      <div class="episode-timeline-scene-numbers">
        ${scenes.map((sc, index) => `
          <div style="flex:${flexVal(sc)}" title="${esc(sc.slugline || '')}">${index + 1}</div>
        `).join('')}
      </div>
    `;

    const rows = persons.map(person => `
      <div class="episode-timeline-row">
        <div class="episode-timeline-person">
          <span style="background:${person.color}"></span>
          <strong title="${esc(person.label)}">${esc(person.label)}</strong>
          <em>${Math.round(person.count / scenes.length * 100)}%</em>
        </div>
        <div class="episode-timeline-cells">
          ${scenes.map((sc, index) => {
            const present = scenePresence[index].has(person.key);
            return `
              <div
                style="flex:${flexVal(sc)};background:${person.color};opacity:${present ? 0.9 : 0.08}"
                title="Scène ${index + 1}${present ? ` — ${sc.repliques?.[person.label] || ''} rép. ${sc.mots || 0} mots` : ' — absent'}">
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `).join('');

    const density = `
      <div class="episode-timeline-density">
        ${scenes.map((sc, index) => {
          const alpha = (0.12 + (scenePresence[index].size / maxPersos) * 0.82).toFixed(2);
          return `<div style="flex:${flexVal(sc)};opacity:${alpha}" title="${scenePresence[index].size} personnage(s)"></div>`;
        }).join('')}
      </div>
      <div class="episode-timeline-density-label">densité de co-présence</div>
    `;

    target.innerHTML = nums + rows + density;
  },

  async handleDrop(event, epId) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('fichier', file);
    fd.append('episode_id', epId);
    toast('Upload en cours…', 'info');
    const res = await api.upload(fd);
    toast(`Analysé ! ${res.nb_repliques_total} répliques, ~${res.nb_mots ? Math.round(res.nb_mots / Settings.motsParMinute) : res.duree_estimee_min} min`, 'success');
    modal.close();
    this.openDetail(epId);
  },

  async handleFileUpload(event, epId) {
    const file = event.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('fichier', file);
    fd.append('episode_id', epId);
    toast('Upload en cours…', 'info');
    const res = await api.upload(fd);
    toast(`Analysé ! ${res.nb_repliques_total} répliques, ~${res.nb_mots ? Math.round(res.nb_mots / Settings.motsParMinute) : res.duree_estimee_min} min`, 'success');
    modal.close();
    this.openDetail(epId);
  },

  async analyseTexte(epId) {
    const texte = document.getElementById(`texte-direct-${epId}`).value.trim();
    if (!texte) return;
    const fd = new FormData();
    fd.append('texte', texte);
    fd.append('episode_id', epId);
    toast('Analyse en cours…', 'info');
    const res = await api.upload(fd);
    toast(`Analysé ! ${res.nb_repliques_total} répliques, ~${res.nb_mots ? Math.round(res.nb_mots / Settings.motsParMinute) : res.duree_estimee_min} min`, 'success');
    modal.close();
    this.openDetail(epId);
  },

  async openNewEpisode() {
    this.openEpisodeForm(null);
  },

  async openEdit(id) {
    const ep = await api.get(`episodes/${id}`);
    this.openEpisodeForm(ep);
  },

  openEpisodeForm(ep) {
    const isNew = !ep;
    // Principaux (est_principal == 2), récurrents (1), autres (0)
    const principaux = this.personnages.filter(p => p.est_principal == 2);
    const recurrents = this.personnages.filter(p => p.est_principal == 1);
    const autresP = this.personnages.filter(p => p.est_principal == 0);

    const renderPersonnageToggle = (p) => {
      const pp = (ep?.personnages || []).find(x => x.personnage_id == p.id);
      const present = pp?.present == 1;
      return `
        <div class="presence-toggle ${present ? 'is-present' : ''}" id="toggle-${p.id}"
          onclick="Episodes.togglePresence(${p.id},'${p.couleur_identite}')">
          <div class="toggle-dot" style="border-color:${p.couleur_identite};background:${present ? p.couleur_identite : 'transparent'};color:${present ? '#000' : p.couleur_identite}">
            ${esc(p.prenom[0])}
          </div>
          <span style="font-size:12px;color:${present ? 'var(--text)' : 'var(--text3)'}">${esc(p.prenom)}</span>
          <input type="hidden" name="perso_present_${p.id}" value="${present ? 1 : 0}">
        </div>
      `;
    };

    modal.open(`
      <div class="modal-title">${isNew ? '+ Nouvel épisode' : '✎ Modifier l\'épisode'}</div>
      <form id="episode-form" onsubmit="return false">
        <div class="form-grid">
          <div class="form-group">
            <label>Saison</label>
            <select name="saison_id" required>
              ${this.saisons.map(s => `<option value="${s.id}" ${ep?.saison_id == s.id ? 'selected' : ''}>${esc(s.nom || 'Saison ' + s.numero)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>N° épisode</label>
            <input type="number" name="numero_episode" value="${ep?.numero_episode || ''}" required min="1">
          </div>
          <div class="form-group full">
            <label>Titre</label>
            <input type="text" name="titre" value="${esc(ep?.titre || '')}">
          </div>
          <div class="form-group full">
            <label>Traduction française</label>
            <input type="text" name="titre_fr" value="${esc(ep?.titre_fr || '')}" placeholder="Traduction ou titre alternatif en français">
          </div>
          <div class="form-group">
            <label>Date affichée</label>
            <select name="date_diege" id="date-affichee-select" data-current="${ep?.date_diege || ''}">
              ${this._renderDateAfficheeOptions(ep)}
            </select>
            <div style="font-size:10px;color:var(--text3);margin-top:4px;line-height:1.35">
              Choisie parmi les plages marquées "Principal".
            </div>
          </div>
          <div class="form-group">
            <label>Code</label>
            <input type="text" name="code" value="${esc(ep?.code || '')}" placeholder="Sa1ep1">
          </div>
          <div class="form-group">
            <label>Jet</label>
            <select name="jet">
              ${['1er jet','2ème jet','3ème jet','4ème jet','5ème jet','6ème jet','Terminé'].map(j => `<option ${ep?.jet === j ? 'selected' : ''}>${j}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>État</label>
            <select name="etat_episode">
              <option value="">— Aucun état —</option>
              ${ETAT_OPTIONS.map(o => {
                const bg = etatColor(o);
                const tc = etatTextColor(bg);
                return `<option value="${o}" ${ep?.etat_episode === o ? 'selected' : ''} style="background:${bg};color:${tc}">${o}</option>`;
              }).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Avancement — <span id="adv-val">${ep?.avancement || 0}</span>%</label>
            <div style="display:flex;gap:10px;align-items:center">
              <input type="range" name="avancement" min="0" max="100" value="${ep?.avancement || 0}"
                oninput="document.getElementById('adv-val').textContent=this.value">
            </div>
          </div>
          <div class="form-group">
            <label>Nombre de pages</label>
            <input type="number" name="nb_pages" value="${ep?.nb_pages || 0}" min="0">
          </div>
          <div class="form-group full">
            <label>Intrigue A</label>
            <textarea name="intrigue_a">${esc(ep?.intrigue_a || '')}</textarea>
          </div>
          <div class="form-group full">
            <label>Intrigue B</label>
            <textarea name="intrigue_b">${esc(ep?.intrigue_b || '')}</textarea>
          </div>
          <div class="form-group full">
            <label>Intrigue C</label>
            <textarea name="intrigue_c">${esc(ep?.intrigue_c || '')}</textarea>
          </div>
          ${Interface.config.intrigues.map(l => `
            <div class="form-group full">
              <label>Intrigue ${l}</label>
              <textarea name="intrigue_sup_${l}">${esc((ep?.intrigues_sup || {})[l] || '')}</textarea>
            </div>
          `).join('')}
          <div class="form-group full">
            <label>Résumé</label>
            <textarea name="resume" placeholder="Résumé de l'épisode…" style="min-height:80px">${esc(ep?.resume || '')}</textarea>
          </div>
          <div class="form-group full">
            <label>Faux site web / référence</label>
            <input type="text" name="faux_site_web" value="${esc(ep?.faux_site_web || '')}">
          </div>
          <div class="form-group full">
            <label>Source</label>
            <input type="text" name="source" value="${esc(ep?.source || '')}" placeholder="Source, inspiration, référence externe…">
          </div>

          <!-- ── DATES D'ÉCRITURE 1ER JET ── -->
          <div class="form-group full">
            <fieldset style="border:1px solid var(--border2);border-radius:6px;padding:12px 16px;margin:0">
              <legend style="font-family:var(--font-display);font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:0 6px;color:var(--accent)">Dates d'écriture — 1er jet</legend>
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                <label style="min-width:40px;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.1em">Début</label>
                <select name="date_debut_qual" style="flex:1">
                  <option value="exacte" ${(ep?.date_debut_qual ?? 'exacte') === 'exacte' ? 'selected' : ''}>Date exacte</option>
                  <option value="avant"  ${ep?.date_debut_qual === 'avant' ? 'selected' : ''}>Avant cette date</option>
                  <option value="apres"  ${ep?.date_debut_qual === 'apres' ? 'selected' : ''}>Après cette date</option>
                </select>
                <input type="date" name="date_debut_ecriture" value="${ep?.date_debut_ecriture || ''}" style="flex:1">
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                <label style="min-width:40px;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.1em">Fin</label>
                <select name="date_fin_qual" style="flex:1">
                  <option value="exacte" ${(ep?.date_fin_qual ?? 'exacte') === 'exacte' ? 'selected' : ''}>Date exacte</option>
                  <option value="avant"  ${ep?.date_fin_qual === 'avant' ? 'selected' : ''}>Avant cette date</option>
                  <option value="apres"  ${ep?.date_fin_qual === 'apres' ? 'selected' : ''}>Après cette date</option>
                </select>
                <input type="date" name="date_fin_ecriture" value="${ep?.date_fin_ecriture || ''}" style="flex:1">
              </div>
            </fieldset>
          </div>
          <div class="form-group full">
            <label>Commentaires</label>
            <textarea name="commentaires">${esc(ep?.commentaires || '')}</textarea>
          </div>
        </div>

        <hr class="divider">
        <div style="font-family:var(--font-display);font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text3);margin-bottom:8px">
          Personnages principaux
        </div>
        <div id="personnages-presence" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          ${principaux.map(renderPersonnageToggle).join('')}
          ${!principaux.length ? '<div style="font-size:12px;color:var(--text3)">Aucun personnage principal défini</div>' : ''}
        </div>

        ${recurrents.length ? `
        <div style="font-family:var(--font-display);font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text3);margin-bottom:8px">
          Personnages récurrents
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          ${recurrents.map(renderPersonnageToggle).join('')}
        </div>
        ` : ''}

        ${autresP.length ? `
        <div style="font-family:var(--font-display);font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text3);margin-bottom:8px">
          Autres personnages
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          ${autresP.map(renderPersonnageToggle).join('')}
        </div>
        ` : ''}

        <div style="font-family:var(--font-display);font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text3);margin-bottom:12px">
          Personnages libres (texte libre)
        </div>
        <div class="extras-list" id="extras-list">
          ${(ep?.extras || []).map((x, i) => `
            <div class="extra-row">
              <input type="text" placeholder="Nom du personnage" value="${esc(x.nom)}" name="extra_nom_${i}">
              <input type="number" placeholder="Répl." value="${x.nb_repliques || 0}" name="extra_repliques_${i}" style="width:80px">
              <button type="button" class="btn btn-ghost btn-icon" onclick="this.parentElement.remove()">✕</button>
            </div>
          `).join('')}
        </div>
        <button type="button" class="btn btn-ghost btn-sm" onclick="Episodes.addExtra()" style="margin-top:8px">+ Ajouter un personnage libre</button>

        <hr class="divider">
        <div style="font-family:var(--font-display);font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text3);margin-bottom:12px">
          Décors / Lieux
        </div>
        <div id="lieux-form" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          ${this.lieux.map(l => {
            const el = (ep?.lieux || []).find(x => x.lieu_id == l.id);
            const statut = el?.statut || 'absent';
            const isFirstAppearance = ep?.id && l.premiere_apparition_episode_id == ep.id;
            return `
              <div style="background:var(--bg3);border-radius:4px;padding:8px;border:1px solid var(--border)">
                <div style="font-size:12px;margin-bottom:6px;font-weight:700">${esc(l.nom)}</div>
                <div class="lieu-statut-group" data-lieu="${l.id}">
                  <button type="button" class="statut-btn ${statut === 'present' ? 'active-present' : ''}" onclick="Episodes.setLieuStatut(${l.id},'present',this)">✓ Présent</button>
                  <button type="button" class="statut-btn ${statut === 'absent' ? 'active-absent' : ''}" onclick="Episodes.setLieuStatut(${l.id},'absent',this)">✕ Absent</button>
                  <button type="button" class="statut-btn ${statut === 'pas encore existant' ? 'active-pas-encore' : ''}" onclick="Episodes.setLieuStatut(${l.id},'pas encore existant',this)">◎ Pas encore</button>
                </div>
                <button type="button"
                  class="lieu-first-toggle ${isFirstAppearance ? 'is-active' : ''}"
                  onclick="Episodes.toggleLieuPremiereApparition(${l.id}, this)"
                  style="margin-top:7px;width:100%;border:1px solid ${isFirstAppearance ? 'var(--accent4)' : 'var(--border)'};background:${isFirstAppearance ? 'rgba(245, 166, 35, 0.18)' : 'var(--bg2)'};color:${isFirstAppearance ? 'var(--accent4)' : 'var(--text3)'};border-radius:4px;padding:5px 7px;font-size:10px;font-family:var(--font-display);font-weight:800;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;text-align:left">
                  ★ Première apparition
                </button>
                <input type="hidden" name="lieu_first_${l.id}" value="${isFirstAppearance ? '1' : '0'}">
                <input type="hidden" name="lieu_${l.id}" value="${esc(statut)}">
              </div>
            `;
          }).join('')}
        </div>
        <div class="form-group" style="margin-top:8px">
          <label>Autres lieux (texte libre)</label>
          <textarea name="lieux_autres" placeholder="Ex: La plage, L'hôpital de Lyon…">${esc((ep?.lieux_autres || []).map(x => x.description).join(', '))}</textarea>
        </div>

        <hr class="divider">
        <div style="font-family:var(--font-display);font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text3);margin-bottom:12px">
          Thèmes
        </div>
        <div id="themes-form" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">
          ${this.themes.map(t => {
            const et = (ep?.themes || []).find(x => x.theme_id == t.id);
            const intensite = et?.intensite || '';
            return `
              <div style="border:1px solid var(--border);border-radius:4px;padding:8px;min-width:140px">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                  <span style="width:10px;height:10px;border-radius:50%;background:${t.couleur};display:inline-block"></span>
                  <span style="font-size:12px;font-weight:700">${esc(t.nom)}</span>
                </div>
                <select name="theme_${t.id}" style="width:100%;font-size:11px">
                  <option value="">— aucun —</option>
                  ${['mention','fil rouge','central'].map(i => `<option ${intensite === i ? 'selected' : ''}>${i}</option>`).join('')}
                </select>
              </div>
            `;
          }).join('')}
        </div>
        ${this.themes.length === 0 ? `<div style="font-size:12px;color:var(--text3)">Aucun thème défini — allez dans l'onglet Thèmes pour en créer.</div>` : ''}

        <hr class="divider">
        <!-- ══ CHRONOLOGIE & STRUCTURE NARRATIVE ══ -->
        <div style="font-family:var(--font-display);font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--accent);margin-bottom:14px">
          ⏱ Chronologie &amp; Structure narrative
        </div>

        <!-- Plages temporelles (multi) -->
        <fieldset style="border:1px solid var(--border2);border-radius:6px;padding:14px 16px;margin-bottom:16px">
          <legend style="font-family:var(--font-display);font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:0 6px;color:var(--text3)">Quand se passe l'épisode</legend>
          <div style="font-size:11px;color:var(--text3);margin-bottom:10px;line-height:1.5">
            Ajoutez autant de plages que nécessaire (matin + soir d'un même jour, plusieurs jours…). Cochez "Flashback" si cette partie est un retour en arrière.
          </div>
          <div id="chron-plages-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">
            ${(() => {
              const plages = ep?.plages_temporelles?.length ? ep.plages_temporelles
                : [{ date: ep?.date_diege || '', moment: ep?.moment_journee || 'inconnu', est_flashback: 0, date_flashback_origine: ep?.date_flashback_origine || '', importance: 'principal' }];
              return plages.map((pl, pi) => `
                <div class="chron-plage-row" style="display:grid;grid-template-columns:1fr 1fr 150px auto auto;gap:8px;align-items:center;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:8px 10px">
                  <div>
                    <label style="font-size:10px;color:var(--text3);display:block;margin-bottom:3px">Date fiction</label>
                    <input type="date" name="plage_date_${pi}" value="${pl.date || ''}"
                      oninput="Episodes._refreshDateAfficheeOptions()" onchange="Episodes._refreshDateAfficheeOptions()"
                      style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text1);padding:5px 8px;border-radius:5px;font-size:12px">
                  </div>
                  <div>
                    <label style="font-size:10px;color:var(--text3);display:block;margin-bottom:3px">Moment</label>
                    <select name="plage_moment_${pi}"
                      style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text1);padding:5px 8px;border-radius:5px;font-size:12px">
                      <option value="inconnu"    ${(!pl.moment||pl.moment==='inconnu')  ?'selected':''}>? Inconnu</option>
                      <option value="matin"      ${pl.moment==='matin'      ?'selected':''}>🌅 Matin</option>
                      <option value="midi"       ${pl.moment==='midi'       ?'selected':''}>☀️ Midi</option>
                      <option value="apres-midi" ${pl.moment==='apres-midi' ?'selected':''}>🌤 Après-midi</option>
                      <option value="soiree"     ${pl.moment==='soiree'     ?'selected':''}>🌆 Soirée</option>
                      <option value="nuit"       ${pl.moment==='nuit'       ?'selected':''}>🌙 Nuit</option>
                    </select>
                  </div>
                  <div>
                    <label style="font-size:10px;color:var(--text3);display:block;margin-bottom:3px">Rôle du jour</label>
                    <select name="plage_importance_${pi}" onchange="Episodes._refreshDateAfficheeOptions()"
                      style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text1);padding:5px 8px;border-radius:5px;font-size:12px">
                      <option value="principal"      ${(pl.importance || 'principal') === 'principal' ? 'selected' : ''}>Principal</option>
                      <option value="secondaire"     ${pl.importance === 'secondaire' ? 'selected' : ''}>Secondaire</option>
                      <option value="non_applicable" ${pl.importance === 'non_applicable' ? 'selected' : ''}>N/A</option>
                    </select>
                  </div>
                  <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
                    <label style="font-size:10px;color:var(--text3);white-space:nowrap">⏮ Flashback</label>
                    <input type="checkbox" name="plage_flashback_${pi}" value="1"
                      ${parseInt(pl.est_flashback)===1 ? 'checked' : ''}
                      onchange="Episodes._togglePlageFlashDate(this, ${pi})"
                      style="width:15px;height:15px;accent-color:var(--accent);cursor:pointer">
                  </div>
                  <button type="button" class="btn btn-ghost btn-icon" onclick="this.closest('.chron-plage-row').remove();Episodes._refreshDateAfficheeOptions()" style="font-size:13px;padding:4px 7px;align-self:flex-end">✕</button>
                  <div id="plage-flash-date-${pi}" style="grid-column:1/-1;display:${parseInt(pl.est_flashback)===1 ? 'block' : 'none'};margin-top:4px">
                    <label style="font-size:10px;color:var(--text3);display:block;margin-bottom:3px">Date d'origine du flashback</label>
                    <input type="date" name="plage_flashback_date_${pi}" value="${pl.date_flashback_origine || ''}"
                      style="width:200px;background:var(--bg);border:1px solid var(--border);color:var(--text1);padding:5px 8px;border-radius:5px;font-size:12px">
                  </div>
                </div>
              `).join('');
            })()}
          </div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Episodes._addPlageRow()" style="font-size:11px">+ Ajouter une plage temporelle</button>
        </fieldset>

        <!-- Liens flash (épisodes référencés par les flashbacks/flashforwards) -->
        <fieldset style="border:1px solid var(--border2);border-radius:6px;padding:14px 16px;margin-bottom:16px" id="chron-flash-fieldset">
          <legend style="font-family:var(--font-display);font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:0 6px;color:var(--text3)">Épisodes liés aux flashbacks / flashforwards</legend>
          <div style="font-size:11px;color:var(--text3);margin-bottom:10px;line-height:1.5">
            Si une plage cochée "Flashback" ci-dessus renvoie à un autre épisode, indiquez-le ici.
          </div>
          <div id="chron-liens-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px">
            ${(ep?.liens || []).map((lien, li) => `
              <div class="chron-lien-row" style="display:flex;gap:8px;align-items:center">
                <select name="chron_lien_type_${li}" style="background:var(--bg3);border:1px solid var(--border);color:var(--text1);padding:5px 8px;border-radius:5px;font-size:12px;min-width:130px">
                  <option value="flashback"    ${lien.type_lien==='flashback'    ? 'selected' : ''}>⏮ Flashback</option>
                  <option value="flashforward" ${lien.type_lien==='flashforward' ? 'selected' : ''}>⏭ Flashforward</option>
                  <option value="reference"    ${lien.type_lien==='reference'    ? 'selected' : ''}>🔗 Référence</option>
                </select>
                <select name="chron_lien_ep_${li}" style="flex:1;background:var(--bg3);border:1px solid var(--border);color:var(--text1);padding:5px 8px;border-radius:5px;font-size:12px">
                  <option value="">— Choisir un épisode —</option>
                  ${this.data.filter(e => e.id !== ep?.id).map(e =>
                    `<option value="${e.id}" ${lien.episode_lie_id==e.id ? 'selected' : ''}>S${e.saison_numero}E${String(e.numero_episode).padStart(2,'0')}${e.titre ? ' — '+esc(e.titre) : ''}</option>`
                  ).join('')}
                </select>
                <button type="button" class="btn btn-ghost btn-icon" onclick="this.closest('.chron-lien-row').remove()" style="font-size:14px;padding:4px 8px">✕</button>
              </div>
            `).join('')}
          </div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Episodes._addLienRow()" style="font-size:11px">+ Ajouter un lien flash</button>
        </fieldset>

        <!-- Arc narratif multi-épisodes -->
        <fieldset style="border:1px solid var(--border2);border-radius:6px;padding:14px 16px;margin-bottom:16px" id="chron-arc-fieldset">
          <legend style="font-family:var(--font-display);font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:0 6px;color:var(--text3)">Arc narratif multi-épisodes</legend>

          <div style="font-size:12px;color:var(--text3);margin-bottom:12px;line-height:1.5">
            Si cet épisode fait partie d'une histoire qui s'étale sur plusieurs épisodes (ex : 3 épisodes), indiquez le nom de l'arc et la position de cet épisode (1/3, 2/3, 3/3…)
          </div>

          <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;align-items:end">
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:5px">Nom de l'arc / de l'histoire</label>
              <input type="text" name="chron_arc_nom" value="${esc(ep?.arc_nom || '')}"
                placeholder="Ex: L'affaire Rosenberg, La guerre des clans…"
                style="width:100%;background:var(--bg3);border:1px solid var(--border);color:var(--text1);padding:6px 10px;border-radius:6px;font-size:13px"
                oninput="Episodes._updateArcPreview()">
            </div>
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:5px">Partie (n°)</label>
              <input type="number" name="chron_arc_partie" min="1" value="${ep?.arc_partie || ''}"
                placeholder="1"
                style="width:100%;background:var(--bg3);border:1px solid var(--border);color:var(--text1);padding:6px 10px;border-radius:6px;font-size:13px"
                oninput="Episodes._updateArcPreview()">
            </div>
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:5px">Sur combien ?</label>
              <input type="number" name="chron_arc_total" min="1" value="${ep?.arc_total || ''}"
                placeholder="3"
                style="width:100%;background:var(--bg3);border:1px solid var(--border);color:var(--text1);padding:6px 10px;border-radius:6px;font-size:13px"
                oninput="Episodes._updateArcPreview()">
            </div>
          </div>

          <div id="chron-arc-preview" style="margin-top:12px;padding:10px 14px;background:var(--bg);border-radius:6px;border:1px solid var(--border);display:${ep?.arc_nom ? 'flex' : 'none'};align-items:center;gap:12px">
            <span style="font-size:18px">📖</span>
            <div>
              <span id="chron-arc-preview-nom" style="font-size:13px;font-weight:700;color:var(--text1)">${esc(ep?.arc_nom || '')}</span>
              <span id="chron-arc-preview-partie" style="font-size:12px;color:var(--accent);margin-left:10px;font-family:var(--font-display)">${ep?.arc_partie && ep?.arc_total ? `Partie ${ep.arc_partie}/${ep.arc_total}` : ep?.arc_partie ? `Partie ${ep.arc_partie}` : ''}</span>
            </div>
          </div>
        </fieldset>

        <hr class="divider">
        <!-- ══ MENTIONS D'ÉPISODES ══ -->
        <div style="font-family:var(--font-display);font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--accent);margin-bottom:14px">
          🔗 Mentions d'autres épisodes
        </div>
        <fieldset style="border:1px solid var(--border2);border-radius:6px;padding:14px 16px;margin-bottom:16px">
          <legend style="font-family:var(--font-display);font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:0 6px;color:var(--text3)">Épisodes mentionnés dans cet épisode</legend>
          <div style="font-size:11px;color:var(--text3);margin-bottom:10px;line-height:1.5">
            Si un autre épisode est évoqué, cité ou référencé dans celui-ci, indiquez-le et son niveau d'importance dans la narration.
          </div>
          <div id="mentions-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px">
            ${(ep?.mentions || []).map((m, mi) => `
              <div class="mention-row" style="display:flex;gap:8px;align-items:center">
                <select name="mention_ep_${mi}" style="flex:1;background:var(--bg3);border:1px solid var(--border);color:var(--text1);padding:5px 8px;border-radius:5px;font-size:12px">
                  <option value="">— Épisode mentionné —</option>
                  ${this.data.filter(e => e.id !== ep?.id).map(e =>
                    `<option value="${e.id}" ${m.episode_mentionne_id==e.id ? 'selected' : ''}>S${e.saison_numero}E${String(e.numero_episode).padStart(2,'0')}${e.titre ? ' — '+esc(e.titre) : ''}</option>`
                  ).join('')}
                </select>
                <select name="mention_niveau_${mi}" style="background:var(--bg3);border:1px solid var(--border);color:var(--text1);padding:5px 8px;border-radius:5px;font-size:12px;min-width:160px">
                  <option value="centrale"     ${m.niveau==='centrale'     ? 'selected' : ''}>⭐⭐⭐ Centrale</option>
                  <option value="importante"   ${m.niveau==='importante'   ? 'selected' : ''}>⭐⭐ Importante</option>
                  <option value="mineure"      ${m.niveau==='mineure'      ? 'selected' : ''}>⭐ Mineure</option>
                  <option value="tres-mineure" ${m.niveau==='tres-mineure' ? 'selected' : ''}>· Très mineure</option>
                </select>
                <button type="button" class="btn btn-ghost btn-icon" onclick="this.closest('.mention-row').remove()" style="font-size:14px;padding:4px 8px">✕</button>
              </div>
            `).join('')}
          </div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Episodes._addMentionRow()" style="font-size:11px">+ Ajouter une mention</button>
        </fieldset>

        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-ghost" onclick="modal.close()">Annuler</button>
          <button class="btn btn-primary" onclick="Episodes.saveEpisode(${ep?.id || 'null'})">
            ${isNew ? 'Créer l\'épisode' : 'Enregistrer'}
          </button>
        </div>
      </form>
    `);
  },

  togglePresence(id, color) {
    const toggle = document.getElementById(`toggle-${id}`);
    const input = toggle.querySelector('input[type=hidden]');
    const dot = toggle.querySelector('.toggle-dot');
    const label = toggle.querySelector('span');
    const isNow = input.value === '1';
    if (isNow) {
      input.value = '0';
      toggle.classList.remove('is-present');
      dot.style.background = 'transparent';
      dot.style.color = color;
      label.style.color = 'var(--text3)';
    } else {
      input.value = '1';
      toggle.classList.add('is-present');
      dot.style.background = color;
      dot.style.color = '#000';
      label.style.color = 'var(--text)';
    }
  },

  setLieuStatut(lieuId, statut, btn) {
    const group = btn.closest('.lieu-statut-group');
    // Reset tous les boutons du groupe
    group.querySelectorAll('.statut-btn').forEach(b => {
      b.className = 'statut-btn';
    });
    // Activer le bouton cliqué
    const cls = statut === 'present' ? 'active-present'
              : statut === 'absent' ? 'active-absent'
              : 'active-pas-encore';
    btn.classList.add(cls);
    // L'input hidden est un frère direct du groupe dans le même conteneur parent
    const container = group.parentElement;
    const hiddenInput = container.querySelector(`input[name="lieu_${lieuId}"]`);
    if (hiddenInput) hiddenInput.value = statut;

    if (statut !== 'present') {
      const firstInput = container.querySelector(`input[name="lieu_first_${lieuId}"]`);
      const firstButton = container.querySelector('.lieu-first-toggle');
      if (firstInput) firstInput.value = '0';
      if (firstButton) this._styleLieuFirstToggle(firstButton, false);
    }
  },

  toggleLieuPremiereApparition(lieuId, button) {
    const container = button.closest('div');
    const firstInput = container.querySelector(`input[name="lieu_first_${lieuId}"]`);
    const enabled = firstInput?.value !== '1';
    if (firstInput) firstInput.value = enabled ? '1' : '0';
    this._styleLieuFirstToggle(button, enabled);
    if (!enabled) return;

    const presentBtn = container.querySelector('.lieu-statut-group .statut-btn');
    if (presentBtn) this.setLieuStatut(lieuId, 'present', presentBtn);
  },

  _styleLieuFirstToggle(button, enabled) {
    if (!button) return;
    button.classList.toggle('is-active', !!enabled);
    button.style.color = enabled ? 'var(--accent4)' : 'var(--text3)';
    button.style.borderColor = enabled ? 'var(--accent4)' : 'var(--border)';
    button.style.background = enabled ? 'rgba(245, 166, 35, 0.18)' : 'var(--bg2)';
  },

  _episodePlages(ep) {
    if (ep?.plages_temporelles?.length) return ep.plages_temporelles;
    if (ep?.date_diege || ep?.moment_journee || parseInt(ep?.est_flashback || 0) === 1) {
      return [{
        date: ep?.date_diege || '',
        moment: ep?.moment_journee || 'inconnu',
        importance: 'principal',
        est_flashback: ep?.est_flashback || 0,
        date_flashback_origine: ep?.date_flashback_origine || '',
      }];
    }
    return [];
  },

  _principalDatesFromPlages(plages) {
    const seen = new Set();
    return plages
      .filter(pl => (pl.importance || 'principal') === 'principal' && (pl.date || pl.date_plage))
      .map(pl => pl.date || pl.date_plage)
      .filter(date => {
        if (seen.has(date)) return false;
        seen.add(date);
        return true;
      });
  },

  _dateOptionLabel(date) {
    return date ? formatDateJJMMYY(date) : 'Aucune date principale';
  },

  _renderDateAfficheeOptions(ep) {
    const dates = this._principalDatesFromPlages(this._episodePlages(ep));
    const current = ep?.date_diege || dates[0] || '';
    const options = [...dates];
    if (current && !options.includes(current)) options.unshift(current);
    if (!options.length) {
      return '<option value="">Aucune date principale</option>';
    }
    return options.map(date => {
      const extra = dates.includes(date) ? '' : ' · hors plages principales';
      return `<option value="${date}" ${date === current ? 'selected' : ''}>${this._dateOptionLabel(date)}${extra}</option>`;
    }).join('');
  },

  _collectPlagesFromForm(form) {
    return Array.from(form.querySelectorAll('.chron-plage-row')).map(row => {
      const date = row.querySelector('input[name^="plage_date_"]')?.value || null;
      const moment = row.querySelector('select[name^="plage_moment_"]')?.value || 'inconnu';
      const importance = row.querySelector('select[name^="plage_importance_"]')?.value || 'principal';
      const estFlash = row.querySelector('input[name^="plage_flashback_"]')?.checked ? 1 : 0;
      const flashDate = row.querySelector('input[name^="plage_flashback_date_"]')?.value || null;
      if (!date && moment === 'inconnu' && !estFlash && !flashDate) return null;
      return { date, moment, importance, est_flashback: estFlash, date_flashback_origine: flashDate };
    }).filter(Boolean);
  },

  _refreshDateAfficheeOptions() {
    const form = document.getElementById('episode-form');
    const select = document.getElementById('date-affichee-select');
    if (!form || !select) return;

    const previous = select.value || select.dataset.current || '';
    const dates = this._principalDatesFromPlages(this._collectPlagesFromForm(form));
    const selected = dates.includes(previous) ? previous : (dates[0] || '');

    select.innerHTML = dates.length
      ? dates.map(date => `<option value="${date}" ${date === selected ? 'selected' : ''}>${this._dateOptionLabel(date)}</option>`).join('')
      : '<option value="">Aucune date principale</option>';
    select.value = selected;
    select.dataset.current = selected;
  },

  _toggleFlashFields() {
    const cb = document.querySelector('input[name="chron_est_flashback"]');
    const details = document.getElementById('chron-flash-details');
    if (details) details.style.display = cb?.checked ? 'block' : 'none';
  },

  _togglePlageFlashDate(cb, idx) {
    const zone = document.getElementById(`plage-flash-date-${idx}`);
    if (zone) zone.style.display = cb.checked ? 'block' : 'none';
  },

  _addPlageRow() {
    const list = document.getElementById('chron-plages-list');
    if (!list) return;
    const pi = list.children.length;
    const importance = pi === 0 ? 'principal' : 'secondaire';
    const div = document.createElement('div');
    div.className = 'chron-plage-row';
    div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 150px auto auto;gap:8px;align-items:center;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:8px 10px';
    div.innerHTML = `
      <div>
        <label style="font-size:10px;color:var(--text3);display:block;margin-bottom:3px">Date fiction</label>
        <input type="date" name="plage_date_${pi}" value=""
          oninput="Episodes._refreshDateAfficheeOptions()" onchange="Episodes._refreshDateAfficheeOptions()"
          style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text1);padding:5px 8px;border-radius:5px;font-size:12px">
      </div>
      <div>
        <label style="font-size:10px;color:var(--text3);display:block;margin-bottom:3px">Moment</label>
        <select name="plage_moment_${pi}"
          style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text1);padding:5px 8px;border-radius:5px;font-size:12px">
          <option value="inconnu" selected>? Inconnu</option>
          <option value="matin">\uD83C\uDF05 Matin</option>
          <option value="midi">\u2600\uFE0F Midi</option>
          <option value="apres-midi">\uD83C\uDF24 Apr\u00e8s-midi</option>
          <option value="soiree">\uD83C\uDF06 Soir\u00e9e</option>
          <option value="nuit">\uD83C\uDF19 Nuit</option>
        </select>
      </div>
      <div>
        <label style="font-size:10px;color:var(--text3);display:block;margin-bottom:3px">R\u00f4le du jour</label>
        <select name="plage_importance_${pi}" onchange="Episodes._refreshDateAfficheeOptions()"
          style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text1);padding:5px 8px;border-radius:5px;font-size:12px">
          <option value="principal" ${importance === 'principal' ? 'selected' : ''}>Principal</option>
          <option value="secondaire" ${importance === 'secondaire' ? 'selected' : ''}>Secondaire</option>
          <option value="non_applicable">N/A</option>
        </select>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
        <label style="font-size:10px;color:var(--text3);white-space:nowrap">\u23EE Flashback</label>
        <input type="checkbox" name="plage_flashback_${pi}" value="1"
          onchange="Episodes._togglePlageFlashDate(this, ${pi})"
          style="width:15px;height:15px;accent-color:var(--accent);cursor:pointer">
      </div>
      <button type="button" class="btn btn-ghost btn-icon" onclick="this.closest('.chron-plage-row').remove();Episodes._refreshDateAfficheeOptions()" style="font-size:13px;padding:4px 7px;align-self:flex-end">\u2715</button>
      <div id="plage-flash-date-${pi}" style="grid-column:1/-1;display:none;margin-top:4px">
        <label style="font-size:10px;color:var(--text3);display:block;margin-bottom:3px">Date d'origine du flashback</label>
        <input type="date" name="plage_flashback_date_${pi}" value=""
          style="width:200px;background:var(--bg);border:1px solid var(--border);color:var(--text1);padding:5px 8px;border-radius:5px;font-size:12px">
      </div>
    `;
    list.appendChild(div);
    this._refreshDateAfficheeOptions();
  },

  _addMentionRow() {
    const list = document.getElementById('mentions-list');
    if (!list) return;
    const mi = list.children.length;
    const epOptions = this.data.map(e =>
      `<option value="${e.id}">S${e.saison_numero}E${String(e.numero_episode).padStart(2,'0')}${e.titre ? ' \u2014 '+esc(e.titre) : ''}</option>`
    ).join('');
    const div = document.createElement('div');
    div.className = 'mention-row';
    div.style.cssText = 'display:flex;gap:8px;align-items:center';
    div.innerHTML = `
      <select name="mention_ep_${mi}" style="flex:1;background:var(--bg3);border:1px solid var(--border);color:var(--text1);padding:5px 8px;border-radius:5px;font-size:12px">
        <option value="">\u2014 \u00c9pisode mentionn\u00e9 \u2014</option>
        ${epOptions}
      </select>
      <select name="mention_niveau_${mi}" style="background:var(--bg3);border:1px solid var(--border);color:var(--text1);padding:5px 8px;border-radius:5px;font-size:12px;min-width:160px">
        <option value="centrale">\u2B50\u2B50\u2B50 Centrale</option>
        <option value="importante" selected>\u2B50\u2B50 Importante</option>
        <option value="mineure">\u2B50 Mineure</option>
        <option value="tres-mineure">\u00b7 Tr\u00e8s mineure</option>
      </select>
      <button type="button" class="btn btn-ghost btn-icon" onclick="this.closest('.mention-row').remove()" style="font-size:14px;padding:4px 8px">\u2715</button>
    `;
    list.appendChild(div);
  },

  _addLienRow() {
    const list = document.getElementById('chron-liens-list');
    if (!list) return;
    const idx = list.children.length;
    const epOptions = this.data.map(e =>
      `<option value="${e.id}">S${e.saison_numero}E${String(e.numero_episode).padStart(2,'0')}${e.titre ? ' \u2014 '+esc(e.titre) : ''}</option>`
    ).join('');
    const div = document.createElement('div');
    div.className = 'chron-lien-row';
    div.style.cssText = 'display:flex;gap:8px;align-items:center';
    div.innerHTML = `
      <select name="chron_lien_type_${idx}" style="background:var(--bg3);border:1px solid var(--border);color:var(--text1);padding:5px 8px;border-radius:5px;font-size:12px;min-width:130px">
        <option value="flashback">\u23EE Flashback</option>
        <option value="flashforward">\u23ED Flashforward</option>
        <option value="reference">\uD83D\uDD17 R\u00e9f\u00e9rence</option>
      </select>
      <select name="chron_lien_ep_${idx}" style="flex:1;background:var(--bg3);border:1px solid var(--border);color:var(--text1);padding:5px 8px;border-radius:5px;font-size:12px">
        <option value="">\u2014 Choisir un \u00e9pisode \u2014</option>
        ${epOptions}
      </select>
      <button type="button" class="btn btn-ghost btn-icon" onclick="this.closest('.chron-lien-row').remove()" style="font-size:14px;padding:4px 8px">\u2715</button>
    `;
    list.appendChild(div);
  },

  _updateArcPreview() {
    const nom    = document.querySelector('input[name="chron_arc_nom"]')?.value?.trim() || '';
    const partie = document.querySelector('input[name="chron_arc_partie"]')?.value || '';
    const total  = document.querySelector('input[name="chron_arc_total"]')?.value || '';
    const preview = document.getElementById('chron-arc-preview');
    if (!preview) return;
    if (nom) {
      preview.style.display = 'flex';
      document.getElementById('chron-arc-preview-nom').textContent = nom;
      const partieEl = document.getElementById('chron-arc-preview-partie');
      if (partie && total) partieEl.textContent = `Partie ${partie}/${total}`;
      else if (partie)     partieEl.textContent = `Partie ${partie}`;
      else                 partieEl.textContent = '';
    } else {
      preview.style.display = 'none';
    }
  },

  addExtra() {
    const list = document.getElementById('extras-list');
    const i = list.children.length;
    const div = document.createElement('div');
    div.className = 'extra-row';
    div.innerHTML = `
      <input type="text" placeholder="Nom du personnage" name="extra_nom_${i}">
      <input type="number" placeholder="Répl." value="0" name="extra_repliques_${i}" style="width:80px">
      <button type="button" class="btn btn-ghost btn-icon" onclick="this.parentElement.remove()">✕</button>
    `;
    list.appendChild(div);
  },

  async saveEpisode(id) {
    const form = document.getElementById('episode-form');
    const fd = new FormData(form);
    // Tous les personnages trackés (principaux + récurrents + autres)
    const allTracked = this.personnages;
    const plagesTemporelles = this._collectPlagesFromForm(form);
    const dateAffichee = fd.get('date_diege') || this._principalDatesFromPlages(plagesTemporelles)[0] || null;
    const plageAffichee = plagesTemporelles.find(pl => pl.date === dateAffichee && pl.importance === 'principal')
      || plagesTemporelles.find(pl => pl.importance === 'principal')
      || plagesTemporelles.find(pl => pl.importance !== 'non_applicable')
      || null;

    const data = {
      saison_id: fd.get('saison_id'),
      numero_episode: parseInt(fd.get('numero_episode')),
      titre: fd.get('titre'),
      titre_fr: fd.get('titre_fr') || null,
      date_diege: dateAffichee,
      code: fd.get('code'),
      jet: fd.get('jet'),
      avancement: parseInt(fd.get('avancement')),
      nb_pages: parseInt(fd.get('nb_pages')),
      intrigue_a: fd.get('intrigue_a'),
      intrigue_b: fd.get('intrigue_b'),
      intrigue_c: fd.get('intrigue_c'),
      intrigues_sup: Object.fromEntries(Interface.config.intrigues.map(l => [l, fd.get(`intrigue_sup_${l}`) || ''])),
      resume: fd.get('resume') || null,
      etat_episode: fd.get('etat_episode') || null,
      faux_site_web: fd.get('faux_site_web'),
      source: fd.get('source') || null,
      commentaires: fd.get('commentaires'),
      date_debut_ecriture: fd.get('date_debut_ecriture') || null,
      date_debut_qual:     fd.get('date_debut_qual') || 'exacte',
      date_fin_ecriture:   fd.get('date_fin_ecriture') || null,
      date_fin_qual:       fd.get('date_fin_qual') || 'exacte',
      personnages: allTracked.map(p => ({
        personnage_id: p.id,
        present: parseInt(fd.get(`perso_present_${p.id}`) || 0),
        nb_repliques: 0
      })),
      extras: [],
      lieux: this.lieux.map(l => ({ lieu_id: l.id, statut: fd.get(`lieu_${l.id}`) || 'absent' })),
      lieux_autres: fd.get('lieux_autres'),
      themes: this.themes.map(t => {
        const intensite = fd.get(`theme_${t.id}`);
        return intensite ? { theme_id: t.id, intensite } : null;
      }).filter(Boolean),
      // ── Chronologie & structure narrative
      moment_journee:         plageAffichee?.moment || 'inconnu',
      est_flashback:          plageAffichee?.est_flashback || 0,
      date_flashback_origine: plageAffichee?.date_flashback_origine || null,
      arc_nom:                fd.get('chron_arc_nom') || null,
      arc_partie:             fd.get('chron_arc_partie') ? parseInt(fd.get('chron_arc_partie')) : null,
      arc_total:              fd.get('chron_arc_total')  ? parseInt(fd.get('chron_arc_total'))  : null,
      plages_temporelles: plagesTemporelles,
      liens: (() => {
        const liens = [];
        let li = 0;
        while (fd.get(`chron_lien_ep_${li}`) !== null) {
          const epLieId = parseInt(fd.get(`chron_lien_ep_${li}`));
          const typeLien = fd.get(`chron_lien_type_${li}`) || 'flashback';
          if (epLieId) liens.push({ episode_lie_id: epLieId, type_lien: typeLien });
          li++;
        }
        return liens;
      })(),
      mentions: (() => {
        const mentions = [];
        let mi = 0;
        while (fd.get(`mention_ep_${mi}`) !== null) {
          const epId = parseInt(fd.get(`mention_ep_${mi}`));
          const niveau = fd.get(`mention_niveau_${mi}`) || 'mineure';
          if (epId) mentions.push({ episode_mentionne_id: epId, niveau });
          mi++;
        }
        return mentions;
      })(),
    };

    // Extras
    let i = 0;
    while (fd.get(`extra_nom_${i}`) !== null) {
      const nom = fd.get(`extra_nom_${i}`);
      if (nom.trim()) data.extras.push({ nom, nb_repliques: parseInt(fd.get(`extra_repliques_${i}`) || 0) });
      i++;
    }

    const premiereApparitionUpdates = this.lieux
      .filter(l => fd.get(`lieu_first_${l.id}`) === '1' || (id && l.premiere_apparition_episode_id == id))
      .map(l => ({
        lieu: l,
        enabled: fd.get(`lieu_first_${l.id}`) === '1'
      }));

    try {
      let savedId = id;
      if (id) {
        const avant = this.data.find(e => e.id === id) || null;
        await apiLogged.updateEpisode(id, data, avant);
        toast('Épisode mis à jour', 'success');
      } else {
        const res = await apiLogged.createEpisode(data);
        savedId = parseInt(res?.id || 0);
        toast('Épisode créé', 'success');
      }
      if (savedId && premiereApparitionUpdates.length) {
        await this._syncPremieresApparitions(savedId, premiereApparitionUpdates);
      }
      modal.close();
      await this.loadAll();
      this.render();
    } catch (e) {
      toast('Erreur lors de la sauvegarde', 'error');
    }
  },

  async _syncPremieresApparitions(episodeId, updates) {
    for (const update of updates) {
      await api.put(`lieux/${update.lieu.id}`, {
        ...update.lieu,
        premiere_apparition_episode_id: update.enabled ? episodeId : null
      });
    }
  },

  async setEtat(id, valeur, selectEl) {
    // Mise à jour couleur immédiate
    const bg = etatColor(valeur);
    const tc = etatTextColor(bg);
    selectEl.style.background = bg;
    selectEl.style.color = tc;
    selectEl.title = valeur || 'État…';
    // Sauvegarder
    const ep = this.data.find(e => e.id === id);
    if (!ep) return;
    // personnages_principaux est un tableau d'objets enrichis — on remet en format attendu par le PHP
    const personnages = (ep.personnages_principaux || []).map(p => ({
      personnage_id: p.personnage_id || p.id,
      present:       p.present ?? 1,
      nb_repliques:  p.nb_repliques || 0
    }));
    const lieux = (ep.lieux || []).map(l => ({
      lieu_id: l.lieu_id || l.id,
      statut:  l.statut || 'absent'
    }));
    const themes = (ep.themes || []).map(t => ({
      theme_id:  t.theme_id || t.id,
      intensite: t.intensite
    }));
    const data = {
      saison_id:      ep.saison_id,
      numero_episode: ep.numero_episode,
      titre:          ep.titre,
      titre_fr:       ep.titre_fr || null,
      date_diege:     ep.date_diege || null,
      code:           ep.code || null,
      jet:            ep.jet || '1er jet',
      avancement:     ep.avancement || 0,
      nb_pages:       ep.nb_pages || 0,
      intrigue_a:     ep.intrigue_a || null,
      intrigue_b:     ep.intrigue_b || null,
      intrigue_c:     ep.intrigue_c || null,
      resume:         ep.resume || null,
      faux_site_web:  ep.faux_site_web || null,
      commentaires:   ep.commentaires || null,
      lieux_autres:   ep.lieux_autres || null,
      etat_episode:   valeur || null,
      date_debut_ecriture: ep.date_debut_ecriture || null,
      date_debut_qual:     ep.date_debut_qual || 'exacte',
      date_fin_ecriture:   ep.date_fin_ecriture || null,
      date_fin_qual:       ep.date_fin_qual || 'exacte',
      moment_journee:          ep.moment_journee || 'inconnu',
      est_flashback:           parseInt(ep.est_flashback || 0),
      date_flashback_origine:  ep.date_flashback_origine || null,
      arc_nom:                 ep.arc_nom || null,
      arc_partie:              ep.arc_partie || null,
      arc_total:               ep.arc_total || null,
      plages_temporelles: (ep.plages_temporelles || []).map(pl => ({
        date: pl.date || pl.date_plage || null,
        moment: pl.moment || 'inconnu',
        importance: pl.importance || 'principal',
        est_flashback: parseInt(pl.est_flashback || 0),
        date_flashback_origine: pl.date_flashback_origine || null,
      })),
      liens: (ep.liens || []).map(l => ({
        episode_lie_id: l.episode_lie_id,
        type_lien: l.type_lien || 'flashback',
      })).filter(l => l.episode_lie_id),
      mentions: (ep.mentions || []).map(m => ({
        episode_mentionne_id: m.episode_mentionne_id,
        niveau: m.niveau || 'mineure',
      })).filter(m => m.episode_mentionne_id),
      personnages, extras: ep.extras || [], lieux, themes,
    };
    try {
      await api.put(`episodes/${id}`, data);
      ep.etat_episode = valeur || null;
    } catch(e) {
      toast('Erreur sauvegarde état', 'error');
    }
  },

  async confirmDelete(id) {
    if (!confirm('Supprimer cet épisode ? Cette action est irréversible.')) return;
    const ep = this.data.find(e => e.id === id);
    const label = ep ? (ep.titre || `E${String(ep.numero_episode).padStart(2,'0')}`) : `Épisode #${id}`;
    await apiLogged.deleteEpisode(id, label);
    toast('Épisode supprimé', 'info');
    await this.loadAll();
    this.render();
  },

  async openSaisonManager() {
    modal.open(`
      <div class="modal-title">Gestion des saisons</div>
      <div id="saisons-list" style="margin-bottom:16px">
        ${this.saisons.map(s => `
          <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg3);border-radius:4px;margin-bottom:6px;border:1px solid var(--border)">
            <input type="color" value="${s.couleur}" onchange="Episodes.updateSaisonColor(${s.id},this.value)"
              style="width:32px;height:32px;border:none;padding:2px;cursor:pointer;border-radius:50%">
            <input type="text" value="${esc(s.nom || 'Saison ' + s.numero)}" style="flex:1"
              onblur="Episodes.updateSaisonNom(${s.id},this.value)">
            <span style="font-size:11px;color:var(--text3)">${s.nb_episodes} épisodes</span>
            <button class="btn btn-danger btn-sm" onclick="Episodes.deleteSaison(${s.id})">✕</button>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-primary" onclick="Episodes.addSaison()">+ Nouvelle saison</button>
    `);
  },

  async addSaison() {
    const num = this.saisons.length + 1;
    const colors = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c'];
    await apiLogged.createSaison({ numero: num, nom: `Saison ${num}`, couleur: colors[(num-1) % colors.length] });
    await this.loadAll();
    this.openSaisonManager();
    this.render();
  },

  async updateSaisonColor(id, couleur) {
    const s = this.saisons.find(x => x.id == id);
    if (s) await apiLogged.updateSaison(id, { ...s, couleur });
    await this.loadAll();
    this.render();
  },

  async updateSaisonNom(id, nom) {
    const s = this.saisons.find(x => x.id == id);
    if (s && nom !== s.nom) {
      await apiLogged.updateSaison(id, { ...s, nom });
      await this.loadAll();
      this.render();
    }
  },

  async deleteSaison(id) {
    if (!confirm('Supprimer cette saison et TOUS ses épisodes ?')) return;
    const s = this.saisons.find(x => x.id == id);
    await apiLogged.deleteSaison(id, s?.nom || `Saison #${id}`);
    await this.loadAll();
    this.openSaisonManager();
    this.render();
  }
};
