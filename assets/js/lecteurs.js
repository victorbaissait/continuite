const Lecteurs = {
  list: [],
  episodes: [],
  detail: null,
  selectedId: null,
  creating: false,
  draggedId: null,
  priorities: ['Très prioritaire', 'Prioritaire', 'Peu prioritaire', 'Pas prioritaire', 'Peut-être', 'À voir', 'Non'],

  async init() {
    [this.list, this.episodes] = await Promise.all([api.get('lecteurs'), DataStore.get('episodes')]);
    if (!this.list.some(l => Number(l.id) === Number(this.selectedId))) this.selectedId = this.list[0]?.id || null;
    await this.loadDetail();
    this.render();
  },

  async loadDetail() {
    this.detail = this.selectedId ? await api.get(`lecteurs/${this.selectedId}`) : null;
  },

  esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' })[char]);
  },

  episodeLabel(ep) {
    return `S${ep.saison_numero}E${String(ep.numero_episode).padStart(2, '0')}${ep.titre ? ` — ${ep.titre}` : ''}`;
  },

  toneLabel(tone) { return ({ positif: 'Positif', neutre: 'Neutre', negatif: 'Négatif' })[tone] || tone; },

  priorityOptions(value) { return this.priorities.map(priority => `<option value="${priority}" ${priority === value ? 'selected' : ''}>${priority}</option>`).join(''); },
  priorityClass(value) { return `priority-${String(value || 'À voir').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/(^-|-$)/g, '')}`; },

  // ─── Vue d'ensemble : tous les lecteurs et tous les épisodes envoyés, d'un coup d'œil ───

  ensembleOuvert: false,

  async basculerEnsemble(oui) {
    this.ensembleOuvert = oui;
    if (oui) this.ensemble = await api.get('lecteurs/ensemble');
    this.render();
  },

  renderEnsemble() {
    const d = this.ensemble;
    if (!d) return '<p class="lecteur-muted">Lecture…</p>';
    if (!d.episodes.length) return '<article class="lecteur-panel"><p class="lecteur-muted">Aucun épisode envoyé pour l\'instant. Sur la fiche d\'un lecteur, « Envoyer des épisodes » prépare le PDF et note l\'envoi.</p></article>';
    const nom = id => d.lecteurs.find(l => l.id === id)?.nom || '?';
    const ep = id => d.episodes.find(e => e.id === id);
    const quand = t => (t ? new Date(t.slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '');
    const lecteurs = d.lecteurs.filter(l => d.episodes.some(e => d.cases[`${l.id}:${e.id}`]));
    const changes = Object.values(d.cases).filter(c => c.change).length;
    const cellule = (l, e) => {
      const c = d.cases[`${l.id}:${e.id}`];
      if (!c) return '<td class="le-vide" aria-label="Pas envoyé">·</td>';
      const etat = c.note !== null ? `<strong>${c.note}</strong>` : c.repondu ? '✓' : (c.jours >= 14 ? '<span class="ec-orange">…</span>' : '…');
      const titre = `Envoyé le ${quand(c.envoye)}${c.repondu ? (c.note !== null ? `, noté ${c.note}/10` : ', a répondu') : ', pas encore de retour'}${c.change ? '. Le script a changé depuis.' : ''}`;
      return `<td title="${this.esc(titre)}" aria-label="${this.esc(titre)}">${etat}${c.change ? ' <span class="le-change" aria-hidden="true">●</span>' : ''}</td>`;
    };
    return `
      <article class="lecteur-panel"><h2>Qui a lu quoi</h2>
        <p class="lecteur-muted">Un chiffre : sa note. ✓ : il a répondu sans noter. … : pas encore de retour (en orange après deux semaines). <span class="le-change">●</span> : le script a changé depuis l'envoi${changes ? ` (${changes} envoi(s))` : ''}.</p>
        <div class="le-table-cadre"><table class="an-table le-ensemble"><thead><tr><th scope="col">Épisode</th>${lecteurs.map(l => `<th scope="col">${this.esc(l.nom)}</th>`).join('')}<th scope="col">Moyenne</th></tr></thead>
        <tbody>${d.episodes.map(e => { const m = d.moyennes[e.id]; return `<tr><th scope="row" title="${this.esc(e.titre)}">${this.esc(e.code)}</th>${lecteurs.map(l => cellule(l, e)).join('')}<td>${m ? `<strong>${m.moyenne}</strong> <span class="lecteur-muted">(${m.n}${m.n > 1 && m.ecart >= 4 ? `, avis partagés` : ''})</span>` : '—'}</td></tr>`; }).join('')}</tbody></table></div>
      </article>
      <article class="lecteur-panel"><h2>À relancer</h2>
        ${d.relances.length ? `<ul class="ec-liste">${d.relances.map(r => `<li><span><strong>${this.esc(nom(r.lecteur))}</strong> · ${this.esc(ep(r.episode)?.code || '')} ${this.esc(ep(r.episode)?.titre || '')}</span><span class="lecteur-muted">envoyé il y a ${r.jours} jours</span></li>`).join('')}</ul>` : '<p class="lecteur-muted">Personne à relancer : tous ont répondu, ou leur envoi a moins de deux semaines.</p>'}
      </article>`;
  },

  render() {
    const tab = document.getElementById('tab-lecteurs');
    if (!tab) return;
    const bascule = `<div class="an-ligne vues-onglet" role="group" aria-label="Vue"><button type="button" class="an-choix ${this.ensembleOuvert ? '' : 'actif'}" aria-pressed="${!this.ensembleOuvert}" onclick="Lecteurs.basculerEnsemble(false)">Par lecteur</button><button type="button" class="an-choix ${this.ensembleOuvert ? 'actif' : ''}" aria-pressed="${this.ensembleOuvert}" onclick="Lecteurs.basculerEnsemble(true)">Vue d'ensemble</button></div>`;
    if (this.ensembleOuvert) {
      tab.innerHTML = `<div class="section-header"><div class="section-title">◉ Lecteurs · vue d'ensemble</div><div class="section-actions">${bascule}</div></div><div class="lecteurs-ensemble">${this.renderEnsemble()}</div>`;
      return;
    }
    tab.innerHTML = `
      <div class="section-header"><div class="section-title">◉ Lecteurs</div><div class="section-actions">${bascule}<button class="btn btn-primary btn-sm" onclick="Lecteurs.creating=true;Lecteurs.render()">+ Ajouter une personne</button></div></div>
      <div class="lecteurs-layout">
        <aside class="lecteurs-sidebar">
          <div class="lecteurs-sidebar-label">Personnes à qui faire lire</div>
          ${this.list.length ? this.list.map(l => `<button class="lecteur-item ${Number(l.id) === Number(this.selectedId) ? 'active' : ''}" draggable="true" ondragstart="Lecteurs.startDrag(event, ${l.id})" ondragover="Lecteurs.dragOver(event, ${l.id})" ondragleave="Lecteurs.dragLeave(event)" ondragend="Lecteurs.endDrag(event)" ondrop="Lecteurs.drop(event, ${l.id})" onclick="Lecteurs.select(${l.id})"><span class="lecteur-item-main"><span class="lecteur-item-name"><i class="lecteur-grip" aria-hidden="true">⠿</i><strong>${this.esc(l.nom)}</strong></span><em class="lecteur-priority-badge ${this.priorityClass(l.priorite)}">${this.esc(l.priorite || 'À voir')}</em></span>${l.telephone ? `<span class="lecteur-phone">${this.esc(l.telephone)}</span>` : ''}<span class="lecteur-item-meta"><b class="lecteur-sent ${Number(l.nb_episodes) ? 'is-sent' : ''}">${Number(l.nb_episodes) ? 'Épisodes envoyés' : 'Aucun épisode envoyé'}</b>${Number(l.nb_episodes) ? ` · ${l.nb_episodes} épisode${Number(l.nb_episodes) > 1 ? 's' : ''}` : ''}${l.note_moyenne !== null ? ` · ${l.note_moyenne}/10` : ''}</span></button>`).join('') : '<div class="lecteurs-empty-small">Ajoute la première personne à qui tu veux envoyer un épisode.</div>'}
          ${this.creating ? this.renderCreateForm() : ''}
        </aside>
        <section class="lecteurs-content">${this.detail ? this.renderDetail() : this.renderEmpty()}</section>
      </div>`;
  },

  renderCreateForm() {
    return `<form class="lecteur-create-form" onsubmit="Lecteurs.create(event)"><input name="nom" placeholder="Nom ou prénom" required autofocus><input name="telephone" type="tel" placeholder="Téléphone"><input name="email" type="email" placeholder="E-mail (optionnel)"><select name="priorite" aria-label="Priorité">${this.priorityOptions('À voir')}</select><div><button class="btn btn-primary btn-sm" type="submit">Ajouter</button><button class="btn btn-ghost btn-sm" type="button" onclick="Lecteurs.creating=false;Lecteurs.render()">Annuler</button></div></form>`;
  },

  renderEmpty() {
    return `<div class="empty-state"><div class="empty-icon">◉</div><div class="empty-title">Choisis un lecteur</div><div class="empty-sub">Tu pourras suivre les épisodes envoyés et centraliser ses retours.</div></div>`;
  },

  renderDetail() {
    const l = this.detail;
    const remaining = this.episodes.filter(ep => !l.episodes.some(sent => Number(sent.episode_id) === Number(ep.id)));
    return `<div class="lecteur-head"><form class="lecteur-identite" onsubmit="Lecteurs.saveIdentity(event)"><input name="nom" value="${this.esc(l.nom)}" aria-label="Nom"><input name="telephone" type="tel" value="${this.esc(l.telephone)}" placeholder="Téléphone"><input name="email" type="email" value="${this.esc(l.email)}" placeholder="E-mail"><label class="lecteur-priority">Priorité<select name="priorite">${this.priorityOptions(l.priorite || 'À voir')}</select></label><button class="btn btn-secondary btn-sm">Enregistrer</button></form><button class="btn btn-ghost btn-sm lecteur-delete" onclick="Lecteurs.deletePerson()">Supprimer</button></div>
      <div class="lecteurs-panels">
        <article class="lecteur-panel lecteur-general"><h2>Retour général</h2><form class="lecteur-general-form" onsubmit="Lecteurs.saveGeneral(event)"><label>Note générale <input name="note_generale" type="number" min="0" max="10" step="0.5" value="${l.note_generale ?? ''}" placeholder="/10"></label><label class="full">Commentaire général<textarea name="commentaire_general" placeholder="Impression globale de la lecture…">${this.esc(l.commentaire_general)}</textarea></label><button class="btn btn-primary btn-sm">Enregistrer le retour général</button></form>${this.renderCritiques(l.critiques_generales, 'general')}</article>
        ${this.renderEnvoi(l)}
        <article class="lecteur-panel"><h2>Épisodes envoyés <span>${l.episodes.length}</span></h2>${remaining.length ? `<form class="episode-send-form" onsubmit="Lecteurs.sendEpisode(event)"><select name="episode_id" required><option value="">Choisir un épisode…</option>${remaining.map(ep => `<option value="${ep.id}">${this.esc(this.episodeLabel(ep))}</option>`).join('')}</select><input type="date" name="envoye_le" value="${new Date().toISOString().slice(0,10)}"><button class="btn btn-secondary btn-sm">Ajouter</button></form>` : '<p class="lecteur-muted">Tous les épisodes existants ont été ajoutés.</p>'}<div class="lecture-episodes">${l.episodes.length ? l.episodes.map(ep => this.renderEpisode(ep)).join('') : '<p class="lecteur-muted">Aucun épisode n’a encore été envoyé.</p>'}</div></article>
      </div>`;
  },

  renderEpisode(ep) {
    return `<article class="lecture-episode"><div class="lecture-episode-title"><strong>${this.esc(this.episodeLabel(ep))}</strong><button class="btn btn-ghost btn-sm" onclick="Lecteurs.removeEpisode(${ep.episode_id})">Retirer</button></div><form class="lecture-episode-fields" onchange="Lecteurs.saveEpisode(event, ${ep.episode_id})"><label>Envoyé le<input type="date" name="envoye_le" value="${this.esc(ep.envoye_le)}"></label><label>Note<input type="number" name="note" min="0" max="10" step="0.5" value="${ep.note ?? ''}" placeholder="/10"></label><label class="full">Retour sur l’épisode<textarea name="commentaire" placeholder="Avis libre…">${this.esc(ep.commentaire)}</textarea></label></form>${this.renderCritiques(ep.critiques, 'episode', ep.episode_id)}</article>`;
  },

  renderCritiques(critiques, scope, episodeId = null) {
    const target = scope === 'general' ? 'general' : `episode, ${episodeId}`;
    return `<div class="critiques"><h3>Critiques par critère</h3>${critiques.length ? `<div class="critique-list">${critiques.map(c => `<div class="critique ${this.esc(c.tonalite)}"><span>${this.esc(c.critere)}</span><b>${this.esc(this.toneLabel(c.tonalite))}</b>${c.commentaire ? `<p>${this.esc(c.commentaire)}</p>` : ''}<button title="Supprimer" onclick="Lecteurs.deleteCritique('${scope}', ${c.id}${episodeId ? `, ${episodeId}` : ''})">×</button></div>`).join('')}</div>` : ''}<form class="critique-form" onsubmit="Lecteurs.addCritique(event, '${scope}'${episodeId ? `, ${episodeId}` : ''})"><select name="critere"><option>Personnages</option><option>Histoire</option><option>Dialogues</option><option>Rythme</option><option>Humour</option><option>Émotion</option><option>Mise en scène</option><option>Autre</option></select><select name="tonalite"><option value="positif">Positif</option><option value="neutre" selected>Neutre</option><option value="negatif">Négatif</option></select><input name="commentaire" placeholder="Précision (optionnelle)"><button class="btn btn-ghost btn-sm">+ Critère</button></form></div>`;
  },

  async select(id) { this.selectedId = id; this.creating = false; await this.loadDetail(); this.render(); },
  // ─── Envoyer à ce lecteur : un seul PDF des scripts choisis, et l'envoi noté pour chacun ───

  envoiChoisis: new Set(),

  renderEnvoi(l) {
    const deja = new Set(l.episodes.map(e => Number(e.episode_id)));
    const liste = this.episodes;
    if (!liste.length) return '';
    return `<article class="lecteur-panel"><h2>Envoyer des épisodes</h2>
      <p class="lecteur-muted">Coche les épisodes : l'app prépare un seul PDF de leurs scripts, au format scénario, ou une version de lecture (un fichier HTML qui se lit bien sur un téléphone ou une liseuse), et note l'envoi d'aujourd'hui.</p>
      <div class="le-envoi">${liste.map(ep => `<label class="interface-case"><input type="checkbox" ${this.envoiChoisis.has(Number(ep.id)) ? 'checked' : ''} onchange="Lecteurs.choisirEnvoi(${Number(ep.id)}, this.checked)"> ${this.esc(this.episodeLabel(ep))}${deja.has(Number(ep.id)) ? ' <span class="lecteur-muted">(déjà envoyé)</span>' : ''}</label>`).join('')}</div>
      <div class="an-ligne"><button type="button" class="btn btn-primary btn-sm" ${this.envoiChoisis.size ? '' : 'disabled'} onclick="Lecteurs.envoyer()">Préparer le PDF (${this.envoiChoisis.size}) et noter l'envoi</button>
      <button type="button" class="btn btn-secondary btn-sm" ${this.envoiChoisis.size ? '' : 'disabled'} onclick="Lecteurs.envoyer('lecture')">Version de lecture (HTML)</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="Lecteurs.choisirNonEnvoyes()">Cocher ceux pas encore envoyés</button></div></article>`;
  },

  choisirEnvoi(id, oui) {
    if (oui) this.envoiChoisis.add(id); else this.envoiChoisis.delete(id);
    this.render();
  },

  choisirNonEnvoyes() {
    const deja = new Set(this.detail.episodes.map(e => Number(e.episode_id)));
    this.envoiChoisis = new Set(this.episodes.map(e => Number(e.id)).filter(id => !deja.has(id)));
    this.render();
  },

  async envoyer(format = 'pdf') {
    const ids = this.episodes.map(e => Number(e.id)).filter(id => this.envoiChoisis.has(id));
    if (!ids.length) return;
    // Les scripts, dans l'ordre de la série ; un épisode sans script est signalé et laissé de côté
    const sections = [];
    const lecture = [];
    const sansScript = [];
    for (const id of ids) {
      const ep = await api.get(`episodes/${id}`);
      const titre = this.episodeLabel(ep);
      if (!String(ep.texte_episode || '').trim()) { sansScript.push(titre); continue; }
      const lignes = Ecriture.classerLignes(ep.texte_episode);
      // Chaque envoi fige une version en couleur : on verra ensuite ce qui a changé depuis que ce lecteur l'a reçu
      await Ecriture.figerRevisionEpisode(Number(ep.id), ep.texte_episode, `Envoyé à ${this.detail.nom}`).catch(() => {});
      sections.push(Ecriture.htmlScript(titre, lignes));
      lecture.push({ titre, lignes });
    }
    if (!sections.length) { toast('Aucun de ces épisodes n\'a de script.', 'info'); return; }
    const nomProjet = (typeof Projets !== 'undefined' && Projets.actuel?.()?.nom) || 'Lecture';
    // Le filigrane : celui de la mise en page, et le nom du lecteur si on l'a demandé
    const mep = typeof MiseEnPage !== 'undefined' ? MiseEnPage.lire() : {};
    const filigrane = mep.filigrane_lecteur ? `${mep.filigrane || 'Confidentiel'} · ${this.detail.nom}` : (mep.filigrane || '');
    if (format === 'lecture') {
      // Un seul fichier, enregistré là où on veut, à envoyer par mail ou à mettre sur une liseuse
      const html = Ecriture.documentLecture(nomProjet, lecture, `${lecture.length} épisode(s) · pour ${this.detail.nom} · ${new Date().toLocaleDateString('fr-FR', { dateStyle: 'long' })}`, filigrane);
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      lien.download = `${nomProjet} - ${lecture.length === 1 ? lecture[0].titre : `${lecture.length} épisodes`}.html`.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 150);
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      setTimeout(() => URL.revokeObjectURL(lien.href), 60000);
    } else {
      const page = window.open('', '_blank');
      if (!page) { toast('Autorise les fenêtres pour imprimer.', 'info'); return; }
      page.document.write(Ecriture.documentScript(`${this.detail.nom} - ${sections.length} épisode(s)`, sections, filigrane));
      page.document.close();
      page.print?.();
    }
    // L'envoi est noté pour chaque épisode qui avait un script (et pas deux fois)
    const deja = new Set(this.detail.episodes.map(e => Number(e.episode_id)));
    const aujourdhui = new Date().toISOString().slice(0, 10);
    for (const id of ids) {
      const ep = this.episodes.find(e => Number(e.id) === id);
      if (deja.has(id) || sansScript.includes(this.episodeLabel(ep))) continue;
      await api.post(`lecteurs/${this.selectedId}/episodes`, { episode_id: id, envoye_le: aujourdhui });
    }
    this.envoiChoisis = new Set();
    await this.refresh();
    toast(`${sections.length} épisode(s) dans ${format === 'lecture' ? 'la version de lecture' : 'le PDF'}.${sansScript.length ? ` Sans script, laissé(s) de côté : ${sansScript.join(', ')}.` : ''}`, sansScript.length ? 'info' : 'success');
  },

  async refresh() { DataStore.invalidate('lecteurs'); this.list = await api.get('lecteurs'); await this.loadDetail(); this.render(); },
  async create(event) { event.preventDefault(); const f = event.currentTarget; const data = { nom: f.nom.value, telephone: f.telephone.value, email: f.email.value, priorite: f.priorite.value }; const r = await api.post('lecteurs', data); this.selectedId = r.id; this.creating = false; await this.refresh(); toast('Lecteur ajouté', 'success'); },
  async saveIdentity(event) { event.preventDefault(); const f = event.currentTarget; await api.put(`lecteurs/${this.selectedId}`, { ...this.detail, nom: f.nom.value, telephone: f.telephone.value, email: f.email.value, priorite: f.priorite.value }); await this.refresh(); toast('Lecteur enregistré', 'success'); },
  startDrag(event, id) { this.draggedId = Number(id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(id)); event.currentTarget.classList.add('is-dragging'); },
  dragOver(event, id) { if (!this.draggedId || this.draggedId === Number(id)) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; event.currentTarget.classList.add('is-drop-target'); },
  dragLeave(event) { event.currentTarget.classList.remove('is-drop-target'); },
  endDrag(event) { this.draggedId = null; event.currentTarget.classList.remove('is-dragging'); document.querySelectorAll('.lecteur-item.is-drop-target').forEach(el => el.classList.remove('is-drop-target')); },
  async drop(event, targetId) { event.preventDefault(); const sourceId = this.draggedId || Number(event.dataTransfer.getData('text/plain')); if (!sourceId || sourceId === Number(targetId)) return; const sourceIndex = this.list.findIndex(l => Number(l.id) === Number(sourceId)); const targetIndex = this.list.findIndex(l => Number(l.id) === Number(targetId)); if (sourceIndex < 0 || targetIndex < 0) return; const [moved] = this.list.splice(sourceIndex, 1); this.list.splice(targetIndex, 0, moved); await api.put('lecteurs/ordre', { ids: this.list.map(l => l.id) }); this.render(); },
  async saveGeneral(event) { event.preventDefault(); const f = event.currentTarget; await api.put(`lecteurs/${this.selectedId}`, { ...this.detail, note_generale: f.note_generale.value, commentaire_general: f.commentaire_general.value }); await this.refresh(); toast('Retour général enregistré', 'success'); },
  async deletePerson() { if (!confirm(`Supprimer ${this.detail.nom} et tous ses retours ?`)) return; await api.delete(`lecteurs/${this.selectedId}`); this.selectedId = null; await this.init(); toast('Lecteur supprimé', 'info'); },
  async sendEpisode(event) { event.preventDefault(); const f = event.currentTarget; await api.post(`lecteurs/${this.selectedId}/episodes`, { episode_id: f.episode_id.value, envoye_le: f.envoye_le.value }); await this.refresh(); toast('Épisode ajouté', 'success'); },
  async saveEpisode(event, episodeId) { const f = event.currentTarget; await api.put(`lecteurs/${this.selectedId}/episodes/${episodeId}`, { envoye_le: f.envoye_le.value, note: f.note.value, commentaire: f.commentaire.value }); DataStore.invalidate('lecteurs'); toast('Retour épisode enregistré', 'success'); },
  async removeEpisode(episodeId) { if (!confirm('Retirer cet épisode de la liste envoyée ?')) return; await api.delete(`lecteurs/${this.selectedId}/episodes/${episodeId}`); await this.refresh(); },
  async addCritique(event, scope, episodeId = null) { event.preventDefault(); const f = event.currentTarget; const path = scope === 'general' ? `lecteurs/${this.selectedId}/critiques` : `lecteurs/${this.selectedId}/episodes/${episodeId}/critiques`; await api.post(path, { critere: f.critere.value, tonalite: f.tonalite.value, commentaire: f.commentaire.value }); await this.refresh(); },
  async deleteCritique(scope, critiqueId, episodeId = null) { const path = scope === 'general' ? `lecteurs/${this.selectedId}/critiques/${critiqueId}` : `lecteurs/${this.selectedId}/episodes/${episodeId}/critiques/${critiqueId}`; await api.delete(path); await this.refresh(); },
};
