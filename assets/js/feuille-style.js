// assets/js/feuille-style.js — La feuille de style du projet (Écriture → Feuille de style).
// Une typographie et des graphies communes à tous les scripts : on vérifie, on voit des exemples, on corrige
// les épisodes cochés. L'ancien texte est gardé dans les Versions ; les mots ne changent que par les graphies écrites ici.
'use strict';

const FeuilleStyle = {
  style: null,
  regles: {},
  suggestions: [],
  resultat: null,
  choisis: new Set(),

  async ouvrir() {
    const d = await api.get('feuille_style');
    if (d.error) { toast(d.error, 'error'); return; }
    this.style = d.style;
    this.regles = d.regles;
    this.suggestions = d.suggestions || [];
    this.resultat = null;
    this.rendre();
  },

  async _enregistrer() {
    await api.put('analyse_notes', { cle: 'feuille-style', valeur: JSON.stringify(this.style) });
    this.resultat = null;
    this.rendre();
  },

  regler(regle, oui) {
    this.style.typo[regle] = oui;
    this._enregistrer();
  },

  ajouterGraphie() {
    const bonne = document.getElementById('fs-bonne')?.value.trim();
    const variantes = (document.getElementById('fs-variantes')?.value || '').split(',').map(v => v.trim()).filter(v => v && v !== bonne);
    if (!bonne || !variantes.length) { toast('Écris la bonne graphie et au moins une variante.', 'info'); return; }
    this.style.graphies.push({ bonne, variantes, noms: document.getElementById('fs-noms')?.checked || false });
    this._enregistrer();
  },

  retirerGraphie(i) {
    this.style.graphies.splice(i, 1);
    this._enregistrer();
  },

  accepterSuggestion(i) {
    const s = this.suggestions[i];
    if (!s) return;
    this.style.graphies.push({ bonne: s.bonne, variantes: s.variantes, noms: true });
    this.suggestions.splice(i, 1);
    this._enregistrer();
  },

  _nomRegle(k) {
    return k.startsWith('graphie:') ? `« ${k.slice(8)} »` : (this.regles[k] || k);
  },

  _visible: t => String(t).replace(/ /g, '⍽').replace(/ /g, '·'),

  rendre() {
    const slot = document.getElementById('ec-style');
    if (!slot || !this.style) return;
    const st = this.style;
    const actif = Object.values(st.typo).some(Boolean) || st.graphies.length;
    const r = this.resultat;
    slot.innerHTML = `
      <p class="an-note">La feuille de style dit comment le projet s'écrit : la typographie, et l'orthographe des noms et des lieux. L'app vérifie tous les scripts et brouillons, montre des exemples, puis corrige les épisodes que tu coches. L'ancien texte reste dans les Versions de chaque épisode.</p>
      <div class="ec-dep-grille">
        <section class="an-carte">
          <h2 class="an-titre">Typographie</h2>
          ${Object.entries(this.regles).map(([k, l]) => `<label class="interface-case"><input type="checkbox" ${st.typo[k] ? 'checked' : ''} onchange="FeuilleStyle.regler('${k}', this.checked)"> ${esc(l)}</label>`).join('')}
          <p class="an-note">Les heures (10:30) et les adresses (https://…) ne sont pas touchées.</p>
        </section>
        <section class="an-carte">
          <h2 class="an-titre">Graphies</h2>
          <p class="an-note">La bonne façon d'écrire un nom, et les variantes à remplacer. « Noms de réplique seulement » ne touche que la ligne du nom au-dessus d'une réplique : un surnom dans un dialogue reste tel quel.</p>
          ${st.graphies.length ? `<ul class="ec-liste">${st.graphies.map((g, i) => `<li><span><strong>${esc(g.bonne)}</strong> ← ${g.variantes.map(v => esc(v)).join(', ')}${g.noms ? ' <span class="an-note">(noms de réplique)</span>' : ''}</span><button type="button" class="ec-lien" onclick="FeuilleStyle.retirerGraphie(${i})">Retirer</button></li>`).join('')}</ul>` : ''}
          <div class="an-ligne">
            <input id="fs-bonne" type="text" maxlength="80" placeholder="Bonne graphie" aria-label="Bonne graphie">
            <input id="fs-variantes" type="text" maxlength="400" placeholder="Variantes, séparées par des virgules" aria-label="Variantes à remplacer">
            <label class="interface-case"><input id="fs-noms" type="checkbox"> Noms de réplique seulement</label>
            <button type="button" class="btn btn-secondary btn-sm" onclick="FeuilleStyle.ajouterGraphie()">Ajouter</button>
          </div>
          ${this.suggestions.length ? `<h3 class="an-label">Des noms de réplique écrits de plusieurs façons</h3>
          <ul class="ec-liste">${this.suggestions.map((s, i) => `<li><span><strong>${esc(s.bonne)}</strong> ← ${s.variantes.map(v => esc(v)).join(', ')} <span class="an-note">${s.repliques} répliques</span></span><button type="button" class="ec-lien" onclick="FeuilleStyle.accepterSuggestion(${i})">Ajouter</button></li>`).join('')}</ul>` : ''}
        </section>
      </div>
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Vérifier le projet</h2>
          <button type="button" class="btn btn-primary btn-sm" ${actif ? '' : 'disabled'} onclick="FeuilleStyle.verifier()">Vérifier tous les épisodes</button></div>
        ${!actif ? '<p class="an-note">Coche une règle ou ajoute une graphie pour commencer.</p>' : !r ? '' : !r.episodes.length ? '<p class="an-note">Tout est déjà conforme à la feuille de style.</p>' : `
          <p class="an-note">${r.total} correction(s) dans ${r.episodes.length} épisode(s). ⍽ marque une espace insécable, · une espace fine.</p>
          <ul class="ec-liste">${r.episodes.map(e => `<li><span><label class="interface-case"><input type="checkbox" ${this.choisis.has(e.id) ? 'checked' : ''} onchange="FeuilleStyle.choisir(${e.id}, this.checked)"> <strong>S${e.saison}E${String(e.numero).padStart(2, '0')}</strong> ${esc(e.titre || '')}</label>
            <span class="an-note">${Object.entries(e.comptes).map(([k, n]) => `${esc(this._nomRegle(k))} : ${n}`).join(' · ')}</span>
            ${e.extraits.length ? `<span class="an-note">${e.extraits.map(x => `${esc(this._visible(x.avant))} → ${esc(this._visible(x.apres))}`).join(' · ')}</span>` : ''}</span></li>`).join('')}</ul>
          <div class="an-ligne"><button type="button" class="btn btn-primary btn-sm" ${this.choisis.size ? '' : 'disabled'} onclick="FeuilleStyle.corriger()">Corriger les épisodes cochés (${this.choisis.size})</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="FeuilleStyle.toutChoisir()">Tout cocher</button></div>`}
      </section>`;
  },

  async verifier() {
    const r = await api.post('feuille_style', { action: 'verifier' });
    if (r.error) { toast(r.error, 'error'); return; }
    this.resultat = r;
    this.choisis = new Set(r.episodes.map(e => e.id));
    this.rendre();
  },

  choisir(id, oui) {
    if (oui) this.choisis.add(id); else this.choisis.delete(id);
    this.rendre();
  },

  toutChoisir() {
    this.choisis = new Set((this.resultat?.episodes || []).map(e => e.id));
    this.rendre();
  },

  async corriger() {
    if (!this.choisis.size || !confirm(`Corriger ${this.choisis.size} épisode(s) ? L'ancien texte de chacun reste dans ses Versions.`)) return;
    const r = await api.post('feuille_style', { action: 'appliquer', ids: [...this.choisis] });
    if (r.error) { toast(r.error, 'error'); return; }
    window.DataStore?.invalidateForMutation('upload');
    toast(`${r.total} correction(s) dans ${r.episodes.length} épisode(s).`, 'success');
    if (typeof Ecriture !== 'undefined') await Ecriture.init?.();
    await this.verifier();
  },
};
