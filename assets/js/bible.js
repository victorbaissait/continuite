// assets/js/bible.js
'use strict';


const Bible = {
  episodes: [],
  saisons: [],
  personnages: [],
  lieux: [],
  themes: [],
  notes: [],
  saisonId: null,
  targetId: 'tab-bible',
  embedded: false,

  async init(options = {}) {
    if (options.targetId) this.targetId = options.targetId;
    this.embedded = !!options.embedded;
    [this.episodes, this.saisons, this.personnages, this.lieux, this.themes, this.notes] = await Promise.all([
      api.get('episodes'),
      DataStore.get('saisons'),
      DataStore.get('personnages'),
      DataStore.get('lieux'),
      DataStore.get('themes'),
      api.get('bible_notes').catch(() => []),
    ]);
    if (!this.saisonId && this.saisons.length) this.saisonId = this.saisons[0].id;
    // Les relations, états et secrets ont pu changer depuis la dernière ouverture
    this.serie = null;
    if (this.saisonId === 'all') this.chargerSerie();
    this.render();
  },

  render() {
    const target = document.getElementById(this.targetId);
    if (!target) return;
    // « Toute la série » : une saison fictive sans identifiant, et tous les épisodes dans l'ordre
    const serie = this.saisonId === 'all';
    const saison = serie ? { id: null, nom: 'Bible de la série' } : this.saisons.find(s => s.id == this.saisonId) || this.saisons[0];
    const numero = id => this.saisons.find(s => s.id == id)?.numero || 0;
    const episodes = (serie ? [...this.episodes] : this.episodes.filter(ep => ep.saison_id == saison?.id))
      .sort((a, b) => numero(a.saison_id) - numero(b.saison_id) || a.numero_episode - b.numero_episode);

    const bibleContent = `
      <div class="bible-wrap ${this.embedded ? 'is-embedded' : ''}">
        ${this.renderControls(saison)}
        ${saison ? this.renderDoc(saison, episodes) : this.renderEmpty()}
      </div>
    `;

    target.innerHTML = this.embedded ? `
      <div class="settings-card settings-bible-card">
        <div class="settings-card-header">Bible de saison</div>
        <div class="settings-card-body">
          <div class="settings-card-subtitle">Synthèse éditoriale : épisodes, thèmes, arcs, personnages, lieux, chronologie et continuité.</div>
          ${bibleContent}
        </div>
      </div>
    ` : `
      <div class="section-header">
        <div>
          <div class="section-title">▤ Bible de saison</div>
          <div style="color:var(--text3);font-size:12px;margin-top:6px">Synthèse éditoriale : épisodes, thèmes, arcs, personnages, lieux, chronologie et continuité.</div>
        </div>
      </div>
      ${bibleContent}
    `;
  },

  renderControls(saison) {
    return `
      <div class="bible-controls">
        <span class="bible-controls-label">Saison :</span>
        <select class="bible-select" onchange="Bible.setSaison(this.value)">
          <option value="all" ${this.saisonId === 'all' ? 'selected' : ''}>Toute la série</option>
          ${this.saisons.map(s => `<option value="${s.id}" ${this.saisonId !== 'all' && s.id == saison?.id ? 'selected' : ''}>${this.escape(s.nom || 'Saison ' + s.numero)}</option>`).join('')}
        </select>
        <button class="btn btn-ghost btn-sm" onclick="window.print()">Imprimer / PDF</button>
      </div>
    `;
  },

  setSaison(value) {
    this.saisonId = value === 'all' ? 'all' : parseInt(value);
    if (this.saisonId === 'all') this.chargerSerie();
    this.render();
  },

  // Ce que la bible de la série ajoute : relations, états, secrets et fils, lus à la demande
  async chargerSerie() {
    if (this.serie || this._serieCharge) return;
    this._serieCharge = true;
    const [graphe, etats, secrets, fils] = await Promise.allSettled([api.get('graphe'), api.get('etats'), api.get('secrets'), api.get('promesses')]);
    const ok = r => (r.status === 'fulfilled' && r.value && !r.value.error ? r.value : null);
    this.serie = { graphe: ok(graphe), etats: ok(etats), secrets: ok(secrets), fils: ok(fils) };
    this._serieCharge = false;
    if (this.saisonId === 'all') this.render();
  },

  renderSerie() {
    if (!this.serie) return `<section class="bible-section"><div class="bible-section-title">Le monde de la série</div><div style="font-size:12px;color:var(--text3)">Lecture des relations, des états, des secrets et des fils…</div></section>`;
    const { graphe, etats, secrets, fils } = this.serie;
    const vide = t => `<div style="font-size:12px;color:var(--text3)">${t}</div>`;
    const ligne = (gauche, droite) => `<div class="bible-ligne"><span>${gauche}</span><span class="bible-code">${droite}</span></div>`;

    // Les fiches des principaux et des récurrents
    const fiches = this.personnages.filter(p => Number(p.est_principal) > 0 || Number(p.est_recurrent) > 0)
      .sort((a, b) => Number(b.est_principal) - Number(a.est_principal) || (b.nb_episodes_count || 0) - (a.nb_episodes_count || 0));
    const personnages = fiches.length ? fiches.map(p => `
      <div class="bible-episode">
        <div class="bible-ep-head"><span style="font-weight:800;color:var(--text1)">${this.escape([p.prenom, p.nom].filter(Boolean).join(' '))}</span>
          <span class="bible-code" style="margin-left:auto">${Number(p.est_principal) === 2 ? 'principal' : Number(p.est_principal) === 1 ? 'secondaire' : 'récurrent'}${p.nb_episodes_count ? ` · ${p.nb_episodes_count} ép.` : ''}</span></div>
        <div class="bible-chipline">${[p.profession, p.age ? `${p.age} ans` : '', p.date_naissance ? `né(e) le ${this.formatDate(p.date_naissance)}` : ''].filter(Boolean).map(t => `<span class="bible-chip">${this.escape(t)}</span>`).join('')}</div>
        ${p.caracteristiques ? `<div style="font-size:12px;line-height:1.55">${this.escape(p.caracteristiques)}</div>` : ''}
      </div>`).join('') : vide('Aucune fiche de personnage principal ou récurrent.');

    // Les duos qui partagent le plus de scènes sur toute la série
    const duos = new Map();
    (graphe?.liens || []).forEach(([, a, b, , scenes]) => {
      const cle = [a, b].sort().join(' & ');
      duos.set(cle, (duos.get(cle) || 0) + (scenes || 0));
    });
    const relations = [...duos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

    const code = id => { const ep = this.episodes.find(e => e.id == id); return ep ? this.code(ep) : '?'; };
    const listeEtats = etats?.etats || [];
    const listeSecrets = secrets?.secrets || [];
    const listeFils = Array.isArray(fils) ? fils : [];
    const ouverts = listeFils.filter(f => ['ouverte', 'veille'].includes(f.statut || 'ouverte'));

    return `
        <section class="bible-section">
          <div class="bible-section-title">Personnages</div>
          ${personnages}
        </section>

        <section class="bible-section">
          <div class="bible-section-title">Relations</div>
          <div class="bible-episode">${relations.length ? relations.map(([d, n]) => ligne(this.escape(d), `${n} scène${n > 1 ? 's' : ''}`)).join('') : vide('Aucune scène partagée trouvée dans les scripts.')}</div>
        </section>

        <section class="bible-section">
          <div class="bible-section-title">États des personnages</div>
          <div class="bible-episode">${listeEtats.length ? listeEtats.map(e => ligne(`<strong>${this.escape(e.nom)}</strong> · ${this.escape(e.texte || (e.type === 'absent' ? 'absent' : e.type === 'brouille' ? 'brouillé' : 'situation'))}${e.type === 'brouille' ? ` (avec ${this.escape(e.avec)})` : ''}`, `${this.escape(code(e.debut))} → ${e.fin ? this.escape(code(e.fin)) : 'la fin'}`)).join('') : vide('Aucun état noté (Personnages → États).')}</div>
        </section>

        <section class="bible-section">
          <div class="bible-section-title">Secrets</div>
          <div class="bible-episode">${listeSecrets.length ? listeSecrets.map(s => {
            const savent = Object.entries(s.savent || {}).map(([n, q]) => `${this.escape(n)} (${q === 'depart' ? 'dès le départ' : this.escape(code(q.ep))})`);
            return ligne(`<strong>${this.escape(s.texte)}</strong>${savent.length ? `<br><span style="color:var(--text3)">Le savent : ${savent.join(', ')}</span>` : ''}`, s.public ? `public ${s.public === 'depart' ? 'dès le départ' : this.escape(code(s.public.ep))}` : 'le public ne sait pas');
          }).join('') : vide('Aucun secret noté (Personnages → Qui sait quoi).')}</div>
        </section>

        <section class="bible-section">
          <div class="bible-section-title">Fils ouverts</div>
          <div class="bible-episode">${ouverts.length ? ouverts.map(f => ligne(this.escape(f.titre || 'Sans titre'), `${f.episode_source_id ? `depuis ${this.escape(code(f.episode_source_id))}` : ''}${f.statut === 'veille' ? ' · en veille' : ''}`)).join('') : vide(listeFils.length ? 'Tous les fils sont refermés.' : 'Aucun fil noté (Écriture → Mémoire).')}</div>
        </section>`;
  },

  renderDoc(saison, episodes) {
    const arcs = this.groupArcs(episodes);
    const arcNotes = saison.id === null ? this.saisons.flatMap(s => this.notesFor(s.id, 'arcs_continuite')) : this.notesFor(saison.id, 'arcs_continuite');
    const themeCounts = this.countThemes(episodes);
    const persoCounts = this.countPersonnages(episodes);
    const lieuCounts = this.countLieux(episodes);
    const dated = episodes.filter(ep => ep.date_diege);
    const avg = episodes.length ? Math.round(episodes.reduce((sum, ep) => sum + parseInt(ep.avancement || 0), 0) / episodes.length) : 0;

    return `
      <article class="bible-doc">
        <div class="bible-title">${this.escape(saison.nom || 'Saison ' + saison.numero)}</div>
        <div class="bible-meta">${episodes.length} épisode(s) · ${dated.length} daté(s) · avancement moyen ${avg}%</div>

        <section class="bible-section">
          <div class="bible-section-title">Vue d'ensemble</div>
          <div class="bible-stats">
            <div class="bible-stat"><div class="bible-stat-value">${episodes.length}</div><div class="bible-stat-label">épisodes</div></div>
            <div class="bible-stat"><div class="bible-stat-value">${arcs.length}</div><div class="bible-stat-label">arcs narratifs</div></div>
            <div class="bible-stat"><div class="bible-stat-value">${themeCounts.length}</div><div class="bible-stat-label">thèmes utilisés</div></div>
            <div class="bible-stat"><div class="bible-stat-value">${persoCounts.length}</div><div class="bible-stat-label">personnages présents</div></div>
          </div>
        </section>

        <section class="bible-section">
          <div class="bible-section-head">
            <div class="bible-section-title">Arcs & continuité</div>
            ${saison.id === null ? '' : `<button class="btn btn-ghost btn-sm" onclick="Bible.openNoteForm(null, ${Number(saison.id)}, 'arcs_continuite')">+ Ajouter du texte</button>`}
          </div>
          ${this.renderNotes(arcNotes)}
          ${arcs.length ? arcs.map(arc => `
            <div class="bible-episode">
              <div class="bible-ep-head">
                <span style="font-weight:800;color:var(--text1)">${this.escape(arc.nom)}</span>
                <span class="bible-code">${arc.episodes.map(ep => this.code(ep)).join(' → ')}</span>
              </div>
              <div style="font-size:12px;color:var(--text3)">${arc.episodes.map(ep => `${this.code(ep)}${ep.arc_partie ? ` (${ep.arc_partie}${ep.arc_total ? '/' + ep.arc_total : ''})` : ''}`).join(', ')}</div>
            </div>
          `).join('') : `<div style="font-size:12px;color:var(--text3)">Aucun arc narratif renseigné pour cette saison.</div>`}
        </section>

        <section class="bible-section">
          <div class="bible-section-title">Épisodes</div>
          ${episodes.map(ep => this.renderEpisode(ep)).join('')}
        </section>

        <section class="bible-section">
          <div class="bible-section-title">Thèmes, personnages, lieux</div>
          <div class="bible-two-col">
            ${this.renderCountBlock('Thèmes', themeCounts)}
            ${this.renderCountBlock('Personnages', persoCounts)}
            ${this.renderCountBlock('Lieux', lieuCounts)}
          </div>
        </section>
        ${saison.id === null ? this.renderSerie() : ''}
      </article>
    `;
  },

  notesFor(saisonId, section) {
    return (this.notes || [])
      .filter(note => String(note.saison_id) === String(saisonId) && note.section === section)
      .sort((a, b) => (a.position || 0) - (b.position || 0) || a.id - b.id);
  },

  renderNotes(notes) {
    if (!notes.length) return '';
    return notes.map(note => `
      <div class="bible-note">
        <div class="bible-note-head">
          <div class="bible-note-title">${this.escape(note.titre || 'Note éditoriale')}</div>
          <div class="bible-note-actions">
            <button class="btn btn-ghost btn-sm btn-icon" onclick="Bible.openNoteForm(${note.id}, ${note.saison_id}, '${note.section}')" title="Modifier">✎</button>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="Bible.confirmDeleteNote(${note.id})" title="Supprimer" style="color:var(--accent2)">✕</button>
          </div>
        </div>
        <div class="bible-note-text">${this.escape(note.contenu || '')}</div>
      </div>
    `).join('');
  },

  openNoteForm(id, saisonId, section) {
    const note = id ? (this.notes || []).find(n => n.id == id) : {};
    const isNew = !id;
    modal.open(`
      <div class="modal-title">${isNew ? '+ Texte Bible' : '✎ Modifier le texte Bible'}</div>
      <div class="form-grid cols1">
        <div class="form-group">
          <label>Titre</label>
          <input id="bible-note-title" type="text" value="${this.escape(note?.titre || '')}" placeholder="Ex: Continuité de saison, arc principal, fil rouge…">
        </div>
        <div class="form-group">
          <label>Texte</label>
          <textarea id="bible-note-content" style="min-height:180px" placeholder="Synthèse libre pour cette partie de la bible.">${this.escape(note?.contenu || '')}</textarea>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button class="btn btn-ghost" onclick="modal.close()">Annuler</button>
        <button class="btn btn-primary" onclick="Bible.saveNote(${id || 'null'}, ${Number(saisonId)}, '${section}')">${isNew ? 'Ajouter' : 'Enregistrer'}</button>
      </div>
    `);
  },

  async saveNote(id, saisonId, section) {
    const contenu = document.getElementById('bible-note-content')?.value.trim() || '';
    if (!contenu) { toast('Le texte est requis', 'error'); return; }
    const data = {
      saison_id: saisonId,
      section,
      titre: document.getElementById('bible-note-title')?.value.trim() || 'Note éditoriale',
      contenu,
    };
    if (id) {
      await api.put(`bible_notes/${id}`, data);
      toast('Texte Bible mis à jour', 'success');
    } else {
      await api.post('bible_notes', data);
      toast('Texte Bible ajouté', 'success');
    }
    modal.close();
    await this.init();
  },

  async confirmDeleteNote(id) {
    if (!confirm('Supprimer ce texte de la Bible ?')) return;
    await api.delete(`bible_notes/${id}`);
    toast('Texte Bible supprimé', 'info');
    await this.init();
  },

  renderEpisode(ep) {
    const themes = (ep.themes || []).map(t => `${t.theme_nom || t.nom} · ${t.intensite}`);
    const persos = (ep.personnages_principaux || ep.personnages || []).filter(p => parseInt(p.present || 0) === 1).map(p => p.prenom).filter(Boolean);
    const lieux = (ep.lieux || []).filter(l => l.statut === 'present').map(l => l.lieu_nom).filter(Boolean);
    const plages = ep.plages_temporelles || [];

    return `
      <div class="bible-episode">
        <div class="bible-ep-head">
          <span class="bible-code">${this.code(ep)}</span>
          <span style="font-weight:800;color:var(--text1)">${this.escape(ep.titre || 'Sans titre')}</span>
          <span style="margin-left:auto;font-family:var(--font-mono);font-size:10px;color:var(--text3)">${this.escape(ep.etat_episode || ep.jet || '')}</span>
        </div>
        ${ep.resume ? `<div style="font-size:12px;line-height:1.55">${this.escape(ep.resume)}</div>` : ''}
        <div class="bible-chipline">
          ${ep.date_diege ? `<span class="bible-chip">date ${this.formatDate(ep.date_diege)}</span>` : ''}
          ${ep.arc_nom ? `<span class="bible-chip">arc ${this.escape(ep.arc_nom)}</span>` : ''}
          ${themes.slice(0, 6).map(t => `<span class="bible-chip">${this.escape(t)}</span>`).join('')}
          ${persos.slice(0, 6).map(p => `<span class="bible-chip">${this.escape(p)}</span>`).join('')}
          ${lieux.slice(0, 4).map(l => `<span class="bible-chip">${this.escape(l)}</span>`).join('')}
          ${plages.length > 1 ? `<span class="bible-chip">${plages.length} plages chrono</span>` : ''}
        </div>
      </div>
    `;
  },

  renderCountBlock(title, rows) {
    return `
      <div class="bible-episode">
        <div style="font-weight:900;color:var(--text1);margin-bottom:8px">${title}</div>
        ${rows.length ? rows.slice(0, 18).map(row => `
          <div style="display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid var(--border);padding:5px 0;font-size:12px">
            <span>${this.escape(row.name)}</span>
            <span class="bible-code">${row.count}</span>
          </div>
        `).join('') : `<div style="font-size:12px;color:var(--text3)">Aucune donnée.</div>`}
      </div>
    `;
  },

  groupArcs(episodes) {
    const map = new Map();
    for (const ep of episodes) {
      if (!ep.arc_nom) continue;
      if (!map.has(ep.arc_nom)) map.set(ep.arc_nom, []);
      map.get(ep.arc_nom).push(ep);
    }
    return [...map.entries()].map(([nom, eps]) => ({ nom, episodes: eps.sort((a, b) => (a.arc_partie || 99) - (b.arc_partie || 99)) }));
  },

  countThemes(episodes) {
    const map = new Map();
    for (const ep of episodes) for (const t of (ep.themes || [])) this.bump(map, t.theme_nom || t.nom);
    return this.sortedCounts(map);
  },

  countPersonnages(episodes) {
    const map = new Map();
    for (const ep of episodes) {
      for (const p of (ep.personnages_principaux || ep.personnages || [])) {
        if (parseInt(p.present || 0) === 1) this.bump(map, p.prenom || p.nom);
      }
    }
    return this.sortedCounts(map);
  },

  countLieux(episodes) {
    const map = new Map();
    for (const ep of episodes) for (const l of (ep.lieux || [])) if (l.statut === 'present') this.bump(map, l.lieu_nom || l.nom);
    return this.sortedCounts(map);
  },

  bump(map, key) {
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  },

  sortedCounts(map) {
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  },

  renderEmpty() {
    return `<div class="empty-state"><div class="empty-icon">▤</div><div class="empty-title">Aucune saison</div></div>`;
  },

  code(ep) {
    return `S${ep.saison_numero}E${String(ep.numero_episode).padStart(2, '0')}`;
  },

  formatDate(date) {
    if (!date) return '';
    const [y, m, d] = String(date).split('-');
    return `${d}/${m}/${String(y).slice(-2)}`;
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
